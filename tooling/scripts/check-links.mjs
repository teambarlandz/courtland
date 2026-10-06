#!/usr/bin/env node
// check-links.mjs — resolves every relative Markdown link and heading anchor.
// Fails with file:line for each broken target. No dependencies, single main().

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const SKIP_DIRS = new Set(["node_modules", ".git", ".next", "dist", ".turbo", "coverage"]);

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(join(dir, entry.name), out);
    } else if (entry.name.endsWith(".md")) {
      out.push(join(dir, entry.name));
    }
  }
  return out;
}

function slug(text) {
  return text
    .replace(/`/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/\s/g, "-");
}

function collectAnchors(file) {
  const counts = new Map();
  const anchors = new Set();
  let inFence = false;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const heading = /^#{1,6}\s+(.*)$/.exec(line);
    if (!heading) continue;
    const base = slug(heading[1]);
    const seen = counts.get(base) ?? 0;
    counts.set(base, seen + 1);
    anchors.add(seen === 0 ? base : `${base}-${seen}`);
  }
  return anchors;
}

function main() {
  const root = resolve(process.argv[2] ?? ".");
  const files = walk(root);
  const anchorsByFile = new Map();
  for (const f of files) anchorsByFile.set(f, collectAnchors(f));

  const problems = [];
  let linkCount = 0;

  for (const f of files) {
    const relFile = relative(root, f);
    let inFence = false;
    const lines = readFileSync(f, "utf8").split(/\r?\n/);
    const targets = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/^\s*```/.test(line)) {
        inFence = !inFence;
        continue;
      }
      if (inFence) continue;
      for (const re of [/\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, /^\[[^\]]+\]:\s+(\S+)/g]) {
        let m;
        while ((m = re.exec(line))) targets.push({ line: i + 1, raw: m[1] });
      }
    }

    for (const { line, raw } of targets) {
      let target = raw;
      if (target.startsWith("<") && target.endsWith(">")) target = target.slice(1, -1);
      if (/^(https?:|mailto:|tel:|\/\/)/.test(target)) continue;

      if (target.startsWith("#")) {
        const anchor = slug(decodeURIComponent(target.slice(1)));
        if (!anchorsByFile.get(f)?.has(anchor)) {
          problems.push(`${relFile}:${line}  broken same-file anchor  ${target}`);
        }
        continue;
      }

      linkCount++;
      const hash = target.indexOf("#");
      const pathPart = hash === -1 ? target : target.slice(0, hash);
      const anchor = hash === -1 ? null : decodeURIComponent(target.slice(hash + 1));
      const abs = resolve(dirname(f), decodeURIComponent(pathPart));
      if (!existsSync(abs)) {
        problems.push(`${relFile}:${line}  missing file  ${target}`);
        continue;
      }
      if (anchor && abs.endsWith(".md")) {
        const anchors = anchorsByFile.get(abs);
        if (!anchors || !anchors.has(slug(anchor))) {
          problems.push(`${relFile}:${line}  missing anchor  ${target}`);
        }
      }
    }
  }

  console.log(`check-links: scanned ${files.length} files, ${linkCount} relative links`);
  if (problems.length === 0) {
    console.log("check-links: OK");
    return 0;
  }
  console.error(`check-links: ${problems.length} problem(s)`);
  for (const p of problems) console.error(`  ${p}`);
  return 1;
}

process.exitCode = main();
