#!/usr/bin/env node
// check-job-registration.mjs — asserts every Inngest function has a trigger and
// every cron names a function (docs/roadmap.md dead-code rule 2).
// Vacuous until apps/api/src/jobs/ exists: passes with a note.
// No dependencies, single main().

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const JOBS_DIR = "apps/api/src/jobs";

function main() {
  const root = resolve(process.argv[2] ?? ".");
  const jobsDir = join(root, JOBS_DIR);
  const indexPath = join(jobsDir, "index.ts");
  if (!existsSync(indexPath)) {
    console.log(`check-job-registration: ${JOBS_DIR}/index.ts not present yet — nothing to check`);
    return 0;
  }

  const problems = [];
  const indexText = readFileSync(indexPath, "utf8");

  // Every function registered in index.ts.
  const registered = new Set();
  for (const m of indexText.matchAll(/name:\s*["']([^"']+)["']/g)) registered.add(m[1]);
  for (const m of indexText.matchAll(/createFunction\s*\(\s*\{[^}]*?on:\s*["']([^"']+)["']/gs)) {
    registered.add(m[1]);
  }

  // Every function must declare a trigger: an `on:` event or a cron schedule.
  for (const file of readdirSync(jobsDir).filter((f) => f.endsWith(".ts"))) {
    const text = readFileSync(join(jobsDir, file), "utf8");
    const rel = `${JOBS_DIR}/${file}`;
    if (file === "crons.ts") continue; // crons are triggers themselves
    const lines = text.split(/\r?\n/);
    lines.forEach((line, i) => {
      if (!/createFunction\s*\(|export const \w+/.test(line)) return;
      const block = lines.slice(i, i + 30).join("\n");
      if (!/\bon:|crons:|schedule:/.test(block)) {
        problems.push(`${rel}:${i + 1}  function has no trigger (on: / crons: / schedule:)`);
      }
    });
  }

  // Every cron must name a registered function.
  const cronsPath = join(jobsDir, "crons.ts");
  if (existsSync(cronsPath)) {
    const crons = readFileSync(cronsPath, "utf8");
    const rel = `${JOBS_DIR}/crons.ts`;
    crons.split(/\r?\n/).forEach((line, i) => {
      const m = /\bjob:\s*["']([^"']+)["']/.exec(line);
      if (m && !registered.has(m[1])) {
        problems.push(`${rel}:${i + 1}  cron names job "${m[1]}", not registered in index.ts`);
      }
    });
  }

  if (!registered.size) {
    console.log(`check-job-registration: ${JOBS_DIR}/index.ts declares no jobs yet`);
    return 0;
  }
  if (problems.length === 0) {
    console.log(`check-job-registration: OK (${registered.size} registered)`);
    return 0;
  }
  console.error(`check-job-registration: ${problems.length} problem(s)`);
  for (const p of problems) console.error(`  ${p}`);
  return 1;
}

process.exitCode = main();
