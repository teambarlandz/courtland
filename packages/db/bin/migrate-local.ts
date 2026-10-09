// bin/migrate-local.ts — entry for `pnpm migrate:local`. Applies
// supabase/migrations to $DATABASE_URL (default: the local Supabase DB).
import { applyMigrations } from "../src/migrate.ts";

const url = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:55432/postgres";
const applied = await applyMigrations(url);
console.log(
  applied.length === 0
    ? "database is up to date"
    : `applied ${applied.length} migration(s):\n${applied.join("\n")}`,
);
