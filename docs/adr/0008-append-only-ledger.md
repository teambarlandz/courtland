# ADR 0008: An append-only ledger with allocations, not a mutable balance column

- Status: Accepted
- Date: 2026-02-13
- Deciders: CTO, Finance advisor

## Context

Courtland holds other people's money and owes landlords. The accounting questions are: how much has this
tenant paid, how much is owed to this landlord, how much of a payment is principal and how much is the
platform's fee, and can we prove the total in every account adds up.

The simplest design is a mutable balance per contract or per owner, incremented on each payment. It is also
the design that cannot answer "show me the statement for March", cannot recover from an incorrect increment,
and makes "how much is owed to this landlord right now" a question about a number that may have been
incremented wrong three times.

## Decision

An **append-only ledger**.

`payments_ledger` holds one immutable row per payment received: amount, provider fee, net, status, channel,
timestamps. `ledger_allocations` splits each payment into its beneficiaries, and the split must sum exactly
to the net.

| Beneficiary | `basis` values | Example |
|---|---|---|
| Owner | `rent_principal`, `sale_principal`, `service_charge_principal` | The rent itself |
| Owner, held | `deposit_holding` | A sale deposit before closing: not payable yet |
| Platform | `management_fee`, `agreement_fee_holding`, `sale_commission` | The agreed agency fee |
| Contractor | `maintenance_deduction` | An approved repair cost offset against the owner's next payout |
| Reserve | — | Held pending an allocation decision, `beneficiary_type = 'reserve'` |

There is no `provider_fee` allocation. Paystack's fee is already outside `net_kobo`, so an allocation for it
would be a row whose amount is always zero; `payments_ledger.fee_kobo` is the single record, and
reconciliation cross-checks the two rather than duplicating the number. `beneficiary_type` therefore never
takes the value `paystack`.

Balances are derived, never stored:

```sql
create view private.owner_balances as
select a.owner_id,
       sum(a.amount_kobo) filter (where a.is_payable) as payable_kobo,
       sum(a.amount_kobo) filter (where a.basis = 'deposit_holding') as held_kobo
from ledger_allocations a
join payments_ledger p on p.id = a.payment_id and p.status = 'succeeded'
left join (select allocation_id, sum(amount_kobo) as refunded_kobo
           from refund_allocations group by allocation_id) r on r.allocation_id = a.id
where a.owner_id is not null
group by a.owner_id, r.refunded_kobo;
-- both sums then subtract coalesce(r.refunded_kobo, 0). refund_allocations is subtracted rather than
-- mutating an allocation: allocation_status has no 'refunded' value on purpose (append-only, I10 holds).
-- The view is written out in full in 05 § 14.4.
```

Three database-level guarantees:

1. A trigger asserts that allocations for a payment sum to `net_kobo`.
2. A trigger asserts the same on every write to an allocation, so a partial write cannot persist.
3. `payments_ledger.net_kobo` has a generated check constraint of `amount_kobo - fee_kobo`.

## Alternatives considered

**A mutable balance column.** Rejected. Unauditable, unrecoverable, and unable to answer period questions. It
is also the design that produces support tickets of the form "your rent shows paid but the balance says
otherwise".

**Double-entry with a chart of accounts.** Rejected as more than needed. Full double-entry means an accounts
table, journal entries with balanced debits and credits, and a chart. Courtland has four beneficiary types
and a clear allocation model, so allocations express the same guarantees with one table instead of three.

**A ledger plus a cached balance column.** Rejected, for now. A cached balance is fast and is the natural
next optimisation. Introducing it alongside the append-only ledger means two things that must agree, and
that is a reconciliation problem created for performance reasons. If a balance query becomes a bottleneck,
add it as a materialised view refreshed by job, so the cache is derived and rebuildable rather than
authoritative.

**Stripe-style balance transactions with a running balance.** Rejected. A running balance is a mutable
denormalisation, which is the thing being avoided, and a per-payment running balance is not correct when
refunds and reversals exist.

**Event sourcing for payments.** Rejected. The events here are payments, refunds, and reversals, which are
already rows. Event sourcing would add an event log, projections, and projection repair, for a domain where
the ledger row is the event.

## Consequences

**Easier.** Every statement is a query over immutable rows, so a March statement is reproducible forever.
An incorrect allocation is corrected by a reversal row, not by editing history. Reconciliation against
Paystack is a set difference between two immutable sets. The tenant's receipt and the landlord's advice come
from the same rows and cannot disagree.

**Harder.** Balance queries are aggregations and get slower as the table grows, so indexes matter and a
materialised view will eventually be needed. Reversals are conceptually harder than a decrement: a refund is
not a negative payment but a set of reversing allocations. The derived-balance model requires the reader to
understand that "held" and "payable" are different questions.

**Cost.** Storage grows without deletion, mitigated by the 7-year retention rule and by exports to cold
storage. Aggregation queries need care at scale.

## Revisit when

- A balance query exceeds 500 ms at production volume. Check: the owner dashboard p95.
- The ledger passes 50 million rows. Check: table size and vacuum pressure.
- Multiple currencies arrive. Check: a real requirement rather than a plan. Balances become per-currency and
  never summed across currencies.

The first two are solved by a materialised view refreshed by the existing nightly job, not by changing the
ledger.

## Related

- [`../10-payments-paystack.md § The ledger model`](../10-payments-paystack.md#2-the-ledger-model)
- [`../05-database-schema.md`](../05-database-schema.md)
- ADR 0006, why the ledger is independent of Paystack
- ADR 0007, the representation this depends on
