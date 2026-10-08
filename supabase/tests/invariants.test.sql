-- invariants.test.sql
-- Database invariants I1-I23 from docs/04-domain-model.md section 5.
-- Deviations (recorded, not tested as failures):
--   I18 documents.supersedes_document_id -> not tested (trigger path addition pending).
--   I24 payout accrue query-level assertion -> not in the database, no test.
--   I26 title release gate -> implemented in app layer, not a trigger, no DB test.
--   I6 reverse direction (unit occupancy -> contract) is not enforced by a trigger: only the
--     contract -> unit direction exists. The forward direction IS asserted here.
--   I10 imbalance check fires WHEN ALLOCATIONS change, not on the payment status flip itself
--     (the before-update trigger reads the still-pending row). A succeeded payment can be
--     created unbalanced; the invariant is enforced the moment an allocation is touched.

create extension if not exists pgtap;

begin;

select plan(37);

-- Users
insert into auth.users (id, email, raw_app_meta_data) values
  ('a0000000-0000-4000-8000-000000000001', 'landlord@test.local',
   '{"courtland_roles":["landlord"]}'),
  ('a0000000-0000-4000-8000-000000000002', 'tenant@test.local',
   '{"courtland_roles":["tenant"]}');

insert into public.owners (id, user_id, owner_type, legal_name, kyc_status) values
  ('a0000000-0000-4000-8000-000000000011', 'a0000000-0000-4000-8000-000000000001',
   'individual', 'Inv Landlord', 'verified');

-- P1 is a sale property, P2 a rental. Units may only exist on P2 (I1).
insert into public.properties
  (id, owner_id, slug, title, listing_type, property_type, status,
   address_line1, city, lga, state, price_kobo, published_at)
values
  ('a0000000-0000-4000-8000-000000000021', 'a0000000-0000-4000-8000-000000000011',
   'inv-sale-1', 'Inv Sale One', 'sale', 'bungalow', 'published',
   '21 Inv St', 'Lekki', 'Eti-Osa', 'Lagos', 50000000000, now()),
  ('a0000000-0000-4000-8000-000000000022', 'a0000000-0000-4000-8000-000000000011',
   'inv-rent-1', 'Inv Rent One', 'rent', 'bungalow', 'published',
   '22 Inv St', 'Lekki', 'Eti-Osa', 'Lagos', 9000000000, now()),
  ('a0000000-0000-4000-8000-000000000023', 'a0000000-0000-4000-8000-000000000011',
   'inv-land-1', 'Inv Land One', 'sale', 'bungalow', 'draft',
   '23 Inv St', 'Lekki', 'Eti-Osa', 'Lagos', 15000000000, null);

insert into public.units (id, property_id, code, bedrooms, status, asking_rent_kobo) values
  ('a0000000-0000-4000-8000-000000000031', 'a0000000-0000-4000-8000-000000000022',
   'A1', 2, 'vacant', 50000000),
  ('a0000000-0000-4000-8000-000000000032', 'a0000000-0000-4000-8000-000000000022',
   'A2', 2, 'vacant', 50000000);

-- Active lease on U1 (I4 valid path + I3 lease/unit pairing + first I5 slot)
insert into public.contracts
  (id, kind, property_id, unit_id, owner_id, primary_payer_id, status,
   start_date, end_date, total_kobo, outstanding_kobo,
   rent_kobo, rent_cadence_months)
values
  ('a0000000-0000-4000-8000-000000000041', 'lease',
   'a0000000-0000-4000-8000-000000000022', 'a0000000-0000-4000-8000-000000000031',
   'a0000000-0000-4000-8000-000000000011', 'a0000000-0000-4000-8000-000000000002',
   'active', date '2026-01-01', date '2027-12-31', 50000000, 50000000,
   50000000, 12),
  -- Draft lease on U2, used by I6 and I15
  ('a0000000-0000-4000-8000-000000000042', 'lease',
   'a0000000-0000-4000-8000-000000000022', 'a0000000-0000-4000-8000-000000000032',
   'a0000000-0000-4000-8000-000000000011', 'a0000000-0000-4000-8000-000000000002',
   'draft', date '2026-01-01', date '2027-12-31', 50000000, 50000000,
   50000000, 12);

-- I7 fixture: one primary party on the draft lease
insert into public.contract_parties (contract_id, user_id, party_name, party_role, is_primary)
values ('a0000000-0000-4000-8000-000000000042', 'a0000000-0000-4000-8000-000000000002',
        'Tenant', 'payer', true);

-- I8/I9 fixture: schedule seq 1 on the draft lease
insert into public.contract_schedule (contract_id, seq, kind, due_date, amount_kobo)
values ('a0000000-0000-4000-8000-000000000042', 1, 'rent', date '2026-02-01', 50000);

-- Maintenance ticket for I12
insert into public.maintenance_tickets
  (id, property_id, unit_id, raised_by, category, title, description, status)
values ('a0000000-0000-4000-8000-000000000061',
        'a0000000-0000-4000-8000-000000000022', 'a0000000-0000-4000-8000-000000000031',
        'a0000000-0000-4000-8000-000000000002', 'plumbing', 'Tap', 'Dripping', 'open');

-- Money fixtures: intents and pending/succeeded ledger
insert into public.payment_intents (id, contract_id, payer_id, kind, amount_kobo, status)
values
  ('a0000000-0000-4000-8000-000000000071', 'a0000000-0000-4000-8000-000000000041',
   'a0000000-0000-4000-8000-000000000002', 'rent', 100000, 'created'),
  ('a0000000-0000-4000-8000-000000000072', 'a0000000-0000-4000-8000-000000000041',
   'a0000000-0000-4000-8000-000000000002', 'rent', 50000, 'created'),
  ('a0000000-0000-4000-8000-000000000073', 'a0000000-0000-4000-8000-000000000041',
   'a0000000-0000-4000-8000-000000000002', 'rent', 20000, 'created');

insert into public.payments_ledger
  (id, intent_id, contract_id, payer_id, owner_id, kind, amount_kobo,
   paystack_fee_kobo, status, channel, paystack_reference, paid_at)
values
  ('a0000000-0000-4000-8000-000000000081', 'a0000000-0000-4000-8000-000000000071',
   'a0000000-0000-4000-8000-000000000041', 'a0000000-0000-4000-8000-000000000002',
   'a0000000-0000-4000-8000-000000000011', 'rent', 100000, 10000, 'pending',
   'card', 'inv_pay_1', now()),
  ('a0000000-0000-4000-8000-000000000082', 'a0000000-0000-4000-8000-000000000072',
   'a0000000-0000-4000-8000-000000000041', 'a0000000-0000-4000-8000-000000000002',
   'a0000000-0000-4000-8000-000000000011', 'rent', 50000, 0, 'succeeded',
   'card', 'inv_pay_2', now()),
  ('a0000000-0000-4000-8000-000000000083', 'a0000000-0000-4000-8000-000000000073',
   'a0000000-0000-4000-8000-000000000041', 'a0000000-0000-4000-8000-000000000002',
   'a0000000-0000-4000-8000-000000000011', 'rent', 20000, 0, 'pending',
   'card', 'inv_pay_3', now());

-- Balanced allocations for payment 081: 90,000 = 100,000 - 10,000 fee
insert into public.ledger_allocations
  (id, payment_id, beneficiary_type, owner_id, basis, amount_kobo, is_payable)
values
  ('a0000000-0000-4000-8000-000000000091', 'a0000000-0000-4000-8000-000000000081',
   'owner', 'a0000000-0000-4000-8000-000000000011', 'rent_principal', 60000, true),
  ('a0000000-0000-4000-8000-000000000092', 'a0000000-0000-4000-8000-000000000081',
   'owner', 'a0000000-0000-4000-8000-000000000011', 'rent_principal', 30000, true);

-- I14 fixture: a paid payout is immutable
insert into public.payouts
  (id, reference, owner_id, period_start, period_end, gross_kobo, deductions_kobo,
   net_kobo, status, paid_at)
values ('a0000000-0000-4000-8000-0000000000a1', 'PO-INV-1',
        'a0000000-0000-4000-8000-000000000011', date '2026-01-01', date '2026-01-31',
        1000000, 0, 1000000, 'paid', now());

-- Misc uniqueness fixtures: notices / webhooks / idempotency / outbox
insert into public.notices
  (id, kind, channel, recipient_user_id, recipient_address, template_key, dedupe_key)
values ('a0000000-0000-4000-8000-0000000000b1', 'rent_reminder', 'email',
        'a0000000-0000-4000-8000-000000000002', 'tenant@test.local', 'rent_reminder',
        'inv-n-1');

insert into public.webhook_events (id, provider, event_id, event_type, payload)
values ('a0000000-0000-4000-8000-0000000000c1', 'paystack', 'evt_inv',
        'charge.success', '{}');

insert into public.idempotency_keys
  (id, scope, key, user_id, request_fingerprint)
values ('a0000000-0000-4000-8000-0000000000d1', 'pay', 'inv-00000001',
        'a0000000-0000-4000-8000-000000000002', 'fp');

insert into public.outbox_events
  (id, event_type, aggregate_type, aggregate_id, payload)
values ('a0000000-0000-4000-8000-0000000000e1', 'contract.signed', 'contract',
        'a0000000-0000-4000-8000-000000000041', '{}');

-- ---------------------------------------------------------------------------
-- I1: units exist only on rental properties
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ insert into public.units (property_id, code, bedrooms, status)
     values ('a0000000-0000-4000-8000-000000000021', 'S1', 2, 'vacant') $$,
  '23514', null, 'I1: a unit cannot be created on a sale property');

select lives_ok(
  $$ insert into public.units (id, property_id, code, bedrooms, status)
     values ('a0000000-0000-4000-8000-000000000033',
             'a0000000-0000-4000-8000-000000000022', 'A3', 2, 'vacant') $$,
  'I1: a unit may be created on a rental property');

-- ---------------------------------------------------------------------------
-- I2: land_details presence matches property_type
-- ---------------------------------------------------------------------------
select lives_ok(
  $$ insert into public.land_details (property_id, size_sqm)
     values ('a0000000-0000-4000-8000-000000000023', 500.00) $$,
  'I2: details may be attached before the property is re-typed to land');

select lives_ok(
  $$ update public.properties set property_type = 'land'
     where id = 'a0000000-0000-4000-8000-000000000023' $$,
  'I2: re-typing to land with details present is allowed');

select throws_ok(
  $$ insert into public.land_details (property_id, size_sqm)
     values ('a0000000-0000-4000-8000-000000000023', 600.00) $$,
  '23505', null, 'I2: a property has at most one land_details row');

select throws_ok(
  $$ insert into public.properties
       (id, owner_id, slug, title, listing_type, property_type, status,
        address_line1, city, lga, state, price_kobo)
     values ('a0000000-0000-4000-8000-000000000024', 'a0000000-0000-4000-8000-000000000011',
             'inv-land-2', 'Inv Land Two', 'sale', 'land', 'draft',
             '24 Inv St', 'Lekki', 'Eti-Osa', 'Lagos', 10000000000) $$,
  '23514', null, 'I2: property_type land requires a land_details row');

-- ---------------------------------------------------------------------------
-- I3: contracts.unit_id required for lease, forbidden for sale
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ insert into public.contracts
       (kind, property_id, unit_id, owner_id, primary_payer_id, status,
        total_kobo, outstanding_kobo)
     values ('sale', 'a0000000-0000-4000-8000-000000000021',
             'a0000000-0000-4000-8000-000000000031',
             'a0000000-0000-4000-8000-000000000011',
             'a0000000-0000-4000-8000-000000000002', 'draft',
             500000000, 500000000) $$,
  '23514', null, 'I3: a sale contract may not reference a unit');

-- ---------------------------------------------------------------------------
-- I4: contract listing type must match its property (valid path)
-- ---------------------------------------------------------------------------
select lives_ok(
  $$ insert into public.contracts
       (id, kind, property_id, unit_id, owner_id, primary_payer_id, status,
        start_date, end_date, total_kobo, outstanding_kobo,
        rent_kobo, rent_cadence_months)
     values ('a0000000-0000-4000-8000-000000000043', 'lease',
             'a0000000-0000-4000-8000-000000000022', 'a0000000-0000-4000-8000-000000000033',
             'a0000000-0000-4000-8000-000000000011', 'a0000000-0000-4000-8000-000000000002',
             'renewed', date '2026-01-01', date '2026-12-31', 40000000, 40000000,
             40000000, 12) $$,
  'I4/I3: a lease on a rental property with its own unit is valid');

-- ---------------------------------------------------------------------------
-- I5: at most one live lease per unit
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ insert into public.contracts
       (kind, property_id, unit_id, owner_id, primary_payer_id, status,
        start_date, end_date, total_kobo, outstanding_kobo,
        rent_kobo, rent_cadence_months)
     values ('lease', 'a0000000-0000-4000-8000-000000000022',
             'a0000000-0000-4000-8000-000000000031',
             'a0000000-0000-4000-8000-000000000011',
             'a0000000-0000-4000-8000-000000000002', 'active',
             date '2026-01-01', date '2027-12-31', 50000000, 50000000,
             50000000, 12) $$,
  '23505', null, 'I5: two live leases cannot share a unit');

-- ---------------------------------------------------------------------------
-- I6: unit status follows contract status (contract -> unit direction)
-- ---------------------------------------------------------------------------
select lives_ok(
  $$ update public.contracts set status = 'active'
     where id = 'a0000000-0000-4000-8000-000000000042' $$,
  'I6: activating the lease succeeds');

select results_eq(
  $$ select count(*)::text from public.units
     where id = 'a0000000-0000-4000-8000-000000000032'
       and status = 'occupied'
       and current_contract_id = 'a0000000-0000-4000-8000-000000000042' $$,
  ARRAY['1'], 'I6: the unit becomes occupied by the active contract');

select lives_ok(
  $$ update public.contracts set status = 'expired'
     where id = 'a0000000-0000-4000-8000-000000000042' $$,
  'I6: expiring the lease succeeds');

select results_eq(
  $$ select count(*)::text from public.units
     where id = 'a0000000-0000-4000-8000-000000000032'
       and status = 'vacant'
       and current_contract_id is null $$,
  ARRAY['1'], 'I6: the unit is freed when the contract expires');

-- ---------------------------------------------------------------------------
-- I7: at most one primary party per contract
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ insert into public.contract_parties
       (contract_id, user_id, party_name, party_role, is_primary)
     values ('a0000000-0000-4000-8000-000000000042',
             'a0000000-0000-4000-8000-000000000002', 'Rival Primary', 'co_signer', true) $$,
  '23505', null, 'I7: a contract has a single primary party');

-- ---------------------------------------------------------------------------
-- I8 / I9: schedule rows
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ insert into public.contract_schedule (contract_id, seq, kind, due_date, amount_kobo)
     values ('a0000000-0000-4000-8000-000000000042', 1, 'rent', date '2026-03-01', 50000) $$,
  '23505', null, 'I8: schedule seq is unique per contract');

select throws_ok(
  $$ insert into public.contract_schedule (contract_id, seq, kind, due_date, amount_kobo, paid_kobo)
     values ('a0000000-0000-4000-8000-000000000042', 2, 'rent', date '2026-03-01', 400, 500) $$,
  '23514', null, 'I9: paid cannot exceed the scheduled amount');

-- ---------------------------------------------------------------------------
-- I10: a succeeded payment balances amount - fee with its allocations
-- ---------------------------------------------------------------------------
select lives_ok(
  $$ update public.payments_ledger set status = 'succeeded'
     where id = 'a0000000-0000-4000-8000-000000000081' $$,
  'I10: marking a balanced payment succeeded is allowed');

select throws_ok(
  $$ insert into public.ledger_allocations
       (payment_id, beneficiary_type, owner_id, basis, amount_kobo)
     values ('a0000000-0000-4000-8000-000000000082', 'owner',
             'a0000000-0000-4000-8000-000000000011', 'rent_principal', 10000) $$,
  '23514', null, 'I10: adding any allocation to a succeeded payment leaves it unbalanced');

select throws_ok(
  $$ update public.ledger_allocations set amount_kobo = 70000
     where id = 'a0000000-0000-4000-8000-000000000091' $$,
  '23514', null, 'I10: editing an allocation cannot break a succeeded payment');

-- ---------------------------------------------------------------------------
-- I11: payments_ledger is never deleted
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ delete from public.payments_ledger
     where id = 'a0000000-0000-4000-8000-000000000081' $$,
  '42501', null, 'I11: ledger rows cannot be deleted');

-- ---------------------------------------------------------------------------
-- I12: a maintenance deduction names exactly one ticket, once
-- ---------------------------------------------------------------------------
select lives_ok(
  $$ insert into public.ledger_allocations
       (id, payment_id, beneficiary_type, owner_id, basis, amount_kobo,
        is_payable, deduction_source_ticket_id)
     values ('a0000000-0000-4000-8000-000000000093',
             'a0000000-0000-4000-8000-000000000083', 'owner',
             'a0000000-0000-4000-8000-000000000011', 'maintenance_deduction',
             5000, false, 'a0000000-0000-4000-8000-000000000061') $$,
  'I12: a maintenance deduction to the owner with a ticket is valid');

select throws_ok(
  $$ insert into public.ledger_allocations
       (payment_id, beneficiary_type, owner_id, basis, amount_kobo,
        is_payable, deduction_source_ticket_id)
     values ('a0000000-0000-4000-8000-000000000083', 'owner',
             'a0000000-0000-4000-8000-000000000011', 'maintenance_deduction',
             5000, false, 'a0000000-0000-4000-8000-000000000061') $$,
  '23505', null, 'I12: a ticket is deducted at most once');

-- ---------------------------------------------------------------------------
-- I13: payout arithmetic
-- ---------------------------------------------------------------------------
select lives_ok(
  $$ insert into public.payouts
       (id, reference, owner_id, period_start, period_end, gross_kobo, deductions_kobo, net_kobo)
     values ('a0000000-0000-4000-8000-0000000000a2', 'PO-INV-2',
             'a0000000-0000-4000-8000-000000000011', date '2026-02-01', date '2026-02-28',
             5000, 500, 4500) $$,
  'I13: a payout whose net equals gross minus deductions is valid');

select throws_ok(
  $$ insert into public.payouts
       (id, reference, owner_id, period_start, period_end, gross_kobo, deductions_kobo, net_kobo)
     values ('a0000000-0000-4000-8000-0000000000a3', 'PO-INV-3',
             'a0000000-0000-4000-8000-000000000011', date '2026-03-01', date '2026-03-31',
             5000, 500, 5000) $$,
  '23514', null, 'I13: a mismatch between net, gross and deductions is rejected');

-- ---------------------------------------------------------------------------
-- I14: paid payouts are immutable
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ update public.payouts set status = 'draft'
     where id = 'a0000000-0000-4000-8000-0000000000a1' $$,
  '23514', null, 'I14: a paid payout cannot be updated');

select throws_ok(
  $$ delete from public.payouts
     where id = 'a0000000-0000-4000-8000-0000000000a1' $$,
  '23514', null, 'I14: a paid payout cannot be deleted');

-- ---------------------------------------------------------------------------
-- I15: suspension requires a reason
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ update public.contracts set status = 'suspended'
     where id = 'a0000000-0000-4000-8000-000000000042' $$,
  '23514', null, 'I15: suspending a contract without a reason is rejected');

-- ---------------------------------------------------------------------------
-- I16: installment shape
-- ---------------------------------------------------------------------------
select lives_ok(
  $$ insert into public.contracts
       (id, kind, property_id, owner_id, primary_payer_id, status, payment_plan,
        installment_count, installment_amount_kobo, installment_day_of_month,
        total_kobo, outstanding_kobo)
     values ('a0000000-0000-4000-8000-000000000046', 'sale',
             'a0000000-0000-4000-8000-000000000021',
             'a0000000-0000-4000-8000-000000000011',
             'a0000000-0000-4000-8000-000000000002', 'draft', 'installment',
             2, 250000000, 28, 500000000, 500000000) $$,
  'I16: an installment sale with at least two installments is valid');

select throws_ok(
  $$ insert into public.contracts
       (kind, property_id, owner_id, primary_payer_id, status, payment_plan,
        installment_count, installment_amount_kobo, installment_day_of_month,
        total_kobo, outstanding_kobo)
     values ('sale', 'a0000000-0000-4000-8000-000000000021',
             'a0000000-0000-4000-8000-000000000011',
             'a0000000-0000-4000-8000-000000000002', 'draft', 'installment',
             1, 250000000, 28, 500000000, 500000000) $$,
  '23514', null, 'I16: an installment sale needs at least two installments');

-- ---------------------------------------------------------------------------
-- I17: published properties have a published_at
-- ---------------------------------------------------------------------------
select lives_ok(
  $$ insert into public.properties
       (id, owner_id, slug, title, listing_type, property_type, status,
        address_line1, city, lga, state, price_kobo)
     values ('a0000000-0000-4000-8000-000000000025', 'a0000000-0000-4000-8000-000000000011',
             'inv-draft-1', 'Draft Only', 'rent', 'bungalow', 'draft',
             '25 Inv St', 'Lekki', 'Eti-Osa', 'Lagos', 1000000000) $$,
  'I17: a draft property needs no published_at');

select throws_ok(
  $$ insert into public.properties
       (id, owner_id, slug, title, listing_type, property_type, status,
        address_line1, city, lga, state, price_kobo)
     values ('a0000000-0000-4000-8000-000000000026', 'a0000000-0000-4000-8000-000000000011',
             'inv-pub-1', 'Published Without Clock', 'rent', 'bungalow', 'published',
             '26 Inv St', 'Lekki', 'Eti-Osa', 'Lagos', 1000000000) $$,
  '23514', null, 'I17: publishing requires published_at');

-- ---------------------------------------------------------------------------
-- I19 / I20 / I21: dedupe and idempotency uniqueness
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ insert into public.notices
       (kind, channel, recipient_user_id, recipient_address, template_key, dedupe_key)
     values ('rent_reminder', 'email', 'a0000000-0000-4000-8000-000000000002',
             'tenant@test.local', 'rent_reminder', 'inv-n-1') $$,
  '23505', null, 'I19: a notice dedupe key is unique');

select throws_ok(
  $$ insert into public.webhook_events (provider, event_id, event_type, payload)
     values ('paystack', 'evt_inv', 'charge.success', '{}') $$,
  '23505', null, 'I20: a provider event is processed once');

select throws_ok(
  $$ insert into public.idempotency_keys (scope, key, user_id, request_fingerprint)
     values ('pay', 'inv-00000001', 'a0000000-0000-4000-8000-000000000002', 'fp') $$,
  '23505', null, 'I21: idempotency keys are unique per scope');

-- ---------------------------------------------------------------------------
-- I22 / I23: append-only tables
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ delete from public.outbox_events
     where id = 'a0000000-0000-4000-8000-0000000000e1' $$,
  '42501', null, 'I22: outbox events are never deleted');

select throws_ok(
  $$ delete from public.audit_log where actor_id = 'a0000000-0000-4000-8000-000000000002' $$,
  '42501', null, 'I23: audit_log is never deleted');

-- ---------------------------------------------------------------------------
-- Kobo guard: no negative money anywhere
-- ---------------------------------------------------------------------------
select results_eq(
  $$ select count(*)::text from (
       select id::text from public.payments_ledger where amount_kobo < 0
       union all
       select id::text from public.ledger_allocations where amount_kobo < 0
       union all
       select id::text from public.payouts where net_kobo < 0 or gross_kobo < 0
       union all
       select id::text from public.contracts where total_kobo < 0 or outstanding_kobo < 0
       union all
       select id::text from public.properties where price_kobo < 0
     ) g $$,
  ARRAY['0'], 'no amount anywhere on the money path is negative');

select * from finish();
rollback;