# 22 — Configuration and environments

Every environment variable in Courtland is declared once, typed, validated at boot, and documented here.
A variable that is not in this document does not exist; a variable that is not in the schema cannot be read.

## 1. Environments

| | `local` | `staging` | `production` |
|---|---|---|---|
| Supabase | Local stack | Separate project | Production project |
| API | `localhost:4000` | Render, `staging` service | Render, `web` service |
| Web | `localhost:3000` | Vercel preview | Vercel production |
| Admin | `localhost:5173` | Vercel preview | Vercel production |
| SMS | `mock` | Real, test numbers | Real |
| Paystack | `mock` | Test keys | Live keys |
| Cloudinary | Dedicated dev cloud | Staging cloud | Production cloud |
| Resend | `mock` or test domain | Staging domain | `courtland.com.ng` |
| Inngest | In-memory driver | Dev branch | Production branch |
| Payments move real money | No | No | Yes |

Staging is a full replica of production, not a stripped-down variant. A staging environment that shares
nothing with production cannot tell you whether a deployment will work, and the first test of a deployment
should not be the production one.

## 2. Three categories

| Category | Who can read | Examples |
|---|---|---|
| `NEXT_PUBLIC_*` | The browser | Supabase URL and anon key, Cloudinary cloud name |
| Server-only | The server only | Service role key, Paystack secret, database password |
| Build-time | Baked into the bundle | Vercel build args, feature flags for the build |

The `NEXT_PUBLIC_` prefix is the only thing that makes a variable readable in a browser. A build-time scan of
`.next/static/**` looks for server-only values in the bundle and fails the build. This is the check that
catches the mistake of naming a secret without the prefix and shipping it.

## 3. The schema

`apps/api/src/platform/env.ts` validates with Zod at boot. Missing or invalid is a crash, not a default.

Every variable in §4 appears in this schema, and `tooling/scripts/env-sync.mjs` fails CI when a row in §4 has
no key here or a key here has no row. Two schemas, one per trust boundary: this one for the API, and
`apps/web/src/lib/env.ts` for the browser, which may only read `NEXT_PUBLIC_*`.

```ts
import { z } from 'zod'

const schema = z.object({
  NODE_ENV:       z.enum(['development', 'test', 'production']),
  PORT:           z.coerce.number().int().default(4000),
  TZ:             z.literal('Africa/Lagos'),
  CRON_TZ:        z.literal('Africa/Lagos'),
  LOG_LEVEL:      z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  GIT_SHA:        z.string().regex(/^[a-f0-9]{7,40}$/).default('local'),

  APP_URL:        z.string().url(),
  ADMIN_URL:      z.string().url(),
  SESSION_COOKIE_DOMAIN: z.string().default('courtland.com.ng'),
  CORS_ORIGINS:   z.string().transform((s) => s.split(',').map((o) => o.trim())),

  SUPABASE_URL:               z.string().url(),
  SUPABASE_ANON_KEY:          z.string().min(100),
  SUPABASE_SERVICE_ROLE_KEY:  z.string().min(100),
  SUPABASE_DB_PASSWORD:       z.string().min(16),
  DATABASE_URL:               z.string().url(),      // Supavisor, transaction mode
  DATABASE_POOL_MAX:          z.coerce.number().int().min(1).max(50).default(10),

  PAYSTACK_SECRET_KEY:        z.string().regex(/^sk_(test|live)_/),
  PAYSTACK_WEBHOOK_SECRET:    z.string().min(16),
  PAYSTACK_PUBLIC_KEY:        z.string().startsWith('pk_'),
  PAYSTACK_PAYMENT_LAG_DAYS:  z.coerce.number().int().default(3),
  PAYSTACK_SUBACCOUNT_PREFIX: z.string().default('courtland'),

  CLOUDINARY_CLOUD_NAME:      z.string().min(1),
  CLOUDINARY_API_KEY:         z.string().min(1),
  CLOUDINARY_API_SECRET:      z.string().min(1),

  SMS_PROVIDER:   z.enum(['mock', 'termii', 'msg', 'twilio', 'sendchamp']).default('mock'),
  SMS_SENDER_ID:  z.string().default('Courtland'),
  SMS_HOOK_SECRET: z.string().min(32),
  TERMII_API_KEY:  z.string().min(8).optional(),
  MSG_API_KEY:     z.string().min(8).optional(),
  SENDCHAMP_API_KEY: z.string().min(8).optional(),

  RESEND_API_KEY:        z.string().startsWith('re_'),
  RESEND_FROM:           z.string().email(),
  RESEND_WEBHOOK_SECRET: z.string().min(16),

  INNGEST_EVENT_KEY:    z.string().min(16),
  INNGEST_SIGNING_KEY:  z.string().min(16),
  INTERNAL_JOB_TOKEN:   z.string().min(32),
  METRICS_TOKEN:        z.string().min(32),

  REDIS_URL: z.string().url().optional(),

  SENTRY_DSN: z.string().url().optional(),
  SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0.1),
  POSTHOG_API_KEY: z.string().optional(),
  POSTHOG_HOST:    z.string().url().default('https://eu.i.posthog.com'),

  // Refuse to boot against live provider keys outside production.
}).superRefine((env, ctx) => {
  if (env.NODE_ENV !== 'production' && env.PAYSTACK_SECRET_KEY.startsWith('sk_live_')) {
    ctx.addIssue({ code: 'custom', path: ['PAYSTACK_SECRET_KEY'],
      message: 'live Paystack key outside production' })
  }
  if (env.NODE_ENV === 'production' && env.SMS_PROVIDER === 'mock') {
    ctx.addIssue({ code: 'custom', path: ['SMS_PROVIDER'], message: 'mock SMS in production' })
  }
  if (env.NODE_ENV === 'production' && env.PAYSTACK_SECRET_KEY.startsWith('sk_test_')) {
    ctx.addIssue({ code: 'custom', path: ['PAYSTACK_SECRET_KEY'], message: 'test Paystack key in production' })
  }
  // A provider in the fallback chain needs its key, or the chain fails open into an error at 3am.
  if (env.NODE_ENV === 'production' && !env.SENDCHAMP_API_KEY) {
    ctx.addIssue({ code: 'custom', path: ['SENDCHAMP_API_KEY'],
      message: 'sendchamp is the last link in the SMS chain and must be configured' })
  }
})

export const env = schema.parse(process.env)
```

That `superRefine` block is worth the trouble. It makes "someone pasted the test key into production"
impossible to deploy, which is a mistake that would otherwise be caught by a customer.

Cookie and CSRF names are **not** environment variables. They are constants in `packages/config`, exported as
`SESSION_COOKIE` and `CSRF_COOKIE`, because a name that can differ per environment is a name that will differ
between the API and a frontend, and a mismatch there is a `403` on every write. `SESSION_COOKIE_DOMAIN` *is*
configuration, because it differs between local and production, and the API refuses to start if it does not
end in the registrable domain of `APP_URL`.

## 4. Variables

### 4.1 Core

| Variable | Scope | Example | Notes |
|---|---|---|---|
| `NODE_ENV` | server | `production` | Set by the platform |
| `PORT` | server | `4000` | Render sets it |
| `TZ` | server | `Africa/Lagos` | Required. Business logic depends on it |
| `APP_URL` | server | `https://courtland.com.ng` | Used in notice links and Paystack callbacks |
| `ADMIN_URL` | server | `https://admin.courtland.com.ng` | |
| `CORS_ORIGINS` | server | `https://courtland.com.ng,https://admin.courtland.com.ng` | Comma-separated. No wildcards |
| `LOG_LEVEL` | server | `info` | |
| `GIT_SHA` | server | `a1b2c3d` | Injected by CI, used in logs and Sentry releases |

### 4.2 Supabase

| Variable | Scope | Notes |
|---|---|---|
| `SUPABASE_URL` | server, `NEXT_PUBLIC_` | |
| `SUPABASE_ANON_KEY` | server, `NEXT_PUBLIC_` | The RLS-respecting key. Safe in the browser |
| `SUPABASE_SERVICE_ROLE_KEY` | server only | Bypasses RLS. Never in a Vercel client-visible variable |
| `SUPABASE_DB_PASSWORD` | server only | For direct connections from migrations |
| `DATABASE_URL` | server only | The pooler connection string for Drizzle. `supavisor` transaction mode |

### 4.3 Paystack

| Variable | Scope | Notes |
|---|---|---|
| `PAYSTACK_SECRET_KEY` | server only | `sk_test_` or `sk_live_`. Validated against `NODE_ENV` |
| `PAYSTACK_PUBLIC_KEY` | server, `NEXT_PUBLIC_` | Client-side initialisation for the hosted page |
| `PAYSTACK_WEBHOOK_SECRET` | server only | HMAC verification |
| `PAYSTACK_PAYMENT_LAG_DAYS` | server | `3`. The payout lag |
| `PAYSTACK_SUBACCOUNT_PREFIX` | server | `tenant`. The split code prefix |

### 4.4 Cloudinary

| Variable | Scope | Notes |
|---|---|---|
| `CLOUDINARY_CLOUD_NAME` | server, `NEXT_PUBLIC_` | |
| `CLOUDINARY_API_KEY` | server only | Public by design, but not needed in the browser |
| `CLOUDINARY_API_SECRET` | server only | Signs upload tickets. Never client-visible |
| `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` | browser | The loader only needs the name |

### 4.5 SMS

| Variable | Scope | Notes |
|---|---|---|
| `SMS_PROVIDER` | server | Primary. `mock` in local |
| `SMS_SENDER_ID` | server | `Courtland`. Registered per aggregator |
| `SMS_HOOK_SECRET` | server only | Authenticates the Supabase hook |
| `TERMII_API_KEY` | server only | When Termii is in the chain |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` | server only | For WhatsApp |
| `MSG_API_KEY` | server only | Fallback |
| `SENDCHAMP_API_KEY` | server only | Fallback |

Only the active provider's variables are required. The schema validates conditionally, so a deployment using
Termii is not asked for a Twilio token.

### 4.6 Email

| Variable | Scope | Notes |
|---|---|---|
| `RESEND_API_KEY` | server only | |
| `RESEND_FROM` | server | `notifications@courtland.com.ng` |
| `RESEND_WEBHOOK_SECRET` | server only | Bounce and complaint verification |

### 4.7 Inngest and jobs

| Variable | Scope | Notes |
|---|---|---|
| `INNGEST_EVENT_KEY` | server | Publishes events |
| `INNGEST_SIGNING_KEY` | server | Verifies Inngest's calls |
| `INTERNAL_JOB_TOKEN` | server only | Authenticates Render cron |
| `CRON_TZ` | server | `Africa/Lagos` |

### 4.8 Infrastructure

| Variable | Scope | Notes |
|---|---|---|
| `REDIS_URL` | server | Required in production for rate limiting and auth caching |
| `DATABASE_POOL_MAX` | server | `10` per instance |
| `METRICS_TOKEN` | server | Authenticates the metrics endpoint |
| `SENTRY_DSN` | server, `NEXT_PUBLIC_` | |
| `SENTRY_AUTH_TOKEN` | server, CI | Source map upload |
| `SENTRY_TRACES_SAMPLE_RATE` | server | `0.1` |
| `POSTHOG_API_KEY` | server | |
| `POSTHOG_HOST` | server | `https://eu.i.posthog.com` |

### 4.9 Build-time flags

These are **environment variables**, not the `feature_flags` table, and the difference is deliberate: a build
flag is compiled into a bundle and needs a redeploy to change, which is fine for a surface that either exists
or does not, while a table flag takes effect immediately and is for anything operational such as halting
payouts. The rule from [`23 § 7`](./23-ci-cd-and-deployment.md#7-feature-flags) decides which is which, and no
flag may exist in both places.

Anything read by browser code carries `NEXT_PUBLIC_`, because Next.js inlines only that prefix at build time
and a plain `ENABLE_` key read in a component is `undefined` in the browser. That is the whole reason the
prefix exists, so a flag read in a Client Component without it is a bug the build cannot catch.

| Flag | Default | Read by | Purpose |
|---|---|---|---|
| `NEXT_PUBLIC_ENABLE_WHATSAPP_OTP` | `false` | `apps/web` sign-in screen | Twilio-only. The option is not rendered otherwise, so a user is never offered a channel that will fail |
| `NEXT_PUBLIC_ENABLE_SAVED_SEARCH_ALERTS` | `true` | `apps/web` | |
| `NEXT_PUBLIC_ENABLE_360_VIEWER` | `false` | `apps/web` gallery | Off until the WebGL bundle is tuned |
| `ENABLE_MAINTENANCE_MODULE` | `true` | API, admin | Server-side gate on ticket creation |
| `ENABLE_AUDIT_EXPORT` | `false` | API | Deliberately off; see the audit log decision |

## 5. `.env` files

```
apps/api/.env.local          not committed
apps/web/.env.local          not committed
apps/admin/.env.local        not committed
.env.example                committed, every variable, with a placeholder value
```

`.env.example` is the contract. CI asserts that every key in the Zod schema appears in `.env.example` and
that every key in `.env.example` appears in the schema. A variable added without documentation fails the
build.

```bash
# .env.example
NODE_ENV=development
PORT=4000
TZ=Africa/Lagos
SUPABASE_URL=http://127.0.0.1:55321
SUPABASE_ANON_KEY=<from supabase status>
SUPABASE_SERVICE_ROLE_KEY=<from supabase status>
PAYSTACK_SECRET_KEY=sk_test_xxxxxxxx
# … every variable
```

## 6. Where secrets live

| Environment | Store | Access |
|---|---|---|
| Local | `.env.local`, gitignored | The developer |
| Staging | Render environment group, encrypted at rest | CI can read for deploys |
| Production | Render environment group, encrypted at rest | Two people: the lead developer and the CTO |
| CI | GitHub Actions secrets | Deploy job only |

Not in the repository. Not in a Slack message. Not in a Notion page. Not in a screenshot in a support
thread. When a secret is pasted anywhere it should not be, it is rotated the same day.

### 6.1 Rotation

| Secret | Cadence | Procedure |
|---|---|---|
| Paystack secret | Quarterly | Update Render, redeploy, verify a webhook |
| Supabase service role | Quarterly | Regenerate in the dashboard, update Render, redeploy |
| Cloudinary API secret | Quarterly | Regenerate, update, redeploy. Old upload tickets expire in 1 h anyway |
| Resend API key | Quarterly | Create a new key, update, revoke the old one |
| SMS provider keys | Quarterly | Per provider |
| Inngest signing key | On suspicion | Regenerate; running jobs re-register |
| `INTERNAL_JOB_TOKEN` | Quarterly | Update Render; the cron uses the same value |

Rotation is a two-key overlap where the provider supports it: deploy the new key, verify, then revoke the
old. Paystack and Resend both support two active keys.

## 7. Local development

```bash
# One command
pnpm setup
```

```
supabase start                                  # local Postgres, Auth, Storage
supabase db reset                               # applies migrations, runs seed
pnpm --filter @courtland/api dev               # tsx watch on :4000
pnpm --filter @courtland/web dev               # Next dev on :3000
pnpm --filter @courtland/admin dev             # Vite dev on :5173
pnpm dev                                       # all three with turbo
```

Local credentials come from `supabase status`, and the mock providers print what they would have sent.

### 7.1 Local Supabase settings that must match production

```toml
# supabase/config.toml
[auth]
enable_signup = true
enable_password_autoconfirm = false
minimum_password_length = 8                       # unused, but set
sms_autoconfirm = true                            # local only: OTP works without a real SMS
[auth.email]
enable_signup = false                             # must match production
[auth.sms]
enable_signup = true
[auth.session]
timebox = 3600                                   # 1 hour, matches production
inactivity_timeout = 86400                        # 24 hours
```

`sms_autoconfirm = true` is local-only and never set in staging or production. It is the difference between a
developer's OTP working instantly and requiring a real SMS on every local sign-in.

`enable_signup = false` for email is the setting that must match production. If local allows email signup
and production does not, a developer will build a feature that does not work on launch.

### 7.2 Seed data

`supabase/seed.sql` creates reference data: states, LGAs, property types, amenities, contract terms, notice
templates, document templates, email and SMS templates, and the permission matrix. It creates **no user
accounts and no contracts**, so a fresh database has the reference data and nothing else.

A separate `supabase/seed.dev.sql`, not run in CI, creates a handful of test users with fixed OTPs and a
couple of contracts, for manual testing.

## 8. Configuration changes in production

| Change | How |
|---|---|
| A new variable | PR adding it to `env.ts` and `.env.example`, then set it in Render |
| A value change | Render dashboard, or `render` CLI. No deploy needed for most; the API reads at boot |
| A schema change | New migration, applied through the pipeline. Never by hand in production |
| A flag change | Render environment variable; takes effect on the next request for server flags, on redeploy for build-time flags |

A value change in Render restarts the service, so a change during peak traffic causes a brief restart. For
something like `PAYSTACK_PAYMENT_LAG_DAYS`, that is acceptable. For anything that can be done without a
restart, it should be.

## 9. Configuration safety

| Check | Enforcement |
|---|---|
| No live key outside production | `superRefine` in the schema, and again in CI |
| No test key in production | Same |
| No mock provider in production | Same |
| No `NEXT_PUBLIC_` on a secret | Naming convention plus a bundle scan |
| No secret in the bundle | Build-time scan of `.next/static/**` |
| No variable missing from `.env.example` | CI check |
| No variable in `.env.example` missing from the schema | CI check |
| No unused variable | A variable in the schema that is never read fails a CI check. An unused variable is a stale secret with a rotation date nobody remembers |
| Boot fails on invalid config | The Zod parse |

## 10. Environment parity

A staging and production difference is a bug waiting for launch. The parity check runs in CI:

| Compared | How |
|---|---|
| Variable key sets | Staging and production env key lists must match. A key in one and not the other fails |
| Supabase Auth settings | A script reads the project settings via the management API and diffs staging against production |
| RLS policies | Both are the same migrations, verified by comparing `pg_policies` output |
| Cron schedule | `render.yaml` is the same file for both |
| Feature flags | Listed and reviewed; deliberately different flags are documented in this section |

## 11. Dead-code rules

| Rule | Enforcement |
|---|---|
| No unused variable | Schema-to-usage check in CI |
| No undocumented variable | `.env.example` parity check |
| No flag read in fewer than two places | Flag usage check |
| No local-only variable in the production schema | A `LOCAL_ONLY` marker in the schema, checked |
| No `process.env` outside `env.ts` | Import boundaries plus a lint rule |
| No dead flag | A flag set to its default in all environments for two consecutive releases is removed |

## 12. Related documents

- Secret handling and the threat model: [`19-security.md § Secrets`](./19-security.md#6-secrets)
- Deployment, which consumes these: [`23-ci-cd-and-deployment.md`](./23-ci-cd-and-deployment.md)
- Jobs that read these: [`11-scheduling-and-jobs.md`](./11-scheduling-and-jobs.md)
- Runbooks for changing them: [`24-operations-runbooks.md`](./24-operations-runbooks.md)
