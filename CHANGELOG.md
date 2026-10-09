# Changelog

> **What this file is.** The roadmap (`docs/roadmap.md`) is the *plan*: what each phase should
> contain. This file is the *record*: what was actually built, where reality forced a deviation
> from the plan, why, and the evidence that it works. A developer reading the docs should be
> able to see everywhere the roadmap said "A" but the repository does "C", and why.
>
> **Rule: append-only.** After each phase, add a new dated section at the end. Never edit an
> existing section — if a later phase changes an earlier decision, say so in the new section.
> (`TODO.md` is the opposite: a gitignored scratch tracker for the *current* milestone. This
> file is committed and permanent.)

---

## Phase 0 — Foundation — 2026-10-08 (commit `18809bd`)

**Roadmap said:** monorepo scaffolding, config package, tooling gates, CI; deliberate mistakes
(broken link, unused file) wired to fail; exit criteria around install/typecheck/lint/test/build,
knip with `packages/config` as the only workspace, and the two dead-code gates.

**Did:** exactly that — 31 files, 1926 insertions. Verified again on 2026-10-09 (before starting
Phase 2): every file listed in `docs/roadmap.md` § Phase 0 exists; `pnpm -r
typecheck/lint/test/build` green; `pnpm knip` exit 0; `check:links`,
`check:freshness`, `env-sync` (51 names in docs ↔ 51 in `env-names.ts`) green; the six
future-phase scripts exit cleanly with "not present yet"; `deploy.yml` gates on CI success.
Re-demonstrated both deliberate mistakes (broken link fails `check-links`, unused file in
`packages/config` fails `knip`) and removed the probes. No deviations.

---

## Phase 1 — Data foundation — 2026-10-09 (commits `db04c3b`, `0aa279f`)

**Roadmap said:** 24 migrations, seed, 9 pgTAP files, `packages/db`, `apps/api/bin/migrate.ts`,
`apps/api/test/setup/pg.ts`, RLS from doc 07, Drizzle schema verified against
`information_schema`, six exit criteria, two dead-code gates.

**Did:** all of it, plus the fixes below. `supabase test db`: **10 files, 283 tests, PASS**
(`identity_rls` 34, `asset_rls` 41, `contract_rls` 23, `money_rls` 36, `ops_rls` 31,
`documents_rls` 22, `platform_rls` 27, `invariants` 37, `functions` 31, `_setup` 1; every
`plan(N)` matches its assertion count).

### Deviations from the plan, with reasons

| # | Roadmap/docs said | Repository does | Why |
|---|---|---|---|
| 1 | Default Supabase ports (54321/54322/…) | `config.toml` uses 55xxx (db **55432**) | Windows Hyper-V excluded ranges (50000–50059, 53959–54558) make the defaults unbindable. Local-only; `docs/01` and `docs/22` updated, CI maps `55432:5432` to match. |
| 2 | `properties_update_staff` WITH CHECK `true` (docs 07) | `private.has_permission('property_update_any')` | `true` combined with the owner's USING policy to let owners publish their own drafts (Postgres checks USING of one policy with WITH CHECK of another). Same hardening for `profiles_update_staff`. |
| 3 | `allocate_pro_rata` as written in docs 05 §12.3 | Rewritten (floor + largest-remainder, explicit ordinality); docs synced | Doc version called nonexistent `array_sum`/`sum(weights)` and had an ambiguous `i`. The old body could not run at all. |
| 4 | `compute_allocations` union branches as written | Leading literals cast to `::allocation_basis`/`::beneficiary_type`; docs synced | Uncast text literals made the installment/deposit/agreement/penalty/else branches throw at runtime (found by calling them, not by reading). |
| 5 | `touch_updated_at` on 22 tables incl. `ledger_allocations` etc. | List trimmed to tables that have `updated_at` | `property_media`, `contract_parties`, `ledger_allocations`, `ticket_updates` have no such column; any UPDATE raised `42703`. Doc's own table definitions confirm. |
| 6 | Test expectations as first written | Several corrected (see evidence) | `published_at` at insert; no `payer` in `party_role`; ticket titles ≥ 4 chars; `user_roles` needs `on conflict do nothing`; `results_eq` flat arrays only work single-column; `misc` is not a `payment_kind` (`refund` used); installment/outright/penalty numbers corrected to actuals. |
| 7 | Drizzle schema mirrors migrations | It does — with documented modelling rules | No `.references()` in schema files (keeps the 7 modules cycle-free; structure lives in `relations.ts`); FKs to `auth.users` are plain `uuid` (GoTrue owns that table); `citext` via custom type; `bigint({mode:"number"})`; `numeric` default (string) mode. |
| 8 | `role_permissions` 99 rows from `matrix.ts` (Phase 2 file) | 100 committed rows; `matrix.ts` does not exist yet | Pre-existing from the migration session; `check-permission-parity` skips cleanly until Phase 2. 56 distinct permissions verified: all 29 policy slugs present, all 51 `has_permission()` calls literal. |
| 9 | 3 views in the roadmap table | DB has 4 (`owner_balances` extra) + `refund_allocations` table | Pre-existing; recorded, not removed (removing shipped schema is riskier than documenting it). |

### Exit-criteria evidence

- `supabase db reset` from empty: succeeds (one transient storage-healthcheck failure and one 15-min hang at "Initialising schema" seen; recovered via stop/start).
- Double reset → identical schema hash (SHA256 `C730F2F9…`; only pg_dump `\restrict` session tokens differ).
- Parity test `packages/db/test/schema-parity/test.ts` passes (35 tables both directions: names, nullability, types, numeric precision/scale, enum labels in order).
- `pnpm -r typecheck/lint/test/build`, `check:links`, `check:freshness`, `pnpm knip` (exit 0): green.
- `pnpm knip` note: red while `packages/db`/`apps/api` had no consumers; resolved with `knip.json` entries (bin, test/setup, drizzle) — no rules weakened, no fake consumers.

---

## Phase 1 follow-up — CI `test-db` job — 2026-10-09 (commit `228bc43`)

**Symptom:** GitHub Actions `verify` failed with `connect ECONNREFUSED 127.0.0.1:55432` — the
schema-parity test ran with no database.

**What was proposed elsewhere:** add a bare `postgres:latest` service. **Rejected after testing:**
bare Postgres has no `auth.users` (our FKs fail), no extensions schema, no `auth.uid()`, and no
migrations — the test would fail differently, not pass.

**Did (following the existing design in `docs/23 §2`):** new `test-db` job with the
`supabase/postgres` image (ships the `auth` schema), `migrate:local`, `test:pg`; `verify` drops
`pnpm -r test`. Proved end-to-end against the pinned image before committing. Forced three
further fixes, each verified, none weakening verification:

| # | Problem found by running | Fix |
|---|---|---|
| 1 | Base image lacks `auth.jwt()` (has `auth.users`, `auth.uid()`); creating it needs a superuser the migrate role doesn't have | `current_user_roles()` reads `request.jwt.claims` inline (behavior-identical; pgTAP re-run 283/283 green) |
| 2 | `extensions` schema assumed from CLI setup | Migration creates it `if not exists` (no-op on a full stack) |
| 3 | Parity test flagged `public.migration_history` | Excluded with a documented reason (runner bookkeeping, not app schema) |

**Deviations:** `docs/23` snippet was stale (`supabase/postgres:15.1.1` does not exist; 54322 is the
generic default) — implemented with pinned `public.ecr.aws/supabase/postgres:15.19.0.004` and
`55432:5432`, doc updated. `migrate:local` requires a FRESH database by design (fails loudly
otherwise). pgTAP-in-CI deferred (needs the `pgtap` extension on the service DB). Result: CI
green on both jobs (confirmed by the developer).

---

## Phase 2 — Contracts and types — 2026-10-09

**Roadmap said:** `packages/types` (Zod) + `packages/utils` (pure functions) + `apps/api`
`openapi.ts`/`env.ts` + committed `docs/openapi/courtland.json`; table-driven tests, lifecycle
test, fast-check properties (1000 runs); five exit criteria, two dead-code gates.

**Did:** all of it. Tests: types 13 files × 78, utils 8 files × 45 (incl. the 1000-run
`splitAnnualRent`/`allocateProRata` properties), api 2 files × 7. OpenAPI: 112 endpoints
transcribed from the §10 catalogue (count verified against the spec: 9+22+14+18+9+6+8+18+8),
build throws on any entry missing request/response. `pnpm -r typecheck/lint/test/build`,
`check:links`, `check:freshness`, `pnpm knip`, `check:permissions`, `check:drift` green.

### Deviations from the plan, with reasons

| # | Roadmap/docs said | Repository does | Why |
|---|---|---|---|
| 1 | Seed prose: 99 grants; `matrix.ts` holds "99 grants" | `matrix.ts` holds the committed **100** (56/22/12/10); docs/07 prose undercounts by one (`admin`+`payment_create_own`) | Matrix must reconcile with the seed migration, not the prose — the parity script compares against seed rows. |
| 2 | `check-permission-parity` scans files "touching" the table | Scans only files that INSERT into it | The old filter matched `functions.sql`/`identity.sql` enum literals and comments (`phone_only`, `courtland_roles`, …) and failed on a valid tree. Intent (seeded rows) unchanged. |
| 3 | OpenAPI "via zod-openapi" (docs/08 §12) | Built with `z.toJSONSchema` (zod v4 builtin), hand-rolled paths/parameters | No extra dependency; OpenAPI 3.1 is JSON Schema 2020-12, which is what the builtin emits. Deterministic output for the drift gate. |
| 4 | Reference prefixes in docs/04 §6, docs/02 (`LSE-`, `SAL-`, `PMT-`, …) | `formatReference` uses the SQL truth (`OWN-`/`PRT-`/`CLT-`/`ALC-`/`PAY-`/`MNT-`/`DSP-`/`DOC-`, payouts `PO-YYYY-MM-####` app-generated) | The doc lists are stale vs the `set_reference` trigger + seed sequences (found during research). |
| 5 | Tests at `packages/utils/src/*/test.ts` (+ one types example path) | Types tests at `src/<area>/test.ts`, utils at `src/<module>/test.ts`, api at `test/<area>/test.ts` | Consistent per-area layout in all three packages; `vitest.config.ts` include patterns added per package (no config file was listed — needed to run them). |
| 6 | `KoboAmount` for all money | Intent/ledger amounts require `> 0` | DB `CHECK (amount_kobo > 0)`; zero-able fields keep `KoboAmount` (min 0). Caught by a failing test, fixed in the schema. |
| 7 | `AppRole` in permissions/roles | Re-exported from common/enums | Duplicate definition collided on `export *`; single canonical definition. |
| 8 | `check-generated-drift` + `gen:openapi` | Implemented exactly as the (previously vacuous) script expects | Script now activates and passes; first run proved the committed JSON is byte-identical to a fresh generation. |

### Phase 2 follow-up — 2026-10-09 (commits `ba31564`, `fedb91a`)

Two small pushes after the phase commit, no plan changes:

- `ba31564`: `check:freshness` failed on the new `packages/types/tsconfig.json` /
  `vitest.config.ts` — the `packages/types/**` rule requires docs/02 to name them. Fixed by
  documenting the package roots in docs/02 §5.2 (honest fix, not a gate tweak).
- `fedb91a`: CI `verify` failed on biome import order in `apps/api/test/env/test.ts`
  (`import type` sorts first). Root cause was process, not tooling: the import was added after
  the last local lint run. Fixed with `biome check --write`; rule going forward is a full gate
  pass after the final edit, immediately before staging.
