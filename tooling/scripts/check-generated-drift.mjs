#!/usr/bin/env node
// check-generated-drift.mjs — asserts the committed OpenAPI document matches
// what apps/api/src/openapi.ts builds (docs/08-api-design.md § 12).
// Regenerates via `pnpm --filter @courtland/api gen:openapi` and fails if the
// committed file changed. Vacuous until both sides exist.
// No dependencies, single main().

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

const SOURCE = "apps/api/src/openapi.ts";
const DOCUMENT = "docs/openapi/courtland.json";

function main() {
  const root = resolve(process.argv[2] ?? ".");
  if (!existsSync(join(root, SOURCE)) || !existsSync(join(root, DOCUMENT))) {
    console.log(
      `check-generated-drift: ${SOURCE} / ${DOCUMENT} not both present yet — nothing to check`,
    );
    return 0;
  }

  try {
    execFileSync("pnpm", ["--filter", "@courtland/api", "gen:openapi"], {
      cwd: root,
      stdio: "pipe",
      encoding: "utf8",
      shell: process.platform === "win32",
    });
  } catch (error) {
    console.error(`check-generated-drift: gen:openapi failed`);
    console.error(error.stdout ?? error.message);
    return 1;
  }

  const drift = execFileSync("git", ["diff", "--name-only", "--", DOCUMENT], {
    cwd: root,
    encoding: "utf8",
  }).trim();
  if (drift) {
    console.error(`check-generated-drift: ${DOCUMENT} differs from a fresh generation:`);
    console.error(execFileSync("git", ["diff", "--", DOCUMENT], { cwd: root, encoding: "utf8" }));
    return 1;
  }
  console.log(`check-generated-drift: OK (${DOCUMENT} is current)`);
  return 0;
}

process.exitCode = main();
