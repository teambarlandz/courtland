# 24 — Operations runbooks

What to do when something is wrong, at 02:00, with a tenant on the phone. Each runbook has a trigger, the
first three actions, the diagnosis queries, and the escalation path.

## 1. Severity

| Severity | Meaning | Response |
|---|---|---|
| SEV1 | Money moving incorrectly, data breach, auth bypass, whole system down | Page. Acknowledge in 15 min. Halt payouts first |
| SEV2 | One integration down, one user's flow broken, degraded performance | Acknowledge in 1 h. Fix within 4 h |
| SEV3 | Degraded with a workaround, cosmetic | Next business day |
| SEV4 | Cosmetic | Backlog |

Money incidents are SEV1 even if the amount is small. The first question is always whether the amount is
large, and the answer is always to check before deciding.

## 2. The universal first action

```sql
-- Halt new payouts. Always. Before diagnosis.
update payout_runs set status = 'halted'
where status in ('pending_approval', 'approved');

-- Confirm
select id, status, total_kobo, created_at from payout_runs
where status in ('pending_approval', 'approved', 'halted');
```

Payouts can be halted in seconds and resumed later. Settled payments cannot be un-settled, so the asymmetry
is clear: stop the outflow first, understand second.

## 3. Money runbooks

### 3.1 A payment is settled twice

**Trigger.** A tenant reports two charges, or `payments_settled_total` is double the expected daily count.

```
1. Confirm it
   select provider_reference, amount_kobo, paid_at, contract_id, payer_id
   from payments_ledger
   where payer_id = $1 and status = 'succeeded'
   order by paid_at desc;

2. Look for two intents
   select id, status, amount_kobo, created_at, schedule_seqs
   from payment_intents
   where contract_id = $1 order by created_at desc;

3. If both ledger rows exist for the same amount within 10 minutes, the duplicate sweep
   did not catch it. Refund the later one:
     POST /v1/payments/{id}/refund  { amountKobo, reason: "duplicate charge" }

4. Schedule rows: check nothing is marked paid twice
   select seq, status, paid_at, payment_id from contract_schedule where contract_id = $1 order by seq;
```

**Escalate** if the allocations do not balance. That is a ledger invariant failure and a SEV1 on its own.

### 3.2 Reconciliation variance

**Trigger.** The `reconciliation_exceptions` alert fires, or `settlement_variance` is non-zero.

```
1. The size of the variance
   select * from reconciliation_exceptions
   where detected_at > now() - interval '24 hours' order by detected_at desc;

2. Which period
   select variance_kobo, expected_kobo, actual_kobo, period_start, period_end
   from reconciliation_runs
   where variance_kobo != 0 order by run_at desc limit 5;

3. Is it one payment or many?
   -- One: a single fee or amount disagreement. Likely a Paystack fee change.
   select provider_reference, amount_kobo, fee_kobo, net_kobo
   from payments_ledger where status = 'succeeded'
     and provider_reference in (select provider_reference from reconciliation_exceptions);

   -- Many, all the same day: a provider fee change, or a settlement timing difference.

4. Compare with Paystack
   curl -H "Authorization: Bearer $PAYSTACK_SECRET_KEY" \
     https://api.paystack.co/settlement

5. If Paystack agrees with us, the variance is in the settlement timing. The next run clears it.
   If Paystack disagrees, contact Paystack support with the references.
```

**Do not** adjust a ledger row to make a report balance. The ledger is the record. A variance that cannot be
explained is escalated to the CTO and disclosed to affected parties.

### 3.3 A ledger invariant has failed

**Trigger.** The `ledger_balance_violations` alert. This is always SEV1.

```
1. Stop all writes
   -- Set the API to read-only by halting the worker
   render services suspend courtland-worker

2. Find the violation
   select id, provider_reference, amount_kobo, fee_kobo, net_kobo,
          (select coalesce(sum(amount_kobo),0) from ledger_allocations a where a.payment_id = payments_ledger.id)
            as allocated
   from payments_ledger
   where status = 'succeeded'
     and net_kobo <> (select coalesce(sum(amount_kobo),0) from ledger_allocations a where a.payment_id = payments_ledger.id);

3. Check the trigger is present
   select tgname, tgenabled from pg_trigger
   where tgrelid = 'public.ledger_allocations'::regclass and not tgisinternal;

4. If the trigger was disabled or dropped, that is the cause. Re-enable it, then repair the
   affected rows by recomputing allocations from the stored amounts:
     UPDATE ledger_allocations SET amount_kobo = … -- per row, with the amounts above
   Every repair is written to audit_log with a reason.

5. Re-run the invariant query. Then resume the worker.
```

The repair is manual and audited. A script that "fixes" allocations without review is how a small variance
becomes a large one.

### 3.4 A payout is stuck

**Trigger.** The `payout_age_hours` alert, or `transfer.stuck` in reconciliation.

```
1. Which payouts
   select id, owner_id, amount_kobo, status, paystack_reference, created_at,
          now() - initiated_at as age
   from payouts where status = 'initiated' and initiated_at < now() - interval '2 hours';

2. Check Paystack for each
   curl -H "Authorization: Bearer $KEY" \
     https://api.paystack.co/transfer/<reference>

3. Cases:
   status = 'queued'  → Paystack is processing. Wait. The poll job will close it.
   status = 'failed'  → the webhook was missed. Mark it failed manually and return the
                        allocation to the pool: UPDATE ledger_allocations SET payout_id = null
                        where payout_id = $1;
   status = 'reversed'→ contact the owner. Funds were reversed by the bank.
   404                → the transfer was never created. Re-initiate after checking
                        the owner's account status.

4. Owner account disabled
   select oa.*, o.name from paystack_accounts oa join owners o on o.id = oa.owner_id
   where oa.verified_at is null or oa.restricted_at is not null;
   Notify the owner. Do not initiate to an unverified account.
```

### 3.5 A refund was issued in error

```
1. Halt payouts. Identify the refund.
   select * from refunds where created_at > now() - interval '2 hours';

2. Can it be recalled? Paystack does not support recall. The money has left.

3. Options, in order:
   a. The original allocation is unspent: re-allocate from the payable pool to the payee.
   b. The payout has not run: the allocation was already returned by the refund, so nothing more.
   c. Recover manually via bank transfer to the payee, recorded as an adjustment.
   d. If the refund was fraudulent: unlink the paystack account, revoke the session, review the audit log.

4. Audit the cause. Every refund is an audit row with the actor.
```

### 3.6 Paystack is down

**Trigger.** `paystack.api` latency above 5 s, or initialisation failing above 20%.

```
1. Confirm it is Paystack, not us
   curl -s -o /dev/null -w '%{http_code}' https://api.paystack.co/transaction/initialize

2. What the user sees
   - Initialisation failing: the client shows "We're having trouble reaching our payment partner.
     Please try again in a few minutes." The intent exists as `created`, so retrying with the
     same Idempotency-Key is safe.
   - Webhooks failing: payments stay `pending`. The notice says "we have not heard from Paystack yet",
     which is honest.

3. Do not work around it. There is no alternative payment provider in v1.

4. Update the status page. When Paystack recovers, the webhook queue drains and the intents settle.
   The `payment-reconcile` job catches anything older than 24 hours.
```

## 4. Authentication runbooks

### 4.1 Compromised admin account

**Trigger.** Suspicious activity, an unusual sign-in location, a staff member reporting a lost device.

```
1. Cut access immediately
   -- Revoke every refresh token for the user
   -- (via supabase.auth.admin.signOut(userId, 'global') from a script or the dashboard)

   -- Expire every role
   update public.user_roles set expires_at = now() where user_id = $1;

   -- Invalidate every issued token
   update auth.users set session_version = session_version + 1 where id = $1;

2. Review what they did
   select * from audit_log
   where actor_id = $1 and created_at > now() - interval '30 days'
   order by created_at desc;

   select * from payout_runs where approved_by = $1 or created_by = $1
     and created_at > now() - interval '30 days';

3. If money moved: escalate to the money runbooks.

4. If a shared secret may be exposed: rotate. See §9.

5. If a second account is involved, repeat for it. Assume lateral movement.
```

### 4.2 OTP delivery is failing

**Trigger.** `auth_otp_requests_total{result="failed"}` above 20%, or support tickets.

```
1. Is it our hook or the provider?
   curl -X POST "$APP_URL/v1/integrations/sms/outbound" \
     -H "Authorization: Bearer $SMS_HOOK_SECRET" \
     -H 'content-type: application/json' \
     -d '{"user":{"id":"test"},"sms":{"otp":"123456","phone":"+2348000000000"}}'
   → 200 means the API is fine; the provider is the problem.

2. Check the fallback chain. send-sms tries the next provider on a non-permanent failure.
   Is the fallback actually configured? SMS_PROVIDER and its keys.

3. Check the sender ID registration. An unregistered alphanumeric sender is the most common cause
   of silent drops in Nigeria. Confirm with the aggregator's dashboard.

4. Check DLRs
   select channel, status, count(*) from notices
   where created_at > now() - interval '1 hour'
   group by 1, 2;

5. If all providers are down, set the flag off temporarily so users see the failure rather than
   waiting for a code that will never arrive:
   -- Update the notification policy to skip SMS when the delivery rate is under 50%
   -- and surface an error in the UI instead of a code field.
```

### 4.3 Auth is down entirely

```
1. Check Supabase status. status.supabase.com

2. Check our side
   curl $APP_URL/health/ready
   curl "$SUPABASE_URL/auth/v1/health"

3. If Supabase is down, nothing we do helps. Post a status update, and make sure the portal
   shows a clear message rather than a spinner.

4. If we are down, it is a deploy. Roll back.
```

## 5. Data runbooks

### 5.1 A tenant cannot see their own contract

The most common support issue. Diagnosis order:

```
1. Do they have the right account?
   select id, phone_e164, email, deleted_at from profiles where phone_e164 = $1;
   -- The phone in the contract may differ from the phone they signed in with.

2. Do they have the right role?
   select * from user_roles where user_id = $1;

3. Are they a party to the contract?
   select * from contract_parties where contract_id = $2 and user_id = $1;
   -- A party row with user_id null is a landlord registered by staff who never signed in.

4. Is the contract visible under RLS?
   -- Impersonate and query:
   set local role authenticated;
   select set_config('request.jwt.claim.sub', '<user id>', true);
   select set_config('request.jwt.claims',
     '{"sub":"<user id>","role":"authenticated","app_metadata":{"courtland_roles":["tenant"]}}', true);
   select count(*) from contracts where id = '<contract id>';

5. Is it an onboarding gate? A user without onboardingComplete is redirected to /auth/onboarding
   regardless of their contracts.
```

The fifth case is the answer more often than it should be, which is why it is last on the list: check the
data before checking the UI.

### 5.2 A document is missing

```
1. Does the row exist?
   select id, kind, origin, status, visibility, template_key, template_version, storage_public_id,
          created_at, released_at
   from documents where contract_id = $1 order by created_at desc;

2. status = 'draft' → generation failed. Why?
   select * from job_failures where aggregate_id = $1 order by created_at desc;
   -- Or check the Inngest dashboard for the generate-document run.

3. status = 'generated', visibility = 'counterparty' → the row is there but the caller cannot see it.
   Check the caller against the policy in 07-authorization-and-rls.md §46.

4. No row at all → generation was never requested. `document.requested` is only enqueued when the
   document row is inserted, so an absent row means the request that should have created it failed first:
   look for the contract activation in webhook_events and outbox_events before touching the job.

5. The Cloudinary asset is gone but the row exists. Check the asset:
   curl "https://res.cloudinary.com/$CLOUDINARY_CLOUD_NAME/raw/upload/$PUBLIC_ID"
   If 404, the asset was deleted. Regenerate from the template: `template_key` and `template_version` are
   pinned on the row, and `rendered_data` holds the values it was rendered with, so the rebuilt file is
   byte-comparable against `checksum_sha256`. A checksum that no longer reproduces means the template
   changed, not that the file was corrupted.
```

There is no repair step for a generated row with no file, because the table CHECK forbids that state:
`document_generated_has_bytes` rejects the write. Fixing it means resetting the row to `draft` deliberately,
which the constraint does allow because `draft` is the one status with the file columns nullable.

### 5.3 Restore from a point-in-time backup

**Trigger.** Corruption, accidental deletion of live data, or a bad migration.

```
1. Stop writes
   render services suspend courtland-api courtland-worker

2. Assess what is lost
   - Supabase PITR is continuous to within a minute. Find the point:
     select * from contract_parties where user_id = $1;   -- when did this disappear?
   - Render disk is ephemeral. Nothing to restore; the code is in git.

3. Restore to a new branch, not production
   Supabase support: create a branch from the PITR point.
   Verify on the branch first. Restoring onto production while it is being written to is a
   second incident.

4. Verify on the branch
   - Row counts per table against the pre-incident counts
   - The invariant queries from 10-payments-paystack.md §11 return zero
   - reconciliation_exceptions is empty for the restored period

5. Promote the branch to production

6. Reconcile against Paystack for the affected window. Every payment Paystack recorded must
   exist in the ledger. Anything missing, create it from the provider record, and log it as
   an orphan resolution.

7. Resume services, notify affected users if any data was genuinely lost.
```

Never restore onto a live database. A branch costs a support ticket and saves the incident.

### 5.4 A duplicate row exists despite a unique constraint

```
1. Which constraint, and which table?
   select conname, pg_get_constraintdef(oid) from pg_constraint
   where conrelid = $1::regclass and contype = 'u';

2. A constraint marked NOT VALID
   select conname, convalidated from pg_constraint
   where conrelid = $1::regclass and contype = 'u' and not convalidated;
   -- A convalidated = false unique constraint does not enforce on existing rows.
   -- Validate it after cleaning up, or it will fail on the first insert that hits a duplicate.

3. Deferrable unique constraints are only checked at commit.
   -- An application that never commits leaves the transaction holding locks.
   -- Look for long-running transactions:
   select pid, state, now() - xact_start as age, left(query, 100)
   from pg_stat_activity where xact_start is not null and now() - xact_start > interval '5 minutes';
```

## 6. Performance runbooks

### 6.1 The API is slow

```
1. Which route?
   select path, count(*), avg(duration_ms), percentile_cont(0.95) within group (order by duration_ms)
   from request_log where created_at > now() - interval '1 hour'
   group by 1 order by 3 desc limit 10;

2. Is it the database?
   select state, count(*), max(now() - query_start) as longest
   from pg_stat_activity where state <> 'idle' group by 1;

   -- Locking
   select pid, wait_event_type, wait_event, left(query, 80), now() - query_start
   from pg_stat_activity where wait_event_type = 'Lock';

3. Is it connection exhaustion?
   select count(*), state from pg_stat_connection group by 2;
   -- At the pool limit, requests queue. Raise DATABASE_POOL_MAX, or find the leak.

4. Is it a slow query?
   -- Enable and read
   select calls, mean_exec_time, query from pg_stat_statements
   order by mean_exec_time desc limit 20;
   -- Anything over 200 ms with a high calls count needs an index.
   -- Check for a sequential scan on a large table.

5. Is it a dependency?
   -- A slow Paystack call adds its latency to every request that touches it.
   -- The API has a 15 s timeout; if requests are timing out rather than being slow,
   -- the provider is the problem and the fix is the provider runbook.

6. Is it traffic?
   select count(*) from request_log where created_at > now() - interval '5 minutes';
   -- A spike from a scraper. Check the user agent distribution.
```

### 6.2 The outbox backlog is growing

```
1. How bad
   select count(*), min(created_at), max(created_at) from outbox_events where status = 'pending';

2. Why are dispatches failing?
   select last_error, count(*) from outbox_events
   where status = 'failed' group by 1 order by 2 desc limit 5;

3. Is Inngest reachable?
   curl -s -o /dev/null -w '%{http_code}' https://api.inngest.com/

4. Cases
   - Inngest down: the backlog grows. Nothing is lost. Restore connectivity.
   - Database errors on insert: the outbox table is locked. Find the blocking transaction (§5.4).
   - A single event type failing: that job is broken. Check the Inngest dashboard for it.
   - The dispatcher is not running: is the worker up? render services

5. Do not delete pending rows. They are queued work. Deleting them is losing notifications.
```

### 6.3 The database is growing too fast

```
1. Size by table
   select relname, pg_size_pretty(pg_total_relation_size(relid)) as size,
          n_live_tup
   from pg_stat_user_tables order by pg_total_relation_size(relid) desc limit 15;

2. The usual suspects
   audit_log          grows forever by design. Monthly export to cold storage, then truncate.
   webhook_events     grows forever by design. Same treatment.
   outbox_events      dispatched rows are dead after a week. Delete dispatched rows over 7 days.
   request_log        if enabled, 30 days then delete.
   provider payload columns in webhook_events: store the payload in cold storage, not in the row.

3. Index bloat
   select relname, indexrelname, pg_size_pretty(pg_relation_size(indexrelid))
   from pg_stat_user_indexes order by pg_relation_size(indexrelid) desc limit 10;

4. Dead tuples
   -- autovacuum should handle this. If it is not keeping up, lower autovacuum_vacuum_scale_factor
   -- on the specific table.
```

### 6.4 Email is not being delivered

```
1. Our side
   select status, count(*) from notices
   where channel = 'email' and created_at > now() - interval '2 hours'
   group by 1;

2. Resend's side
   -- The dashboard shows delivery, bounce, and complaint rates per domain.
   -- A DMARC change or a domain authentication failure shows here first.

3. Per address
   select to_email, status, provider_id, sent_at from notices
   where channel = 'email' and status in ('bounced','failed')
   order by created_at desc limit 20;

4. Cases
   - Bounced, hard: profiles.email_deliverable = false. Email is suppressed for that user.
   - Bounced, soft: temporary. Retry once, then treat as hard.
   - Complained: marketing suppressed immediately, permanently.
   - Delivered but not shown: check spam score. A "look at this receipt" subject with an image
     header is a spam signal.
```

## 7. Integration runbooks

### 7.1 Cloudinary

```
1. Are uploads failing?
   curl "https://api.cloudinary.com/v1_1/$CLOUDINARY_CLOUD_NAME/image/upload" \
     -F "file=@test.jpg" -F "signature=$SIG" -F "timestamp=$TS"
   -- A 401 means the signature secret is wrong. Rotate it.

2. Transformations failing but uploads working
   -- A named transformation that does not exist returns the original image unscaled,
   -- which is silent. Verify a transform:
   curl -I "https://res.cloudinary.com/$CLOUD/name/image/upload/c_fill,w_400,h_300/test"
   -- If the response is the full-size image, the transform name is wrong.

3. Storage over 80%
   -- Run media-orphan-cleanup now rather than waiting for the cron.
   select count(*) from property_media pm
   left join cloudinary usage on true where pm.cloudinary_id not in (...)
```

### 7.2 Inngest

```
1. Are events being published?
   -- Send a test event and check the Inngest dashboard
   curl -X POST https://api.inngest.com/e/$KEY \
     -H 'Content-Type: application/json' \
     -d '{"name":"test","data":{}}'

2. Is the worker serving?
   -- The worker registers its functions on boot. If the signing key changed, registration fails
   -- silently and no events are delivered. Check the worker's boot logs for
   -- "Successfully registered functions".

3. Jobs stuck in a wait
   -- step.waitForEvent with a timeout. A payout run waiting for approval that timed out is
   -- expected; the allocations are still payable.

4. A function is failing repeatedly
   -- Check the failing step in the dashboard. If the code is correct, the data is not.
   -- Look at the specific payload rather than retrying blind.
```

## 8. Communication templates

### To a tenant whose payment is delayed

```
Subject: Your payment is confirmed — receipt on the way

Hello {firstName},

We have received your payment of {amount} for {contractRef}.

You do not need to do anything. Your receipt will appear in your portal within a few
minutes. If it has not after 30 minutes, reply to this email and we will send it directly.

Courtland
```

Never "payment failed" when the truth is "we have not heard from the provider yet". Both are accurate and
only one of them is alarming.

### To an owner whose payout is delayed

```
Subject: Your payout of {amount} is scheduled

Hello {firstName},

Your payout of {amount} covering {period} is scheduled for {date}.

Payouts run weekly and settle {lag} business days after a payment clears, so this is
within the normal window. You can see the breakdown in your portal under Finance.

Courtland
```

### To staff after a SEV1

```
[SEV1] {title}
Started: {time}  Status: investigating
Impact: {who is affected}
Mitigation: {what is halted or degraded}
Next update: {time + 30 min}
Incident lead: {name}
```

## 9. Key rotation

| Secret | Procedure | Verify by |
|---|---|---|
| Paystack secret | Render dashboard → edit. Deploy. Old key stays valid for 24 h | A webhook arrives |
| Supabase service role | Supabase dashboard → regenerate. Update both Render services | A job runs successfully |
| Cloudinary API secret | Regenerate. Update. Old upload tickets expire in 1 h | An upload succeeds |
| Resend | Create a new key. Update. Revoke the old after 24 h | An email is delivered |
| SMS provider | Per provider | An OTP is delivered |
| `INTERNAL_JOB_TOKEN` | Update Render for the API and the cron service | A cron tick succeeds |
| Inngest signing key | Regenerate. The worker re-registers on restart | A job runs |

Order matters: deploy the new value, verify, then revoke the old. The reverse order causes an outage.

## 10. Escalation

| Role | Contact | For |
|---|---|---|
| On-call engineer | PagerDuty | SEV1 and SEV2 |
| Lead developer | Phone | SEV1 |
| CTO | Phone | SEV1 lasting over an hour, any data breach |
| Paystack support | support@paystack.com, +234 1 700 525 425 | Payment disputes, settlement questions |
| Supabase support | dashboard, status page | Database, Auth |
| Cloudinary support | support portal | Media |
| Legal counsel | Retained firm | Anything with a legal or regulatory dimension |

## 11. Quarterly drills

| Drill | Duration | What it proves |
|---|---|---|
| Roll back a deploy | 15 min | The rollback procedure works before it is needed |
| Restore from PITR to a branch | 1 h | The database can be recovered |
| Halt and resume payouts | 10 min | The safety control works |
| Revoke a staff account | 10 min | Access is cut fast |
| Rotate the Paystack key | 20 min | The rotation procedure works |
| Contact Paystack support | 1 h | The support path is real and has a response time |

A drill that finds a problem is a successful drill. A drill that has not been run is a guess.

## 12. Dead-code rules

| Rule | Enforcement |
|---|---|
| Every alert has a runbook | A CI check that every alert id in the alert config appears in this document |
| Every runbook has a severity | A missing severity fails the same check |
| Every severity maps to an action | A completeness check against the severity table |
| No unreferenced query | A SQL block not referenced by a runbook section is removed |
| No runbook for a system not deployed | A quarterly review |

## 13. Related documents

- Alerts and metrics: [`21-observability.md`](./21-observability.md)
- Payments: [`10-payments-paystack.md`](./10-payments-paystack.md)
- Deployment and rollback: [`23-ci-cd-and-deployment.md`](./23-ci-cd-and-deployment.md)
- Security response: [`19-security.md § Incident response`](./19-security.md#17-incident-response)
- Keys and environments: [`22-configuration-and-environments.md`](./22-configuration-and-environments.md)
