// bin/migrate.ts — pre-deploy migration runner.
// Applies every supabase/migrations/*.sql in lexical order, recording each in
// public.migration_history so a repeat run is a no-op. One transaction per
// file: a failed file leaves no partial state and no history row.
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const MIGRATIONS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../supabase/migrations",
);

export async function applyMigrations(
  connectionString: string,
  migrationsDir: string = MIGRATIONS_DIR,
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

const invokedAs = process.argv[1] === undefined ? "" : path.resolve(process.argv[1]);
if (invokedAs === fileURLToPath(import.meta.url)) {
  const url = process.env.DATABASE_URL;
  if (url === undefined || url === "") {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }
  const applied = await applyMigrations(url);
  console.log(
    applied.length === 0
      ? "database is up to date"
      : `applied ${applied.length} migration(s):\n${applied.join("\n")}`,
  );
}
