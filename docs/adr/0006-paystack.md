# ADR 0006: Paystack for payments, no multi-provider abstraction

- Status: Accepted
- Date: 2026-02-12
- Deciders: Founder, CTO

## Context

Courtland collects rent, deposits, and sale instalments, and pays landlords out. Payment processing is the
core of the business, so the provider choice is consequential.

Nigeria's payment market has one dominant provider by a wide margin, plus a long tail. A platform integrating
"payments" as an abstraction across providers looks architecturally sophisticated and is, in practice, an
integration with one provider plus a layer that does not work.

## Decision

Integrate **Paystack** directly. No `PaymentProvider` interface, no adapter pattern, no provider registry.

Supported rails, all through Paystack:

| Rail | Use |
|---|---|
| Card | Default for tenants with cards |
| Bank transfer | Common for larger amounts and for landlords |
| USSD | For feature phones, which are still common in Nigeria |
| Payment links | Generated for offline or manual collection flows |

Outflows use Paystack Transfers and Subaccounts. Settlement reconciliation uses the Paystack API.

## Alternatives considered

**An abstraction over multiple providers.** Rejected. The abstraction would be exercised by exactly one
provider for years, so the untested branches accumulate. More importantly, the risky parts of payment
integration are provider-specific: signature verification, webhook semantics, split settlement timing, and
payout limits. An abstraction hides those differences behind the lowest common denominator, which is exactly
wrong for money. If a second provider is ever needed, extract it then, with real knowledge of both.

**Flutterwave or Paystack plus Flutterwave.** Rejected for v1. Two providers means two settlement
reconciliations, two webhook verifications, two sets of failure modes, and doubled monitoring. The
architectural cleanliness is not worth the operational cost.

**Direct bank transfers only.** Rejected. No reconciliation with the platform's own books, no webhook, no
chargeback handling, no card payments. Manual confirmation is a support queue.

**Crypto or a fintech stablecoin rail.** Rejected. Not what a Nigerian tenant paying rent expects, and it adds
regulatory and volatility questions to a product that wants to be boring.

## Consequences

**Easier.** One integration, well understood. Paystack is the largest provider in Nigeria, so coverage is
good. Their API is well documented and their sandbox works. One webhook signature scheme, one settlement
report format, one reconciliation.

**Harder.** A provider outage is an outage, and the platform says "we are having trouble reaching our payment
partner". No automatic failover. Migration to another provider means writing a reconciliation between two
sets of records, which is why the ledger is the source of truth rather than Paystack's dashboard.

**Cost.** Provider concentration risk, which is accepted and documented. A migration would be a project, not
a configuration change.

## Revisit when

- Paystack's pricing or payout limits make the business uneconomic. Check: effective fee rate above 3%, or a
  settlement limit below 50% of monthly volume.
- Paystack's service level degrades measurably. Check: webhook delivery failures above 1% over a month, or
  settlement delays beyond the agreed window in two consecutive months.
- The business needs a rail Paystack does not offer: cross-border payouts, a merchant-of-record arrangement, or
  a materially lower fee at volume.

If any of these happens, the ledger (ADR 0008) means the migration is a reconciliation rather than a rewrite.

## Related

- [`../10-payments-paystack.md`](../10-payments-paystack.md)
- ADR 0008, why the ledger is independent of the provider
- [`../24-operations-runbooks.md § Paystack`](../24-operations-runbooks.md#36-paystack-is-down)
