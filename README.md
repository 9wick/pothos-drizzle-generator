# pothos-drizzle-generator

A Pothos plugin that automatically generates GraphQL schemas based on Drizzle schema information.

![](./documents/image.png)

# usage

To use this service, you must have version `drizzle-orm@1.0.0-beta.2` or later.

```ts
import "dotenv/config";
import SchemaBuilder from "@pothos/core";
import DrizzlePlugin from "@pothos/plugin-drizzle";
import { drizzle } from "drizzle-orm/node-postgres";
import { getTableConfig } from "drizzle-orm/pg-core";
import { relations } from "./db/relations";
import PothosDrizzleGeneratorPlugin from "pothos-drizzle-generator";

const db = drizzle({
  connection: process.env.DATABASE_URL!,
  relations,
  logger: true,
});

export interface PothosTypes {
  DrizzleRelations: typeof relations;
  Context: { userId?: string };
}

const builder = new SchemaBuilder<PothosTypes>({
  plugins: [
    DrizzlePlugin,
    PothosDrizzleGeneratorPlugin, // Set plugin
  ],
  drizzle: {
    client: () => db,
    relations,
    getTableConfig,
  },
});

const schema = builder.toSchema();
```

# Options

```ts
const builder = new SchemaBuilder<PothosTypes>({
  plugins: [
    DrizzlePlugin,
    PothosDrizzleGeneratorPlugin, // Set plugin
  ],
  drizzle: {
    client: () => db,
    relations,
    getTableConfig,
  },
  pothosDrizzleGenerator: {
    // Specifying the Maximum Query Depth
    depthLimit: ({ ctx, modelName, operation }) => $limit$,
    // Specifying the model to use
    use: { include: [...$modelNames$], exclude: [...$modelNames$] },
    models: {
      [$modelName$]: {
        // Specifying fields to use in queries
        fields: { include: [...$fields$], exclude: [...$fields$] },
        // Specifying the method of operation for the model
        operations: { include: [...$operation$], exclude: [...$operation$] },
        // Runtime Permission Check
        executable: ({ ctx, modelName, operation }) => $permission$,
        // Specify the maximum value for the query's limit
        limit: ({ ctx, modelName, operation }) => $limit$,
        // Override the query's orderBy
        orderBy: ({ ctx, modelName, operation }) => $orderBy$,
        // Add query conditions
        where: ({ ctx, modelName, operation }) => $where$,
        // Specifying input fields
        inputFields: { include: [$fields$], exclude: [$fields$] },
        // Overwriting input data
        inputData: ({ ctx, modelName, operation }) => $inputData$,
      },
    },
  },
});
```

# Current implementation status

## Operations

- findMany
- findFirst
- count
- create
- update
- delete

## Parameters

- where
- orderBy
- offset
- limit

## operators

- AND
- OR
- NOT
- eq
- ne
- gt
- gte
- lt
- lte
- like
- notLike
- ilike
- notIlike
- isNull
- isNotNull,
- in,
- notIn
- arrayContained
- arrayOverlaps
- arrayContains
