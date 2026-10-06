# 13 — Notifications

Courtland sends transactional messages on three channels — email, SMS, WhatsApp — and keeps every one of
them in `notices` with a delivery record. The rules below exist because a property platform that silently
fails to notify a tenant about rent is not a property platform.

## 1. Channels

| Channel | Provider | Used for | Cost profile |
|---|---|---|---|
| `email` | Resend | Receipts, statements, agreements, KYC outcomes | Negligible |
| `sms` | Termii, MSG, Twilio, SendChamp (configurable, with fallback) | OTP, arrears, critical actions | Per message, the main cost |
| `whatsapp` | Twilio Verify templates | OTP, arrears, critical actions, opt-in only | Higher per message |
| `in_app` | Postgres `notices` | Everything, always | Free |

`in_app` is not a channel the user chooses; it is the record. Every `notices` row is an in-app message in
the portal whether or not an email or SMS was also sent.

### 1.1 Channel selection

```ts
// apps/api/src/modules/notifications/channelPolicy.ts
export function channelsFor(notification: NotificationInput): Channel[] {
  const prefs = notification.userPreferences ?? DEFAULT_PREFERENCES

  // Critical events ignore the user's preferences. A tenant who turned off SMS
  // still gets an SMS for a payment failure on their rent contract.
  if (notification.priority === 'critical') return ['in_app', 'sms', 'email']

  return (['in_app', ...prefs.channels] as Channel[])
    .filter((c) => c !== 'whatsapp' || prefs.whatsappOptIn)
}
```

| Priority | Examples | Preference respected |
|---|---|---|
| `critical` | Payment failed, contract suspended, OTP, KYC rejected | No. Always `in_app` + `sms` + `email`. |
| `transactional` | Receipt, agreement ready, statement | Yes |
| `informational` | New listing matches a saved search, news | Yes |
| `marketing` | Newsletter | Only with explicit opt-in, and only by email |

## 2. The template catalogue

Fifteen templates, each a handlebars file plus a Zod schema for its variables. The schema is what stops a
missing variable from producing "Hello , your rent of ₦ is due."

| Key | Channels | Priority | Variables |
|---|---|---|---|
| `otp` | sms, whatsapp | critical | `code`, `expiryMinutes` |
| `welcome` | email, in_app | transactional | `firstName` |
| `payment_receipt` | email, in_app | transactional | `receiptNumber`, `amount`, `contractRef`, `lines[]`, `paymentRef` |
| `payment_failed` | sms, email, in_app | critical | `amount`, `reason`, `retryUrl` |
| `arrears_notice` | sms, email, in_app | critical | `contractRef`, `lines[]`, `totalDue`, `payUrl` |
| `payment_reminder` | sms, email | transactional | `dueDate`, `amount`, `payUrl` |
| `contract_approved` | email, in_app | transactional | `contractRef`, `documentId` |
| `agreement_ready` | email, sms, in_app | transactional | `contractRef`, `signUrl` |
| `contract_renewal_offer` | email, in_app | transactional | `currentRent`, `proposedRent`, `expiryDate`, `renewUrl` |
| `termination_notice` | email, sms, in_app | critical | `contractRef`, `terminationDate`, `settlementLines[]`, `refundAmount` |
| `maintenance_update` | sms, email, in_app | transactional | `ticketRef`, `status`, `note` |
| `payout_advice` | email, in_app | transactional | `amount`, `method`, `reference`, `period` |
| `kyc_status` | email, in_app | transactional | `status`, `missingItems[]` |
| `saved_search_alert` | email, in_app | informational | `propertyCount`, `searchUrl` |
| `document_expiring` | email, in_app | informational | `docType`, `expiryDate`, `renewUrl` |

Fifteen rows. `tooling/scripts/check-template-usage.mjs` in CI asserts that every `template_key` value passed to `notify()` in
the code appears here, every channel listed has a file, and every template's fixture renders. A template with
no trigger is dead code and fails the build; a trigger with no template is a runtime error and fails earlier.

## 3. The send path

```
notify({
  template: 'arrears_notice',
  toUserId: tenantId,
  contractId,
  priority: 'critical',
  vars: { contractRef, lines, totalDue, payUrl },
  channels?: undefined,          // policy decides
  dedupeKey: 'arrears_notice:contract:2026-09',
})
```

```
1. Validate vars against the template's Zod schema. Invalid → throw. Never send a half-rendered message.
2. Compute dedupeKey hash. INSERT INTO notices (..., dedupe_key) ON CONFLICT DO NOTHING.
   A duplicate within the dedupe window returns the existing notice. This is what stops a retried job
   from sending the same arrears notice twice.
3. Resolve channels: channelPolicy + user preferences + template's allowed channels.
   An unknown channel in a template is dropped, not sent. WhatsApp is dropped if the provider
   does not support it or the user has not opted in.
   For each channel — one `notices` row per (notification, channel), so a channel's provider id, status and
   failure reason never overwrite another's:
   a. INSERT INTO notices (..., channel, dedupe_key) — the row is the delivery record
   b. INSERT INTO outbox_events (event_type='notification.queued', payload={ noticeId, channel })
   c. Inngest 'send-sms' or 'send-email' runs, records provider and provider_message_id, retries, fallback
   d. Provider webhook updates that row's status: queued → sent → delivered → failed/bounced
5. Nothing aggregates. Each row reaches its own terminal state; a channel that failed is visible as failed.
```

Channel sends are independent. One email failing does not stop the SMS. A tenant who gets the SMS and not
the email is better off than one who gets neither.

### 3.1 Deduplication

| Key shape | Window |
|---|---|
| `template:contract:period` | The whole billing period. An arrears notice for October 2026 sends once. |
| `template:payment:receipt` | Forever. A receipt is a receipt. |
| `template:ticket:status` | 1 hour. Two identical "in progress" updates are noise. |
| `template:search:property` | 24 hours per property. |

The window is per template, declared in the template's front matter. A receipt's dedupe key includes the
payment id, so it never collides with another payment.

## 4. SMS specifics

### 4.1 The carrier reality

Nigerian SMS delivery is not binary. A message can be accepted by an aggregator, rejected by the carrier,
delivered to a handset that is powered off and delivered a week later, or silently dropped.

```
submitted → accepted by provider → sent to carrier → delivered to handset
                ↓                      ↓
          rejected (invalid number)  rejected (blocked / full / unknown prefix)
```

Courtland tracks `submitted`, `accepted`, `delivered`, `failed`, and records the DLR (delivery receipt)
reference. A message that reaches `accepted` and never reaches `delivered` within 24 hours is flagged for
review.

### 4.2 The provider chain

```
Termii  ──(config primary)──▶  MSG  ──▶  Twilio  ──▶  SendChamp  ──▶  mock
```

Configured per environment. `SMS_PROVIDER` sets the primary; the rest are fallbacks in a fixed order.
`sms-delivery-report` records the outcome of each attempt, so the dashboard can show "87% delivered via
Termii, 11% via MSG fallback".

A permanently rejected number (invalid prefix, `blocked_carrier`) is recorded and does not fall through to
the next provider. A provider outage does fall through.

### 4.3 Template text

Short, plain, no placeholders that could confuse a handset's rendering. Nigerian phones include very old
feature phones, so no emoji, no markdown, no HTML.

```
Courtland: Your rent of N37,500 for Oct 2026 is due on 1 Oct.
Pay: https://courtland.com.ng/pay/PSK_9fj20
Ref: CL-2026-000412
```

Under 160 characters per segment where possible. No contract details, no balances, no other people's data.
An SMS is not private: it arrives on a shared phone in a shared house.

### 4.4 Sender ID

`Courtland` where the aggregator supports an alphanumeric sender; the numeric route otherwise. Registered
per aggregator, and the registration is a manual step recorded in
[`22-configuration-and-environments.md`](./22-configuration-and-environments.md). An unregistered sender ID
is the most common cause of "our SMS stopped arriving" in Nigeria, and it is a configuration problem, not a
code problem.

### 4.5 WhatsApp

Opt-in only, via an explicit checkbox that records consent with a timestamp and the message template name
WhatsApp requires. Twilio Verify only; the channel is hidden when `SMS_PROVIDER` is not Twilio.

## 5. Email

### 5.1 Resend specifics

| Concern | Handling |
|---|---|
| From domain | `notifications@courtland.com.ng` with SPF, DKIM, and DMARC. DMARC is `p=quarantine` initially, `p=reject` after monitoring. |
| `Idempotency-Key` header | The Resend API's idempotency key is the `notices.id`, so a retried send within 24 hours does not deliver twice. |
| Bounce handling | `email.bounced` webhook → `notices.status = 'bounced'`, and if the address is hard-bounced, set `profiles.email_deliverable = false`. |
| Complaint handling | `email.complained` → immediately suppress marketing. |
| HTML and text | Both parts always. Text is not optional; some corporate mail clients render text only. |

### 5.2 Templates

Handlebars, compiled and cached, with the same Zod variable validation as SMS. Email templates extend a
shared layout partial:

```hbs
{{> emailLayout
    title=subject
    preheader=preheader
    unsubscribeUrl=unsubscribeUrl}}
<div class="card">
  <h1>{{title}}</h1>
  {{> receiptBody data=this}}
</div>
{{> emailFooter year=year supportEmail=supportEmail}}
```

`unsubscribeUrl` is present on marketing and informational email. It is absent on transactional email,
where unsubscribing from your rent receipt is not a meaningful concept — and its absence is deliberate: a
receipt with an unsubscribe link teaches users that links in Courtland email are noise.

## 6. In-app notices

`notices` rows are the in-app inbox. They are read through RLS (`recipient_user_id = auth.uid()` and
`status in ('sent','delivered')`).

| Column | Purpose |
|---|---|
| `recipient_user_id` | Null for a notice addressed to a phone number with no account. |
| `channel` | `email`, `sms`, `whatsapp`, `in_app`. One row per channel per notification. |
| `status` | `queued`, `sent`, `delivered`, `failed`, `bounced`, `read` |
| `read_at` | Set when the user opens it in the portal |
| `priority` | Mirrors the notification priority |
| `template_key`, `vars` | What was sent, so a support agent can see exactly what the user saw |
| `dedupe_key` | Unique index with the window |
| `provider_id`, `dlr_ref` | Delivery evidence |

`vars` is stored so a dispute about "what were we told" is answerable. It is not a substitute for the
provider's own record, and it is subject to the same retention limits.

## 7. Preferences

Per user, per category, in `profiles.notification_preferences`:

| Category | Channels | Default |
|---|---|---|
| `payments` | in_app, email, sms | all three |
| `contracts` | in_app, email, sms | all three |
| `maintenance` | in_app, email, sms | all three |
| `saved_searches` | in_app, email | both |
| `marketing` | email | none |

`critical` notifications ignore these, as in §1.1. The UI states that plainly rather than presenting a
preference screen that lies.

WhatsApp opt-in is a separate explicit boolean, never implied by the `sms` preference.

## 8. Volume, rate limits, and cost

| Template | Volume per event | Guard |
|---|---|---|
| OTP | 1 per request | Already rate limited by number and IP in the auth flow |
| Receipt | 1 per successful payment | `dedupeKey` on the payment id |
| Arrears | 1 per contract per day, not per row | Grouped by contract in `arrears-sweep` |
| Maintenance update | 1 per status change | 1-hour dedupe window |
| Saved search alert | 1 per search per 24h, capped at 5 | `saved_search_alert` job checks the last 24h before enqueueing |
| KYC reminder | 1 per owner per week | `kyc-reminder` is a weekly cron |

The saved-search alert is the only unbounded one. It is capped explicitly, because a tenant with twelve
saved searches matching forty new listings would otherwise be 480 emails in a week.

## 9. Failure modes

| Failure | Handling |
|---|---|
| Provider outage | Retries with backoff, then fallback provider, then `failed` status. The API is unaffected. |
| Invalid phone number | Permanent rejection recorded; `profiles.phone_deliverable = false`; SMS suppressed for that user, email used instead. |
| Hard email bounce | Address marked undeliverable; transactional email suppressed; SMS used. |
| Template variable missing | Job fails at validation. No partial message is sent. This is a bug, caught in CI by the fixture test. |
| Dedupe collision on a genuinely new notice | The key includes enough identity to avoid it. `arrears_notice:contract:2026-09` for the same contract and month is, by design, the same notice. |
| Outbox backlog | `reconcile-outbox` retries; the SLA alert fires past 15 minutes. |
| User has every channel disabled for a transactional category | `in_app` is always added by the policy. There is no configuration in which a rent receipt produces no message anywhere. |

## 10. Dead-code rules

| Rule | Enforcement |
|---|---|
| Every template has a trigger | `tooling/scripts/check-template-usage.mjs` greps for each `template_key` in `src/modules` |
| Every trigger has a template | The same test scans for `template: '...'` literals and asserts each is in the catalogue |
| Every template channel has a file | Same test |
| Every template renders | Vitest fixture test per template with representative vars |
| No unused channel | A channel with no template and no job fails the test |

## 11. Related documents

- Job definitions: [`11-scheduling-and-jobs.md`](./11-scheduling-and-jobs.md)
- Media and upload: [`14-media-and-storage.md`](./14-media-and-storage.md)
- Config: [`22-configuration-and-environments.md`](./22-configuration-and-environments.md)
- Compliance and record-keeping: [`25-nigeria-compliance.md`](./25-nigeria-compliance.md)
