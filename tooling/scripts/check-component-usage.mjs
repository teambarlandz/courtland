#!/usr/bin/env node
// check-component-usage.mjs — asserts every component with a story is imported
// by an app (docs/roadmap.md dead-code rule 4).
// Vacuous until stories exist: passes with a note.
// No dependencies, single main().

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";

const APP_DIRS = ["apps/web", "apps/admin"];
const SKIP_DIRS = new Set(["node_modules", ".git", ".next", "dist", ".turbo", "coverage"]);

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(p, out);
    } else out.push(p);
  }
  return out;
}

function main() {
  const root = resolve(process.argv[2] ?? ".");
  const stories = walk(root).filter((f) => /\.stories\.tsx?$/.test(f));
  if (stories.length === 0) {
    console.log("check-component-usage: no stories yet — nothing to check");
    return 0;
  }

  const appFiles = [];
  for (const dir of APP_DIRS) {
    for (const f of walk(join(root, dir))) if (/\.(ts|tsx)$/.test(f)) appFiles.push(f);
  }

  const problems = [];
  for (const story of stories) {
    const component = basename(story).replace(/\.stories\.tsx?$/, "");
    const imported = appFiles.some((f) =>
      new RegExp(`import[^;]*\\b${component}\\b`).test(readFileSync(f, "utf8")),
    );
    if (!imported) {
      problems.push(`${relative(root, story)}  component "${component}" is imported by no app`);
    }
  }

  if (problems.length === 0) {
    console.log(`check-component-usage: OK (${stories.length} stories, all used)`);
    return 0;
  }
  console.error(`check-component-usage: ${problems.length} unused component(s)`);
  for (const p of problems) console.error(`  ${p}`);
  return 1;
}

process.exitCode = main();
