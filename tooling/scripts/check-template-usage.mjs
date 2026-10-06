#!/usr/bin/env node
// check-template-usage.mjs — asserts every notification and PDF template is
// referenced by code, and every partial is included by some template
// (docs/roadmap.md dead-code rule 3).
// Vacuous until template directories exist: passes with a note.
// No dependencies, single main().

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";

const TEMPLATE_DIRS = ["packages/emails/src/templates", "packages/pdf/templates"];
const CODE_DIRS = ["apps", "packages"];

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

function main() {
  const root = resolve(process.argv[2] ?? ".");
  const templateDirs = TEMPLATE_DIRS.filter((d) => existsSync(join(root, d)));
  if (templateDirs.length === 0) {
    console.log("check-template-usage: no template directories yet — nothing to check");
    return 0;
  }

  const problems = [];
  const codeFiles = [];
  for (const dir of CODE_DIRS) {
    for (const f of walk(join(root, dir))) {
      if (/\.(ts|tsx)$/.test(f)) codeFiles.push(readFileSync(f, "utf8"));
    }
  }

  for (const dir of templateDirs) {
    const abs = join(root, dir);
    const templates = walk(abs).filter((f) =>
      [".handlebars", ".hbs", ".html"].includes(extname(f)),
    );
    for (const tpl of templates) {
      const rel = relative(root, tpl);
      const stem = tpl
        .split(/[\\/]/)
        .pop()
        .replace(/\.(handlebars|hbs|html)$/, "");
      const isPartial = tpl.replace(/\\/g, "/").includes("/partials/");
      if (isPartial) {
        const included = templates.some(
          (other) =>
            other !== tpl && new RegExp(`\\{\\{>\\s*${stem}\\b`).test(readFileSync(other, "utf8")),
        );
        if (!included) problems.push(`${rel}  partial is not included by any template`);
        continue;
      }
      const referenced = codeFiles.some((text) => text.includes(stem));
      if (!referenced) problems.push(`${rel}  template name "${stem}" appears in no code file`);
    }
  }

  if (problems.length === 0) {
    console.log("check-template-usage: OK");
    return 0;
  }
  console.error(`check-template-usage: ${problems.length} orphaned template(s)`);
  for (const p of problems) console.error(`  ${p}`);
  return 1;
}

process.exitCode = main();
