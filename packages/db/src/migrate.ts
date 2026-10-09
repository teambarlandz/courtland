// migrate.ts — file-based migration runner shared by the API pre-deploy step
// (apps/api/bin/migrate.ts) and the packages/db migrate:local script used in
// CI. Applies every *.sql file in a directory in lexical order, recording each
// in public.migration_history so a repeat run against the same database is a
// no-op. One transaction per file: a failed file leaves no partial state and
// no history row.
//
// Precondition: a FRESH database (CI service) or one this runner migrated.
// Against a `supabase db reset` database there are no history rows, so the
// runner re-applies from the first file and stops loudly at the first
// already-exists error. That loud failure is intentional: silently skipping
// would mask real drift.
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

export const DEFAULT_MIGRATIONS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../supabase/migrations",
);

export async function applyMigrations(
  connectionString: string,
  migrationsDir: string = DEFAULT_MIGRATIONS_DIR,
): Promise<string[]> {
  const sql = postgres(connectionString, { prepare: false, max: 1 });
  try {
    await sql`create table if not exists public.migration_history (filename text primary key, applied_at timestamptz not null default now())`;
    const rows = (await sql`select filename from public.migration_history`) as {
      filename: string;
    }[];
    const done = new Set(rows.map((r) => r.filename));
    const files = (await readdir(migrationsDir)).filter((f) => f.endsWith(".sql")).sort();
    const applied: string[] = [];
    for (const file of files) {
      if (done.has(file)) continue;
      const contents = await readFile(path.join(migrationsDir, file), "utf8");
      await sql.begin(async (tx) => {
        await tx.unsafe(contents);
        await tx`insert into public.migration_history (filename) values (${file})`;
      });
      applied.push(file);
    }
    return applied;
  } finally {
    await sql.end();
  }
}
