# 04 — Domain Model

This document defines the entities, their relationships and their state machines. It is the reference
implementation of the product's rules. The database enforces what it can; the service layer enforces the
rest; the frontend reflects it. If any of the three disagree, this document is the tiebreaker and the
code is wrong.

## 1. Entity relationship overview

```
                       ┌──────────────┐
                       │ auth.users   │  (Supabase managed)
                       └──────┬───────┘
                              │ 1:1
              ┌───────────────┼───────────────┐
              ▼               ▼               │
      ┌──────────────┐  ┌─────────────┐        │ 1:n
      │   profiles   │  │ user_roles  │◀───────┘
      └──────┬───────┘  └──────┬──────┘
             │                 │
             │ 0:n             │ 1:n
             ▼                 ▼
      ┌──────────────┐  ┌──────────────┐
      │   owners     │  │role_         │
      │              │  │ permissions  │
      └──┬────────┬──┘  └──────────────┘
         │        │ 1:n
         │ 1:n    ▼
         │  ┌──────────────┐
         │  │paystack_     │
         │  │ accounts     │
         │  └──────────────┘
         │
         │ 1:n
         ▼
  ┌──────────────┐   1:n   ┌──────────────────┐
  │  properties  │────────▶│ property_media   │
  └──────┬───────┘         └──────────────────┘
         │ 0:1
         ├──────────────▶ ┌──────────────┐
         │                │ land_details │
         │                └──────────────┘
         │ 0:n
         ▼
  ┌──────────────┐   n:1   ┌──────────────┐
  │    units     │────────▶│  contracts   │
  └──────────────┘         └──────┬───────┘
         ▲                        │
         │                        │ 1:n
    ┌────┴──────┐                 ├─────────────────────┐
    │  unit_    │                 │                     │
    │occupancies│                 │ 1:n                  │ 1:n
    └───────────┘                 ▼                     ▼
                          ┌──────────────┐     ┌──────────────────┐
                          │contract_     │     │contract_schedule │
                          │ parties      │     └──────────────────┘
                          └──────────────┘
                                 │ 1:n
                                 ▼
                          ┌──────────────┐
                          │contract_     │
                          │ events       │  (append-only audit)
                          └──────────────┘
                                 │
                                 │ 1:n
                                 ▼
                          ┌──────────────┐  1:n   ┌──────────────┐
                          │payment_      │────────▶│payments_     │
                          │ intents      │         │ ledger       │
                          └──────────────┘         └──────┬───────┘
                                                         │ 1:n
                                                         ▼
                                                  ┌──────────────┐
                                                  │ledger_       │
                                                  │ allocations  │
                                                  └──────────────┘

  Side aggregates, all referencing the above:
    sale_allocations ──▶ properties (plots)
    maintenance_tickets ─▶ units / properties, raised_by users
    ticket_updates ──▶ maintenance_tickets
    notices ──▶ contracts / units (a dispatch queue, one row per send)
    disputes ──▶ contracts / properties / units
    documents ──▶ contracts / properties / users (polymorphic via nullable FKs + kind)
    document_access_log ──▶ documents
    payouts ──▶ owners
    refunds ──▶ payments_ledger
    webhook_events, idempotency_keys, outbox_events, audit_log (platform, no FK)
```

## 2. Aggregate boundaries

An aggregate is a consistency boundary: everything inside it changes in one transaction. There are six.

| Aggregate | Root | Transaction boundary | Why |
|---|---|---|---|
| **Property** | `properties` | Property row + media + land details + units, together | A published property must always have at least one photo and, if land, a `land_details` row. |
| **Contract** | `contracts` | Contract + parties + schedule + status events | A lease cannot be active without parties and a schedule. A sale cannot complete without its schedule fully settled. |
| **Payment** | `payment_intents` | Intent + ledger entry + allocations + receipt document | Money must not be half-recorded. |
| **Payout** | `payouts` | Payout + its allocation set + transfer result | A payout is either fully approved and transferred or not at all. |
| **Ticket** | `maintenance_tickets` | Ticket + updates + cost approval + payout deduction | An approved maintenance cost must be reflected in exactly one owner's pending deduction. |
| **Document** | `documents` | Document + version + release record | A superseded document must never be the released one. |

**Cross-aggregate consistency is achieved with the outbox, not with foreign keys.** A payment succeeds and
the contract's `outstanding_kobo` drops — that is *within* the payment aggregate plus a single denormalised
field on the contract, updated in the same transaction. But emailing the receipt is a *side effect*, and it
goes through `outbox_events`. Never call Resend inside a transaction that holds a row lock.

## 3. Core entities

### 3.1 `profiles`

The application-side mirror of `auth.users`. Created by a trigger on `auth.users` insert.

| Field | Type | Notes |
|---|---|---|
| `id` | uuid PK | FK to `auth.users.id` |
| `full_name` | text | Required after first OTP verification |
| `email` | text | Optional. May be null for phone-only accounts. |
| `phone_e164` | text unique | Normalised `+234...`. |
| `avatar_public_id` | text | Cloudinary public id |
| `onboarding_state` | enum | `phone_only`, `verified`, `profile_complete`, `role_selected`, `complete` |
| `last_seen_at` | timestamptz | |

Never store a password. Supabase GoTrue owns credentials.

### 3.2 `owners`

The legal counterparty to Courtland for an asset. One owner can hold many properties.

| Field | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid FK nullable | The portal login. Null while an application is pending and for owners managed entirely by staff. |
| `owner_type` | enum | `individual`, `company`, `agent`, `joint_venture` |
| `legal_name` | text | As it appears on the title. Not editable once a contract is active. |
| `business_name` | text nullable | |
| `email`, `phone_e164` | | |
| `address` | text | |
| `rc_number` | text nullable | CAC registration number. Required for `company`. |
| `kyc_status` | enum | `not_started`, `pending`, `verified`, `rejected` |
| `kyc_notes` | text nullable | Staff notes |
| `management_fee_bps` | int | Basis points. Default from config, overridable per owner. 1000 = 10%. |
| `commission_bps` | int | Basis points, used for **sales** only. 500 = 5%. |
| `is_active` | boolean | False stops new listings. Existing contracts continue. |

An owner cannot receive a payout unless `kyc_status = 'verified'` **and** a `paystack_accounts` row exists
with `is_active = true`.

### 3.3 `properties`

The core asset. See [`05-database-schema.md`](./05-database-schema.md) for the full column list.

Identity rules:

- `slug` is unique, lowercase, generated from `title` on first save, deduplicated with a numeric suffix.
- `reference` is `CLT-000001`, from the `property_reference_seq` sequence.
- `listing_type` is immutable once a contract exists against the property. Changing a property from rent to
  sale mid-stream would invalidate the entire ledger. Enforced by trigger.

**Status machine**

```
        draft ──submit──▶ in_review ──publish──▶ published ──let agreed──▶ let_agreed
          ▲                   │                      │      ──under offer──▶ under_offer
          │                   │reject                │      ──withdraw───▶ withdrawn
          │                   ▼                      │                        │
          └───────────────  draft                    └──────archive───────────┘
                                                    │
                                                    ▼ (sale only)
                                                  sold  →  archived
```

| From | To | Who | Effect |
|---|---|---|---|
| `draft` | `in_review` | owner or admin | Locks field edits except media. |
| `in_review` | `draft` | admin (reject) | Requires a reason, recorded in `audit_log`. |
| `in_review` | `published` | admin | Requires ≥1 photo, a price, and `land_details` if `property_type = 'land'`. Sets `published_at`. Invalidates the public cache. |
| `published` | `let_agreed` | admin | An active lease exists. |
| `published` | `under_offer` | admin | A sale contract exists but no deposit yet. |
| `published` | `withdrawn` | owner or admin | Removes from public listing. |
| `let_agreed` | `published` | admin | Lease terminated, unit vacant again. |
| `under_offer` | `published` | admin | Buyer fell through. |
| `sold` | `archived` | system | After 90 days post-completion. |
| any | `archived` | admin | Soft archive. Never hard-deleted if a contract references it. |

### 3.4 `units`

Child of a rental property. Every rental property has at least one unit, even a self-contained house that
is one single occupancy. This is deliberate: it means occupancy, maintenance and billing code never
branches on building type.

| Field | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `property_id` | uuid FK | |
| `code` | text | Human label: "Flat 2B", "Room 4", "Shop 1". Unique per property. |
| `floor` | int nullable | |
| `bedrooms`, `bathrooms`, `toilets` | int nullable | |
| `size_sqm` | numeric nullable | |
| `asking_rent_kobo` | bigint | The listed rent. The actual rent lives on the contract. |
| `service_charge_kobo` | bigint | Default compound charge. |
| `status` | enum | `vacant`, `occupied`, `notice_served`, `evicted`, `under_maintenance` |
| `current_contract_id` | uuid FK nullable | Denormalised for fast lookup. Must agree with `contracts.status = 'active'`. |

**Unit status machine**

```
  vacant ──lease signed──▶ occupied ──quit notice served──▶ notice_served
    ▲                        ▲                                   │
    │                        │◀────── tenant vacates ────────────┤
    │                        │                                    │ deadline passes
    │                   eviction                              ▼
    └────────────────────────────── evicts ───────────────▶ evicted ──re-lets──▶ occupied
```

`under_maintenance` is orthogonal in practice but modelled as a status because a unit cannot be let while
structurally unsound. `under_maintenance` → `vacant` when work completes.

The invariant `units.status = 'occupied' ⟺ units.current_contract_id points at a contract with
status = 'active'` is enforced by a trigger and asserted in pgTAP.

### 3.5 `contracts`

The polymorphic root of the legal relationship. One table, two shapes, discriminated by `kind`.

**Shared fields**

| Field | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `reference` | text | `LSE-000001` for leases, `SAL-000001` for sales. Two sequences. |
| `kind` | enum | `lease`, `sale`. Immutable. |
| `property_id` | uuid FK | |
| `unit_id` | uuid FK nullable | Required for `lease`, forbidden for `sale`. |
| `owner_id` | uuid FK | |
| `primary_payer_id` | uuid FK | The tenant or buyer. Must appear in `contract_parties`. |
| `status` | enum | See below. |
| `start_date`, `end_date` | date | `end_date` nullable for open-ended tenancies. |
| `outstanding_kobo` | bigint | Running balance. Maintained transactionally. |
| `total_kobo` | bigint | Lease: total rent over the term. Sale: purchase price. |
| `currency` | text | Constrained to `NGN`. |
| `notes` | text | |

**Lease-only fields**

| Field | Type | Notes |
|---|---|---|
| `rent_kobo` | bigint | Per `rent_cadence_months`. |
| `rent_cadence_months` | int | 1, 3, 6 or 12. Check-constrained. |
| `service_charge_kobo` | bigint | Per cadence. May be 0. |
| `security_deposit_kobo` | bigint | Held, not payable. |
| `agreement_fee_kobo` | bigint | One-off, held in reserve. |
| `late_fee_policy` | enum | `none`, `flat`, `percent`. |
| `late_fee_value` | bigint | Kobo for `flat`; basis points for `percent`. |
| `grace_days` | int | Days past due before `arrears_notice`. Default 3. |

**Sale-only fields**

| Field | Type | Notes |
|---|---|---|
| `payment_plan` | enum | `outright`, `installment`. |
| `installment_count` | int nullable | 1 when outright. |
| `installment_amount_kobo` | bigint nullable | |
| `installment_day_of_month` | int nullable | 1–28. Never 29–31: months vary in length. |
| `deposit_paid_kobo` | bigint | Moves into `total_kobo` accounting on completion. |
| `title_release_status` | enum | `not_eligible`, `eligible`, `approved`, `released`. |
| `allocation_id` | uuid FK nullable | The `sale_allocations` row this sale corresponds to. |

**Contract status machine**

Nine states. The full transition table with preconditions and side effects is in
[`09-contracts-and-billing.md § 2.1`](./09-contracts-and-billing.md#21-transition-rules); the decision to
model it explicitly in three layers is recorded in [ADR 0020](./adr/0020-contract-state-machine.md). This is
the shape:

```
 draft ──submit──▶ in_review ──approve──▶ approved ──activate──▶ active
   │                    │                      │                     │
   │                    └──reject──▶ rejected  │         ┌───────────┼───────────┐
   │                                           │         ▼           ▼           ▼
   └──delete                              (signature) suspended  terminated   expired
                                                     │                            │
                                                     └──resume──▶ active          │
                                                                    active ──renew──▶ renewed
```

| From | To | Trigger | Notes |
|---|---|---|---|
| `draft` | `in_review` | admin, owner | Parties attached, dates set, schedule generated. |
| `in_review` | `approved` | admin | Parties verified, KYC and payout account checked. Generates the agreement PDF and opens the signature window. |
| `in_review` | `rejected` | admin | Reason required. Terminal. |
| `approved` | `active` | admin | First schedule item paid or waived. Sets `units.current_contract_id` and `units.status = 'occupied'` for leases. Sets `properties.status` for sales. |
| `active` | `suspended` | admin, nightly job | Arrears exceed a configured threshold, or a dispute is escalated. Rent obligations continue to accrue. |
| `suspended` | `active` | admin, nightly job | Arrears cleared, or a payment arrangement is recorded. |
| `active` | `terminated` | admin | Manual. Notice served, settlement recorded. Not reversible. |
| `active` | `expired` | nightly job | `end_date` passed. |
| `active` | `renewed` | job | Successor contract reached `active`. Links the successor. Terminal on the old row. |

A terminated or expired contract is immutable except for its terminal timestamps and reason. Ledger entries
survive. Documents survive.

### 3.6 `contract_parties`

Who is legally bound. Separate from occupancy, deliberately.

| Field | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `contract_id` | uuid FK | |
| `user_id` | uuid FK nullable | Null for parties with no portal account (a witness, a paper guarantor). |
| `party_name` | text | Always present. The legal name even if `user_id` is null. |
| `party_role` | enum | `landlord`, `co_landlord`, `owner_representative`, `tenant`, `co_tenant`, `subtenant`, `seller`, `buyer`, `co_buyer`, `guarantor`, `witness`, `solicitor` |
| `nationality` | text nullable | |
| `is_primary` | boolean | Exactly one primary per contract. |
| `signed_at` | timestamptz nullable | |
| `signature_document_id` | uuid FK nullable | |

Unique on `(contract_id, party_role, party_name)` to prevent duplicate parties.

### 3.7 `unit_occupancies`

The answer to "who actually lives here".

| Field | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `unit_id` | uuid FK | |
| `contract_id` | uuid FK nullable | Null when a squatter or a departing tenant has no contract. |
| `person_name` | text | |
| `user_id` | uuid FK nullable | |
| `relationship` | enum | `primary`, `spouse`, `child`, `dependent`, `guest`, `subtenant`, `unrelated` |
| `moved_in` | date | |
| `moved_out` | date nullable | Null means current. There is no `is_current` column: the absence of a move-out is the fact, so the two cannot disagree. |

This table is what makes the brief's "verify who holds the legal tenancy versus who is occupying the
space" a query rather than an investigation. A unit where occupants are not covered by the active
contract's parties is flagged in the admin unit view and appears in the `/admin/clients` "unaccounted
occupant" saved filter.

### 3.8 `contract_schedule`

The billing plan, materialised. Both leases and sales.

| Field | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `contract_id` | uuid FK | |
| `seq` | int | 1-based, unique per contract. |
| `kind` | enum | `rent`, `service_charge`, `installment`, `deposit`, `agreement_fee`, `penalty`, `balance_clearance` |
| `due_date` | date | |
| `amount_kobo` | bigint | |
| `paid_kobo` | bigint | Running. Maintained by the payment workflow. |
| `status` | enum | `pending`, `partial`, `paid`, `waived`, `overdue` |
| `paid_at` | timestamptz nullable | |
| `payment_intent_id` | uuid FK nullable | The intent generated for this line. |

`status = 'overdue'` is set by the nightly job for `pending` lines with `due_date < today` and no
payment. It is derived state, refreshed daily; `status` is never trusted for balance maths, `paid_kobo` is.

**Generation rules**

| Contract | Rule |
|---|---|
| Lease, monthly, 12-month term | 12 rows, `due_date` on the `day_of_month` derived from `start_date`, alternating `rent` and `service_charge` rows on the same date. |
| Lease, quarterly | 4 rows of `rent` + `service_charge` combined per quarter. |
| Lease, annual | 1 row of `rent` + `service_charge` for the full term. |
| Lease, deposit | 1 `deposit` row due on `start_date`. |
| Sale, outright | 1 row `balance_clearance` for the full price, plus a `deposit` row. |
| Sale, installment, 6 months | 1 `deposit` row, then 6 `installment` rows on `installment_day_of_month`. |
| Any | Late fees append a `penalty` row when applied. Never mutate an existing row. |

### 3.9 `payment_intents` and `payments_ledger`

See §4 of this document and [`10-payments-paystack.md`](./10-payments-paystack.md). Summary:

- An **intent** is a request to pay. Created by the API, resolved by a verified webhook. Mutable status.
- A **ledger entry** is proof that money moved. Inserted once. Status only ever transitions to `refunded`
  or `reversed`.

### 3.10 `ledger_allocations`

How one ledger entry is divided.

| Field | Type | Notes |
|---|---|---|
| `payment_id` | uuid FK | The ledger entry. |
| `beneficiary_type` | enum | `owner`, `platform`, `contractor`, `reserve` |
| `owner_id` | uuid FK nullable | Required when `beneficiary_type = 'owner'`. |
| `basis` | enum | `rent_principal`, `service_charge_principal`, `management_fee`, `maintenance_deduction`, `sale_principal`, `sale_commission`, `deposit_holding`, `agreement_fee_holding` |
| `amount_kobo` | bigint | |
| `status` | enum | `pending`, `settled`, `reversed` |
| `is_payable` | boolean | False for `reserve`. The flag that keeps deposits out of payouts. |
| `paystack_subaccount_code` | text | Snapshot. Which subaccount this routed to. |
| `settled_at` | timestamptz | |

**Invariant, asserted in pgTAP:** for every `payments_ledger` row with `status = 'succeeded'`, the sum of
its allocations equals `amount_kobo` minus `paystack_fee_kobo`. This is the single most important check in
the system. It is also enforced at write time inside a trigger so a bug can never commit.

### 3.11 `payouts`

| Field | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `reference` | text | `PO-2026-01-0001`. Period plus sequence. |
| `owner_id` | uuid FK | |
| `period_start`, `period_end` | date | |
| `gross_kobo` | bigint | Sum of settled payable allocations in the period. |
| `deductions_kobo` | bigint | Approved maintenance costs plus carry-over. |
| `net_kobo` | bigint | `gross − deductions`. Must be ≥ 0. |
| `carry_forward_kobo` | bigint | Negative balance carried from the previous period. |
| `status` | enum | `draft`, `approved`, `initiating`, `paid`, `failed`, `cancelled` |
| `paystack_transfer_reference` | text | Set on initiation. |
| `initiated_by`, `approved_by` | uuid FK | |
| `failure_reason` | text | |

**Payout state machine**

```
  draft ──approve──▶ approved ──initiate──▶ initiating ──▶ paid
    │                    │                      │
    │                    │                      └────▶ failed ──retry──▶ initiating
    └────cancel──────────┘
```

A payout in `draft` is editable. In `approved` it is frozen except for `cancelled`. In `paid` it is
immutable and every field becomes audit-log material.

### 3.12 `maintenance_tickets`

| Field | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `reference` | text | `TKT-000001` |
| `property_id`, `unit_id` | uuid FK | `unit_id` nullable for compound-level work. |
| `raised_by` | uuid FK | |
| `assigned_to` | uuid FK nullable | Staff or contractor contact. |
| `category` | text | Free-ish list validated by Zod: `plumbing`, `electrical`, `structural`, `appliance`, `pest`, `cleaning`, `security`, `painting`, `landscaping`, `other`. |
| `priority` | enum | `low`, `medium`, `high`, `urgent`. |
| `title`, `description` | text | |
| `status` | enum | `open`, `acknowledged`, `in_progress`, `awaiting_parts`, `awaiting_tenant`, `resolved`, `closed`, `cancelled` |
| `permission_to_enter` | boolean | Tenant's stated position. |
| `quoted_amount_kobo` | bigint nullable | The cost. |
| `cost_approved_by`, `cost_approved_at` | | Staff approval. Required before any payout deduction. |
| `contractor_name` | text nullable | |
| `resolved_at`, `closed_at` | timestamptz | |

```
  open ──acknowledge──▶ acknowledged ──start──▶ in_progress ──▶ resolved ──confirm──▶ closed
    │                                        │  ▲                                      
    └──cancel──▶ cancelled                    └──┘ awaiting_parts / awaiting_tenant  
```

A ticket with `cost_approved_at` set and `status = 'resolved'` produces exactly one
`ledger_allocation(basis = 'maintenance_deduction')` against the owner's next payout. The
`deduction_source_ticket_id` column links back, and a unique index on that column guarantees no ticket is
deducted twice.

### 3.13 `documents`

Polymorphic by design — a document belongs to a contract, a property, a user, or none of those. Exactly one
or more of the three FKs is set, and `kind` constrains which combinations are legal.

| `kind` | Required FK |
|---|---|
| `tenancy_agreement`, `contract_of_sale`, `installment_agreement` | `contract_id` |
| `receipt`, `monthly_statement`, `arrears_notice`, `notice_to_vacate` | `contract_id` |
| `title_release`, `payout_statement`, `payout_advice` | `owner_id`, and `contract_id` when one exists |
| `inspection_report` | `property_id`, and `contract_id` when it came from a lease |
| `kyc_bundle` | `owner_id` |
| `title_deed`, `survey_plan`, `certificate_of_occupancy`, `gazette_notice` | `property_id` |
| `power_of_attorney` | `owner_id` or `property_id` |
| `id_verification` | `owner_user_id` |
| `receipt_evidence` | `contract_id` |
| `other` | any |

Other fields: `visibility` (`private`, `counterparty`, `staff`, `public`), `status`, `version`,
`supersedes_document_id`, `issued_at`, `expires_at`, `released_at`, `storage_public_id`, `filename`,
`mime_type`, `size_bytes`, `checksum_sha256`.

See [`12-documents-and-pdfs.md`](./12-documents-and-pdfs.md) for the full lifecycle and release gates.

### 3.14 `notices`

A dispatch queue, not a log of what happened. One row per intended send.

| Field | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `kind` | enum | See [`13-notifications.md § Notice matrix`](./13-notifications.md#2-the-template-catalogue). |
| `channel` | enum | `email`, `sms`, `whatsapp`, `in_app` |
| `recipient_user_id` | uuid FK | |
| `recipient_address` | text | Email or E.164 phone. Denormalised so a resend works if the profile changed. |
| `template_key` | text | Key into the template registry. |
| `payload` | jsonb | Template variables. |
| `status` | enum | `queued`, `sending`, `sent`, `delivered`, `bounced`, `failed`, `cancelled` |
| `scheduled_for` | timestamptz | The dispatcher only picks up rows where this is in the past. |
| `provider_message_id` | text | Resend or SMS provider id. Used to match delivery webhooks. |
| `sent_at`, `delivered_at`, `failed_at` | timestamptz | |
| `dedupe_key` | text unique | Prevents duplicate sends. See §5. |

### 3.15 `disputes`

| Field | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `reference` | text | `DSP-000001` |
| `contract_id`, `property_id`, `unit_id` | uuid FK nullable | At least one required. |
| `raised_by` | uuid FK | |
| `against_user_id` | uuid FK nullable | |
| `category` | text | `arrears`, `deposit_dispute`, `maintenance`, `eviction`, `title`, `payout`, `misrepresentation`, `other` |
| `description` | text | |
| `status` | enum | `open`, `under_review`, `escalated`, `resolved`, `dismissed` |
| `resolution` | text | |
| `resolved_by`, `resolved_at` | | |

An `escalated` dispute forces its contract to `suspended` and its unit to `under_maintenance`.

## 4. Money

### 4.1 Representation

Every monetary value is a `bigint` counting **kobo**. `₦12,500.50` is `1250050`.

This is non-negotiable and enforced by:

- Column type `bigint`. Never `numeric`, never `float`, never `real`.
- A pgTAP test asserting that no monetary column in any table has type `numeric`, `real` or `double`.
- `packages/utils/src/money.ts` as the only place kobo is formatted or parsed.
- Biome's `noFloatingPromises` plus a lint rule banning arithmetic on `number` in files that import from
  `money.ts`... enforced instead by having `money.ts` export branded types:

```ts
export type Kobo = bigint & { readonly __brand: 'kobo' }
export const kobo = (n: number | bigint): Kobo => BigInt(n) as Kobo
export const addKobo = (a: Kobo, b: Kobo): Kobo => (a + b) as Kobo
export const allocateProRata = (total: Kobo, weights: Kobo[]): Kobo[] => { /* largest-remainder */ }
```

`allocateProRata` uses the **largest-remainder method** so a split never loses or invents a single kobo.
Naive `Math.round(total * weight / sum)` loses kobo on every three-way split and the ledger invariant
fails. This is the most common way a payment system like this loses money.

### 4.2 The ledger invariant

For every `payments_ledger` row:

```
status = 'succeeded'  ⟹  Σ allocations.amount_kobo = amount_kobo − paystack_fee_kobo
                        AND  Σ allocations where is_payable = amount_kobo − paystack_fee_kobo − Σ where is_payable = false
```

Enforced by `assert_ledger_balanced()` trigger. A violation aborts the transaction. There is no flag that
disables it.

### 4.3 Balance semantics

`contracts.outstanding_kobo` is **total contracted minus total settled principal**, where "principal"
excludes platform fees and excludes reserve allocations.

- Lease: `total_kobo` is rent + service charge over the term. Payments reduce it. Late fees reduce it.
  Deposits do not.
- Sale: `total_kobo` is the purchase price. The deposit and each installment reduce it. Platform
  commission does not.
- Refunds increase it.

`contracts.outstanding_kobo` is denormalised for query performance. `contracts.balance_reconciled_at`
records when the nightly job last proved it matches a fresh aggregation over the ledger. If they diverge,
that timestamp goes stale and Sentry is notified. See
[`09-contracts-and-billing.md § Reconciliation`](./10-payments-paystack.md#9-reconciliation).

## 5. Cross-cutting invariants

Every one of these is either a trigger, a unique index, or a pgTAP test. This list is the specification
those implementations are written against.

| # | Invariant | Mechanism |
|---|---|---|
| I1 | `units` exist only on `listing_type = 'rent'` properties | Trigger on `units` insert/update |
| I2 | A property with `property_type = 'land'` has exactly one `land_details` row; all others have none | Trigger on `properties` insert/update + pgTAP |
| I3 | `contracts.unit_id` is required for `kind = 'lease'` and forbidden for `kind = 'sale'` | Check constraint + trigger |
| I4 | `contracts.listing_type` at creation must match its property's | Trigger |
| I5 | At most one contract per `(unit_id, kind = 'lease')` may be in `approved`, `active`, `suspended` or `renewed` at a time | Partial unique index |
| I6 | `units.status = 'occupied'` ⟺ `units.current_contract_id` references a contract with `status = 'active'` | Trigger both ways + pgTAP |
| I7 | `contract_parties` has at most one `is_primary = true` per contract | Partial unique index |
| I8 | `contract_schedule.seq` is unique per contract and contiguous from 1 | Unique index + nightly assertion |
| I9 | `contract_schedule.paid_kobo <= amount_kobo` | Check constraint |
| I10 | Σ allocations = amount − paystack fee, for succeeded ledger rows | Trigger |
| I11 | `payments_ledger` rows are never deleted | No delete policy, no trigger that deletes |
| I12 | A `maintenance_deduction` allocation references exactly one ticket, and each ticket is deducted once | `deduction_source_ticket_id` unique index |
| I13 | `payouts.net_kobo = gross_kobo − deductions_kobo` and `net_kobo >= 0` | Check constraint |
| I14 | A payout in status `paid` cannot be updated | Trigger raising an exception |
| I15 | `contracts.status = 'suspended'` implies `suspension_reason` is set | Check constraint |
| I16 | A `sale` contract with `payment_plan = 'installment'` has `installment_count >= 2` and `installment_day_of_month <= 28` | Check constraint |
| I17 | `properties.status = 'published'` requires `published_at` | Check constraint |
| I18 | `documents.supersedes_document_id` points at a document of the same `kind` | Trigger |
| I19 | `notices.dedupe_key` is unique, preventing duplicate sends | Unique index |
| I20 | `webhook_events (provider, event_id)` is unique | Unique index |
| I21 | `idempotency_keys (scope, key)` is unique | Unique index |
| I22 | `outbox_events` rows are never deleted | No delete policy |
| I23 | `audit_log` rows are never updated or deleted | No update or delete policy; trigger blocks it |
| I24 | Only `owner` allocations with `is_payable = true` enter a payout | Query-level assertion in `payouts.accrual.close` |
| I25 | A landlord's portal user can only read contracts where `primary_payer_id` or a party is them | RLS |
| I26 | Title release requires `outstanding_kobo = 0` **and** `title_release_status = 'approved'` | Trigger on `documents` insert |

## 6. Numbering

Human-facing references. All backed by Postgres sequences so there are no gaps from rolled-back
transactions in a way that would confuse a human reading them.

| Table | Format | Sequence |
|---|---|---|
| `properties` | `CLT-000001` | `property_reference_seq` |
| `contracts` (lease) | `LSE-000001` | `lease_reference_seq` |
| `contracts` (sale) | `SAL-000001` | `sale_reference_seq` |
| `payments_ledger` | `PMT-000001` | `payment_reference_seq` |
| `payouts` | `PO-2026-01-0001` | `payout_reference_seq`, plus period |
| `maintenance_tickets` | `TKT-000001` | `ticket_reference_seq` |
| `documents` | `DOC-000001` | `document_reference_seq` |
| `disputes` | `DSP-000001` | `dispute_reference_seq` |
| `sale_allocations` | `ALC-000001` | `allocation_reference_seq` |

`nextval` is called in a trigger on insert so every code path gets a reference, including direct SQL in
tests. The API never generates these by hand.

## 7. Related documents

- Column-level schema, indexes and RLS: [`05-database-schema.md`](./05-database-schema.md)
- Billing rules in detail: [`09-contracts-and-billing.md`](./09-contracts-and-billing.md)
- Permission matrix for each role: [`07-authorization-and-rls.md`](./07-authorization-and-rls.md)
- How these entities map to API resources: [`08-api-design.md`](./08-api-design.md)
- Phase-by-phase construction of these tables: [`roadmap.md § Phase 1](./roadmap.md#phase-1--data-foundation)
