#!/usr/bin/env node
// env-sync.mjs — compares packages/config/env-names.ts against the variable
// tables in docs/22-configuration-and-environments.md § 4.
// Fails when either side names a variable the other does not.
// No dependencies, single main().

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const DOC = "docs/22-configuration-and-environments.md";
const CODE = "packages/config/env-names.ts";

function parseDoc(file) {
  const lines = readFileSync(file, "utf8").split(/\r?\n/);
  const start = lines.findIndex((l) => /^## 4\. Variables/.test(l));
  const end = lines.findIndex((l, i) => i > start && /^## 5\./.test(l));
  if (start === -1) {
    return { error: `${file}: no "## 4. Variables" section` };
  }
  const stop = end === -1 ? lines.length : end;
  const names = new Map();
  let headerSeen = false;
  for (let i = start; i < stop; i++) {
    const line = lines[i];
    if (!line.trim().startsWith("|")) continue;
    const cells = line.split("|");
    const raw = cells[1] ?? "";
    const first = raw.replace(/`/g, "").trim();
    if (first === "Variable" || first === "Flag") {
      headerSeen = true;
      continue;
    }
    if (!headerSeen || /^:?-+:?$/.test(first) || first === "") continue;
    for (const m of raw.matchAll(/`([A-Z][A-Z0-9_]*)`/g)) {
      names.set(m[1], `${file}:${i + 1}`);
    }
  }
  return { names };
}

function parseCode(file) {
  const lines = readFileSync(file, "utf8").split(/\r?\n/);
  const names = new Map();
  let inEnv = false;
  for (let i = 0; i < lines.length; i++) {
    if (!inEnv) {
      if (/export const env = \{/.test(lines[i])) inEnv = true;
      continue;
    }
    if (/^\} as const;/.test(lines[i])) break;
    const m = /^\s*([A-Z][A-Z0-9_]*):/.exec(lines[i]);
    if (m) names.set(m[1], `${file}:${i + 1}`);
  }
  return { names };
}

function main() {
  const root = resolve(process.argv[2] ?? ".");
  const doc = parseDoc(resolve(root, DOC));
  if (doc.error) {
    console.error(`env-sync: ${doc.error}`);
    return 1;
  }
  const code = parseCode(resolve(root, CODE));

  const problems = [];
  for (const [name, at] of doc.names) {
    if (!code.names.has(name)) problems.push(`${at}  in docs, missing from ${CODE}`);
  }
  for (const [name, at] of code.names) {
    if (!doc.names.has(name)) problems.push(`${at}  in ${CODE}, missing from ${DOC} § 4`);
  }

  console.log(`env-sync: ${doc.names.size} names in ${DOC}, ${code.names.size} names in ${CODE}`);
  if (problems.length === 0) {
    console.log("env-sync: OK");
    return 0;
  }
  console.error(`env-sync: ${problems.length} mismatch(es)`);
  for (const p of problems) console.error(`  ${p}`);
  return 1;
}

process.exitCode = main();
