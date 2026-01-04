import { gql } from "@urql/core";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { relations } from "../db/relations";
import { createClient, getSearchPath } from "../libs/test-tools";

export const { app, client, db } = createClient({
  searchPath: getSearchPath(import.meta.url),
  relations,
  pothosDrizzleGenerator: {},
});


const COUNT_POSTS = gql`
  query CountPost($where: PostWhere) {
    countPost(where: $where)
  }
`;

const COUNT_USERS = gql`
  query CountUser($where: UserWhere) {
    countUser(where: $where)
  }
`;

const COUNT_CATEGORIES = gql`
  query CountCategory($where: CategoryWhere) {
    countCategory(where: $where)
  }
`;

describe("Query: count (Drizzle v2 Pure Object Syntax)", () => {
  beforeAll(async () => {
    await db.resetSchema();
  });
  afterAll(async () => {
    await db.dropSchema();
  });

  it("should return the total count of posts", async () => {
    const dbCount = (await db.query.posts.findMany()).length;

    const result = await client.query<{ countPost: number }>(COUNT_POSTS, {});

    expect(result.error).toBeUndefined();
    expect(result.data?.countPost).toBe(dbCount);
  });

  it("should return the count of posts with a specific condition", async () => {
    const dbCount = (
      await db.query.posts.findMany({
        where: { published: true },
      })
    ).length;

    const result = await client.query<{ countPost: number }>(COUNT_POSTS, {
      where: {
        published: { eq: true },
      },
    });

    expect(result.error).toBeUndefined();
    expect(result.data?.countPost).toBe(dbCount);
  });

  it("should return 0 when no records match the criteria", async () => {
    const result = await client.query<{ countPost: number }>(COUNT_POSTS, {
      where: {
        title: { eq: "Non-existent Title" },
      },
    });

    expect(result.error).toBeUndefined();
    expect(result.data?.countPost).toBe(0);
  });

  it("should return the count of users", async () => {
    const dbCount = (await db.query.users.findMany()).length;

    const result = await client.query<{ countUser: number }>(COUNT_USERS, {});

    expect(result.error).toBeUndefined();
    expect(result.data?.countUser).toBe(dbCount);
  });

  it("should return the count of categories", async () => {
    const dbCount = (await db.query.categories.findMany()).length;

    const result = await client.query<{ countCategory: number }>(COUNT_CATEGORIES, {});

    expect(result.error).toBeUndefined();
    expect(result.data?.countCategory).toBe(dbCount);
  });
});
