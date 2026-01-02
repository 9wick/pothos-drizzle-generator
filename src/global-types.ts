import type { Operation, OperationBasic } from "./libs/operations.js";
import type { PothosDrizzleGenerator } from "./PothosDrizzleGenerator.js";
import type { SchemaTypes } from "@pothos/core";
import type {
  AnyMany,
  DBQueryConfigColumns,
  GetTableViewFieldSelection,
  RelationsFilter,
  SchemaEntry,
} from "drizzle-orm";
import type { PgTable, PgUpdateSetSource } from "drizzle-orm/pg-core";

declare global {
  export namespace PothosSchemaTypes {
    export interface Plugins<Types extends SchemaTypes, T extends object = object> {
      pothosDrizzleGenerator: PothosDrizzleGenerator<Types, T>;
    }

    type Relations<Types extends SchemaTypes> = Types["DrizzleRelations"];
    type TableNames<Types extends SchemaTypes> = keyof Relations<Types>;

    type GetTable<
      Types extends SchemaTypes,
      U extends TableNames<Types>,
    > = Relations<Types>[U]["table"];

    type AnyTable<Types extends SchemaTypes> = GetTable<Types, TableNames<Types>>;

    type Columns<
      Types extends SchemaTypes,
      U extends TableNames<Types>,
    > = keyof DBQueryConfigColumns<GetTableViewFieldSelection<GetTable<Types, U>>>;

    type AnyColumns<Types extends SchemaTypes> =
      AnyTable<Types> extends infer R
        ? R extends SchemaEntry
          ? keyof DBQueryConfigColumns<GetTableViewFieldSelection<R>>
          : never
        : never;

    type ColumnsWithManyRelations<Types extends SchemaTypes, U extends TableNames<Types>> =
      | Columns<Types, U>
      | keyof {
          [K in keyof Relations<Types>[U]["relations"] as Relations<Types>[U]["relations"][K] extends AnyMany
            ? K
            : never]: unknown;
        }
      | keyof {
          [K in keyof Relations<Types>[U]["relations"] as Relations<Types>[U]["relations"][K] extends AnyMany
            ? K extends string
              ? `${K}Count`
              : never
            : never]: unknown;
        };

    type AnyColumnsWithManyRelations<Types extends SchemaTypes> = {
      [U in TableNames<Types>]: ColumnsWithManyRelations<Types, U>;
    }[TableNames<Types>];

    type ModelParams<Types extends SchemaTypes, U extends TableNames<Types>> = {
      modelName: U;
    };

    type OperationParams<Types extends SchemaTypes, U extends TableNames<Types>> = {
      ctx: Types["Context"];
      modelName: U;
      operation: (typeof OperationBasic)[number];
    };

    type IncludeExclude<T> =
      | { include: T[]; exclude?: undefined }
      | { exclude: T[]; include?: undefined };

    type OperationSelection = { include?: Operation[]; exclude?: Operation[] } | undefined;

    type FilterOperator<T> = {
      eq?: T;
      ne?: T;
      gt?: T;
      gte?: T;
      lt?: T;
      lte?: T;
      in?: T[];
      notIn?: T[];
      like?: T;
      notLike?: T;
      isNull?: boolean;
      isNotNull?: boolean;
    };

    type FilterObject<T> = {
      [K in keyof T]?: T[K] | FilterOperator<T[K]>;
    } & {
      AND?: FilterObject<T>[];
      OR?: FilterObject<T>[];
      NOT?: FilterObject<T>;
    };

    type WhereReturn<Types extends SchemaTypes, U extends TableNames<Types>> =
      | FilterObject<GetTableViewFieldSelection<GetTable<Types, U>>>
      | RelationsFilter<Relations<Types>[U], Relations<Types>>
      | undefined;

    type AnyWhereReturn<Types extends SchemaTypes> = {
      [U in TableNames<Types>]: WhereReturn<Types, U>;
    }[TableNames<Types>];

    type OrderByReturn<ColType extends string | number | symbol> =
      | { [P in ColType]?: "asc" | "desc" }
      | undefined;

    type InputDataReturn<Types extends SchemaTypes, U extends TableNames<Types>> =
      | (PgUpdateSetSource<GetTable<Types, U> extends PgTable ? GetTable<Types, U> : never> & {
          [K in keyof Relations<Types>[U]["relations"] as Relations<Types>[U]["relations"][K] extends AnyMany
            ? K
            : never]?: {
            set?: Array<Record<string, unknown>>;
          };
        })
      | undefined;

    export interface ModelOptions<Types extends SchemaTypes, U extends TableNames<Types>> {
      fields?: <T extends U>(
        params: ModelParams<Types, T>
      ) =>
        | IncludeExclude<U extends unknown ? ColumnsWithManyRelations<Types, U> : never>
        | undefined;

      operations?: <T extends U>(params: ModelParams<Types, T>) => OperationSelection;

      inputFields?: <T extends U>(
        params: ModelParams<Types, T>
      ) =>
        | IncludeExclude<U extends unknown ? ColumnsWithManyRelations<Types, U> : never>
        | undefined;

      depthLimit?: <T extends U>(params: OperationParams<Types, T>) => number | undefined;

      executable?: <T extends U>(params: OperationParams<Types, T>) => boolean | undefined;

      limit?: <T extends U>(params: OperationParams<Types, T>) => number | undefined;

      orderBy?: <T extends U>(
        params: OperationParams<Types, T>
      ) => U extends unknown ? OrderByReturn<Columns<Types, U>> : never;

      where?: <T extends U>(
        params: OperationParams<Types, T>
      ) => U extends unknown ? WhereReturn<Types, U> : never;

      inputData?: <T extends U>(
        params: OperationParams<Types, T>
      ) => U extends unknown ? InputDataReturn<Types, U> : never;
    }

    export interface SchemaBuilderOptions<Types extends SchemaTypes> {
      pothosDrizzleGenerator?: {
        use?: IncludeExclude<keyof Relations<Types>>;
        all?: ModelOptions<Types, TableNames<Types>>;
        models?: {
          [U in TableNames<Types>]?: ModelOptions<Types, U>;
        };
      };
    }
  }
}
