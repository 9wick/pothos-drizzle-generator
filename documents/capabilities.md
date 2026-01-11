# 💡 Generated Schema Capabilities

[🔙 Back to Main README](../README.md)

## Optimized Data Retrieval (Solving N+1)

The generator's `findMany` operation is engineered for performance and flexibility.

- **Deep Filtering & Sorting**: You aren't limited to filtering the root node. You can apply specific `where` clauses, `limit`, and `orderBy` arguments **to any related field deep in the graph**.
- **Single Query Execution**: It consolidates fetching the main resource, related records, and counts into a **single, optimized SQL query**. This utilizes complex `JOIN` and `LATERAL` clauses to eliminate the N+1 problem.

**Example Query:**
_Fetching users and specifically only their 'published' posts._

```graphql
query {
  findManyUser {
    id
    name
    # Filter related records directly
    posts(where: { published: { eq: true } }, orderBy: { createdAt: desc }, limit: 5) {
      title
      createdAt
    }
  }
}
```

## Transactional Mutations

Write operations ensure data integrity through automatic transaction wrapping.

- **Atomic Operations**: When creating a record with related data (e.g., a Post with Categories), the entire process runs within a database transaction (`BEGIN` ... `COMMIT`).
- **Consistency**: If any part of the operation fails (e.g., inserting a relation), the entire action is rolled back, preventing orphaned data.

**Example Mutation:**

```graphql
mutation {
  createOnePost(
    input: {
      title: "My New Post"
      content: "Hello World"
      # Handles many-to-many relation automatically
      categories: { set: [{ id: "cat-1" }, { id: "cat-2" }] }
    }
  ) {
    id
    categories {
      name
    }
  }
}
```

---

## 🔍 Supported Features Checklist

### Operations

- **Queries**: `findMany`, `findFirst`, `count`
- **Mutations**: `create`, `update`, `delete`

### Advanced Filtering (`where`)

- **Logical**: `AND`, `OR`, `NOT`
- **Comparators**: `eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `in`, `notIn`
- **Existence**: `isNull`, `isNotNull`
- **String Matching**: `like`, `notLike`, `ilike`, `notIlike`
- **Array Operations**: `arrayContained`, `arrayOverlaps`, `arrayContains`