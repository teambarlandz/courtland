#!/usr/bin/env node
// check-flag-usage.mjs — asserts every flag key in packages/config/flags.ts is
// read in at least two files (docs/22 § 11: "No flag read in fewer than two
// places"). Enforced from Phase 11 onward; vacuous before that.
// No dependencies, single main().

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const FLAGS_FILE = "packages/config/flags.ts";
const SKIP_DIRS = new Set(["node_modules", ".git", ".next", "dist", ".turbo", "coverage"]);

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(join(dir, entry.name), out);
    } else if (/\.(ts|tsx|mjs)$/.test(entry.name)) {
      out.push(join(dir, entry.name));
    }
  }
  return out;
}

function main() {
  const root = resolve(process.argv[2] ?? ".");
  const flagsPath = join(root, FLAGS_FILE);
  if (!existsSync(flagsPath)) {
    console.log(`check-flag-usage: ${FLAGS_FILE} missing — nothing to check`);
    return 0;
  }

  // Strip comments first so documented examples are not parsed as flags.
  const flagsText = readFileSync(flagsPath, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  if (!/export const flags\s*=/.test(flagsText)) {
    console.log("check-flag-usage: no flags defined yet (flags.ts holds only FlagKey) — OK");
    return 0;
  }

  const block = /export const flags\s*=\s*\{([\s\S]*?)\}\s*as const/.exec(flagsText);
  const keys = [...(block?.[1] ?? "").matchAll(/^\s*([a-z][a-z0-9_]*):/gm)].map((m) => m[1]);
  if (keys.length === 0) {
    console.log("check-flag-usage: flags object is empty — OK");
    return 0;
  }

  const files = walk(root).filter(
    (f) => !relative(root, f).replace(/\\/g, "/").endsWith(FLAGS_FILE),
  );
  const problems = [];
  for (const key of keys) {
    const readers = files.filter((f) => readFileSync(f, "utf8").includes(`"${key}"`));
    if (readers.length < 2) {
      const where = readers.length === 1 ? relative(root, readers[0]) : "(none)";
      problems.push(
        `flag "${key}" is read in ${readers.length} file(s) < 2 — ${where}` + ` (${FLAGS_FILE})`,
      );
    }
  }

  if (problems.length === 0) {
    console.log(`check-flag-usage: OK (${keys.length} flag(s), each read in >= 2 files)`);
    return 0;
  }
  console.error(`check-flag-usage: ${problems.length} flag(s) without readers`);
  for (const p of problems) console.error(`  ${p}`);
  return 1;
}

process.exitCode = main();
