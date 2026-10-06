# 09 — Contracts and billing

A contract is the legal spine of Courtland. A payment without a contract is a bug; a contract without a
schedule is an incomplete contract. This document defines the states a contract moves through, what each
transition means legally and operationally, and how the billing schedule is derived and kept in step with
reality.

## 1. Contract kinds

Two kinds, with different economics and different schedules.

| | `lease` | `sale` |
|---|---|---|
| What it conveys | Time-limited possession | Ownership transfer via registered land title |
| Duration | 1 month to 5 years, commonly 1 or 2 years | Fixed closing date, or "as soon as possible" |
| Money | Rent, in monthly or annual instalments | Price, in a negotiated instalment plan |
| Security | 2 months' rent typical, 1 for a Nigerian residential tenant in good standing, and frequently **nothing** | Deposit typically 10–30%, plus a refundable caution fee |
| Recurring | Yes | No, until the plan ends |
| Governing law | Nigerian tenancy law, state-specific notice periods | NUGA 1990 and the state's Land Registration Act |
| Who signs | Landlord (or agent) and tenant | Seller (or vendor) and buyer |
| Courtland's role | Agent and rent manager | Agent and payment escrow for instalments |

A `lease` is never converted into a `sale`. A tenant who decides to buy creates a separate sale contract
on the same unit, and the unit transitions `occupied → vacant` before the sale's `under_offer` state.
Keeping them separate means a rent ledger and a purchase ledger never share a balance, which is what a
finance team will ask about in month one.

## 2. Contract states

```
 draft ──submit──▶ in_review ──approve──▶ approved ──activate──▶ active
   │                    │                      │                     │
   │                    └──reject──▶ rejected   │                     │
   │                                           │         ┌───────────┼───────────┐
   └──delete                                   │         ▼           ▼           ▼
                                          (signed)  suspended   terminated    active ──renew──▶ active
                                                     │              │
                                                     └──resume──▶ active
```

| State | Meaning | Who can move it | Payments allowed |
|---|---|---|---|
| `draft` | Being assembled. Not visible to any party except the creator. | Staff, owner | None |
| `in_review` | Submitted for approval. Both parties can see it is being processed. | Staff, owner (to withdraw) | None |
| `approved` | Terms accepted by both parties, no money yet. Awaiting signature or first payment. | Staff | None, except a deposit if the schedule's first item is a deposit |
| `active` | In force. | Staff | Full schedule |
| `suspended` | Temporarily halted. Occupancy continues in most cases, but no new payments are accepted. Used for a dispute or a failed verification. | Staff | None until resumed |
| `terminated` | Ended. Date recorded. | Staff | Only refunds |
| `rejected` | Terms refused. Terminal. | Staff | None |
| `expired` | Reached its end date without renewal. Terminal. | System (job) | None |
| `renewed` | Superseded by a successor contract. Terminal, set on the old row. | System | None |

`approved` is separate from `active` because the gap between them is where money actually moves. A Nigerian
residential lease is frequently signed and paid simultaneously, so the gap is often minutes. A sale's gap is
longer: the deposit may be paid at `approved`, and the balance at `active`, and the plan exists to survive
the months in between.

### 2.1 Transition rules

| From | To | Preconditions | Side effects |
|---|---|---|---|
| `draft` | `in_review` | At least one party; `start_date` set; schedule generated; `document_template_id` chosen | Notifies the counterparty |
| `in_review` | `approved` | All parties verified; KYC approved for the payer; payout account verified for the payee | Generates the agreement PDF; opens the signature window |
| `in_review` | `rejected` | Reason required | Notifies the creator |
| `approved` | `active` | First schedule item is `paid`, or waived by staff | Starts the payment clock; starts maintenance-ticket eligibility |
| `active` | `suspended` | Reason required; no unsettled disputes | Notifies both parties; stops new payments |
| `suspended` | `active` | Disputes resolved or withdrawn | Resumes payments |
| `active` | `terminated` | Notice served per state law; settlement recorded; refund balance computed | Stops the schedule; queues prorated refund; frees the unit |
| `active` | `expired` | `end_date` passed | Notifies both parties 60 days ahead via the reminder job |
| `active` | `renewed` | Successor contract `active` | Links the successor |

Every transition writes a `contract_events` row with the actor, the from and to state, a reason, and the
IP and user agent. `contract_events` is append-only and readable by the parties, so "why is my rent not
working" is answerable from the record rather than from a support ticket.

## 3. Parties

`contract_parties` is many-to-many, because real Nigerian arrangements are not always two people.

| `role` | Meaning | Typical count |
|---|---|---|
| `landlord` | The property owner or their agent | 1–2 (co-owners) |
| `tenant` | The person paying rent and occupying | 1–2 (a couple applying jointly) |
| `buyer` | The purchaser | 1–2 |
| `seller` | The vendor | 1 |
| `guarantor` | A third party standing behind a tenant's rent | 0–1 |
| `witness` | Named on the document | 0–2 |
| `lawyer` | A tenant's or owner's representative | 0–1 |

Two database-level rules enforce sanity:

```sql
-- I7: at most one primary party per contract, whichever side they are on.
-- Unique on (contract_id) where is_primary, in 05 § 7.2. It cannot be a unique on
-- (contract_id, party_role) where is_primary, because two co-buyers both signing as primary
-- is the normal case for a joint purchase and that rule would reject it.

-- No duplicate party. Already the table constraint in 05 § 7.2:
--   unique (contract_id, party_role, party_name)

-- A user may not be both the landlord and the tenant of the same contract.
create or replace function private.assert_parties_not_both_sides()
returns trigger language plpgsql as $$
begin
  if exists (
    select 1 from public.contract_parties a, public.contract_parties b
    where a.contract_id = b.contract_id
      and a.user_id is not null and a.user_id = b.user_id
      and a.party_role in ('landlord','co_landlord')
      and b.party_role in ('tenant','co_tenant')
  ) then
    raise exception 'user % is on both sides of contract %', new.user_id, new.contract_id
      using errcode = 'check_violation';
  end if;
  return null;
end $$;

-- CONSTRAINT trigger, and DEFERRABLE, for two reasons. A row trigger fires per row, and the offending
-- state is "this contract has a landlord who is also a tenant", which only exists once both rows are in;
-- and a deferred check lets the two inserts commit in one transaction instead of forcing the caller to
-- disable the trigger, which is what people reach for when a constraint gets in the way.
create constraint trigger contract_parties_not_both_sides
  after insert or update on public.contract_parties
  deferrable initially deferred
  for each row execute function private.assert_parties_not_both_sides();
```

This is the shape, not `check (not exists (select ... from the same table))`. A `CHECK` cannot contain a
subquery at all, so the version that looks equivalent fails at migration time with `cannot use subquery in
check constraint`. The legal shape for a rule about rows of one table is a trigger; when the rule spans two
rows written in the same transaction, it is a deferred constraint trigger.

Each party row carries:

| Column | Purpose |
|---|---|
| `user_id` | The authenticated account. Nullable, because a landlord may be registered by staff and never have signed in. |
| `party_name` | Legal name as it appears on the agreement. Denormalised so a document generated in March still reads correctly if the profile name changes in June. |
| `phone_e164`, `email` | Contact details captured at agreement time. |
| `nationality`, `address` | `address` is required for a guarantor and a witness, who are named in the agreement. |
| `is_primary` | The one party per side who signs and receives notices. At most one per contract: I7. |
| `signature_document_id` | The signed PDF page image. Nullable until signed. The FK is added in the `documents` migration — see [`05 § 7.2`](./05-database-schema.md#72-contract_parties). |
| `signed_at` | |

KYC evidence is not a column here. `profiles.kyc_status` holds the payer's identity verification,
`owners.kyc_status` the vendor's, and a `documents` row of kind `id_verification` holds the file; a party
points at none of them directly, because one document can evidence several parties and a person's KYC
outlives any single contract.

Co-ownership shares live in [`sale_allocations`](./05-database-schema.md#66-sale_allocations), not on the
party row, because the split that matters is the split of the price, and two landlords on a lease have no
percentage of anything.

## 4. The billing schedule

`contract_schedule` is generated when a contract reaches `in_review` and is the authoritative statement of
what is owed, when, and to whom. It is never hand-edited by a tenant, and staff edit it only through
`PATCH /v1/contracts/{id}/schedule`, which revalidates and re-checks the total.

### 4.1 Rows

| Column | Meaning |
|---|---|
| `seq` | 1-based ordinal. `unique (contract_id, seq)`. |
| `kind` | `schedule_kind`: `rent`, `service_charge`, `installment`, `deposit`, `agreement_fee`, `penalty`, `balance_clearance` |
| `label` | Human description, e.g. "Rent, Jan 2027" |
| `due_date` | `date` |
| `amount_kobo` | `check (amount_kobo > 0)`. Always positive. There is no negative schedule line: a credit is a refund, not a bill. |
| `paid_kobo` | Partial payment so far. `check (paid_kobo <= amount_kobo)` — I9. |
| `status` | `pending`, `partial`, `paid`, `overdue`, `waived` |
| `payment_intent_id` | The intent this line was paid against, when one exists |
| `waived_by`, `waiver_reason` | Reason required when `waived` |

Whether a line pays the landlord or Courtland is **derived from `kind`, not stored**. It is the single most
repeated question about the schedule, and a column answering it would have to be kept in step with `kind`:

| `kind` | Allocation `basis` on payment | `is_payable` |
|---|---|---|
| `rent` | `rent_principal` | true |
| `installment` | `sale_principal` | true |
| `service_charge` | `service_charge_principal` | true |
| `deposit` | `deposit_holding` | false until closing |
| `agreement_fee` | `agreement_fee_holding` | false |
| `penalty` | `rent_principal`, reduced | true |
| `balance_clearance` | `rent_principal`, reduced | true |

Two lines of the same kind can pay different beneficiaries — a service charge is sometimes the landlord's
and sometimes Courtland's — so the mapping above is the default and `private.compute_allocations` takes the
contract's own fee terms as input. What is enforced is that every line maps to *something*: a schedule kind
with no mapping is a pgTAP failure, so a new kind cannot ship without deciding who gets paid.

### 4.2 Generation

```ts
// apps/api/src/modules/contracts/billing/generateSchedule.ts
export function generateSchedule(input: GenerateScheduleInput): ScheduleRow[] {
  switch (input.contract.kind) {
    case 'lease':
      return generateLeaseSchedule(input)
    case 'sale':
      return generateSaleSchedule(input)
  }
}

function generateLeaseSchedule(input: GenerateScheduleInput): ScheduleRow[] {
  const rows: ScheduleRow[] = []
  let seq = 0

  if (input.securityDepositKobo > 0) {
    rows.push({
      seq: ++seq, kind: 'deposit', label: 'Security deposit',
      dueDate: input.startDate, amountKobo: input.securityDepositKobo,
      flow: 'payer_to_landlord', status: 'scheduled',
    })
  }

  if (input.serviceChargeKobo > 0) {
    rows.push({
      seq: ++seq, kind: 'service_charge', label: 'Service charge',
      dueDate: input.startDate, amountKobo: input.serviceChargeKobo,
      flow: 'payer_to_platform', allocation: 'service_fee',
      status: 'scheduled',
    })
  }

  // Rent rows, one per period, from start_date for the full term.
  const periods = buildPeriods({
    startDate: input.startDate,
    months: input.termMonths,
    period: input.rentPeriod,      // 'monthly' | 'annual'
    dueDay: input.rentDueDay,      // 1–28
  })

  for (const period of periods) {
    rows.push({
      seq: ++seq, kind: 'rent', label: `Rent, ${formatPeriod(period)}`,
      dueDate: period.dueDate, amountKobo: period.amountKobo,
      flow: 'payer_to_landlord', status: 'scheduled',
    })
  }

  return rows
}
```

### 4.3 Annual rent, monthly collection

A lease may state an annual rent of ₦4,500,000 while the tenant pays monthly. The schedule stores the
annual amount and derives the monthly figure, so the total can never drift.

```ts
function splitAnnualRent(annualKobo: bigint, months: number): bigint[] {
  const base = annualKobo / BigInt(months)
  const remainder = annualKobo % BigInt(months)
  // The first `remainder` instalments absorb the odd kobo, so the sum is exactly `annualKobo`.
  return Array.from({ length: months }, (_, i) => base + (BigInt(i) < remainder ? 1n : 0n))
}
```

With `annualKobo = 45000000n` and `months = 12`, each instalment is `3750000n` and the sum is exactly
`45000000n`. A floating-point division here would produce ₦4,499,999.99.99 and a customer who notices.

`annualKobo % 12n` is the general case: rent that is not divisible by 12, such as ₦5,000,000 for a year,
splits into twelve instalments of `416666n` kobo plus remainder distribution. The first six instalments
are `416667n` and the rest `416666n`. Rent of `5250000n` per year divides evenly, so the check
`sum(instalments) === annualKobo` is asserted in the test suite for a range of amounts.

### 4.4 Sale instalments

| Pattern | Rows generated |
|---|---|
| `outright` | One `installment` row at `closing_date`, 100% of the price |
| `deposit_then_balance` | `deposit` at `start_date`, balance at `closing_date` |
| `monthly_plan` | Deposit, then `installment` rows monthly from `start_date` to `closing_date`, remainder distributed as in §4.3 |
| `milestone` | One row per milestone with a `label`, from `milestones[]` on the contract |

A plan may carry a `late_fee_percent` and a `default_clause`, both stored on the contract and rendered in
the agreement PDF. Enforcement is a documented business decision, not code: a `penalty` schedule row is
only generated when staff set `apply_default_clause = true`, and that flag is audited.

### 4.5 Schedule drift

The schedule is regenerated when, and only when, the contract is still in `in_review`:

| Change | Effect |
|---|---|
| `start_date`, `term_months`, `rent_amount`, `period` | Full regeneration; `paid` rows are preserved by matching on `kind` and `seq` |
| `service_charge` | Regeneration; the previously generated `service_charge` row is replaced |
| `security_deposit` | Regeneration |
| A `label` typo | `PATCH /schedule` single-row edit, allowed, since it does not change money |
| An amount, once any row is `paid` | **Rejected.** A paid schedule is a legal document. Correcting it requires a credit note or a manual adjustment recorded as a new row. |

This is the rule that keeps "the agreement says ₦4.5m and the schedule says ₦4.5m" true forever.

## 5. Invoicing

An invoice is a view over the schedule, not a separate entity. This is deliberate: two sources of truth for
"what is owed" is how rent systems start disagreeing with themselves.

```
GET /v1/contracts/{id}/schedule?as=invoice&through=2026-12-31
→ {
    "data": {
      "contractReference": "CL-2026-000412",
      "issuedAt": "2026-08-30T00:00:00Z",
      "currency": "NGN",
      "lines": [
        { "seq": 1, "kind": "deposit", "label": "Security deposit",
          "dueDate": "2026-09-01", "amountKobo": 9000000, "status": "paid" },
        { "seq": 3, "kind": "rent", "label": "Rent, Oct 2026",
          "dueDate": "2026-10-01", "amountKobo": 3750000, "status": "overdue" }
      ],
      "totals": {
        "billedKobo": 15000000,
        "paidKobo": 9000000,
        "outstandingKobo": 6000000,
        "overdueKobo": 3750000
      }
    }
  }
```

The invoice PDF is generated from the same query. A receipt is generated from a `payments_ledger` row plus
its allocations, so a receipt can never disagree with the ledger.

### 5.1 Arrears and status derivation

`contract_schedule.status` is stored, and the nightly job maintains it:

| Derived status | Rule |
|---|---|
| `scheduled` | `due_date` in the future, unpaid |
| `due` | `due_date` ≤ today, unpaid |
| `overdue` | `due_date` + `grace_days` < today, unpaid |
| `paid` | Settled, `paid_at` set |
| `waived` | Staff waived it, reason recorded |
| `written_off` | Staff wrote it off after recovery attempts, reason recorded |

`grace_days` comes from the contract's `terms.late_fee_grace_days`, defaulting to 7. The stored status
means the portal does not need a `WHERE due_date < now() - interval` filter on every read, and means a
tenant's portal shows "1 overdue" rather than making them do arithmetic.

## 6. Rent escalation

Nigeria's Rent Control Act 2023 caps annual increases at 10% for the first five years of a tenancy.
Courtland reflects this rather than hiding it.

| Item | Behaviour |
|---|---|
| Uploaded schedule (legacy) | Rent changes per the signed schedule. The cap warning is shown on the contract page but not enforced. |
| Escalation offered in-app | Hard-capped at 10% of the current rent. The offer UI will not accept more, and the API rejects an escalation above the cap with `business_rule_violation` and a detail explaining the Rent Control Act. |
| Notice period | A Nigerian tenant is entitled to written notice, and a fixed-term tenant to 6 months' notice for a landlord's intention not to renew, under state law where the term is longer. Courtland sends the notice via the `notices` system and records delivery. |
| Record keeping | Every notice, delivery attempt and delivery receipt is stored. The Act requires landlords to keep records. Courtland is the landlord's agent here, so the records matter. |

State-specific notice periods vary, so `notices` stores `jurisdiction` with the contract and the template
selects from it. Lagos, Abuja/FCT, Rivers, Ogun, Kano and the remaining states have different treatment;
the template set has one variant per covered state rather than one national default.

## 7. Renewals

| Step | Action | Precondition |
|---:|---|---|
| 1 | `GET /v1/contracts/{id}/renewal-preview?termMonths=12` | `active`, ending within 90 days, no open dispute |
| 2 | Preview returns the new term, the new rent at the capped escalation, a pro-rata credit for unused days, and the net first payment | — |
| 3 | `POST /v1/contracts/{id}/renew` `contract_renew` | A quoted `rentAmountKobo` and `termMonths`, both matching the preview within tolerance |
| 4 | Creates a successor `draft`, copies the parties and links `renewed_from_contract_id` | |
| 5 | Successor follows the normal path: submit → approve → activate | |
| 6 | On successor activation, predecessor becomes `renewed` | |

The old contract is never edited. A 2026 lease and a 2027 lease are separate documents with separate
schedules, which is what an audit expects and what makes a mid-term dispute clean.

## 8. Termination

| Rule | Detail |
|---|---|
| Notice | A fixed-term tenant normally gives 2 months' written notice; a landlord gives 6 months for a fixed term, per the Rent Control Act and state law. Both configurable on the contract's `terms`. |
| Settlement | The API computes a settlement: rent to `termination_date`, outstanding arrears, a refund of the unused deposit, and any deductions for damage agreed in writing. Every line is a `contract_events` row. |
| Damage | Never auto-calculated. An inspector's figure is entered as an explicit, itemised adjustment that the tenant can see and dispute. |
| Refund | A refund is a real refund: `POST /v1/payments/{id}/refund` against the original payment, full or partial. The deposit allocation is unspent, so refunding it is an allocation reversal, not a new debit. |
| Unit | Frees on `terminated`, subject to a 14-day `notice_pending` grace on `units` so the unit cannot be re-let during a handover dispute. |
| Notice to vacate | Generated as a notice with `jurisdiction` from the contract, sent by the chosen channel, with delivery evidence. |

## 9. Disputes

```
open ──acknowledge──▶ under_review ──resolve──▶ resolved
  │                        │
  │                        ──escalate──▶ escalated ──resolve──▶ resolved
  └──withdraw──▶ withdrawn
```

| Field | Meaning |
|---|---|
| `category` | `rent_amount`, `deposit`, `maintenance`, `condition`, `possession`, `harassment`, `other` |
| `amount_disputed_kobo` | The amount at issue, when monetary |
| `description` | The complainant's account, immutable once filed |
| `evidence_document_ids` | Photos, receipts, correspondence |
| `response` | The other party's account |
| `resolution` | Agreed outcome |
| `suspends_payments` | When true, the contract is suspended pending resolution |

A dispute never mutates the ledger. Money moves only through a refund or a documented adjustment, so a
dispute record is a description and the ledger is the truth.

## 10. Data model

| Table | Holds | Written by |
|---|---|---|
| `contracts` | The agreement header, state, key dates, money terms | `contracts` module only |
| `contract_parties` | Who signed, as whom, in what role | `contracts` module |
| `contract_schedule` | What is owed, when | `contracts` module, `billing` service |
| `contract_events` | The immutable state history | Every transition |
| `unit_occupancies` | Who occupies which unit and when | `contracts` module on activation and termination |
| `disputes` | A filed disagreement | `contracts` and `maintenance` modules |

Six tables, one module. No other module writes to them, enforced by a CI grep over `src/modules/*/` for
`from '@courtland/db/schema/contracts'`.

## 11. Related documents

- Schema: [`05-database-schema.md`](./05-database-schema.md)
- Ledger mechanics and allocation: [`10-payments-paystack.md`](./10-payments-paystack.md)
- Job triggers for expiry and reminders: [`11-scheduling-and-jobs.md`](./11-scheduling-and-jobs.md)
- Agreement PDF generation: [`12-documents-and-pdfs.md`](./12-documents-and-pdfs.md)
- Compliance obligations: [`25-nigeria-compliance.md`](./25-nigeria-compliance.md)
