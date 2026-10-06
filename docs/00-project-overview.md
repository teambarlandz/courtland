# 00 — Project Overview

## 1. What Courtland is

Courtland is a web platform that runs the commercial side of Nigerian property on behalf of the people
who own it. Two businesses sit inside one product:

1. **Property management** — landlords hand Courtland a building. Courtland lists it, finds tenants,
   collects rent, chases arrears, handles repairs, produces receipts, and pays the landlord a monthly
   amount after deducting management fees and approved maintenance costs.
2. **Property and land sales** — vendors hand Courtland a property or a parcel of land. Courtland lists
   it, receives buyers' deposits or installments, tracks the balance to zero, manages the legal document
   chain, and releases the title documents when the buyer has paid in full.

The platform is the counterparty that makes both work. It holds the money briefly, it holds the legal
paperwork, and it is the thing a tenant calls when the tap is broken. That position is the product.

### 1.1 The problem being solved

| Actor | Today's situation | What Courtland changes |
|---|---|---|
| Landlord with a 12-unit block | Rent is collected in cash and a notebook. Collections stop silently. No way to prove arrears. | Every naira is a row in a ledger with a receipt. Arrears surface on day 31. Payouts are automatic. |
| Landlord with 30 units | Cannot tell which units are vacant, who the legal tenant is versus who physically lives there. | Unit-level occupancy plus a contract-holder-versus-occupant split. |
| Tenant | Does not know when rent is due, has no receipt, cannot raise a repair without chasing a landlord's son. | Due date on the dashboard, receipt emailed instantly, ticket with a status. |
| Land buyer | Pays installments into a bank account with no schedule and no trigger for the title documents. | A schedule, a running balance, and title documents released automatically at 100%. |
| Vendor / estate marketer | Loses track of which agent or buyer promised which plot. | Plot allocation tracked per buyer, per property, with a legal document state. |
| Courtland staff | Everything in spreadsheets and WhatsApp. No audit trail, no single view. | One back office with granular permissions, custom filters and a full audit log. |

## 2. Actors and capabilities

The full permission matrix lives in
[`07-authorization-and-rls.md`](./07-authorization-and-rls.md#21-the-matrix). This section is
the human-readable version.

### 2.1 Visitor (unauthenticated)

- Browse published listings, filtered by **for rent** or **for sale**.
- Filter by property type, state, LGA, price band, bedroom count, size and amenities.
- View a property or land detail page: photos, floor area, description, price, title summary.
- Reach the sign-in flow. Nothing else. No data about non-published assets is reachable.

### 2.2 Tenant

Reaches the system through the tenant portal at `/portal/tenant`.

- See the active lease: parties, unit, rent, cadence, deposit, start and end dates, document list.
- See upcoming charges with due dates and arrears.
- Pay rent, service charge, or a penalty. Pay by card or bank transfer.
- Download or receive a receipt for any settled payment, as a PDF.
- Read the tenancy agreement and house rules.
- Raise a maintenance ticket against the unit or compound, attach photos, and follow it to resolution.
- Authorise or refuse entry for repairs.

### 2.3 Buyer

Reaches the system through the buyer portal at `/portal/buyer`.

- See the purchase: total price, amount paid, balance, next installment and its due date.
- See the full installment schedule, past and future.
- Pay an installment or settle outright.
- Read the offer letter and contract of sale.
- Receive receipts.
- Download released title documents — deed of assignment, survey plan, certificate of occupancy —
  **only after** the balance reaches zero and staff approve the release.

### 2.4 Landlord / vendor / property owner

Registers, then reaches the system through the owner portal at `/portal/owner`.

- Register the legal entity (individual, company, agent, joint venture) and submit KYC.
- Attach a payout bank account, which is provisioned as a Paystack subaccount.
- Submit properties and land for listing; they enter `in_review` and are published by staff.
- See an asset overview: for each property and each unit, whether it is vacant, occupied, let-agreed,
  sold, or under maintenance.
- See financials: gross collected, management fees deducted, maintenance deductions itemised, net
  earnings, and pending payouts.
- See the payout history and download payout statements.

### 2.5 Courtland staff (admin)

Reaches the back office at `/admin`.

- Full CRUD on properties, units, land details and owners.
- Move listings through the review and publish workflow.
- Create and manage leases and sale contracts, including adding co-tenants, guarantors and witnesses.
- Verify who holds the legal agreement versus who occupies a unit. These are different people
  (`contract_parties` versus `units.current_contract_id` plus an occupancy record).
- Build and save custom filters over clients: by payment status, lease expiry window, title document
  status, active dispute, state, owner, or any combination.
- Serve notices, including quit notices. Process evictions. Suspend and terminate contracts.
- Approve maintenance costs before they are deducted from a landlord's payout.
- Approve title document release for fully paid sales.
- Trigger payout runs, approve them, and mark them paid.
- Read the audit log and manage staff accounts and roles.

## 3. Capability map

```
                        ┌───────────────────────────────────────┐
                        │            Courtland platform         │
                        │                                       │
  Visitor ──────────────▶│  web (public storefront)              │
                        │                                       │
  Tenant ───────────────▶│  web (tenant portal)  ─┐              │
  Buyer ────────────────▶│  web (buyer portal)    ─┤              │
  Owner ────────────────▶│  web (owner portal)   ─┤──▶ api ──▶ Postgres
                        │                         │      │       (Supabase + RLS)
  Staff ────────────────▶│  admin (Refine SPA)   ─┘      │            │
                        │                               │            │
  Paystack ─────────────▶│              ◀───────────────┘            │
  Resend / SMS  ◀────────│               ▲                          │
  Cloudinary   ◀────────▶│               │                          │
                        └───────────────┴──────────────────────────┘
                                        │
                              Inngest (workflows)
                              Render cron (schedules)
```

## 4. The money flows

Courtland handles three distinct money flows. They share tables and reporting but they are **not**
interchangeable, and the schema enforces that separation.

### 4.1 Rent collection (recurring)

1. A lease is active. The billing engine materialises a `payment_intent` for the period, with `kind =
   'rent'` and a `due_date`.
2. The tenant pays through Paystack. On `charge.success`, the intent becomes `succeeded` and an
   immutable `payments_ledger` row is written.
3. Two `ledger_allocations` rows split the money: the management fee to the platform, the remainder to
   the owner.
4. A receipt PDF is generated, stored as a document, and emailed.
5. The lease's `outstanding_kobo` decreases by the allocated rent principal.
6. A payout for the owner accrues. The monthly payout run groups settled allocations by owner and
   period, subtracts approved maintenance deductions, and produces a `payouts` row for approval.
7. Approved payouts are transferred to the owner's Paystack subaccount.

### 4.2 Sale payment (outright or installment)

1. A sale contract is active with `payment_plan = 'outright'` or `'installment'`.
2. For installment plans, a schedule of `contract_schedule` rows is generated with dates and amounts.
3. Each installment creates a `payment_intent` with `kind = 'installment'`.
4. Payment success reduces `outstanding_kobo`. At zero, the contract becomes `terminated` (the state
   machine has no `completed`; a sale that finishes owing nothing is a `terminated` contract) and an
   automated task offers title release for staff approval.
5. For sales, the allocation split is different from rent: principal to the owner, commission to the
   platform. The commission rate is on the `owners` row, not the platform default.

### 4.3 Deposits and held funds

Security deposits and agreement fees are held, not paid out. They are allocated to a `reserve`
beneficiary so they never enter the owner's payable balance. Refund of a deposit after a failed
screening is a `refunds` row plus a ledger reversal.

### 4.4 What the platform never does

- Never takes custody of a bank account. Money moves through Paystack; Courtland's share is the split.
- Never marks a payment successful on the client. Only a verified Paystack webhook can do that.
- Never calculates a balance by replaying a ledger at read time. `outstanding_kobo` on the contract is
  maintained transactionally and reconciled by a scheduled job.

## 5. Property taxonomy

`listing_type` and `property_type` are independent enums and the UI filters on both.

| `listing_type` | `property_type` values | Structure | Key child records |
|---|---|---|---|
| `rent` | `face_me_i_face_you`, `self_contained`, `flat`, `apartment`, `bungalow`, `terrace`, `commercial`, `office`, `shop` | May have `units`. A single-occupancy property has exactly one unit. | `units`, `contracts(kind='lease')` |
| `sale` | `duplex`, `mansion`, `terrace`, `self_contained`, `flat`, `bungalow`, `commercial` | Whole-property sale. `units` is not used. | `contracts(kind='sale')`, `sale_allocations` |
| `sale` | `land` | Whole-plot or multi-plot sale. | `land_details`, `sale_allocations`, `documents` |

A property with `listing_type = 'sale'` and `property_type = 'land'` must have exactly one
`land_details` row. A property with `property_type <> 'land'` must not. This is enforced by a trigger,
not by convention — see [`05-database-schema.md § Triggers`](./05-database-schema.md#13-triggers-and-invariants).

## 6. Non-goals

Explicitly out of scope. Building any of these will add significant complexity and is a product
decision, not an engineering one.

- **In-app chat or messaging.** Tickets are asynchronous and status-driven. Real-time chat adds
  moderation, storage and notification surface for no core value.
- **Owning the money.** Courtland is not a bank, does not hold client funds in its own accounts, and does
  not lend. Deposits are held in the platform settlement account only until the tenancy is confirmed.
- **Property valuation or appraisal.** Pricing guidance is advisory copy, not a model.
- **Automatic court filings.** Courtland serves notices and records disputes. It does not file at a
  tribunal.
- **Multi-currency.** NGN only. `currency` columns exist and are constrained to `NGN`; that is
  deliberate, not an oversight.
- **Mobile apps.** Responsive web only. A React Native client would duplicate the auth, RLS and API
  client work for a Nigeria-first market where mobile web is the dominant access pattern.

## 7. Success metrics

Tracked in the staff dashboard (`/admin` → Dashboard) and in a weekly job that emails the summary.

| Metric | Definition | Target at 90 days post-launch |
|---|---|---|
| Rent collection rate | Settled rent kobo ÷ rent due kobo for the month | ≥ 92% |
| Days to let a vacant unit | `units.status` → `occupied`, median days from `vacant` | ≤ 21 |
| Arrears recovery | Contracts moved from `suspended` back to `active` within 30 days | ≥ 60% |
| Title release latency | Days from final installment settled to documents released | ≤ 5 |
| Payment webhook success | Webhooks reaching `processed` on first attempt | ≥ 99.5% |
| Listing time to publish | Hours from `in_review` to `published`, median | ≤ 24 |
| Platform take rate | Platform allocations ÷ gross collected | Tracked, not targeted |

## 8. Related documents

- Architecture and trust boundaries: [`01-architecture.md`](./01-architecture.md)
- Entity definitions and state machines: [`04-domain-model.md`](./04-domain-model.md)
- Build order and file inventory: [`roadmap.md`](./roadmap.md)
- Nigerian statutory and registration context: [`25-nigeria-compliance.md`](./25-nigeria-compliance.md)
