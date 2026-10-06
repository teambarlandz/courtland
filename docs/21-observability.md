# 21 — Observability

Courtland handles money on behalf of people who will phone when something looks wrong. Observability here
is not a dashboard for engineers; it is the ability to answer "did this tenant's rent arrive?" in under a
minute, and "did we lose any money?" in under an hour.

## 1. Signals

| Signal | Tool | What it answers |
|---|---|---|
| Logs | Sentry, structured JSON | What happened, for one request |
| Traces | Sentry tracing, OpenTelemetry | Where the time went across a request and its jobs |
| Errors | Sentry | What broke, how often, for whom |
| Metrics | Sentry + a Prometheus-compatible endpoint | Is the system healthy right now |
| Traces of product events | `posthog-node` | What do users do, and where do they drop off |
| Audit | `audit_log` table | Who did what, permanently |
| Business invariants | SQL assertions, nightly | Is the ledger internally consistent |

Logs are for engineers, the audit log is for compliance, and the business invariants are for finance. They
answer different questions and none substitutes for another.

## 2. Logging

### 2.1 Structure

Every log line is JSON with a stable shape. Never a formatted string.

```ts
// packages/logger/src/logger.ts
export const logger = createLogger({
  level: env.LOG_LEVEL,                       // debug in dev, info in prod
  redact: ['req.headers.authorization', 'req.headers.cookie', 'password', 'token', 'otp', 'apiKey', 'secret'],
  base: { service: 'api', version: env.GIT_SHA },
})

logger.info('payment.settled', {
  requestId,                                   // from AsyncLocalStorage
  userId, paymentId, contractId,
  amountKobo: 3750000n.toString(),
  provider: 'paystack',
  durationMs: 143,
})
```

### 2.2 The redaction list is enforced

| Field | Redacted |
|---|---|
| `authorization` | yes |
| `cookie`, `set-cookie` | yes |
| `password`, `token`, `otp`, `code` | yes |
| `apiKey`, `secret`, `clientSecret` | yes |
| `paystackAccountNumber` | partial: last 4 only |
| `phone` | partial: `+234****678` |
| `email` | partial: `a***@example.com` |
| `nationalIdNumber` | yes, entirely |
| Full request or response body | never logged |

A partial-redaction helper is used rather than logging the whole value. A log with a full phone number is a
data breach waiting for a log aggregator breach.

### 2.3 Levels

| Level | Used for | Examples |
|---|---|---|
| `error` | Something failed and someone must act | Database error, provider failure, invariant violation |
| `warn` | Degraded but handled | Rate limit hit, provider retry, stale cache, fallback provider used |
| `info` | Business-significant events | Payment settled, contract activated, payout initiated, admin login |
| `debug` | Diagnostic detail, off in production | SQL parameters, cache hits |

Business events are `info`, not `error`. A failed payment is an `info` with `status: 'failed'` and an
`error_code`; it is not an `error` that pages someone, because customers' cards fail and that is not an
outage.

### 2.4 Request logging

`httpLogger` emits one line per request:

```json
{
  "level": "info", "msg": "request",
  "requestId": "req_01J9X4M2K7",
  "method": "POST", "path": "/v1/payment-intents",
  "status": 201, "durationMs": 88,
  "userId": "u_123", "roles": ["tenant"],
  "ip": "102.89.34.12", "userAgent": "…",
  "idempotencyKey": "8f14e45f-…"
}
```

No query string, because it can contain a cursor or a search term. No body. The `path` is the route
template, so the log cardinality is bounded — `/v1/contracts/abc123` rather than 40,000 distinct paths.

## 3. Tracing

### 3.1 Request to job

The `requestId` from an HTTP request propagates into the outbox event, into the Inngest function, and into
every log line and span inside it. One search finds the whole story of one payment.

```
req_01J9X4M2K7                          API
├── span: postgres query                12 ms
└── outbox: payment.succeeded
    └── inngest: generate-receipt
        ├── span: render pdf            1.8 s
        ├── span: upload cloudinary     640 ms
        └── span: send email            210 ms
```

Sentry's Inngest integration gives the trace view. Without it, an Inngest run and the request that caused
it are two unrelated objects in two unrelated tools.

### 3.2 Instrumented spans

| Span | Where | Notes |
|---|---|---|
| `http.request` | `requestContext` | Root span |
| `db.query` | Drizzle query hook | Statement kind, not the SQL text |
| `db.slow` | Same, over 200 ms | Includes the query kind and the table |
| `paystack.api` | Provider client | Endpoint, status, duration. Never the secret |
| `cloudinary.upload` | Media client | Public id, bytes, duration |
| `pdf.render` | `packages/pdf` | Template, pages, duration |
| `inngest.step` | Inngest | Automatic |
| `redis.get` / `redis.set` | Cache | Key prefix, hit or miss |

### 3.3 Sampling

| Traffic | Sample rate | Reason |
|---|---|---|
| Successful 2xx | 10% | Volume, low value |
| 4xx | 100% | A 403 is either a bug or an attack |
| 5xx | 100% | Every failure |
| Any request with `payment`, `payout`, `refund` in the path | 100% | The paths where a bug is expensive |
| Auth requests | 100% | Account compromise is the concern |

Sampling is uniform across instances, from the instance id, so a trace is not fragmented across replicas.

## 4. Errors

### 4.1 What reaches Sentry

| Error type | Grouped by | Alerted |
|---|---|---|
| Unhandled exception | Stack trace | Yes, if new or above threshold |
| Unhandled promise rejection | Stack trace | Yes |
| `ApiError` with `kind: 'internal'` | Stack trace | Yes |
| `ApiError` with a 4xx kind | Code and route | No. Expected |
| Provider error | Provider and endpoint | Yes, above threshold |
| Database error | Query kind | Yes |
| Invariant violation | Invariant name | Yes, always. A ledger invariant failing is a SEV1 |

A deliberately thrown `BusinessRuleError` is not an error. It is a rule working. Reporting it means the
dashboard fills with noise and the real errors go unread.

### 4.2 Release health

Each deploy gets a Sentry release from the git SHA. An error is "new" if its fingerprint has not been seen
in the previous release. New errors block the next deploy's promotion via the automated check.

## 5. Metrics

Exposed at `GET /v1/internal/metrics` on the worker, protected by `METRICS_TOKEN`, scraped every 60
seconds.

### 5.1 API

| Metric | Type | Used for |
|---|---|---|
| `http_requests_total{route,method,status}` | counter | Traffic and error rate |
| `http_duration_seconds{route}` | histogram | Latency, p50/p95/p99 |
| `db_query_duration_seconds{kind}` | histogram | Slow query detection |
| `db_connections_in_use` | gauge | Pool exhaustion |
| `auth_otp_requests_total{result}` | counter | Delivery and enumeration |
| `rate_limit_hits_total{route}` | counter | Abuse |
| `payment_intents_created_total` | counter | Business volume |
| `payouts_initiated_total{status}` | counter | Payout health |

### 5.2 Workers

| Metric | Type | Used for |
|---|---|---|
| `job_runs_total{job,status}` | counter | Job reliability |
| `job_duration_seconds{job}` | histogram | Which job is slow |
| `outbox_backlog` | gauge | Queue depth. Alerts above 100 |
| `outbox_oldest_age_seconds` | gauge | The real queue-health signal. A shallow backlog of old rows is worse than a deep backlog of new ones |
| `webhook_failures_total{provider}` | counter | Integration health |
| `notifications_sent_total{channel,status}` | counter | Delivery rates |

### 5.3 Business

| Metric | Alert | Meaning |
|---|---|---|
| `payments_settled_total{channel}` | — | Revenue |
| `payments_failed_total{reason}` | > 20% over 1 h | Provider or channel problem |
| `ledger_balance_violations` | **any** | SEV1. The invariant queries in the payments doc |
| `reconciliation_exceptions` | any | Money discrepancy |
| `payouts_pending_approval` | > 48 h | A run is stuck |
| `payout_age_hours{status}` | > 72 h | Transfers not closing |
| `arreas_total_kobo` | — | Business health, reviewed monthly |
| `kyc_pending_count` | > 50 | Onboarding is blocked |
| `properties_in_review_count` | > 25 | Staff are behind |
| `notifications_sms_delivery_rate` | < 80% over 1 h | Provider problem |
| `storage_used_bytes` | > 80% of plan | Cloudinary |

The first two in that list are the ones that page someone. The rest are on a dashboard that gets looked at
in the morning.

## 6. Dashboards

### 6.1 Operations

The first screen on waking up.

```
API health        requests/min, error rate, p95 latency, uptime
Job health        failures in 24 h, outbox backlog, oldest age
Payments          settled today, failed, failure reasons, delivery channels
Payouts           pending runs, pending approval, transfers in flight, stuck
Reconciliation    last run, exceptions, variance amount
Notifications     sent by channel, delivery rate, bounce rate
Providers         Paystack latency, Cloudinary latency, Resend latency, SMS latency
```

### 6.2 Business

```
Listings          live, in review, published this week
Leasing           active contracts, new this month, expiring in 90 days
Arrears           total outstanding, by property, trend
Payouts           paid out this month, held, deposits held
Owners            registered, KYC approved, KYC pending
Tenant experience payment success rate, first-payment success rate, time to first payment
```

### 6.3 Tenant funnel

```
Listing view → enquiry → contact → application → payment → contract
```

Where the drop-off is largest. A property platform's core loop is view to payment, and the second dashboard
is the one that tells you whether the product works.

## 7. Alerting

PagerDuty for SEV1 and SEV2; email and Slack for the rest.

| Alert | Threshold | Severity | Route |
|---|---|---|---|
| `ledger_balance_violations > 0` | any | SEV1 | Page |
| Reconciliation variance > ₦0 | any | SEV1 | Page |
| Error rate > 5% for 5 min | — | SEV1 | Page |
| p95 latency > 2 s for 5 min | — | SEV2 | Page |
| Database connections > 90% of pool | 5 min | SEV2 | Page |
| Paystack webhook failures > 10 in 10 min | — | SEV1 | Page |
| SMS delivery rate < 80% over 1 h | — | SEV2 | Page |
| Job failure rate > 20% over 1 h | — | SEV2 | Page |
| Outbox oldest age > 30 min | — | SEV2 | Page |
| Payout transfer stuck > 72 h | — | SEV2 | Page |
| `p95_latency` increase > 50% vs 7-day | — | SEV3 | Email |
| Storage > 80% of plan | — | SEV3 | Email |
| KYC pending > 50 | — | SEV3 | Email |
| Deploy failure | — | SEV3 | Email |

Every alert has a runbook link in the alert message. An alert whose first step is "figure out what this
means" is a training exercise disguised as a monitor.

## 8. PostHog

Product analytics for the funnel and feature usage. Not for money: no payment amounts, no bank details, no
identity documents, ever.

| Event | Properties |
|---|---|
| `listing_viewed` | `propertyId`, `reference`, `source` |
| `search_performed` | Filter keys present, result count band. Not the search terms |
| `enquiry_sent` | `propertyId`, `hasMessage` |
| `otp_requested` | `channel`, `result` |
| `property_draft_started` | `propertyType` |
| `property_submitted` | `propertyType`, `mediaCount` band |
| `payment_started` | `contractKind`, `amountBand`. Band, not amount |
| `payment_completed` | `contractKind`, `channel`, `durationMs` |
| `ticket_created` | `category` |
| `document_downloaded` | `docKind` |

Explicitly not tracked: amounts, names, phone numbers, emails, addresses, document contents, and search
terms. A property platform's analytics must never become a list of who is looking at what, because that
list is a physical-security risk.

## 9. Incident response

| Severity | Acknowledge | Engage | Update |
|---|---|---|---|
| SEV1 | 15 min | Immediately | Every 30 min |
| SEV2 | 1 h | Within 4 h | Every 2 h |
| SEV3 | Next business day | Backlog | None |

The first move for any money-related incident is to halt payouts:

```sql
-- Stop new payout runs from being initiated
update payout_runs set status = 'halted' where status in ('pending_approval', 'approved');
```

Halted, not cancelled. The allocations stay payable and the next run picks them up once the cause is
understood.

## 10. What is deliberately not monitored

| Not monitored | Why |
|---|---|
| Page load times in production, per user | Lighthouse in CI is enough. Real-user monitoring would require a beacon script, which is a privacy cost for a small gain |
| Number of database queries per request | A useful inner-loop metric, not an operational one. It shows up as latency when it matters |
| CPU and memory per request | Instance-level metrics cover it |
| Individual staff productivity | Not a product's business |

Keeping the signal count low is what makes it readable. A dashboard with 80 charts is a dashboard nobody
checks.

## 11. Dead-code rules

| Rule | Enforcement |
|---|---|
| No unused metric | A metric declared and never scraped by a dashboard or an alert fails a CI check that compares the metric registry to the dashboard definitions |
| No unused dashboard | A dashboard nobody views fails the quarterly review; the config is removed |
| No unused alert | An alert that has not fired in 90 days is reviewed; if it has no plan, it is removed |
| No log field that is always empty | A schema check; an always-null field is removed from the type |
| No logger imported outside allowed paths | Import boundaries |
| No new logger library | One logger, in `packages/logger`, enforced by import boundaries |

## 12. Related documents

- Payments and the invariants these alerts watch: [`10-payments-paystack.md`](./10-payments-paystack.md)
- Jobs and queue depth: [`11-scheduling-and-jobs.md`](./11-scheduling-and-jobs.md)
- Alerts in practice: [`24-operations-runbooks.md`](./24-operations-runbooks.md)
- Environment variables for keys: [`22-configuration-and-environments.md`](./22-configuration-and-environments.md)
