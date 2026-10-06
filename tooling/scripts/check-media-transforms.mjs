#!/usr/bin/env node
// check-media-transforms.mjs — asserts every TRANSFORMS key is used at a
// mediaUrl call site (docs/14-media-and-storage.md § dead-code table).
// Vacuous until TRANSFORMS exists: passes with a note.
// No dependencies, single main().

import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const SKIP_DIRS = new Set(["node_modules", ".git", ".next", "dist", ".turbo", "coverage"]);

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(join(dir, entry.name), out);
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      out.push(join(dir, entry.name));
    }
  }
  return out;
}

function main() {
  const root = resolve(process.argv[2] ?? ".");
  const files = walk(root);
  const defining = files.find((f) => /export const TRANSFORMS\s*=/.test(readFileSync(f, "utf8")));
  if (!defining) {
    console.log("check-media-transforms: no TRANSFORMS record yet — nothing to check");
    return 0;
  }

  const text = readFileSync(defining, "utf8");
  const block = /export const TRANSFORMS\s*=\s*\{([\s\S]*?)\n\}/.exec(text);
  const keys = [...(block?.[1] ?? "").matchAll(/^\s*([a-z][a-zA-Z0-9_]*):/gm)].map((m) => m[1]);

  const problems = [];
  for (const key of keys) {
    const used = files.some(
      (f) =>
        f !== defining && new RegExp(`["']${key}["']|\\.${key}\\b`).test(readFileSync(f, "utf8")),
    );
    if (!used) problems.push(`${relative(root, defining)}  TRANSFORMS.${key} is never used`);
  }

  if (problems.length === 0) {
    console.log(`check-media-transforms: OK (${keys.length} transforms, all used)`);
    return 0;
  }
  console.error(`check-media-transforms: ${problems.length} unused transform(s)`);
  for (const p of problems) console.error(`  ${p}`);
  return 1;
}

process.exitCode = main();
