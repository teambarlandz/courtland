alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.role_permissions enable row level security;
alter table public.saved_searches enable row level security;
alter table public.admin_filter_views enable row level security;

create policy profiles_select_own on public.profiles
for select to authenticated
using ( id = auth.uid() );

create policy profiles_select_staff on public.profiles
for select to authenticated
using ( private.has_permission('user_manage') );

create policy profiles_update_own on public.profiles
for update to authenticated
using ( id = auth.uid() )
with check ( id = auth.uid() );

-- With check (true) here is a cross-policy hazard: Postgres may satisfy the USING of the own-row
-- policy and the WITH CHECK of this one separately, which would let a user re-key their own row to
-- another id. Staff edits must therefore restate the permission.
create policy profiles_update_staff on public.profiles
for update to authenticated
using ( private.has_permission('user_manage') )
with check ( id = auth.uid() or private.has_permission('user_manage') );

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
