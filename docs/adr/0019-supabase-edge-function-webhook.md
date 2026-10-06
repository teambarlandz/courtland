# ADR 0019: A Supabase Edge Function mirrors the Paystack webhook

- Status: Accepted
- Date: 2026-02-18
- Deciders: CTO

## Context

Paystack delivers payment confirmations by webhook. If a webhook is missed, the tenant has paid and the system
does not know, which produces the worst support case in the product: a tenant arguing they paid.

Paystack retries for roughly 24 hours on a 5xx. A Render cold start, a deploy, or an incident can exceed that
window.

## Decision

Register **two** webhook URLs with Paystack:

```
https://api.courtland.com.ng/v1/integrations/paystack/webhook      (primary, Render)
https://<project>.supabase.co/functions/paystack-webhook           (mirror, Edge Function)
```

The Edge Function does not process payments. It verifies the signature, then forwards the raw body and the
signature header to the primary API. Both paths land in the same handler, and the handler is idempotent by
`on conflict do nothing` on `(provider, provider_reference)`.

```
Paystack ─┬─→ Render API      ─┐
          │                    ├─→ handleChargeSuccess ─→ ledger (idempotent)
          └─→ Edge Function ───┘
```

## Alternatives considered

**One URL on Render.** Rejected. It makes payment confirmation depend on Render's availability, including
cold starts and deploys, at the moment the product can least afford it.

**The Edge Function as the primary, processing the payment itself.** Rejected. That means two implementations
of the settlement logic, or moving the logic into Deno, which loses the shared Drizzle code and the
service-role boundary. One implementation, two doors.

**A third-party webhook relay such as Webhooks.fyi.** Rejected. It adds a vendor between a payment
confirmation and the ledger, with its own availability, its own data (payment payloads), and a per-request
cost. The problem it solves, durability of inbound webhooks, is solved by the mirror for free.

**Queue the webhook and process asynchronously, always.** Rejected. It adds latency between the payment and
the settlement, which is exactly the latency a tenant staring at a polling screen experiences. It is also
strictly worse for the same availability reason: if the queue enqueue is what fails, nothing improved.

**Poll Paystack on a schedule as the primary mechanism.** Rejected as primary. Polling is a backstop
(`payment-reconcile` catches intents older than 24 hours), not a mechanism. A confirmed payment should settle
in seconds, not in the next nightly run.

## Consequences

**Easier.** A missed webhook becomes a survivable event: the mirror delivers it while Render is unavailable.
The Edge Function has no cold start, so the mirror's latency is reliably low. Payment settlement does not
depend on one platform's availability.

**Harder.** Two endpoints to deploy, secure, and monitor. The Edge Function has its own secrets, so
`PAYSTACK_WEBHOOK_SECRET` and the forwarding URL exist in two places. The Edge Function must not be
mistaken for a place where payment logic could diverge; keeping it a thin forwarder is a review responsibility.
Anyone debugging "the webhook did not arrive" now has three hops to check.

**Cost.** One small Edge Function. A second place for the webhook secret.

## Revisit when

- Render's availability improves such that cold starts are no longer a factor. Check: webhook delivery latency
  percentiles.
- The webhook mirror has never been needed in production. Check: incident and support logs. This is not
  sufficient on its own, since absence of evidence is not evidence of absence during an incident, but a year
  with zero activations is worth a look.
- Supabase Edge Functions become materially more expensive or throttled. Check: the usage dashboard.

The mirror's activation rate should be a monitored metric. If it is always zero, the complexity may not be
earning its keep; if it is ever needed, it pays for itself immediately.

## Related

- [`../10-payments-paystack.md § Webhooks`](../10-payments-paystack.md#4-webhooks)
- [`../19-security.md § Trust boundaries`](../19-security.md#2-trust-boundaries)
- [`../24-operations-runbooks.md § Paystack`](../24-operations-runbooks.md)
