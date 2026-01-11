# 📦 Getting Started

[🔙 Back to Main README](../README.md)

## Requirements

Ensure your environment meets the following dependencies:

- **drizzle-orm**: `v1.0.0-beta.10`+
- **@pothos/core**: `v4.0.0`+
- **@pothos/plugin-drizzle**: `v0.16.2`+

## Installation

Install the generator alongside the required Pothos and Drizzle packages:

```bash
# npm
npm install pothos-drizzle-generator @pothos/core @pothos/plugin-drizzle drizzle-orm@beta graphql

# pnpm
pnpm add pothos-drizzle-generator @pothos/core @pothos/plugin-drizzle drizzle-orm@beta graphql

# yarn
yarn add pothos-drizzle-generator @pothos/core @pothos/plugin-drizzle drizzle-orm@beta graphql

```

---

## ⚡ Quick Start

Follow these steps to integrate the generator into your SchemaBuilder.

### 1. Setup & Initialization

Register the `PothosDrizzleGeneratorPlugin` and configure your Drizzle client.

```ts
import "dotenv/config";
import SchemaBuilder from "@pothos/core";
import DrizzlePlugin from "@pothos/plugin-drizzle";
import PothosDrizzleGeneratorPlugin from "pothos-drizzle-generator";
import { drizzle } from "drizzle-orm/node-postgres";
import { getTableConfig } from "drizzle-orm/pg-core";
import { relations } from "./db/relations";

// 1. Initialize Drizzle Client
const db = drizzle({
  connection: process.env.DATABASE_URL!,
  relations,
  logger: true,
});

// 2. Define Context & Types
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
  // 4. Generator Configuration
  pothosDrizzleGenerator: {
    // Define your global and model-specific rules here
  },
});

// 5. Build Schema
const schema = builder.toSchema();
```
