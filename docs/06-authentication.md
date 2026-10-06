# 06 — Authentication

Courtland's authentication is Supabase Auth with **phone OTP as the primary method** and email magic link
as the secondary. There is no password anywhere in the system.

## 1. Why OTP-first

| Reason | Detail |
|---|---|
| Target user behaviour | Tenants, buyers and small landlords transact on mobile, often on prepaid data with intermittent connectivity. A password they must remember and reset is a support burden and a conversion loss. |
| Credential handling | No password database means no password breach, no reset-token table, no breached-credential reuse across services. |
| Fraud resistance | OTP is tied to a SIM. That is not strong identity verification, but it is materially better than a self-chosen password. |
| Staff | Staff use email magic link. Courtland staff are employees with corporate accounts; a password manager and a second factor are appropriate for them. |
| Landlord onboarding | A landlord registering a property may not have a portal account yet. Staff create the account and invite by phone; the owner enters with OTP and links their identity. See §6. |

## 2. Methods and configuration

| Method | Roles | Configured | Fallback |
|---|---|---|---|
| Phone OTP, SMS | tenant, buyer, landlord | Yes. Default for portal users. | Email magic link if the profile has a verified email. |
| Phone OTP, WhatsApp | tenant, buyer, landlord | Yes, when the provider supports it. Opt-in per user. | SMS. |
| Email magic link | admin (required), all roles (optional) | Yes. | Phone OTP. |
| Email OTP (6-digit) | all roles | Yes, as an alternative to magic link on flaky connections. | — |
| Google OAuth | none in v1 | No | — |
| Password | **never** | Disabled at the provider level | — |

Email/password signups are disabled at the **Supabase project level**, not just hidden in the UI. Hiding
the signup form is a velvet rope; anyone with devtools can POST to `/auth/v1/signup` directly. Accounts
are created by the API using the service role after a business rule approves it.

### 2.1 OTP mechanics

Supabase's defaults, which Courtland keeps:

| Setting | Value | Why |
|---|---|---|
| OTP length | 6 digits | Platform default. |
| Request cooldown | 60 seconds | Prevents SMS-bombing. Enforced by Supabase and mirrored by an API rate limiter. |
| OTP lifetime | 1 hour | Platform default. |
| Session lifetime | 7 days for phone OTP, 1 hour by default otherwise | Configured in Supabase Auth settings. |

Session configuration:

| Setting | Value |
|---|---|
| `sessions.timebox` | 1 hour (forces refresh) |
| `sessions.inactivity_timeout` | 24 hours |
| JWT expiry | 1 hour |
| Refresh token rotation | On |

A one-hour JWT with rotation means a role change is reflected within an hour even if the token is not
explicitly refreshed. Combined with the `refreshSession()` call after a role change in
[`07-authorization-and-rls.md § Staleness`](./07-authorization-and-rls.md#7-jwt-staleness-and-revocation),
the practical window is seconds.

## 3. The SMS provider, behind a hook

Supabase's built-in SMS sending is replaced with a **Send SMS hook**. Courtland deploys an endpoint that
receives `{ user, sms: { otp, phone } }` and sends the message through a Nigerian provider.

```
User → Supabase GoTrue → POST /auth/v1/otp
   → GoTrue validates rate limits, generates the OTP
   → POST to the configured Send SMS hook URL
        → apps/api POST /v1/integrations/sms/outbound
           (authenticated by the hook's bearer secret)
           → apps/api/src/integrations/sms/send.ts
              → provider: twilio | msg | termii | sendchamp | mock
           → 200
   → GoTrue returns success to the user
```

Why the hook rather than configuring a provider in the Supabase dashboard:

1. **Provider choice is ours.** Nigerian SMS delivery from an international sender ID is unreliable.
   Switching from Twilio to a local aggregator must not require touching auth configuration or
   re-verifying anything.
2. **Template control.** The hook owns the message body, so the OTP template is a versioned file in the
   repository with review, not a dashboard field.
3. **Delivery telemetry.** Every send is logged with the provider message id, which we store and use to
   correlate a "code not received" support ticket with an actual carrier rejection.
4. **Fallback chains.** The hook can try the primary provider, then a fallback, and report which one
   worked, so the send-success rate is a real metric.

The hook endpoint is authenticated by a shared secret in `SMS_HOOK_SECRET`, is not under `/v1`, and is not
exposed in CORS. It accepts only `{ user, sms }`, validates that the phone matches E.164 `+234`, and
never logs the OTP.

### 3.1 The OTP message

```
Courtland: 482913
Your verification code. Valid for 60 minutes.
Do not share this code with anyone.
```

No property names, no amounts, no balances. An OTP that leaked in a screenshot should not leak a tenant's
rent obligation.

### 3.2 Local and staging

`SMS_PROVIDER=mock`. The mock provider logs the OTP to stdout and returns success. `supabase status`
prints the local phone for each seed user, and the local mock provider accepts any 6 digits. Staging uses
a real provider so the delivery path is genuinely exercised before production.

## 4. Sign-in flows

### 4.1 Phone OTP

```
Screen: /auth/sign-in
1. User enters a Nigerian phone number.
   Validation runs client-side and server-side: normalise to E.164, reject non-+234.
   "Use email instead" is offered if the input contains '@'.
2. POST /v1/auth/otp/request  { identifier: '+2348012345678' }
   API:
     a. rate limit: 3 requests per number per hour, 10 per IP per hour  (Redis-backed)
     b. look up the number in profiles
          - unknown number → 404 with code 'no_account'
            The UI routes to /auth/onboarding?intent=signup
          - known → proceed
     c. supabase.auth.signInWithOtp({ phone, channel: 'sms' | 'whatsapp' })
     d. return { sent: true, channel, expiresInSeconds: 3600 }
   HTTP 200 even for an unknown number would avoid account enumeration, BUT the product needs the
   onboarding path, so Courtland accepts the enumeration trade-off deliberately and documents it.
   Mitigation: the response is rate limited and the number of enumerable outcomes is two.
3. Screen: /auth/verify
   User enters the 6-digit code.
4. POST /v1/auth/otp/verify  { identifier, token }
   API:
     a. supabase.auth.verifyOtp({ phone, token, type: 'sms' })
     b. on success: build the cookie set from the returned session and attach it with
        Set-Cookie: name sb-<ref>-auth-token; HttpOnly; Secure; SameSite=None; Path=/; Domain=.courtland.com.ng
        (@supabase/ssr createServerClient writes exactly these attributes through its cookie adapter)
     c. also issue a CSRF cookie for the browser path, see 08 § 5.1
     d. ensure the profiles row exists (the auth.users trigger does this, but the API
        verifies and creates defensively in case the trigger was added after an account existed)
     e. load roles from user_roles into app_metadata if missing
     f. update profiles.last_seen_at
     g. return { user: profile, roles: string[], redirectTo: '/portal/<role>' }
```

The API sets the session cookies itself rather than returning the tokens to the browser. This means the
access token never enters client JavaScript, so it cannot be read from `localStorage` and cannot leak
through an XSS payload beyond the cookie's own protections.

`SameSite=None` is required, not preferred: `courtland.com.ng` and `api.courtland.com.ng` are different
sites, so a `Lax` cookie would never be sent on the cross-site fetch that Client Components make. The
attributes are hardened instead — `HttpOnly`, `Secure`, `__Host-`-style `Domain=.courtland.com.ng` with
`Path=/`, no `Expires` beyond the Supabase session expiry — and the CSRF defence in
[`08 § 5.1`](./08-api-design.md#51-csrf) carries the weight that `SameSite=Lax` would otherwise have carried.

### 4.2 Email magic link

Identical shape, with `identifier` being an email. Used by staff. After verifying the link, Supabase
redirects to `/auth/callback`, which exchanges the code for a session and the API sets cookies.

### 4.3 WhatsApp OTP

Only available when `SMS_PROVIDER` is Twilio (WhatsApp templates are a Twilio Verify feature). The
channel selector appears on `/auth/sign-in` only when the build flag `NEXT_PUBLIC_ENABLE_WHATSAPP_OTP` is
true, so a provider without WhatsApp support never shows an option that will fail.

## 5. Account lifecycle

### 5.1 Creation

Every account is created through one of four paths. All four use the service role.

| Path | Who initiates | Role assigned | Notes |
|---|---|---|---|
| Self sign-up | Prospective tenant or buyer on `/auth/onboarding` | `tenant` or `buyer` chosen by the user | `supabase.auth.admin.createUser({ phone, phone_confirm: false })`, then send an OTP. Email signups are disabled at the project level. |
| Staff invite | Courtland staff | Any | `supabase.auth.admin.createUser` then `supabase.auth.admin.generateLink({ type: 'magiclink' })` delivered by Resend. |
| Owner onboarding | Staff, during property submission | `landlord` | The owner may not have an account. Staff create it and invite. `owners.user_id` links to it. |
| Imported | Migration from a spreadsheet | Varies | One-off script, `apps/api/src/bin/import-owners.ts`. |

In every path, the `handle_new_user()` trigger on `auth.users` creates the `profiles` row, and the same
transaction creates a default role grant if the path does not specify one.

### 5.2 The signup trigger

```sql
create or replace function private.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  wanted text[];
begin
  insert into public.profiles (id, phone_e164, email)
  values (new.id, new.phone, new.email)
  on conflict (id) do nothing;

  -- Roles requested at creation time, else the default. The API cannot insert a role first:
  -- user_roles.user_id references auth.users(id), so there is no id to insert against until GoTrue
  -- has written the user, and by then this trigger has already run inside the same transaction.
  -- The request therefore travels in app_metadata and is read here, once, at creation.
  wanted := coalesce(
    (select array_agg(r::public.app_role)
       from jsonb_array_elements_text(coalesce(new.raw_app_meta_data->'courtland_roles', '[]'::jsonb)) r),
    array['tenant'::public.app_role]);

  insert into public.user_roles (user_id, role)
  select new.id, unnest(wanted)
  on conflict do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();
```

`app_metadata`, not `user_metadata`. A user can rewrite their own `user_metadata` through `updateUser`, so a
trigger that trusted it would hand anyone the `admin` role by calling one endpoint; only the service role can
set `app_metadata`, and the API sets it explicitly when it creates a user on someone's behalf. This is the only
place in the codebase that reads `raw_app_meta_data`, and the reason is recorded here so nobody "simplifies"
it later.

An unknown role name raises `invalid input value for enum app_role`, which fails the signup rather than
silently granting nothing. That is the right direction to fail: a staff member inviting an owner with a typo
must see the error, not create a user with no role who then sees an empty portal and reports that Courtland is
broken.

`security definer` is required: without it the trigger runs as `supabase_auth_admin`, which has no write
access to `public`. `set search_path = ''` closes the search-path injection attack that `security definer`
otherwise opens, and every reference inside the function is schema-qualified.

The Supabase docs now also document the alternative of granting `supabase_auth_admin` an insert policy on
`user_roles` and dropping `security definer` entirely. That is the better choice for a new project
because it shrinks the function-privilege surface. **Courtland uses `security definer`** for compactness and
documents the alternative here so the trade-off is visible. Either way the table, the policies, the
function and the trigger ship in **one migration** — splitting them creates a window where a user exists
in `auth.users` with no `profiles` row and no role, which is undetectable from the frontend because the
session looks valid.

### 5.3 Roles are additive

A user may hold several roles simultaneously. The common cases:

- A landlord who also rents out one unit they live in.
- A buyer who is also a tenant.
- Staff who are also a buyer for personal property.

Role selection at onboarding is multi-select. The `user_roles` table has one row per role and
`onboarding_state` records whether the user has finished choosing.

### 5.4 Deactivation and deletion

| Action | Mechanism | Effect |
|---|---|---|
| Deactivate | `user_roles.expires_at = now()` on the role, or `profiles.deleted_at` | Portal access ends at the next token refresh. Existing contracts are untouched: a landlord who stops being a landlord still has assets. |
| Suspend | A `user_roles` row removed plus `profiles.deleted_at` set | Cannot sign in. Ledger, contracts and documents persist. |
| Delete | Never | `auth.users` rows for anyone with a contract are never deleted. `on delete restrict` on `contracts.primary_payer_id` and `payments_ledger.payer_id` enforces this at the database level. |

A GDPR-style erasure request is handled by anonymising the profile: `full_name` → `'Erased'`, email and
phone nulled, avatar cleared. The ledger and contract records stay, because financial and tenancy records
carry a statutory retention requirement. See [`25-nigeria-compliance.md § Data protection`](./25-nigeria-compliance.md#5-data-protection-ndpa-2023).

## 6. Linking an existing account to an owner record

A landlord applying to have Courtland manage a property may already have a tenant portal account.

```
1. Staff creates the owner record with user_id = null, status in_review.
2. Staff attaches the application to the applicant's phone number.
3. POST /v1/auth/otp/request for that number succeeds because the account exists.
4. On first authenticated API call, the API checks:
     select o.* from owners o
     where o.pending_user_phone = $1 and o.user_id is null
   If found: sets owners.user_id = auth.uid(), grants the 'landlord' role,
             grants the 'owner_manage' permission, invalidates the session token so the new
             role appears immediately.
5. The owner sees their assets on next login.
```

`owners.pending_user_phone` is a separate, nullable column from the owner's own contact phone, so linking
does not conflate "the phone I gave you for payouts" with "the phone I log in with".

## 7. Sessions across the three frontends

One rule decides all of it: **a token never reaches browser JavaScript**. A session is an `HttpOnly` cookie,
the API reads that cookie, and a client component that needs data gets it from a Server Component or a
Server Action. `@supabase/ssr` exists to make that possible; it is not a convenience.

| Surface | Session storage | How it calls the API | Refresh mechanism |
|---|---|---|---|
| `apps/web` | `HttpOnly` cookies via `@supabase/ssr`, domain-wide so `api.courtland.com.ng` receives them | Server Components and Route Handlers forward the incoming cookie, plus `credentials: 'include'` from a Client Component | `apps/web/proxy.ts` refreshes when the token is within 60 seconds of expiry, on every matched request |
| `apps/admin` | Same cookies, same attributes, `admin.courtland.com.ng` | `fetch` in the auth provider and api-client sends `credentials: 'include'` | `apps/admin/src/providers/authProvider.ts` calls `supabase.auth.getSession()` on load and `refreshSession()` on a 60-second timer while the tab is visible |
| `apps/api` | None. It holds no sessions and stores no tokens; it reads the cookie or the `Authorization` header and verifies each request | — | Stateless. Refresh is the client's job, and a failed refresh is a `401` |

The API accepts two credentials, in this order, and both resolve to the same `req.auth`:

1. **Cookie** — `sb-<ref>-auth-token`, the browser path. Also requires the CSRF header on unsafe methods;
   see [`08 § 5.1`](./08-api-design.md#51-csrf).
2. **`Authorization: Bearer`** — the machine path: Inngest, the Supabase Edge functions, the Render cron
   endpoint, Resend and Paystack webhooks, `curl` in a runbook.

Conflating the two is how CSRF bugs get in. A cookie is attached by the browser whether or not the
application wants it, so any cross-site page can make an authenticated `POST`. A bearer header cannot be,
so bearer callers need no CSRF defence — but a bearer token in browser JavaScript is readable by any XSS
payload, which is the worse of the two failures. So: browsers get cookies plus CSRF tokens, machines get
bearer tokens, and neither gets both.

`proxy.ts` performs four jobs and nothing else:

1. Refresh the Supabase session if it is near expiry.
2. Redirect `/portal/*` to `/auth/sign-in` when there is no session.
3. Redirect a signed-in user away from `/auth/*` to their portal.
4. Attach `x-request-id` for traceability.

It does **not** fetch data, does not decide authorisation, and does not touch Postgres. Authorisation is
RLS plus the API. The proxy exists only so the browser experience is smooth.

## 8. Securing the portal routes

Three layers, and all three are required:

| Layer | Mechanism | Protects against |
|---|---|---|
| Edge | `apps/web/proxy.ts` redirect when no session | A user landing on `/portal/tenant` with no session sees a sign-in page, not a broken dashboard. |
| API | Every portal route handler calls `requirePermission` | A user who hand-writes the URL and calls the API directly is rejected. |
| Database | RLS on every portal-scoped table | A bug in the API layer still cannot return another tenant's data. |

The proxy is UX. The API and RLS are security. If the proxy is ever bypassed or removed, the system is
still safe; the user just sees an error instead of a redirect.

## 9. Admin authentication is stricter

Courtland staff get more than the portal baseline.

| Control | Implementation |
|---|---|
| Email required | An `admin` role without a verified email cannot sign in. Enforced in `POST /v1/auth/otp/verify`: a session whose only role is `admin` and whose email is unverified is rejected. |
| MFA | Phone OTP as a second factor, enrolled at first admin login. `supabase.auth.mfa.enroll({ factorType: 'phone' })`. |
| Session length | 8 hours maximum, versus 7 days for tenants. |
| Device logging | Every admin login writes an `audit_log` row with ip and user agent. |
| Admin creation | Only an existing admin can grant the `admin` role. There is no self-service path and no seed script that grants admin outside of `supabase/seed.sql`. |

The MFA enrolment prompt lives at `/admin/onboarding` and is the first route a new admin sees. It cannot be
skipped: `apps/admin/src/App.tsx` wraps the admin route tree in a check for an enrolled factor.

## 10. Rate limits and abuse prevention

Enforced at three layers.

| Layer | Scope | Limit | Store |
|---|---|---|---|
| Supabase Auth | Per number | 3 OTP requests per hour | Internal |
| API `rateLimit.auth` | Per number and per IP | 3/hour per number, 10/hour per IP, 30/day per IP | Redis when multi-instance, memory when single |
| API `rateLimit.otpVerify` | Per IP | 10 attempts per 15 minutes | Same |

Verify attempts are also counted per issued OTP. After five wrong codes the OTP is invalidated and a new
one must be requested. This is enforced by Supabase plus an API-side counter keyed on the OTP's own
identifier, not just the IP, so an attacker rotating IPs cannot brute-force a single code.

`apps/web` additionally shows a CAPTCHA challenge on the sign-in screen after three failures in a session.
The challenge is client-side-only friction, not a security control; the rate limit is the control.

## 11. What is explicitly not done

| Not done | Why |
|---|---|
| Passwords, anywhere | Supabase email/password signups are disabled at the project level. No password field exists in any Courtland form. |
| Social login | Google OAuth adds a Google dependency and a redirect surface for a market where phone-first is the norm. Revisit if staff onboarding becomes a bottleneck. |
| JWT stored in `localStorage` | XSS-readable. Sessions are HTTP-only cookies; the access token is never in client JavaScript. |
| Self-service role elevation | No API route grants a role to the calling user. Role changes are admin-only, audited, and require a reason. |
| Authorisation from `user_metadata` | `user_metadata` is user-writable via `updateUser`. Reading a role from it is a privilege-escalation hole. Courtland reads `app_metadata` and hook-injected claims only. The one exception is the signup trigger, which reads `raw_app_meta_data` — service-role-writable — and only once, at creation. |
| A bearer token in the browser | Browsers authenticate with the session cookie plus a CSRF token. `Authorization: Bearer` exists for Inngest, the Edge functions, the cron endpoint and webhooks, which have no cookie jar and cannot be attacked by a form post. See [`08 § 5.1`](./08-api-design.md#51-csrf). |

## 12. Related documents

- Role→permission matrix and RLS: [`07-authorization-and-rls.md`](./07-authorization-and-rls.md)
- OTP endpoints and their schemas: [`08-api-design.md § Auth routes`](./08-api-design.md#auth)
- Environment variables for providers: [`22-configuration-and-environments.md`](./22-configuration-and-environments.md)
- Key handling and rotation: [`19-security.md § Secret containment`](./19-security.md#6-secrets)
