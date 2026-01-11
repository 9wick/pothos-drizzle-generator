import { getQueryDepth } from "./graphql.js";
import { isOperation, type OperationBasic } from "./operations.js";
import type { ModelData } from "../generator.js";
import type { GraphQLResolveInfo } from "graphql";

export type ResolvedOperationParams = {
  depthLimit?: number;
  limit?: number;
  where?: object;
  orderBy?: object;
  input?: object;
};

export function checkPermissionsAndGetParams(
  modelName: string,
  operation: (typeof OperationBasic)[number],
  ctx: object,
  info: GraphQLResolveInfo | null,
  modelData: ModelData
): ResolvedOperationParams {
  const { executable, depthLimit, limit, where, orderBy, inputData } = modelData;

  if (executable?.({ modelName, ctx, operation }) === false) {
    throw new Error("No permission");
  }

  const params: ResolvedOperationParams = {
    depthLimit: depthLimit?.({ modelName, ctx, operation }),
    limit: limit?.({ modelName, ctx, operation }),
    where: where?.({ modelName, ctx, operation }),
    orderBy: orderBy?.({ modelName, ctx, operation }),
    input: isOperation("mutation", operation)
      ? inputData?.({ modelName, ctx, operation })
      : undefined,
  };

  if (info && params.depthLimit !== undefined && getQueryDepth(info) > params.depthLimit) {
    throw new Error("Depth limit exceeded");
  }

  return params;
}
