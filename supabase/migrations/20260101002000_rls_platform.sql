alter table public.webhook_events enable row level security;
alter table public.idempotency_keys enable row level security;
alter table public.outbox_events enable row level security;
alter table public.audit_log enable row level security;
alter table public.job_runs enable row level security;
alter table public.feature_flags enable row level security;

create policy audit_log_select_staff on public.audit_log
for select to authenticated
using ( private.has_permission('audit_read') );
-- No insert, update or delete policy for any client role.
-- capture_audit() is security definer and owned by postgres; it inserts regardless of caller RLS.

-- outbox_events, webhook_events, job_runs and feature_flags have no policies at all.
-- Not even a select policy. service_role bypasses RLS; clients get nothing.

create policy idempotency_keys_select_own on public.idempotency_keys
for select to authenticated
using ( user_id = auth.uid() );
-- Writes are service_role only, from the idempotency middleware.
