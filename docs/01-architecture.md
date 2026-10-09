# 01 - Architecture


## 1. System context

Courtland is four deployables and six managed services. Nothing else runs on our infrastructure.

```
┌────────────────────────────────────────────────────────────────────────────┐
│                                  USERS                                    │
│   Visitor (browser)   Tenant (browser)   Buyer (browser)   Owner (browser)│
│   Staff (browser)                                                            │
└───────┬────────────────────────────────────────────────────────────────────┘
        │ HTTPS
        ▼
┌───────────────────────┐            ┌───────────────────────┐
│  apps/web             │            │  apps/admin           │
│  Next.js 16 (Vercel)  │            │  React 19 + Refine 5  │
│  public + 3 portals   │            │  (Vercel, SPA)        │
└───────────┬───────────┘            └───────────┬───────────┘
            │  HTTPS, Bearer JWT                 │  HTTPS, Bearer JWT
            └───────────────┬────────────────────┘
                            ▼
            ┌───────────────────────────────┐
            │  apps/api                     │
            │  Express 5 + Drizzle (Render)  │◀────── Render cron (POST)          
            │                               │◀────── Inngest serve endpoint
            └──┬────────┬────────┬───────────┘
               │        │        │
               ▼        ▼        ▼
        ┌──────────┐ ┌───────┐ ┌──────────────┐
        │ Supabase │ │Paystack│ │ Cloudinary   │
        │ Postgres │ │        │ │              │
        │ + Auth   │ └───────┘ └──────────────┘
        │ + Storage│     ▲          ▲
        └──────────┘     │          │
               ▲         │          │
               └──── Resend / SMS provider ────┘
```

## 2. Containers

| # | Container | Runtime | Hosting | Responsibility |
|---|---|---|---|---|
| C1 | `apps/web` | Next.js 16.3, Node 22+, React 19.2 | Vercel | Public listing pages. Tenant, buyer and owner portals. Server Components for read paths. Server Actions for mutations that do not need payment. |
| C2 | `apps/admin` | React 19 + Refine 5, Vite, React Router 7 | Vercel | Staff back office. Client-heavy CRUD. Never publicly indexable. |
| C3 | `apps/api` | Express 5, Node 24, Drizzle | Render web service | The only component permitted to hold privileged credentials. Authorization, business rules, money movement, document generation, outbound webhooks. |
| C4 | Supabase | Managed Postgres + GoTrue | Supabase Cloud | Identity, relational data, row-level security. Backed up daily. |
| C5 | Inngest | Managed | Inngest Cloud | Durable multi-step workflows triggered by domain events. |
| C6 | Render Cron | Managed | Render | Schedules. Issues authenticated HTTP GETs to `apps/api`/ |
| C7 | Paystack | Managed | Paystack | Card and transfer collection, subaccounts, splits, refunds. |
| C8 | Cloudinary | Managed | Cloudinary | Listing imagery (public) and legal documents (authenticated)/ |
| C9 | Resend + SMS provider | Managed | Resend, Twilio or MSG | Transactional email and SMS/WhatsApp delivery. |

### 2.1 Why an API at all

The alternative — Next.js Route Handlers talking directly to Postgres — was rejected. The reasons, in
order of weight:

1. **Money and legal documents must not run in a serverless request lifecycle.** Webhook handlers that
   receive `charge.success` need to make a Paystack call, generate a PDF, write a ledger entry and send
   an email. On Vercel that is a cold start and a hard timeout, in the exact path where a failure means
   a customer's rent is paid and the system says it is not.
2. **One authorization implementation.** C1 and C2 are two different frameworks with two different
   client stacks. If authorization lived in the frontend, they would drift immediately. RLS plus a
   single Express policy layer is testable once.
3. **Secrets.** Paystack secret key, service role key, Cloudinary secret, Resend key, Inngest signing
   key. They must never be reachable from a browser bundle. C3 is the only place they exist.
4. **Deployability.** Render gives C3 a long-lived process, a real Postgres connection, and cron. It is
   the right home for a stateful, integration-heavy service.
C1 still has Server Actions, but only for read-through mutations on behalf of the signed-in user that do
not move money. Anything that does is a `POST` to C3.

## 3. Trust boundaries

Four boundaries matter. Everything in §4 and §5 respects them.
### B1 — Browser to API

Untrusted. The browser holds a Supabase access token, nothing else. Every request to C3 carries
`Authorization: Bearer <token>`. C3 verifies the JWT signature, then runs every query inside a
transaction with `set_config('request.jwt.claims.sub', ...)` so Postgres RLS applies exactly as it would
for a direct PostgREST call. The API never trusts a role sent by the client; roles are read from
`user_roles`, which the client cannot write.
### B2 — API to Database

Trusted, but still RLS-scoped. C3 uses two connections:

| Connection | Credentials | RLS | Used for |
|---|---|---|---|
| RLS-scoped | `DATABASE_URL` + the caller's claims, inside `withRls(tx)` | Enforced | Every request handler. |
| Privileged | `SUPABASE_SERVICE_ROLE_KEY`-backed admin client | Bypasses RLS | Background jobs, webhook processing, reconciliation, staff bulk actions. |

The privileged client is imported only inside `apps/api/src/db/admin.ts` and
`apps/api/src/jobs/**`. A CI check greps for it outside those paths. See
[`19-security.md § Secret containment`](./19-security.md#6-secrets).

### B3 — Third party to API (webhooks)

Untrusted until verified. Three inbound webhook receivers, each with a constant-time signature check
before any parsing of business logic:

| Endpoint | Provider | Header | Algorithm |
|---|---|---|---|
| `POST /v1/webhooks/paystack` | Paystack | `x-paystack-signature` | HMAC-SHA512 of the raw body, keyed with the secret key |
| `POST /v1/webhooks/cloudinary` | Cloudinary | `x-cld-signature`, `x-cld-timestamp` | HMAC-SHA of `timestamp + body`, keyed with the API secret, with a replay window check |
| `POST /v1/webhooks/resend` | Resend | `svix-id`, `svix-signature`, `svix-timestamp` | Svix HMAC-SHA256 over `svix-id.svix-timestamp.body` |

Every webhook is persisted to `webhook_events` before processing and marked `processed` or `failed`
after. Paystack retries on non-2xx, so the handler must be idempotent and must return `200` within
five seconds. See [`10-payments-paystack.md § Webhooks`](./10-payments-paystack.md#4-webhooks).

### B4 — Render cron to API

Not public/ `POST /v1/internal/jobs/{name}/enqueue` requires `Authorization: Bearer` equal to `INTERNAL_JOB_TOKEN`,
compared with `timingSafeEqual`. The route is not mounted under `/v1` and the API's CORS allowlist does
not include it.
## 4. Request paths

### 4.1 Public listing page

```
Browser → apps/web  /properties/[slug]
  Next.js RSC renders the page
    → server-side fetch to apps/api GET /v1/properties/:slug
       → withRls(anon) → Postgres (RLS: only status='published')
    → returns JSON, RSC renders HTML, streamed to browser
```

No Supabase key is used from C1 for data reads. Reads go through C3 so that the query surface is
auditable and so listing logic (visibility rules, price display permissions, plot masking) lives in one
place.
### 4.2 Tenant pays rent

```
1. Tenant opens /portal/tenant/payments
   → C1 RSC → GET /v1/tenant/invoices  → Postgres (RLS: contracts where payer_id = auth.uid())
2. Tenant clicks "Pay now" on an invoice
   → C1 client component POST /v1/payments/intents { contractId, intentId }
3. C3, inside one transaction:
     a. locks the intent row          SELECT ... FOR UPDATE
     b. re-checks status is unpaid
     c. computes the split snapshot from the lease's owner + management fee
     d. writes an outbox row         outbox_events(event_type='payment.intent.created')
     e. commits
4. C3 returns { intentId, amountKobo, reference }
5. C1 POSTs to C3 /v1/payments/intents/:id/initialize
   → C3 calls Paystack transaction/initialize with subaccount + transaction_charge + metadata
   → returns authorization_url
6. Browser redirects to Paystack, pays, returns to /portal/tenant/payments?intent=...
7. Paystack POSTs /v1/webhooks/paystack
   → verify signature → upsert webhook_events → respond 200 immediately
   → emit Inngest event payment.succeeded
8. Inngest runs the paymentSucceeded workflow:
     a. verify the transaction with Paystack (never trust the webhook body alone)
     b. mark intent succeeded, insert payments_ledger
     c. insert ledger_allocations (fee + principal)
     d. decrement contracts.outstanding_kobo
     e. generate receipt PDF → Cloudinary authenticated asset → documents row
     f. enqueue the receipt notice
     g. mark webhook_events processed
9. Tenant's portal polls / revalidates and sees the receipt.
```

Step 8(a) is deliberate. The webhook tells us something happened; the Paystack verify call tells us
what. We do not write to the ledger from the webhook payload.
### 4.3 Staff publishes a listing

```
Staff → apps/admin  /properties/:id/edit
  → Refine useUpdate → dataProvider.updateOne
    → PATCH /v1/admin/properties/:id
      → withRls(admin) → UPDATE properties SET status='in_review'
  → status becomes publishable
  → POST /v1/admin/properties/:id/publish
    → C3 validates completeness (≥1 photo, price set, land_details if land)
    → UPDATE status='published', published_at=now()
    → outbox listing.published → Inngest → purge C1's Next.js cache tag
```

### 4.4 The cron tick

```
Render Cron "* * * * *"  ->  node dist/cron.js  ->  exits
  |  reads apps/api/src/jobs/crons.ts, finds the jobs due for this Lagos minute
  +-> POST /v1/internal/jobs/<job>/enqueue   Authorization: Bearer INTERNAL_JOB_TOKEN
       +-> API enqueues one Inngest event per job and returns 202 immediately
            +-> Inngest runs each job independently, with its own retries and concurrency

Examples of what a single tick does:
  00:00  payment-reconcile       -> event payment.reconcile
  03:00  arrears-sweep           -> event arrears.sweep
  03:15  contract-expiry         -> event contract.expiry
  */5   reconcile-outbox         -> event outbox.reconcile
```

The cron service computes nothing and holds nothing: it works out which minute it is and asks. The API
decides nothing about *when*: it answers `202` and lets Inngest own the timing, so a late tick delays a job
by seconds rather than by a whole schedule period. The full catalogue is
[`11-scheduling-and-jobs.md § 3`](./11-scheduling-and-jobs.md#3-job-catalogue).

## 5. Cross-cutting concerns

| Concern | Where it lives | Notes |
|---|---|---|
| Authentication | Supabase GoTrue; session refresh in C1 (`proxy.ts`) and C2 (`authProvider`) | See [`06-authentication.md`](./06-authentication.md) |
| Authorization | `packages/types` permission slugs → `role_permissions` table → RLS policies + `authorize()` | See [`07-authorization-and-rls.md`](./07-authorization-and-rls.md) |
| Validation | Zod schemas in `packages/types`, one per request and response | The API's OpenAPI document is generated from the same schemas, so it cannot drift. |
| Money | Integer kobo throughout. No floats anywhere, including in the frontend. | `packages/utils/src/money.ts` is the only place that formats. |
| Time | All timestamps are `timestamptz` stored in UTC. Display is `Africa/Lagos`. Nigerian schedules (rent due dates) are stored as local `date` values. | |
| Errors | RFC 9457 problem+json with a stable `code` string. | See [`08-api-design.md § Errors`](./08-api-design.md#44-errors) |
| Idempotency | `Idempotency-Key` header on all unsafe methods; `idempotency_keys` table with a unique index. | See [`08-api-design.md § Idempotency`](./08-api-design.md#7-idempotency) |
| Audit | `audit_log` written by a Postgres trigger on mutating tables, plus explicit entries for staff actions. | Append-only. No update or delete policy. |
| Observability | `pino` structured logs in C3, Sentry in C2/C3, `@vercel/otel` in C1. W3C Trace Context propagates across all three. | See [`21-observability.md`](./21-observability.md) |
| Caching | C1 uses Next.js 16 Cache Components with tags; C3 has no cache. C2 relies on TanStack Query with short stale times on money data. | Never cache a balance in C1. |

## 6. Deployment topology

| Environment | C1 web | C2 admin | C3 api | Supabase | Paystack | Cloudinary | Resend |
|---|---|---|---|---|---|---|---|
| `local` | `next dev` :3000 | `vite dev` :5173 | `tsx watch` :4000 | Supabase CLI local stack :55432 | Test mode | Dev cloud | Test domain |
| `staging` | Vercel project `courtland-staging` | Vercel project `courtland-admin-staging` | Render web service `courtland-api-staging` + cron | Supabase project `courtland-staging` | Test mode | Dev cloud, `courtland-staging` folder | `staging.courtland.ng` |
| `production` | Vercel project `courtland` | Vercel project `courtland-admin` | Render web service `courtland-api` + cron | Supabase project `courtland` | Live keys | Prod cloud, `courtland` folder | `courtland.ng` |

Paystack test keys are used in `local` and `staging`. Live keys only in `production`. This is enforced
by [`22-configuration-and-environments.md § Key parity`](./22-configuration-and-environments.md#10-environment-parity)
and by a startup assertion in `apps/api/src/env.ts`.

See [`23-ci-cd-and-deployment.md`](./23-ci-cd-and-deployment.md) for pipeline and release mechanics.

## 7. Failure modes and how the system behaves

| Failure | Behaviour | User-visible effect | Mitigation |
|---|---|---|---|
| Paystack webhook never arrives | C3's `payment-reconcile` job queries Paystack's transaction list for unrecorded references | Tenant sees "payment pending" for up to an hour, then it resolves | The webhook handler also runs on the tenant's return-to-app poll if the reference is unrecorded, but only after verifying with Paystack. |
| Webhook arrives twice | `webhook_events` unique on `(provider, event_id)`; second insert is a no-op | None | Idempotent handler. |
| Email provider down | The notice row stays `queued`; the hourly `notices.flush` job retries | Receipt not delivered but downloadable in the portal | Portal download is the source of truth, email is convenience. |
| Inngest down | Events queue; jobs run when it recovers, or are replayed manually from the dashboard | Reminders delayed | `outbox_events` rows remain unpublished; `outbox.publish` hourly job as a belt-and-braces publisher. |
| Render deploy with a bad migration | `preDeployCommand` fails, the deploy aborts, the previous version keeps serving | None | Migration is separate from app deploy and reviewed. |
| A single PDF generation throws | That Inngest step retries, then fails the run. The payment is already recorded. | Receipt delayed; payment correct | Steps are ordered so ledger writes happen before document generation, and the portal renders a plain receipt from ledger data if the PDF is missing. |
| RLS policy has a bug | API returns fewer rows than expected; never more | Under-disclosure | pgTAP tests assert both allow and deny for every policy. A policy that over-permits fails CI. |

## 8. Architectural constraints

These are rules, not preferences. Violating one is a review blocker.

1. **No Supabase client in C1 or C2 for data access.** Only for auth session handling, and only with the
   anon key. All reads go through C3.
2. **No direct Postgres connection from C1 or C2.** Ever.
3. **No business logic in C1 or C2.** A Server Action may call C3 and shape a response; it may not
   compute a fee, decide a state transition, or write a ledger row.
4. **Every mutating API route has a Zod request schema and an `Idempotency-Key` requirement.**
5. **Every RLS-sensitive table has a policy per operation, and a matching pgTAP test.**
6. **No `console.log` in C1, C2 or C3.** Structured logging only.
7. **No `any` in application code.** Biome `noExplicitAny` is an error.
8. **Every exported symbol has a consumer**, verified by Knip in CI. This is the rule that produces the
   "no dead code" guarantee the project is built around.

## 9. Related documents

- Deployment and CI detail: [`23-ci-cd-and-deployment.md`](./23-ci-cd-and-deployment.md)
- Trust boundary and threat detail: [`19-security.md`](./19-security.md)
- Package import rules: [`02-repository-structure.md § Dependency rules](./02-repository-structure.md#7-dependency-rules)
- Build order: [`roadmap.md`](./roadmap.md)
