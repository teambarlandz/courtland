# 11 — Scheduling and jobs

Two kinds of asynchronous work exist in Courtland: durable event-driven workflows, and time-based
scheduled work. The first runs in Inngest. The second is a Render cron that only enqueues. Nothing else is
allowed to be a scheduler.

## 1. Why not Render cron directly

Render's cron feature invokes an HTTP endpoint once a minute at most, on the free tier, and has no
guarantee about delivery or concurrency. A reconciliation job that runs for 90 seconds would overlap its
own next invocation.

| Concern | Inngest | Render cron direct | Render cron → enqueue |
|---|---|---|---|
| Retries with backoff | yes | no | yes, in Inngest |
| Step composition and `sleep` | yes | hand-rolled | yes |
| Observability and replay | yes | no | yes |
| Overlap protection | built in | no | Inngest dedupes by event id |
| Platform dependency | external service | none | external service |

Chosen: Render cron `POST /v1/internal/jobs/{name}/enqueue`, which does one thing — send an Inngest event
with a deterministic id. Everything else lives in the Inngest function.
The cron endpoint is protected by `INTERNAL_JOB_TOKEN` compared with `timingSafeEqual`, and the event id
is `schedule:{name}:{YYYY-MM-DD}` so a retried cron tick in the same window is deduplicated by Inngest
rather than run twice.
## 2. The worker

```
apps/api/src/worker.ts
  serve({
    client: inngest,
    functions: ALL_FUNCTIONS,
    schemas: new EventSchemas()/fromRecord<EVENTS>(),
  })
```

One `Render` service type runs the HTTP listener; a second, same code, different start command runs
`node dist/worker.js`. Both mount the same Postgres. Deploys are independent because a worker restart
must not drop in-flight requests, and an HTTP restart must not drop job state.
Inngest events carry a schema from `packages/types/src/events/schemas.ts`, generated from Zod with
`zod-to-json-schema`, and the handler parses the payload on entry. A malformed event fails loudly in the
Inngest dashboard rather than producing a `null` deep inside a service.
## 3. Job catalogue

Every job is registered in `apps/api/src/jobs/index.ts`/ `tooling/scripts/check-job-registration.mjs` in CI asserts that each
registered function has a triggering path (an `outbox_events` handler, a cron entry, or an explicit API
call) and that each cron entry in `render.yaml` names a registered function. An unregistered job cannot be
triggered; an untriggerable job fails the build.
| # | Function | Trigger | Schedule | Purpose |
|---:|---|---|---|---|
| 1 | `send-email` | `notification.queued` | — | Resend delivery |
| 2 | `send-sms` | `notification.queued` | — | SMS provider delivery |
| 3 | `generate-document` | `document.requested` | — | PDF generation |
| 4 | `release-document` | `document.generated` | — | Moves a file to the released visibility |
| 5 | `payment-reconcile` | cron | daily 02:00 | [`10 § 9`](./10-payments-paystack.md#9-reconciliation) against Paystack |
| 6 | `arrears-sweep` | cron | daily 03:00 | Marks schedule rows overdue, sends notices |
| 7 | `contract-expiry` | cron | daily 03:15 | 90/60/30-day expiry notices, `expired` transition |
| 8 | `payout-run` | cron | Tue 06:00 | Builds the weekly payout run |
| 9 | `document-cleanup` | cron | Sun 04:00 | Removes superseded drafts older than 30 days |
| 10 | `sms-delivery-report` | `notification.sms_sent` | — | Records the carrier status |
| 11 | `email-bounce-handler` | Resend webhook | — | Marks the address undeliverable |
| 12 | `reconcile-outbox` | cron | every 5 min | Drains `outbox_events` stuck past their SLA |
| 13 | `media-orphan-cleanup` | cron | Sun 04:30 | Deletes Cloudinary assets with no `property_media` row |
| 14 | `search-reindex` | cron | Sun 05:00 | Rebuilds `properties.search_document` |
| 15 | `kyc-reminder` | cron | Mon 07:00 | Nudges owners with pending KYC |
| 16 | `statement-generate` | `contract.monthly` | monthly, 1st 06:00 | Monthly statements for tenants and owners |
| 17 | `paystack-transfer-poll` | cron | every 15 min | Closes payouts with no terminal webhook |

Seventeen functions, eleven of them crons. There is no agent-subscription job: "agent" in this system means
the landlord's agent or vendor, represented by `owners.owner_type = 'agent'`, and there is no Courtland sales
force with subscriptions in v1. A job with nothing to renew is the untriggerable dead code the registration
check exists to forbid.

## 4. Workflow patterns

### 4.1 `send-email`, fan-out with per-recipient failure

```ts
export const sendEmail = inngest.createFunction(
  { id: 'send-email', retries: 3, idempotency: 'event.data.noticeId' },
  { event: 'notification.queued' },
  async ({ event, step }) => {
    const notification = event.data

    const rendered = await step.run('render', () => renderTemplate(notification.template, notification.vars))

    const result = await step.run('deliver', async () => {
      try {
        const r = await resend/emails/send({
          from: env.RESEND_FROM,
          to: notification.toEmail,
          subject: rendered.subject,
          html: rendered.html,
          text: rendered.text,
          idempotencyKey: notification.id,          // Resend dedupes for 24h
          tags: [{ name: 'kind', value: notification.template }],
        })
        return { ok: true, providerId: r.id }
      } catch (err) {
        if (err instanceof ResendError && err.statusCode === 429) {
          await step.sleep('rate-limit', `${err.retryAfter ?? 60}s`)
          throw err
        }
        if (err instanceof ResendError && err.statusCode >= 500) throw err
        // 4xx other than 429 is a permanent failure: a bad address will never work.
        return { ok: false, permanent: true, reason: err.message }
      }
    })

    await step.run('record', () =>
      adminDb.update(notices)
        /set({ status: result.ok ? 'sent' : 'failed', provider_message_id: result.providerId, sent_at: new Date() })
        /where(eq(notices.id, notification.noticeId)),
    )

    // A permanent failure does not fail the function: the notification is recorded as failed
    // and the caller has already been notified by other channels.
    return result
  },
)
```

Distinguishing a retryable failure from a permanent one is the difference between a job that eventually
succeeds and a job that retries four times and then alerts for nothing. A 422 from Resend means the address
is invalid; retrying will not help, so the failure is recorded and the function succeeds.

### 4.2 `payment-reconcile`, paginated sweep

```ts
export const paymentReconcile = inngest.createFunction(
  { id: 'payment-reconcile', retries: 2, concurrency: [{ limit: 1 }] },
  { cron: '0 2 * * *', tz: 'Africa/Lagos' },
  async ({ step }) => {
    // concurrency limit 1 means two reconciles can never overlap.

    const pendingIntents = await step.run('list-stuck', () =>
      adminDb.select()/from(paymentIntents)
        /where(and(eq(paymentIntents.status, 'pending'),
                   lt(paymentIntents.createdAt, subHours(new Date(), 24)))),
    )

    for (const intent of pendingIntents) {
      await step.run(`verify-${intent.id}`, async () => {
        const v = await paystack.getTransaction(intent.providerReference!)
        if (v.status === 'success') {
          await settleFromProvider(v)     // same code path as the webhook
          await notifyPayerOfSettlement(intent.id)
        } else {
          await markIntentFailed(intent.id, 'provider_status_not_success')
        }
      })
    }

    return await step.run('reconcile-provider', () => reconcileAgainstProvider())
  },
)
```

`concurrency: [{ limit: 1 }]` is a per-function concurrency limit. It is what guarantees a second run cannot
start while one is in progress, which is exactly what a cron endpoint cannot do.
### 4.3 `arrears-sweep`, the batch pattern

```ts
export const arrearsSweep = inngest.createFunction(
  { id: 'arrears-sweep', retries: 2 },
  { cron: '0 3 * * *', tz: 'Africa/Lagos' },
  async ({ step }) => {
    const marked = await step.run('mark-overdue', () =>
      adminDb(sql`
        update contract_schedule s
        set status = 'overdue', updated_at = now()
        where s.status in ('scheduled','due')
          and s.due_date + (select coalesce(late_fee_grace_days, 7) from contracts c where c.id = s.contract_id)
              < current_date
        returning s.id, s.contract_id, s.due_date, s.amount_kobo
      `),
    )

    // Notices are sent per contract, not per overdue row: a tenant with 3 overdue rows
    // gets one message listing 3, not 3 messages.
    const byContract = new Map<string, typeof marked>()
    for (const row of marked) {
      byContract.set(row.contract_id, [...(byContract.get(row.contract_id) ?? []), row])
    }

    for (const [contractId, rows] of byContract) {
      await step.run(`notice-${contractId}`, async () => {
        const contract = await loadContractForNotice(contractId)
        await notifications.enqueue({
          template: 'arrears_notice',
          toUserId: contract.tenantUserId,
          vars: { lines: rows.map(r => ({ label: r.label, dueDate: r.due_date, amountKobo: r.amount_kobo })) },
          channels: contract.preferences?.channels ?? ['email', 'sms'],
        })
      })
    }

    return { marked: marked.length, contracts: byContract.size }
  },
)
```

Grouping by contract before notifying is a product decision as much as a technical one. A tenant three
months behind on a 24-month lease has 3 overdue rows; three identical SMS messages is how a system gets
muted by its users.
### 4.4 `payout-run`, gated, with an approval pause

```ts
export const payoutRun = inngest.createFunction(
  { id: 'payout-run', retries: 1, concurrency: [{ limit: 1 }] },
  { cron: '0 6 * * 2', tz: 'Africa/Lagos' },   // Tuesdays
  async ({ step }) => {
    const run = await step.run('build', () => buildPayoutRun({ asOf: new Date() }))

    // No transfer happens without a second person approving. This is a hard stop, not a notification.
    await step.sendEvent('payout.run_created', { runId: run.id, totalKobo: run.totalKobo })

    await step.waitForEvent('payout.approved', { timeout: '72h' })

    const approvals = await step.run('verify-approval', () => verifyApproval(run.id))
    if (!approvals.ok) return { skipped: approvals.reason }

    const initiated = await step.run('initiate', () => initiateTransfers(run.id))
    return initiated
  },
)
```

`step.waitForEvent` with a 72-hour timeout. If nobody approves within three days, the run expires, the
allocations stay unclaimed, and next week's run picks them up. Nothing is lost and nothing is paid without
authorisation.

### 4.5 `send-sms`, provider fallback

```ts
export const sendSms = inngest.createFunction(
  { id: 'send-sms', retries: 2, idempotency: 'event.data.noticeId' },
  { event: 'notification.queued' },
  async ({ event, step }) => {
    const n = event.data
    if (n.channel !== 'sms' && n.channel !== 'whatsapp') return { skipped: true }

    const providers = env.SMS_PROVIDER === 'mock' ? [mockProvider] : [primary, ...fallbacks]

    for (const provider of providers) {
      const result = await step.run(`send-${provider.name}`, async () => {
        try {
          const r = await provider.send({ to: n.toPhone, body: n.body })
          return { ok: true, provider: provider.name, messageId: r.id }
        } catch (err) {
          // Carrier rejection is permanent for this number; a provider outage is retryable.
          if (isPermanentRejection(err)) return { ok: false, permanent: true, reason: err.message }
          return { ok: false, permanent: false, reason: err.message }
        }
      })

      if (result.ok || result.permanent) return result
      // else: try the next provider
    }

    await step.run('record-failure', () => markNoticeFailed(n.noticeId, 'all_providers_failed'))
    return { ok: false }
  },
)
```

A permanently rejected number (invalid prefix, blocked handset) does not fall through to the next provider.
Trying four providers against a number that does not exist costs four times as much and finds nothing.
## 5. Crons

Declared in `apps/api/src/jobs/crons.ts`, mirrored in `render.yaml`, and asserted equal by
`tooling/scripts/check-job-registration.mjs`. One source of truth is not possible here — Render needs the YAML — so the test makes the
duplication safe.
| Cron (Lagos) | Inngest function | Purpose |
|---|---|---|
| `*/5 * * * *` | `reconcile-outbox` | Drain stuck outbox rows |
| `*/15 * * * *` | `paystack-transfer-poll` | Close payouts missing a webhook |
| `0 2 * * *` | `payment-reconcile` | Provider reconciliation |
| `0 3 * * *` | `arrears-sweep` | Mark overdue, notify |
| `15 3 * * *` | `contract-expiry` | Expiry notices |
| `0 4 * * 0` | `document-cleanup` | Remove superseded drafts |
| `0 4 * * 0` | `media-orphan-cleanup` | Remove orphan Cloudinary assets |
| `0 5 * * 0` | `search-reindex` | Rebuild search documents |
| `0 6 * * 2` | `payout-run` | Weekly payout run |
| `0 7 * * 1` | `kyc-reminder` | KYC nudges |
| `0 6 1 * *` | `statement-generate` | Monthly statements |

Eleven crons on one Render instance. The cron service calls `POST /v1/internal/jobs/{name}/enqueue` once a minute with
`INTERNAL_JOB_TOKEN`; that endpoint enqueues an Inngest event and returns `202`. Nothing is computed on the
Render request, so a cold start or a slow cron cannot hold a schedule open, and Inngest owns the actual
timing. See [ADR 0009](./adr/0009-inngest-for-jobs.md) and
[`23-ci-cd-and-deployment.md § Render`](./23-ci-cd-and-deployment.md#5-render).

## 6. Outbox pattern

Every state change that must eventually cause an external effect writes to `outbox_events` in the same
transaction. Nothing else sends an email, SMS, or webhook.
```ts
export async function settlePayment(tx: Tx, paymentId: string) {
  await tx.update(paymentsLedger)/set({ status: 'succeeded' })/where(eq(paymentsLedger.id, paymentId))
  await tx.insert(outboxEvents)/values({
    aggregateType: 'payment',
    aggregateId: paymentId,
    eventType: 'payment.succeeded',
    payload: { paymentId },
  })
}
```

A dispatcher inside the API process drains the outbox every second with `FOR UPDATE SKIP LOCKED`, so
multiple instances do not double-send. It sends an Inngest event and marks the row dispatched. If Inngest is
unreachable, the row stays and the next tick retries; `reconcile-outbox` catches rows stuck past five
minutes.
The alternative — calling `notifications.enqueue()` after the transaction commits — has a window where a
process crash between commit and enqueue loses the notification permanently. A user who paid rent and
received no receipt is a support escalation that the outbox makes impossible.

### 6.1 Outbox states

| State | Meaning |
|---|---|
| `pending` | Not yet sent |
| `dispatched` | Sent to Inngest |
| `failed` | Three dispatch attempts failed; `last_error` recorded; `reconcile-outbox` retries |

## 7. Idempotency

Three layers, because Inngest's `idempotency` only helps at the step level.
| Layer | Mechanism |
|---|---|
| Job level | `idempotency: 'event.data.<id>'` — Inngest skips a duplicate function run for 24 hours |
| Step level | `step.run('name', fn)` — a completed step replays its recorded output without re-running |
| Database level | Unique constraints and `on conflict do nothing` — the last line of defence |

The database layer is what actually matters. A payment settled twice because a step replayed is not
recoverable by any amount of job-level care.

## 8. Failure handling

| Failure | Behaviour |
|---|---|
| Function throws | Inngest retries with exponential backoff, up to the function's `retries` |
| Retries exhausted | Event marked failed; an `alerts.job_failed` event fires; the SLA alert channel gets it |
| Step times out | 30 seconds default, raised to 120 for PDF generation and Paystack batches |
| Job runs longer than expected | `reconcile-outbox` and the stuck-intent sweep both operate on time, so a slow job is detected by a fast one |
| Inngest unreachable | Events accumulate in `outbox_events`; the API keeps serving; nothing is lost |
| Database unreachable | Every job fails fast; health check turns the instance unready; Render keeps it running for the next request |

## 9. Observability

Every job run is traceable from a user-visible record.
| Question | Answered by |
|---|---|
| Did the tenant's receipt send? | `notifications` row with `status` and `provider_id` |
| Why has this payment not settled? | `payment_intents.status`, plus the Inngest run for the verify step |
| What did last night's reconciliation find? | `reconciliation_exceptions` and `GET /v1/payments/reconciliation` |
| Which jobs failed today? | Alert query on `job_failures`, plus the Inngest dashboard |
| How long did each step take? | Inngest's own tracing, exported to the Sentry integration |

`requestId` propagates from the initiating HTTP request into the job event and then into every log line the
job writes, so a user reporting "my rent did not post" leads directly to the run.
## 10. Dead-code rules

| Rule | Enforcement |
|---|---|
| Every job has a trigger | `tooling/scripts/check-job-registration.mjs` fails if a registered function's event or cron is never produced |
| Every cron has a job | The same test fails if `render.yaml` names a cron with no registered function |
| No unused job helper | Knip on `apps/api/src/jobs/**` |
| No job writing directly to another job's tables | A grep rule: `jobs/` may not import from `modules/*/` internals, only from `platform/` and `packages/*` |
| No sleep-based polling loops | A grep for `setInterval` inside `jobs/` fails the build; use Inngest steps |

## 11. Related documents

- Payment events this triggers: [`10-payments-paystack.md`](./10-payments-paystack.md)
- Document jobs: [`12-documents-and-pdfs.md`](./12-documents-and-pdfs.md)
- Notification channels and templates: [`13-notifications.md`](./13-notifications.md)
- Alerting rules: [`21-observability.md`](./21-observability.md)
- Render service definitions: [`23-ci-cd-and-deployment.md`](./23-ci-cd-and-deployment.md)
