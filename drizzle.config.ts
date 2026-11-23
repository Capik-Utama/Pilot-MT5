import { defineConfig } from "drizzle-kit";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required to run Drizzle Kit commands");
}

export default defineConfig({
  schema: "./drizzle/schema.ts",
  out: "./drizzle/pg-migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: connectionString,
  },
});
