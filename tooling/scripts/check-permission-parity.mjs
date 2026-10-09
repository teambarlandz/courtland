#!/usr/bin/env node
// check-permission-parity.mjs — asserts packages/types/src/permissions/matrix.ts,
// the seeded role_permissions rows, and the admin UI permission map agree
// (docs/roadmap.md dead-code rule 4).
// Vacuous until matrix.ts exists: passes with a note.
// No dependencies, single main().

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const MATRIX = "packages/types/src/permissions/matrix.ts";
const MIGRATIONS = "supabase/migrations";

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

function slugs(text) {
  return new Set([...text.matchAll(/["']([a-z][a-z0-9]*(?:_[a-z0-9]+)+)["']/g)].map((m) => m[1]));
}

function main() {
  const root = resolve(process.argv[2] ?? ".");
  const matrixPath = join(root, MATRIX);
  if (!existsSync(matrixPath)) {
    console.log(`check-permission-parity: ${MATRIX} not present yet — nothing to check`);
    return 0;
  }

  const problems = [];
  const matrixSlugs = slugs(readFileSync(matrixPath, "utf8"));

  // role_permissions seeds: quoted slugs in the VALUES of migrations that INSERT
  // into the table. Files that merely query it (has_permission) or name it in
  // comments carry enum literals and prose that are not permissions, so a
  // "mentions the table" filter over-matches and fails on valid trees.
  const seeded = new Map();
  for (const file of walk(join(root, MIGRATIONS))) {
    const text = readFileSync(file, "utf8");
    if (!/insert\s+into\s+(public\.)?role_permissions[\s(]/i.test(text)) continue;
    for (const s of slugs(text)) seeded.set(s, relative(root, file));
  }
  for (const s of matrixSlugs) {
    if (!seeded.has(s)) problems.push(`${MATRIX}  permission "${s}" has no role_permissions row`);
  }
  for (const [s, at] of seeded) {
    if (!matrixSlugs.has(s))
      problems.push(`${at}  role_permissions row "${s}" is not in matrix.ts`);
  }

  // Admin UI map: any permission map module under apps/admin.
  const adminMap = walk(join(root, "apps/admin")).find(
    (f) => /permission/i.test(f) && /\.tsx?$/.test(f),
  );
  if (adminMap) {
    const uiSlugs = slugs(readFileSync(adminMap, "utf8"));
    for (const s of matrixSlugs) {
      if (!uiSlugs.has(s)) {
        problems.push(`${relative(root, adminMap)}  admin UI map is missing "${s}"`);
      }
    }
  }

  if (problems.length === 0) {
    console.log(`check-permission-parity: OK (${matrixSlugs.size} permissions)`);
    return 0;
  }
  console.error(`check-permission-parity: ${problems.length} mismatch(es)`);
  for (const p of problems) console.error(`  ${p}`);
  return 1;
}

process.exitCode = main();
