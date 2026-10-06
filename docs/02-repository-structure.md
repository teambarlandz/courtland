# 02 — Repository Structure

## 1. Top-level layout

```
courtland/
├── apps.
│   ├── web/                     Next.js 16 — public site + tenant/buyer/owner portals
│   ├── admin/                   React 19 + Refine 5 — staff back office
│   └── api/                     Express 5 + Drizzle — the only place privileged secrets live
├── packages/
│   ├── config/                  Shared Biome, tsconfig, env-name constants, commit hooks
│   ├── types/                   Zod schemas + inferred types. The contract source of truth.
│   ├── utils/                   Money, dates, phone, slugs, ids. Zero dependencies on the app/
│   ├── db/                      Drizzle schema, client factories, RLS transaction helpers
│   ├── api-client/              Typed HTTP client used by web and admin
│   ├── ui/                      Design tokens + shared React components
│   ├── emails/                  Handlebars email + SMS templates
│   ├── pdf/                     Handlebars templates + PDFKit renderer for legal documents
│   ├── logger/                  The one Pino logger, with the redaction list
│   └── media/                   Cloudinary client, upload rules, URL transforms
├── supabase/
│   ├── migrations/              Authoritative SQL. Applied in filename order.
│   ├── tests/                   pgTAP tests, one file per bounded area
│   ├── seed.sql                 Local development fixtures
│   └── config.toml              Supabase CLI configuration
├── tooling/
│   ├── scripts/                 One-shot maintenance scripts (env sync, link check, doc freshness)
│   └── eslint-disable/          Not used — Biome only. Reserved for future generated-code ignores.
├── docs/                        This documentation set
├── .github/workflows/           CI and deploy pipelines
├── package.json                 Root scripts, pnpm catalog, turbo delegation
├── pnpm-workspace.yaml          Workspace globs + version catalog
├── turbo.json                   Task graph and cache rules
├── biome.json                   Lint and format configuration
├── tsconfig.base.json           Shared TypeScript options
└── knip.json                    Dead-code detection configuration
```

## 2. `apps/web`

Next.js 16 with the App Router, React 19.2, Turbopack, Tailwind CSS v4, Framer Motion.

```
apps/web/
├── next.config.ts               Build Adapters, image remotePatterns for Cloudinary, typedRoutes
├── proxy.ts                     Edge middleware: session refresh + route protection for portals
├── postcss/config.mjs           @tailwindcss/postcss only
├── e2e/                         Playwright specs
├── public/                      Static assets, favicon, manifest
└── src/
    ├── app/
    │   ├── layout.tsx           Root layout: fonts, globals.css, providers, metadata base
    │   ├── globals.css          @import "tailwindcss" + @theme tokens (imports @courtland/ui)
    │   ├── opengraph-image.tsx  Dynamic OG image per property
    │   ├── (marketing)/         /, /about, /how-it-works, /faq, /contact
    │   ├── (listings)/          /listings, /listings/[listingType], /properties/[slug]
    │   ├── (auth)/              /auth/sign-in, /auth/verify, /auth/onboarding
    │   ├── (tenant)/portal/tenant/     overview, payments, tickets, documents, lease
    │   ├── (buyer)/portal/buyer/       overview, schedule, payments, documents, contracts
    │   ├── (owner)/portal/owner/       overview, assets, financials, payouts, documents
    │   └── (legal)/legal/               terms, privacy, tenancy-policy, cookies
    ├── components/
    │   ├── brand/               Logo, wordmark, favicon generator
    │   ├── listing/             PropertyCard, PropertyGrid, FilterPanel, Gallery, PriceTag
    │   ├── portal/              StatCard, DueDateBanner, PaymentTable, Timeline, DocumentList
    │   ├── forms/               Shared field primitives wired to Zod schemas
    │   └── motion/              FadeSlideUp, Stagger, TallyNumber, Skeleton
    ├── lib/
    │   ├── api.ts               Server-only fetch wrapper. Adds auth header, tags, revalidation/
    │   ├── queries.ts           Tagged Cached Server Component reads, one per read model
    │   ├── actions/             Server Actions. One file per bounded context.
    │   ├── auth.ts              Supabase browser/server client factories (anon key only)
    │   ├── seo.ts               Metadata builders per route
    │   └── constants.ts         Navigation, phone numbers, copy
    ├── hooks/                   useSession, useMediaQuery, useReducedMotion, useCountUp
    └── types/                   Next-specific ambient types
```

### 2.1 Route groups

Route groups let us share layouts without affecting the URL. The four portal groups each get their own
`layout.tsx` that performs its own role guard, which is why `/portal/tenant` and `/portal/buyer` can
have different navigation, different queries and different guards while living in one app.

| Group | URL prefix | Layout responsibility |
|---|---|---|
| `(marketing)` | none | Public header and footer. Marketing pages only. |
| `(listings)` | none | Public header, no footer on detail pages. |
| `(auth)` | `/auth` | Centred card layout, no portal chrome. |
| `(tenant)` | `/portal/tenant` | Requires `tenant` role. Tenant nav, mobile bottom bar. |
| `(buyer)` | `/portal/buyer` | Requires `buyer` role. Buyer nav. |
| `(owner)` | `/portal/owner` | Requires `landlord` role. Owner nav, wider layout for financial tables. |
| `(legal)` | `/legal` | Minimal chrome, print-friendly. |

## 3. `apps/admin`

React 19 + Refine 5 + Vite + React Router 7 + Tailwind v4. Client-side only; no SSR.

```
apps/admin/
├── vite/config.ts               Vite + React + path alias @/ → src/
├── index/html                   Root element, font preloads, theme flash guard
├── e2e/                         Playwright specs against the built app
└── src/
    ├── main.tsx                 Refine root: providers, router, resources
    ├── App.tsx                  Route tree definition
    ├── providers.
    │   ├── dataProvider.ts      Refine adapter over @courtland/api-client
    │   ├── authProvider.ts      Supabase session → Refine auth contract
    │   ├── accessControlProvider.ts  Permission slugs → can() answers
    │   ├── notificationProvider.ts   Sonner toasts wired to problem+json codes
    │   └── i18nProvider.ts      en-NG strings
    ├── resources.ts             The Refine resource registry. Single source of nav truth.
    ├── components/
    │   ├── layout/              ThemedLayoutV2, Sidebar from resource registry, TopBar, Breadcrumbs
    │   ├── metrics/             TallyNumber, Sparkline, TrendBadge
    │   ├── fields/              Domain field components (MoneyField, PhoneField, TitleTypeSelect)
    │   ├── tables/              Column builders, DataGrid styling, EmptyState, SkeletonRows
    │   └── filters/             FilterBuilder, SavedFilterMenu, ActiveFilterChips
    ├── pages.
    │   ├── dashboard/           Metric cards, collections due, disputes, recent activity
    │   ├── properties/          List, Create, Edit, Show, SubTabs (units, media, land, allocations)
    │   ├── units/
    │   ├── owners/              List, Show, Applications queue
    │   ├── contracts/           List, Show (parties, schedule, ledger, timeline), Edit
    │   ├── clients/             Dynamic filtered client list with saved views
    │   ├── payments/            Ledger list, Show, refund action
    │   ├── payouts/             Period runs, approvals, initiate
    │   ├── tickets/             Queue, Show with updates thread
    │   ├── documents/           Library, release workflow
    │   ├── disputes.
    │   ├── notices/             Compose and audit log
    │   ├── users/               Staff accounts and roles
    │   ├── audit/
    │   └── auth/                Login, forgot password
    └── hooks/                   usePermissions, useSavedFilters, useMoney, useContractSummary
```

### 3.1 Refine resource registry

`apps/admin/src/resources.ts` is the single source of truth for navigation. Adding a resource there
without a matching route in `App.tsx`, and a matching API endpoint, fails the Knip dead-code check and
the route-coverage test. This is how the "no dangling wires" guarantee is enforced in the back office.
```ts
export const resources: ResourceDefinition[] = [
  { name: 'properties', list: '/properties', create: '/properties/new', edit: '/properties/:id/edit', show: '/properties/:id', meta: { label: 'Properties', icon: 'Building', permissions: ['property_read'] } },
  { name: 'units', list: '/units', show: '/units/:id', edit: '/units/:id/edit', meta: { label: 'Units', permissions: ['unit_manage'] } },
  // ...
]
```

## 4. `apps/api`

Express 5. Separates `app.ts` (a pure Express application, no `listen`) from `server.ts` (bootstrap and
lifecycle) so integration tests can drive the app with `supertest` without binding a port.

```
apps/api/
├── drizzle/config.ts            Points at packages/db; output to supabase/migrations
├── tsdown/config.ts             Production bundle config
├── Dockerfile                   Optional. Render uses native Node runtime by default.
├── test.
│   ├── setup/pg.ts              Applies migrations to a scratch database, seeds fixtures
│   ├── fixtures/                users of each role, properties, contracts, payments
│   └── integration/             Supertest suites per bounded context
└── src/
    ├── server.ts                listen, graceful shutdown, Sentry preload
    ├── app.ts                   Express app assembly. Exported for tests.
    ├── env.ts                   Zod-validated process.env. Fails fast on boot.
    ├── instrumentation.ts       Sentry + OpenTelemetry initialisation (--import)
    ├── openapi.ts               Builds the OpenAPI 3.1 document from packages/types
    ├── middleware/
    │   ├── requestId.ts         Accept or mint x-request-id; attach to req/res/logs
    │   ├── auth.ts              Verify Supabase JWT, load profile + roles onto req
    │   ├── requirePermission.ts Guard factory
    │   ├── validate.ts          Body/query/params Zod validation helper
    │   ├── idempotency.ts       Idempotency-Key reserve/replay
    │   ├── rateLimit.ts         Global, auth, payment and webhook limiters
    │   └── error.ts             Problem+json error serialiser. Last in the stack.
    ├── routes.
    │   ├── index.ts             Router assembly, /v1 mount
    │   ├── health.ts            GET /health (outside the limiter)
    │   ├── auth.ts              OTP request/verify passthrough, profile read/update
    │   ├── public.ts            Properties, meta, saved searches
    │   ├── tenant.ts            Tenant portal reads
    │   ├── buyer.ts             Buyer portal reads
    │   ├── owners.ts            Owner registration, assets, financials, payouts
    │   ├── payments.ts          Intent creation, initialise, verify, status, receipt
    │   ├── documents.ts         Library, download URL, release
    │   ├── uploads.ts           Cloudinary signature issuing
    │   ├── admin/
    │   │   ├── index.ts
    │   │   ├── properties.ts    CRUD + publish + withdraw + media
    │   │   ├── units.ts
    │   │   ├── owners.ts        CRUD + application approve/reject
    │   │   ├── contracts.ts     CRUD + suspend/terminate/renew + parties + schedule
    │   │   ├── clients.ts       Dynamic filtered client queries
    │   │   ├── payments.ts      Ledger read + refund
    │   │   ├── payouts.ts       Run, approve, initiate, mark paid
    │   │   ├── tickets.ts       Queue, assign, update, resolve, approve cost
    │   │   ├── notices.ts       Compose and audit
    │   │   ├── disputes.ts
    │   │   ├── documents.ts     Library + release
    │   │   ├── users.ts         Staff accounts and roles
    │   │   └── audit.ts
    │   ├── webhooks/
    │   │   ├── index.ts
    │   │   ├── paystack.ts      Signature verify, persist, enqueue
    │   │   ├── cloudinary.ts
    │   │   └── resend.ts        Delivery status → notice status
    │   ├── internal/
    │   │   ├── index.ts         /internal, cron-secret guarded
    │   │   └── cron.ts          nightly, hourly, weekly
    │   └── inngest.ts           Inngest serve handler
    ├── services.
    │   ├── properties/          service.ts, queries.ts, search.ts, publish.ts, media.ts
    │   ├── contracts/            lease.ts, sale.ts, parties.ts, schedule.ts, lifecycle.ts
    │   ├── billing/              engine.ts (period materialisation), lateFees.ts, balances.ts
    │   ├── payments/             intents.ts, ledger.ts, allocations.ts, receipts.ts
    │   ├── payouts/              accrual.ts, run.ts, initiate.ts
    │   ├── documents/            templates.ts, generate.ts, release.ts, delivery.ts
    │   ├── notifications/        dispatcher.ts, templates.ts, queue.ts
    │   ├── owners/               registration.ts, kyc.ts, paystackAccount.ts
    │   ├── tickets/              service.ts, costs.ts
    │   ├── disputes/             service.ts
    │   └── audit/                service.ts
    ├── integrations/
    │   ├── paystack/             client.ts, subaccounts.ts, splits.ts, webhooks.ts, refunds.ts, verify.ts
    │   ├── cloudinary/           client.ts, sign.ts, documents.ts, images.ts
    │   ├── resend/               client.ts, send.ts, webhooks.ts
    │   ├── sms/                  client.ts, send.ts, providers.
    │   ├── supabase/             client.ts (anon), admin.ts (service role)
    │   └── inngest/              client.ts, events.ts
    ├── jobs/
    │   ├── index.ts             Every inngest/createFunction, registered in one array
    │   ├── crons.ts             The 11 cron definitions (Lagos time), the single TS source of truth
    │   ├── send-email.ts  send-sms.ts  generate-document.ts  release-document.ts
    │   ├── payment-reconcile.ts  arrears-sweep.ts  contract-expiry.ts  payout-run.ts
    │   ├── document-cleanup.ts  sms-delivery-report.ts  email-bounce-handler.ts
    │   ├── reconcile-outbox.ts  media-orphan-cleanup.ts  search-reindex.ts
    │   └── kyc-reminder.ts  statement-generate.ts  paystack-transfer-poll.ts
    │   └── events.ts            Event payload types, one per event name
    ├── db/
    │   ├── client.ts             RLS-scoped postgres-js client
    │   ├── admin.ts              Service-role client. Only this file and jobs/ may import it.
    │   ├── withRls.ts            withRls(tx) helper that sets the JWT GUCs inside a transaction
    │   └── schema/               Re-exports from packages/db, split per domain
    ├── lib/
    │   └── errors.ts             AppError subclasses mapped to problem+json. API-only by design:
    │                             it references the HTTP layer, so no other package may import it
    └── bin/
        ├── migrate.ts           Pre-deploy migration runner
        └── seed.ts              Staging seed
```

`apps/api/src/lib/` is deliberately almost empty. Money, dates, phones, references, logging, PDF rendering
and feature flags live in `packages/utils`, `packages/logger`, `packages/pdf` and `packages/config` so that
the frontends, the API and the worker share exactly one implementation of each. A helper only the API needs
lives in `lib/`; a helper two consumers need lives in a package. Copying a money function into `lib/` "to
avoid a dependency" is the mistake this structure exists to prevent, because the copy is exactly where the
ledger and the UI would start to disagree.
## 5. `packages/`

Each package is independently buildable and independently tested. No package may import from an `app`.

### 5.1 `packages/config`

```
packages/config/
├── package.json
├── index.ts                    Package entry: re-exports env-names and flags
├── biome/base.json             Shared Biome rules/ apps extend this.
├── tsconfig.base.json          Strict compiler options, erasableSyntaxOnly
├── env-names.ts                Every environment variable name as a const object
├── flags.ts                    Feature flags: the database-backed keys and their defaults
└── turbo/base.json             Shared task definitions
```

`packages/config` is the one package with no `src/` and no runtime dependency, because its whole job is to
be imported by everything, including `packages/types` and every app, without pulling anything else in. Every
other package exposes a built `dist/` entry; this one exposes two const objects and a type.
### 5.2 `packages/types`

The contract. Every request body, query parameter set and response body is a Zod schema here. Both the
API's validators and the OpenAPI document are generated from it, and both frontends infer their types
from it.
```
packages/types/src/
├── index.ts
├── common/  pagination.ts, problem.ts, money.ts, dates.ts, enums.ts
├── auth/    otp.ts, profile.ts, session.ts
├── property/ listing.ts, filters.ts, create.ts, update.ts, media.ts, land.ts
├── contract/ lease.ts, sale.ts, party.ts, schedule.ts, lifecycle.ts
├── payment/ intent.ts, ledger.ts, allocation.ts, payout.ts, refund.ts, receipt.ts
├── owner/   registration.ts, asset.ts, financials.ts, payout.ts
├── ticket/  ticket.ts, update.ts, cost.ts
├── document/ document.ts, release.ts
├── notice/  notice.ts, compose.ts
├── dispute/ dispute.ts
├── admin/   dashboard.ts, clientFilters.ts, users.ts, audit.ts
├── permissions/ roles.ts, matrix.ts, slug.ts
└── webhooks/ paystack.ts, cloudinary.ts, resend.ts
```

`packages/types/src/permissions/matrix.ts` holds the canonical role→permission list. A SQL migration
seeds `role_permissions` from the same list, and a test asserts the two agree. This is the mechanism
that keeps authorisation from drifting between code and database.
### 5.3 `packages/utils`

```
packages/utils/src/
├── index.ts
├── money.ts       formatNaira, parseNairaToKobo, addKobo, splitAnnualRent, allocatePayment,
│                 allocateProRata, koboToNaira, percentageOf
├── dates.ts       toLagosDate, addMonths, monthLabel, periodFor, isWithinDays, formatNairaDate
├── phone.ts       normaliseNgPhone, isValidNgPhone, maskPhone
├── slug.ts        slugify, uniqueSlug
├── reference.ts   formatReference (CLT-, LSE-, SAL-, PMT-, TKT-, DOC-)
├── compliance.ts  Legally-required copy as versioned constants, shared by the web copy and the
│                 PDF partials so a clause cannot differ between a page and a document
├── arrays.ts      chunk, groupBy, sumBy, partition
└── result.ts      ok/err discriminated result for service boundaries
```

### 5.4 `packages/db`

```
packages/db/
├── drizzle/config.ts
├── src/
│   ├── index.ts
│   ├── client.ts                postgres-js factory with prepare:false for pooled URLs
│   ├── adminClient.ts           Service-role client factory (server only)
│   ├── withRls.ts               withRls(db, auth, fn)
│   ├── enums.ts                 All Postgres enums as TS const objects
│   └── schema.
│       ├── identity.ts          profiles, user_roles, role_permissions, saved_searches
│       ├── asset.ts             properties, property_media, land_details, units, sale_allocations
│       ├── contract.ts          contracts, contract_parties, contract_schedule, contract_events
│       ├── money.ts             payment_intents, payments_ledger, ledger_allocations, payouts, refunds
│       ├── ops.ts               maintenance_tickets, ticket_updates, notices, disputes
│       ├── documents.ts         documents, document_access_log
│       ├── platform.ts          webhook_events, idempotency_keys, outbox_events, audit_log, admin_filter_views
│       └── relations.ts         Drizzle relation definitions
└── test/                        Schema-level assertions where they add value beyond pgTAP
```

### 5.5 `packages/api-client`

```
packages/api-client/src/
├── index.ts
├── http.ts                     fetch wrapper: base URL, auth header, timeout, problem parsing
├── errors.ts                   ApiProblem class, isProblem, retryable()
├── queryKeys.ts                Canonical TanStack Query key factory
├── types.ts                    Inferred request/response types re-exported from packages/types
└── resources.
    ├── auth.ts  properties.ts  contracts.ts  payments.ts  payouts.ts
    ├── owners.ts  tickets.ts  documents.ts  notices.ts  disputes.ts
    ├── dashboard.ts  users.ts  audit.ts  meta.ts  uploads.ts
```

Every function is a thin, typed wrapper: `listProperties(query)`, `createIntent(input)`,
`releaseDocument(id)`. No business logic. The shape mirrors the API 1:1 so the mapping is auditable.
### 5.6 `packages/ui`

```
packages/ui/
├── package.json
├── tokens.css                  @theme block: colours, type scale, spacing, radii, shadows, motion
├── components.json             shadcn registry config, pointing at this package's registry
└── src/
    ├── index.ts
    ├── primitives/             Button, Input, Select, Dialog, Sheet, Tabs, Toast, Tooltip, Calendar,
    │                           DatePicker, Combobox, Table, Badge, Card, Skeleton, Progress, Alert
    ├── brand/                  Logo, Wordmark, Favicon
    ├── property/               PropertyCard, PropertyCardSkeleton, ListingFilters, Gallery, PriceTag,
    │                           LocationMap (static map placeholder), TitleSummary, FeatureGrid
    ├── portal/                 StatCard, TallyCard, DueBanner, ScheduleTable, LedgerTable, DocumentList,
    │                           Timeline, EmptyState, DataBoundary
    └── utils.ts                cn() classname merge
```

### 5.7 `packages/emails`

```
packages/emails/src/
├── index.ts
├── layout.hbs                  Shared shell: header, footer, legal text, Espresso palette
├── partials/
│   ├── brandHeader.hbs  button.hbs  keyValue.hbs  amountTable.hbs  footer.hbs  otpBlock.hbs
│   └── moneyTable.hbs          Every amount printed through formatNaira, shared with packages/pdf
├── templates.
│   ├── welcome.handlebars  otp.handlebars  rentReminder.handlebars  rentDue.handlebars
│   ├── arrearsNotice.handlebars  quitNotice.handlebars  receipt.handlebars
│   ├── paymentFailed.handlebars  installmentReminder.handlebars  titleRelease.handlebars
│   ├── leaseAgreementReady.handlebars  ticketCreated.handlebars  ticketUpdated.handlebars
│   ├── ownerApplicationReceived.handlebars  listingSubmitted.handlebars
│   ├── payoutProcessed.handlebars  disputeOpened.handlebars
│   └── sms.handlebars           Plain-text SMS bodies, same template context as the emails
└── render.ts                  render(name, context) -> { subject, html, text }, the only entry point
                               the API calls/ `pnpm --filter @courtland/emails preview` renders
                               every template to a fixture file for review
```

Templates are **Handlebars**, not JSX, for the same reason the PDF templates are: one templating language
for email, PDF and SMS, so a legally-required clause is written once/ `render` is the only export the API
needs, which is what keeps Knip honest about the rest of the package.

### 5.8 `packages/pdf`

```
packages/pdf/
├── src/
│   ├── index.ts
│   ├── render.ts                render(template, context) -> Buffer, the single entry point
│   ├── fonts.ts                 Bundled TTFs, registered once, size-asserted at boot
│   ├── styles.ts                The shared type scale, palette, table and clause stylesheet
│   └── naira.ts                 Naira glyphs and the en-dash/typography helpers used by the partials
├── templates.
│   ├── lease_v1.handlebars  sale_v1.handlebars  installment_v1.handlebars
│   ├── receipt_v1.handlebars  statement_v1.handlebars  owner_statement_v1.handlebars
│   ├── arrears_notice_v1.handlebars  notice_to_vacate_v1.handlebars
│   ├── title_release_v1.handlebars  payout_advice_v1.handlebars
│   ├── inspection_report_v1.handlebars  kyc_bundle_v1.handlebars
│   └── partials/
│       ├── header.hbs  footer.hbs  moneyTable.hbs  partyBlock.hbs  clause.hbs  signatureBlock.hbs
└── test/                       One render per template with fixture data; asserts page count
```

Twelve templates, versioned in the filename: `lease_v1` is never edited in place, a change means
`lease_v2`, and old `documents` rows keep pointing at `lease_v1`. The catalogue with each template's trigger
is [`12-documents-and-pdfs.md § 1`](./12-documents-and-pdfs.md#1-what-gets-generated).

### 5.9 `packages/logger`

```
packages/logger/src/
├── index.ts
├── logger.ts                    Pino instance, redaction list, base fields (env, version, requestId)
├── requestContext.ts            AsyncLocalStorage for requestId/traceId/userId
├── redact.ts                    The redaction list, exported so tests can assert against it
└── logger/test.ts
```

One logger, imported by the API, the web server, the admin, and the Inngest worker. Nothing else may
construct a logger, which is what makes the redaction list a guarantee rather than a convention.

### 5.10 `packages/media`

```
packages/media/src/
├── index.ts
├── cloudinary.ts               The configured client, upload and destroy signatures
├── upload.ts                    validateUpload(): mime, extension, size, dimension and count rules
├── url.ts                      signedUrl(), deliveryUrl(), responsive srcset from one transform set
└── transforms.ts                The named transforms (thumb, card, hero, document) with their params
```

Browser-safe: no service credentials. The server-only Cloudinary secret is read by `apps/api`, which
requests a signed upload from this package's client, and by nothing in the browser.
## 6. `supabase/`

```
supabase/
├── config.toml
├── migrations/
│   ├── 20260101000000_extensions.sql
│   ├── 20260101000100_enums.sql
│   ├── 20260101000200_schemas.sql               private, audit, storage-adjacent
│   ├── 20260101000300_identity.sql
│   ├── 20260101000400_asset.sql
│   ├── 20260101000500_contract.sql
│   ├── 20260101000600_money.sql
│   ├── 20260101000700_ops.sql
│   ├── 20260101000800_documents.sql
│   ├── 20260101000900_platform.sql
│   ├── 20260101001000_functions.sql             money arithmetic, reference generation, auth helpers
│   ├── 20260101001100_triggers.sql              invariants, audit_log, updated_at
│   ├── 20260101001200_indexes.sql
│   ├── 20260101001300_views.sql                 property_search, contract_balances, owner_payout_summary
│   ├── 20260101001400_rls_identity.sql
│   ├── 20260101001500_rls_asset.sql
│   ├── 20260101001600_rls_contract.sql
│   ├── 20260101001700_rls_money.sql
│   ├── 20260101001800_rls_ops.sql
│   ├── 20260101001900_rls_documents.sql
│   ├── 20260101002000_rls_platform.sql
│   ├── 20260101002100_grants.sql                Explicit grants; revoke default privileges
│   ├── 20260101002200_seed_permissions.sql
│   └── 20260101002300_seed_reference_sequences.sql
├── tests.
│   ├── _setup.sql
│   ├── identity_rls.test.sql
│   ├── asset_rls.test.sql
│   ├── contract_rls.test.sql
│   ├── money_rls.test.sql
│   ├── ops_rls.test.sql
│   ├── documents_rls.test.sql
│   ├── platform_rls.test.sql
│   ├── invariants.test.sql       Trigger-enforced rules
│   └── functions.test.sql        Money arithmetic and reference generation
└── seed.sql
```

Migration filenames are ordered `YYYYMMDDHHMMSS_name.sql`. Never edit an applied migration — add a new
one. See [`05-database-schema.md § Migration rules`](./05-database-schema.md#16-migration-rules).

## 7. Dependency rules

Enforced by Biome's import organisation plus a custom boundary lint and by Turbo's task graph.

```
                          ┌──────────────────────┐
                          │   packages/config    │  no deps
                          └──────────┬───────────┘
                                     │
          ┌──────────────────────────┼──────────────────────────┐
          ▼                          ▼                          ▼
 ┌────────────────┐        ┌───────────────┐           ┌─────────────┐
 │ packages/utils │        │ packages/types │           │ packages/ui │
 └───────┬────────┘        └───────┬───────┘           └──────┬──────┘
         │                         │                          │
         └────────────┬────────────┴──────────┬───────────────┘
                      ▼                       ▼
          ┌───────────────────┐   ┌─────────────────────┐
          │  packages/db      │   │ packages/api-client │
          │  (types, utils)   │   │ (types, utils)      │
          └─────────┬─────────┘   └──────────┬──────────┘
                    │                        │
                    └───────────┬────────────┘
                                ▼
          ┌────────────────────────────────────────────────┐
          │                  apps/api                      │
          │  the only consumer of the server-only packages  │
          └───┬──────────────────────┬──────────────────┬───┘
              │                      │                  │
              ▼                      ▼                  ▼
     ┌────────────────┐   ┌──────────────────┐  ┌──────────────┐
     │ packages/logger│   │ packages/emails   │  │ packages/pdf │
     │ packages/media │   │ packages/pdf     │  │              │
     └────────────────┘   └──────────────────┘  └──────────────┘
```

`packages/logger` is consumed by the web and admin servers as well; it is shown under the API because it is
the API that makes its guarantees meaningful. It has no dependency on any other Courtland package.

| Package | May import | Must never import |
|---|---|---|
| `config` | nothing | everything |
| `utils` | `config` | anything else |
| `types` | `config`, `utils` | `db`, `api-client`, `ui`, any app |
| `logger` | `config` | any other package, any app |
| `ui` | `config`, `utils`, `types` | `db`, `api-client`, `emails`, `pdf`, any app |
| `emails` | `config`, `utils`, `types` | `db`, `api-client`, `ui`, `pdf`, any app |
| `pdf` | `config`, `utils`, `types` | `db`, `api-client`, `ui`, `emails`, any app |
| `media` | `config`, `utils`, `types` | `db`, `api-client`, `ui`, `emails`, `pdf`, any app |
| `db` | `config`, `utils`, `types` | `api-client`, `ui`, `emails`, `pdf`, any app |
| `api-client` | `config`, `utils`, `types` | `db`, `ui`, `emails`, `pdf`, any app |
| `apps/api` | every package | — |
| `apps/web` | `config`, `utils`, `types`, `ui`, `api-client`, `logger` | `db`, `emails`, `pdf`, `media` |
| `apps/admin` | `config`, `utils`, `types`, `ui`, `api-client`, `logger` | `db`, `emails`, `pdf`, `media` |

Three rules carry most of the weight:

- **`packages/types` never imports from `packages/db`.** The wire contract must not depend on the
  database schema, or changing a column silently changes an API contract.
- **No app imports another app.** `apps/web` must not import from `apps/admin` even for a shared
  component. Shared means it belongs in `packages/ui`.
- **No browser bundle may contain a server-only package.** `emails`, `pdf`, `db` and `media` reach the
  browser only if it imports them, and the boundary lint fails the build/ `media` is the subtle one: it is
  browser-safe in code, but it is excluded from both frontends anyway so that a future change cannot pull a
  service credential into a client bundle.
## 8. Naming conventions

| Thing | Convention | Example |
|---|---|---|
| Files | kebab-case | `payment-intents.ts`, `use-contract-summary.ts` |
| React components | PascalCase file and symbol | `PropertyCard.tsx` → `PropertyCard` |
| Hooks | `use` prefix, camelCase file | `useContractSummary.ts` |
| Types | PascalCase, no `I` prefix | `PropertySummary`, `CreateIntentInput` |
| Zod schemas | PascalCase noun, `create`/`update` suffix | `createPropertySchema` |
| DB tables/columns | snake_case plural | `payment_intents`, `outstanding_kobo` |
| API JSON | camelCase | `outstandingKobo`, `paymentIntentId` |
| Enum values | snake_case | `under_offer`, `in_review`, `notice_to_vacate` |
| Route segments | kebab-case | `/properties/[slug]`, `/portal/tenant` |
| Refine resources | plural snake_case | `payment_intents` is rendered as "Payments" |
| Env vars | SCREAMING_SNAKE | `PAYSTACK_SECRET_KEY` |
| Turbo tasks | camelCase verb | `build`, `typecheck`, `db:generate` |

## 9. Root configuration files

### 9.1 `pnpm-workspace.yaml`

```yaml
packages:
  - apps/*
  - packages/*

catalog:
  react: ^19.2.0
  react-dom: ^19.2.0
  zod: ^4.1.0
  typescript: ^5.9.0
  drizzle-orm: ^0.44.0
  @supabase/supabase-js: ^2.58.0
  vitest: ^3.2.0
  @playwright/test: ^1.56.0
```

The catalog means a dependency version is declared once/ `apps/web/package.json` and `apps/api/package.json`
both say `"zod": "catalog:"`.

### 9.2 `turbo.json`

```jsonc
{
  "$schema": "https://turborepo.dev/schema.json",
  "globalDependencies": ["tsconfig.base.json", "biome.json"],
  "globalEnv": ["NODE_ENV"],
  "globalPassThroughEnv": ["VERCEL_RELATED_PROJECTS", "DATABASE_URL"],
  "tasks": {
    "build":     { "dependsOn": ["^build"], "outputs": ["dist/**", ".next/**", "!.next/cache/**"] },
    "typecheck": { "dependsOn": ["^build"], "outputs": [] },
    "lint":      { "dependsOn": ["^build"], "outputs": [] },
    "test":      { "dependsOn": ["^build"], "outputs": ["coverage/**"] },
    "test:e2e":  { "dependsOn": ["build"], "cache": false },
    "db:generate": { "cache": false, "outputs": ["supabase/migrations/**"] },
    "dev":       { "cache": false, "persistent": true }
  }
}
```

`VERCEL_RELATED_PROJECTS` must be in `passThroughEnv`. Turborepo 2/x runs tasks in strict env mode, so
without it Vercel's monorepo build drops unaffected-project optimisation.

### 9.3 `biome.json`

Biome replaces ESLint and Prettier. Note that Next.js 16 removed `next lint` and no longer runs lint
during `next build`, so `lint` is wired explicitly into Turbo and CI — otherwise linting silently stops
running on upgrade.

```jsonc
{
  "$schema": "https://biomejs.dev/schemas/2.2.0/schema.json",
  "extends": ["@courtland/config/biome/base.json"],
  "files": { "includes": ["**", "!**/dist", "!**/.next", "!**/coverage", "!**/.turbo"] },
  "overrides": [
    { "includes": ["supabase/**/*.sql"], "linter": { "enabled": false } }
  ]
}
```

### 9.4 `knip.json`

```jsonc
{
  "$schema": "https://unpkg.com/knip@5/schema.json",
  "workspaces": {
    "apps/web":     { "entry": ["src/app/**/{layout,page,route,loading,error,not-found}.tsx!", "e2e/**/*/spec.ts!", "next.config.ts!"] },
    "apps/admin":   { "entry": ["src/main.tsx!", "e2e/**/*/spec.ts!", "vite/config.ts!"] },
    "apps/api":     { "entry": ["src/server.ts!", "src/bin/*.ts!", "test/**/*/test.ts!"] },
    "packages/*":   { "entry": ["src/index.ts!", "test/**/*/test.ts!"] },
    "packages/emails": { "entry": ["src/index.ts!", "src/templates/**/*.handlebars!", "src/partials/**/*.hbs!"] },
    "packages/pdf":    { "entry": ["src/index.ts!", "src/render.ts!", "templates/**/*.handlebars!", "templates/partials/**/*.hbs!"] }
  },
  "ignoreDependencies": ["@biomejs/biome"],
  "rules": {
    "files": "error",
    "dependencies": "error",
    "unlisted": "error",
    "exports": "error",
    "types": "warn",
    "enumMembers": "warn",
    "classMembers": "error"
  }
}
```

The `emails` and `pdf` workspaces exist so that Handlebars templates are Knip *entries* rather than
unknown files. That is what makes the partial-usage check real: `partials/moneyTable.hbs` is reported as
unused if no template includes it, so a template that stops referencing a partial fails the build rather
than leaving the partial behind.

`exports: "error"` is the rule that makes "no dead code" enforceable. If a helper is exported and nothing
imports it, CI fails.
## 10. Related documents

- Container responsibilities and trust boundaries: [`01-architecture.md`](./01-architecture.md)
- Pinned dependency versions: [`03-technology-stack.md`](./03-technology-stack.md)
- The file-by-file build order that produces these directories: [`roadmap.md`](./roadmap.md)
- Dead-code enforcement detail: [`roadmap.md § Dead-code rules`](./roadmap.md#dead-code-rules)
