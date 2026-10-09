-- identity_rls.test.sql
-- Profiles, user_roles, role_permissions, saved_searches, admin_filter_views.
-- Each test runs as a role by setting request GUCs, never as service_role.

create extension if not exists pgtap;

begin;

select plan(34);

-- Fixture users. handle_new_user() creates profiles + user_roles from app_metadata.
insert into auth.users (id, email, raw_app_meta_data) values
  ('30000000-0000-4000-8000-000000000001', 'admin@test.local',
   '{"courtland_roles":["admin"]}'),
  ('30000000-0000-4000-8000-000000000002', 'landlord@test.local',
   '{"courtland_roles":["landlord"]}'),
  ('30000000-0000-4000-8000-000000000003', 'tenant@test.local',
   '{"courtland_roles":["tenant"]}'),
  ('30000000-0000-4000-8000-000000000004', 'tenant2@test.local',
   '{"courtland_roles":["tenant"]}'),
  ('30000000-0000-4000-8000-000000000005', 'buyer@test.local',
   '{"courtland_roles":["buyer"]}');

update public.profiles set full_name = 'Admin Test'    where id = '30000000-0000-4000-8000-000000000001';
update public.profiles set full_name = 'Landlord Test' where id = '30000000-0000-4000-8000-000000000002';
update public.profiles set full_name = 'Tenant One'    where id = '30000000-0000-4000-8000-000000000003';
update public.profiles set full_name = 'Other Tenant'  where id = '30000000-0000-4000-8000-000000000004';
update public.profiles set full_name = 'Buyer Test'    where id = '30000000-0000-4000-8000-000000000005';

-- An expired admin grant: must be ignored by current_user_roles().
insert into public.user_roles (user_id, role, expires_at)
values ('30000000-0000-4000-8000-000000000003', 'admin', now() - interval '1 day');

-- A shared filter view created by staff (postgres). Visible only to client_filter_manage holders.
-- is_shared rows must carry an owner, per admin_filter_views_shared_needs_owner.
insert into public.admin_filter_views (id, owner_id, name, entity, filters, is_shared)
values ('31000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002',
        'Shared Clients View', 'clients', '{}', true);

-- ---------------------------------------------------------------------------
-- tenant
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000003', true);
-- claims carry the requested admin role; the expired grant must filter it back out
select set_config('request.jwt.claims',
  '{"sub":"30000000-0000-4000-8000-000000000003","role":"authenticated",
    "app_metadata":{"courtland_roles":["tenant","admin"]}}', true);

select results_eq(
  $$ select count(*)::text from public.profiles where id = '30000000-0000-4000-8000-000000000003' $$,
  ARRAY['1'], 'a tenant reads their own profile');

select results_eq(
  $$ select count(*)::text from public.profiles where id = '30000000-0000-4000-8000-000000000001' $$,
  ARRAY['0'], 'a tenant cannot read the admin profile');

select results_eq(
  $$ select count(*)::text from public.profiles where id = '30000000-0000-4000-8000-000000000004' $$,
  ARRAY['0'], 'a tenant cannot read another tenant profile by crafting a where clause');

select lives_ok(
  $$ update public.profiles
       set full_name = 'Tenant One Updated'
     where id = '30000000-0000-4000-8000-000000000003' $$,
  'a tenant may update their own profile');

select results_eq(
  $$ select count(*)::text from public.profiles
     where id = '30000000-0000-4000-8000-000000000003' and full_name = 'Tenant One Updated' $$,
  ARRAY['1'], 'the tenant profile update applied');

select lives_ok(
  $$ update public.profiles
       set full_name = 'pwned'
     where id = '30000000-0000-4000-8000-000000000004' $$,
  'updating a profile that RLS decides to be a 0-row change is silent');

-- The count must run as the owner: RLS hides other profiles from the tenant session that
-- performed the (silently ignored) update.
set local role postgres;

select results_eq(
  $$ select count(*)::text from public.profiles
     where id = '30000000-0000-4000-8000-000000000004' and full_name = 'Other Tenant' $$,
  ARRAY['1'], 'another tenant''s profile was not modified');

set local role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000003', true);

select is(private.has_permission('user_manage'), false,
  'an expired admin grant is ignored by has_permission');
-- A live admin grant would count. The grant row already exists (expired): make it live, assert,
-- then re-expire it. (user_id, role) is the primary key, so a second row cannot be inserted.
set local role postgres;
update public.user_roles set expires_at = null
 where user_id = '30000000-0000-4000-8000-000000000003' and role = 'admin';
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"30000000-0000-4000-8000-000000000003","role":"authenticated",
    "app_metadata":{"courtland_roles":["tenant","admin"]}}', true);

select is(private.has_permission('user_manage'), true,
  'a live admin grant is honoured');

set local role postgres;
update public.user_roles set expires_at = now() - interval '1 day'
 where user_id = '30000000-0000-4000-8000-000000000003' and role = 'admin';
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"30000000-0000-4000-8000-000000000003","role":"authenticated",
    "app_metadata":{"courtland_roles":["tenant","admin"]}}', true);

select is(private.has_permission('client_filter_manage'), false,
  'a tenant holds no client_filter_manage');

select throws_ok(
  $$ select * from public.user_roles $$,
  '42501', null, 'user_roles is not client-readable');

select throws_ok(
  $$ select * from public.role_permissions $$,
  '42501', null, 'role_permissions is not client-readable');

select throws_ok(
  $$ insert into public.user_roles (user_id, role) values
       ('30000000-0000-4000-8000-000000000004', 'admin') $$,
  '42501', null, 'a user cannot grant themselves (or anyone) admin');

select results_eq(
  $$ select count(*)::text from public.admin_filter_views $$,
  ARRAY['0'], 'a tenant sees no filter views');

select throws_ok(
  $$ insert into public.admin_filter_views (name, entity, filters, is_shared)
     values ('sneaky', 'clients', '{}', true) $$,
  '42501', null, 'a tenant cannot create a filter view');

select lives_ok(
  $$ insert into public.saved_searches (user_id, name, filters)
     values ('30000000-0000-4000-8000-000000000003', 'My Saved Search', '{}') $$,
  'a tenant can save their own search');

select results_eq(
  $$ select count(*)::text from public.saved_searches
     where user_id = '30000000-0000-4000-8000-000000000003' $$,
  ARRAY['1'], 'a tenant sees their own saved search');

select throws_ok(
  $$ insert into public.saved_searches (user_id, name, filters)
     values ('30000000-0000-4000-8000-000000000004', 'Forged', '{}') $$,
  '42501', null, 'a tenant cannot save a search under another user');

-- ---------------------------------------------------------------------------
-- landlord
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims',
  '{"sub":"30000000-0000-4000-8000-000000000002","role":"authenticated",
    "app_metadata":{"courtland_roles":["landlord"]}}', true);

select results_eq(
  $$ select count(*)::text from public.profiles where id = '30000000-0000-4000-8000-000000000002' $$,
  ARRAY['1'], 'a landlord reads their own profile');

select results_eq(
  $$ select count(*)::text from public.profiles where id = '30000000-0000-4000-8000-000000000001' $$,
  ARRAY['0'], 'a landlord cannot read the admin profile');

select throws_ok(
  $$ insert into public.admin_filter_views (name, entity, filters, is_shared)
     values ('sneaky', 'clients', '{}', true) $$,
  '42501', null, 'a landlord has no client_filter_manage either');

select results_eq(
  $$ select count(*)::text from public.admin_filter_views $$,
  ARRAY['0'], 'a landlord sees no filter views');

-- ---------------------------------------------------------------------------
-- buyer
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000005', true);
select set_config('request.jwt.claims',
  '{"sub":"30000000-0000-4000-8000-000000000005","role":"authenticated",
    "app_metadata":{"courtland_roles":["buyer"]}}', true);

select results_eq(
  $$ select count(*)::text from public.profiles where id = '30000000-0000-4000-8000-000000000005' $$,
  ARRAY['1'], 'a buyer reads their own profile');

select results_eq(
  $$ select count(*)::text from public.profiles where id = '30000000-0000-4000-8000-000000000003' $$,
  ARRAY['0'], 'a buyer cannot read a tenant profile');

-- ---------------------------------------------------------------------------
-- admin / staff
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims',
  '{"sub":"30000000-0000-4000-8000-000000000001","role":"authenticated",
    "app_metadata":{"courtland_roles":["admin"]}}', true);

select results_eq(
  $$ select count(*)::text from public.profiles
     where id in ('30000000-0000-4000-8000-000000000001',
                  '30000000-0000-4000-8000-000000000002',
                  '30000000-0000-4000-8000-000000000003',
                  '30000000-0000-4000-8000-000000000004',
                  '30000000-0000-4000-8000-000000000005',
                  '10000000-0000-4000-8000-000000000001',
                  '10000000-0000-4000-8000-000000000002',
                  '10000000-0000-4000-8000-000000000003',
                  '10000000-0000-4000-8000-000000000004') $$,
  ARRAY['9'], 'staff can read all profiles');

select lives_ok(
  $$ update public.profiles
       set full_name = 'Staff Renamed'
     where id = '30000000-0000-4000-8000-000000000004' $$,
  'staff can update any profile');

select results_eq(
  $$ select count(*)::text from public.profiles
     where id = '30000000-0000-4000-8000-000000000004' and full_name = 'Staff Renamed' $$,
  ARRAY['1'], 'the staff profile update applied');

select lives_ok(
  $$ insert into public.admin_filter_views
       (id, owner_id, name, entity, filters, is_shared)
     values ('31000000-0000-4000-8000-000000000002',
             '30000000-0000-4000-8000-000000000001', 'Admin Own View', 'clients', '{}', false) $$,
  'staff can create their own filter view');

select results_eq(
  $$ select count(*)::text from public.admin_filter_views
     where id = '31000000-0000-4000-8000-000000000002' $$,
  ARRAY['1'], 'staff sees their own filter view');

select results_eq(
  $$ select count(*)::text from public.admin_filter_views
     where id = '31000000-0000-4000-8000-000000000001' $$,
  ARRAY['1'], 'staff sees the shared filter view');

select throws_ok(
  $$ insert into public.role_permissions (role, permission) values ('tenant', 'settings_manage') $$,
  '42501', null, 'even staff cannot write the permission table directly');

-- ---------------------------------------------------------------------------
-- anon
-- ---------------------------------------------------------------------------
set local role anon;
select set_config('request.jwt.claims', '{}', true);
select set_config('request.jwt.claim.sub', '', true);

select throws_ok(
  $$ select * from public.profiles $$,
  '42501', null, 'anonymous cannot read profiles');

select is(auth.uid() is null, true, 'anonymous has no identity');

select throws_ok(
  $$ insert into public.saved_searches (user_id, name, filters)
     values ('30000000-0000-4000-8000-000000000003', 'anon', '{}') $$,
  '42501', null, 'anonymous cannot write saved_searches');

select * from finish();
rollback;