// test/setup/pg.ts — scratch database for API integration tests.
// Creates a uniquely-named database on the local Postgres, applies every
// migration plus supabase/seed.sql, and drops the database on teardown.
// Each suite gets its own database, so suites never share state.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applyMigrations } from "@courtland/db";
import postgres from "postgres";

export interface ScratchDatabase {
  name: string;
  connectionString: string;
  drop: () => Promise<void>;
}

function adminUrl(): string {
  return process.env.PG_ADMIN_URL ?? "postgresql://postgres:postgres@127.0.0.1:55432/postgres";
}

function databaseUrlFor(admin: string, name: string): string {
  const url = new URL(admin);
  url.pathname = `/${name}`;
  return url.toString();
}

export async function createScratchDatabase(prefix = "courtland_it"): Promise<ScratchDatabase> {
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`.replace(
    /[^a-z0-9]/g,
    "",
  );
  const name = `${prefix}_${suffix}`;
  const admin = postgres(adminUrl(), { prepare: false, max: 1 });
  try {
    await admin.unsafe(`create database "${name}"`);
  } finally {
    await admin.end();
  }
  const connectionString = databaseUrlFor(adminUrl(), name);
  await applyMigrations(connectionString);
  const seedPath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../../supabase/seed.sql",
  );
  const seed = await readFile(seedPath, "utf8");
  const db = postgres(connectionString, { prepare: false, max: 1 });
  try {
    await db.unsafe(seed);
  } finally {
    await db.end();
  }
  return {
    name,
    connectionString,
    drop: async () => {
      const killer = postgres(adminUrl(), { prepare: false, max: 1 });
      try {
        await killer.unsafe(`drop database if exists "${name}"`);
      } finally {
        await killer.end();
      }
    },
  };
}
