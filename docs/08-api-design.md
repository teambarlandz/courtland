# 08 — API design

One Express 5 application at `apps/api` serves every backend client: the public website, the three
portals, the admin panel, Render cron, and Inngest. It is a modular monolith, not a set of microservices.

## 1. Why one service

| Option | Verdict |
|---|---|
| **Modular monolith** | Chosen. Six domains, one deployable, one schema, no network hops. The team is small; a service boundary tax is not affordable. |
| Microservices per domain | Rejected. Six Express services in front of six databases multiply failure modes for no present benefit. |
| Serverless functions | Rejected. Long-running document generation and reconciliation jobs need real processes. |
| Supabase Edge Functions for all business logic | Rejected. Edge Functions are a poor fit for PDF generation, crypto, and multi-step Paystack reconciliation. Retained only for the webhook receiver, which benefits from a low-latency public endpoint. |

Domain modules live in `apps/api/src/modules/*` and communicate through in-process function calls or the
`outbox_events` table. There are no HTTP calls between modules and no cross-module `UPDATE` outside the
owning module.

```
apps/api/src/
  app.ts                 the Express app assembly
  server.ts              process entry: HTTP listener
  worker.ts              process entry: Inngest serve + cron drainer
  modules/
    auth/                OTP, sessions, identity
    properties/          listings, media, units, land
    contracts/           leases, sales, parties, schedules
    money/               ledger, intents, allocations, reconciliation
    payouts/             Paystack transfers, runs, approvals
    maintenance/         tickets, quotes, approvals
    documents/           Cloudinary, PDF, storage
    notifications/       email, SMS, in-app notices
    admin/               staff-only operations, audit
    search/              filters, saved searches
  platform/              cross-cutting: db, auth, http, queue, logger
  db/                    adminDb, withRls, migrations runner
  jobs/                  handlers registered with Inngest
  bin/                   one-off scripts: import, reindex, backfill
```

## 2. URL shape

```
https://api.courtland.com.ng/v1/<resource-plural>
```

| Rule | Example |
|---|---|
| Plural nouns, lowercase, hyphenated | `/v1/property-submissions`, `/v1/payout-accounts` |
| Nest at most one level | `/v1/contracts/{id}/payments` |
| No verbs in paths | `POST /v1/contracts/{id}/terminate`, not `/v1/terminateContract` |
| Non-CRUD actions are sub-resources or verbs on the parent | `POST /v1/payouts/{id}/approve` |
| Filters are query params, never path segments | `/v1/properties?state=Lagos&type=flat` |
| Pagination is `cursor` + `limit` | `/v1/properties?cursor=eyJpZCI6…&limit=24` |
| Every response carries `x-request-id` | |

Reserved prefixes: `/v1/auth/*` for identity, `/v1/integrations/*` for inbound webhooks and provider
hooks, `/v1/internal/*` for Render cron and Inngest, `/health` for probes.

## 3. Conventions

| Concern | Rule |
|---|---|
| Case | JSON is camelCase. Database columns are snake_case. Drizzle's `casing` option maps one to the other, so the transformation is declarative, never handwritten. |
| Money | Integer kobo in JSON, always as a JSON number. Never a string, never a float. `amountKobo: 45000000`. Maximum safe integer is 9,007,199,254,740,991 kobo (₦90 trillion), which no contract will reach. |
| Dates | ISO 8601 UTC with a `Z`. `2026-09-30T00:00:00Z`. A date without a time, like a lease start, is stored as a `date` column and serialised as `2026-09-30`. |
| Enums | Lower snake_case strings, not numbers. `status: "under_offer"`. |
| Booleans | Real booleans. |
| Null | Explicit `null` for "known absent". A missing key means "not requested". PATCH semantics depend on this distinction. |
| Unknown fields | Rejected with 422 by the Zod schema's `.strict()`. A typo in a field name must fail loudly. |
| Timezone | All business logic in `Africa/Lagos` via `TZ`. Stored UTC. Render sets `TZ=Africa/Lagos` in the environment. |

## 4. Response shapes

### 4.1 Single resource

```json
{
  "data": {
    "id": "9f2c1e4a-...",
    "reference": "CL-2026-000412",
    "title": "3-bed flat, Lekki Phase 1",
    "status": "published",
    "rent": { "amountKobo": 45000000, "period": "annual" },
    "createdAt": "2026-02-11T09:14:00Z",
    "updatedAt": "2026-08-30T16:02:11Z"
  }
}
```

### 4.2 Collection

```json
{
  "data": [
    { "id": "…", "title": "…" },
    { "id": "…", "title": "…" }
  ],
  "meta": {
    "nextCursor": "eyJpZCI6IjlmMmMxZTRhIn0",
    "hasMore": true,
    "count": 24
  }
}
```

`meta.count` is the size of the current page, not the total. Counting every row to show a total is
expensive on `properties` and the number is not used. Filters in the UI use "Load more".

### 4.3 Cursor pagination

Keyset, not `OFFSET`. `OFFSET 10000` makes Postgres read and discard ten thousand rows, and it
misbehaves when rows are inserted mid-scroll.

```
GET /v1/properties?limit=24&sort=-createdAt
→ nextCursor = base64url(JSON.stringify({ createdAt: '2026-08-30T16:02:11Z', id: '9f2c…' }))
→ GET /v1/properties?limit=24&sort=-createdAt&cursor=eyJjcmVhdGVkQXQiOiIyMDI2LTA4LTMw…
```

The cursor is the last row's sort key **and** its id. Including the id makes the ordering total, so rows
with identical timestamps cannot be skipped or repeated. Every sortable column has a composite index
ending in `id`.

### 4.4 Errors

RFC 9457 `application/problem+json`.

```http
HTTP/1.1 422 Unprocessable Content
Content-Type: application/problem+json
```

```json
{
  "type": "https://docs.courtland.com.ng/errors/validation-failed",
  "title": "Validation failed",
  "status": 422,
  "detail": "rent.amountKobo must be greater than 0",
  "instance": "/v1/contracts/9f2c…",
  "code": "validation_failed",
  "requestId": "req_01J9X4M2K7",
  "errors": [
    {
      "path": "rent.amountKobo",
      "code": "too_small",
      "message": "Must be greater than 0"
    }
  ]
}
```

| Field | Required | Purpose |
|---|---|---|
| `type` | yes | Stable URI into the error catalogue. Clients switch on this or on `code`, never on `detail`. |
| `title` | yes | Short human-readable summary, not specific to this occurrence. |
| `status` | yes | Mirrors the HTTP status. |
| `detail` | yes | Human-readable, specific. May contain field names. Never contains a stack trace, SQL, or an internal identifier. |
| `instance` | yes | The request path. |
| `code` | yes | Stable machine code, kebab-case. This is what clients switch on. |
| `requestId` | yes | Matches the `x-request-id` response header. What support asks for. |
| `errors` | when validation | Field-level detail. |

`detail` is safe to display to a user; `code` is safe to branch on. That split is the contract.

### 4.5 The error catalogue

Every error the API can return is enumerated in `packages/types/src/api/errors.ts`, with its code,
status, and whether it is safe to show a user. The Zod schemas, the service layer, and the error middleware
all reference the same enum, so a code cannot exist in one place and not the other.

| `code` | Status | Shown to user | Meaning |
|---|---:|:---:|---|
| `validation_failed` | 422 | yes | Schema failed. `errors[]` lists the fields. |
| `unauthenticated` | 401 | yes | No or invalid token. |
| `token_expired` | 401 | yes | Access token expired; the client should refresh and retry once. |
| `forbidden` | 403 | yes | Authenticated but lacks the permission. Includes the required permission for the audit trail. |
| `not_found` | 404 | yes | No such resource, or not visible to this caller. Indistinguishable on purpose. |
| `conflict` | 409 | yes | State conflict. `detail` names the illegal transition. |
| `idempotency_key_reused` | 409 | yes | Same key, different request body. |
| `idempotency_in_progress` | 409 | yes | Same key, first request still running. |
| `rate_limited` | 429 | yes | Includes `Retry-After`. |
| `business_rule_violation` | 422 | yes | Schema-valid but prohibited. Example: settling a contract that is not `active`. |
| `payment_required` | 402 | yes | An upstream provider rejected. Detail is the provider's safe message. |
| `provider_error` | 502 | yes | Upstream failed. `requestId` correlates with the provider's own reference. |
| `verification_pending` | 202 | yes | Accepted, awaiting an asynchronous step. Returns a `pollUrl`. |
| `internal_error` | 500 | **no** | Generic. The real cause is in the logs, keyed by `requestId`. |

`not_found` is returned rather than `forbidden` when the caller cannot see the row. Saying "403" confirms
the resource exists, which is an enumeration leak. The distinction "you cannot see it" versus "you can see
it but cannot do this" is only drawn when the caller is already allowed a `select`.

## 5. Middleware chain

Order matters. Each entry is one file in `apps/api/src/platform/http/middleware/`.

| # | Middleware | Does |
|---:|---|---|
| 1 | `requestContext` | Assigns `x-request-id` if absent, or validates the inbound one against a UUID pattern. Creates the AsyncLocalStorage context that the logger and error handler read. Runs before everything so even a body-parse failure is traceable. |
| 2 | `httpLogger` | Logs method, path, status, duration, user agent, and the resolved user id. Never the body. |
| 3 | `cors` | Allowlist from `CORS_ORIGINS`. Credentials enabled. Only the four known origins. |
| 4 | `helmet` | Security headers, with a CSP tuned for the API's JSON-only responses. |
| 5 | `rateLimit` | Global limiter, then a per-route limiter for auth, OTP verification, payment initiation, and listing search. |
| 6 | `bodyParser` | `express.json({ limit: '256kb' })`. A 256 KB limit matters: document uploads go directly to Cloudinary from the browser with a signed upload token, never through the API. |
| 7 | `authenticate` | Resolves the credential: the session cookie if present, otherwise `Authorization: Bearer`. Extracts the token, verifies via `supabase.auth.getUser(token)`. Sets `req.auth = { userId, email, phone, roles, permissions, sessionVersion, via }`. Does **not** trust the JWT body for identity; `getUser` hits the Auth server. |
| 8 | `requireCsrf` | On unsafe methods, if the request authenticated via cookie, requires a valid `X-CSRF-Token` and an allowlisted `Origin`. See §5.1. |
| 9 | `requirePermission(p)` | 403 unless `req.auth.permissions` includes `p`. |
| 10 | `requireRoles(...)` | For the few routes that genuinely need a role rather than a permission, such as the admin bootstrap check. |
| 11 | `idempotency` | On unsafe methods, resolves or reserves the `Idempotency-Key`. See §7. |
| 12 | `validate` | `validate({ body, query, params })` against a Zod schema; hands back a typed, parsed value. |
| 13 | `handler` | The route. |
| 14 | `notFound` | 404 `problem+json`. |
| 15 | `errorHandler` | Typed errors to problem+json. Untyped errors become `internal_error` with the stack logged but not returned. |

`authenticate` uses `getUser(token)` rather than trusting a decoded JWT. A signature-valid but
superseded token still resolves through the Auth server, which is what makes immediate revocation in
[`07-authorization-and-rls.md § Revocation`](./07-authorization-and-rls.md#7-jwt-staleness-and-revocation)
possible. The cost is one Auth round trip per request; the API caches the auth lookup for 30 seconds in
Redis keyed on the token hash, so the common case is a cache hit.

`req.auth.via` is `'cookie'` or `'bearer'`, and the two paths are treated differently downstream: `via`
decides whether `requireCsrf` applies, and the error handler never echoes a bearer token in a log line.

### 5.1 CSRF

The browser path is cookie-based and the web app and the API are **different sites**, so `SameSite=Lax` buys
nothing: a `Lax` cookie is not sent on the cross-site `fetch` a Client Component makes, and forcing
`SameSite=None` to make it work hands the cross-site POST problem straight back. The defence is therefore
explicit and has three parts, all required:

1. **Double-submit token.** `POST /v1/auth/otp/verify` and `GET /v1/auth/csrf` set a second cookie,
   `courtland-csrf`, holding a random 32-byte value that is **not** `HttpOnly` — the client must read it to
   echo it back. Unsafe requests must send it in `X-CSRF-Token`. The API compares it to the cookie with a
   constant-time compare. An attacker's page on another origin can make the browser send the cookie, but
   cannot read it, so it cannot produce a matching header.
2. **Origin allowlist.** Every unsafe request must carry an `Origin` present in `CORS_ORIGINS`, compared as
   an exact string. A missing `Origin` on an unsafe request is rejected outright, never treated as
   "probably a server".
3. **`SameSite=None; Secure` on the session cookie,** so the token survives the cross-site hop and is
   useless over plaintext.

`requireCsrf` runs after `authenticate` and applies only when `req.auth.via === 'cookie'`. Bearer callers
skip it: a header cannot be set by a form post, so there is no attack to prevent, and the machine callers
have no cookie jar to protect.

```
GET  /v1/auth/csrf                  ->  200 { csrfToken }  and Set-Cookie: courtland-csrf
POST /v1/auth/otp/verify             ->  sets both cookies, returns the profile and redirectTo
GET  /v1/portal/leases               <-  cookie
POST /v1/portal/leases               <-  cookie + X-CSRF-Token
POST /v1/payments/intents            <-  bearer (Inngest, scripts) or cookie + X-CSRF-Token
```

`GET /v1/auth/csrf` exists for one case: a tab that was open long enough for the CSRF cookie to be
discarded, or a Client Component that mounted without a prior `otp/verify`. It is rate limited like any
other unauthenticated endpoint and returns a fresh token rather than a cached one.

A browser failure here is a `403` with `type: https://courtland.com.ng/problems/csrf`, never a silent
redirect, because a silent redirect hides the misconfigured client.

The Supabase SMS hook is a bearer-authenticated endpoint with no CORS allowance for browsers, so it is
outside this section entirely.

## 6. Versioning

The major version is in the path (`/v1`). Additive changes ship without a version bump: a new optional
response field, a new query parameter, a new enum value that older clients ignore.

| Change | v1 compatible? | Action |
|---|---|---|
| New optional request field | yes | Ship. |
| New response field | yes | Ship. Clients must ignore unknown fields. |
| New enum value | yes, if clients treat unknown values as "unknown" | Ship, and document the tolerance requirement. |
| New required request field | **no** | New version, or make it optional with a default. |
| Renaming or removing a field | **no** | New version. |
| Changing a money field's unit | **no, ever** | Never. kobo is permanent. |
| Changing an error code's meaning | **no** | New version. |

Deprecation is announced in the API changelog, the docs, and a `Deprecation` and `Sunset` header on the
affected endpoint. Two minor versions of notice before removal.

## 7. Idempotency

Every unsafe request may carry `Idempotency-Key: <uuid>`. Required on payments, payouts, contract
state transitions, and document generation. Optional elsewhere.

```
POST /v1/payment-intents
Idempotency-Key: 8f14e45f-ea1c-4b3f-9a2d-1c7b8e9f0a11

1. INSERT INTO idempotency_keys (key, user_id, method, path, request_hash, status)
   VALUES (…, 'in_progress')
   ON CONFLICT DO NOTHING
2. If no row was inserted:
     a. Fetch the existing row.
     b. If request_hash differs          → 409 idempotency_key_reused
     c. If status = 'in_progress'        → 409 idempotency_in_progress
     d. If status = 'completed'          → replay response_code and response_body verbatim
3. Run the handler. On success, UPDATE ... SET status='completed', response_code, response_body.
   On a 5xx, DELETE the row so the client can retry cleanly.
```

The request hash is SHA-256 of the canonical body, so a key reused with different content is caught
instead of silently returning the wrong cached response. A replayed response returns the original
`201` and `Location` header, not a `200`, so a client that retries after a network timeout sees the same
outcome it would have seen the first time.

Failed requests delete their reservation. A `409` on a validation error would otherwise pin the key
forever and the client's retry would never work.

## 8. PATCH, PUT, DELETE

| Method | Semantics |
|---|---|
| `GET` | No side effects. Cacheable with `ETag`. |
| `POST` | Creates, or performs a non-idempotent action. Idempotency-Key supported and often required. |
| `PUT` | Full replacement. Rarely used; the API has almost no true PUTs. |
| `PATCH` | Partial update. Fields absent from the body are untouched. `null` clears a nullable field. An empty object is a no-op that returns the current resource, which keeps retrying safe. |
| `DELETE` | Soft delete where history matters (`properties.deleted_at`), hard delete only for drafts with no dependents. A soft-deleted row still 404s. |

Patch schemas are `.strict()` and validated per field. A `PATCH` on `properties` with `{"status": "published"}`
from an owner passes validation and fails the RLS `with check`, which surfaces as `business_rule_violation`
(422), not 403 — the user is allowed to edit the row, they are just not allowed to make that change.

## 9. Pagination, filtering, sorting

| Concern | Rule |
|---|---|
| Pagination | Cursor, always. `limit` defaults to 24, max 100. |
| Sorting | Whitelist of sortable columns per resource. `sort=-createdAt` for descending. Unknown column → 422. |
| Filtering | Whitelist per resource, validated by Zod. Unknown filter → 422. |
| Full-text search | `q` on properties and owners, through Postgres FTS on `properties.search_document`. Backed by a GIN index. |
| Facet counts | `GET /v1/properties/facets` returns counts by state, type, and bedroom count for the current filter, excluding the filtered dimension itself so the UI can show "Lagos (412)" next to a Lagos filter. |
| Geo filter | `bbox` or `radiusKm` + `near` for the map view. Uses GiST on `land_details.boundary_geojson` and a point column on `properties`. |

No endpoint accepts a raw sort or filter expression. A whitelist is not paranoia about SQL injection —
Drizzle parameterises — it is about cost: an unindexed sort on 40,000 rows is a table scan and a bill.

## 10. Endpoint catalogue

Every row is implemented. Nothing here is aspirational; if an endpoint is not needed by a client, it is
not listed and does not exist. This is the anti-dead-code rule for the API. Rows assemble in
`apps/api/src/routes/index.ts`, mounted at `/v1` by `app.ts`; each row below names the handler
module that owns it once routes land (Phase 4+). `GET /health` is the exception: it lives in
`apps/api/src/routes/health.ts`, mounted outside the limiter and everything else.

### Auth

| Method | Path | Permission | Notes |
|---|---|---|---|
| `POST` | `/v1/auth/otp/request` | anon | Rate limited by number and IP. |
| `POST` | `/v1/auth/otp/verify` | anon | Sets session cookies. Rejects an unverified-email `admin` session. |
| `POST` | `/v1/auth/otp/resend` | anon | Same limits; honours the 60-second cooldown. |
| `POST` | `/v1/auth/signout` | authenticated | Revokes the refresh token family. |
| `GET` | `/v1/auth/me` | authenticated | Profile, roles, permissions, onboarding state. The client's bootstrap call. |
| `PATCH` | `/v1/auth/me` | authenticated | Name, avatar, notification preferences, WhatsApp opt-in. |
| `POST` | `/v1/auth/link-owner` | authenticated | Claims a pending `owners` row by phone. |
| `POST` | `/v1/auth/change-phone` | authenticated | Requires a fresh OTP on the new number. |

### Properties

| Method | Path | Permission |
|---|---|---|
| `GET` | `/v1/properties` | anon |
| `GET` | `/v1/properties/facets` | anon |
| `GET` | `/v1/properties/{id}` | anon |
| `POST` | `/v1/properties` | `property_create` |
| `PATCH` | `/v1/properties/{id}` | `property_update_own` or `_any` |
| `DELETE` | `/v1/properties/{id}` | `property_delete` |
| `POST` | `/v1/properties/{id}/submit` | `property_submit` |
| `POST` | `/v1/properties/{id}/withdraw` | `property_withdraw` |
| `POST` | `/v1/properties/{id}/publish` | `property_publish` |
| `POST` | `/v1/properties/{id}/reject` | `property_publish` |
| `GET` `POST` `PATCH` `DELETE` | `/v1/properties/{id}/media` | owner or `property_update_any` |
| `POST` | `/v1/properties/{id}/media/reorder` | owner or `property_update_any` |
| `GET` `POST` `PATCH` `DELETE` | `/v1/properties/{id}/units` | `unit_create` / `unit_update_own` |
| `GET` `PUT` | `/v1/properties/{id}/land` | `unit_update_own` or `_any` |
| `POST` | `/v1/properties/{id}/viewings` | `property_update_own` or `_any` |

The three publish-side endpoints (`publish`, `reject`, `withdraw`) are staff-only. An owner withdrawing
their own listing is the exception, and it uses `property_withdraw`.

### Owners

| Method | Path | Permission |
|---|---|---|
| `GET` | `/v1/owners` | `owner_read_any` |
| `POST` | `/v1/owners` | `owner_register` |
| `GET` | `/v1/owners/me` | `owner_read_own` |
| `GET` | `/v1/owners/{id}` | `owner_read_own` or `_any` |
| `PATCH` | `/v1/owners/{id}` | `owner_update_own` or `_any` |
| `POST` | `/v1/owners/{id}/kyc/submit` | `owner_update_own` |
| `POST` | `/v1/owners/{id}/kyc/approve` | `owner_kyc_approve` |
| `POST` `PATCH` `DELETE` | `/v1/owners/{id}/documents` | `document_upload` / `document_read_own` |
| `POST` | `/v1/payout-accounts` | `owner_update_own` |
| `PATCH` `DELETE` | `/v1/payout-accounts/{id}` | `owner_update_own` |
| `POST` | `/v1/payout-accounts/{id}/verify` | `owner_update_own` |

### Contracts

| Method | Path | Permission |
|---|---|---|
| `GET` | `/v1/contracts` | `contract_read_own` (scoped) or `contract_read_any` |
| `POST` | `/v1/contracts` | `contract_create` |
| `GET` | `/v1/contracts/{id}` | `contract_read_own` or `_any` |
| `PATCH` | `/v1/contracts/{id}` | `contract_update` |
| `POST` | `/v1/contracts/{id}/activate` | `contract_update` |
| `POST` | `/v1/contracts/{id}/suspend` | `contract_suspend` |
| `POST` | `/v1/contracts/{id}/terminate` | `contract_terminate` |
| `POST` | `/v1/contracts/{id}/renew` | `contract_renew` |
| `GET` `POST` | `/v1/contracts/{id}/parties` | read: own. write: `contract_create` |
| `GET` | `/v1/contracts/{id}/schedule` | read own |
| `GET` | `/v1/contracts/{id}/events` | read own |
| `GET` `POST` | `/v1/contracts/{id}/payments` | `payment_create_own` / `payment_create_any` |
| `GET` `POST` | `/v1/contracts/{id}/documents` | read own / `document_generate` |
| `GET` `POST` | `/v1/contracts/{id}/disputes` | `dispute_create` / `dispute_read_own` |

Payments are nested under contracts as well as exposed at `/v1/payments/{id}`. The nested path is the
creation route, because an intent is meaningless without a contract. The flat path is a lookup by id for
a receipt or a reconciliation drill-down.

### Money

| Method | Path | Permission |
|---|---|---|
| `GET` | `/v1/payments` | `payment_read_own` or `_any` |
| `GET` | `/v1/payments/{id}` | `payment_read_own` or `_any` |
| `GET` | `/v1/payments/{id}/allocations` | `payment_read_any` or `payout_read_own` |
| `POST` | `/v1/payments/{id}/verify` | `payment_create_own` | 
| `POST` | `/v1/payment-intents` | `payment_create_own` |
| `GET` | `/v1/payment-intents/{id}` | `payment_create_own` |
| `POST` | `/v1/payments/{id}/refund` | `payment_refund` |
| `GET` | `/v1/payments/reconciliation` | `payment_read_any` |
| `GET` | `/v1/ledger/accounts/{id}` | `payment_read_any` |

### Payouts

| Method | Path | Permission |
|---|---|---|
| `GET` | `/v1/payouts` | `payout_read_own` or `payout_approve` |
| `GET` | `/v1/payouts/{id}` | `payout_read_own` or `payout_approve` |
| `POST` | `/v1/payouts/runs` | `payout_run` |
| `GET` | `/v1/payouts/runs/{id}` | `payout_approve` |
| `POST` | `/v1/payouts/{id}/approve` | `payout_approve` |
| `POST` | `/v1/payouts/{id}/initiate` | `payout_initiate` |

Four distinct permissions for four distinct steps is deliberate. A staff member who can build a run is
not automatically someone who can approve it, and the API refuses to let one request do both.

### Maintenance

| Method | Path | Permission |
|---|---|---|
| `GET` | `/v1/tickets` | `ticket_read_own` or `ticket_read_any` |
| `POST` | `/v1/tickets` | `ticket_create_own` |
| `GET` | `/v1/tickets/{id}` | `ticket_read_own` or `_any` |
| `PATCH` | `/v1/tickets/{id}` | raiser (limited) or `ticket_manage` |
| `POST` | `/v1/tickets/{id}/updates` | `ticket_create_own` or `ticket_manage` |
| `POST` | `/v1/tickets/{id}/quote` | `ticket_manage` |
| `POST` | `/v1/tickets/{id}/approve-cost` | `ticket_approve_cost` |
| `POST` | `/v1/tickets/{id}/resolve` | `ticket_manage` |

### Documents, notices, disputes, search

| Method | Path | Permission |
|---|---|---|
| `GET` | `/v1/documents/{id}` | `document_read_own` or `_any` |
| `GET` | `/v1/documents/{id}/download` | read own or any | 
| `POST` | `/v1/documents/{id}/release` | `document_release` |
| `GET` `POST` | `/v1/notices` | read own / `notice_send` |
| `GET` | `/v1/disputes` | own or `dispute_read_any` |
| `POST` | `/v1/disputes` | `dispute_create` |
| `GET` `PATCH` | `/v1/disputes/{id}` | own / `dispute_resolve` |
| `GET` `POST` `DELETE` | `/v1/saved-searches` | `saved_search_manage` |
| `GET` `POST` | `/v1/admin/filter-views` | `client_filter_manage` |
| `GET` | `/v1/admin/dashboard` | `admin_dashboard_read` |
| `GET` | `/v1/admin/audit` | `audit_read` |
| `GET` | `/v1/admin/users` | `user_manage` |
| `PATCH` | `/v1/admin/users/{id}/roles` | `user_manage` |

### System and integrations

| Method | Path | Auth | Notes |
|---|---|---|---|
| `GET` | `/health` | none | Liveness. No dependency checks. Never rate limited, never cached. |
| `GET` | `/health/ready` | none | Readiness. Checks the database and reports queue depth. Load balancer target. |
| `POST` | `/v1/integrations/sms/outbound` | `SMS_HOOK_SECRET` bearer | The Supabase Send SMS hook. Not under CORS. |
| `POST` | `/v1/integrations/paystack/webhook` | Paystack signature | Also served by the Edge Function. |
| `POST` | `/v1/integrations/resend/events` | Resend signature | Delivery and bounce webhooks. |
| `POST` | `/v1/internal/jobs/{name}/enqueue` | `INTERNAL_JOB_TOKEN` | Render cron. |
| `GET` | `/v1/internal/queues` | `INTERNAL_JOB_TOKEN` | Queue depth for the drainer. |
| `GET` | `/v1/internal/metrics` | `METRICS_TOKEN` | Prometheus scrape target on the worker. |

`/health` deliberately does not touch the database. A readiness probe that fails on a slow database causes
Render to pull the instance out of rotation, and an instance pulled from rotation while the database is
slow is a self-inflicted outage.

## 11. Refine resource coverage

The admin panel declares a Refine resource per entity. `apps/api/src/bin/verify-resource-coverage.ts` runs
in CI and fails if any declared resource lacks a matching endpoint, or if any endpoint's `permission`
argument is not in the matrix.

```ts
// apps/api/src/bin/verify-resource-coverage.ts
const RESOURCES = [
  { resource: 'properties', route: '/v1/properties', permissions: ['property_create', 'property_update_any'] },
  { resource: 'contracts',   route: '/v1/contracts',   permissions: ['contract_create', 'contract_update'] },
  // …
] as const

for (const { resource, route } of RESOURCES) {
  const registered = routeRegistry.get(route)
  if (!registered) fail(`${resource}: no route registered at ${route}`)
  for (const perm of registered.requiredPermissions) {
    if (!PERMISSIONS.includes(perm)) fail(`${resource}: unknown permission ${perm}`)
  }
}
```

The same script walks `apps/admin/src/App.tsx` route definitions and asserts each resource's list and form
endpoints exist. A Refine resource with no `list` route is dead UI and fails the build.

## 12. OpenAPI

The API description lives in `apps/api/src/openapi.ts`, built from the same Zod schemas the routes use, via
`zod-openapi`. It is emitted at `/v1/openapi.json` in non-production and written to
`docs/openapi/courtland.json` by `pnpm --filter @courtland/api gen:openapi`.

Why generate rather than hand-write: a hand-written spec drifts within a month and then actively misleads.
The generated document is by construction true, and CI fails if the committed file differs from a fresh
generation.

`docs/openapi/courtland.json` is consumed by `docs` link checking and by the frontend's typed client
generator, so a schema change that no client uses still shows up as a diff for review.

## 13. Anti-dead-code rules for the API

| Rule | Enforcement |
|---|---|
| No unused exports | Knip with `entry` for every route module and `ignore` for schema types that exist only for generation. |
| No unused dependencies | `pnpm knip` with `--production`. A dependency imported nowhere fails CI. |
| No route without a caller | Every route is referenced by a frontend resource map or by a documented webhook/cron. `verify-resource-coverage.ts` fails otherwise. |
| No permission without a policy | A matrix test asserts every permission in `matrix.ts` appears in at least one `role_permissions` row and in at least one policy or `requirePermission` call. |
| No migration without a rollback note | Each migration file has a `-- Down:` comment. A migration without one fails a lint rule. |
| No `adminDb` in request handlers | A grep-based lint rule. `adminDb` is allowed only in `db/`, `jobs/`, `bin/`, and services explicitly listed. |
| No dead feature flag | Every `flags` entry must be read in at least two source files, or a test fails. |

## 14. Related documents

- Permission matrix and policies: [`07-authorization-and-rls.md`](./07-authorization-and-rls.md)
- Payment flow and webhooks: [`10-payments-paystack.md`](./10-payments-paystack.md)
- Job triggers for `/v1/internal/jobs/*`: [`11-scheduling-and-jobs.md`](./11-scheduling-and-jobs.md)
- Environment variables: [`22-configuration-and-environments.md`](./22-configuration-and-environments.md)
- Security controls: [`19-security.md`](./19-security.md)
