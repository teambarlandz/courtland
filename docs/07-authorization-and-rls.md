# 07 — Authorization and RLS

Courtland has four authorisation layers. Each is necessary and none is sufficient alone.

```
Layer 1  UI          Refine accessControlProvider, Next.js route guards
                     Purpose: a good experience. Bypassed by anyone with devtools.
Layer 2  API         requirePermission() middleware on every route
                     Purpose: correct behaviour for the resource and action.
Layer 3  Service     Ownership and scope checks inside service functions
                     Purpose: "is this THEIR contract", "is this THIS owner's unit".
Layer 4  Database    Row Level Security
                     Purpose: the floor. Holds even if layers 1-3 are wrong.
```

Layer 4 is the one that matters most. If a policy has a bug, the failure mode is under-disclosure and a
failing pgTAP test, not a data breach.

## 1. Roles

Four roles, additive, one user can hold several.

| Role | Portal | Back office | Typical person |
|---|---|---|---|
| `tenant` | `/portal/tenant` | — | A person renting a flat or room. |
| `buyer` | `/portal/buyer` | — | A person buying a flat, duplex or plot. |
| `landlord` | `/portal/owner` | — | A property owner, or a vendor/agent selling land. |
| `admin` | — | `/admin` | Courtland staff. |

A landlord with a tenant account holds both `landlord` and `tenant`. The UI resolves this by showing both
portal links in the account menu.

## 2. Permissions

Permissions are fine-grained capabilities. Roles map to sets of permissions in `role_permissions`, and
every policy checks permissions rather than roles directly.

**Why permissions, not roles, in policies.** A policy saying `private.has_role('landlord')` cannot express
"a landlord may read but not write". A policy saying `private.has_permission('contract_read')` can, and
adding a capability to a role is one `INSERT` into `role_permissions` with no policy change. When Courtland
needs a `manager` role that can do everything an admin can except manage users, it is ten rows in
`role_permissions` and zero policy changes.

### 2.1 The matrix

Seeded from `packages/types/src/permissions/matrix.ts`. A test asserts the seed and the TypeScript source
agree, in both directions.

| Permission | tenant | buyer | landlord | admin |
|---|:---:|:---:|:---:|:---:|
| **Properties** | | | | |
| `property_read_public` | ● | ● | ● | ● |
| `property_create` | | | ● | ● |
| `property_update_own` | | | ● | ● |
| `property_update_any` | | | | ● |
| `property_submit` | | | ● | ● |
| `property_publish` | | | | ● |
| `property_withdraw` | | | ● | ● |
| `property_delete` | | | | ● |
| **Units** | | | | |
| `unit_read` | ● | ● | ● | ● |
| `unit_create` | | | ● | ● |
| `unit_update_own` | | | ● | ● |
| `unit_update_any` | | | | ● |
| **Owners** | | | | |
| `owner_read_own` | | | ● | ● |
| `owner_read_any` | | | | ● |
| `owner_register` | | | ● | ● |
| `owner_update_own` | | | ● | ● |
| `owner_update_any` | | | | ● |
| `owner_kyc_approve` | | | | ● |
| **Contracts** | | | | |
| `contract_read_own` | ● | ● | ● | ● |
| `contract_read_any` | | | | ● |
| `contract_create` | | | | ● |
| `contract_update` | | | | ● |
| `contract_suspend` | | | | ● |
| `contract_terminate` | | | | ● |
| `contract_renew` | | | | ● |
| **Money** | | | | |
| `payment_read_own` | ● | ● | ● | ● |
| `payment_read_any` | | | | ● |
| `payment_create_own` | ● | ● | | |
| `payment_create_any` | | | | ● |
| `payment_refund` | | | | ● |
| `payout_read_own` | | | ● | ● |
| `payout_run` | | | | ● |
| `payout_approve` | | | | ● |
| `payout_initiate` | | | | ● |
| **Maintenance** | | | | |
| `ticket_create_own` | ● | | ● | ● |
| `ticket_read_own` | ● | | ● | ● |
| `ticket_read_any` | | | | ● |
| `ticket_manage` | | | | ● |
| `ticket_approve_cost` | | | | ● |
| **Documents** | | | | |
| `document_read_own` | ● | ● | ● | ● |
| `document_read_any` | | | | ● |
| `document_upload` | | | ● | ● |
| `document_generate` | | | | ● |
| `document_release` | | | | ● |
| **Notices** | | | | |
| `notice_read_own` | ● | ● | ● | ● |
| `notice_send` | | | | ● |
| **Disputes** | | | | |
| `dispute_create` | ● | ● | ● | ● |
| `dispute_read_own` | ● | ● | ● | ● |
| `dispute_read_any` | | | | ● |
| `dispute_resolve` | | | | ● |
| **Platform** | | | | |
| `saved_search_manage` | ● | ● | ● | ● |
| `admin_dashboard_read` | | | | ● |
| `client_filter_manage` | | | | ● |
| `user_manage` | | | | ● |
| `audit_read` | | | | ● |
| `settings_manage` | | | | ● |

56 permissions across 10 groups, 99 role→permission pairs. A pgTAP test asserts every permission in the
TypeScript matrix has a row
in `role_permissions` and that no row exists without a TypeScript counterpart.

### 2.2 Reading the matrix in code

```ts
import { hasPermission, type Permission } from '@courtland/types/permissions'

// API
if (!req.auth.permissions.includes('payout_initiate')) {
  throw new ForbiddenError('payout_initiate')
}

// Admin
const can = usePermissions()
if (!can('document_release')) return null

// Portal: the tenant never needs the check. RLS already scoped the query.
```

The API's `requirePermission` middleware populates `req.auth.permissions` once per request by reading
`role_permissions` for the caller's roles, so a handler checks an array membership rather than making a
database query. A single indexed lookup per request is the cost.

## 3. RLS strategy

### 3.1 Principles

| Principle | Implementation |
|---|---|
| RLS on every table | Enforced by a CI query that fails if any table in `public` has `relrowsecurity = false`. |
| Default deny | Enabling RLS denies everything. Policies add back exactly what is needed. |
| Grants AND policies | Both are required. A policy on a table where `anon` lacks `SELECT` is unreachable; a grant on a table with no policy is a breach. See [`05-database-schema.md § Grants`](./05-database-schema.md#15-grants). |
| `USING` is the entrance, `WITH CHECK` is the exit | `USING` filters existing rows (select/update/delete). `WITH CHECK` validates the written row (insert/update). An `UPDATE` needs both. |
| `to` is always specified | Without `to`, a policy is evaluated for `anon` too and short-circuits. |
| `(select auth.uid())` | Wrapping the call lets the planner evaluate it once per statement instead of once per row. |
| Index every filter column | A policy filter on an unindexed column turns each row check into a sequential scan. |
| No recursive policies | Two tables whose policies read each other raise `42P17`. The cycle is broken with a `security definer` function. |
| `security_invoker = true` on every view | A view is `security_definer` by default and silently bypasses its tables' policies. |

### 3.2 Policy style

Every policy in the repository follows the same shape, so an auditor can read one and understand all.

```sql
create policy <table>_<operation>_<predicate>
on public.<table>
for <select|insert|update|delete>
to <anon|authenticated>
[as restrictive]
using  ( <predicate> )     -- select, update, delete
[with check ( <predicate> )]  -- insert, update
```

Predicates use `private.*` helpers. Policies never contain inline `exists` subqueries against other
RLS-protected tables, because that is how recursion starts.

## 4. Policies by table

### 4.1 `properties`

```sql
-- Anonymous and every signed-in user: published listings only
create policy properties_select_public on public.properties
for select to anon, authenticated
using ( status in ('published','let_agreed','under_offer') and deleted_at is null );

-- Owners: their own drafts and in-review listings, via a helper that reads `owners`
create policy properties_select_own_draft on public.properties
for select to authenticated
using (
  private.has_permission('property_update_own')
  and private.owns_property(id)
  and status in ('draft','in_review','withdrawn','archived')
);

-- Staff: everything
create policy properties_select_staff on public.properties
for select to authenticated
using ( private.has_permission('property_update_any') );

-- Insert: an owner creates a draft on their own asset record
create policy properties_insert_owner on public.properties
for insert to authenticated
with check (
  private.has_permission('property_create')
  and private.owner_of(id)         -- ensures the owner row exists and is theirs
  and status = 'draft'
  and deleted_at is null
);

-- Update: owners may edit only their own drafts, and may not publish
create policy properties_update_owner on public.properties
for update to authenticated
using (
  private.has_permission('property_update_own')
  and private.owns_property(id)
  and status in ('draft','in_review')
)
with check (
  private.owns_property(id)
  and status in ('draft','in_review','withdrawn')   -- may withdraw, may not self-publish
);

create policy properties_update_staff on public.properties
for update to authenticated
using ( private.has_permission('property_update_any') )
with check ( true );

-- Delete: staff only, and never on a property with a contract
create policy properties_delete_staff on public.properties
for delete to authenticated
using (
  private.has_permission('property_delete')
  and not exists (select 1 from public.contracts c where c.property_id = properties.id)
);
```

Note the delete policy: the `not exists` check means a property with any contract can never be deleted,
regardless of permission. A trigger would be the more robust choice; this exists here because `contracts`
has its own RLS and the subquery would be evaluated as the caller. The trigger in
[`05-database-schema.md § Triggers`](./05-database-schema.md#13-triggers-and-invariants) is the real
enforcement; this policy is defence in depth.

### 4.2 `units`

```sql
create policy units_select_public_vacant on public.units
for select to anon, authenticated
using (
  private.has_permission('unit_read')
  and (status in ('vacant','under_maintenance')
       or exists (select 1 from public.properties p
                  where p.id = units.property_id
                    and p.status in ('published','let_agreed')))
);

create policy units_select_staff on public.units
for select to authenticated
using ( private.has_permission('unit_update_any') );

create policy units_select_owner on public.units
for select to authenticated
using ( private.has_permission('unit_read') and private.owns_property(property_id) );

create policy units_update_owner on public.units
for update to authenticated
using ( private.has_permission('unit_update_own') and private.owns_property(property_id) )
with check ( private.owns_property(property_id) );
```

`units` has no insert or delete policy for non-staff. Owners cannot delete a unit that has history; the
API sets `status` instead. The `unit_manage` permission covers `unit_create` and `unit_update_any` for
staff.

### 4.3 `contracts`

The most heavily policed table. Four distinct access patterns.

```sql
-- The payer and any named party
create policy contracts_select_party on public.contracts
for select to authenticated
using (
  private.has_permission('contract_read_own')
  and private.is_contract_party(id)
);

-- The owner of the underlying property
create policy contracts_select_landlord on public.contracts
for select to authenticated
using (
  private.has_permission('contract_read_own')
  and private.owns_property(property_id)
);

-- Staff
create policy contracts_select_staff on public.contracts
for select to authenticated
using ( private.has_permission('contract_read_any') );

-- Nobody but staff mutates a contract. Not even the payer.
create policy contracts_update_staff on public.contracts
for update to authenticated
using ( private.has_permission('contract_update') )
with check ( private.has_permission('contract_update') );

create policy contracts_insert_staff on public.contracts
for insert to authenticated
with check ( private.has_permission('contract_create') );

-- No delete policy at all: contracts are never deleted. See I11's neighbours.
```

A tenant cannot change their own lease's rent, terminate it, or mark it paid. Not because the API forbids
it — the API does forbid it too — but because the database says so.

### 4.4 `payments_ledger` and `payment_intents`

```sql
create policy ledger_select_payer on public.payments_ledger
for select to authenticated
using ( private.has_permission('payment_read_own') and payer_id = auth.uid() );

create policy ledger_select_owner on public.payments_ledger
for select to authenticated
using (
  private.has_permission('payout_read_own')
  and private.owns_owner(owner_id)
);

create policy ledger_select_staff on public.payments_ledger
for select to authenticated
using ( private.has_permission('payment_read_any') );

-- Intents: a payer may create an intent for their own contract.
create policy intents_insert_payer on public.payment_intents
for insert to authenticated
with check (
  private.has_permission('payment_create_own')
  and payer_id = auth.uid()
  and private.is_contract_party(contract_id)
  and status = 'created'
);

-- A payer may only move an intent from created to pending. Anything further is the webhook's job,
-- and the webhook runs as service_role.
create policy intents_update_payer on public.payment_intents
for update to authenticated
using ( private.has_permission('payment_create_own') and payer_id = auth.uid() and status = 'created' )
with check ( private.has_permission('payment_create_own') and payer_id = auth.uid() );
```

The `status = 'created'` in the `using` clause is the important part. A payer who crafts an `UPDATE ... SET
status = 'succeeded'` finds zero matching rows, because the intent is no longer in `created`.

### 4.5 `ledger_allocations`

```sql
create policy allocations_select_owner on public.ledger_allocations
for select to authenticated
using (
  private.has_permission('payout_read_own')
  and beneficiary_type = 'owner'
  and private.owns_owner(owner_id)
);

create policy allocations_select_staff on public.ledger_allocations
for select to authenticated
using ( private.has_permission('payment_read_any') );

-- No insert, update or delete policy. Allocations are written only by the payment workflow
-- as service_role, or by the payout job. The API cannot be tricked into writing one.
```

A landlord sees their own principal allocations and their own maintenance deductions. They do not see
the platform's management fee on someone else's payment, and they cannot see a reserve allocation at all.

### 4.6 `documents`

```sql
create policy documents_select_party on public.documents
for select to authenticated
using (
  private.has_permission('document_read_own')
  and visibility in ('counterparty','staff','public')
  and (
      private.is_contract_party(contract_id)
      or private.owns_property(property_id)
      or private.owns_owner(owner_id)
      or (owner_user_id = auth.uid())
  )
);

create policy documents_select_staff on public.documents
for select to authenticated
using ( private.has_permission('document_read_any') );

-- Upload: owners may attach KYC to their own owner record. Nothing else is uploadable by a portal user.
create policy documents_insert_owner on public.documents
for insert to authenticated
with check (
  private.has_permission('document_upload')
  and private.owns_owner(owner_id)
  and kind = 'id_verification'
  and status = 'draft'
);

-- No update or delete policy. Superseding is an insert of a new row plus a status change by staff.
```

`visibility = 'private'` is readable by nobody through RLS except `service_role`. Even a party on the
contract cannot read it. That is what `private` means, and `document_access_log` records staff access to
those rows.

### 4.7 `maintenance_tickets`

```sql
create policy tickets_select_raiser on public.maintenance_tickets
for select to authenticated
using (
  private.has_permission('ticket_read_own')
  and (raised_by = auth.uid() or private.owns_property(property_id))
);

create policy tickets_select_staff on public.maintenance_tickets
for select to authenticated
using ( private.has_permission('ticket_read_any') );

create policy tickets_insert_own on public.maintenance_tickets
for insert to authenticated
with check (
  private.has_permission('ticket_create_own')
  and raised_by = auth.uid()
  and (private.occupies_unit(unit_id) or private.owns_property(property_id))
  and status = 'open'
  and quoted_amount_kobo is null      -- a tenant cannot attach a cost
  and cost_approved_at is null
);

create policy tickets_update_own on public.maintenance_tickets
for update to authenticated
using (
  private.has_permission('ticket_read_own')
  and raised_by = auth.uid()
  and status in ('open','acknowledged','in_progress','awaiting_tenant')
)
with check (
  raised_by = auth.uid()
  -- A raiser may close their own ticket as cancelled but may not resolve or approve cost
  and status in ('open','acknowledged','in_progress','awaiting_tenant','resolved','cancelled')
  and cost_approved_at is null
  and quoted_amount_kobo is null
);
```

The `with check` list is the crux. A tenant who crafts an update setting `status = 'closed'` or
`quoted_amount_kobo = 500000` finds no matching target rows, because the resulting row would violate the
check.

### 4.8 `notices`

```sql
create policy notices_select_recipient on public.notices
for select to authenticated
using (
  private.has_permission('notice_read_own')
  and recipient_user_id = auth.uid()
  and status in ('sent','delivered')     -- no draft or queued notices are visible
);

create policy notices_select_staff on public.notices
for select to authenticated
using ( private.has_permission('notice_send') );

-- No insert policy. Notices are created by services running as service_role.
```

### 4.9 `audit_log`, `outbox_events`, `webhook_events`

```sql
create policy audit_log_select_staff on public.audit_log
for select to authenticated
using ( private.has_permission('audit_read') );
-- No insert, update or delete policy for any client role.
-- capture_audit() is security definer and owned by postgres; it inserts regardless of caller RLS.

-- outbox_events, webhook_events, job_runs and feature_flags have no policies at all.
-- Not even a select policy. service_role bypasses RLS; clients get nothing.
```

A user cannot read their own audit history to discover what staff did about them. Staff read everything.
That is the correct default for an audit log.

`job_runs` and `feature_flags` are service-role only for the same reason: a tenant must not be able to see
which scheduled jobs ran, and the flag table reveals which subsystems are currently disabled. Both are read
through `security definer` functions — `private.flag_enabled(key)` for flags, and the observability queries
for `job_runs` — so no client needs a grant on either table.

### 4.10 `saved_searches` and `admin_filter_views`

```sql
create policy saved_searches_own on public.saved_searches
for all to authenticated
using ( user_id = auth.uid() )
with check ( user_id = auth.uid() );

create policy filter_views_select on public.admin_filter_views
for select to authenticated
using ( private.has_permission('client_filter_manage') and (is_shared or owner_id = auth.uid()) );

create policy filter_views_manage on public.admin_filter_views
for all to authenticated
using ( private.has_permission('client_filter_manage') and owner_id = auth.uid() )
with check ( private.has_permission('client_filter_manage') and owner_id = auth.uid() );

create policy filter_views_delete_shared_admin on public.admin_filter_views
for delete to authenticated
using ( private.has_permission('settings_manage') and is_shared );
```

### 4.11 Summary of which roles can mutate what

| Table | tenant | buyer | landlord | admin | notes |
|---|:---:|:---:|:---:|:---:|---|
| `properties` | | | own draft | any | owners may not publish |
| `property_media` | | | own | any | |
| `land_details` | | | own | any | |
| `units` | | | own | any | no delete |
| `owners` | | | own | any | |
| `paystack_accounts` | | | own | any | payout triggers only staff |
| `contracts` | | | | any | read-only for everyone else |
| `contract_parties` | | | | any | |
| `contract_schedule` | | | | any | generated, never hand-edited by a tenant |
| `contract_events` | | | | read | append-only, service_role only |
| `unit_occupancies` | | | own | any | |
| `payment_intents` | own, `created` only | own | own | any | |
| `payments_ledger` | read | read | read | any | **no client writes** |
| `ledger_allocations` | read own | read own | read own | any | **no client writes** |
| `payouts` | | | read own | any | |
| `refunds` | | | | any | |
| `maintenance_tickets` | own, limited | | own | any | |
| `ticket_updates` | own | | own | any | `internal` visibility staff-only |
| `notices` | read own | read own | read own | any | **no client writes** |
| `disputes` | own | own | own | any | |
| `documents` | read released | read released | read own | any | |
| `document_access_log` | | | | read | **service_role writes only** |
| `saved_searches` | own | own | own | any | |
| `admin_filter_views` | | | | any | |
| `audit_log` | | | | read | **service_role writes only** |
| `outbox_events` | | | | | **no policies at all** |
| `webhook_events` | | | | | **no policies at all** |
| `job_runs` | | | | | **no policies at all** |
| `feature_flags` | | | | | **no policies at all**, read via `private.flag_enabled` |
| `idempotency_keys` | own read | own read | own read | own read | service_role writes |
| `sale_allocations` | read own | read own | own | any | |

## 5. Privileged paths

Some operations legitimately bypass RLS. Each is enumerated so the bypass surface stays auditable.

| Path | Mechanism | Justification | Guardrail |
|---|---|---|---|
| Background jobs | `adminDb` from `packages/db/adminClient` (`service_role`) | A job has no user identity. The nightly arrears scan must see every contract. | Import is restricted to `apps/api/src/db/admin.ts` and `apps/api/src/jobs/**`. CI greps for other importers. |
| Webhook processing | Same `adminDb` | The Paystack webhook arrives with no user identity. | Signature verification before any `adminDb` call. |
| Reconciliation | Same `adminDb` | Must compare the ledger against Paystack's records. | |
| File delivery | Cloudinary signed URLs, not RLS | RLS governs the `documents` row, not the file bytes. | Every signed URL is minted server-side after an RLS-scoped read of the row, with a 5-minute expiry, and writes a `document_access_log` row. |
| Analytics | `adminDb` | | Aggregates only. No per-user rows. |

**The rule: `adminDb` is never used to serve a request that carries a user identity.** If a handler has
`req.auth.userId`, it uses `withRls`. This is checkable: a lint rule flags `adminDb` inside a file under
`routes/` that also references `req.auth`.

## 6. Testing as a role

RLS is only as good as its tests. pgTAP sets the GUCs directly, which is the same mechanism the API uses.

```sql
-- Impersonating a tenant with a specific role claim
set local role authenticated;
select set_config('request.jwt.claim.sub', '<uuid>', true);
select set_config('request.jwt.claims',
  '{"sub":"<uuid>","role":"authenticated",
    "app_metadata":{"courtland_roles":["tenant"]}}', true);

select results_eq($$ select count(*)::text from public.contracts $$,
                  ARRAY['1'], 'tenant sees only their contract');
```

The API has the equivalent helper, which is what the integration tests use:

```ts
await withRls(db, { userId: tenantA.id, roles: ['tenant'] }, (tx) =>
  tx.select().from(contracts),
)
```

Three layers of test, and all three are required:

| Layer | Tool | Asserts |
|---|---|---|
| Policy semantics | pgTAP, `supabase/tests/*_rls.test.sql` | Allow and deny, per operation, per role, per table. |
| API behaviour | Vitest + supertest, `apps/api/test/integration/` | That the route returns 403 where the policy says it should, and 200 where it should not. |
| UI behaviour | Playwright, `apps/admin/e2e/` | That the navigation hides what the user cannot do. Never the primary control. |

## 7. JWT staleness and revocation

A JWT is a snapshot. A role revoked at 10:00 is still present in a token issued at 09:30. Three mechanisms
close the gap.

| Mechanism | Effect | Latency |
|---|---|---|
| Short JWT expiry (1 hour) | A revoked role disappears when the token refreshes | ≤ 1 hour |
| `refreshSession()` after a role change | The API forces a token refresh for the affected user | Seconds |
| `expires_at` on `user_roles` | An expired grant is ignored even if the token still carries it | Immediate |

`expires_at` is the important one and is why the column exists. A temporary role grant — an agency
managing a property for six months, a consultant with elevated access — carries an expiry. After it, the
token may still list the role but `private.has_role` filters on `expires_at > now()`.

For immediate revocation of a compromised staff account:

```sql
-- 1. Expire the role immediately
update public.user_roles set expires_at = now() where user_id = $1 and role = 'admin';
-- 2. Force every existing token to be rejected
update auth.users set session_version = session_version + 1 where id = $1;
-- 3. Revoke all refresh tokens
--    supabase.auth.admin.signOut(userId, 'global')
```

Step 2 depends on the custom access token hook including a `session_version` claim that the hook
validates against `auth.users`. That hook is configured in Phase 4.

## 8. Authorisation in the admin UI

`apps/admin/src/providers/accessControlProvider.ts` mirrors the same matrix, sourced from
`@courtland/types/permissions` so there is one list.

```ts
export const accessControlProvider = {
  can: async ({ resource, action }) => {
    const permission = RESOURCE_PERMISSIONS[resource]?.[action]
    return permission ? currentPermissions().includes(permission) : false
  },
  options: { buttons: { enableAccessControl: true, hideIfUnauthorized: true } },
}
```

`RESOURCE_PERMISSIONS` maps Refine's `(resource, action)` pairs to Courtland permissions. It is a
**complete** map: every resource has an entry for every action. A pgTAP-adjacent unit test asserts the map
covers all 56 permissions with no gaps, so adding a permission without a UI mapping fails CI.

The admin's navigation is generated from `resources.ts`, filtered by the resource's minimum permission.
A staff member without `payout_approve` does not see the Payouts item. This is convenience, not security.

## 9. Review checklist for any new table

Before a table ships:

1. RLS enabled.
2. One policy per operation, `to` specified.
3. `using` on select/update/delete; `with check` on insert/update.
4. Every filter column indexed, leading column of a btree.
5. Grants: revoke from `anon` and `authenticated`, grant back only what is needed.
6. A pgTAP test asserting **both** allow and deny, for every role that could plausibly try.
7. A row in `packages/types/src/permissions/matrix.ts` if it needs a permission.
8. A row in the §4.11 summary table above, so the next reader knows it was considered.

`supabase/tests/platform_rls.test.sql` additionally asserts that no table in `public` is missing RLS, and
that no table has a client-granted privilege it has no policy for. Both queries run in CI.

## 10. Related documents

- Role and permission source: `packages/types/src/permissions/matrix.ts`
- Schema, grants and views: [`05-database-schema.md`](./05-database-schema.md)
- Identity and sessions: [`06-authentication.md`](./06-authentication.md)
- Test detail: [`20-testing.md § Database tests`](./20-testing.md#5-database-tests-pgtap)
- API guards: [`08-api-design.md § Middleware`](./08-api-design.md#5-middleware-chain)
