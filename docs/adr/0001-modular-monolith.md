# ADR 0001: Modular monolith on a monorepo, not microservices

- Status: Accepted
- Date: 2026-02-11
- Deciders: Founder, CTO

## Context

Courtland has six functional domains: properties, contracts, money, maintenance, documents, and
notifications. A small team will build it. The obvious "scale-ready" answer is to split each domain into its
own service with its own database, which is what most architecture advice recommends by default.

Two constraints make that advice wrong here:

1. **Money must be transactional across domains.** Settling a payment writes to the ledger, marks a
   contract schedule row paid, and enqueues a receipt. Three domains, one transaction. Splitting them means
   a saga with compensations, and compensation for a money movement is a refund, which is visible to a
   customer.
2. **The team is three people.** Six services means six deployables, six sets of environment variables, six
   dashboards, and a service-to-service authentication scheme to design, test, and get wrong.

## Decision

One Express application, one Postgres database, one deployable plus one worker. Domains are separated by
directory and by an import rule, not by network.

```
apps/api/src/modules/{properties,contracts,money,payouts,maintenance,documents,notifications,admin}
```

Cross-module communication is in-process function calls, or the `outbox_events` table for anything that must
happen after the transaction commits. No module writes to another module's tables; a CI grep enforces it.

## Alternatives considered

**Microservices per domain.** Rejected for the transaction and team-size reasons above. It also fails on a
specific requirement: "settle a payment and mark the schedule paid" must be atomic, and a distributed
transaction for money is a category of complexity nobody should take on deliberately.

**A single module per file with no domain grouping.** Rejected. Six domains in one directory is how a
codebase becomes a single module with extra steps, and the domain boundary is what makes the money rules
auditable.

**Serverless functions per route.** Rejected. Document generation, reconciliation, and Paystack batches are
long-running and stateful. A 90-second reconciliation job in a 10-second function needs a state machine,
which is Inngest anyway (ADR 0009).

**Next.js server actions as the backend.** Rejected. It couples the backend to a web framework and makes the
admin and any future client call server actions over HTTP with no stable contract. The money domain needs a
versioned, documented API.

## Consequences

**Easier.** One transaction spans domains. One deploy moves everything. A developer traces a request through
one process. Refactoring a domain boundary is a file move, not a distributed refactor.

**Harder.** A bad deploy takes down everything. One instance type must serve both CPU-heavy and IO-heavy
work. A domain boundary can be violated by an import, which is why CI enforces the rule rather than trusting
convention.

**Cost.** Scaling is uniform. If PDF generation saturates the CPU, list endpoints get slow too. The mitigation
is moving PDF generation to a separate worker process, which is one start command and one image, not a new
service.

## Revisit when

Any one of these:

- A domain needs to scale independently beyond 10× the others. Check: PDF generation or reconciliation
  saturating the CPU while list endpoints are idle.
- Two teams need to deploy the same domain independently on a weekly cadence. Check: a change to `money`
  blocked by a change to `properties`.
- A database table needs a different backup or availability class. Check: cold archival growing the primary
  beyond a sensible size.
- The team exceeds eight engineers. Check: merge conflicts in `src/modules/money/` becoming the top CI
  latency complaint.

At eight engineers, split by deploy cadence first, not by domain name. Extract the one service that is
actually causing a problem, not the six that could.

## Related

- [`../01-architecture.md`](../01-architecture.md)
- [`../08-api-design.md`](../08-api-design.md)
- ADR 0009, for the worker boundary inside this monolith
