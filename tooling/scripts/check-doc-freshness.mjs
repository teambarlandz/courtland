#!/usr/bin/env node
// check-doc-freshness.mjs — fails when a listed path changes without the
// document that owns it, per docs/roadmap.md § "The rule about documentation".
// The map below is the mechanical form of that table. A change passes when
// the owning document is also in the diff, or already mentions the changed
// path (the docs describe the target state, so a pre-documented new file is
// already fresh). No dependencies, single main().

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// glob (** = any path) -> owning documents; at least one must co-change or
// already mention the changed path. The final rule covers "a new top-level
// directory must be documented in 02".
const MAP = [
  { glob: "supabase/migrations/**", anyOf: ["docs/05-database-schema.md"] },
  { glob: "packages/types/**", anyOf: ["docs/02-repository-structure.md"] },
  { glob: "apps/api/src/routes/**", anyOf: ["docs/08-api-design.md"] },
  { glob: "**/permissions/**", anyOf: ["docs/07-authorization-and-rls.md"] },
  { glob: "**/matrix.ts", anyOf: ["docs/07-authorization-and-rls.md"] },
  { glob: "**/jobs/**", anyOf: ["docs/11-scheduling-and-jobs.md"] },
  { glob: "render.yaml", anyOf: ["docs/11-scheduling-and-jobs.md"] },
  { glob: "**/templates/**", anyOf: ["docs/13-notifications.md", "docs/12-documents-and-pdfs.md"] },
  { glob: "**/money.ts", anyOf: ["docs/04-domain-model.md", "docs/10-payments-paystack.md"] },
  { glob: "**/env.ts", anyOf: ["docs/22-configuration-and-environments.md"] },
  { glob: "**/*", topLevelDirDoc: "docs/02-repository-structure.md" },
];

function git(args, cwd) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function toRegExp(glob) {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*\//g, "\u0000")
    .replace(/\*\*/g, ".*")
    .replace(/\u0000/g, "(?:.*/)?")
    .replace(/\*/g, "[^/]*");
  return new RegExp(`^${escaped}$`);
}

function docSatisfies(doc, changed, root, mention) {
  if (changed.includes(doc)) return true;
  const abs = resolve(root, doc);
  return existsSync(abs) && readFileSync(abs, "utf8").includes(mention);
}

function resolveBase(root) {
  if (process.env.BASE_SHA) return process.env.BASE_SHA;
  try {
    if (git(["rev-parse", "--verify", "--quiet", "origin/main"], root)) {
      return git(["merge-base", "HEAD", "origin/main"], root);
    }
  } catch {
    // no origin/main yet
  }
  try {
    return git(["rev-parse", "HEAD~1"], root);
  } catch {
    return null; // first commit — nothing to compare
  }
}

function main() {
  const root = resolve(process.argv[2] ?? ".");
  const base = resolveBase(root);
  if (!base) {
    console.log("check-doc-freshness: single-commit repository, nothing to diff");
    return 0;
  }

  const changed = git(["diff", "--name-only", "--diff-filter=ACMR", base, "HEAD"], root)
    .split("\n")
    .filter(Boolean);
  if (changed.length === 0) {
    console.log("check-doc-freshness: no changed files");
    return 0;
  }

  const topLevelAtBase = new Set(
    git(["ls-tree", "--name-only", base], root).split("\n").filter(Boolean),
  );

  const problems = [];
  for (const file of changed) {
    for (const rule of MAP) {
      if (!toRegExp(rule.glob).test(file)) continue;

      if (rule.topLevelDirDoc) {
        // Only a new top-level directory counts as "a directory changed".
        if (!file.includes("/")) break;
        const top = file.split("/")[0];
        if (top.startsWith(".") || top === "docs" || topLevelAtBase.has(top)) break;
        const mention = `${top}/`;
        if (docSatisfies(rule.topLevelDirDoc, changed, root, mention)) break;
        problems.push(
          `${file} is under new top-level directory ${top}/,` +
            ` but ${rule.topLevelDirDoc} does not mention ${mention} and did not change`,
        );
        break;
      }

      const mention = file.split("/").pop();
      const ok = rule.anyOf.some((doc) => docSatisfies(doc, changed, root, mention));
      if (ok) break;
      problems.push(
        `${file} changed without ${rule.anyOf.join(" or ")} in the same diff` +
          ` (nor does the doc mention ${JSON.stringify(mention)})`,
      );
      break;
    }
  }

  console.log(
    `check-doc-freshness: ${changed.length} changed file(s) against base ${base.slice(0, 8)}`,
  );
  if (problems.length === 0) {
    console.log("check-doc-freshness: OK");
    return 0;
  }
  console.error(`check-doc-freshness: ${problems.length} undocumented change(s)`);
  for (const p of problems) console.error(`  ${p}`);
  return 1;
}

process.exitCode = main();
