alter table public.maintenance_tickets enable row level security;
alter table public.ticket_updates enable row level security;
alter table public.notices enable row level security;
alter table public.disputes enable row level security;

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

create policy ticket_updates_select_own on public.ticket_updates
for select to authenticated
using (
  private.has_permission('ticket_read_own')
  and visibility = 'shared'
  and private.ticket_is_mine(ticket_id)
);

create policy ticket_updates_select_staff on public.ticket_updates
for select to authenticated
using ( private.has_permission('ticket_read_any') );

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
