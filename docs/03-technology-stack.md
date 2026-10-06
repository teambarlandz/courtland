# 03 — Technology Stack

Versions below were checked against the npm registry and vendor documentation in **October 2026**.
They are the versions Courtland was designed against. Exact patch versions drift; the ranges are what
matters, and every upgrade goes through the checklist at the end of this document.

## 1. Runtime and language

| Package | Range | Notes |
|---|---|---|
| Node.js | `>=22.14` for apps/web and apps/admin, `>=24.12` for apps/api and workers | Node 24 is required on the API because type stripping is stable there and `@sentry/node` v11 requires Node 22.12+. Vercel's Node 24 runtime is used for both frontends. |
| TypeScript | `~5.9` | **Not 7.x.** See [§ Risk register](#7-risk-register). |
| `tsx` | `^4.20` | API dev server (`tsx watch src/server.ts`). |
| `tsdown` | `^0.15` | API production bundle. Emits `dist/server.js` plus declarations. |
| `@types/node` | `^24` | Must match the API runtime major. |

`tsconfig.base.json` sets `erasableSyntaxOnly: true`, `verbatimModuleSyntax: true`, `strict: true`,
`module: "nodenext"`. This keeps the API compatible with Node's native TypeScript execution for one-off
scripts and cron entry points, which means no build step for `bin/*.ts`.

## 2. Monorepo

| Package | Range | Notes |
|---|---|---|
| pnpm | `10.x` | Workspace globs plus the version catalog, so `zod` is declared once. |
| Turborepo | `^2.5` | Task graph and remote cache. `tasks` key, not `pipeline`. |
| Biome | `^2.2` | Lint **and** format. Replaces ESLint and Prettier. |
| Knip | `^5` | Unused files, exports, dependencies. The dead-code gate. |
| `@types/express` | `^5.0` | Must be v5 to match Express 5. |

Nx was considered and rejected. Its project-graph inference and boundary rules earn their keep at
several dozen packages; at nine they are configuration debt. Bun was rejected because swapping the
runtime breaks Render's native Node parity, MSW's Node 22 requirement, and Node's native type
stripping, for no benefit here.

## 3. `apps/web`

| Package | Range | Notes |
|---|---|---|
| `next` | `^16.3` | Active LTS line. Patch to the latest security release before each deploy; the September 2026 out-of-band release fixed a critical RSC issue. |
| `react`, `react-dom` | `^19.2` | Required by Next 16 App Router. |
| `framer-motion` | `^12` | The animation spec in the brief maps directly onto Motion primitives. |
| `tailwindcss` | `^4.1` | **v4.** CSS-first config with `@theme`. No `tailwind.config.js`. |
| `@tailwindcss/postcss` | `^4.1` | Separate package in v4. `autoprefixer` is dropped; v4 uses Lightning CSS. |
| `zod` | `^4.1` | Shared via the catalog with the API. |
| `date-fns` | `^4.1` | Pure date maths, tree-shakeable, no timezone surprises. |
| `clsx`, `tailwind-merge` | `^2.1`, `^3.0` | Behind `cn()` in `packages/ui`. |
| `next-themes` | `^0.4` | The data-attribute dark variant needs this in v4. |
| `@supabase/ssr` | `^0.6` | Cookie-based session so Server Components can read the session. |
| `@supabase/supabase-js` | `^2.58` | Auth only. Never used for data reads. |
| `usehooks-ts` | `^1.0` | Media query, reduced motion, intersection observer. Saves real code. |

### 3.1 Next.js 16 specifics that affect the build

These are the version-16 behaviours that change how this app is written. Each one is a live footgun.

| Change | Consequence for Courtland |
|---|---|
| Turbopack is the default bundler for `next dev` and `next build` | No `webpack` key in `next.config.ts`. If a dependency needs it, pass `--webpack` deliberately and record why. |
| `middleware.ts` is deprecated in favour of `proxy.ts` | The file is `apps/web/proxy.ts`. |
| `next lint` is removed and `next build` no longer lints | Lint runs via `biome check` in Turbo and in CI. Adding it to `build` is a deliberate choice in `package.json`, not a framework behaviour. |
| The `eslint` key is removed from `next.config.ts` | Configuration lives in `biome.json`. |
| Caching is opt-in via Cache Components | `cacheComponents: true` in `next.config.ts`. Reads use `"use cache"` with `cacheTag`/`cacheLife`. Money reads never cache. |
| `revalidateTag()` requires a second `cacheLife` argument | All invalidation calls pass a profile. |
| `updateTag()` exists for read-your-writes in Server Actions | Payment-adjacent mutations use `updateTag`; content mutations use `revalidateTag`. |
| Parallel routes require an explicit `default.ts` | No parallel routes are used today. If one is added, `default.ts` is mandatory or the build fails. |
| `next/image` `qualities` defaults to `[75]` | Only request quality 75 or add it to the array. |
| `images.remotePatterns` replaces `images.domains` | Cloudinary is the only allowed remote host. |
| `serverExternalPackages` is stable | Not needed; the app does not import the API code. |

### 3.2 Tailwind CSS v4 specifics

- Configuration is CSS, in `@theme` inside `packages/ui/tokens.css`.
- `@theme` variables generate utilities. `:root` variables do not. The namespace prefix decides which
  utility family is emitted: `--color-*`, `--font-*`, `--text-*`, `--spacing-*`, `--radius-*`,
  `--breakpoint-*`, `--shadow-*`, `--ease-*`.
- Class-based dark mode must be opted into explicitly with `@custom-variant dark (&:where(.dark, .dark *));`.
  Without this line, `dark:` utilities compile but the class toggle does nothing.
- In a monorepo, Tailwind's automatic source detection skips workspace packages outside the app root.
  `globals.css` carries explicit `@source` directives for `packages/ui` and `packages/emails`.
- There is a known Turbopack + Tailwind v4 HMR issue where new classes are not picked up until restart.
  The explicit `@source` directives in `globals.css` are what work around it. Do not remove them.
- `@source inline()` replaces v3's `safelist` if a dynamic class must survive purging.
- No `tailwind.config.js` exists. If one appears, it is dead.

## 4. `apps/admin`

| Package | Range | Notes |
|---|---|---|
| `@refinedev/core` | `^5.0` | React 19, TanStack Query v5, restructured hook returns. |
| `@refinedev/react-router` | `^2.0` | Peer-depends on `react-router@^7`. Import from `react-router`, never `react-router-dom`. |
| `@refinedev/react-hook-form` | `^5.0` | React Hook Form integration. |
| `@refinedev/react-table` | `^6.0` | Table primitives. |
| `@refinedev/inferencer` | `^6.0` | Optional. Not used; Courtland's entities are not pure CRUD and hand-written pages are clearer. |
| `react-router` | `^7.9` | |
| `react`, `react-dom` | `^19.2` | |
| `vite` | `^7` | Dev server and build for the SPA. |
| `@tanstack/react-query` | `^5` | Required by Refine v5. |
| `react-hook-form` | `^7.54` | |
| `sonner` | `^2` | Refine's notification provider target. |
| `tailwindcss`, `@tailwindcss/postcss` | `^4.1` | Same version as web. |

Deliberately excluded: Ant Design, Material UI, shadcn's full CLI-generated component set. Refine is
headless, so the UI comes from `packages/ui`. Pulling in Ant Design would give us a second design system
fighting the Espresso palette for every screen. The cost is more component work up front; the benefit
is that the back office looks like the product rather than a demo.

## 5. `apps/api`

| Package | Range | Notes |
|---|---|---|
| `express` | `^5.1` | Express 5. Rejected promises reach the error middleware automatically. |
| `drizzle-orm` | `^0.44` | Schema-as-code. Type inference without a codegen step in the request path. |
| `drizzle-kit` | `^0.31` | `generate` only. **Never `push`** — see below. |
| `postgres` (postgres.js) | `^3.4` | Driver. `prepare: false` when the URL points at a pooler. |
| `zod` | `^4.1` | Validation, and JSON Schema generation for OpenAPI 3.1. |
| `zod-openapi` | `^6.0` | OpenAPI 3.1 document from Zod. Requires Zod 4. |
| `pino`, `pino-http` | `^10`, `^11` | Structured NDJSON logs on stdout. |
| `pino-pretty` | `^13` | Dev only. |
| `helmet` | `^8` | |
| `cors` | `^2.8` | Explicit origin allowlist from env. |
| `express-rate-limit` | `^8` | Note `limit`, not `max`, is the option name in v7+. |
| `ioredis` | `^5` | Rate limit store. Only if more than one API instance runs. |
| `@react-pdf/renderer` | `^4` | Receipts, agreements, statements. |
| `pdf-lib` | `^1.17` | Merging, stamping and post-processing generated PDFs. |
| `@react-email/components` | `^0.5` | Email templates. |
| `resend` | `^6` | Transactional email. |
| `cloudinary` | `^2` | Image and authenticated document delivery. |
| `inngest` | `^3` | Durable workflows. |
| `@sentry/node` | `^11` | Error tracking and tracing. Requires Node 22.12+. |
| `supertest` | `^7` | Integration tests against the pure `app.ts`. |
| `tsx`, `tsdown` | see §1 | |

### 5.1 Why Drizzle and not Prisma

- Drizzle's schema is TypeScript. RLS policies are declared in the same file as the table, so a policy
  cannot be forgotten when a table is added.
- No query-engine binary. On Render's native Node runtime there is nothing extra to install and nothing
  to keep in sync with the Postgres version.
- Migrations are plain SQL in `supabase/migrations/`, which means Supabase CLI's `db push`, `db reset`
  and `supabase test db` all work unchanged, and pgTAP can assert against them.
- Prisma's `latest` dist-tag currently points at an `8.0.0-rc` while `@prisma/client` is at `7.10.0`.
  That is a registry inconsistency we would rather not depend on.

`drizzle-kit push` is a development shortcut that skips migration history. It is banned: migrations in
Courtland are generated with `drizzle-kit generate` (writes a timestamped SQL file) and applied with
`supabase db push`. See [`05-database-schema.md § Migration rules`](./05-database-schema.md#16-migration-rules).

### 5.2 Why Express 5 and not Hono

Hono is excellent and is the better choice for edge and serverless-first workloads. Courtland is neither.
The API needs long-lived Postgres connections, Stripe-grade webhook handling, PDF rendering and cron,
all on a stateful Node service where Express's ecosystem — Supabase middleware patterns, Sentry, MSW,
supertest — is first-class. Hono's `Request`/`Response` model would be a nice fit on Vercel, which is
exactly where this API is not going.

## 6. Managed services

| Service | SDK | Purpose | Notes |
|---|---|---|---|
| Supabase Postgres | `postgres` via Drizzle | Primary datastore | Direct connection from the API. RLS is the authorisation floor. |
| Supabase Auth | `@supabase/supabase-js` | Identity | Phone OTP primary, email magic link secondary. |
| Paystack | Raw `fetch` client in `apps/api/src/integrations/paystack/client.ts` | Payments | No official maintained Node SDK with subaccount support. The client is ~120 lines and typed by `packages/types/src/webhooks/paystack.ts`. |
| Cloudinary | `cloudinary@2` | Media and documents | |
| Resend | `resend@6` | Email | |
| Twilio or MSG | `fetch` in `apps/api/src/integrations/sms/client.ts` | SMS and WhatsApp OTP | Behind Supabase's **Send SMS hook** so the provider can change without touching auth. See [`06-authentication.md § SMS provider`](./06-authentication.md#3-the-sms-provider-behind-a-hook). |
| Inngest | `inngest@3` | Workflows | |
| Render | — | API hosting and cron | |
| Vercel | — | Both frontends | |
| Sentry | `@sentry/node`, `@sentry/nextjs` | Errors and traces | |
| `@vercel/otel` | `^1.3` | OTel on web | Required for Vercel Session Tracing and Trace Drains. Do not configure OTel manually in `apps/web` or you forfeit both. |

## 7. Risk register

Version claims in this document have a shelf life. These four are the ones to re-verify before any
dependency bump.

### R1 — TypeScript 7.x is `latest` but not adopted

The Go-native TypeScript port is published as `7.0.2`. Its compatibility with `typescript-eslint`, the
Next.js compiler plugin, `drizzle-kit` and Vitest's transform has **not** been verified. Courtland pins
`~5.9`. When TS 7 stabilises, adopt it behind its own PR that touches nothing else, and run the full
suite. Do not combine a TypeScript major bump with a Next.js minor bump.

### R2 — Next.js security releases land on a monthly cadence

The September 2026 out-of-band release addressed nine vulnerabilities including one critical, shipping
patches for 16.3.8 and 15.5.27. Courtland tracks the 16.x Active LTS line. **Process:** a weekly
scheduled workflow checks npm for a newer `next` in the pinned range and opens an issue. Bumping is a
patch-level PR that runs the full suite. There is no configuration change expected.

### R3 — Tailwind v4 + Turbopack HMR

New utility classes can fail to appear until `next dev` restarts. Worked around with explicit `@source`
directives in `apps/web/src/app/globals.css`. If a developer reports missing styles, check those
directives before touching anything else. Upstream tracking is in the Next.js repository.

### R4 — Paystack's fee structure is per-merchant

The public Nigeria pricing is a percentage plus a fixed fee, and the exact numbers vary by channel and
volume tier. Courtland never hard-codes a fee. The API reads fees from the Paystack verify response and
stores them on `payments_ledger.paystack_fee_kobo`. Any modelling of net payout assumes
`gross − paystack_fee − allocations`, which is derived, not assumed. See
[`10-payments-paystack.md § Fee handling`](./10-payments-paystack.md#23-worked-example-annual-rent).

## 8. Upgrade checklist

Never upgrade in the same PR as anything else.

1. `pnpm outdated -r` and read the changelogs. Pay attention to major and to anything mentioning RSC,
   RLS, webhook signatures or Tailwind content detection.
2. Bump in the root `pnpm-workspace.yaml` catalog if the package is catalogued.
3. `pnpm install && pnpm build && pnpm typecheck && pnpm lint && pnpm test`.
4. `supabase db reset && supabase test db` — schema and RLS tests.
5. `pnpm test:e2e` against the local stack.
6. Deploy to staging and run the launch checklist's smoke section.
7. Check the Sentry release and the `@sentry/nextjs` / `@sentry/node` versions agree — mismatched majors
   break source map resolution and you lose readable stack traces.

## 9. Rejected alternatives

| Rejected | Why |
|---|---|
| Next.js Route Handlers instead of an Express API | See [`01-architecture.md § Why an API at all`](./01-architecture.md#21-why-an-api-at-all). |
| Prisma | Query engine, registry instability, harder to express RLS co-located with tables. |
| tRPC | Two clients, two error models, and the web app is not even in the same process. A plain REST API with OpenAPI is easier to consume from anything. |
| GraphQL | No consumer needs arbitrary field selection here. Every client wants a handful of shaped read models. |
| Firebase / Firestore | Relational integrity is the whole problem. Contracts, units, ledger and allocations are all joins with foreign keys. |
| Ant Design in the admin | A second design system would fight the brand palette on every screen. |
| Redis as the primary datastore | Durability and relational guarantees matter more than throughput for this workload. Postgres is sufficient by a wide margin. |
| Building a queue | Render cron plus Inngest covers it. A bespoke queue is a permanent operational burden with no upside. |
| Playwright against a staging URL for every run | Flaky and slow. E2E runs against the local stack with Paystack in test mode. |
| `next-auth` | Supabase Auth already issues and refreshes the session. A second session layer adds risk and nothing else. |

## 10. Related documents

- Where each package lives and what it may import: [`02-repository-structure.md`](./02-repository-structure.md)
- Supabase CLI, migrations and pgTAP: [`05-database-schema.md`](./05-database-schema.md)
- Environment variables and key parity rules: [`22-configuration-and-environments.md`](./22-configuration-and-environments.md)
