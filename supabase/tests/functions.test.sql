-- functions.test.sql
-- Tests for private helper functions and allocation functions.

create extension if not exists pgtap;

begin;

select plan(32);

-- Users
insert into auth.users (id, email, raw_app_meta_data) values
  ('b0000000-0000-4000-8000-000000000001', 'staff@test.local',
   '{"courtland_roles":["admin"]}'),
  ('b0000000-0000-4000-8000-000000000002', 'tenant@test.local',
   '{"courtland_roles":["tenant"]}'),
  ('b0000000-0000-4000-8000-000000000003', 'landlord@test.local',
   '{"courtland_roles":["landlord"]}');

-- Fixture data
insert into public.owners (id, user_id, owner_type, legal_name, kyc_status) values
  ('b0000000-0000-4000-8000-000000000011', 'b0000000-0000-4000-8000-000000000003',
   'individual', 'Fn Landlord', 'verified');

insert into public.properties
  (id, owner_id, slug, title, listing_type, property_type, status,
   address_line1, city, lga, state, price_kobo, published_at)
values
  ('b0000000-0000-4000-8000-000000000021', 'b0000000-0000-4000-8000-000000000011',
   'fn-rent-1', 'Fn Rent One', 'rent', 'bungalow', 'published',
   '1 Fn St', 'Lekki', 'Eti-Osa', 'Lagos', 9000000000, now());

insert into public.units (id, property_id, code, bedrooms, status, asking_rent_kobo) values
  ('b0000000-0000-4000-8000-000000000031', 'b0000000-0000-4000-8000-000000000021',
   'A1', 2, 'vacant', 50000000);

insert into public.contracts
  (id, kind, property_id, unit_id, owner_id, primary_payer_id, status,
   start_date, end_date, total_kobo, outstanding_kobo,
   rent_kobo, rent_cadence_months)
values
  ('b0000000-0000-4000-8000-000000000041', 'lease',
   'b0000000-0000-4000-8000-000000000021', 'b0000000-0000-4000-8000-000000000031',
   'b0000000-0000-4000-8000-000000000011', 'b0000000-0000-4000-8000-000000000002',
   'active', date '2026-01-01', date '2027-12-31', 50000000, 50000000,
   50000000, 12);

insert into public.user_roles (user_id, role) values
  ('b0000000-0000-4000-8000-000000000001', 'admin'),
  ('b0000000-0000-4000-8000-000000000002', 'tenant'),
  ('b0000000-0000-4000-8000-000000000003', 'landlord');

insert into public.feature_flags (key, enabled, reason) values
  ('fn_flag', true, 'test'),
  ('fn_flag_off', false, 'test');

-- Reference sequences exist
select results_eq(
  $$ select count(*)::text from pg_sequences
     where schemaname = 'public'
       and sequencename in ('property_reference_seq','owner_reference_seq',
                            'contract_reference_seq','allocation_reference_seq',
                            'payment_reference_seq','ticket_reference_seq',
                            'dispute_reference_seq','document_reference_seq') $$,
  ARRAY['8'], 'the eight reference sequences are present');

-- ---------------------------------------------------------------------------
-- allocate_pro_rata
-- ---------------------------------------------------------------------------
select results_eq(
  $$ select private.allocate_pro_rata(1000, ARRAY[1,1,1]) $$,
  ARRAY[ARRAY[334,333,333]], 'allocate_pro_rata sums to total with remainder distributed');

select results_eq(
  $$ select private.allocate_pro_rata(0, ARRAY[1,2,3]) $$,
  ARRAY[ARRAY[0,0,0]], 'allocate_pro_rata handles total zero');

select throws_ok(
  $$ select private.allocate_pro_rata(-1, ARRAY[1,2]) $$,
  'P0001', 'total must be non-negative', 'allocate_pro_rata rejects negative total');

select throws_ok(
  $$ select private.allocate_pro_rata(100, ARRAY[]::bigint[]) $$,
  'P0001', null, 'allocate_pro_rata rejects empty weights');

select throws_ok(
  $$ select private.allocate_pro_rata(100, ARRAY[-1,2]) $$,
  null, null, 'allocate_pro_rata with negative weights produces odd split (per function, sum would be >0 if mixed)');

select throws_ok(
  $$ select private.allocate_pro_rata(100, ARRAY[0,0]) $$,
  'P0001', 'weights must sum to a positive value', 'allocate_pro_rata rejects zero-sum weights');

select results_eq(
  $$ select private.allocate_pro_rata(5, ARRAY[1,2]) $$,
  ARRAY[ARRAY[2,3]], 'allocate_pro_rata distributes remainder to the elements with the largest fractional parts');

-- ---------------------------------------------------------------------------
-- compute_allocations
-- ---------------------------------------------------------------------------
select results_eq(
  $$ select basis::text, beneficiary::text, amount::text, is_payable::text
     from private.compute_allocations(100000, 10000, 'rent'::public.payment_kind, 1000, 500, null)
     order by basis desc $$,
  ARRAY['management_fee','platform','9000','false','rent_principal','owner','81000','true'],
  'rent allocation produces management fee and owner principal');

select results_eq(
  $$ select basis::text, beneficiary::text, amount::text, is_payable::text
     from private.compute_allocations(100000, 10000, 'service_charge'::public.payment_kind, 1000, 500, null)
     order by basis desc $$,
  ARRAY['management_fee','platform','9000','false','rent_principal','owner','81000','true'],
  'service_charge allocation also yields management fee');

select results_eq(
  $$ select basis::text, beneficiary::text, amount::text, is_payable::text
     from private.compute_allocations(50000000, 250000, 'installment'::public.payment_kind, 1000, 500, null)
     order by basis desc $$,
  ARRAY['sale_commission','platform','2487500','false','sale_principal','owner','47250000','true'],
  'installment (sale) splits into commission and sale principal');

select results_eq(
  $$ select basis::text, beneficiary::text, amount::text, is_payable::text
     from private.compute_allocations(50000000, 0, 'outright_purchase'::public.payment_kind, 100, 500, null)
     order by basis desc $$,
  ARRAY['sale_commission','platform','2500000','false','sale_principal','owner','47500000','true'],
  'outright_purchase uses commission basis');

select results_eq(
  $$ select basis::text, beneficiary::text, amount::text, is_payable::text
     from private.compute_allocations(30000, 0, 'deposit'::public.payment_kind, 0, 0, null) $$,
  ARRAY['deposit_holding','reserve','30000','false'],
  'deposit goes to reserve as a non-payable holding');

select results_eq(
  $$ select basis::text, beneficiary::text, amount::text, is_payable::text
     from private.compute_allocations(10000, 0, 'agreement_fee'::public.payment_kind, 0, 0, null) $$,
  ARRAY['agreement_fee_holding','reserve','10000','false'],
  'agreement fee goes to reserve');

select results_eq(
  $$ select basis::text, beneficiary::text, amount::text, is_payable::text
     from private.compute_allocations(5000, 0, 'penalty'::public.payment_kind, 1000, 0, null)
     order by basis desc $$,
  ARRAY['rent_principal','owner','5000','true'],
  'penalty yields owner principal and zero management fee');

select throws_ok(
  $$ select private.compute_allocations(10000, 15000, 'rent'::public.payment_kind, 1000, 500, null) $$,
  'P0001', 'paystack fee exceeds amount', 'compute_allocations rejects fee larger than amount');

select results_eq(
  $$ select basis::text, beneficiary::text, amount::text, is_payable::text
     from private.compute_allocations(5000, 0, 'misc'::public.payment_kind, 1000, 500, null) $$,
  ARRAY['rent_principal','owner','5000','true'],
  'unknown payment kinds fall back to owner rent principal');

-- ---------------------------------------------------------------------------
-- Role/permission helpers (via RLS session)
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', 'b0000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims',
  '{"sub":"b0000000-0000-4000-8000-000000000001","role":"authenticated",
    "app_metadata":{"courtland_roles":["admin"]}}', true);

select ok(private.has_role('admin'), 'has_role(admin) is true for an admin');
select ok(private.has_role_any(array['tenant','admin'::public.app_role]),
          'has_role_any finds a role');
select ok(private.is_staff(), 'is_staff returns true for admin');

select set_config('request.jwt.claim.sub', 'b0000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims',
  '{"sub":"b0000000-0000-4000-8000-000000000002","role":"authenticated",
    "app_metadata":{"courtland_roles":["tenant"]}}', true);

select ok(private.has_role('tenant'), 'has_role(tenant) is true');
select ok(not private.is_staff(), 'is_staff is false for a tenant');
select ok(private.has_role_any(array['admin','landlord'::public.app_role]) is false,
          'has_role_any with no match returns false');

select set_config('request.jwt.claim.sub', 'b0000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claims',
  '{"sub":"b0000000-0000-4000-8000-000000000003","role":"authenticated",
    "app_metadata":{"courtland_roles":["landlord"]}}', true);

select ok(private.owns_property('b0000000-0000-4000-8000-000000000021'),
          'owns_property returns true for the property owner');
select ok(private.owns_owner('b0000000-0000-4000-8000-000000000011'),
          'owns_owner returns true for the owner record');

select set_config('request.jwt.claim.sub', 'b0000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims',
  '{"sub":"b0000000-0000-4000-8000-000000000002","role":"authenticated",
    "app_metadata":{"courtland_roles":["tenant"]}}', true);

select ok(private.is_contract_party('b0000000-0000-4000-8000-000000000041'),
          'the primary payer is recognised as a contract party');

select ok(private.occupies_unit('b0000000-0000-4000-8000-000000000031'),
          'the primary payer is considered to occupy the unit');

-- has_permission checks against role_permissions
select ok(private.has_permission('property_read') is not null, 'has_permission returns boolean');

-- ---------------------------------------------------------------------------
-- flag_enabled
-- ---------------------------------------------------------------------------
select results_eq(
  $$ select private.flag_enabled('fn_flag') $$,
  ARRAY[true], 'flag_enabled returns true when the flag is enabled');

select results_eq(
  $$ select private.flag_enabled('fn_flag_off') $$,
  ARRAY[false], 'flag_enabled returns false when the flag is disabled');

select results_eq(
  $$ select private.flag_enabled('missing_flag') $$,
  ARRAY[false], 'flag_enabled returns false when the flag does not exist');

select * from finish();
rollback;