# 19 — Security

This document is the threat model, the controls, and the known gaps. It is written to be read by someone
who did not build the system and needs to know whether to trust it with money.

## 1. What the system holds

| Asset | Sensitivity | Consequence of loss |
|---|---|---|
| Money movements | Critical | Direct financial loss, unrecoverable |
| Identity documents (NIN, passport, driver's licence) | Critical | Identity theft against real people |
| Tenancy agreements | High | Legal exposure for tenants and owners |
| KYC records | High | Regulatory exposure under AML/CFT |
| Phone numbers, emails | Medium | Harassment, phishing |
| Property listings | Low | Reputational |
| Usage patterns | Medium | Surveillance value to an attacker |

The system handles money and identity documents. Every control below follows from that.

## 2. Trust boundaries

```
                    ┌──────────────────────────────────────────────┐
  Browser           │  apps/web (Vercel)          apps/admin (Vercel) │
  (untrusted)       │  Server Components + client JS               │
                    └───────────────────────┬──────────────────────┘
                                            │ HTTPS, Bearer JWT
                    ┌───────────────────────▼──────────────────────┐
  Service           │  apps/api (Render)                            │
  (semi-trusted)    │  Express, Zod, Drizzle, service code          │
                    └───────┬──────────────────────────┬───────────┘
                            │ RLS (tenant)              │ service_role (jobs, webhooks)
                    ┌───────▼──────────┐    ┌──────────▼──────────┐
  Data              │  Supabase Postgres │    │  Supabase Auth      │
                    │  RLS on every table│   │  OTP, JWT, MFA      │
                    └────────────────────┘    └─────────────────────┘
                            │
                    ┌───────▼──────────────────────────────────────┐
  Third parties      │  Paystack · Cloudinary · Resend · SMS · Inngest │
                    └──────────────────────────────────────────────┘
```

| Boundary | Crossed by | Control |
|---|---|---|
| Browser → API | Every request | JWT verification, `requirePermission`, rate limits, Zod validation |
| API → Postgres (user request) | Every query | RLS via `withRls`. No bypass |
| API → Postgres (job) | Every job | `adminDb`. Restricted imports, audited |
| Webhook → API | Paystack, Resend | HMAC signature verification before any processing |
| API → third party | Paystack, Cloudinary, Resend | Secrets from env, never logged, outbound allowlist |
| Client → Cloudinary | Direct upload | Signed upload ticket, folder-scoped, 1-hour expiry |

## 3. Authentication security

Covered in detail in [`06-authentication.md`](./06-authentication.md). The security-relevant summary:

| Control | Implementation |
|---|---|
| No passwords | Email/password signups disabled at the Supabase project level |
| Session storage | `HttpOnly`, `Secure`, `SameSite=None`, `Domain=.courtland.com.ng`, `Path=/` |
| Access token in JS | Never. Browser traffic authenticates with the cookie; only machine clients send `Authorization: Bearer` |
| JWT lifetime | 1 hour, rotation enabled, 24-hour inactivity timeout |
| Revocation | `session_version` in the access token hook, checked against `auth.users` |
| Staff MFA | Phone OTP as a second factor, mandatory, enforced server-side |
| OTP guessing | 5 wrong codes invalidates; per-OTP counter, not only per-IP |
| Rate limits | 3/hour per number, 10/hour per IP, 10 attempts per 15 minutes |
| CSRF | Double-submit token plus an exact `Origin` allowlist, required on unsafe methods for cookie-authenticated requests only. The web app and the API are different sites, so `SameSite=Lax` is not available as the defence. Full reasoning in [`08 § 5.1`](./08-api-design.md#51-csrf) |

## 4. Authorization security

Four layers, defined in [`07-authorization-and-rls.md`](./07-authorization-and-rls.md). The properties that
matter:

| Property | How |
|---|---|
| Default deny | RLS enabled with no policy denies everything |
| Policies are explicit | Every table, every operation, `to` always specified |
| Permissions not roles in policies | So capabilities are data, not code |
| No client writes to money tables | `payments_ledger` and `ledger_allocations` have no client insert policy |
| `adminDb` never serves a user request | Import restriction plus a lint rule |
| Views are `security_invoker` | A `security_definer` view bypasses its tables' policies |

### 4.1 `adminDb` containment

```ts
// apps/api/src/db/admin.ts
import { createClient } from '@supabase/supabase-js'
import { env } from '@/platform/env'

export const adminDb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  db: { schema: 'public' },
})
```

The service role key bypasses RLS entirely. Its containment:

| Control | Enforcement |
|---|---|
| Import restriction | `eslint-plugin-restricted-imports`: only `db/admin.ts`, `jobs/**`, `bin/**`, and an explicit allowlist may import it |
| Request-path prohibition | A lint rule fails if a file under `routes/` imports `adminDb` |
| No environment leakage | The key is only in the API's environment, never in a Vercel env var the browser can see |
| Key rotation | Documented procedure, quarterly, and immediately on any suspected exposure |
| Audit | Every privileged operation writes an `audit_log` row with the actor and the reason |

An `audit_log` row for a privileged operation is not optional. "Who approved this payout" must be answerable
without a database console.

## 5. Injection

| Vector | Control |
|---|---|
| SQL injection | Drizzle parameterises everything. No raw string interpolation into SQL except through `sql` templates with bound parameters |
| Raw SQL | Only in migrations, triggers, and `security definer` functions, all reviewed, none built from user input |
| NoSQL injection | No NoSQL datastore |
| Command injection | `execa` with argument arrays, never shell strings. No `exec`, no shell interpolation |
| Template injection | Handlebars, which escapes by default. No `{{{ }}}` triple-stache in any template |
| Header injection | Node rejects newlines in header values |
| Path traversal | Cloudinary public_ids are validated against a server-chosen folder prefix. No user-controlled filesystem paths |
| Log injection | Structured JSON logging. User input is a JSON value, not a formatted string |
| CSV injection | No CSV export in v1. If added, cells beginning with `=`, `+`, `-`, `@` are prefixed |

## 6. Secrets

| Rule | Implementation |
|---|---|
| Never in git | `.gitignore` includes `.env*`; `gitleaks` in pre-commit and CI |
| Never in code | No string literals matching a key pattern; a lint rule scans for `sk_live`, `whsec_`, `SG.`, `AKIA` |
| Environment only | `apps/api/src/platform/env.ts` is the only reader, and it validates at boot with Zod |
| Server-only prefix | Every Vercel variable the browser may read starts `NEXT_PUBLIC_`; CI asserts nothing else is client-visible |
| No secrets in client bundles | A build-time scan of `.next/static/**` for known key prefixes |
| Separate keys per environment | Development, staging, and production have distinct keys everywhere |
| Rotation | Quarterly for all; immediately on staff departure or suspected exposure |

`env.ts` fails to boot on a missing variable rather than defaulting to `undefined`. A service that starts
with a broken configuration and fails on the first request is harder to diagnose than one that refuses to
start.

## 7. Cryptography

| Use | Method |
|---|---|
| Passwords | None. No password to hash |
| Session tokens | Supabase-managed |
| Webhook signatures | HMAC-SHA512 (Paystack), HMAC-SHA256 (Resend), compared with `timingSafeEqual` |
| OTP codes | Generated and verified by Supabase. Courtland never stores or generates them |
| Document checksums | SHA-256, stored on `documents`, verified on download |
| Signature images | PNG, stored as an artefact. Not a cryptographic signature, and documented as such |
| Comparison | Always `timingSafeEqual`, never `===`, for anything secret |
| Randomness | `crypto.randomUUID()` and `crypto.randomBytes`. `Math.random` is banned by lint for anything security-adjacent |

## 8. Rate limiting and abuse

| Endpoint class | Limit | Key |
|---|---|---|
| OTP request | 3/hour per number, 10/hour per IP, 30/day per IP | Number and IP |
| OTP verify | 10/15 min per IP, 5 attempts per OTP | IP and OTP id |
| Sign-in | 20/hour per IP | IP |
| Payment initiation | 10/hour per user, 5/hour per contract | User, contract |
| Listing search | 120/min per IP | IP |
| Admin mutations | 300/hour per user | User |
| SMS webhook (the Supabase hook) | 600/min | Secret |
| Paystack webhook | 600/min | Signature |
| Global | 600/min per IP | IP |

Rate limit state is Redis when the API runs multi-instance, in-memory when single-instance. The interface is
the same (`platform/rateLimit`), so the local path is not a different implementation.

Rate limits are not the only control against enumeration. `POST /v1/auth/otp/request` returns a distinct
404 for an unknown number because the product needs the onboarding route, and that trade-off is documented
in the authentication doc rather than hidden. Two enumerable outcomes, rate limited, is a defensible
position; an unbounded one is not.

## 9. Input validation

| Where | Mechanism |
|---|---|
| Client | Zod, from `packages/types`, shared with the API |
| API request body | Zod, `.strict()`, unknown field → 422 |
| API query params | Zod, whitelist per resource |
| API path params | Zod, UUID format |
| Webhook payloads | Zod after signature verification |
| Job events | Zod, from `packages/types/src/events` |
| Environment variables | Zod, at boot |

`.strict()` on every request body is the setting that catches client typos. Without it, `PATCH
{"rent_ammount": 45000000}` returns 200 and changes nothing, and the user believes it worked.

## 10. Rate and abuse on money

| Control | Detail |
|---|---|
| Idempotency-Key required | Payments, payouts, refunds, contract transitions |
| Cumulative refund check | Total refunds cannot exceed the original net, across concurrent requests |
| Amount verification | Paystack's reported amount compared to the intent before settling |
| Payout lag | 3 business days, so chargebacks can arrive before money moves |
| Two-person control | A payout run cannot be approved by its creator, enforced by a trigger |
| Minimum payout | ₦5,000 |
| Session-scoped ownership | A payment may only be created for a contract the caller is a party to |
| Schedule linkage | A payment must reference schedule rows; there is no free-form amount |
| Offline payment cap | Cannot exceed the outstanding schedule total |

## 11. Transport and headers

| Surface | Controls |
|---|---|
| API | HSTS, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`, restrictive CSP for JSON responses |
| Web | HSTS, CSP with nonce-based scripts, `frame-ancestors 'none'` |
| Admin | As web, plus `frame-ancestors 'none'` because it must never be framed |
| All | TLS 1.2+ only, HTTP/2, and no mixed content |

CSP is nonce-based rather than `'unsafe-inline'`, which means no inline scripts. Next.js supports nonce
propagation through `proxy.ts`, and the nonce is generated per request.

## 12. Audit log

Every privileged action writes an `audit_log` row.

| Action | Recorded |
|---|---|
| Role grant or revoke | Actor, target, role, reason |
| Contract state transition | Actor, from, to, reason |
| Property publish, reject, withdraw | Actor, reason |
| KYC approve, reject | Actor, reason, documents viewed |
| Payout run create, approve, initiate | Actor, amounts |
| Refund | Actor, amount, reason |
| Offline payment | Actor, amount, method, reference |
| Document download (`private`) | Actor, document, reason |
| Sign-in | Actor, IP, user agent |
| Settings change | Actor, key, before, after |
| Filter view change | Actor, view, before, after |

Properties: append-only, no update or delete policy, no client select except for `audit_read`,
`ip_address` and `user_agent` retained for 7 years, exported monthly to cold storage.

## 13. Privacy

| Data | Lawful basis | Retention | Notes |
|---|---|---|---|
| Identity documents | Legal obligation, contract performance | 7 years after the relationship ends | AML/CFT |
| Name, phone, email | Contract performance | Life of the relationship + 7 years | |
| Payment records | Legal obligation | 7 years | Tax |
| Property listings | Legitimate interest | Until withdrawn + 2 years | |
| Messages and notices | Contract performance | 7 years | Dispute evidence |
| Usage analytics | Consent, or legitimate interest for aggregates | 13 months raw, aggregates kept | |
| Marketing | Consent | Until withdrawn | Consent is recorded with a timestamp |
| Audit log | Legal obligation | 7 years | |

Subject rights, implemented through `PATCH /v1/auth/me` and the support channel:

| Right | Handling |
|---|---|
| Access | `GET /v1/auth/me` plus an export of the caller's data |
| Rectification | Name, phone, email editable. Identity document re-upload goes through staff review |
| Erasure | Anonymise the profile. Financial and tenancy records are retained under the statutory obligation |
| Portability | A JSON export of the caller's data |
| Objection | Marketing consent withdrawn; the transactional basis is unaffected |
| Withdrawal of consent | `profiles.marketing_consent_at = null` |

## 14. Dependency security

| Control | Tool | Cadence |
|---|---|---|
| Vulnerability audit | `pnpm audit --audit-level=high` | Every CI run |
| Licensing | `license-checker`, allow list of permissive licences | Every CI run |
| Freshness | `renovate` with grouped PRs | Weekly |
| Lockfile integrity | `pnpm-lock.yaml` committed; `--frozen-lockfile` in CI | Every run |
| Supply chain | Only npm, no git or tarball dependencies | Lint rule |

Critical vulnerabilities block a deploy. High vulnerabilities block a deploy unless a documented
mitigation exists with an expiry date.

## 15. Known gaps

Written down so they are decisions rather than surprises.

| Gap | Impact | Mitigation | Plan |
|---|---|---|---|
| No malware scanning on uploaded documents | A tenant could upload a malicious file that a staff member opens | Staff download through a signed URL and open in a browser, not a desktop client. Cloudinary's own scan applies to images | Add ClamAV scanning in Phase 15 if document uploads to staff machines become common |
| No document watermarking | A leaked agreement is not attributable | Every PDF carries a footer with the reference, the timestamp, and the recipient's reference | Accept. Not proportionate for this threat model |
| Canvas signature is not cryptographic | A disputed signature needs another way to prove it | Stored artefact, timestamp, uploader identity, and audit row. The template states it is not a cryptographic signature | Accept for v1. Revisit if a signature is ever used in litigation |
| `search_document` is a generated column refreshed by job | A new listing is unsearchable for up to a week | `search-reindex` runs weekly; a new publish triggers an immediate reindex | Solved in Phase 10 with the trigger |
| No 2FA option other than phone | A lost phone means a lost account | Staff also have email magic link, which becomes the second factor | Accept |
| Rate limit state is in-memory locally | A local run has no cross-instance limits | Local is a single instance by definition | Accept |
| No anomaly detection on payments | Unusual patterns are found by a human, not a model | Reconciliation catches amount mismatches; a variance alert fires | Add threshold alerts in Phase 15 |
| Third-party compromise | Resend, Cloudinary, Twilio, Inngest | Secrets scoped per provider; webhook signatures verified; the blast radius per provider is bounded | Accept |
| No disaster recovery drill | Recovery time is theoretical | Documented restore procedure in the runbook | First drill in Phase 16 |

## 16. Staff security

| Control | Implementation |
|---|---|
| Least privilege by default | `role_permissions` grants nothing that is not explicitly listed |
| Permission changes are audited | With a required reason |
| Two-person control on money out | The payout dual-control trigger |
| Session timeout | 8 hours for staff, versus 7 days for tenants |
| Device logging | IP and user agent on every staff sign-in |
| Offboarding | A checklist: revoke roles, sign out globally, rotate any shared secret |
| Training | Every staff member signs the acceptable-use and data-handling policy before their admin account is created |
| Device policy | Company-managed device for admin access, enforced by policy rather than by technology in v1 |

### 16.1 Staff permission changes

A permission change is visible in the UI after a page reload, not immediately. The API enforces the
authoritative state on every request, so the change is effective immediately for what the API allows; only
the visible navigation is stale until the reload. This is a deliberate trade: re-fetching permissions on
every request would add a query per click for data that changes a few times a year.

## 17. Incident response

| Severity | Definition | Response |
|---|---|---|
| SEV1 | Money moving incorrectly, data breach, auth bypass | Page immediately. Halt payouts. Within 15 minutes |
| SEV2 | One user affected, one integration down | Acknowledge within 1 hour, fix within 4 |
| SEV3 | Degraded, workaround exists | Next business day |
| SEV4 | Cosmetic | Backlog |

Runbooks live in [`24-operations-runbooks.md`](./24-operations-runbooks.md). The three that matter most:

| Runbook | Covers |
|---|---|
| Compromised admin account | Global sign-out, role revocation, `session_version` bump, audit review, key rotation |
| Payment reconciliation variance | Halt payouts, identify the window, compare with Paystack, decide on refunds |
| Ransomware or data exfiltration | Key rotation, database point-in-time restore, Cloudinary asset review, notification |

## 18. Security testing

| Test | Tool | When |
|---|---|---|
| Dependency audit | `pnpm audit` | Every CI run |
| Secret scan | `gitleaks` | Pre-commit and CI |
| SAST | Biome's security rules plus `eslint-plugin-security` | Every CI run |
| Bundle secret scan | Custom scan of `.next/static/**` | Every web build |
| DAST | OWASP ZAP baseline against staging | Weekly |
| Authorization E2E | Playwright permission matrix tests | Every CI run |
| RLS pgTAP | `supabase/tests/**` | Every migration |
| Manual review | Security review of every RLS change and every `security definer` function | Per PR |

## 19. Dead-code rules

| Rule | Enforcement |
|---|---|
| No unused security middleware | Knip; an unused middleware in the chain fails |
| No unused security header | A header set nowhere in the config fails the config test |
| No disabled security control without a comment | A lint rule requires a justification comment on `eslint-disable security/*` |
| No `security definer` without a review marker | A comment is required; CI checks the comment exists |
| No RLS policy on a table that does not exist | A migration test |

## 20. Related documents

- Authentication: [`06-authentication.md`](./06-authentication.md)
- Authorization and RLS: [`07-authorization-and-rls.md`](./07-authorization-and-rls.md)
- Payments and money controls: [`10-payments-paystack.md`](./10-payments-paystack.md)
- Environments and key management: [`22-configuration-and-environments.md`](./22-configuration-and-environments.md)
- Incident runbooks: [`24-operations-runbooks.md`](./24-operations-runbooks.md)
- Compliance obligations: [`25-nigeria-compliance.md`](./25-nigeria-compliance.md)
