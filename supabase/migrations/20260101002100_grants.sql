revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema private from anon, authenticated, public;
alter default privileges in schema public
  revoke all on tables from anon, authenticated;
alter default privileges in schema public
  revoke all on sequences from anon, authenticated;

grant select on public.property_search to anon, authenticated;
grant select on public.properties to anon;   -- RLS restricts to published
grant select on public.property_media to anon;
grant select on public.land_details to anon;
grant select on public.owners to authenticated;  -- RLS restricts to self; only legal_name is projected
grant select on public.profiles to authenticated;
grant update (full_name, avatar_public_id) on public.profiles to authenticated;

grant usage on schema public to anon, authenticated;
revoke all on schema private from anon, authenticated;

grant select on public.properties to authenticated;
grant insert, update, delete on public.properties to authenticated;
grant select on public.property_media to authenticated;
grant select on public.land_details to authenticated;
grant select on public.units to anon, authenticated;
grant update on public.units to authenticated;
grant select, insert, update on public.contracts to authenticated;
grant select, insert, update on public.payment_intents to authenticated;
grant select on public.payments_ledger to authenticated;
grant select on public.ledger_allocations to authenticated;
grant select, insert, update on public.maintenance_tickets to authenticated;
grant select on public.ticket_updates to authenticated;
grant select on public.notices to authenticated;
grant select, insert on public.documents to authenticated;
grant select on public.document_access_log to authenticated;
grant select on public.audit_log to authenticated;
grant select on public.idempotency_keys to authenticated;
grant select, insert, update, delete on public.saved_searches to authenticated;
grant select, insert, update, delete on public.admin_filter_views to authenticated;
