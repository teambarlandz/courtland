# tooling

One-shot, dependency-free Node ESM scripts. Each has a single `main()`, uses
only Node built-ins, and fails with a message that names the offending file and
line — the failure message is the deliverable. Run any of them with:

```bash
node tooling/scripts/<name>.mjs [root]   # root defaults to the repository root
```

## Scripts

| Script | Asserts | CI stage | Vacuous until |
|---|---|---|---|
| `check-links.mjs` | Every relative Markdown link and heading anchor resolves | `docs` | active now |
| `check-doc-freshness.mjs` | A path listed in the roadmap's doc table cannot change without its owning document in the same diff | `docs` | active now |
| `env-sync.mjs` | `packages/config/env-names.ts` and the tables in `docs/22 § 4` name exactly the same variables | `docs` | active now |
| `check-job-registration.mjs` | Every Inngest function declares a trigger; every cron names a registered job | `quality` | `apps/api/src/jobs/` exists |
| `check-template-usage.mjs` | Every template is referenced by code; every partial is included by a template | `quality` | template directories exist |
| `check-flag-usage.mjs` | Every flag key is read in at least two files (`docs/22 § 11`) | `quality` | flags are added in Phase 11 |
| `check-permission-parity.mjs` | `matrix.ts`, seeded `role_permissions`, and the admin UI map agree | `quality` | `packages/types/src/permissions/matrix.ts` exists |
| `check-media-transforms.mjs` | Every `TRANSFORMS` key appears at a `mediaUrl` call site | `quality` | `TRANSFORMS` exists (Phase 5) |
| `check-component-usage.mjs` | Every component with a story is imported by an app | `quality` | stories exist |
| `check-generated-drift.mjs` | The committed `docs/openapi/courtland.json` matches a fresh `gen:openapi` | `quality` | both OpenAPI files exist (Phase 6) |

## When CI runs them

`ci.yml` runs `check-links` and `check-doc-freshness` in the main verify job,
per `docs/roadmap.md § Phase 0 → Wiring`. The remaining scripts join the
`quality` job of `docs/23-ci-cd-and-deployment.md § 2` as their code lands;
until then they print a one-line note and exit 0, so wiring them early is free.

`env-sync.mjs` is also available locally as `pnpm check:env`, and is listed in
`23 § 2`'s quality job for when that job exists.

## Rules

1. No dependencies. Node built-ins only, so a failure never comes from a
   package upgrade.
2. One `main()` per script, `process.exitCode = main()` at the bottom.
3. A script that has nothing to check says so and exits 0 — it never invents
   a failure, and it never silently skips by accident (the note is the proof).
4. Failure messages name `file:line` first, because that is the whole point.
