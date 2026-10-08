-- ops_rls.test.sql
-- maintenance_tickets, ticket_updates, notices, disputes.

create extension if not exists pgtap;

begin;

select plan(31);

-- Users
insert into auth.users (id, email, raw_app_meta_data) values
  ('77000000-0000-4000-8000-000000000001', 'tenant@test.local',
   '{"courtland_roles":["tenant"]}'),
  ('77000000-0000-4000-8000-000000000002', 'tenant2@test.local',
   '{"courtland_roles":["tenant"]}'),
  ('77000000-0000-4000-8000-000000000003', 'landlord@test.local',
   '{"courtland_roles":["landlord"]}'),
  ('77000000-0000-4000-8000-000000000004', 'landlord2@test.local',
   '{"courtland_roles":["landlord"]}'),
  ('77000000-0000-4000-8000-000000000005', 'staff@test.local',
   '{"courtland_roles":["admin"]}');

-- Owners, properties, units
insert into public.owners (id, user_id, owner_type, legal_name, kyc_status) values
  ('77000000-0000-4000-8000-000000000011', '77000000-0000-4000-8000-000000000003',
   'individual', 'Ops Landlord', 'verified'),
  ('77000000-0000-4000-8000-000000000012', '77000000-0000-4000-8000-000000000004',
   'individual', 'Ops Landlord Two', 'verified');

insert into public.properties
  (id, owner_id, slug, title, listing_type, property_type, status,
   address_line1, city, lga, state, price_kobo, published_at)
values
  ('77000000-0000-4000-8000-000000000021', '77000000-0000-4000-8000-000000000011',
   'ops-prop-1', 'Ops Prop One', 'rent', 'bungalow', 'published',
   '1 Ops St', 'Lekki', 'Eti-Osa', 'Lagos', 9000000000, now()),
  ('77000000-0000-4000-8000-000000000022', '77000000-0000-4000-8000-000000000012',
   'ops-prop-2', 'Ops Prop Two', 'rent', 'bungalow', 'published',
   '2 Ops St', 'Lekki', 'Eti-Osa', 'Lagos', 8000000000, now());

insert into public.units (id, property_id, code, bedrooms, status, asking_rent_kobo) values
  ('77000000-0000-4000-8000-000000000031', '77000000-0000-4000-8000-000000000021',
   'A1', 2, 'vacant', 50000000),
  ('77000000-0000-4000-8000-000000000032', '77000000-0000-4000-8000-000000000022',
   'B1', 2, 'vacant', 60000000);

-- Occupancy: each tenant holds the active lease on their unit.
insert into public.contracts
  (id, kind, property_id, unit_id, owner_id, primary_payer_id, status,
   start_date, end_date, total_kobo, outstanding_kobo,
   rent_kobo, rent_cadence_months, service_charge_kobo, security_deposit_kobo)
values
  ('77000000-0000-4000-8000-000000000071', 'lease',
   '77000000-0000-4000-8000-000000000021', '77000000-0000-4000-8000-000000000031',
   '77000000-0000-4000-8000-000000000011', '77000000-0000-4000-8000-000000000001',
   'active', date '2026-01-01', date '2027-12-31', 50000000, 50000000,
   50000000, 12, 0, 0),
  ('77000000-0000-4000-8000-000000000072', 'lease',
   '77000000-0000-4000-8000-000000000022', '77000000-0000-4000-8000-000000000032',
   '77000000-0000-4000-8000-000000000012', '77000000-0000-4000-8000-000000000002',
   'active', date '2026-01-01', date '2027-12-31', 60000000, 60000000,
   60000000, 12, 0, 0);

-- Tickets
insert into public.maintenance_tickets
  (id, property_id, unit_id, raised_by, category, title, description, status)
values
  ('77000000-0000-4000-8000-000000000041', '77000000-0000-4000-8000-000000000021',
   '77000000-0000-4000-8000-000000000031', '77000000-0000-4000-8000-000000000001',
   'plumbing', 'Leaking tap', 'The kitchen tap drips', 'open'),
  ('77000000-0000-4000-8000-000000000042', '77000000-0000-4000-8000-000000000022',
   '77000000-0000-4000-8000-000000000032', '77000000-0000-4000-8000-000000000002',
   'electrical', 'Socket sparking', 'Bedroom socket sparks', 'open');

-- Updates: one shared, one internal (staff note)
insert into public.ticket_updates
  (id, ticket_id, author_id, body, visibility) values
  ('77000000-0000-4000-8000-000000000051', '77000000-0000-4000-8000-000000000041',
   '77000000-0000-4000-8000-000000000001', 'Please hurry', 'shared'),
  ('77000000-0000-4000-8000-000000000052', '77000000-0000-4000-8000-000000000041',
   '77000000-0000-4000-8000-000000000005', 'Contractor quoted', 'internal');

-- Notices
insert into public.notices
  (id, kind, channel, recipient_user_id, recipient_address, template_key, status, dedupe_key)
values
  ('77000000-0000-4000-8000-000000000061', 'rent_reminder', 'email',
   '77000000-0000-4000-8000-000000000001', 'tenant@test.local', 'rent_reminder', 'sent',
   'ops-n-1'),
  ('77000000-0000-4000-8000-000000000062', 'rent_reminder', 'email',
   '77000000-0000-4000-8000-000000000001', 'tenant@test.local', 'rent_reminder', 'queued',
   'ops-n-2'),
  ('77000000-0000-4000-8000-000000000063', 'payout_processed', 'email',
   '77000000-0000-4000-8000-000000000005', 'staff@test.local', 'payout_processed', 'sent',
   'ops-n-3');

-- ---------------------------------------------------------------------------
-- raiser tenant
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '77000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims',
  '{"sub":"77000000-0000-4000-8000-000000000001","role":"authenticated",
    "app_metadata":{"courtland_roles":["tenant"]}}', true);

select results_eq(
  $$ select count(*)::text from public.maintenance_tickets
     where id = '77000000-0000-4000-8000-000000000041' $$,
  ARRAY['1'], 'a tenant reads the ticket they raised');

select results_eq(
  $$ select count(*)::text from public.maintenance_tickets
     where id = '77000000-0000-4000-8000-000000000042' $$,
  ARRAY['0'], 'a tenant cannot read another tenant ticket');

select results_eq(
  $$ select count(*)::text from public.ticket_updates
     where ticket_id = '77000000-0000-4000-8000-000000000041' and visibility = 'shared' $$,
  ARRAY['1'], 'a tenant reads shared updates on their ticket');

select results_eq(
  $$ select count(*)::text from public.ticket_updates
     where id = '77000000-0000-4000-8000-000000000052' $$,
  ARRAY['0'], 'internal visibility updates are hidden from the tenant');

select results_eq(
  $$ select count(*)::text from public.notices
     where id = '77000000-0000-4000-8000-000000000061' $$,
  ARRAY['1'], 'a tenant reads a sent notice addressed to them');

select results_eq(
  $$ select count(*)::text from public.notices
     where id = '77000000-0000-4000-8000-000000000062' $$,
  ARRAY['0'], 'queued notices are not visible to the recipient');

select lives_ok(
  $$ insert into public.maintenance_tickets
       (property_id, unit_id, raised_by, category, title, description, status)
     values ('77000000-0000-4000-8000-000000000021',
             '77000000-0000-4000-8000-000000000031',
             '77000000-0000-4000-8000-000000000001',
             'plumbing', 'Blocked drain', 'Drain blocked', 'open') $$,
  'a tenant can raise a ticket on their own unit');

select throws_ok(
  $$ insert into public.maintenance_tickets
       (property_id, unit_id, raised_by, category, title, description, status)
     values ('77000000-0000-4000-8000-000000000022',
             '77000000-0000-4000-8000-000000000032',
             '77000000-0000-4000-8000-000000000001',
             'plumbing', 'Vandalism', 'Other unit', 'open') $$,
  '42501', null, 'a tenant cannot raise a ticket on a unit they do not occupy');

select throws_ok(
  $$ insert into public.maintenance_tickets
       (property_id, unit_id, raised_by, category, title, description,
        quoted_amount_kobo, status)
     values ('77000000-0000-4000-8000-000000000021',
             '77000000-0000-4000-8000-000000000031',
             '77000000-0000-4000-8000-000000000001',
             'plumbing', 'Quote attached', 'Cost appended', 500000, 'open') $$,
  '42501', null, 'a tenant cannot attach a cost to a ticket');

select throws_ok(
  $$ insert into public.maintenance_tickets
       (property_id, unit_id, raised_by, category, title, description, status)
     values ('77000000-0000-4000-8000-000000000021',
             '77000000-0000-4000-8000-000000000031',
             '77000000-0000-4000-8000-000000000001',
             'plumbing', 'Closed on raise', 'Already closed', 'closed') $$,
  '42501', null, 'a ticket must be raised open');

select throws_ok(
  $$ insert into public.maintenance_tickets
       (property_id, unit_id, raised_by, category, title, description, status)
     values ('77000000-0000-4000-8000-000000000021',
             '77000000-0000-4000-8000-000000000031',
             '77000000-0000-4000-8000-000000000002',
             'plumbing', 'Forged raiser', 'Someone else', 'open') $$,
  '42501', null, 'a ticket must be raised by the current user');

select lives_ok(
  $$ update public.maintenance_tickets
        set title = 'Leaking tap (fixed later)'
      where id = '77000000-0000-4000-8000-000000000041' $$,
  'a raiser can update their own open ticket');

select results_eq(
  $$ select count(*)::text from public.maintenance_tickets
     where id = '77000000-0000-4000-8000-000000000041'
       and title = 'Leaking tap (fixed later)' $$,
  ARRAY['1'], 'the ticket update applied');

select throws_ok(
  $$ update public.maintenance_tickets
        set quoted_amount_kobo = 300000
      where id = '77000000-0000-4000-8000-000000000041' $$,
  '42501', null, 'a raiser cannot set a cost on their ticket');

select throws_ok(
  $$ insert into public.ticket_updates (ticket_id, author_id, body, visibility)
     values ('77000000-0000-4000-8000-000000000041',
             '77000000-0000-4000-8000-000000000001', 'update', 'shared') $$,
  '42501', null, 'ticket_updates are not client-writable');

select throws_ok(
  $$ insert into public.notices
       (kind, channel, recipient_user_id, recipient_address, template_key, dedupe_key)
     values ('welcome', 'email', '77000000-0000-4000-8000-000000000001',
             'tenant@test.local', 'welcome', 'ops-n-x') $$,
  '42501', null, 'notices are not client-writable');

select throws_ok(
  $$ insert into public.disputes (contract_id, raised_by, category, description)
     values ('77000000-0000-4000-8000-000000000071',
             '77000000-0000-4000-8000-000000000001', 'maintenance', 'Dispute') $$,
  '42501', null, 'client insert into disputes is denied despite the permission matrix');

select throws_ok(
  $$ select * from public.disputes $$,
  '42501', null, 'disputes are not client-readable');

-- ---------------------------------------------------------------------------
-- property owner (landlord of O1)
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '77000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claims',
  '{"sub":"77000000-0000-4000-8000-000000000003","role":"authenticated",
    "app_metadata":{"courtland_roles":["landlord"]}}', true);

select results_eq(
  $$ select count(*)::text from public.maintenance_tickets
     where id = '77000000-0000-4000-8000-000000000041' $$,
  ARRAY['1'], 'the property owner reads tickets on their own property');

select results_eq(
  $$ select count(*)::text from public.maintenance_tickets
     where id = '77000000-0000-4000-8000-000000000042' $$,
  ARRAY['0'], 'the property owner cannot read tickets on another property');

select results_eq(
  $$ select count(*)::text from public.notices $$,
  ARRAY['0'], 'the owner is neither recipient nor staff so reads no notices');

select lives_ok(
  $$ insert into public.maintenance_tickets
       (property_id, unit_id, raised_by, category, title, description, status)
     values ('77000000-0000-4000-8000-000000000021',
             '77000000-0000-4000-8000-000000000031',
             '77000000-0000-4000-8000-000000000003',
             'plumbing', 'Owner raised', 'Raised by owner', 'open') $$,
  'the property owner can raise a ticket on their own property');

-- ---------------------------------------------------------------------------
-- staff
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '77000000-0000-4000-8000-000000000005', true);
select set_config('request.jwt.claims',
  '{"sub":"77000000-0000-4000-8000-000000000005","role":"authenticated",
    "app_metadata":{"courtland_roles":["admin"]}}', true);

select ok(
  (select count(*) from public.maintenance_tickets
     where id in ('77000000-0000-4000-8000-000000000041',
                  '77000000-0000-4000-8000-000000000042')) >= 2,
  'staff reads every ticket');

select results_eq(
  $$ select count(*)::text from public.ticket_updates $$,
  ARRAY['2'], 'staff reads shared and internal updates');

select results_eq(
  $$ select count(*)::text from public.notices $$,
  ARRAY['3'], 'staff (notice_send) reads every notice, queued or sent');

select throws_ok(
  $$ insert into public.notices
       (kind, channel, recipient_user_id, recipient_address, template_key, dedupe_key)
     values ('welcome', 'email', '77000000-0000-4000-8000-000000000005',
             'staff@test.local', 'welcome', 'ops-n-y') $$,
  '42501', null, 'staff cannot write notices either');

select lives_ok(
  $$ update public.maintenance_tickets
        set title = 'staff title'
      where id = '77000000-0000-4000-8000-000000000041' $$,
  'staff editing a ticket they did not raise is a silent no-op');

select results_eq(
  $$ select count(*)::text from public.maintenance_tickets
     where id = '77000000-0000-4000-8000-000000000041'
       and title = 'Leaking tap (fixed later)' $$,
  ARRAY['1'], 'the raiser title was not overwritten');

select throws_ok(
  $$ delete from public.maintenance_tickets
     where id = '77000000-0000-4000-8000-000000000041' $$,
  '42501', null, 'tickets are not deletable by clients (no delete grant)');

-- ---------------------------------------------------------------------------
-- anon
-- ---------------------------------------------------------------------------
set local role anon;
select set_config('request.jwt.claims', '{}', true);
select set_config('request.jwt.claim.sub', '', true);

select throws_ok(
  $$ select * from public.maintenance_tickets $$,
  '42501', null, 'anonymous cannot read tickets');

select throws_ok(
  $$ select * from public.notices $$,
  '42501', null, 'anonymous cannot read notices');

select * from finish();
rollback;