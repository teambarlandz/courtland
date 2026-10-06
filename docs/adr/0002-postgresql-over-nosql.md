# ADR 0002: PostgreSQL with row-level security as the authorization floor

- Status: Accepted
- Date: 2026-02-11
- Deciders: CTO, Lead developer

## Context

Courtland stores tenancy agreements, identity documents, and money. The authorization requirement is not "the
API checks permissions" but "a bug cannot leak another tenant's identity document".

Three layers could enforce this: application code checks, a policy layer in the application, or the database.
Application checks are one refactor away from a mistake. The question is whether the database should be the
last line.

The specific risk: identity documents and tenancy agreements are the data whose leakage is most damaging, and
they are exactly the data most likely to be queried from a dozen places — the portal, the admin, the document
generator, the receipt PDF, the reconciliation job.

## Decision

PostgreSQL with row-level security enabled on every table in `public`. Every policy reads the caller's
identity from `auth.uid()` and their capabilities from `private.has_permission()`, both `security definer`
functions with an empty search path.

Application code selects a database client based on the request context:

| Context | Client | RLS |
|---|---|---|
| A request with a user identity | `withRls` | Applies |
| A background job | `adminDb` (`service_role`) | Bypasses |

No table in `public` may have RLS disabled; a CI query fails the build if one does. No table has a client
grant without a matching policy.

## Alternatives considered

**Application-only authorization.** Rejected. It requires every query in the codebase to remember a scoping
clause, and a single omission leaks data. With RLS, the omission is impossible by construction.

**Row-level security plus application checks.** This is what was chosen, not an alternative. Both exist
because they catch different mistakes: RLS catches a missing filter, application checks catch a semantically
wrong filter (returning the right rows for the wrong reason).

**A policy engine such as Oso, OpenFGA, or Casbin.** Rejected for v1. An external engine adds a service to
operate, a latency hop per request, and a second place where the permission model lives. The permission
matrix is 42 rows across 4 roles; expressing it in SQL policies is not a burden. The revisit trigger is below,
and it is a real trigger: the model grows relations between entities, such as "a tenant may read documents for
any contract where they are a party, a co-signed guarantor, or a witness".

**Supabase Auth only, with no RLS, using a server-side service key everywhere.** Rejected outright. That is
"application-only authorization" with the extra step of bypassing any database-level protection. It is how
Supabase projects leak.

**Row-level security with a policy per role rather than per permission.** Rejected; see ADR 0011.

## Consequences

**Easier.** Authorization correctness is testable with SQL. A new query is safe by default. A pgTAP test
asserts allow and deny per role per table, which is the coverage an application-layer check cannot give.
The service role is confined by import rules and a lint rule, so the bypass surface is enumerable.

**Harder.** Every policy is a query the planner must evaluate, so filter columns need indexes. Two tables
whose policies read each other raise error 42P17 and need a `security definer` helper. `adminDb` exists and
can be misused, so its use is restricted and audited. Service-role keys must never reach a client.

**Cost.** Policy design takes longer than writing a `WHERE` clause. The pgTAP suite is substantial. Debugging
a permission problem means thinking in two layers at once.

## Revisit when

- Authorization bugs are traced to policy complexity rather than to a missing policy. Check: the number of
  `private.*` helper functions exceeding roughly 30.
- The permission model needs relations between entities that SQL cannot express readably. Check: a policy
  with a three-table join.
- A tenant count beyond about 50,000 makes policy evaluation measurably slow. Check: list endpoint p95
  exceeding 500 ms with an `EXPLAIN` showing repeated policy evaluation.

At that point, extract the authorization decision into a dedicated service with a materialized permission
cache, and keep RLS as a coarse tenant-isolation filter rather than the full model.

## Related

- [`../07-authorization-and-rls.md`](../07-authorization-and-rls.md)
- [`../05-database-schema.md`](../05-database-schema.md)
- ADR 0011, permissions in policies
- ADR 0015, Supabase-hosted Postgres
