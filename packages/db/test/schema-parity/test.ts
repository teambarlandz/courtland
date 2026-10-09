// test/schema-parity/test.ts — the dead-code gate for packages/db.
// Every column in the Drizzle schema must exist in a migration, and every
// column in a migration must exist in the Drizzle schema. A column added to
// SQL and forgotten in TypeScript is the most common way a `select *`
// quietly becomes a bug.
//
// Scope is deliberately columns (names, nullability, types). Defaults,
// checks and foreign keys live in the migrations; pgTAP asserts their
// behaviour. Views are excluded: they are read models, not tables.

import assert from "node:assert/strict";
import { test } from "node:test";
import { getTableConfig } from "drizzle-orm/pg-core";
import postgres from "postgres";
import * as asset from "../../src/schema/asset.ts";
import * as contract from "../../src/schema/contract.ts";
import * as documents from "../../src/schema/documents.ts";
import * as identity from "../../src/schema/identity.ts";
import * as money from "../../src/schema/money.ts";
import * as ops from "../../src/schema/ops.ts";
import * as platform from "../../src/schema/platform.ts";

const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:55432/postgres";

interface DrizzleColumn {
  name: string;
  notNull: boolean;
  sqlType: string;
  enumValues: string[] | null;
}

interface DbColumn {
  column_name: string;
  is_nullable: "YES" | "NO";
  udt_name: string;
  character_maximum_length: number | null;
  numeric_precision: number | null;
  numeric_scale: number | null;
}

function tableConfigOf(value: unknown) {
  try {
    return getTableConfig(value as Parameters<typeof getTableConfig>[0]);
  } catch {
    return undefined;
  }
}

function drizzleTables(): Map<string, DrizzleColumn[]> {
  const modules = [identity, asset, contract, money, ops, documents, platform];
  const out = new Map<string, DrizzleColumn[]>();
  for (const mod of modules) {
    for (const value of Object.values(mod)) {
      const config = tableConfigOf(value);
      if (config === undefined) continue;
      const cols: DrizzleColumn[] = config.columns.map((c) => {
        const raw = (c as unknown as Record<string, unknown>).enumValues;
        return {
          name: c.name,
          notNull: c.notNull,
          sqlType: c.getSQLType(),
          enumValues: Array.isArray(raw) ? (raw as string[]) : null,
        };
      });
      assert(!out.has(config.name), `duplicate table ${config.name} in the Drizzle schema`);
      out.set(config.name, cols);
    }
  }
  return out;
}

// drizzle getSQLType() -> information_schema udt_name
const BASE_TYPE_MAP: Record<string, string> = {
  uuid: "uuid",
  text: "text",
  boolean: "bool",
  smallint: "int2",
  integer: "int4",
  bigint: "int8",
  date: "date",
  jsonb: "jsonb",
  inet: "inet",
  citext: "citext",
  "text[]": "_text",
  "timestamp with time zone": "timestamptz",
};

function splitType(sqlType: string): { base: string; params: string | null } {
  const m = sqlType.match(/^([\w ]+?)(\[\])?(?:\((.+)\))?$/);
  assert(m, `unparseable drizzle type ${sqlType}`);
  const base = (m[1] as string).trim() + ((m[2] as string | undefined) ?? "");
  return { base, params: (m[3] as string | undefined) ?? null };
}

test("drizzle tables match the migrated base tables exactly", async () => {
  const sql = postgres(DATABASE_URL, { prepare: false, max: 1 });
  try {
    const tableRows = (await sql`select table_name from information_schema.tables
      where table_schema = 'public' and table_type = 'BASE TABLE'`) as {
      table_name: string;
    }[];
    const dbTables = new Set(tableRows.map((r) => r.table_name));
    const tsTables = drizzleTables();
    assert.deepEqual(
      [...tsTables.keys()].sort(),
      [...dbTables].sort(),
      "Drizzle schema tables differ from the migrated tables",
    );

    const colRows = (await sql`select table_name, column_name, is_nullable, udt_name,
        character_maximum_length, numeric_precision, numeric_scale
      from information_schema.columns
      where table_schema = 'public'`) as (DbColumn & { table_name: string })[];
    const enumRows = (await sql`select t.typname as name, e.enumlabel as label
      from pg_type t
      join pg_enum e on e.enumtypid = t.oid
      join pg_namespace n on n.oid = t.typnamespace
      where n.nspname = 'public'
      order by 1, e.enumsortorder`) as { name: string; label: string }[];
    const dbEnums = new Map<string, string[]>();
    for (const r of enumRows) {
      const list = dbEnums.get(r.name) ?? [];
      list.push(r.label);
      dbEnums.set(r.name, list);
    }

    for (const [table, tsCols] of tsTables) {
      const dbCols = colRows.filter((r) => r.table_name === table);
      assert.deepEqual(
        tsCols.map((c) => c.name).sort(),
        dbCols.map((c) => c.column_name).sort(),
        `column mismatch on ${table}`,
      );
      for (const ts of tsCols) {
        const db = dbCols.find((c) => c.column_name === ts.name);
        assert(db, `column ${table}.${ts.name} missing in the database`);
        assert.equal(
          ts.notNull,
          db.is_nullable === "NO",
          `${table}.${ts.name}: nullability differs (drizzle notNull=${ts.notNull})`,
        );
        const { base, params } = splitType(ts.sqlType);
        const mapped = BASE_TYPE_MAP[base];
        if (mapped !== undefined) {
          assert.equal(
            db.udt_name,
            mapped,
            `${table}.${ts.name}: type ${ts.sqlType} !== ${db.udt_name}`,
          );
        } else if (base === "numeric") {
          assert.equal(db.udt_name, "numeric", `${table}.${ts.name} is not numeric`);
          assert(params !== null, `${table}.${ts.name}: numeric without precision/scale`);
          const [p, s] = params.split(",").map((x) => Number(x.trim()));
          assert.equal(db.numeric_precision, p, `${table}.${ts.name}: precision`);
          assert.equal(db.numeric_scale, s, `${table}.${ts.name}: scale`);
        } else if (base === "char") {
          assert.equal(db.udt_name, "bpchar", `${table}.${ts.name} is not bpchar`);
          assert.equal(db.character_maximum_length, Number(params), `${table}.${ts.name}: length`);
        } else {
          // Anything else must be a Postgres enum with identical labels in order.
          assert.equal(db.udt_name, base, `${table}.${ts.name}: enum ${base} !== ${db.udt_name}`);
          assert(ts.enumValues !== null, `${table}.${ts.name}: enum values unreadable`);
          assert.deepEqual(
            dbEnums.get(base),
            ts.enumValues,
            `${table}.${ts.name}: enum labels differ`,
          );
        }
      }
    }
  } finally {
    await sql.end();
  }
});
