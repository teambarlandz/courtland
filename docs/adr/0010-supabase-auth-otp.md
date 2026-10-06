# ADR 0010: Supabase Auth with OTP, no passwords

- Status: Accepted
- Date: 2026-02-14
- Deciders: Founder, CTO

## Context

Courtland's users are tenants, buyers, and small landlords on mobile, frequently on prepaid data. Staff are
office employees with corporate accounts.

The authentication decision affects sign-up conversion, support load, credential security, and the shape of the
`users` table. The two realistic options are email and password, or phone and one-time code.

## Decision

**Supabase Auth** as the identity provider. **Phone OTP as the primary method** for tenants, buyers, and
landlords. **Email magic link or email OTP for staff**, with phone OTP as a mandatory second factor.

Email and password sign-ups are **disabled at the Supabase project level**, not just hidden in the interface.
There is no password column anywhere in Courtland.

| Role | Primary method | Second factor |
|---|---|---|
| Tenant, buyer, landlord | Phone OTP via SMS or WhatsApp | None |
| Admin (staff) | Email magic link | Phone OTP, mandatory |

Sessions are HTTP-only cookies. The access token never enters client JavaScript.

## Alternatives considered

**Email and password.** Rejected. Nigerian users on mobile are the core audience, and a password they must
create, remember, and reset is a support cost and a conversion loss. Passwords also mean a breach of stored
hashes, a reset-token table, and credential-stuffing exposure.

**Passwordless but email-first.** Rejected. Nigerian mobile numbers are near-universal and email addresses are
not. Making email the primary identifier excludes a large share of the market.

**Build our own authentication.** Rejected firmly. Session management, token rotation, rate limiting, and
revocation are security-critical and unforgiving, and Supabase provides them with immediate revocation through
`session_version`, which would take months to reproduce.

**Supabase Auth with a custom provider per environment.** Rejected. Four code paths for auth is four ways for
auth to differ between environments.

**WhatsApp OTP only.** Rejected. It needs template approval and Twilio Verify, and delivery is not
universally reliable. SMS remains the primary with WhatsApp as an opt-in alternative.

**Social login.** Rejected for v1. It adds a Google dependency and a redirect surface for a market where
phone-first is the norm. Revisit if staff onboarding becomes a bottleneck.

## Consequences

**Easier.** No password reset, no password breach, no breached-credential reuse. OTP is tied to a SIM, which
is not strong verification but is better than a self-chosen password. Sign-up is one screen and one code.
Revocation is immediate through `session_version`.

**Harder.** SMS delivery is unreliable and depends on aggregator and carrier behaviour, so it needs a provider
fallback chain and delivery-report tracking. OTP code entry is friction on a bad network, mitigated by a
WhatsApp option. Account enumeration is possible through the sign-up flow, which is an accepted, documented
trade-off because the product needs the onboarding route.

**Cost.** SMS costs per message, which is the largest variable cost in the system. A fallback provider chain
adds configuration.

## Revisit when

- Passkey or WebAuthn support becomes broadly available on the target Android devices. Check: adoption
  among devices in use.
- SMS delivery success falls below 85% persistently. Check: the delivery-rate dashboard over a month.
- A regulatory requirement demands identity verification stronger than SIM possession. Check: AML/CFT advice
  that OTP is insufficient for a particular class of user.

Passkeys are the most likely successor. The API sets the session cookies, so adding a passkey factor means a
new factor and a new enrollment route, not a rewrite.

## Related

- [`../06-authentication.md`](../06-authentication.md)
- ADR 0016, the SMS hook
- [`../07-authorization-and-rls.md`](../07-authorization-and-rls.md)
