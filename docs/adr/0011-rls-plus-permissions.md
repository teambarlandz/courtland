# ADR 0011: Permissions in policies rather than roles

- Status: Accepted
- Date: 2026-02-14
- Deciders: CTO

## Context

Courtland has four roles: tenant, buyer, landlord, admin. Authorization questions are not "is this a
landlord" but "may this landlord publish a listing", "may this staff member approve a payout", "may this
tenant attach a cost to a maintenance ticket".

Policies can check roles or they can check capabilities. The choice determines how expensive it is to add a
role, grant a capability, or split a role in two.

## Decision

Policies check **permissions**, never roles.

```sql
create policy properties_update_owner on public.properties
for update to authenticated
using (
  private.has_permission('property_update_own')
  and private.owns_property(id)
  and status in ('draft','in_review')
);
```

| Table | Holds |
|---|---|
| `role_permissions` | `(role, permission)`, seeded from the TypeScript matrix |
| `private.has_permission(text)` | `security definer`, reads `user_roles` joined to `role_permissions` |
| `private.has_role(text)` | Exists for the few places a role genuinely is the question, such as the admin bootstrap check |

56 permissions across 10 groups, 4 roles, 99 role→permission pairs. The canonical list is
`packages/types/src/permissions/matrix.ts`; a test asserts it and the database agree in both directions.

## Alternatives considered

**Policies check roles.** Rejected. `has_role('landlord')` cannot express "a landlord may read but not
publish". Every capability distinction requires a new role, and roles multiply: landlord, senior landlord,
landlord-with-verified-payout, agency landlord. Adding the `manager` role that can do everything except
manage users would be ten `has_role` branches rather than ten rows.

**Application-layer permission checks only, no permissions in the database.** Rejected. Then the two must
agree, and nothing verifies that they do. With permissions in the database, the application and RLS read the
same table.

**A role hierarchy with inheritance.** Rejected. `admin` inheriting `landlord` sounds tidy but means a staff
member's owner-portal data would be scoped to nothing useful, since a staff member is not an owner of
anything. Roles are not a hierarchy here; they are independent bundles of capabilities.

**Authorization as application code in a single place, generated from the matrix.** Rejected as a
supplement, not a replacement. Generated code is a good consistency check but it is still application layer,
and ADR 0002's point stands: the floor must be in the database.

**Fine-grained ABAC: rules with conditions evaluated at query time.** Rejected for v1. It is the right model if
permissions need to depend on resource attributes, and today they do not, beyond what the `using` clause
already expresses in SQL. ADR 0002's revisit trigger covers it.

## Consequences

**Easier.** Adding a capability is one row in `role_permissions`, no policy change and no deploy. Splitting a
role, such as `manager`, is a data change. Policies read uniformly, so a reviewer understands one and
understands all. The matrix is testable in both directions: no permission without a seed row, no seed row
without a TypeScript entry.

**Harder.** Every policy evaluation joins `user_roles` to `role_permissions`, so those tables need indexes and
a plan-cache-friendly layout. A permission check in application code and a policy check both read the same
data, and a developer must remember that a permission not in a policy means the database will deny it
regardless of what the code allows. Debugging spans two layers.

**Cost.** `has_permission` is called per policy per row, so the function must be `stable` and indexed. The
matrix must be kept in sync, which a bidirectional test enforces.

## Revisit when

- Permissions exceed roughly 100 and the matrix becomes hard to read. Check: `role_permissions` needing a
  scope column.
- Policies need conditions the SQL cannot express readably. Check: a policy with a three-table join.
- A role needs attribute-based conditions: only owners whose KYC is approved can be paid. Check: three or more
  such rules appearing as ad-hoc predicates across policies, which is the signal to add an `owner.kyc_status`
  condition to `has_permission` itself rather than scattering it.

The most likely evolution is adding scope to the permission name, such as `payout_approve`, becoming
`payout_approve:regional`, rather than adopting an ABAC engine.

## Related

- [`../07-authorization-and-rls.md § Permissions`](../07-authorization-and-rls.md#2-permissions)
- ADR 0002, RLS as the floor
- [`../17-frontend-admin.md § Access control`](../17-frontend-admin.md#6-access-control)
