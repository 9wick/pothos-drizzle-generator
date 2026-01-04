# pothos-drizzle-generator

**Pothos Drizzle Generator** is a powerful Pothos plugin that automatically generates a complete GraphQL schema (Query & Mutation) based on your Drizzle ORM schema definition.

It eliminates boilerplate by creating types, input objects, and resolvers for standard CRUD operations while offering granular control over permissions, filtering, and field visibility.

![](./documents/image.png)

## 🚀 Features

- **Automated CRUD**: Generates `findMany`, `findFirst`, `create`, `update`, and `delete` operations.
- **Type Safety**: Fully typed inputs and outputs based on your Drizzle schema.
- **Rich Filtering**: Built-in support for complex filtering (`AND`, `OR`, `gt`, `contains`, etc.).
- **Granular Control**: Configure visibility and permissions globally or per model.
- **Join Table Handling**: Easily exclude or customize join tables.

## 🔗 Sample Repository

Check out the sample implementation here:

[https://github.com/SoraKumo001/pothos-drizzle-generator-sample](https://github.com/SoraKumo001/pothos-drizzle-generator-sample)

## 📦 Requirements

- **drizzle-orm**: `v1.0.0-beta.8` or higher
- **@pothos/core**: `v4.0.0` or higher
- **@pothos/plugin-drizzle**: `v0.16.0` or higher

## 📥 Installation

Install the generator alongside Pothos and Drizzle dependencies:

```bash
npm install pothos-drizzle-generator @pothos/core @pothos/plugin-drizzle drizzle-orm graphql
# or
pnpm add pothos-drizzle-generator @pothos/core @pothos/plugin-drizzle drizzle-orm graphql
# or
yarn add pothos-drizzle-generator @pothos/core @pothos/plugin-drizzle drizzle-orm graphql


```

## ⚡ Quick Start

### 1. Setup Drizzle and Pothos

Register the `PothosDrizzleGeneratorPlugin` in your SchemaBuilder.

```ts
import "dotenv/config";
import SchemaBuilder from "@pothos/core";
import DrizzlePlugin from "@pothos/plugin-drizzle";
import { drizzle } from "drizzle-orm/node-postgres";
import { getTableConfig } from "drizzle-orm/pg-core";
import { relations } from "./db/relations";
import PothosDrizzleGeneratorPlugin from "pothos-drizzle-generator";

// 1. Initialize Drizzle Client
const db = drizzle({
  connection: process.env.DATABASE_URL!,
  relations,
  logger: true,
});

// 2. Define Types
export interface PothosTypes {
  DrizzleRelations: typeof relations;
  Context: { userId?: string };
}

// 3. Initialize Builder
const builder = new SchemaBuilder<PothosTypes>({
  plugins: [
    DrizzlePlugin,
    PothosDrizzleGeneratorPlugin, // Register the generator plugin
  ],
  drizzle: {
    client: () => db,
    relations,
    getTableConfig,
  },
  // 4. Configure Generator
  pothosDrizzleGenerator: {
    // Configuration goes here (see below)
  },
});

// 5. Generate Schema
const schema = builder.toSchema();
```

## ⚙️ Configuration Guide

The `pothosDrizzleGenerator` option gives you full control over how your schema is generated. The configuration is applied in three layers:

1. **Selection (`use`)**: Which tables to include.
2. **Global Defaults (`all`)**: Rules applied to every model.
3. **Model Overrides (`models`)**: Rules for specific models.

### 1. Table Selection (`use`)

By default, the generator creates types for **all** tables defined in your `relations`. You can use the `use` option to explicitly include or exclude specific tables.

This is particularly useful for hiding join tables (many-to-many) or internal tables.

```ts
pothosDrizzleGenerator: {
  // Option A: Allow list (Only generate these tables)
  use: { include: ["users", "posts", "comments"] },

  // Option B: Block list (Generate everything EXCEPT these)
  use: { exclude: ["users_to_groups", "audit_logs"] },
}


```

### 2. Global Defaults (`all`)

The `all` option applies settings to **every model**. It is the best place to define your baseline security rules, default limits, and standard field visibility.

```ts
pothosDrizzleGenerator: {
  all: {
    // Example: Require authentication for all write operations
    executable: ({ ctx, operation }) => {
       if (['create', 'update', 'delete'].includes(operation)) {
         return !!ctx.userId;
       }
       return true;
    },
    // Example: Default limit for queries
    limit: () => 50,
  }
}


```

### 3. Model Overrides (`models`)

The `models` option allows you to target specific tables by their name. Settings defined here **override** the global settings in `all`.

```ts
pothosDrizzleGenerator: {
  models: {
    users: {
      // Users can only see their own profile
      where: ({ ctx }) => ({ id: { eq: ctx.userId } }),
      // Disable deletion for users
      operations: () => ({ exclude: ["delete"] })
    }
  }
}


```

### 4. API Reference

The following options are available within both `all` and `models`. The **Expected Return** column indicates the type of data your callback function should return.

| Property      | Description                                                              | Callback Arguments              | Expected Return (If undefined is returned, the default behavior applies) |
| ------------- | ------------------------------------------------------------------------ | ------------------------------- | ------------------------------------------------------------------------ |
| `executable`  | Determines if an operation is allowed. Return `false` to throw an error. | `{ ctx, modelName, operation }` | `boolean`                                                                |
| `fields`      | Controls which fields are exposed in the Type.                           | `{ modelName }`                 | `{ include?: string[], exclude?: string[] }`                             |
| `inputFields` | Controls which fields are exposed in Input types (Create/Update).        | `{ modelName }`                 | `{ include?: string[], exclude?: string[] }`                             |
| `operations`  | Specifies which CRUD operations to generate.                             | `{ modelName }`                 | `{ include?: string[], exclude?: string[] }`                             |
| `where`       | Applies mandatory filters (e.g., for multi-tenancy or soft deletes).     | `{ ctx, modelName, operation }` | `FilterObject` (e.g. `{ id: { eq: 1 } }`)                                |
| `limit`       | Sets the default maximum number of records for `findMany`.               | `{ ctx, modelName, operation }` | `number`                                                                 |
| `depthLimit`  | Limits query nesting depth to prevent performance issues.                | `{ ctx, modelName, operation }` | `number`                                                                 |
| `orderBy`     | Defines the default sort order.                                          | `{ ctx, modelName, operation }` | `{ [column]: 'asc' \| 'desc' }`                                          |
| `inputData`   | Injects server-side values (e.g., `userId`) into Mutations.              | `{ ctx, modelName, operation }` | `Object` (matching the model input)                                      |

### 5. Helper Functions & Constants

To simplify logic within your configuration callbacks (like `executable`, `where`, etc.), the package exports helper functions and constants for categorizing operations.

```ts
import { isOperation } from "pothos-drizzle-generator";
```

#### `isOperation(group, currentOperation)`

Checks if the current operation belongs to a specific group or category. This is cleaner than manually checking arrays of strings.

```ts
pothosDrizzleGenerator: {
  all: {
    // Example: Require authentication for any mutation (Create/Update/Delete)
    executable: ({ ctx, operation }) => {
      if (isOperation("mutation", operation)) {
        return !!ctx.user;
      }
      return true;
    },
  },
}

```

#### Operation Categories

The following constants can be used with `isOperation` or imported directly to reference groups of operations.

| Constant            | String     | Included Operations                           |
| ------------------- | ---------- | --------------------------------------------- |
| `OperationFind`     | `find`     | `findFirst`, `findMany`                       |
| `OperationQuery`    | `query`    | `findFirst`, `findMany`, `count`              |
| `OperationCreate`   | `create`   | `createOne`, `createMany`                     |
| `OperationUpdate`   | `update`   | `update`                                      |
| `OperationDelete`   | `delete`   | `delete`                                      |
| `OperationMutation` | `mutation` | `createOne`, `createMany`, `update`, `delete` |
| `OperationAll`      | `all`      | ...all                                        |

## 🛡️ Comprehensive Example

Below is a complete example showing how `use`, `all`, and `models` work together to create a secure, production-ready schema.

```ts
import { isOperation } from "pothos-drizzle-generator";

const builder = new SchemaBuilder<PothosTypes>({
  plugins: [DrizzlePlugin, PothosDrizzleGeneratorPlugin],
  drizzle: {
    /* ... */
  },

  pothosDrizzleGenerator: {
    // 1. Global Exclusion: Don't generate schema for join tables
    use: { exclude: ["postsToCategories"] },

    // 2. Global Defaults (Applied to everyone)
    all: {
      // Security: Read-only by default. Writes require login.
      executable: ({ ctx, operation }) => {
        if (isOperation("mutation", operation)) {
          return !!ctx.user;
        }
        return true;
      },

      // Visibility: Never expose password or secret fields.
      fields: () => ({ exclude: ["password", "secretKey"] }),

      // Inputs: Never allow clients to set system timestamps.
      inputFields: () => ({ exclude: ["createdAt", "updatedAt"] }),

      // Logic: Exclude soft-deleted records.
      where: ({ operation }) => {
        if (operation !== "delete") return { deletedAt: { isNull: true } };
        return {};
      },

      // Performance: Default limits.
      limit: () => 50,
      depthLimit: () => 5,
    },

    // 3. Model Overrides
    models: {
      // Case A: Strict privacy for 'users'
      users: {
        // Users can only see themselves
        where: ({ ctx }) => ({ id: { eq: ctx.user?.id } }),
        limit: () => 1,
        operations: () => ({ exclude: ["delete"] }),
      },

      // Case B: Public but owned 'posts'
      posts: {
        limit: () => 100,

        // Automatically attach authorId on creation
        inputData: ({ ctx }) => ({ authorId: ctx.user?.id }),

        // Complex Filter: Public posts OR my own posts
        where: ({ ctx, operation }) => {
          if (isOperation("find", operation)) {
            return {
              OR: [{ published: true }, { authorId: { eq: ctx.user?.id } }],
            };
          }
          // Only update/delete own posts
          if (isOperation(["update", "delete"], operation)) {
            return { authorId: ctx.user?.id };
          }
        },
      },

      // Case C: Admin-only table
      audit_logs: {
        executable: ({ ctx }) => !!ctx.user?.isAdmin,
      },
    },
  },
});
```

## Examples of Using the Generated GraphQL

### findMany

- GraphQL

Data retrieval via relations can be easily performed.

```graphql
query FindManyPost(
  $offset: Int
  $limit: Int
  $where: PostWhere
  $orderBy: [PostOrderBy!]
  $authorCountWhere: UserWhere
  $categoriesCountWhere: CategoryWhere
  $authorOffset: Int
  $authorLimit: Int
  $authorWhere: UserWhere
  $authorOrderBy: [UserOrderBy!]
  $categoriesOffset: Int
  $categoriesLimit: Int
  $categoriesWhere: CategoryWhere
  $categoriesOrderBy: [CategoryOrderBy!]
) {
  findManyPost(offset: $offset, limit: $limit, where: $where, orderBy: $orderBy) {
    ...post
    authorCount(where: $authorCountWhere)
    categoriesCount(where: $categoriesCountWhere)
    author(
      offset: $authorOffset
      limit: $authorLimit
      where: $authorWhere
      orderBy: $authorOrderBy
    ) {
      ...user
    }
    categories(
      offset: $categoriesOffset
      limit: $categoriesLimit
      where: $categoriesWhere
      orderBy: $categoriesOrderBy
    ) {
      ...category
    }
  }
}
```

- Output SQL

Queries are consolidated into a single query without triggering N+1.

```sql
 select
  "d0"."id" as "id",
  "d0"."published" as "published",
  "d0"."title" as "title",
  "d0"."content" as "content",
  "d0"."authorId" as "authorId",
  "d0"."createdAt" as "createdAt",
  "d0"."updatedAt" as "updatedAt",
  "d0"."publishedAt" as "publishedAt",
  "author"."r" as "author",
  "categories"."r" as "categories",
  (
    (
      select
        count(*)
      from
        "User"
      where
        "User"."id" = "d0"."authorId"
    )
  ) as "_author_count",
  (
    select
      count(*)
    from
      "Category"
      left join "PostToCategory" on "PostToCategory"."categoryId" = "Category"."id"
    where
      "PostToCategory"."postId" = "d0"."id"
  ) as "categoriesCount"
from
  "Post" as "d0"
  left join lateral (
    select
      row_to_json("t".*) "r"
    from
      (
        select
          "d1"."id" as "id",
          "d1"."email" as "email",
          "d1"."name" as "name",
          "d1"."roles" as "roles",
          "d1"."createdAt" as "createdAt",
          "d1"."updatedAt" as "updatedAt"
        from
          "User" as "d1"
        where
          "d0"."authorId" = "d1"."id"
        limit
          $1
      ) as "t"
  ) as "author" on true
  left join lateral (
    select
      coalesce(json_agg(row_to_json("t".*)), '[]') as "r"
    from
      (
        select
          "d1"."id" as "id",
          "d1"."name" as "name",
          "d1"."createdAt" as "createdAt",
          "d1"."updatedAt" as "updatedAt"
        from
          "Category" as "d1"
          inner join "PostToCategory" as "tr0" on "tr0"."categoryId" = "d1"."id"
        where
          "d0"."id" = "tr0"."postId"
      ) as "t"
  ) as "categories" on true
where
  "d0"."published" = $2
```

### create

- GraphQL

You can create ManyToMany data simultaneously.

```graphql
mutation Mutation($input: PostCreate!) {
  createOnePost(input: $input) {
    ...post
    categories {
      ...category
    }
  }
}
```

```json
{
  "input": {
    "title": "test",
    "published": true,
    "content": "test-content",
    "categories": {
      "set": [
        {
          "id": "663f796b-7ec0-4cda-8484-af8fe4197463"
        },
        {
          "id": "e5c86702-aaaf-4c55-a938-c3d922c0ffe2"
        }
      ]
    }
  }
}
```

- Output SQL

A transaction for data insertion will be generated.

```sql
begin;
insert into
    "Post" (
      "id",
      "published",
      "title",
      "content",
      "authorId",
      "createdAt",
      "updatedAt",
      "publishedAt"
    )
  values
    (
      default,
      $1,
      $2,
      $3,
      $4,
      default,
      default,
      default
    )
  returning
    "id",
    "published",
    "title",
    "content",
    "authorId",
    "createdAt",
    "updatedAt",
    "publishedAt";
delete from "PostToCategory"
  where
    "PostToCategory"."postId" = $1;
insert into
    "PostToCategory" ("postId", "categoryId")
  values
    ($1, $2),
    ($3, $4);
commit;
select
    "d0"."id" as "id",
    "d0"."published" as "published",
    "d0"."title" as "title",
    "d0"."content" as "content",
    "d0"."authorId" as "authorId",
    "d0"."createdAt" as "createdAt",
    "d0"."updatedAt" as "updatedAt",
    "d0"."publishedAt" as "publishedAt",
    "categories"."r" as "categories"
  from
    "Post" as "d0"
    left join lateral (
      select
        coalesce(json_agg(row_to_json("t".*)), '[]') as "r"
      from
        (
          select
            "d1"."id" as "id",
            "d1"."name" as "name",
            "d1"."createdAt" as "createdAt",
            "d1"."updatedAt" as "updatedAt"
          from
            "Category" as "d1"
            inner join "PostToCategory" as "tr0" on "tr0"."categoryId" = "d1"."id"
          where
            "d0"."id" = "tr0"."postId"
        ) as "t"
    ) as "categories" on true
```

## 🔍 Supported Features

### Operations

The generator creates the following GraphQL fields for each model (unless excluded):

- **Queries**: `findMany`, `findFirst`, `count`
- **Mutations**: `create`, `update`, `delete`

### Filtering

Advanced filtering is supported via the `where` argument on queries.

- **Logical**: `AND`, `OR`, `NOT`
- **Comparison**: `eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `in`, `notIn`, `isNull`, `isNotNull`
- **String**: `like`, `notLike`, `ilike`, `notIlike`
- **Array**: `arrayContained`, `arrayOverlaps`, `arrayContains`

## License

MIT
