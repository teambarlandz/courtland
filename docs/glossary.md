# Glossary

Terms used across the Courtland documentation. Nigerian usage is preferred where a term differs from
British/Indian usage.

## Property and land

**Agent / landlord / owner** — the legal owner of a property, or the entity Courtland contracts with to
manage or sell it. Courtland's data model calls this an `owner` because "agent" in Nigeria can mean the
marketer selling someone else's land. `owners.owner_type` distinguishes `individual`, `company`, `agent`
and `joint_venture`.

**Face-me-I-face-you** — the Nigerian term for a traditional compound house where every room opens onto a
shared central courtyard with no internal corridor. Mapped to `property_type = 'face_me_i_face_you'`.
Tenants in the same compound share the courtyard, water and security, so maintenance tickets and service
charges often apply at compound level rather than unit level.

**Self-contained (SC)** — a standalone house or apartment with no shared walls. Its own entrance, its own
compound, its own services. The residential middle tier between a face-me-I-face-you and a flat.

**Flat** — a unit in a multi-storey block. Always has an `units` row even for single-occupancy buildings,
so rent, maintenance and tenancy logic never needs to branch on building type.

**Bungalow** — a single-storey detached house. A sale-side residential type.

**Duplex / Mansion / Terrace** — multi-bedroom residential sale types. A duplex is two storeys joined by
an internal staircase; a mansion is a large detached multi-storey house; a terrace is a row house sharing
external walls.

**Land / plot** — a parcel. Tracked in `land_details` with size in square metres or plots, topography,
title type and coordinates. Sold either whole or in allocated plots.

**Plot** — a unit of land within a larger parcel. `sale_allocations.plot_label` records which plot a
buyer bought. A parcel with ten plots and one buyer selling the whole parcel has one allocation row with
`plot_label = 'Entire parcel'`.

**C of O** — Certificate of Occupancy. The strongest title document in Nigeria, granted by the state
government. `title_type = 'c_of_o'`.

**Right of Occupancy** — statutory occupancy granted over government and community lands. Weaker than a
C of O. `title_type = 'right_of_occupancy'`.

**Excision** — the process of converting a government allocation into a C of O. In progress: the land has
an allocation but not yet a certificate. `title_type = 'excision_in_progress'`.

**Gazette** — the official publication of a notice of excision or revocation. Evidence that the excision
process has been published. `title_type = 'gazette_notice'`.

**Deed of Assignment** — the document transferring a sub-lease or a letter of allocation from one party to
another. Common in off-plan and estate sales. This is the primary title document released to a buyer on
completion in many of Courtland's sales.

**Survey Plan** — the drawn plan of a parcel, showing boundaries, beacons and dimensions. Required for
any land transaction. Released to the buyer as part of the title pack.

**Domicile / registration** — the origin and registration status of a title. Captured on the owner's
KYC record, not the property.

## Tenancy and occupancy

**Lease** — a tenancy contract. `contracts.kind = 'lease'`. Covers rent, service charge, deposit, term
and parties.

**Contract of sale** — a purchase contract. `contracts.kind = 'sale'`. Covers total price, payment plan
and the condition for title release.

**Offer letter** — a non-binding expression of intent to buy, issued by Courtland to a buyer. Becomes a
contract of sale on acceptance and payment of the deposit.

**Contract holder** — the person named on the `contracts` row. Holds the legal right.

**Occupant** — the person physically living in a unit. Usually the contract holder, sometimes not: a
tenant's spouse, an adult child, or a sublet. Courtland tracks occupancy separately from contract
parties so that "who holds the lease versus who lives here" is answerable. This is a compliance
requirement, not a nicety.

**Co-tenant** — a named party on a lease alongside the primary tenant, jointly liable.

**Guarantor** — a named party who guarantees rent. Common in Nigerian tenancies, frequently a family
member or an employer.

**Security deposit** — held by Courtland at lease start. Allocated to a `reserve` beneficiary, never
paid out as rent. Refundable subject to deductions.

**Service charge** — a recurring charge covering compound services: security, waste, water, common-area
power, generator fuel. Billed alongside rent, split to the owner the same way.

**Rent cadence** — how often rent falls due. `contracts.rent_cadence_months`: 1 for monthly, 3 for
quarterly, 12 for annual. An annual lease still generates twelve monthly ledger entries internally if
paid monthly, but the contract's due structure follows the cadence.

**Arrears** — rent or service charge due and unpaid past its `due_date`. Computed from
`contracts.outstanding_kobo`, never stored separately.

**Notice** — a formal communication. `notices` rows. Kinds include `rent_reminder`, `arrears_notice`,
`quit_notice`, `renewal_offer`. A quit notice is the statutory precursor to eviction; serving one starts
`units.status = 'notice_served'`.

**Quit notice** — the notice requiring a tenant to vacate. Served by Courtland on the owner's
instruction. Sets a deadline and records it in `contract_events`.

**Eviction** — the physical removal following an unheeded quit notice. Courtland records the outcome;
it does not perform or file it. `units.status = 'evicted'`, `contracts.status = 'terminated'`.

**Notice to quit** — see quit notice. Same thing; the docs use "quit notice" consistently.

## Money

**Kobo** — one hundredth of a naira. `1 NGN = 100 kobo`. All Courtland money columns are
`bigint` named `*_kobo`. Integer arithmetic only.

**Naira (NGN)** — the Nigerian currency, code `NGN`. The only currency Courtland supports. `currency`
columns are `text` constrained to `'NGN'` for forward compatibility, not because multi-currency is
planned.

**Outright** — a single payment for the whole price. `payment_plan = 'outright'`.

**Installment** — a scheduled partial payment. `payment_plan = 'installment'`, materialised as
`contract_schedule` rows.

**Payment intent** — an instruction to pay a specific amount for a specific purpose.
`payment_intents`. Created before a payment, resolved to `succeeded` or `failed` by a verified webhook.
The word "intent" is used in the Paystack sense: it is the thing the user is about to pay.

**Ledger** — the immutable record of money that actually moved. `payments_ledger`. Rows are never
updated except for a `status` transition to `refunded` or `reversed`, which is itself an auditable event
recorded in `audit_log`.

**Allocation** — a split of one ledger entry between beneficiaries. `ledger_allocations`. A ₦100,000 rent
payment with a 10% management fee produces two allocation rows: ₦10,000 to the platform, ₦90,000 to the
owner.

**Beneficiary** — who receives an allocation. `owner`, `platform`, `contractor`, `reserve`.

**Paystack split** — the Paystack-side mechanism that routes a collected payment to a subaccount. Set at
initialisation time. Courtland records the split configuration on `payment_intents.split_snapshot` so a
dispute months later can be reconstructed from the ledger alone.

**Subaccount** — a Paystack bank account registered against the platform's main account for a specific
owner. `paystack_accounts`. Receives the owner's share automatically at settlement.

**Management fee** — the percentage Courtland deducts from gross rent before paying the owner.
`owners.management_fee_bps` in basis points (1000 = 10%). Applied at payment time, recorded as a
`management_fee` allocation.

**Maintenance deduction** — an approved repair cost deducted from the owner's payout.
`allocation_basis = 'maintenance_deduction'`. Requires an approved `maintenance_tickets.quoted_amount`
with `approved_by` set.

**Payout** — money actually transferred to an owner. `payouts`. Accrues from settled allocations,
groups by owner and period, subtracts deductions, then is approved and initiated.

**Accrual** — the accumulation of payable balance for an owner during a period. Computed by
`payouts.accrual.close`, stored on `payouts` as the run's basis. The run itself is a draft until
approved.

**Paystack fee** — the processor's charge, taken from the collected amount. Read from the verify
response, stored on `payments_ledger.paystack_fee_kobo`. Never hard-coded.

**Bearer** — who pays the Paystack transaction fee on a split. `bearer = 'account'` (the platform) or
`'subaccount'` (the owner). Platform-default is `account`.

**Reserve** — held funds that are not payable. Security deposits, agreement fees. `beneficiary =
'reserve'`.

**Refund** — money returned to a payer. `refunds`. Partially or fully reverses a ledger entry and its
allocations.

**Reference** — a human-facing identifier such as `PMT-000482`. Distinct from the `uuid` primary key.
Sequenced per table so staff can quote it over the phone.

**Arrears days** — days past `due_date`. Computed, never stored.

## Platform

**RLS** — Row Level Security. Postgres policies that restrict which rows a session can see. Courtland's
authorisation floor; the API layer is the second layer above it.

**RLS-scoped connection** — a Postgres connection where `request.jwt.claim.sub` and `role` are set to
the calling user's values, inside a transaction. Policies then evaluate as if the user connected
directly.

**Privileged connection** — a connection using `service_role`, which has `BYPASSRLS`. Used only by
background jobs and webhook processing. Never used to serve a request that carries a user identity.

**Supabase Auth / GoTrue** — Supabase's identity service. Issues and refreshes JWTs.

**OTP** — one-time password. Courtland's primary sign-in method. Six digits, sent by SMS or WhatsApp.
Supabase's native provider with a Send SMS hook.

**E.164** — the international phone number format. `+2348012345678`. Courtland stores phone numbers
only in E.164, always `+234`.

**Phone OTP** — sign-in by SMS code. No password.

**Magic link** — sign-in by emailed link. The secondary method, used by staff and by users who prefer
email.

**Send SMS hook** — a Supabase Auth hook that replaces Supabase's own SMS sending, letting Courtland
choose the Nigerian SMS provider and message template. Configured under Supabase Auth.

**Custom access token hook** — a Supabase Auth hook that injects claims (the user's roles) into the JWT
at issue time. Courtland uses it so RLS can read roles from the token instead of a table lookup.

**app_metadata** — the tamper-proof half of Supabase user metadata. Only the service role can write it.
Authorisation MUST read from `app_metadata` or a custom claim, never `user_metadata`, which the user can
edit themselves.

**Outbox** — `outbox_events`. Domain events written in the same transaction as the state change that
caused them, then published to Inngest by a separate job. Guarantees that a state change and its
notification cannot diverge.

**Inngest** — the durable workflow engine. Workflows are ordinary functions with steps; each step's result
is memoised so a retry does not re-run completed steps.

**Webhook event** — a received third-party callback, persisted in `webhook_events` before processing so
delivery can be audited and replayed.

**Idempotency key** — a client-generated UUID sent as `Idempotency-Key`. The API stores the response and
replays it on a repeat, so a double-tap or a network retry cannot create two payments.

**problem+json** — RFC 9457, the error format the API returns. Has a stable machine-readable `code`
alongside the human-readable `detail`.

**Request ID** — a UUID attached to every request, propagated through logs, Sentry and the client, and
returned in the `x-request-id` response header.

**Cache Components** — the Next.js 16 caching model. Opt-in. `use cache` with tags for content, no caching
for anything involving money.

**Tag-based revalidation** — invalidating a Next.js cache entry by tag. A published listing calls
`revalidateTag('properties', 'hours')`.

**Refine** — the React meta-framework powering `apps/admin`. Provides data providers, auth providers,
access control and routing for CRUD-heavy apps.

**Resource** — a Refine term: a named entity with list/create/edit/show routes. Courtland's resource
registry drives both routing and sidebar navigation.

**dataProvider** — the Refine interface that maps resource operations to HTTP calls.
`@refinedev/react-router` is the router; `@refinedev/react-hook-form` is the form integration.

**Knip** — the dead-code detector. Fails CI on unused files, exports and dependencies.

**Biome** — the combined linter and formatter. Replaces ESLint and Prettier.

**Turborepo** — the task orchestrator and build cache for the monorepo.

**pnpm catalog** — `pnpm-workspace.yaml` version pinning, so a dependency is declared once and resolved
identically everywhere.

## Business

**Courtland** — the platform. Named for its role as the court of record for the property relationship:
it holds the agreement, the money trail and the document chain.

**Back office** — `apps/admin`. The staff-facing application.

**Portal** — one of the three authenticated areas in `apps/web`: tenant, buyer or owner.

**Vendor** — an owner selling through Courtland. Distinguished from a landlord only by intent, not by
data model: both are `owners`.

**Payout run** — the periodic job that turns settled allocations into payout records for approval.

**Title release** — the act of releasing a deed, survey plan or certificate to a buyer. Gated on full
payment **and** staff approval. Two conditions, both required.

**Title pack** — the set of documents released on completion: deed of assignment or C of O, survey plan,
receipt, allocation letter.

**Notice period** — the window between serving a quit notice and the eviction date. Recorded on the
notice row.

**Deduction** — any amount withheld from an owner's payable balance: management fee, maintenance cost,
arrears carry-over.

**Carry-over** — an owner's prior-period negative balance deducted from a later payout.

## Related documents

- Entity and state machine definitions: [`04-domain-model.md`](./04-domain-model.md)
- Nigerian statutory context: [`25-nigeria-compliance.md`](./25-nigeria-compliance.md)
