import { BasePlugin, type BuildCache, type SchemaTypes } from "@pothos/core";
import {
  and,
  eq,
  sql,
  type AnyRelation,
  type EmptyRelations,
  type RelationsRecord,
} from "drizzle-orm";
import {
  DrizzleGenerator,
  getReturning,
  replaceColumnValues,
  type ModelData,
} from "./generator.js";
import {
  createWhereQuery,
  getQueryDepth,
  getQueryFields,
} from "./libs/utils.js";
import type { OperationBasic } from "./libs/operations.js";
import type { DrizzleObjectFieldBuilder } from "@pothos/plugin-drizzle";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { PgTable } from "drizzle-orm/pg-core";
import type { RelationalQueryBuilder } from "drizzle-orm/pg-core/query-builders/query";
import type { GraphQLResolveInfo } from "graphql";

type OperationParams = {
  depthLimit?: number;
  limit?: number;
  where?: object;
  orderBy?: object;
  input?: object;
};

export class PothosDrizzleGenerator<
  Types extends SchemaTypes,
  T extends object = object
> extends BasePlugin<Types, T> {
  generator: DrizzleGenerator<Types>;

  constructor(
    buildCache: BuildCache<Types>,
    name: keyof PothosSchemaTypes.Plugins<Types>
  ) {
    super(buildCache, name);
    this.generator = new DrizzleGenerator(this.builder);
  }

  beforeBuild(): void {
    const generator = this.generator;
    const tables = generator.getTables();

    for (const [modelName, modelData] of Object.entries(tables)) {
      this.defineModelObject(modelName, modelData, tables);
      this.defineOperations(modelName, modelData, tables);
    }
  }

  private defineModelObject(
    modelName: string,
    modelData: ModelData,
    tables: Record<string, ModelData>
  ) {
    const { tableInfo, relations, columns } = modelData;
    const builder = this.builder;
    const generator = this.generator;

    const filterRelations = Object.entries(relations).filter(
      ([, relay]) => tables[relay.targetTableName]
    );

    builder.drizzleObject(modelName as never, {
      name: tableInfo.name,
      fields: (t) => {
        const relayList = filterRelations.map(([relayName, relay]) =>
          this.createRelationField(t, relayName, relay, tables)
        );

        const relayCount = filterRelations.map(([relayName, relay]) =>
          this.createRelationCountField(t, relayName, relay, tables)
        );

        return Object.fromEntries([
          ...relayCount,
          ...relayList,
          ...columns.map((c) => [
            c.name,
            t.expose(c.name, {
              type: generator.getDataType(c),
              nullable: !c.notNull,
            } as never),
          ]),
        ]);
      },
    });
  }

  private createRelationField<Shape>(
    t: DrizzleObjectFieldBuilder<
      Types,
      Types["DrizzleRelations"][string],
      Shape
    >,
    relayName: string,
    relay: AnyRelation,
    tables: Record<string, ModelData>
  ) {
    const generator = this.generator;
    const targetModelName = relay.targetTableName;
    const { operations } = tables[targetModelName]!;
    const operation = relay.relationType === "one" ? "findFirst" : "findMany";

    if (!operations.includes(operation)) return [];

    const inputWhere = generator.getInputWhere(targetModelName);
    const inputOrderBy = generator.getInputOrderBy(targetModelName);

    return [
      relayName,
      t.relation(relayName, {
        nullable: relay.relationType === "one",
        args: {
          offset: t.arg({ type: "Int" }),
          limit: t.arg({ type: "Int" }),
          where: t.arg({ type: inputWhere }),
          orderBy: t.arg({ type: [inputOrderBy] }),
        },
        query: (
          args: {
            where?: object;
            offset?: number;
            limit?: number;
            orderBy?: object[];
          },
          ctx: object
        ) => {
          const params = this.checkPermissionsAndGetParams(
            targetModelName,
            operation,
            ctx,
            null, // info is not available here, handled differently or ignored for depth in original
            tables[targetModelName]!
          );

          return {
            ...args,
            _name: targetModelName,
            limit:
              params.limit && args.limit
                ? Math.min(params.limit, args.limit)
                : params.limit ?? args.limit,
            where: {
              AND: [structuredClone(args.where), params.where].filter((v) => v),
            },
            orderBy:
              args.orderBy && Object.keys(args.orderBy).length
                ? Object.fromEntries(
                    args.orderBy.flatMap((v) => Object.entries(v))
                  )
                : params.orderBy,
          };
        },
      } as never),
    ];
  }

  private createRelationCountField<Shape>(
    t: DrizzleObjectFieldBuilder<
      Types,
      Types["DrizzleRelations"][string],
      Shape
    >,
    relayName: string,
    relay: AnyRelation,
    tables: Record<string, ModelData>
  ) {
    const generator = this.generator;
    const targetModelName = relay.targetTableName;
    const operation = "count";
    const { operations } = tables[targetModelName]!;

    if (!operations.includes(operation)) return [];

    const inputWhere = generator.getInputWhere(targetModelName);

    if (relay.throughTable) {
      return [
        `${relayName}Count`,
        t.field({
          type: "Int",
          nullable: false,
          args: { where: t.arg({ type: inputWhere }) },
          extensions: {
            pothosDrizzleSelect: (args: { where?: object }, ctx: object) => {
              const params = this.checkPermissionsAndGetParams(
                targetModelName,
                operation,
                ctx,
                null,
                tables[targetModelName]!
              );

              return {
                columns: {},
                extras: {
                  [`${relayName}Count`]: (table: PgTable) => {
                    const client: NodePgDatabase = generator.getClient(ctx);
                    return client
                      .select({ count: sql`count(*)` })
                      .from(relay.targetTable as never)
                      .leftJoin(
                        relay.throughTable as never,
                        and(
                          ...relay.targetColumns.map((v, index) =>
                            eq(relay.through!.target[index]!._.column, v)
                          )
                        )
                      )
                      .where(
                        and(
                          ...relay.sourceColumns.map((v, index) =>
                            eq(
                              relay.through!.source[index]!._.column,
                              table[v.name as keyof typeof table]
                            )
                          ),
                          createWhereQuery(relay.targetTable, {
                            AND: [
                              structuredClone(args.where),
                              params.where,
                            ].filter((v) => v),
                          } as never)
                        )
                      );
                  },
                },
              };
            },
          },
        } as never),
      ];
    } else {
      return [
        `${relayName}Count`,
        t.relatedCount(relayName, {
          args: { where: t.arg({ type: inputWhere }) },
          where: (args: { limit?: number; where?: object }, ctx: object) => {
            const params = this.checkPermissionsAndGetParams(
              targetModelName,
              operation,
              ctx,
              null,
              tables[targetModelName]!
            );
            return createWhereQuery(relay.targetTable, {
              AND: [structuredClone(args.where), params.where].filter((v) => v),
            } as never);
          },
        } as never),
      ];
    }
  }

  private defineOperations(
    modelName: string,
    modelData: ModelData,
    tables: Record<string, ModelData>
  ) {
    const { operations } = modelData;
    if (operations.includes("findMany")) {
      this.defineFindMany(modelName, modelData, tables);
    }
    if (operations.includes("findFirst")) {
      this.defineFindFirst(modelName, modelData, tables);
    }
    if (operations.includes("count")) {
      this.defineCount(modelName, modelData);
    }
    if (operations.includes("createOne")) {
      this.defineCreateOne(modelName, modelData);
    }
    if (operations.includes("createMany")) {
      this.defineCreateMany(modelName, modelData);
    }
    if (operations.includes("update")) {
      this.defineUpdate(modelName, modelData);
    }
    if (operations.includes("delete")) {
      this.defineDelete(modelName, modelData, tables);
    }
  }

  private checkPermissionsAndGetParams(
    modelName: string,
    operation: (typeof OperationBasic)[number],
    ctx: object,
    info: GraphQLResolveInfo | null,
    modelData: ModelData
  ): OperationParams {
    const { executable, depthLimit, limit, where, orderBy, inputData } =
      modelData;

    if (executable?.({ modelName, ctx, operation }) === false) {
      throw new Error("No permission");
    }

    const params: OperationParams = {
      depthLimit: depthLimit?.({ modelName, ctx, operation }),
      limit: limit?.({ modelName, ctx, operation }),
      where: where?.({ modelName, ctx, operation }),
      orderBy: orderBy?.({ modelName, ctx, operation }),
      input: inputData?.({ modelName, ctx, operation }),
    };

    if (
      info &&
      params.depthLimit !== undefined &&
      getQueryDepth(info) > params.depthLimit
    ) {
      throw new Error("Depth limit exceeded");
    }

    return params;
  }

  private defineFindMany(
    modelName: string,
    modelData: ModelData,
    tables: Record<string, ModelData>
  ) {
    const { tableInfo } = modelData;
    const inputWhere = this.generator.getInputWhere(modelName);
    const inputOrderBy = this.generator.getInputOrderBy(modelName);

    this.builder.queryType({
      fields: (t) => ({
        [`findMany${tableInfo.name}`]: t.drizzleField({
          type: [modelName],
          nullable: false,
          args: {
            offset: t.arg({ type: "Int" }),
            limit: t.arg({ type: "Int" }),
            where: t.arg({ type: inputWhere }),
            orderBy: t.arg({ type: [inputOrderBy] }),
          },
          resolve: async (
            query: (selection: unknown) => object,
            _parent: unknown,
            args: { limit?: number; where: object; orderBy?: object[] },
            ctx: object,
            info: GraphQLResolveInfo
          ) => {
            const params = this.checkPermissionsAndGetParams(
              modelName,
              "findMany",
              ctx,
              info,
              modelData
            );

            return this.generator.getQueryTable(ctx, modelName).findMany(
              replaceColumnValues(
                tables,
                modelName,
                getQueryFields(info),
                query({
                  ...args,
                  limit:
                    params.limit && args.limit
                      ? Math.min(params.limit, args.limit)
                      : params.limit ?? args.limit,
                  where: {
                    AND: [structuredClone(args.where), params.where].filter(
                      (v) => v
                    ),
                  },
                  orderBy:
                    args.orderBy && Object.keys(args.orderBy).length
                      ? Object.fromEntries(
                          args.orderBy.flatMap((v) => Object.entries(v))
                        )
                      : params.orderBy,
                })
              ) as never
            );
          },
        } as never),
      }),
    });
  }

  private defineFindFirst(
    modelName: string,
    modelData: ModelData,
    tables: Record<string, ModelData>
  ) {
    const { tableInfo } = modelData;
    const inputWhere = this.generator.getInputWhere(modelName);
    const inputOrderBy = this.generator.getInputOrderBy(modelName);

    this.builder.queryType({
      fields: (t) => ({
        [`findFirst${tableInfo.name}`]: t.drizzleField({
          type: modelName,
          args: {
            offset: t.arg({ type: "Int" }),
            where: t.arg({ type: inputWhere }),
            orderBy: t.arg({ type: [inputOrderBy] }),
          },
          resolve: async (
            query: (selection: unknown) => object,
            _parent: unknown,
            args: { where: object; orderBy?: object[] },
            ctx: object,
            info: GraphQLResolveInfo
          ) => {
            const params = this.checkPermissionsAndGetParams(
              modelName,
              "findFirst",
              ctx,
              info,
              modelData
            );

            return this.generator.getQueryTable(ctx, modelName).findFirst(
              replaceColumnValues(
                tables,
                modelName,
                getQueryFields(info),
                query({
                  ...args,
                  where: {
                    AND: [structuredClone(args.where), params.where].filter(
                      (v) => v
                    ),
                  },
                  orderBy:
                    args.orderBy && Object.keys(args.orderBy).length
                      ? Object.fromEntries(
                          args.orderBy.flatMap((v) => Object.entries(v))
                        )
                      : params.orderBy,
                })
              ) as never
            );
          },
        } as never),
      }),
    });
  }

  private defineCount(modelName: string, modelData: ModelData) {
    const { tableInfo } = modelData;
    const inputWhere = this.generator.getInputWhere(modelName);

    this.builder.queryType({
      fields: (t) => ({
        [`count${tableInfo.name}`]: t.field({
          type: "Int",
          nullable: false,
          args: {
            limit: t.arg({ type: "Int" }),
            where: t.arg({ type: inputWhere }),
          },
          resolve: async (
            _parent: unknown,
            args: { where?: object },
            ctx: object,
            info: GraphQLResolveInfo
          ) => {
            const params = this.checkPermissionsAndGetParams(
              modelName,
              "count",
              ctx,
              info,
              modelData
            );

            return (
              this.generator.getClient(ctx).query[
                modelName as never
              ] as RelationalQueryBuilder<never, never>
            )
              .findFirst({
                columns: {},
                extras: { _count: () => sql`count(*) ` },
                ...args,
                where: {
                  AND: [structuredClone(args.where), params.where].filter(
                    (v) => v
                  ),
                },
              } as never)
              .then((v: unknown) => (v as { _count: number })._count);
          },
        } as never),
      }),
    });
  }

  private defineCreateOne(modelName: string, modelData: ModelData) {
    const { tableInfo, columns, table, relations } = modelData;
    const inputCreate = this.generator.getInputCreate(modelName);

    this.builder.mutationType({
      fields: (t) => ({
        [`createOne${tableInfo.name}`]: t.drizzleField({
          type: modelName,
          nullable: false,
          args: { input: t.arg({ type: inputCreate, required: true }) },
          resolve: async (
            query: (selection: unknown) => unknown,
            _parent: unknown,
            args: { input: object },
            ctx: object,
            info: GraphQLResolveInfo
          ) => {
            const client = this.generator.getClient(ctx);
            const params = this.checkPermissionsAndGetParams(
              modelName,
              "createOne",
              ctx,
              info,
              modelData
            );
            const input = Object.fromEntries(
              Object.entries({
                ...args.input,
                ...params.input,
              }).filter(([key]) => columns.some((v) => v.name === key))
            );
            const relationInput = Object.entries({
              ...args.input,
              ...params.input,
            }).filter(([key]) => columns.every((v) => v.name !== key));
            const { returning, isRelay } = getReturning(
              info,
              columns,
              relationInput.length > 0
            );
            if (!isRelay) {
              query({});
            }
            if (!returning) {
              return client
                .insert(table as never)
                .values(input as never)
                .then(() => ({}));
            }
            const result = await client
              .insert(table as never)
              .values(input as never)
              .returning(returning)
              .then(async (results) => {
                await this.insertRelayValue({
                  results,
                  client,
                  relationInput,
                  relations,
                });
                return results;
              })
              .then((v: Record<string, unknown>[]) => v[0]);
            return result;
          },
        } as never),
      }),
    });
  }
  private async insertRelayValue({
    results,
    client,
    relationInput,
    relations,
  }: {
    results: {
      [x: string]: unknown;
    }[];
    client: NodePgDatabase<Record<string, never>, EmptyRelations>;
    relationInput: [string, unknown][];
    relations: RelationsRecord;
  }) {
    if (relationInput.length) {
      for (const result of results) {
        for (const [relationName, value] of relationInput) {
          const relayValue = value as {
            set?: Record<string, unknown>[];
          };
          const setValue = relayValue.set;
          if (setValue) {
            const relay = relations[relationName];
            const throughTable = relay?.throughTable;
            if (relay?.through) {
              const sourceToThrough = Object.fromEntries(
                relay.sourceColumns.map((v, index) => [
                  v.name,
                  relay.through!.source[index]!._.key,
                ])
              );
              const targetToThrough = Object.fromEntries(
                relay.targetColumns.map((v, index) => [
                  v.name,
                  relay.through!.target[index]!._.key,
                ])
              );
              if (throughTable) {
                const where = relay.sourceColumns.map(
                  (v) => [sourceToThrough[v.name], result[v.name]] as const
                );
                await client.transaction(async (t) => {
                  await t
                    .delete(throughTable as never)
                    .where(
                      and(
                        ...where.map(([key, value]) => eq(key as never, value))
                      )
                    );
                  const values = setValue.map((value) =>
                    Object.fromEntries([
                      ...Object.entries(value).map(([key, value]) => [
                        targetToThrough[key],
                        value,
                      ]),
                      ...where,
                    ])
                  );
                  await t.insert(throughTable as never).values(values);
                });
              }
            }
          }
        }
      }
    }
  }
  private defineCreateMany(modelName: string, modelData: ModelData) {
    const { tableInfo, columns, table } = modelData;
    const inputCreate = this.generator.getInputCreate(modelName);

    this.builder.mutationType({
      fields: (t) => ({
        [`createMany${tableInfo.name}`]: t.drizzleField({
          type: [modelName],
          nullable: false,
          args: { input: t.arg({ type: [inputCreate], required: true }) },
          resolve: async (
            query: (selection: unknown) => object,
            _parent: unknown,
            args: { input: object[] },
            ctx: object,
            info: GraphQLResolveInfo
          ) => {
            const params = this.checkPermissionsAndGetParams(
              modelName,
              "createMany",
              ctx,
              info,
              modelData
            );
            if (!args.input.length) return [];
            const { returning, isRelay } = getReturning(info, columns);
            if (!isRelay) {
              query({});
            }

            return returning
              ? this.generator
                  .getClient(ctx)
                  .insert(table as never)
                  .values(args.input.map((v) => ({ ...v, ...params.input })))
                  .returning(returning)
              : this.generator
                  .getClient(ctx)
                  .insert(table as never)
                  .values(args.input.map((v) => ({ ...v, ...params.input })))
                  .then((v) => Array(v.rowCount ?? 0).fill({}));
          },
        } as never),
      }),
    });
  }

  private defineUpdate(modelName: string, modelData: ModelData) {
    const { tableInfo, columns, table } = modelData;
    const inputUpdate = this.generator.getInputUpdate(modelName);
    const inputWhere = this.generator.getInputWhere(modelName);

    this.builder.mutationType({
      fields: (t) => ({
        [`update${tableInfo.name}`]: t.drizzleField({
          type: [modelName],
          nullable: false,
          args: {
            input: t.arg({ type: inputUpdate, required: true }),
            where: t.arg({ type: inputWhere }),
          },
          resolve: async (
            query: (selection: unknown) => object,
            _parent: unknown,
            args: { input: object; where?: object },
            ctx: object,
            info: GraphQLResolveInfo
          ) => {
            const params = this.checkPermissionsAndGetParams(
              modelName,
              "update",
              ctx,
              info,
              modelData
            );
            const { returning, isRelay } = getReturning(info, columns);
            if (!isRelay) {
              query({});
            }
            const whereQuery = createWhereQuery(table, {
              AND: [structuredClone(args.where), params.where].filter((v) => v),
            } as never);

            return returning
              ? this.generator
                  .getClient(ctx)
                  .update(table as never)
                  .set(args.input)
                  .where(whereQuery)
                  .returning(returning)
              : this.generator
                  .getClient(ctx)
                  .update(table as never)
                  .set(args.input)
                  .where(whereQuery)
                  .then((v) => Array(v.rowCount ?? 0).fill({}));
          },
        } as never),
      }),
    });
  }

  private defineDelete(
    modelName: string,
    modelData: ModelData,
    tables: Record<string, ModelData>
  ) {
    const { tableInfo, columns, table } = modelData;
    const inputWhere = this.generator.getInputWhere(modelName);

    this.builder.mutationType({
      fields: (t) => ({
        [`delete${tableInfo.name}`]: t.drizzleField({
          type: [modelName],
          nullable: false,
          args: { where: t.arg({ type: inputWhere }) },
          resolve: async (
            query: (selection: unknown) => object,
            _parent: unknown,
            args: { where?: object },
            ctx: object,
            info: GraphQLResolveInfo
          ) => {
            const params = this.checkPermissionsAndGetParams(
              modelName,
              "delete",
              ctx,
              info,
              modelData
            );
            const { returning, isRelay } = getReturning(info, columns);
            const whereCondition = {
              AND: [structuredClone(args.where), params.where].filter((v) => v),
            };

            if (isRelay) {
              const result = await this.generator
                .getQueryTable(ctx, modelName)
                .findMany(
                  replaceColumnValues(
                    tables,
                    modelName,
                    getQueryFields(info),
                    query({ ...args, where: whereCondition })
                  ) as never
                );
              await this.generator
                .getClient(ctx)
                .delete(table as never)
                .where(createWhereQuery(table, whereCondition as never));
              return result;
            }

            query({});
            const whereQuery = createWhereQuery(table, whereCondition as never);

            return returning
              ? this.generator
                  .getClient(ctx)
                  .delete(table as never)
                  .where(whereQuery)
                  .returning(returning)
              : this.generator
                  .getClient(ctx)
                  .delete(table as never)
                  .where(whereQuery)
                  .then((v) => Array(v.rowCount ?? 0).fill({}));
          },
        } as never),
      }),
    });
  }
}
