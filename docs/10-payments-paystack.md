# 10 — Payments and Paystack

Money is the part of Courtland that must never be wrong. This document covers the ledger model, the
Paystack integration, webhooks, refunds, reconciliation, and the failure modes that Nigerian payments
actually have.

## 1. Principles

| Principle | Consequence |
|---|---|
| The ledger is the truth, not the provider | Paystack is a transport. If Paystack's dashboard and the ledger disagree, the ledger wins and reconciliation flags it. |
| Every payment is immutable | `payments_ledger` rows are never updated except to fill `settled_at` from the settlement event. Corrections are new rows. |
| Every payment is allocated | A ledger row with no allocations is a bug, caught by a trigger and by a nightly sweep. |
| Money is `bigint` kobo | Never floats. Never `numeric`. Never strings over JSON. |
| Webhooks are the authority for success | A browser redirect says "I went to Paystack", not "the money arrived". |
| Client never marks a payment paid | A client can create an intent and initiate a charge. Only the webhook or a verification call can settle it. |
| Every state change is idempotent | Retries are guaranteed, so every handler must tolerate being called twice. |

## 2. The ledger model

Three tables plus one account view.

### 2.1 `payments_ledger`

One row per payment received. Written by the payment workflow as `service_role`.

| Column | Notes |
|---|---|
| `id` | UUID |
| `contract_id` | **Required.** A payment without a contract cannot be allocated to anyone. |
| `payer_id` | The authenticated user who paid. For a guarantor paying on someone's behalf, `payer_id` is the guarantor and `contract_parties` records the arrangement. |
| `owner_id` | The payee's `owners` row, denormalised for the payout query. |
| `intent_id` | The `payment_intents` row. Unique. |
| `provider` | `paystack` or `mock` |
| `provider_reference` | Paystack's reference. Unique per provider. |
| `amount_kobo` | Total received. Positive. |
| `currency` | `NGN` only in v1. |
| `fee_kobo` | What Paystack charged the payer. Stored, never recomputed. |
| `net_kobo` | `amount_kobo - fee_kobo`. Stored. |
| `status` | `pending`, `succeeded`, `failed`, `reversed` |
| `channel` | `card`, `bank`, `ussd`, `bank_transfer`, `mobile_money`, `offline` |
| `paid_at` | From the provider, not from our clock |
| `settled_at` | When the money became available for payout |
| `failure_code`, `failure_message` | On failure |
| `metadata` | Provider metadata, whitelisted keys only |

`amount_kobo`, `fee_kobo` and `net_kobo` are all stored rather than derived, because Paystack's fee
structure changes and a fee that shifts later must not rewrite history. `net_kobo` has a generated
identity check constraint `net_kobo = amount_kobo - fee_kobo` so the arithmetic cannot be wrong even if
code tries.

### 2.2 `ledger_allocations`

The double-entry shape, flattened. One payment splits into N allocations summing to `net_kobo`.

| Column | Notes |
|---|---|
| `payment_id` | |
| `beneficiary_type` | `owner`, `platform`, `contractor`, `reserve` |
| `owner_id` | Set when `beneficiary_type = 'owner'` |
| `basis` | `allocation_basis` enum: `rent_principal`, `service_charge_principal`, `management_fee`, `maintenance_deduction`, `sale_principal`, `sale_commission`, `deposit_holding`, `agreement_fee_holding`. What the money is *for*, which is a different question from who it is for. |
| `amount_kobo` | Always positive. Direction is implied by `is_payable`. |
| `is_payable` | True if the money can be transferred out. Platform revenue and held money are false. |
| `status`, `settlement_batch`, `settled_at` | Set by the payout run, never by the payment path |
| `deduction_source_ticket_id` | Required when `basis = 'maintenance_deduction'`, and unique, so a ticket is deducted at most once |

There is no `seq` column and no allocation for Paystack's own fee. The ordinal order of the rows is not
meaningful — the numbers exist to be summed, not read in sequence — and Paystack's fee is already outside
`net_kobo`, so an allocation for it would be a row carrying zero information. `payments_ledger.fee_kobo` is
the only record of it, and the two are cross-checked in reconciliation rather than duplicated here.

`payout_id` on the allocation is the one reverse pointer in the money tables, and it is deliberate: a payout
owns its allocations, the allocation names its payout with a real foreign key, and `settlement_batch`
mirrors `payouts.reference` for human reconciliation. The database joins on the key, never on the label.

### 2.3 Worked example: annual rent

```
Contract: 3-bed flat, Lekki. Rent ₦4,500,000 per annum, paid monthly.
Tenant pays October's instalment of ₦3,750,000 with a card.

Paystack charge:
  amount            3,750,000
  fee 1.5% + ₦100      -56,350      stored as fee_kobo
  net received      3,693,650      stored as net_kobo

ledger_allocations:                          sum = net_kobo
  beneficiary  basis             amount      is_payable
  owner        rent_principal   3,637,400   true
  platform     management_fee      56,250   false   (1.5% of rent, under the 10% cap)
                            -----------
                            3,693,650  ✓
```

Three details worth stating plainly, because each one is an argument somebody will otherwise have:

1. **The owner absorbs Paystack's fee.** The platform's revenue is the management fee, and the owner's
   principal is the remainder. At exactly 1.5%, Paystack's percentage charge and Courtland's management fee
   cancel, and the owner is out only the ₦100 fixed component. If a contract carries a different
   management fee, the difference lands on the owner's principal, so the fee is derived first and the
   principal is what is left, never the other way round.
2. **There is no allocation for Paystack's fee.** It is already outside `net_kobo`, so a row for it would
   carry no information and an amount of zero. `payments_ledger.fee_kobo` is the only record, and the two are
   cross-checked in reconciliation.
3. **`net_kobo` is what the allocations must sum to**, not `amount_kobo`. Allocating `amount_kobo` and
   deducting the fee later is how a ledger ends up ₦56,350 short with no row explaining the difference.

The `allocations_assert_balanced` trigger enforces `sum(amount_kobo) = net_kobo` on every allocation write,
so this cannot drift.

### 2.4 Worked example: deposit and sale

```
Sale of a plot, ₦12,000,000. Deposit of 20% received via bank transfer.

Bank transfer:
  amount             2,400,000
  fee (flat)              -100        stored as fee_kobo
  net received       2,399,900       stored as net_kobo

ledger_allocations:                          sum = net_kobo
  beneficiary  basis                  amount  is_payable
  owner        deposit_holding      2,339,900  false   ← held, not paid out
  platform     agreement_fee_holding   60,000  false   (2.5% one-off agency fee)
                                 -----------
                                 2,399,900  ✓
```

The closing is a **second payment**, not a rewrite of the first. When staff record the closing against a
registered transfer title, three things happen:

1. A new `payments_ledger` row for the balance (₦9,600,000), with its own `fee_kobo` and its own
   allocations summing to its own `net_kobo`. It is a different receipt of money on a different date.
2. The deposit allocation is **reclassified**: `basis` moves from `deposit_holding` to `sale_principal` and
   `is_payable` becomes true. Same row, same `id`, because the ₦2,400,000 has not moved — it has only
   stopped being held.
3. `sale_allocations.status` moves from `allocated` to `paid_outright` once the two allocations together cover
   the price, and to `released` when the title is issued.

```
After closing, the deposit allocation row:
  owner  sale_principal  2,339,900  is_payable = true   ← was deposit_holding, was false
```

`deposit_holding` with `is_payable = false` is what stops a payout run from sending a tenant's deposit to an
owner before the sale closes. The balance only becomes payable when staff record the closing, which
requires a registered transfer title as evidence. `GET /v1/ledger/accounts/{ownerId}` shows the held
amount separately so nobody has to infer it.

## 3. The payment intent

```
POST /v1/payment-intents
Idempotency-Key: 8f14e45f-…
Authorization: Bearer <tenant token>

{
  "contractId": "9f2c1e4a-…",
  "scheduleSeqs": [3, 4],
  "channel": "card",
  "saveCard": false
}
```

```
1. requirePermission('payment_create_own')
2. Validate the contract: exists, is `active`, the caller is a `tenant` party with `payment_create_own`.
3. Resolve the schedule rows. Sum their `amount_kobo`.
   - The sum must be > 0.
   - The rows must belong to one contract. No cross-contract payments: a single Paystack charge cannot
     settle a lease and a sale.
4. Determine `paymentPurpose` from the rows:
     - all rows are `rent`/`installment` → 'rent'
     - any row is `deposit` or `caution_fee' → 'deposit'
     - the contract kind is `sale` → 'sale'
     - rows are `other` → 'general'
   This is derived, never supplied by the client. A client cannot declare a payment to be something it is not.
5. INSERT INTO payment_intents (contract_id, payer_id, schedule_seqs, amount_kobo, currency,
       purpose, status='created', expires_at = now() + interval '30 minutes')
6. Paystack initialisation (server-side):
     POST https://api.paystack.co/transaction/initialize
     {
       "email": "<payer email>",
       "amount": 3750000,                    // kobo, integer, no rounding
       "currency": "NGN",
       "reference": "<payment_intents.reference>",
       "callback_url": "https://courtland.com.ng/portal/payments/return?intent=<id>",
       "channels": ["card","bank","ussd","bank_transfer"],
       "split_code": "<tenant's subaccount code>",
       "subaccount": "<tenant's subaccount id>",
       "metadata": {
         "payment_id": "<intent id>",
         "contract_id": "<contract id>",
         "purpose": "rent",
         "schedule_seqs": "3,4"
       }
     }
7. UPDATE payment_intents SET status='pending', authorization_url=…, provider_reference=…
8. Return 201 { data: { intentId, authorizationUrl, amountKobo, expiresAt } }
```

The client receives a URL and redirects. It never receives Paystack's raw response body, and it cannot
construct its own initialisation, because the amount, the reference and the subaccount are all
server-determined.

### 3.1 Amount integrity

The amount in the Paystack initialisation is written as an integer with no decimal point. Drizzle's
`bigint({ mode: 'number' })` gives a JS number, which is safe up to 9,007,199,254,740,991. A monthly rent
of ₦3,750,000 is 375,000,000 kobo — four orders of magnitude below the limit. `apps/api/test/unit/money.test.ts`
asserts that every amount the API can produce stays inside `Number.MAX_SAFE_INTEGER`, so a future
multi-currency addition cannot silently overflow.

### 3.2 Split codes and subaccounts

| Transaction | `subaccount` | `split_code` | Behaviour |
|---|---|---|---|
| Rent, agency-managed | owner | `tenant-{ownerId}` | Money routes to the owner's verified subaccount. |
| Deposit | — | — | Held by Courtland. `subaccount` omitted. |
| Sale instalment | — | — | Held by Courtland until closing. |
| Service charge / management fee | — | — | `subaccount` omitted, so the money routes to the Courtland account. |

A tenant of an agency-managed property pays into the owner's subaccount; a deposit pays into Courtland's
account because Courtland holds it. `paystack_accounts` holds the `subaccount_id` and `split_code` per
owner, created through Paystack's subaccount API when a payout account is verified.

The `split_code` on a rent transaction is derived from the owner, so the money lands in the right place
without the client naming an account. That is the point: a client that could choose a subaccount could send
someone else's rent to their own account.

### 3.3 Currency

NGN only. The `currency` column exists so a later addition is a data change and not a schema migration, but
every API surface validates `NGN` and rejects anything else with `business_rule_violation`. No FX, no
multi-currency display, no rounding between currencies.

## 4. Webhooks

### 4.1 The endpoint

Paystack delivers to `https://api.courtland.com.ng/v1/integrations/paystack/webhook`. Also served by a
Supabase Edge Function at `https://<project>.supabase.co/functions/paystack-webhook`, which forwards to the
API. Both paths land in the same handler.

The reason for the dual path is availability, not cleverness: a Render cold start or an outage during
maintenance must not cause missed payment confirmations, because a missed webhook means a paid tenant
whose rent still shows as unpaid.

### 4.2 Signature verification

```ts
// apps/api/src/modules/money/webhooks/paystack.ts
export function verifyPaystackSignature(rawBody: Buffer, signature: string): boolean {
  const secret = env.PAYSTACK_SECRET_KEY
  const expected = crypto
    .createHmac('sha512', secret)
    .update(rawBody)
    .digest('hex')

  const a = Buffer.from(expected, 'utf8')
  const b = Buffer.from(signature, 'utf8')
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}
```

`timingSafeEqual` because a naive `===` on a signature leaks its contents through timing. The handler must
receive the **raw** request body: `express.raw({ type: 'application/json' })` on this route only, with the
signature checked before any JSON parsing. Re-serialising a parsed object changes the bytes and the HMAC
stops matching — a mistake that produces 100% signature failures and is easy to make.

### 4.3 Events handled

| Event | Action |
|---|---|
| `charge.success` | Settle the payment, write allocations, mark schedule rows paid, enqueue receipt and notice |
| `charge.failed` | Mark the intent failed; optionally move to the next schedule row |
| `transfer.success` | Mark the `payout` row successful |
| `transfer.failed` | Mark the payout failed, return allocations to the payable pool |
| `transfer.reversed` | Reverse the payout, create a recovery item |
| `customer.created` | Nothing; recorded for reference |

### 4.4 The idempotent handler

```ts
export async function handleChargeSuccess(event: PaystackEvent): Promise<void> {
  const reference = event.data.reference

  // 1. Idempotency: a unique index on (provider, provider_reference) makes the insert the lock.
  const { rows: inserted } = await adminDb(sql`
    insert into public.payments_ledger (
      id, contract_id, payer_id, owner_id, intent_id, provider, provider_reference,
      amount_kobo, fee_kobo, net_kobo, currency, status, channel, paid_at, metadata
    ) values (
      ${event.data.id}, ${contractId}, ${payerId}, ${ownerId}, ${intentId},
      'paystack', ${reference}, ${amountKobo}, ${feeKobo}, ${netKobo}, 'NGN',
      'succeeded', ${event.data.channel}, ${event.data.paid_at},
      ${jsonb(whitelistMetadata(event.data.metadata))}
    )
    on conflict (provider, provider_reference) do nothing
    returning id
  `)

  // Nothing inserted → this webhook was already processed. Reply 200 and stop.
  if (inserted.length === 0) return

  const paymentId = inserted[0].id

  // 2. Allocations, computed server-side.
  await computeAllocations(paymentId, event.data)

  // 3. Schedule rows → paid.
  await markSchedulePaid(contractId, intent.scheduleSeqs, paymentId)

  // 4. Contract event, receipt, and a notification. All via the outbox so a failure
  //    here cannot roll back the settlement.
  await outbox.enqueue('payment.succeeded', { paymentId, contractId, payerId })
}
```

The `on conflict do nothing` is the whole idempotency story. Paystack retries a webhook until it gets a 200,
and a double-settled payment is the worst bug this system could have. The unique constraint on
`(provider, provider_reference)` is the lock; the application never has to ask "did I already do this?".

Paystack sends the same event more than once in normal operation — at-least-once delivery is their design,
not an edge case. This handler assumes it.

### 4.5 Webhook responses

| Situation | Response |
|---|---|
| Signature invalid | `401`, no processing. Log the mismatch with the request id. |
| Event type not handled | `200` immediately. Unhandled events must not accumulate retries. |
| Database error | `500`, so Paystack retries. |
| Duplicate reference | `200`, already processed. |
| Signature valid but the intent is missing | `200`, and an `orphan_payment` audit row. A human investigates. Settling an orphan is a deliberate staff action, never automatic. |

Paystack retries for about 24 hours with exponential backoff on a 5xx. Beyond that the payment stays
`pending` in Paystack, and the nightly reconciliation job finds it:

```
select p.provider_reference, p.amount_kobo, p.created_at
from payment_intents p
where p.status = 'pending'
  and p.created_at < now() - interval '24 hours'
```
Each is verified against Paystack's API and either settled or marked failed.

## 5. Client-side confirmation

The browser returns from Paystack to `/portal/payments/return?intent=<id>`. That page does not claim
success.

```
1. GET /v1/payment-intents/{id}
2. If status is 'succeeded' → confirmation screen, receipt link.
3. If status is 'pending' → polling screen, GET every 2 seconds for up to 30 seconds.
4. If still pending → "We're confirming your payment. You'll get an SMS shortly."
   and a link to the payments list. The webhook is in flight.
5. If status is 'failed' → the failure message from Paystack, and a Retry button that creates a new intent.
```

The portal never writes to the ledger. The reason it polls is that the webhook has usually landed already
and the user is looking at a stale page; polling is a display concern, not the source of truth.

There is also a manual fallback for the case where a webhook is genuinely lost: `POST /v1/payments/{id}/verify`,
which calls Paystack's verify endpoint, compares the amount and reference against the intent, and settles
if it matches. It is idempotent, so running it against an already-settled payment is harmless.

## 6. Offline and manual payments

Cash is real in Nigerian residential letting. Refusing it would push the business elsewhere.

| Channel | How it works |
|---|---|
| `offline` | Staff records a payment: amount, date received, method (`cash`, `bank_transfer`, `pos`), reference. It creates a `payments_ledger` row with `provider = 'offline'`, allocations computed the same way, and `paid_at` from the stated date. |
| Bank transfer | Staff record the transfer with the bank reference. The settlement job matches it against Paystack's transfer list and upgrades `provider` to `paystack` if it matches. |
| POS | As offline. |

Every offline payment requires a receipt reference and is audited. A portal user can see their offline
payments, so the tenant's statement includes cash the landlord collected. Staff cannot record an offline
payment without `payment_create_any`, and every one writes an `audit_log` row naming the person and the
amount.

The API rejects an offline payment larger than the outstanding schedule total, which stops a typo from
creating a ₦45,000,000 credit.

## 7. Refunds

```
POST /v1/payments/{id}/refund
{ "amountKobo": 4500000, "reason": "Deposit refund on termination, agreement CL-2026-000412" }
```

```
1. requirePermission('payment_refund')
2. The refund total for this payment must not exceed net_kobo. Cumulative, not per-request:
     sum(refunds where payment_id = $1) + amount_kobo <= net_kobo
3. Paystack POST /refund, using the original transaction reference.
4. On success:
     - INSERT the `refunds` row as processed, with `paystack_refund_id`.
     - INSERT one `refund_allocations` row per original allocation, split pro rata and rounded so the
       parts sum exactly to `refunds.amount_kobo` — the largest-remainder method, with the remainder going
       to the largest allocation. Rounding each part independently is how a ₦100 refund becomes three rows
       totalling ₦101 or ₦99.
     - The `ledger_allocations` rows are untouched. `private.assert_ledger_balanced` still holds, because the
       invariant is about what was received and a refund does not change what was received. What changed is
       how much of it is still ours: `net_kobo - sum(refund_allocations)`.
     - If the refunded owner's allocation has already settled in a payout, the refund is raised as a
       recovery item against the owner rather than deducted from a future batch. The alternative is
       silently clawing back money from an unrelated owner's rent.
5. Update the schedule rows back to `pending` if the refund was for a paid line, and re-run the arrears
   sweep for that contract.
6. Notify both parties.
```

Refunds are always full or partial against a specific payment, never against a contract. "Refund the tenant's
deposit" is ambiguous across a 24-month lease with several payments; "refund ₦4,500,000 of payment
`pay_…`" is not.

A refund is idempotent by `Idempotency-Key`, and the same cumulative check catches a race where two refunds
concurrently exceed the balance.

## 8. Payouts

Owners are paid, not just collected from. The flow is four steps and four permissions, deliberately
separated so no single person can move money end to end.

```
1. payout_run        Build a run from payable allocations that are due and unclaimed
2. payout_approve    A second staff member approves
3. payout_initiate   Transfers are created with Paystack, in batches of 500
4. (webhook)         transfer.success / transfer.failed closes each payout row
```

### 8.1 Building a run

```
POST /v1/payouts/runs { "asOf": "2026-09-30" }
```

Eligible allocations:

```sql
select a.*
from ledger_allocations a
join payouts p on p.id = a.payout_id
where a.is_payable
  and a.payout_id is null
  and a.owner_id is not null
  and exists (select 1 from owners o where o.id = a.owner_id and o.kyc_status = 'approved')
  and exists (select 1 from paystack_accounts pa
              where pa.owner_id = a.owner_id and pa.verified_at is not null)
order by a.owner_id, a.payment_id, a.seq
```

Both conditions matter: an owner without approved KYC or without a verified payout account is excluded, not
paid to a wrong place. `payout_run` permission is not enough on its own; the run creation query refuses
ineligible owners and reports them as `skipped` with a reason, so the approver sees exactly why.

### 8.2 Approving

`POST /v1/payouts/{id}/approve`. The approver must not be the creator. A self-approval returns
`business_rule_violation` with a detail explaining two-person control. The check is at the database level
as well:

```sql
create or replace function private.assert_payout_dual_control()
returns trigger language plpgsql as $$
begin
  if new.approved_by = new.created_by then
    raise exception 'payout % requires a second approver', new.id
      using errcode = 'check_violation';
  end if;
  return new;
end $$;
```

### 8.3 Initiating

```
POST /v1/payouts/{id}/initiate
```

Batches of 500 transfers, because that is Paystack's documented batch limit. Each transfer references the
payout id. `transfer.success` marks the row; `transfer.failed` returns the allocation to the payable pool by
nulling `payout_id`, so the next run picks it up. A failed transfer is never silently dropped and never
retried automatically without a new run.

### 8.4 Payout timing

| Rule | Value |
|---|---|
| Payout lag | 3 business days after settlement, so chargebacks can arrive |
| Minimum payout | ₦5,000 |
| Batch schedule | Weekly, Tuesday. `CRON_TZ=Africa/Lagos`. |
| Partial payouts | Allowed. An owner's balance above the minimum can be paid out while smaller balances accumulate. |

The payout lag is the single most important fraud control in the system. Without it, a card charge can be
settled and paid out to a landlord within minutes, and the bank reversal arrives the next week with nothing
left to claw back.

## 9. Reconciliation

The nightly job compares three sources and must find zero unexplained differences.

```
Sources:
  A  payments_ledger  where status = 'succeeded'
  B  Paystack /transaction (paginated, 500 per page)
  C  Paystack /balance + /settlement

Checks:
  1  Every B reference exists in A                     → missing_in_ledger
  2  Every A paystack reference exists in B             → missing_at_provider
  3  For matched rows, amount and fee agree             → amount_mismatch
  4  sum(A.net_kobo) for a period == C net settlement   → settlement_variance
  5  Every payout has a terminal transfer status within 48h → payout_stuck
```

A variance is written to `reconciliation_exceptions` with the expected and actual values, and raises a
`finance.reconciliation_variance` event. Anything unresolved after 3 days pages the on-call. A money system
that reports discrepancies the morning after is worth ten audits.

`GET /v1/payments/reconciliation?from=&to=` shows the run results and the exceptions, for staff.

## 10. Failure modes

Real, observed, and handled:

| Failure | Detection | Response |
|---|---|---|
| Webhook lost or delayed | Intent stuck `pending` past 30 min | Nightly sweep verifies against Paystack and settles |
| Duplicate webhook | `on conflict do nothing` | Silent, correct |
| Amount mismatch on verify | `amount_mismatch` in reconciliation | Alert; payment held; no allocation |
| Paystack API timeout during initialisation | HTTP 502 `provider_error` | Client retries with the same `Idempotency-Key` |
| Tenant pays twice | Two intents, two payments | Second is refunded automatically by the sweep when the amount matches an already-settled line within 10 minutes |
| Bank transfer not initiated | `payment_pending` after 30 min | Notice to the payer with the account details |
| Chargeback or reversal | `charge.reversed` or a reconciliation variance | Allocation reversal; owner notified; recovery item created |
| Paystack account suspended | `transfer.failed` with `account_disabled` | Owner notified; allocation returned to the pool; payout account flagged `restricted` |
| Allocated but unallocatable (owner deleted) | `not exists` on the owner FK | Cannot happen: `on delete restrict`. The allocation is `reserve`-typed instead. |

## 11. Reconciliation of the ledger with `contract_schedule`

A nightly assertion, run in CI's database suite as well:

```sql
-- every succeeded payment's schedule rows are paid; every paid schedule row has a payment
select count(*) from contract_schedule s
where s.status = 'paid'
  and not exists (select 1 from payments_ledger p where p.id = s.payment_id and p.status = 'succeeded');

select count(*) from payments_ledger p
where p.status = 'succeeded'
  and not exists (select 1 from ledger_allocations a where a.payment_id = p.id);

select count(*) from payments_ledger p
where p.status = 'succeeded'
  and (select coalesce(sum(a.amount_kobo), 0) from ledger_allocations a where a.payment_id = p.id)
      <> p.net_kobo;
```

All three must return 0. They run nightly in production and on every migration in CI, so a schema change
that breaks the invariant fails the build instead of the business.

## 12. Data protection

| Concern | Handling |
|---|---|
| Card data | Never reaches Courtland. Paystack's hosted page and Paystack's own JS handle it. PCI scope is Paystack's; Courtland stores no PAN, no CVV, no expiry. |
| What we store | Only the last 4 digits and the bank name, in `payment_methods` when `saveCard` is used. |
| `saveCard` | Off by default. When on, it stores a Paystack authorization code, which is a token, not a card. |
| Reconciliation data | `metadata` is whitelisted to specific keys on write. Never store a full provider payload with a customer's name and email echoed back. |
| Refunds | Every refund is an audit row. Refunds are not deletable. |

## 13. Related documents

- Ledger schema: [`05-database-schema.md`](./05-database-schema.md)
- Contract schedule generation: [`09-contracts-and-billing.md`](./09-contracts-and-billing.md)
- Nightly reconciliation job: [`11-scheduling-and-jobs.md`](./11-scheduling-and-jobs.md)
- Receipt and statement PDFs: [`12-documents-and-pdfs.md`](./12-documents-and-pdfs.md)
- PCI and secret handling: [`19-security.md`](./19-security.md)
