// bin/migrate.ts — pre-deploy migration runner (thin CLI over @courtland/db).
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applyMigrations } from "@courtland/db";

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
