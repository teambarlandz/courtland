// drizzle/config.ts — drizzle-kit configuration. Points at src/schema; the out
// directory is supabase/migrations so generated SQL lands next to the
// hand-written migrations. The hand-written migrations are the DDL source of
// truth (they carry RLS, triggers and checks); run db:generate from
// packages/db and review the diff before keeping anything it emits.
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/schema/*.ts",
  out: "../../supabase/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:55432/postgres",
  },
});
