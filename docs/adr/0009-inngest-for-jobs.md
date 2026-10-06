# ADR 0009: Inngest for durable jobs, Render cron only to enqueue

- Status: Accepted
- Date: 2026-02-13
- Deciders: CTO, Lead developer

## Context

Courtland needs asynchronous work that must not be lost and must not run twice:

- A payment settles, and a receipt must be generated, emailed, and recorded.
- Every night, the ledger must be reconciled against Paystack and every stuck intent resolved.
- A payout run waits for a second person to approve, possibly for three days.
- An arrears sweep marks rows overdue and notifies each tenant once.

The host provides Render, whose cron feature fires an HTTP endpoint on a schedule. It has no retry semantics,
no step composition, no visibility into a run's history, and no way to pause for an external event.

## Decision

**Inngest** for all durable and event-driven work. Render cron is used only to send an event with a
deterministic id, so a retried tick deduplicates rather than running twice.

```
Render cron  →  POST /v1/internal/jobs/{name}/enqueue  →  Inngest event  →  Inngest function  →  steps
```

| Concern | Mechanism |
|---|---|
| Retries with backoff | Per-function `retries` |
| Step composition | `step.run`, `step.sleep`, `step.waitForEvent` |
| Replay | Step results recorded; a replay does not re-run completed work |
| Concurrency | Per-function limits, so two sweeps cannot overlap |
| Observability | Run history, step timings, payloads |
| Idempotency | Function-level by event id, plus database constraints |

Idempotency is enforced at three layers: Inngest's function-level key, its step-level results, and unique
constraints in the database. The database layer is what actually matters, because a payment settled twice
because a step replayed is not recoverable by job-level care.

## Alternatives considered

**Render cron calling handlers directly.** Rejected. No retries: a transient database failure means the night
is skipped. No overlap protection: a 90-second reconciliation overlapping its own next tick produces
duplicate work and duplicate notifications. No visibility: when a customer reports a missing receipt, the
answer would be "it should have run".

**BullMQ or Bull with Redis.** Rejected. Solid, and Redis is already available for rate limiting. Rejected
because workers need to be deployed and monitored separately, the API must reach Redis for queue operations,
and the operational surface is comparable. Inngest's step model also removes the hand-rolled state machine
that a payout run's wait-for-approval would otherwise need.

**Trigger.dev.** A close second, and genuinely equivalent. Rejected on hosting: Inngest's cloud service is the
faster path to a working system, and Trigger.dev's self-hosted option adds a deployable, which cuts against
ADR 0001. Revisit if Inngest's pricing becomes material at volume.

**Postgres as a queue: `FOR UPDATE SKIP LOCKED` and a poll loop.** Rejected for the main flows. It works and it
has no external dependency, but "sweep, retry with backoff, wait for an event for up to 72 hours, replay a
failed step" is a state machine to write and maintain. The outbox drainer does use this pattern for the small
hop from a transaction to Inngest, because that hop must be atomic with the transaction.

**Supabase Edge Functions with `pg_cron`.** Rejected. `pg_cron` cannot do steps, retries with backoff, or
waits. Edge Functions would need the same state machine as BullMQ.

## Consequences

**Easier.** Retries, backoff, and step replay are configuration rather than code. A payout run waiting for
approval is three lines: send an event, wait, continue. Run history answers "what happened to this payment"
without a custom table. Concurrency limits solve the overlap problem that cron cannot.

**Harder.** An external dependency in the path of every notification. Inngest being unreachable stops event
delivery, so the outbox must hold events until they are delivered, and `reconcile-outbox` exists for that
case. Jobs run outside the API process, so their code cannot rely on request-scoped context and must
re-establish identity as `service_role`. Debugging spans two systems unless the `requestId` is propagated,
which it is.

**Cost.** Inngest pricing at volume. A dependency on a company. Operational attention when Inngest has an
incident.

## Revisit when

- Inngest costs exceed 10% of infrastructure. Check: the monthly invoice.
- Inngest has an incident affecting delivery for more than an hour, twice in a quarter. Check: the status
  page and the internal incident log.
- More than half the jobs need to run inside the API process anyway. Check: jobs so small that a step
  boundary costs more than the work.

If Inngest's pricing becomes material, BullMQ on the existing Redis is the migration. The event payloads and
function signatures carry over; only the runner changes.

## Related

- [`../11-scheduling-and-jobs.md`](../11-scheduling-and-jobs.md)
- [`../23-ci-cd-and-deployment.md § Render`](../23-ci-cd-and-deployment.md#5-render)
- ADR 0001, why this is a separate process rather than a service
