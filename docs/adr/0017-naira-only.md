# ADR 0017: NGN only in v1

- Status: Accepted
- Date: 2026-02-17
- Deciders: Founder, CTO

## Context

A property platform in West Africa will eventually be asked about other currencies: a diaspora landlord paid
in dollars, a buyer remitting from abroad, or an expansion into Ghana or Kenya. Supporting multiple currencies
from the start is a large amount of work in the money domain, which is the domain where errors are most
expensive.

The question is whether the currency column should be respected from day one or added later.

## Decision

**NGN only in v1.** Every payment, allocation, schedule row, and ledger row is NGN. The `currency` column
exists on `payments_ledger` and `payment_intents` and is always `'NGN'`, so adding a currency later is a data
change rather than a schema migration.

The API validates `NGN` and rejects anything else with `business_rule_violation`. There is no FX rate table,
no conversion, and no multi-currency display.

## Alternatives considered

**Multi-currency from the start, with an FX rate table.** Rejected. FX introduces a rate source, a rate
timestamp, a rounding policy per pair, a question of which rate applies on which day, and reconciliation
against a provider that converted at its own rate. Each of those is a money bug waiting to happen, and none
of them helps a Nigerian tenant paying rent in naira.

**No currency column at all.** Rejected. Adding the column later means a migration across every money table
during business hours. Keeping it and using it is free.

**A currency field on the money object, fully supported.** This is partially what was chosen: the API's `Money`
type is `{ amountKobo, currency }` (ADR 0018's client work), so a consumer is already prepared for the
currency to vary. What is not chosen is conversion.

**USDT or a stablecoin for diaspora payments.** Rejected for v1. It is a real need and a plausible Phase 18
addition, but it would require its own compliance review before it could touch a tenancy's money.

## Consequences

**Easier.** No FX anywhere. No rounding between currencies. The ledger invariant is a sum of naira amounts.
Reconciliation against Paystack is one currency. Statements are unambiguous. A tenant in diaspora pays with a
card and the settlement is in naira, which Paystack handles.

**Harder.** A landlord who wants to be paid in dollars cannot be, in v1. A diaspora buyer cannot remit
directly. If those become common, adding a currency means a rate source, a rounding policy, and a decision
about which rate applies to a payment received on a given day, and it will be a project rather than a
configuration change.

**Cost.** Foregone revenue from cross-border use cases in v1, and the project cost later if the market requires
it.

## Revisit when

- A material share of landlords request non-naira payouts. Check: payout-account registration data.
- A material share of buyers are paying from outside Nigeria. Check: Paystack's settlement geography on the
  transactions.
- The business enters another market. Check: a decision, not a signal.

Adding USDT specifically would need its own ADR, because it is a compliance question before it is an
engineering one.

## Related

- ADR 0007, the money representation
- ADR 0008, the ledger
- [`../04-domain-model.md § Money`](../04-domain-model.md#4-money)
- [`../18-api-clients-and-state.md § Money types`](../18-api-clients-and-state.md#5-money-types)
