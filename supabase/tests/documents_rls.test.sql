-- documents_rls.test.sql
-- documents, document_access_log.

create extension if not exists pgtap;

begin;

select plan(22);

-- Users
insert into auth.users (id, email, raw_app_meta_data) values
  ('88000000-0000-4000-8000-000000000001', 'buyer@test.local',
   '{"courtland_roles":["buyer"]}'),
  ('88000000-0000-4000-8000-000000000002', 'landlord@test.local',
   '{"courtland_roles":["landlord"]}'),
  ('88000000-0000-4000-8000-000000000003', 'landlord2@test.local',
   '{"courtland_roles":["landlord"]}'),
  ('88000000-0000-4000-8000-000000000004', 'staff@test.local',
   '{"courtland_roles":["admin"]}');

-- Owners
insert into public.owners (id, user_id, owner_type, legal_name, kyc_status) values
  ('88000000-0000-4000-8000-000000000011', '88000000-0000-4000-8000-000000000002',
   'individual', 'Doc Landlord', 'verified'),
  ('88000000-0000-4000-8000-000000000012', '88000000-0000-4000-8000-000000000003',
   'individual', 'Doc Landlord Two', 'verified');

-- Properties
insert into public.properties
  (id, owner_id, slug, title, listing_type, property_type, status,
   address_line1, city, lga, state, price_kobo, published_at)
values
  ('88000000-0000-4000-8000-000000000021', '88000000-0000-4000-8000-000000000011',
   'doc-prop-1', 'Doc Prop One', 'sale', 'bungalow', 'published',
   '1 Doc St', 'Lekki', 'Eti-Osa', 'Lagos', 50000000000, now()),
  ('88000000-0000-4000-8000-000000000022', '88000000-0000-4000-8000-000000000012',
   'doc-prop-2', 'Doc Prop Two', 'rent', 'bungalow', 'published',
   '2 Doc St', 'Lekki', 'Eti-Osa', 'Lagos', 9000000000, now());

insert into public.units (id, property_id, code, bedrooms, status, asking_rent_kobo)
values ('88000000-0000-4000-8000-000000000031', '88000000-0000-4000-8000-000000000022',
        'A1', 2, 'vacant', 50000000);

-- Sale contract between the seller (O1) and the buyer
insert into public.contracts
  (id, kind, property_id, owner_id, primary_payer_id, status, payment_plan,
   installment_count, total_kobo, outstanding_kobo, title_release_status)
values
  ('88000000-0000-4000-8000-000000000041', 'sale',
   '88000000-0000-4000-8000-000000000021', '88000000-0000-4000-8000-000000000011',
   '88000000-0000-4000-8000-000000000001', 'active', 'outright', 1,
   500000000, 500000000, 'not_eligible');

-- Documents
insert into public.documents
  (id, origin, kind, visibility, status, contract_id, owner_id, title, filename,
   storage_public_id, byte_size, checksum_sha256, template_key, template_version,
   issued_at, released_at, created_by)
values
  -- Released counterparty document on the buyer's contract
  ('88000000-0000-4000-8000-000000000051', 'generated', 'contract_of_sale',
   'counterparty', 'released', '88000000-0000-4000-8000-000000000041',
   '88000000-0000-4000-8000-000000000011', 'Contract of Sale', 'sale.pdf',
   'doc_storage_1', 2048, repeat('a', 64), 'contract_of_sale', 1,
   now() - interval '1 day', now() - interval '1 day', '88000000-0000-4000-8000-000000000004'),
  -- Private document on the same contract: nobody but staff.
  ('88000000-0000-4000-8000-000000000052', 'generated', 'contract_of_sale',
   'private', 'draft', '88000000-0000-4000-8000-000000000041',
   '88000000-0000-4000-8000-000000000011', 'Internal draft', 'draft.pdf',
   null, null, null, 'contract_of_sale', 1, null, null, '88000000-0000-4000-8000-000000000004'),
  -- Released counterparty document on landlord2's property
  ('88000000-0000-4000-8000-000000000053', 'uploaded', 'title_deed',
   'counterparty', 'released', null, '88000000-0000-4000-8000-000000000012',
   'Title Deed', 'title.pdf',
   'doc_storage_3', 4096, repeat('b', 64), null, null,
   now() - interval '1 day', now() - interval '1 day', '88000000-0000-4000-8000-000000000004'),
  -- Private uploaded document on landlord2's property
  ('88000000-0000-4000-8000-000000000054', 'uploaded', 'title_deed',
   'private', 'draft', null, '88000000-0000-4000-8000-000000000012',
   'Private deed', 'private.pdf', null, null, null, null, null, null, null,
   '88000000-0000-4000-8000-000000000004');

-- Access log: one row per party, both should be invisible to the parties themselves.
insert into public.document_access_log (document_id, user_id, action) values
  ('88000000-0000-4000-8000-000000000053', '88000000-0000-4000-8000-000000000003', 'view'),
  ('88000000-0000-4000-8000-000000000051', '88000000-0000-4000-8000-000000000001', 'view');

-- ---------------------------------------------------------------------------
-- buyer
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '88000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims',
  '{"sub":"88000000-0000-4000-8000-000000000001","role":"authenticated",
    "app_metadata":{"courtland_roles":["buyer"]}}', true);

select results_eq(
  $$ select count(*)::text from public.documents
     where id = '88000000-0000-4000-8000-000000000051' $$,
  ARRAY['1'], 'a buyer reads a released counterparty document on their contract');

select results_eq(
  $$ select count(*)::text from public.documents
     where id = '88000000-0000-4000-8000-000000000052' $$,
  ARRAY['0'], 'private documents on their own contract are invisible');

select results_eq(
  $$ select count(*)::text from public.documents
     where id = '88000000-0000-4000-8000-000000000053' $$,
  ARRAY['0'], 'a buyer cannot read documents on a property they have nothing to do with');

select results_eq(
  $$ select count(*)::text from public.documents
     where id = '88000000-0000-4000-8000-000000000054' $$,
  ARRAY['0'], 'a buyer cannot read any private document');

select results_eq(
  $$ select count(*)::text from public.document_access_log $$,
  ARRAY['0'], 'document access is staff-only even for the party that logged the access');

select throws_ok(
  $$ insert into public.documents (origin, kind, visibility, status, title, filename)
     values ('uploaded', 'receipt_evidence', 'private', 'draft', 'Proof', 'proof.pdf') $$,
  '42501', null, 'a buyer cannot upload documents');

select throws_ok(
  $$ insert into public.document_access_log (document_id, user_id, action)
     values ('88000000-0000-4000-8000-000000000051',
             '88000000-0000-4000-8000-000000000001', 'view') $$,
  '42501', null, 'a buyer cannot write the access log');

-- ---------------------------------------------------------------------------
-- landlord 2 (owner of O2)
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '88000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claims',
  '{"sub":"88000000-0000-4000-8000-000000000003","role":"authenticated",
    "app_metadata":{"courtland_roles":["landlord"]}}', true);

select results_eq(
  $$ select count(*)::text from public.documents
     where id = '88000000-0000-4000-8000-000000000053' $$,
  ARRAY['1'], 'a landlord reads documents on their own property');

select results_eq(
  $$ select count(*)::text from public.documents
     where id = '88000000-0000-4000-8000-000000000054' $$,
  ARRAY['0'], 'a private document on their own property is invisible');

select results_eq(
  $$ select count(*)::text from public.documents
     where id = '88000000-0000-4000-8000-000000000051' $$,
  ARRAY['0'], 'a landlord cannot read documents on another owner contract');

select results_eq(
  $$ select count(*)::text from public.documents
     where id = '88000000-0000-4000-8000-000000000052' $$,
  ARRAY['0'], 'a landlord cannot read another owner private document');

select lives_ok(
  $$ insert into public.documents
       (id, origin, kind, visibility, status, owner_id, title, filename)
     values ('88000000-0000-4000-8000-000000000055', 'uploaded', 'id_verification',
             'private', 'draft', '88000000-0000-4000-8000-000000000012',
             'My ID', 'id.pdf') $$,
  'an owner may upload KYC identity documents against their own owner record');

select results_eq(
  $$ select count(*)::text from public.documents
     where id = '88000000-0000-4000-8000-000000000055' $$,
  ARRAY['0'], 'the uploaded private KYC row is not readable back by the owner');

select throws_ok(
  $$ insert into public.documents (origin, kind, visibility, status, owner_id, title, filename)
     values ('uploaded', 'title_deed', 'private', 'draft',
             '88000000-0000-4000-8000-000000000012', 'Deed', 'deed.pdf') $$,
  '42501', null, 'portal uploads are limited to id_verification');

select throws_ok(
  $$ insert into public.documents (origin, kind, visibility, status, owner_id, title, filename)
     values ('uploaded', 'id_verification', 'private', 'draft',
             '88000000-0000-4000-8000-000000000011', 'Fake ID', 'fake.pdf') $$,
  '42501', null, 'an owner cannot upload KYC against another owner record');

-- ---------------------------------------------------------------------------
-- seller landlord (owner of O1, the sale contract)
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '88000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims',
  '{"sub":"88000000-0000-4000-8000-000000000002","role":"authenticated",
    "app_metadata":{"courtland_roles":["landlord"]}}', true);

select results_eq(
  $$ select count(*)::text from public.documents
     where id = '88000000-0000-4000-8000-000000000051' $$,
  ARRAY['1'], 'the seller landlord reads released documents on their property');

-- ---------------------------------------------------------------------------
-- staff
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '88000000-0000-4000-8000-000000000004', true);
select set_config('request.jwt.claims',
  '{"sub":"88000000-0000-4000-8000-000000000004","role":"authenticated",
    "app_metadata":{"courtland_roles":["admin"]}}', true);

select results_eq(
  $$ select count(*)::text from public.documents
     where id in ('88000000-0000-4000-8000-000000000051',
                  '88000000-0000-4000-8000-000000000052',
                  '88000000-0000-4000-8000-000000000053',
                  '88000000-0000-4000-8000-000000000054',
                  '88000000-0000-4000-8000-000000000055') $$,
  ARRAY['5'], 'staff reads every document, private or released');

select results_eq(
  $$ select count(*)::text from public.document_access_log $$,
  ARRAY['2'], 'staff reads the entire access log');

select throws_ok(
  $$ insert into public.document_access_log (document_id, user_id, action)
     values ('88000000-0000-4000-8000-000000000051',
             '88000000-0000-4000-8000-000000000004', 'view') $$,
  '42501', null, 'the access log is append-only via service role, not staff SQL');

select throws_ok(
  $$ update public.documents set title = 'hacked'
     where id = '88000000-0000-4000-8000-000000000051' $$,
  '42501', null, 'no client role can update a document');

-- ---------------------------------------------------------------------------
-- anon
-- ---------------------------------------------------------------------------
set local role anon;
select set_config('request.jwt.claims', '{}', true);
select set_config('request.jwt.claim.sub', '', true);

select throws_ok(
  $$ select * from public.documents $$,
  '42501', null, 'anonymous cannot read documents');

select throws_ok(
  $$ select * from public.document_access_log $$,
  '42501', null, 'anonymous cannot read the access log');

select * from finish();
rollback;