# 23 — CI/CD and deployment

One pipeline, one button. Merging to `main` deploys; nothing else does.
## 1. Pipeline stages

```
PR opened
  │
  ├─ verify        lint, types, format        (40 s)
  ├─ test-unit     vitest                     (30 s)
  ├─ test-db       pgTAP on a local Supabase  (60 s)
  ├─ test-integ    integration with Postgres  (90 s)
  ├─ test-e2e      Playwright                 (180 s)
  ├─ build         turbo build + typecheck    (120 s)
  ├─ quality       knip, depcheck, duplicates (60 s)
  ├─ security      audit, gitleaks, secrets   (60 s)
  ├─ docs          link check, drift, coverage (30 s)
  └─ perf          lighthouse, size-limit     (90 s)

All required. Any failure blocks the merge.

Merge to main
  │
  ├─ migrate-staging      apply migrations to the staging Supabase
  ├─ deploy-staging       API, worker, web, admin
  ├─ smoke                health checks and a synthetic payment
  └─ manual approval      on the environment

Manual approval
  │
  ├─ migrate-prod         apply migrations to the production Supabase
  ├─ deploy-api           Render, rolling
  ├─ deploy-worker        Render, rolling
  ├─ deploy-web           Vercel, alias swap
  ├─ deploy-admin         Vercel, alias swap
  ├─ smoke-prod           health checks and a synthetic payment
  └─ verify               15 minutes of error-rate monitoring
```

## 2. GitHub Actions

```yaml
# .github/workflows/ci.yml
name: CI
on:
  pull_request:
  push:
    branches: [main]

concurrency:
  group: ci-${{ github/ref }}
  cancel-in-progress: true

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm turbo verify --filter=...[origin/main]
      - run: pnpm lint
      - run: pnpm typecheck

  test-db:
    runs-on: ubuntu-latest
    services:
      supabase:
        image: public.ecr.aws/supabase/postgres:15.19.0.004
        env:
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: postgres
        ports: ['55432:5432']
        options: >-
          --health-cmd "pg_isready -U postgres"
          --health-interval 10s --health-timeout 5s --health-retries 10
    env:
      DATABASE_URL: postgresql://postgres:postgres@127.0.0.1:55432/postgres
    steps:
      - uses: actions/checkout@v4
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @courtland/db migrate:local
      - run: pnpm --filter @courtland/db test:pg

  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: pnpm install --frozen-lockfile
      - run: pnpm knip --production --strict     # no unused files, exports, dependencies
      - run: pnpm depcheck
      - run: pnpm jscpd --min-tokens 100 --threshold 5
      - run: pnpm --filter @courtland/api verify:resources
      - run: node tooling/scripts/check-job-registration.mjs
      - run: node tooling/scripts/env-sync.mjs
      - run: node tooling/scripts/check-generated-drift.mjs
```

### 2.1 Caching

| Cached | Key | Why |
|---|---|---|
| pnpm store | `pnpm-lock.yaml` | Dependency download dominates install time |
| Playwright browsers | Fixed | ~800 MB, slower to download than to reuse |
| Turborepo outputs | `turbo.json` hash | Rebuild only what changed |
| Next build cache | Vercel | Handled by Vercel |

The Supabase service image is pinned to a version/ `supabase/postgres:latest` in CI means a base image
change breaks the pipeline on someone else's release day.
## 3. Migrations

### 3.1 Rules

| Rule | Reason |
|---|---|
| Forward-only in production | A reverse migration that drops data cannot be tested |
| Each migration is a file with a timestamp prefix | Ordering is explicit |
| Every migration has a `-- Down:` comment | Documented reversal, even if not applied automatically |
| One logical change per migration | A migration that does two things cannot be diagnosed |
| RLS policies ship in the same migration as the table | A window where a table exists without policies is a window with no protection |
| No `DROP COLUMN` in the same deploy that stops using it | Deploy the code change first, then the column removal, at least one release later |
| Triggers and functions ship with their table | Same reasoning |
| Indexes that lock get `concurrently` | A migration must not take a table's write lock in production |

### 3.2 A migration

```sql
-- supabase/migrations/20260211090000_add_property_cover_photo.sql
-- Adds a cover photo reference to properties.
begin;

alter table public.properties
  add column cover_photo_id uuid references public.property_media (id) on delete set null;

create index properties_cover_photo_idx on public.properties (cover_photo_id)
  where cover_photo_id is not null;

comment on column public.properties/cover_photo_id is
  'The media row used as the listing cover. Exactly one per property is flagged is_cover/';

-- Down: drop the index, then the column. The property_media rows are unaffected.

commit;
```

### 3.3 Applying them

| Environment | How |
|---|---|
| Local | `supabase db reset` on every change |
| CI | `pnpm --filter @courtland/db migrate:local` then pgTAP |
| Staging | CI, on merge |
| Production | `pnpm --filter @courtland/db migrate:prod`, a CI step with the production credentials, before the code deploy |

Migrations run **before** the code that needs them, and the code is written to work with both the old and
the new schema where that is possible. An additive migration followed by code that uses the new column
needs no coordination, because the column exists before the code that reads it.
A migration that removes something waits a release.
## 4. Vercel

### 4.1 Projects

| Project | Branch | URL |
|---|---|---|
| `courtland-web` | `main` | `courtland.com.ng` |
| `courtland-web` | PR | `courtland-web-git-<branch>-<team>.vercel.app` |
| `courtland-admin` | `main` | `admin.courtland.com.ng` |
| `courtland-admin` | PR | `courtland-admin-git-<branch>-<team>.vercel.app` |

| Setting | Web | Admin |
|---|---|---|
| Framework | Next.js, auto-detected | Vite, build command `pnpm build`, output `dist` |
| Install | `pnpm install --frozen-lockfile` | Same |
| Build | `pnpm --filter @courtland/web build` | `pnpm --filter @courtland/admin build` |
| Node | 24 | 24 |
| Regions | `cdg1` (Cape Town) | `cdg1` |
| Functions region | `cdg1` | — |

**Cape Town, not Washington.** Courtland's users are in Lagos. Vercel's region determines where the server
runs, and a user in Lagos reaching a server in Virginia has ~120 ms of latency on every request before any
work happens. Cape Town is ~20 ms. On a mobile network, that is the difference between a page that feels
instant and one that feels broken.
### 4.2 Environment variables in Vercel

| Prefix | Visibility |
|---|---|
| `NEXT_PUBLIC_*` | Build and runtime, client-visible |
| Everything else | Build and runtime, server-only |

Vercel environment variables are set per environment, not per branch, so a PR preview gets staging values.
There is no fourth environment, which means a preview can never reach production data. That is a feature.

### 4.3 Alias swap

Vercel builds to an immutable deployment and then moves the domain's alias. There is no window where the
site is half-deployed. A build failure leaves the previous deployment live, and the domain is untouched.
## 5. Render

### 5.1 Services

| Service | Type | Start command | Scaling |
|---|---|---|---|
| `courtland-api` | Web | `node apps/api/dist/server.js` | 2 instances, `min 2 / max 4` |
| `courtland-worker` | Worker | `node apps/api/dist/worker.js` | 1 instance |
| `courtland-cron` | Cron, `* * * * *` | `node apps/api/dist/cron.js` | Invoked once a minute, exits |

Three processes, three responsibilities, and the third one does no work: it decides which jobs are due for this
minute from `apps/api/src/jobs/crons.ts` and asks the API to enqueue them. Inngest owns the timing of the actual
job; Render only owns the arrival of the tick. See [ADR 0009](./adr/0009-inngest-for-jobs.md) and
[`11 § 5`](./11-scheduling-and-jobs.md#5-crons).

### 5.2 Health checks

| Endpoint | Used by | Checks |
|---|---|---|
| `/health` | Render liveness | Process is up. Nothing else |
| `/health/ready` | Load balancer | Database reachable, reports queue depth |

`/health` deliberately does not touch the database, so a slow database does not cause Render to restart an
instance that would have recovered.

### 5.3 Zero-downtime deploys

Render does a rolling deploy: a new instance starts, passes its health check, receives traffic, and the old
instance drains. With two instances, there is no window with zero capacity.

The worker is a single instance with a deliberate rolling restart. An in-flight Inngest step that is
interrupted is retried by Inngest, and the steps are idempotent, so a restart is safe.
### 5.4 `render.yaml`

```yaml
# No `databases:` block. Postgres is Supabase-hosted, chosen in ADR 0015, and a Render database here
# would be a second source of truth that nothing reads from and nothing backs up differently.
services:
  - type: web
    name: courtland-api
    plan: starter
    region: oregon
    numInstances: 2
    runtime: node
    buildCommand: pnpm install --frozen-lockfile && pnpm --filter @courtland/api build
    startCommand: node apps/api/dist/server.js
    healthCheckPath: /health
    autoDeploy: false
    envVars:
      - key: NODE_VERSION
        value: 24
      - key: TZ
        value: Africa/Lagos
      - key: SUPABASE_URL
        sync: false
      - key: DATABASE_URL
        sync: false        # Supavisor, transaction mode. Not a Render database URL.
      # … every secret, sync: false

  - type: worker
    name: courtland-worker
    plan: starter
    region: oregon
    runtime: node
    buildCommand: pnpm install --frozen-lockfile && pnpm --filter @courtland/api build
    startCommand: node apps/api/dist/worker.js
    autoDeploy: false
    envVars:
      - key: INNGEST_EVENT_KEY
        sync: false
      - key: INNGEST_SIGNING_KEY
        sync: false
      # …

  - type: cron
    name: courtland-cron
    plan: starter
    region: oregon
    runtime: node
    schedule: "* * * * *"
    buildCommand: pnpm install --frozen-lockfile && pnpm --filter @courtland/api build
    startCommand: node apps/api/dist/cron.js
    autoDeploy: false
    envVars:
      - key: INTERNAL_JOB_TOKEN
        sync: false
      - key: APP_URL
        sync: false        # the cron calls the API's own /v1/internal/jobs/{name}/enqueue endpoint
      # …
```

Three things in that file are load-bearing and easy to get wrong:

- **No `databases:` block.** The database is Supabase's, per ADR 0015. `DATABASE_URL` points at Supavisor,
  and if it ever points at Render the schema, the backups and the RLS story silently become two systems.
- **`type: cron` with `schedule: "* * * * *"`,** not `type: worker`. A Render cron service is invoked once per
  matching minute and exits; it is not an always-on process. Typing it as `worker` would give an always-on
  process that also runs on a schedule, which is the ambiguity this file exists to remove.
- **`dist/cron.js` enqueues and exits.** It imports `apps/api/src/jobs/crons.ts` — the same definitions the
  job catalogue documents — works out which jobs are due for this Lagos minute, and calls
  `POST {APP_URL}/v1/internal/jobs/{name}/enqueue` with `Authorization: Bearer $INTERNAL_JOB_TOKEN`. The API enqueues an
  Inngest event and returns `202`. No work happens on the cron service, so a cold start or a slow minute
  cannot delay a payout, and the schedule itself is defined once, in `crons.ts`.

`tooling/scripts/check-job-registration.mjs` asserts that every cron in `crons.ts` appears in this YAML and
that every `schedule` entry here names a cron in `crons.ts`, because Render requires the YAML and the
definition has to live in TypeScript where the jobs are.

`sync: false` on every secret means the value lives in the Render dashboard, not in the YAML. A repository
that can be read by anyone with read access must not be able to produce a working production deployment
without a separate authorisation.

`autoDeploy: false` because deployment happens through the pipeline, not through a git hook. Render's
automatic deploy would deploy on any push to a connected branch, including a direct one that skipped CI.
## 6. Deploy flow

```
1. Merge to main
2. GitHub Actions: migrate-staging
3. Render deploy API (staging service), then the worker
4. Health check /health/ready on the staging API
5. Vercel deploy web and admin previews of main
6. Smoke test against staging:
     - GET /health/ready
     - GET /v1/properties?limit=1
     - a synthetic payment: create an intent, fire a signed webhook, confirm a ledger row
7. Manual approval on the production job
8. migrate-prod
9. Render deploy API, wait for both instances healthy, then the worker
10. Vercel deploy production, alias swap
11. Smoke test against production
12. Monitor for 15 minutes: error rate, p95 latency, job failures
13. Tag the release, notify the channel
```

### 6.1 Synthetic payment

Run after every deploy, against the target environment. It is the only test that proves the whole chain works.
```ts
// apps/api/src/bin/smoke.ts
async function smoke() {
  await expectOk('health', () => fetch('/health/ready'))
  await expectOk('listings', () => fetch('/v1/properties?limit=1'))

  // A real intent and a real signed webhook, against a seeded test contract.
  const intent = await post('/v1/payment-intents', { contractId: SMOKE_CONTRACT_ID, scheduleSeqs: [1] },
    { 'Idempotency-Key': `smoke-${Date.now()}` })

  const body = JSON.stringify({
    event: 'charge.success',
    data: { id: `smoke_${Date.now()}`, reference: intent.reference, amount: 100,
            status: 'success', paid_at: new Date()/toISOString(), channel: 'card' },
  })

  await post('/v1/integrations/paystack/webhook', JSON.parse(body),
    { 'x-paystack-signature': signWith(PAYSTACK_WEBHOOK_SECRET, body) })

  const settled = await poll(async () => {
    const p = await get(`/v1/payments?intentId=${intent.id}`)
    return p.data[0]?/status === 'succeeded'
  }, { timeoutMs: 30_000 })

  if (!settled) throw new Error('synthetic payment did not settle')
}
```

The smoke payment is ₦1 on a dedicated seeded contract, and it is refunded by a nightly job so the test
ledger does not accumulate junk.

### 6.2 A failed smoke test

```
Deploy failed
├── API health check failed    → automatic rollback
├── Web deploy failed          → Vercel keeps the previous deployment; no action needed
├── Synthetic payment failed   → automatic rollback, and a page if it fails again on rollback
└── Migration failed           → the code deploy does not proceed. The previous version keeps running
                              against the old schema, which is safe because migrations are additive
```

Rollback for Render is a redeploy of the previous commit. For a database migration, there is no automatic
rollback, because a reverse migration that drops data is worse than a version mismatch. Additive migrations
are what make "roll back the code, leave the schema" safe.
## 7. Feature flags

| Kind | Mechanism | Rollback |
|---|---|---|
| Server flag | Environment variable | Change it. Restarts the API |
| Build flag | Build-time argument | Redeploy |
| Database flag | A row in `feature_flags` | Update the row. Immediate, no deploy |

A flag that must take effect without a deploy, such as halting payouts, is a row in the `feature_flags`
table. It is declared once, in [`05-database-schema.md § 11.6`](./05-database-schema.md#116-feature_flags),
with `private.flag_enabled(key)` as the only read path, and the keys are mirrored in
`packages/config/flags.ts`/ `tooling/scripts/check-flag-usage.mjs` asserts the table, the TypeScript keys and
the readers all agree, so a flag cannot exist in one place and be dead in another.
Payouts, notices, and the maintenance module read from the table. Payments do not: a payment path is never
behind a flag, because a half-enabled payment path is a money bug.
Every flag is removed once the decision is permanent. A flag that has been at its default for two releases is
deleted, and CI enforces that.
## 8. Rollback

| Component | Method | Time | Data loss |
|---|---|---|---|
| API and worker | Redeploy the previous commit on Render | ~3 min | None |
| Web and admin | Redeploy the previous Vercel deployment | ~2 min | None |
| Migration (additive) | Leave it. Old code ignores the new column | 0 | None |
| Migration (destructive) | Not automatic. Restore from a point-in-time restore | ~30 min | Up to the restore point |
| Feature flag | Flip it | Seconds | None |

Rollback is a first-class operation with a documented procedure, tested by actually rolling back during
Phase 16 before anything depends on it.
## 9. CI as the dead-code gate

The pipeline is where the no-dead-code rule is enforced. Every check is a test that fails the build.
| Check | Command | Fails when |
|---|---|---|
| Unused files, exports, dependencies | `knip --production --strict` | Anything is unused |
| Undeclared dependency | `depcheck` | A dependency is not in `package.json` |
| Duplicate code | `jscpd --threshold 5` | Two blocks are 5% or more duplicated |
| Refine resource coverage | `verify:resources` | A resource has no endpoint, or an unknown permission |
| Job coverage | `tooling/scripts/check-job-registration.mjs` | A job has no trigger, or a cron in `render.yaml` names no job |
| Config parity | `tooling/scripts/env-sync.mjs` | A variable is missing from the schema or `/env.example` |
| Generated drift | `tooling/scripts/check-generated-drift.mjs` | `generated.ts` differs from a fresh generation |
| Template coverage | `tooling/scripts/check-template-usage.mjs` | A `documents.kind` has no template, or a template has no trigger |
| Media transforms | `tooling/scripts/check-media-transforms.mjs` | A transform is unused |
| Component stories | Storybook index | An exported component has no story |
| Nav completeness | Admin test | A resource has no nav entry |
| Flag usage | `tooling/scripts/check-flag-usage.mjs` | A flag is read in fewer than two places |
| Docs links | `docs:check` | A link target does not exist |
| Docs freshness | `docs:fresh` | A doc references a file or a symbol that has moved |
| Migration down note | Migration lint | A migration lacks a `-- Down:` comment |
| Import boundaries | `eslint boundaries` | An app imports another app |
| `adminDb` containment | Lint rule | A route file imports `adminDb` |

A codebase that cannot pass these is a codebase with something in it that nobody uses, and the pipeline says
so before a human has to.
## 10. Deployment checklist

Before a production deploy:

```
[ ] CI green on main
[ ] Staging deploy succeeded and its smoke test passed
[ ] Migrations applied to staging and verified
[ ] No migration is destructive
[ ] Environment variables are in sync between staging and production
[ ] Provider accounts are in the right mode (live keys, not test)
[ ] Feature flags are at their intended values
[ ] A human has approved
[ ] Someone is watching the dashboard during the deploy
```

After:

```
[ ] /health and /health/ready respond
[ ] Synthetic payment settled
[ ] The web and admin sites load and sign-in works
[ ] Error rate under 1% for 15 minutes
[ ] p95 latency under 500 ms
[ ] No job failures
[ ] Outbox backlog at zero
[ ] Deploy noted in the channel with the SHA
```

## 11. Dead-code rules

| Rule | Enforcement |
|---|---|
| No workflow with no trigger | Workflow files with no `on:` that CI can reach fail a check |
| No unused CI job | A job whose steps are all `echo` fails a lint rule |
| No deploy path outside the pipeline | `autoDeploy: false` on every Render service, verified in CI |
| No orphaned Render service | Every service in `render.yaml` is referenced by a deploy step |
| No orphaned Vercel project | A manual quarterly review |
| No flag left at default forever | Removed after two releases |

## 12. Related documents

- Environment variables: [`22-configuration-and-environments.md`](./22-configuration-and-environments.md)
- Tests the pipeline runs: [`20-testing.md`](./20-testing.md)
- Rollback procedures: [`24-operations-runbooks.md`](./24-operations-runbooks.md)
- Schema: [`05-database-schema.md`](./05-database-schema.md)
- Roadmap and phases: [`roadmap.md`](./roadmap.md)
