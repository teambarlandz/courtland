# Architecture decision records

One file per decision, immutable once accepted. A decision that changes is a new record that supersedes the
old one; the old file is kept, because the reasoning is what matters later.

## Index

| ADR | Title | Status | Date |
|---|---|---|---|
| [0001](./0001-modular-monolith.md) | Modular monolith on a monorepo, not microservices | Accepted | 2026-02-11 |
| [0002](./0002-postgresql-over-nosql.md) | PostgreSQL with row-level security as the authorization floor | Accepted | 2026-02-11 |
| [0003](./0003-nextjs-for-web-vite-for-admin.md) | Next.js for the public site and portals, Vite for the admin | Accepted | 2026-02-11 |
| [0004](./0004-refine-for-the-admin.md) | Refine for the admin, hand-built UI for the portals | Accepted | 2026-02-11 |
| [0005](./0005-hand-rolled-design-system.md) | A hand-built design system on Radix, not a component library | Accepted | 2026-02-12 |
| [0006](./0006-paystack.md) | Paystack for payments, no multi-provider abstraction | Accepted | 2026-02-12 |
| [0007](./0007-money-as-bigint-kobo.md) | Money as integers in kobo, end to end | Accepted | 2026-02-12 |
| [0008](./0008-append-only-ledger.md) | An append-only ledger with allocations, not a mutable balance column | Accepted | 2026-02-13 |
| [0009](./0009-inngest-for-jobs.md) | Inngest for durable jobs, Render cron only to enqueue | Accepted | 2026-02-13 |
| [0010](./0010-supabase-auth-otp.md) | Supabase Auth with OTP, no passwords | Accepted | 2026-02-14 |
| [0011](./0011-rls-plus-permissions.md) | Permissions in policies rather than roles | Accepted | 2026-02-14 |
| [0012](./0012-cloudinary.md) | Cloudinary for media and documents, with direct browser upload | Accepted | 2026-02-15 |
| [0013](./0013-pdfkit.md) | PDFKit for generation, handlebars for templates | Accepted | 2026-02-15 |
| [0014](./0014-vercel-and-render.md) | Vercel for the frontends, Render for the API and workers | Accepted | 2026-02-16 |
| [0015](./0015-supabase-hosted-over-self-managed-postgres.md) | Supabase-hosted Postgres, not self-managed | Accepted | 2026-02-16 |
| [0016](./0016-sms-via-supabase-hook.md) | SMS through a Supabase Send SMS hook, not the built-in provider | Accepted | 2026-02-17 |
| [0017](./0017-naira-only.md) | NGN only in v1 | Accepted | 2026-02-17 |
| [0018](./0018-pnpm-and-turborepo.md) | pnpm workspaces with Turborepo | Accepted | 2026-02-18 |
| [0019](./0019-supabase-edge-function-webhook.md) | A Supabase Edge Function mirrors the Paystack webhook | Accepted | 2026-02-18 |
| [0020](./0020-contract-state-machine.md) | Contracts follow an explicit state machine | Accepted | 2026-02-19 |

## Format

```markdown
# ADR NNNN: Title

- Status: Proposed | Accepted | Superseded by ADR-NNNN
- Date: YYYY-MM-DD
- Deciders:

## Context
What forced the decision. Constraints, requirements, what was true at the time.

## Decision
What was decided, in the present tense.

## Alternatives considered
Each with a real reason for rejection, not a strawman.

## Consequences
What this makes easy, what it makes hard, and what it costs.

## Revisit when
The observable condition that would make this wrong.
```

## Rules

| Rule | Reason |
|---|---|
| One decision per record | A record with two decisions gets accepted for the easy half |
| Accepted records are immutable | Editing history destroys the reasoning that future readers need |
| A change is a new record that supersedes | The chain of reasoning stays intact |
| "Revisit when" is mandatory | A decision with no trigger for reconsideration is a decision nobody will question |
| No diagrams that drift | A diagram is replaced by a doc link the day it becomes wrong |
| Every architecture doc links back to the ADRs behind it | So a reader can see why, not just what |

## Related

- The architecture the records justify: [`../01-architecture.md`](../01-architecture.md)
- The stack the records chose: [`../03-technology-stack.md`](../03-technology-stack.md)
- What was rejected and why: [`../03-technology-stack.md § Rejected`](../03-technology-stack.md#9-rejected-alternatives)
