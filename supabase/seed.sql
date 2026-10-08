-- Local fixtures: one user per role, one owner, one published rental property, one unit,
-- one lease, one balanced payment. Nothing else. Reference data belongs in a later phase.

-- ---------------------------------------------------------------------------
-- Users. handle_new_user() creates profiles + roles from raw_app_meta_data.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, raw_app_meta_data) values
  ('10000000-0000-4000-8000-000000000001', 'admin@courtland.test',
   '{"courtland_roles":["admin"]}'),
  ('10000000-0000-4000-8000-000000000002', 'landlord@courtland.test',
   '{"courtland_roles":["landlord"]}'),
  ('10000000-0000-4000-8000-000000000003', 'tenant@courtland.test',
   '{"courtland_roles":["tenant"]}'),
  ('10000000-0000-4000-8000-000000000004', 'buyer@courtland.test',
   '{"courtland_roles":["buyer"]}')
on conflict (id) do nothing;

update public.profiles set full_name = 'Seed Admin',     onboarding_state = 'complete' where id = '10000000-0000-4000-8000-000000000001';
update public.profiles set full_name = 'Seed Landlord',  onboarding_state = 'complete' where id = '10000000-0000-4000-8000-000000000002';
update public.profiles set full_name = 'Seed Tenant',    onboarding_state = 'complete' where id = '10000000-0000-4000-8000-000000000003';
update public.profiles set full_name = 'Seed Buyer',     onboarding_state = 'complete' where id = '10000000-0000-4000-8000-000000000004';

-- ---------------------------------------------------------------------------
-- Owner (linked to the landlord).
-- ---------------------------------------------------------------------------
insert into public.owners (id, user_id, owner_type, legal_name, email, kyc_status)
values ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002',
        'individual', 'Seed Landlord', 'landlord@courtland.test', 'verified')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Published rental property + unit. reference PRT-/OWN- come from set_reference().
-- ---------------------------------------------------------------------------
insert into public.properties
  (id, owner_id, slug, title, description, listing_type, property_type, status,
   address_line1, city, lga, state, bedrooms, bathrooms, price_kobo, price_cadence,
   published_at, created_by)
values
  ('20000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001',
   'seed-rent-bungalow', 'Seed Rent Bungalow',
   'A three bedroom bungalow used by local fixtures.', 'rent', 'bungalow', 'published',
   '1 Seed Street', 'Lekki', 'Eti-Osa', 'Lagos', 3, 2, 5000000000, 'year',
   now(), '10000000-0000-4000-8000-000000000002')
on conflict (id) do nothing;

insert into public.units
  (id, property_id, code, bedrooms, bathrooms, asking_rent_kobo, service_charge_kobo, status)
values
  ('20000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000002',
   'A1', 3, 2, 50000000, 5000000, 'vacant')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Lease. Inserted as draft, then activated so contracts_sync_unit() occupies the unit.
-- ---------------------------------------------------------------------------
insert into public.contracts
  (id, kind, property_id, unit_id, owner_id, primary_payer_id, status,
   start_date, end_date, total_kobo, outstanding_kobo,
   rent_kobo, rent_cadence_months, service_charge_kobo, security_deposit_kobo, created_by)
values
  ('20000000-0000-4000-8000-000000000004', 'lease',
   '20000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000003',
   '20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003',
   'draft', date '2026-10-01', date '2027-09-30', 60000000, 10000000,
   50000000, 12, 5000000, 5000000, '10000000-0000-4000-8000-000000000002')
on conflict (id) do nothing;

insert into public.contract_parties
  (contract_id, user_id, party_name, party_role, email, is_primary)
values
  ('20000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000002',
   'Seed Landlord', 'landlord', 'landlord@courtland.test', false),
  ('20000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000003',
   'Seed Tenant', 'tenant', 'tenant@courtland.test', true);

update public.contracts
   set status = 'active', activated_at = now()
 where id = '20000000-0000-4000-8000-000000000004';

-- ---------------------------------------------------------------------------
-- Payment: rent settled by the tenant. The ledger starts pending so the balance
-- assertion passes at insert; allocations land; status flips to succeeded and
-- I1 is enforced by the before-update assertion.
-- ---------------------------------------------------------------------------
insert into public.payment_intents
  (id, contract_id, payer_id, kind, amount_kobo, status, settled_at, paystack_reference)
values
  ('20000000-0000-4000-8000-000000000007',
   '20000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000003',
   'rent', 50000000, 'succeeded', now(), 'seed_intent_ref')
on conflict (id) do nothing;

insert into public.payments_ledger
  (id, intent_id, contract_id, payer_id, owner_id, kind, amount_kobo, paystack_fee_kobo,
   status, channel, paystack_reference, paid_at)
values
  ('20000000-0000-4000-8000-000000000008',
   '20000000-0000-4000-8000-000000000007',
   '20000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000003',
   '20000000-0000-4000-8000-000000000001',
   'rent', 50000000, 750000, 'pending', 'card', 'seed_pay_ref', now())
on conflict (id) do nothing;

-- net = 50,000,000 - 750,000 = 49,250,000; a single owner allocation carries it.
insert into public.ledger_allocations
  (id, payment_id, beneficiary_type, owner_id, basis, amount_kobo, status, is_payable)
values
  ('20000000-0000-4000-8000-000000000009',
   '20000000-0000-4000-8000-000000000008', 'owner',
   '20000000-0000-4000-8000-000000000001', 'rent_principal', 49250000, 'pending', true)
on conflict (id) do nothing;

update public.payments_ledger
   set status = 'succeeded'
 where id = '20000000-0000-4000-8000-000000000008';
