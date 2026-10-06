# ADR 0015: Supabase-hosted Postgres, not self-managed

- Status: Accepted
- Date: 2026-02-16
- Deciders: CTO

## Context

ADR 0002 makes PostgreSQL with row-level security the authorization floor of the system. That means the
database is the most security-critical component, and its availability, backups, patching, and failover become
a first-class concern.

A three-person team can run Postgres on Render, RDS, or a VPS. Managed is the obvious choice, but Supabase
specifically bundles Postgres, Auth, and Storage, which raises the question of whether the coupling is worth
it.

## Decision

**Supabase-hosted Postgres**, with Supabase Auth as the identity provider (ADR 0010) and Supabase's connection
pooler for the API.

| Capability | Setting |
|---|---|
| Region | Oregon, matching Render so the API is co-located |
| Extensions | `pgcrypto`, `postgis`, `pg_trgm`, `btree_gin`, `unaccent` |
| Connection | Supavisor in transaction mode, so API instances are stateless |
| Backups | Point-in-time recovery, continuous |
| Migrations | Applied through CI, never by hand in production |
| Local development | `supabase start` for the whole stack |

## Alternatives considered

**Render PostgreSQL.** Rejected. No RLS integration with Supabase Auth's `auth.uid()`, so every policy would
need the user id passed explicitly, which weakens ADR 0002's "the database knows who is calling" property. No
branching for testing migrations. Worse backup granularity.

**AWS RDS.** Rejected. The most capable option and the wrong one for this team. It requires a VPC, parameter
tuning, a maintenance window, an IAM story, and someone who knows RDS. The advantage, multi-AZ with automated
failover, is available managed.

**Neon.** A genuine alternative, and arguably better for scaling reads. Rejected because the Auth integration
is weaker: Neon has no `auth.uid()`, so RLS policies would depend on a JWT claim read through a custom GUC
rather than a function Supabase guarantees. The friction is small but permanent, and it touches every policy.

**PlanetScale, Fauna, or another non-relational store.** Rejected by ADR 0002. Beyond that, none of them has
RLS with per-table policies, which is the entire basis of the authorization model.

**A Postgres VPS with a managed control panel like pganalyze or CloudNativePG.** Rejected. Operating Postgres
is a specialisation. With the database as the security floor, its availability is the product's availability.

## Consequences

**Easier.** `auth.uid()` inside RLS policies, which is what makes ADR 0002's model clean. Point-in-time
recovery with a minute's granularity, so ADR 0024's restore drill is a support ticket. Backups, patching,
and failover handled. Branching for testing migrations. Local development with the entire stack on one command.
The pooler means API instances can scale without exhausting connections.

**Harder.** A vendor dependency for the most critical component, with pricing that scales with storage and IO
through WAL-heavy writes like `audit_log`. A connection limit that shapes how the API is deployed. Region
lock-in: moving regions means a dump and restore, not a replication promotion. RLS policies must account for
`service_role` bypassing RLS, which is a footgun ADR 0002's containment rules address. Extension availability
is limited to what Supabase permits, and a required extension being unavailable forces a design change.

**Cost.** A monthly bill that grows with write volume, particularly the append-only ledger and audit log.

## Revisit when

- Supabase's cost exceeds 15% of infrastructure. Check: monthly invoices against a database-cost model.
- A required Postgres extension or feature is unavailable. Check: a feature request blocked on Supabase.
- A compliance requirement demands customer-managed encryption keys, a private link to the API, or a
  specific residency. Check: a procurement or regulatory requirement.

The extension limitation is the most likely to bite first, and it is the one to check before committing to a
Postgres-specific feature. `pg_cron` is the notable absence: it is why ADR 0009 uses Render cron to enqueue
rather than a database schedule.

## Related

- ADR 0002, RLS as the authorization floor
- ADR 0009, why `pg_cron` is not the scheduler
- ADR 0010, Supabase Auth
- [`../05-database-schema.md`](../05-database-schema.md)
