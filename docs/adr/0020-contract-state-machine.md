# ADR 0020: Contracts follow an explicit state machine

- Status: Accepted
- Date: 2026-02-19
- Deciders: Founder, CTO, Lead developer

## Context

A tenancy agreement is a legal instrument. Its state has legal meaning: a contract in `draft` binds nobody, a
contract in `approved` binds the parties but has not taken effect, and a contract in `terminated` has ended
with notice served. Getting a state wrong is not a UI bug; it changes what the platform is asserting about
other people's legal relationships.

The practical question is whether to model states as a Postgres enum, as an application-level state machine,
or as free text with conditionals in the handlers.

## Decision

An **explicit state machine**, enforced in three places that must agree:

| Layer | Implementation |
|---|---|
| Data | A Postgres `enum` on `contracts.status`. An invalid state cannot be stored |
| Application | `contractStatusMachine` in `packages/types`, a typed transition table with preconditions |
| Database | A trigger, `assert_contract_transition_allowed`, that refuses an illegal transition regardless of who writes |

```
 draft ──submit──▶ in_review ──approve──▶ approved ──activate──▶ active
   │                   │                      │                    │
   │                   └──reject──▶ rejected │                    ├──suspend───▶ suspended
   │                                          │                    │      ▲
   │                                     (signature)              │      └──resume──┘
   │                                          │                    ├──terminate─▶ terminated
   │                                          │                    │
   │                                          │                    ├──expire────▶ expired
   │                                          │                    │
   │                                          │                    └──renew────▶ renewed
   │                                          │
   └──delete (drafts only, and the row goes, so no event)             successor contract: draft
```

`renewed` is terminal for the contract it names: it is the record of an agreement that was superseded, and
the live agreement is a new `contracts` row. Nothing transitions out of `renewed`, `terminated`, `expired` or
`rejected`, and the unit-occupancy and live-lease indexes treat a `renewed` row as history rather than as a
claim on the unit — see [`05 § 7.1`](../05-database-schema.md#71-contracts).

Nine states: `draft`, `in_review`, `approved`, `active`, `suspended`, `terminated`, `rejected`, `expired`,
`renewed`. The transition table with preconditions and side effects is
[`09-contracts-and-billing.md § 2.1`](../09-contracts-and-billing.md#21-transition-rules).

Every transition writes a `contract_events` row with the actor, the from and to state, a reason, the IP, and
the user agent. That table is append-only and readable by the parties, so "why is my rent not working" is
answerable from the record.

`payments_ledger` cannot be written for a contract that is not in a payment-accepting state, checked in the
service layer and by the intent policy's `status` clause.

## Alternatives considered

**A Postgres enum with application-side checks only.** Rejected. It prevents an invalid value but permits an
invalid *transition*: writing `terminated` straight to an `active` contract is a valid enum value, so the
database accepts it. `adminDb` exists and is used by jobs, so "the application always checks" is not a
guarantee.

**Free text status.** Rejected. No compile-time safety, no enumerability for a `switch`, and typos become
silent branches that never match.

**A workflow engine such as XState for contracts.** Rejected. It models the state machine well in the browser
and poorly in the database, and this machine must hold across three layers. A typed transition table plus a
trigger is simpler and lives in all three.

**No database trigger; enforce only in the service layer.** Rejected for the same reason as the enum: a job
using `adminDb` would bypass it. The trigger is the ADR 0002 principle applied to state rather than rows.

**Termination as a flag rather than a state.** Rejected. A `terminated_at` timestamp alongside `active` permits
both states being true. A single status field cannot be in two states at once, which is the property that makes
"can this tenant pay?" answerable with an equality check.

## Consequences

**Easier.** Every state question is an equality check, so "which contracts accept payments" is
`status in ('approved','active')` rather than a set of conditions on several columns. The legal meaning of each
state is documented once. The transition table is data, so a policy change is a table edit and its tests.
`contract_events` is an audit trail that satisfies the Rent Control Act's record-keeping requirement
(compliance doc §2.3) as a by-product.

**Harder.** Every write must consult the machine, and there are three places that must agree, so the
transition table is asserted in all of them by a test. Illegal transitions fail at the database with an
exception that must be translated into a `409` problem document rather than a `500`. Adding a state is a
migration plus a table edit plus a colour plus a template check, which is friction by design.

**Cost.** The trigger adds a small write cost per transition, negligible against the transaction that
accompanies it. The three-place consistency test is maintenance.

## Revisit when

- Contracts need branching workflows with parallel paths, such as an arbitration clause with multiple
  possible outcomes. Check: a transition needing more than a precondition list to describe.
- A contract must be simultaneously active and in dispute for a meaningful period, in a way the state model
  cannot express. Check: two states being simultaneously true becoming a requirement. Disputes are modelled
  as a separate table for this reason.
- The status enum exceeds about fifteen values. Check: states whose distinction no one can state.

The most likely evolution is a `contract_state_history` view or a `state_reason` requirement per transition,
not a different model.

## Related

- [`../09-contracts-and-billing.md § Contract states`](../09-contracts-and-billing.md#2-contract-states)
- [`../04-domain-model.md § Contract`](../04-domain-model.md#35-contracts)
- [`../25-nigeria-compliance.md § Rent Control`](../25-nigeria-compliance.md#2-rent-control-act-2023)
- ADR 0002, RLS and triggers as the floor
