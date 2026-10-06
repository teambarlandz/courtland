# 17 — Frontend: admin

`apps/admin` is the Refine application for Courtland staff. It is a Vite SPA behind Vercel, authenticated
with Supabase email magic link plus MFA, and scoped by the same permission matrix the API enforces.

## 1. Stack

| Concern | Choice | Why |
|---|---|---|
| Build | Vite 7 | Faster than webpack on a 400-file app, and no server runtime to pay for |
| Framework | React 19 | Shared with the web app |
| Framework | Refine 5 + `@refinedev/react-router@^2` on `react-router@^7` | CRUD scaffolding that matches the shape of the domain |
| Data | `@tanstack/react-query` via Refine's data provider | Caching, invalidation, optimistic updates |
| Auth | Refine `authProvider` over `@supabase/supabase-js` | Email OTP, MFA |
| Access control | Refine `accessControlProvider` | Hides what the user cannot do |
| UI | `@courtland/ui` | Same components as the portals, so a table looks the same everywhere |
| Forms | Refine `useForm` + Zod | Schema shared with the API |
| Charts | Recharts | Bundle size and simplicity |
| Tables | Refine's `useTable` over TanStack Table v8 | Sorting, filtering, pagination |

Refine 5's core packages and the separate router adapters are versioned independently, which is why the
dependency list pins both `@refinedev/core@^5` and `@refinedev/react-router@^2`. The upgrade policy in
[`03-technology-stack.md`](./03-technology-stack.md) tracks both.

## 2. Resources

One Refine resource per entity the staff manage. Each maps to an API endpoint, a list route, and a set of
permissions.

| Resource | Endpoint | Route | Permission to view |
|---|---|---|---|
| `dashboard` | `/v1/admin/dashboard` | `/dashboard` | `admin_dashboard_read` |
| `properties` | `/v1/properties` | `/properties` | `property_read_any` |
| `property-submissions` | `/v1/properties?status=in_review` | `/properties/submissions` | `property_publish` |
| `owners` | `/v1/owners` | `/owners` | `owner_read_any` |
| `kyc-reviews` | `/v1/owners?kycStatus=pending` | `/kyc` | `owner_kyc_approve` |
| `units` | `/v1/properties/:id/units` | `/properties/:id/units` | `unit_update_any` |
| `contracts` | `/v1/contracts` | `/contracts` | `contract_read_any` |
| `payments` | `/v1/payments` | `/payments` | `payment_read_any` |
| `reconciliation` | `/v1/payments/reconciliation` | `/payments/reconciliation` | `payment_read_any` |
| `payouts` | `/v1/payouts` | `/payouts` | `payout_approve` |
| `payout-runs` | `/v1/payouts/runs` | `/payouts/runs` | `payout_approve` |
| `payout-accounts` | `/v1/owners/:id/payout-accounts` | `/payout-accounts` | `owner_read_any` |
| `tickets` | `/v1/tickets` | `/maintenance` | `ticket_read_any` |
| `documents` | `/v1/documents` | `/documents` | `document_read_any` |
| `notices` | `/v1/notices` | `/notices` | `notice_send` |
| `disputes` | `/v1/disputes` | `/disputes` | `dispute_read_any` |
| `audit-log` | `/v1/admin/audit` | `/audit` | `audit_read` |
| `users` | `/v1/admin/users` | `/users` | `user_manage` |
| `filter-views` | `/v1/admin/filter-views` | `/settings/filter-views` | `client_filter_manage` |

Twenty resources. `verify-resource-coverage.ts` in the API asserts every one of these has a registered
endpoint with valid permissions, so a resource cannot point at an endpoint that does not exist or a
permission that is not in the matrix.

## 3. The data provider

Refine's data provider is the only place `apps/admin` touches the API.

```ts
// apps/admin/src/providers/dataProvider.ts
import { dataProvider } from '@refinedev/core'
import { httpClient } from '@courtland/api-client'

export const courtlandDataProvider = dataProvider({
  apiClient: httpClient({
    baseUrl: env.COURTLAND_API_URL,
    // The admin is a browser: cookies, never a token in JavaScript. See 08-api-design.md § 5.1.
    auth: 'cookie',
    getCsrfToken: () => readCookie('courtland-csrf'),
    onUnauthorized: () => supabase.auth.signOut(),   // refresh failed; session is gone
  }),
  naming: {
    singular: 'Property',
    plural: 'Properties',
    prefetchGetList: true,
    prefetchGetOne: false,
    getList: 'getMany',
  },
  httpClient,
})
```

`onUnauthorized` matters: a 401 means the refresh token is dead, and the only correct response is to sign
out and route to sign-in. Without it, a user with an expired session sees a spinner that never resolves.

## 4. The auth provider

```ts
// apps/admin/src/providers/authProvider.ts
export const courtlandAuthProvider = {
  login: async ({ providerName }) => {
    if (providerName === 'email') {
      const { error } = await supabase.auth.signInWithOtp({ email: currentEmail, emailRedirectTo: `${origin}/auth/callback` })
      if (error) throw error
      return { success: true, redirectTo: '/auth/verify-email' }
    }
    throw new Error(`unsupported provider: ${providerName}`)
  },
  logout: async () => { await supabase.auth.signOut() },
  check: async () => {
    const { data } = await supabase.auth.getSession()
    return { authenticated: !!data.session, redirectTo: data.session ? null : '/auth/sign-in' }
  },
  onError: async (error) => {
    if (error.status === 401) return { logout: true, redirectTo: '/auth/sign-in', error: error.message }
    return { error: error.message }
  },
  getPermissions: async () => {
    const { data } = await supabase.auth.getUser()
    return fetchPermissions()                          // cookie, from /v1/auth/me
  },
  getIdentity: async () => {
    const { data } = await supabase.auth.getUser()
    return fetchProfile()                              // cookie, from /v1/auth/me
  },
}
```

Refine calls `getPermissions` once per session and caches it. The admin's navigation and buttons read from
that. A permission change takes effect on the next page load, not mid-session; for staff, that is
acceptable and is noted in the security doc.

## 5. MFA

Refine has no MFA primitive, so it is explicit in the router.

```tsx
// apps/admin/src/App.tsx
<BrowserRouter>
  <Routes>
    <Route path="/auth/*" element={<AuthRoutes />} />
    <Route path="/mfa/enrol" element={<MfaEnrol />} />
    <Route
      path="/*"
      element={
        <Authenticated>
          <MfaRequired>
            <Refine resources={resources} providers={providers}>
              <Routes>{adminRoutes}</Routes>
            </Refine>
          </MfaRequired>
        </Authenticated>
      }
    />
  </Routes>
</BrowserRouter>
```

`MfaRequired` checks `supabase.auth.mfa.listFactors()`. A factorless admin session redirects to
`/mfa/enrol` and the admin route tree is not rendered. This is UI, so it is not the control; the API
independently rejects an MFA-less admin on the actions that require it, and
[`06-authentication.md`](./06-authentication.md#9-admin-authentication-is-stricter) records the server-side
rule.

## 6. Access control

```ts
// apps/admin/src/providers/accessControlProvider.ts
export const accessControlProvider: AccessControlProvider = {
  can: async ({ resource, action }) => {
    const permission = RESOURCE_PERMISSIONS[resource]?.[action]
    if (!permission) return false
    return currentPermissions.includes(permission)
  },
  options: {
    buttons: { enableAccessControl: true, hideIfUnauthorized: true },
    table: { canDelete: false },            // nothing is deleted from a list view
  },
}
```

`RESOURCE_PERMISSIONS` is a complete map from `(resource, action)` to a permission, and a unit test asserts
every permission in the matrix appears in it. A missing entry returns `false`, so the failure mode of an
incomplete map is a hidden button rather than a visible button that 403s.

### 6.1 The map

```ts
export const RESOURCE_PERMISSIONS = {
  properties: {
    list: 'property_read_any', show: 'property_read_any', create: 'property_create',
    edit: 'property_update_any', delete: 'property_delete',
    publish: 'property_publish', reject: 'property_publish', withdraw: 'property_withdraw',
  },
  contracts: {
    list: 'contract_read_any', show: 'contract_read_any', create: 'contract_create',
    edit: 'contract_update', activate: 'contract_update', suspend: 'contract_suspend',
    terminate: 'contract_terminate', renew: 'contract_renew',
  },
  payments:   { list: 'payment_read_any', show: 'payment_read_any', refund: 'payment_refund', verify: 'payment_create_any' },
  payouts:    { list: 'payout_approve', show: 'payout_approve', approve: 'payout_approve', initiate: 'payout_initiate', run: 'payout_run' },
  tickets:    { list: 'ticket_read_any', show: 'ticket_read_any', edit: 'ticket_manage', approveCost: 'ticket_approve_cost' },
  documents:  { list: 'document_read_any', show: 'document_read_any', release: 'document_release' },
  kyc:        { list: 'owner_read_any', show: 'owner_read_any', approve: 'owner_kyc_approve' },
  users:      { list: 'user_manage', show: 'user_manage', edit: 'user_manage' },
  audit:      { list: 'audit_read', show: 'audit_read' },
  disputes:   { list: 'dispute_read_any', show: 'dispute_read_any', edit: 'dispute_resolve' },
  notices:    { list: 'notice_send', show: 'notice_send', create: 'notice_send' },
  // … every resource in §2
} as const
```

The distinction between `payout_approve` and `payout_initiate` is visible here and load-bearing: a staff
member who can approve a payout run cannot initiate the transfers.

## 7. Navigation

```tsx
const NAV: NavItem[] = [
  { name: '/dashboard', label: 'Dashboard', icon: HomeIcon, permission: 'admin_dashboard_read' },
  { group: 'Listings', permission: 'property_read_any', children: [
    { name: '/properties',        label: 'All properties' },
    { name: '/properties/submissions', label: 'Submissions' },
  ]},
  { group: 'People', children: [
    { name: '/owners', label: 'Owners',   permission: 'owner_read_any' },
    { name: '/kyc',    label: 'KYC',      permission: 'owner_kyc_approve' },
    { name: '/users',  label: 'Users',    permission: 'user_manage' },
  ]},
  { group: 'Leasing', children: [
    { name: '/contracts', label: 'Contracts', permission: 'contract_read_any' },
    { name: '/maintenance', label: 'Maintenance', permission: 'ticket_read_any' },
    { name: '/disputes',  label: 'Disputes', permission: 'dispute_read_any' },
  ]},
  { group: 'Money', children: [
    { name: '/payments', label: 'Payments', permission: 'payment_read_any' },
    { name: '/payments/reconciliation', label: 'Reconciliation', permission: 'payment_read_any' },
    { name: '/payouts', label: 'Payouts', permission: 'payout_approve' },
    { name: '/payout-accounts', label: 'Payout accounts', permission: 'owner_read_any' },
  ]},
  { group: 'Content', children: [
    { name: '/documents', label: 'Documents', permission: 'document_read_any' },
    { name: '/notices', label: 'Notices', permission: 'notice_send' },
  ]},
  { group: 'System', children: [
    { name: '/settings/filter-views', label: 'Saved filters', permission: 'client_filter_manage' },
    { name: '/audit', label: 'Audit log', permission: 'audit_read' },
  ]},
]
```

Navigation is filtered by permission before render. A staff member without `audit_read` has no Audit item
at all, not a disabled one, because a disabled item invites the question and the answer is always no.

## 8. Key screens

### 8.1 Dashboard

| Widget | Source |
|---|---|
| Counts: live listings, active contracts, arrears total, pending submissions, pending KYC | `/v1/admin/dashboard` |
| Arrears by property, top 10 | same |
| Payments today and this month | same |
| Pending actions: submissions to review, KYC to approve, tickets to triage, payouts awaiting approval | same |
| Reconciliation status from the last run | `/v1/payments/reconciliation` |

Cached for 60 seconds with TanStack Query. A dashboard that refetches on every render is a dashboard that
will hammer the API from ten staff members.

### 8.2 Property submission review

A split view: the listing as the public would see it, on the left; the review actions on the right.

```
Actions: Publish | Request changes | Reject
Publish requires: cover photo with alt text, a price, at least one unit or a land area,
                  no missing required fields. Missing items are listed as a checklist with links.
Request changes: a required note. The owner is notified with the note.
Reject: a required reason from a fixed list plus a free-text note.
```

The publish checklist is computed server-side by `GET /v1/properties/{id}/publish-readiness`, so the admin UI
does not reimplement the rules.

### 8.3 Contract detail

Tabs: parties, schedule, payments, documents, events, disputes.

The schedule tab shows the generated schedule and, where the contract is not yet `in_review`, allows
regeneration with the reason recorded. Once any row is paid, the edit control is gone and the tab shows
why: "The schedule is locked because payment 3 has been received. Use an adjustment."

The events tab is the audit trail, rendered as a timeline with actor, state, reason, and timestamp.

### 8.4 Payment detail

The ledger row, its allocations broken out by beneficiary, the Paystack reference, the DLR status, the
schedule rows it settled, and the refunds against it. Read-only except for refund, which is behind a
confirmation dialog that requires typing the amount.

### 8.5 Payout run

```
Runs list:   run id, period, total, allocations, status, created by, approved by, initiated at
Run detail:  per-owner amounts, eligibility skips with reasons, the approve button,
             the initiate button, per-transfer status
```

The approve button is disabled with an explanation when the current user created the run. The API refuses
the request too; the disabled state is so the user learns why without a failed request.

### 8.6 KYC review

Side-by-side: the uploaded ID on the left, the applicant's data and a checklist on the right. Approve,
reject with reasons, or request a specific missing item. Approval is recorded in the audit log with the
reviewer.

### 8.7 Audit log

Filterable by actor, action, entity, and date. Read-only, with no export button in v1, because an export is
a data-exfiltration path and the value is low for the current volume.

## 9. Layout

```
┌──────────────────────────────────────────────────────────┐
│ Sidebar (240px, collapsible to 64px)  │  Content         │
│  Courtland Admin                      │  ┌─────────────┐ │
│  ─────────────────                    │  │ Page title  │ │
│  Dashboard                            │  │ + actions   │ │
│  Listings ▸                           │  └─────────────┘ │
│  People ▸                             │                  │
│  Leasing ▸                            │  Filters         │
│  Money ▸                              │  ──────────      │
│  Content ▸                            │  Table           │
│  System ▸                             │                  │
│                                       │                  │
│ ─────────────                          │                  │
│ user@courtland.ng ▾                    │                  │
└──────────────────────────────────────────────────────────┘
```

The sidebar collapses to icons under 1280 px and is a drawer under 1024 px. Tables scroll horizontally
rather than collapsing columns, because a financial table with hidden columns is a misread table.

## 10. Performance

| Concern | Approach |
|---|---|
| Bundle | Route-level `React.lazy`, Recharts only on the dashboard |
| Tables | Server-side pagination and sorting; never fetch all rows |
| Filters | Debounced, and every filter is in the URL so a table view is shareable |
| Polling | Only where a live view is the point: reconciliation status and payout transfers, every 30 s. Nothing else polls |
| Cache | TanStack Query with `staleTime` 30 s, `gcTime` 5 min |
| Images | `thumb` transform in tables, `card_sm` in pickers |

## 11. Testing

| Level | Tool | Coverage |
|---|---|---|
| Unit | Vitest | `accessControlProvider`, `RESOURCE_PERMISSIONS` completeness, NAV filtering, formatters |
| Component | Vitest + Testing Library | Each page's loading, empty, error, and populated states |
| Integration | Vitest + MSW | Data provider against mocked API responses, including 403 and 422 |
| E2E | Playwright | Sign in with MFA, review a submission, approve a payout run, refund a payment, view the audit log |
| Permission | Playwright | A user without `payout_initiate` does not see the button; a forced API call still 403s |

The last row is the one that matters most: it asserts that the UI hiding a control is not the only control.

## 12. Dead-code rules

| Rule | Enforcement |
|---|---|
| Every resource has a route | `verify-resource-coverage.ts` |
| Every route has a resource | The reverse check |
| Every resource has a nav entry | Nav completeness test |
| Every permission in the matrix is mapped | `RESOURCE_PERMISSIONS` completeness test |
| No unused provider | Knip; an unused `accessControlProvider` method fails |
| No unused nav item | Nav entries with no route fail |
| No unused resource | A resource with no nav entry and no test fails |
| No unused chart | A Recharts import outside the dashboard fails |

## 13. Related documents

- Web app: [`16-frontend-web.md`](./16-frontend-web.md)
- Shared clients: [`18-api-clients-and-state.md`](./18-api-clients-and-state.md)
- Permissions: [`07-authorization-and-rls.md`](./07-authorization-and-rls.md)
- Endpoint coverage rule: [`08-api-design.md § Refine coverage`](./08-api-design.md#11-refine-resource-coverage)
