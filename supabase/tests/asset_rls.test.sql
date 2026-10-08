-- asset_rls.test.sql
-- owners, properties, property_media, land_details, units, sale_allocations.

create extension if not exists pgtap;

begin;

select plan(42);

-- Users
insert into auth.users (id, email, raw_app_meta_data) values
  ('41000000-0000-4000-8000-000000000011', 'landlord@test.local',
   '{"courtland_roles":["landlord"]}'),
  ('41000000-0000-4000-8000-000000000012', 'landlord2@test.local',
   '{"courtland_roles":["landlord"]}'),
  ('41000000-0000-4000-8000-000000000013', 'tenant@test.local',
   '{"courtland_roles":["tenant"]}'),
  ('41000000-0000-4000-8000-000000000014', 'staff@test.local',
   '{"courtland_roles":["admin"]}');

-- Owners
insert into public.owners (id, user_id, owner_type, legal_name, kyc_status) values
  ('41000000-0000-4000-8000-000000000001', '41000000-0000-4000-8000-000000000011',
   'individual', 'Landlord One', 'verified'),
  ('41000000-0000-4000-8000-000000000002', '41000000-0000-4000-8000-000000000012',
   'individual', 'Landlord Two', 'verified');

-- Properties
insert into public.properties
  (id, owner_id, slug, title, listing_type, property_type, status,
   address_line1, city, lga, state, price_kobo, price_cadence, published_at)
values
  ('41000000-0000-4000-8000-000000000021', '41000000-0000-4000-8000-000000000001',
   'fixture-draft-1', 'Fixture Draft One', 'rent', 'bungalow', 'draft',
   '2 Draft St', 'Lekki', 'Eti-Osa', 'Lagos', 5000000000, 'year', null),
  ('41000000-0000-4000-8000-000000000022', '41000000-0000-4000-8000-000000000002',
   'fixture-published-1', 'Fixture Published One', 'rent', 'bungalow', 'published',
   '3 Published Rd', 'Lekki', 'Eti-Osa', 'Lagos', 6000000000, 'year', now()),
  ('41000000-0000-4000-8000-000000000024', '41000000-0000-4000-8000-000000000002',
   'fixture-draft-2', 'Fixture Draft Two', 'rent', 'bungalow', 'draft',
   '4 Draft Ave', 'Lekki', 'Eti-Osa', 'Lagos', 4000000000, 'year', null);

-- published_at already set later for published rows; ensure the one marked published has it on insert? will adjust inserts next if needed

-- P3: published land for sale
insert into public.properties
  (id, owner_id, slug, title, listing_type, property_type, status,
   address_line1, city, lga, state, price_kobo, price_cadence)
values
  ('41000000-0000-4000-8000-000000000023', '41000000-0000-4000-8000-000000000002',
   'fixture-land-published', 'Fixture Land Published', 'sale', 'bungalow', 'draft',
   '5 Land Way', 'Ibeju-Lekki', 'Ibeju-Lekki', 'Lagos', 20000000000, 'outright', null);
insert into public.land_details (property_id, size_sqm, title_type)
values ('41000000-0000-4000-8000-000000000023', 10000, 'c_of_o');
update public.properties
   set property_type = 'land', status = 'published', published_at = now()
 where id = '41000000-0000-4000-8000-000000000023';

-- P5: draft land (details must stay hidden from anon)
insert into public.properties
  (id, owner_id, slug, title, listing_type, property_type, status,
   address_line1, city, lga, state, price_kobo, price_cadence)
values
  ('41000000-0000-4000-8000-000000000025', '41000000-0000-4000-8000-000000000002',
   'fixture-land-draft', 'Fixture Land Draft', 'sale', 'bungalow', 'draft',
   '6 Land Close', 'Ibeju-Lekki', 'Ibeju-Lekki', 'Lagos', 15000000000, 'outright');
insert into public.land_details (property_id, size_sqm, title_type)
values ('41000000-0000-4000-8000-000000000025', 8000, 'c_of_o');
update public.properties
   set property_type = 'land'
 where id = '41000000-0000-4000-8000-000000000025';

-- Units
insert into public.units (id, property_id, code, bedrooms, status, asking_rent_kobo) values
  ('41000000-0000-4000-8000-000000000031', '41000000-0000-4000-8000-000000000021',
   'U1', 2, 'vacant', 40000000),
  ('41000000-0000-4000-8000-000000000032', '41000000-0000-4000-8000-000000000022',
   'U2', 2, 'vacant', 50000000);

-- Media
insert into public.property_media (id, property_id, public_id, kind, sort_order, alt_text) values
  ('41000000-0000-4000-8000-000000000041', '41000000-0000-4000-8000-000000000021',
   'media_draft_1', 'image', 0, 'Draft one photo'),
  ('41000000-0000-4000-8000-000000000042', '41000000-0000-4000-8000-000000000022',
   'media_published_1', 'image', 0, 'Published one photo'),
  ('41000000-0000-4000-8000-000000000044', '41000000-0000-4000-8000-000000000024',
   'media_draft_2', 'image', 0, 'Draft two photo');

-- ---------------------------------------------------------------------------
-- anon
-- ---------------------------------------------------------------------------
set local role anon;
select set_config('request.jwt.claims', '{}', true);
select set_config('request.jwt.claim.sub', '', true);

select results_eq(
  $$ select count(*)::text from public.properties
     where id = '41000000-0000-4000-8000-000000000022' $$,
  ARRAY['1'], 'anonymous reads a published property');

select results_eq(
  $$ select count(*)::text from public.properties
     where id = '41000000-0000-4000-8000-000000000021' $$,
  ARRAY['0'], 'anonymous cannot read a draft property');

select results_eq(
  $$ select count(*)::text from public.units $$,
  ARRAY['0'], 'anonymous cannot read any unit (unit_read is a client permission)');

select results_eq(
  $$ select count(*)::text from public.land_details
     where property_id = '41000000-0000-4000-8000-000000000023' $$,
  ARRAY['1'], 'anonymous reads land details of a published land property');

select results_eq(
  $$ select count(*)::text from public.land_details
     where property_id = '41000000-0000-4000-8000-000000000025' $$,
  ARRAY['0'], 'land_details is hidden when the property is not published');

select results_eq(
  $$ select count(*)::text from public.property_media
     where property_id = '41000000-0000-4000-8000-000000000022' $$,
  ARRAY['1'], 'anonymous reads media of a published property');

select results_eq(
  $$ select count(*)::text from public.property_media
     where property_id = '41000000-0000-4000-8000-000000000021' $$,
  ARRAY['0'], 'anonymous cannot read media of a draft property');

select throws_ok(
  $$ insert into public.properties (owner_id, slug, title, listing_type, property_type,
                                    address_line1, city, lga, state, price_kobo)
     values ('41000000-0000-4000-8000-000000000001', 'anon-prop', 'Anon Prop',
             'rent', 'bungalow', '1 Anon St', 'Lekki', 'Eti-Osa', 'Lagos', 1000000) $$,
  '42501', null, 'anonymous cannot insert a property');

select throws_ok(
  $$ select * from public.owners $$,
  '42501', null, 'anonymous cannot read owners');

-- ---------------------------------------------------------------------------
-- landlord (owner of O1)
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '41000000-0000-4000-8000-000000000011', true);
select set_config('request.jwt.claims',
  '{"sub":"41000000-0000-4000-8000-000000000011","role":"authenticated",
    "app_metadata":{"courtland_roles":["landlord"]}}', true);

select results_eq(
  $$ select count(*)::text from public.properties
     where id = '41000000-0000-4000-8000-000000000021' $$,
  ARRAY['1'], 'an owner reads their own draft property');

select results_eq(
  $$ select count(*)::text from public.properties
     where id = '41000000-0000-4000-8000-000000000022' $$,
  ARRAY['1'], 'an owner reads a published property that belongs to another owner');

select results_eq(
  $$ select count(*)::text from public.properties
     where id = '41000000-0000-4000-8000-000000000024' $$,
  ARRAY['0'], 'an owner cannot read another owner draft');

select results_eq(
  $$ select count(*)::text from public.land_details
     where property_id = '41000000-0000-4000-8000-000000000025' $$,
  ARRAY['0'], 'an owner cannot read another owner unpublished land details');

select results_eq(
  $$ select count(*)::text from public.units
     where id = '41000000-0000-4000-8000-000000000031' $$,
  ARRAY['1'], 'an owner reads units on their own property');

select results_eq(
  $$ select count(*)::text from public.property_media
     where property_id = '41000000-0000-4000-8000-000000000021' $$,
  ARRAY['1'], 'an owner reads media on their own property');

select results_eq(
  $$ select count(*)::text from public.property_media
     where property_id = '41000000-0000-4000-8000-000000000024' $$,
  ARRAY['0'], 'an owner cannot read media of another owner draft');

select lives_ok(
  $$ insert into public.properties (owner_id, slug, title, listing_type, property_type,
                                    address_line1, city, lga, state, price_kobo)
     values ('41000000-0000-4000-8000-000000000001', 'l1-prop', 'L1 Prop',
             'rent', 'bungalow', '7 L1 St', 'Lekki', 'Eti-Osa', 'Lagos', 1000000) $$,
  'an owner can create a draft property on their own asset record');

select throws_ok(
  $$ insert into public.properties (owner_id, slug, title, listing_type, property_type,
                                    status, address_line1, city, lga, state, price_kobo)
     values ('41000000-0000-4000-8000-000000000001', 'l1-prop-pub', 'L1 Prop Pub',
             'rent', 'bungalow', 'published', '8 L1 St', 'Lekki', 'Eti-Osa', 'Lagos', 1000000) $$,
  '42501', null, 'an owner cannot self-publish at insert time');

select throws_ok(
  $$ update public.properties set status = 'published', published_at = now()
     where id = '41000000-0000-4000-8000-000000000021' $$,
  '42501', null, 'an owner cannot publish their own draft');

select lives_ok(
  $$ update public.properties set status = 'withdrawn'
     where id = '41000000-0000-4000-8000-000000000021' $$,
  'an owner may withdraw their own draft');

select lives_ok(
  $$ update public.units set notes = 'owner note'
     where id = '41000000-0000-4000-8000-000000000031' $$,
  'an owner can update a unit on their own property');

select lives_ok(
  $$ update public.units set notes = 'trespass'
     where id = '41000000-0000-4000-8000-000000000032' $$,
  'an owner updating a unit on another property is a silent no-op');

select results_eq(
  $$ select count(*)::text from public.units
     where id = '41000000-0000-4000-8000-000000000032' and notes is null $$,
  ARRAY['1'], 'the other owner unit was not modified');

select lives_ok(
  $$ delete from public.properties where id = '41000000-0000-4000-8000-000000000021' $$,
  'an owner delete of their own draft is a silent no-op');

select results_eq(
  $$ select count(*)::text from public.properties
     where id = '41000000-0000-4000-8000-000000000021' $$,
  ARRAY['1'], 'the draft still exists after the owner delete attempt');

-- ---------------------------------------------------------------------------
-- landlord 2 (owner of O2)
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '41000000-0000-4000-8000-000000000012', true);
select set_config('request.jwt.claims',
  '{"sub":"41000000-0000-4000-8000-000000000012","role":"authenticated",
    "app_metadata":{"courtland_roles":["landlord"]}}', true);

select results_eq(
  $$ select count(*)::text from public.properties
     where id = '41000000-0000-4000-8000-000000000024' $$,
  ARRAY['1'], 'owner two reads their own draft');

select results_eq(
  $$ select count(*)::text from public.property_media
     where property_id = '41000000-0000-4000-8000-000000000024' $$,
  ARRAY['1'], 'owner two reads their own media');

select results_eq(
  $$ select count(*)::text from public.property_media
     where property_id = '41000000-0000-4000-8000-000000000021' $$,
  ARRAY['0'], 'owner two cannot read owner one draft media');

-- ---------------------------------------------------------------------------
-- tenant
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '41000000-0000-4000-8000-000000000013', true);
select set_config('request.jwt.claims',
  '{"sub":"41000000-0000-4000-8000-000000000013","role":"authenticated",
    "app_metadata":{"courtland_roles":["tenant"]}}', true);

select results_eq(
  $$ select count(*)::text from public.properties
     where id = '41000000-0000-4000-8000-000000000022' $$,
  ARRAY['1'], 'a tenant reads the published property');

select results_eq(
  $$ select count(*)::text from public.properties
     where id = '41000000-0000-4000-8000-000000000021' $$,
  ARRAY['0'], 'a tenant cannot read the draft property');

select results_eq(
  $$ select count(*)::text from public.owners $$,
  ARRAY['0'], 'a tenant has no owner rows and sees none');

select throws_ok(
  $$ insert into public.properties (owner_id, slug, title, listing_type, property_type,
                                    address_line1, city, lga, state, price_kobo)
     values ('41000000-0000-4000-8000-000000000001', 'tenant-prop', 'Tenant Prop',
             'rent', 'bungalow', '1 Tenant St', 'Lekki', 'Eti-Osa', 'Lagos', 1000000) $$,
  '42501', null, 'a tenant cannot create a property');

select results_eq(
  $$ select count(*)::text from public.units
     where id in ('41000000-0000-4000-8000-000000000031',
                  '41000000-0000-4000-8000-000000000032') $$,
  ARRAY['2'], 'a tenant with unit_read sees all vacant units regardless of property status');

-- ---------------------------------------------------------------------------
-- staff
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '41000000-0000-4000-8000-000000000014', true);
select set_config('request.jwt.claims',
  '{"sub":"41000000-0000-4000-8000-000000000014","role":"authenticated",
    "app_metadata":{"courtland_roles":["admin"]}}', true);

select results_eq(
  $$ select count(*)::text from public.properties
     where id in ('41000000-0000-4000-8000-000000000021',
                  '41000000-0000-4000-8000-000000000022',
                  '41000000-0000-4000-8000-000000000023',
                  '41000000-0000-4000-8000-000000000024',
                  '41000000-0000-4000-8000-000000000025') $$,
  ARRAY['5'], 'staff reads every fixture property, draft or published');

select lives_ok(
  $$ insert into public.properties (owner_id, slug, title, listing_type, property_type,
                                    address_line1, city, lga, state, price_kobo)
     values ('41000000-0000-4000-8000-000000000001', 'staff-prop', 'Staff Prop',
             'rent', 'bungalow', '9 Staff St', 'Lekki', 'Eti-Osa', 'Lagos', 1000000) $$,
  'staff can create a property');

select lives_ok(
  $$ update public.properties
        set status = 'published', published_at = now()
      where id = '41000000-0000-4000-8000-000000000021' $$,
  'staff can publish a property');

select results_eq(
  $$ select count(*)::text from public.properties
     where id = '41000000-0000-4000-8000-000000000021' and status = 'published' $$,
  ARRAY['1'], 'staff publication applied');

select lives_ok(
  $$ delete from public.properties where id = '41000000-0000-4000-8000-000000000024' $$,
  'staff can delete a property with no contracts');

select results_eq(
  $$ select count(*)::text from public.properties
     where id = '41000000-0000-4000-8000-000000000024' $$,
  ARRAY['0'], 'the contract-free property was deleted');

select lives_ok(
  $$ delete from public.properties where id = '20000000-0000-4000-8000-000000000002' $$,
  'deleting a property with a contract is a silent no-op');

select results_eq(
  $$ select count(*)::text from public.properties
     where id = '20000000-0000-4000-8000-000000000002' $$,
  ARRAY['1'], 'the seeded property with a contract still exists');

select * from finish();
rollback;