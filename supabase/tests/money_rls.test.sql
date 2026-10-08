-- money_rls.test.sql
-- payment_intents, payments_ledger, ledger_allocations, payouts, refunds,
-- refund_allocations, paystack_accounts.

create extension if not exists pgtap;

begin;

select plan(36);

-- Users
insert into auth.users (id, email, raw_app_meta_data) values
  ('66000000-0000-4000-8000-000000000001', 'payer@test.local',
   '{"courtland_roles":["tenant"]}'),
  ('66000000-0000-4000-8000-000000000002', 'other-payer@test.local',
   '{"courtland_roles":["tenant"]}'),
  ('66000000-0000-4000-8000-000000000003', 'landlord@test.local',
   '{"courtland_roles":["landlord"]}'),
  ('66000000-0000-4000-8000-000000000004', 'landlord2@test.local',
   '{"courtland_roles":["landlord"]}'),
  ('66000000-0000-4000-8000-000000000005', 'staff@test.local',
   '{"courtland_roles":["admin"]}');

-- Owners
insert into public.owners (id, user_id, owner_type, legal_name, kyc_status) values
  ('66000000-0000-4000-8000-000000000011', '66000000-0000-4000-8000-000000000003',
   'individual', 'Money Landlord', 'verified'),
  ('66000000-0000-4000-8000-000000000012', '66000000-0000-4000-8000-000000000004',
   'individual', 'Money Landlord Two', 'verified');

-- Properties + units
insert into public.properties
  (id, owner_id, slug, title, listing_type, property_type, status,
   address_line1, city, lga, state, price_kobo, published_at)
values
  ('66000000-0000-4000-8000-000000000021', '66000000-0000-4000-8000-000000000011',
   'money-prop-1', 'Money Prop One', 'rent', 'bungalow', 'published',
   '1 Money St', 'Lekki', 'Eti-Osa', 'Lagos', 9000000000, now()),
  ('66000000-0000-4000-8000-000000000022', '66000000-0000-4000-8000-000000000012',
   'money-prop-2', 'Money Prop Two', 'rent', 'bungalow', 'published',
   '2 Money St', 'Lekki', 'Eti-Osa', 'Lagos', 8000000000, now()),
  ('66000000-0000-4000-8000-000000000023', '66000000-0000-4000-8000-000000000012',
   'money-prop-3', 'Money Prop Three', 'rent', 'bungalow', 'published',
   '3 Money St', 'Lekki', 'Eti-Osa', 'Lagos', 7000000000, now());

insert into public.units (id, property_id, code, bedrooms, status, asking_rent_kobo) values
  ('66000000-0000-4000-8000-000000000031', '66000000-0000-4000-8000-000000000021',
   'A1', 2, 'vacant', 50000000),
  ('66000000-0000-4000-8000-000000000032', '66000000-0000-4000-8000-000000000022',
   'B1', 2, 'vacant', 100000000),
  ('66000000-0000-4000-8000-000000000033', '66000000-0000-4000-8000-000000000023',
   'C1', 1, 'vacant', 80000000);

-- Contracts
insert into public.contracts
  (id, kind, property_id, unit_id, owner_id, primary_payer_id, status,
   start_date, end_date, total_kobo, outstanding_kobo,
   rent_kobo, rent_cadence_months, service_charge_kobo, security_deposit_kobo)
values
  ('66000000-0000-4000-8000-000000000071', 'lease',
   '66000000-0000-4000-8000-000000000021', '66000000-0000-4000-8000-000000000031',
   '66000000-0000-4000-8000-000000000011', '66000000-0000-4000-8000-000000000001',
   'active', date '2026-01-01', date '2027-12-31', 50000000, 50000000,
   50000000, 12, 0, 0),
  ('66000000-0000-4000-8000-000000000072', 'lease',
   '66000000-0000-4000-8000-000000000022', '66000000-0000-4000-8000-000000000032',
   '66000000-0000-4000-8000-000000000012', '66000000-0000-4000-8000-000000000002',
   'active', date '2026-01-01', date '2027-12-31', 100000000, 100000000,
   100000000, 12, 0, 0),
  ('66000000-0000-4000-8000-000000000073', 'lease',
   '66000000-0000-4000-8000-000000000023', '66000000-0000-4000-8000-000000000033',
   '66000000-0000-4000-8000-000000000012', '66000000-0000-4000-8000-000000000002',
   'active', date '2026-01-01', date '2027-12-31', 80000000, 80000000,
   80000000, 12, 0, 0);

-- Intents
insert into public.payment_intents (id, contract_id, payer_id, kind, amount_kobo, status) values
  ('66000000-0000-4000-8000-000000000041', '66000000-0000-4000-8000-000000000071',
   '66000000-0000-4000-8000-000000000001', 'rent', 50000000, 'created'),
  ('66000000-0000-4000-8000-000000000042', '66000000-0000-4000-8000-000000000072',
   '66000000-0000-4000-8000-000000000002', 'rent', 40000000, 'created'),
  ('66000000-0000-4000-8000-000000000043', '66000000-0000-4000-8000-000000000073',
   '66000000-0000-4000-8000-000000000002', 'rent', 80000000, 'created');

-- Balanced succeeded ledger. Insert as pending, allocate, then mark succeeded.
insert into public.payments_ledger
  (id, intent_id, contract_id, payer_id, owner_id, kind, amount_kobo,
   paystack_fee_kobo, status, channel, paystack_reference, paid_at)
values
  ('66000000-0000-4000-8000-000000000051', '66000000-0000-4000-8000-000000000041',
   '66000000-0000-4000-8000-000000000071', '66000000-0000-4000-8000-000000000001',
   '66000000-0000-4000-8000-000000000011',
   'rent', 50000000, 750000, 'pending', 'card', 'pay_led_1', now());

insert into public.ledger_allocations
  (id, payment_id, beneficiary_type, owner_id, basis, amount_kobo, status, is_payable)
values
  ('66000000-0000-4000-8000-000000000061', '66000000-0000-4000-8000-000000000051',
   'owner', '66000000-0000-4000-8000-000000000011', 'rent_principal', 49250000, 'pending', true);

update public.payments_ledger set status = 'succeeded'
 where id = '66000000-0000-4000-8000-000000000051';

insert into public.payments_ledger
  (id, intent_id, contract_id, payer_id, owner_id, kind, amount_kobo,
   paystack_fee_kobo, status, channel, paystack_reference, paid_at)
values
  ('66000000-0000-4000-8000-000000000052', '66000000-0000-4000-8000-000000000042',
   '66000000-0000-4000-8000-000000000072', '66000000-0000-4000-8000-000000000002',
   '66000000-0000-4000-8000-000000000012',
   'rent', 40000000, 600000, 'pending', 'card', 'pay_led_2', now());

insert into public.ledger_allocations
  (id, payment_id, beneficiary_type, owner_id, basis, amount_kobo, status, is_payable)
values
  ('66000000-0000-4000-8000-000000000062', '66000000-0000-4000-8000-000000000052',
   'owner', '66000000-0000-4000-8000-000000000012', 'rent_principal', 39400000, 'pending', true);

update public.payments_ledger set status = 'succeeded'
 where id = '66000000-0000-4000-8000-000000000052';

-- ---------------------------------------------------------------------------
-- payer
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '66000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims',
  '{"sub":"66000000-0000-4000-8000-000000000001","role":"authenticated",
    "app_metadata":{"courtland_roles":["tenant"]}}', true);

select results_eq(
  $$ select count(*)::text from public.payment_intents
     where payer_id = '66000000-0000-4000-8000-000000000001' $$,
  ARRAY['1'], 'a payer reads their own intents');

select results_eq(
  $$ select count(*)::text from public.payments_ledger
     where payer_id = '66000000-0000-4000-8000-000000000001' $$,
  ARRAY['1'], 'a payer reads their own ledger rows');

select results_eq(
  $$ select count(*)::text from public.ledger_allocations $$,
  ARRAY['0'], 'a payer never sees ledger allocations');

select throws_ok(
  $$ insert into public.payments_ledger
       (intent_id, contract_id, payer_id, owner_id, kind, amount_kobo,
        paystack_fee_kobo, paystack_reference)
     values ('66000000-0000-4000-8000-000000000041',
             '66000000-0000-4000-8000-000000000071',
             '66000000-0000-4000-8000-000000000001',
             '66000000-0000-4000-8000-000000000011',
             'rent', 1000, 0, 'pay_led_x') $$,
  '42501', null, 'a payer cannot write the ledger');

select lives_ok(
  $$ insert into public.payment_intents (id, contract_id, payer_id, kind, amount_kobo)
     values ('66000000-0000-4000-8000-000000000044',
             '66000000-0000-4000-8000-000000000071',
             '66000000-0000-4000-8000-000000000001', 'rent', 100000) $$,
  'a payer can create an intent against their own contract');

select results_eq(
  $$ select count(*)::text from public.payment_intents
     where payer_id = '66000000-0000-4000-8000-000000000001' $$,
  ARRAY['2'], 'the new intent is visible');

select throws_ok(
  $$ insert into public.payment_intents (contract_id, payer_id, kind, amount_kobo)
     values ('66000000-0000-4000-8000-000000000073',
             '66000000-0000-4000-8000-000000000001', 'rent', 100000) $$,
  '42501', null, 'a payer cannot create an intent on a contract they are not a party to');

select lives_ok(
  $$ update public.payment_intents
        set status = 'pending'
      where id = '66000000-0000-4000-8000-000000000041' $$,
  'a payer may move their own intent from created to pending');

select results_eq(
  $$ select count(*)::text from public.payment_intents
     where id = '66000000-0000-4000-8000-000000000041' and status = 'pending' $$,
  ARRAY['1'], 'the intent moved to pending');

select lives_ok(
  $$ update public.payment_intents
        set status = 'succeeded'
      where id = '66000000-0000-4000-8000-000000000041' $$,
  'advancing an intent past pending is a silent no-op');

select results_eq(
  $$ select count(*)::text from public.payment_intents
     where id = '66000000-0000-4000-8000-000000000041' and status = 'pending' $$,
  ARRAY['1'], 'the payer could not advance the intent past pending');

select throws_ok(
  $$ insert into public.payment_intents (contract_id, payer_id, kind, amount_kobo, status)
     values ('66000000-0000-4000-8000-000000000071',
             '66000000-0000-4000-8000-000000000001', 'rent', 100000, 'succeeded') $$,
  '42501', null, 'an intent can only be created in created status');

select throws_ok(
  $$ delete from public.payment_intents
     where id = '66000000-0000-4000-8000-000000000041' $$,
  '42501', null, 'a payer cannot delete an intent');

select results_eq(
  $$ select count(*)::text from public.ledger_allocations $$,
  ARRAY['0'], 'the payer still sees no allocations after their write attempts');

-- ---------------------------------------------------------------------------
-- beneficiary owner (landlord of O1)
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '66000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claims',
  '{"sub":"66000000-0000-4000-8000-000000000003","role":"authenticated",
    "app_metadata":{"courtland_roles":["landlord"]}}', true);

select results_eq(
  $$ select count(*)::text from public.ledger_allocations
     where owner_id = '66000000-0000-4000-8000-000000000011' $$,
  ARRAY['1'], 'the beneficiary owner reads their own allocations');

select results_eq(
  $$ select count(*)::text from public.ledger_allocations
     where id = '66000000-0000-4000-8000-000000000061' and amount_kobo = 49250000 $$,
  ARRAY['1'], 'the owner allocation is exactly the net amount');

select results_eq(
  $$ select count(*)::text from public.payments_ledger
     where owner_id = '66000000-0000-4000-8000-000000000011' $$,
  ARRAY['1'], 'the owner reads their own ledger rows');

select results_eq(
  $$ select count(*)::text from public.payments_ledger
     where owner_id = '66000000-0000-4000-8000-000000000012' $$,
  ARRAY['0'], 'the owner cannot read another owner ledger rows');

select results_eq(
  $$ select count(*)::text from public.payment_intents
     where payer_id = '66000000-0000-4000-8000-000000000001' $$,
  ARRAY['0'], 'the owner sees no payment intents');

select throws_ok(
  $$ insert into public.payment_intents (contract_id, payer_id, kind, amount_kobo)
     values ('66000000-0000-4000-8000-000000000071',
             '66000000-0000-4000-8000-000000000003', 'rent', 100000) $$,
  '42501', null, 'an owner cannot create an intent for someone else');

select throws_ok(
  $$ insert into public.ledger_allocations
       (payment_id, beneficiary_type, owner_id, basis, amount_kobo)
     values ('66000000-0000-4000-8000-000000000051', 'owner',
             '66000000-0000-4000-8000-000000000011', 'rent_principal', 1000) $$,
  '42501', null, 'allocations are not writable by any client');

-- ---------------------------------------------------------------------------
-- owner 2
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '66000000-0000-4000-8000-000000000004', true);
select set_config('request.jwt.claims',
  '{"sub":"66000000-0000-4000-8000-000000000004","role":"authenticated",
    "app_metadata":{"courtland_roles":["landlord"]}}', true);

select results_eq(
  $$ select count(*)::text from public.ledger_allocations
     where owner_id = '66000000-0000-4000-8000-000000000012' $$,
  ARRAY['1'], 'owner two reads their own allocations');

select results_eq(
  $$ select count(*)::text from public.payments_ledger
     where owner_id = '66000000-0000-4000-8000-000000000012' $$,
  ARRAY['1'], 'owner two reads their own ledger rows');

-- ---------------------------------------------------------------------------
-- staff
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '66000000-0000-4000-8000-000000000005', true);
select set_config('request.jwt.claims',
  '{"sub":"66000000-0000-4000-8000-000000000005","role":"authenticated",
    "app_metadata":{"courtland_roles":["admin"]}}', true);

select ok(
  (select count(*) from public.ledger_allocations) >= 2,
  'staff reads every allocation');

select ok(
  (select count(*) from public.payments_ledger) >= 2,
  'staff reads the whole ledger');

select ok(
  (select count(*) from public.payment_intents) >= 4,
  'staff reads every intent');

select throws_ok(
  $$ insert into public.ledger_allocations
       (payment_id, beneficiary_type, owner_id, basis, amount_kobo)
     values ('66000000-0000-4000-8000-000000000051', 'owner',
             '66000000-0000-4000-8000-000000000011', 'rent_principal', 1000) $$,
  '42501', null, 'not even staff writes allocations directly');

select results_eq(
  $$ select net_kobo::text from public.payments_ledger
     where id = '66000000-0000-4000-8000-000000000051' $$,
  ARRAY['49250000'], 'net_kobo is amount minus the paystack fee');

select results_eq(
  $$ select net_kobo::text from public.payments_ledger
     where id = '66000000-0000-4000-8000-000000000052' $$,
  ARRAY['39400000'], 'net_kobo computed correctly on the second row');

select throws_ok(
  $$ select * from public.payouts $$,
  '42501', null, 'payouts are not client-readable');

select throws_ok(
  $$ select * from public.refunds $$,
  '42501', null, 'refunds are not client-readable');

select throws_ok(
  $$ select * from public.paystack_accounts $$,
  '42501', null, 'paystack_accounts are not client-readable');

select throws_ok(
  $$ select * from public.refund_allocations $$,
  '42501', null, 'refund_allocations are not client-readable');

-- ---------------------------------------------------------------------------
-- anon
-- ---------------------------------------------------------------------------
set local role anon;
select set_config('request.jwt.claims', '{}', true);
select set_config('request.jwt.claim.sub', '', true);

select throws_ok(
  $$ select * from public.payment_intents $$,
  '42501', null, 'anonymous cannot read intents');

select throws_ok(
  $$ select * from public.payments_ledger $$,
  '42501', null, 'anonymous cannot read the ledger');

select throws_ok(
  $$ select * from public.ledger_allocations $$,
  '42501', null, 'anonymous cannot read allocations');

select * from finish();
rollback;