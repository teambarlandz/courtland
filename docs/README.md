# Courtland Documentation

Courtland is a full-service property management and sales platform for the Nigerian market. It runs two
product surfaces (a public storefront and a back office), one API, and one Postgres database, and it
handles money movement, legal documents and automated reminders as first-class concerns.

This folder is the single source of truth for how Courtland is built. If code and this documentation
disagree, that is a bug in one of them — the roadmap's [exit criteria](roadmap.md#exit-criteria) require
both to be updated in the same pull request.

The original product brief is preserved verbatim at
[`courtland_project_specifications.md`](./courtland_project_specifications.md). Everything else here
expands, corrects and operationalises it.

---

## Read in this order

If you are new to the project, read these six first. They are the spine; the rest is depth.

| # | Document | Why it matters |
|---|---|---|
| 1 | [`00-project-overview.md`](./00-project-overview.md) | What Courtland is, who uses it, the money flows, the non-goals. |
| 2 | [`01-architecture.md`](./01-architecture.md) | The four deployables, how they talk, and the trust boundaries between them. |
| 3 | [`02-repository-structure.md`](./02-repository-structure.md) | Every directory, who owns it, what is allowed to import what. |
| 4 | [`04-domain-model.md`](./04-domain-model.md) | The entities and state machines. Read this before touching any code. |
| 5 | [`08-api-design.md`](./08-api-design.md) | Every endpoint, the response envelope, the error taxonomy. |
| 6 | [`roadmap.md`](./roadmap.md) | The build order, file by file, with the wiring map. |

## Full index

### Foundations

| Document | Contents |
|---|---|
| [`00-project-overview.md`](./00-project-overview.md) | Scope, actors, capability map, money flows, non-goals, success metrics. |
| [`01-architecture.md`](./01-architecture.md) | System context, container diagram, request paths, trust boundaries, cross-cutting concerns. |
| [`02-repository-structure.md`](./02-repository-structure.md) | Monorepo layout, dependency graph between packages, file naming conventions, import rules. |
| [`03-technology-stack.md`](./03-technology-stack.md) | Pinned versions, why each was chosen, and the risks to re-check before upgrading. |
| [`glossary.md`](./glossary.md) | Nigerian real-estate and platform terms used throughout these docs. |

### Domain and data

| Document | Contents |
|---|---|
| [`04-domain-model.md`](./04-domain-model.md) | Entities, aggregates, state machines, invariants, numbering schemes. |
| [`05-database-schema.md`](./05-database-schema.md) | Table-by-table reference, enums, indexes, triggers, views, migration rules. |
| [`06-authentication.md`](./06-authentication.md) | Phone/email OTP, sessions, identity linking, account lifecycle. |
| [`07-authorization-and-rls.md`](./07-authorization-and-rls.md) | Role and permission matrix, RLS policy strategy, privileged operations. |

### Interfaces and integrations

| Document | Contents |
|---|---|
| [`08-api-design.md`](./08-api-design.md) | Conventions, full endpoint catalogue, error codes, pagination, idempotency. |
| [`09-contracts-and-billing.md`](./09-contracts-and-billing.md) | Lease and sale lifecycles, rent schedules, installment schedules, late fees, balances. |
| [`10-payments-paystack.md`](./10-payments-paystack.md) | Paystack integration, subaccounts and splits, webhooks, refunds, reconciliation. |
| [`11-scheduling-and-jobs.md`](./11-scheduling-and-jobs.md) | Cron schedules, Inngest workflows, event catalogue, idempotency rules. |
| [`12-documents-and-pdfs.md`](./12-documents-and-pdfs.md) | Document lifecycle, secure delivery, PDF generation, release gates. |
| [`13-notifications.md`](./13-notifications.md) | Notice matrix per event, channel strategy, templates, deliverability. |
| [`14-media-and-storage.md`](./14-media-and-storage.md) | Cloudinary setup, listing images, authenticated documents, upload signing. |

### Frontend

| Document | Contents |
|---|---|
| [`15-design-system.md`](./15-design-system.md) | Colour tokens, type scale, spacing, motion rules, component inventory, accessibility bar. |
| [`16-frontend-web.md`](./16-frontend-web.md) | Next.js route tree, rendering strategy, caching, SEO, the three portals. |
| [`17-frontend-admin.md`](./17-frontend-admin.md) | Refine setup, providers, resources, custom filters, dashboard composition. |
| [`18-api-clients-and-state.md`](./18-api-clients-and-state.md) | Typed API client, TanStack Query keys, form strategy, optimistic updates, error UX. |

### Engineering practice

| Document | Contents |
|---|---|
| [`19-security.md`](./19-security.md) | Threat model, key handling, upload safety, webhook verification, incident response. |
| [`20-testing.md`](./20-testing.md) | Four test tiers, what gets tested where, fixtures, CI gates, coverage policy. |
| [`21-observability.md`](./21-observability.md) | Logging, tracing, error tracking, uptime monitoring, metrics, alert thresholds. |
| [`22-configuration-and-environments.md`](./22-configuration-and-environments.md) | Every environment variable, environments, local setup, secrets rotation. |
| [`23-ci-cd-and-deployment.md`](./23-ci-cd-and-deployment.md) | Pipeline stages, Vercel and Render configuration, release process, rollback. |
| [`24-operations-runbooks.md`](./24-operations-runbooks.md) | Day-two playbooks: failed payment, stuck webhook, payout run, stuck deployment. |
| [`25-nigeria-compliance.md`](./25-nigeria-compliance.md) | Registration, receipts and invoices, VAT, data protection, tenancy law. |

### Process

| Document | Contents |
|---|---|
| [`roadmap.md`](./roadmap.md) | Seventeen phases, every file to be created, the wiring map, dead-code rules. |
| [`adr/`](./adr/README.md) | Architecture decision records. Read these before changing a foundational choice. |
| [`checklists/definition-of-done.md`](./checklists/definition-of-done.md) | What must be true before any change is considered finished. |
| [`checklists/launch-checklist.md`](./checklists/launch-checklist.md) | The go-live gate, in order, with sign-off. |

## Conventions used in these documents

- **MUST / MUST NOT** — non-negotiable. Breaking one is an incident or a security bug.
- **SHOULD / SHOULD NOT** — the default. Deviating needs a one-line reason in the PR description.
- **MAY** — optional.
- `apps/api`, `packages/db` etc. are real paths relative to the repository root.
- Table and column names appear in `snake_case`; API JSON fields appear in `camelCase`. The Drizzle
  schema maps one to the other; hand-written SQL never does.
- Every money amount is an integer number of **kobo** (1 NGN = 100 kobo) in a `bigint` column, suffixed
  `_kobo`. See [04-domain-model.md § Money](./04-domain-model.md#4-money).
- Every identifier is a `uuid` v4 generated by Postgres (`gen_random_uuid()`), except human-facing
  reference numbers which use per-table sequences.

## Keeping this documentation honest

Three automated checks enforce it. All three run in CI, and all three are described in
[`roadmap.md § Phase 0`](roadmap.md#phase-0--foundation).

1. **Link check** — every relative Markdown link is resolved. A link to a file that does not exist fails
   the build. This is what stops dangling cross-references.
2. **Doc freshness** — any change touching a listed path must touch the doc that owns that path, or the
   check fails with a message naming both.
3. **No dead code** — [Knip](https://github.com/webpro-nl/knip) runs over the monorepo and fails on
   unused files, unused exports, unused dependencies and unlisted dependencies. See
   [`roadmap.md § Dead-code rules`](roadmap.md#dead-code-rules).
