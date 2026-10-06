# ADR 0016: SMS through a Supabase Send SMS hook, not the built-in provider

- Status: Accepted
- Date: 2026-02-17
- Deciders: CTO, Lead developer

## Context

Courtland sends SMS for OTP, arrears notices, maintenance updates, and payment failures. SMS is the primary
authentication channel (ADR 0010), so OTP delivery is a production dependency.

Supabase Auth supports configuring an SMS provider in its dashboard: Twilio, MessageBird, Textlocal, Vonage,
and a generic hook. Nigerian delivery from international senders is unreliable, so the provider choice is
not a formality.

## Decision

Supabase's **generic Send SMS hook**, pointed at our own endpoint.

```
GoTrue → POST /v1/integrations/sms/outbound
       (bearer SMS_HOOK_SECRET)
       → apps/api → provider chain: Termii → MSG → Twilio → SendChamp
       → 200 to GoTrue → the user receives the code
```

The hook owns the message body, the provider chain, the delivery telemetry, and the templates. The Supabase
dashboard's provider settings are not used.

## Alternatives considered

**Configure Twilio in the Supabase dashboard.** Rejected. It locks the provider, makes switching a dashboard
change, gives no delivery telemetry beyond Twilio's own, and puts the message body outside version control.

**Multiple providers configured in Supabase.** Rejected. Supabase supports a primary and a fallback, but the
fallback is a second dashboard configuration with no visibility into which one actually delivered.

**Turn off Supabase's SMS entirely and manage OTP ourselves.** Rejected. That means implementing our own OTP
generation, storage, verification, rate limiting, and expiry. It is security-critical code that Supabase
already provides correctly.

**A Nigerian aggregator only, configured in Supabase.** Rejected for the same reason as Twilio: the code, the
telemetry, and the provider chain belong in code we control, where they are testable and versioned.

**Send the OTP through our own notification system on the same hook.** This is what happens. The hook is not
a special path; it calls the same `notifications` module that arrears notices use, with the OTP template. The
only difference is the channel is forced and the secret differs.

## Consequences

**Easier.** Provider switching is a configuration change. The message template is a versioned file with review.
Every send is logged with the provider message id, which is what makes a "my code never arrived" ticket
answerable. The fallback chain is explicit code, so its behaviour is testable and its effectiveness is
measured.

**Harder.** One more endpoint with its own authentication to get right. The hook must return fast enough not
to time out GoTrue's request, so the provider call is made with a timeout and the failure is recorded rather
than propagated. The OTP appears in memory at our endpoint, so it must never be logged, which is why
redaction covers `otp`. The `SMS_HOOK_SECRET` becomes a credential that must be rotated. Local and staging
need the hook reachable from Supabase, which means a tunnel in local development.

**Cost.** Roughly a day to build. A secret to manage.

## Revisit when

- Supabase adds native support for a provider-chain hook with telemetry. Check: the GoTrue changelog.
- GoTrue's hook interface changes. Check: a deprecation in the Supabase release notes.
- SMS volume makes a single aggregator materially cheaper. Check: per-message pricing across providers.

## Related

- ADR 0010, OTP as the primary authentication method
- [`../06-authentication.md § The SMS provider`](../06-authentication.md#3-the-sms-provider-behind-a-hook)
- [`../13-notifications.md`](../13-notifications.md)
- [`../24-operations-runbooks.md § OTP delivery`](../24-operations-runbooks.md#42-otp-delivery-is-failing)
