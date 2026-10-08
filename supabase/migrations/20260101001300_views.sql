create view public.property_search
with (security_invoker = true) as
select
  p.id, p.reference, p.slug, p.title, p.listing_type, p.property_type, p.status,
  p.address_line1, p.city, p.lga, p.state, p.latitude, p.longitude,
  p.bedrooms, p.bathrooms, p.toilets, p.size_sqm, p.amenities,
  p.price_kobo, p.price_cadence, p.negotiable, p.cover_photo_public_id,
  p.published_at, p.created_at,
  o.legal_name as owner_display_name,
  (select count(*) from public.units u where u.property_id = p.id) as unit_count,
  (select count(*) from public.units u where u.property_id = p.id and u.status = 'vacant') as vacant_unit_count,
  ld.title_type, ld.topography, ld.size_plot, ld.is_allocated
from public.properties p
join public.owners o on o.id = p.owner_id
left join public.land_details ld on ld.property_id = p.id
where p.status in ('published','let_agreed','under_offer')
  and p.deleted_at is null;
comment on view public.property_search is
  'Public listing read model. RLS on properties restricts this to published rows for anon.';

create view public.contract_balances
with (security_invoker = true) as
select
  c.id as contract_id, c.reference, c.kind, c.status, c.primary_payer_id,
  c.property_id, c.unit_id, c.owner_id,
  c.total_kobo, c.outstanding_kobo, c.currency,
  c.start_date, c.end_date, c.balance_reconciled_at,
  coalesce(sum(l.amount_kobo) filter (where l.status = 'succeeded'), 0)::bigint as total_paid_kobo,
  coalesce(sum(l.paystack_fee_kobo) filter (where l.status = 'succeeded'), 0)::bigint as total_fees_kobo,
  coalesce((select sum(s.amount_kobo - s.paid_kobo) from public.contract_schedule s
             where s.contract_id = c.id and s.status in ('pending','partial','overdue')), 0)::bigint
    as schedule_outstanding_kobo,
  (select min(s.due_date) from public.contract_schedule s
    where s.contract_id = c.id and s.status in ('pending','partial','overdue')) as next_due_date,
  (select min(s.due_date) from public.contract_schedule s
    where s.contract_id = c.id and s.status in ('pending','partial','overdue') and s.due_date < current_date)
    as oldest_overdue_date
from public.contracts c
left join public.payments_ledger l on l.contract_id = c.id
group by c.id;

create view public.owner_payout_summary
with (security_invoker = true) as
select
  o.id as owner_id,
  coalesce(sum(a.amount_kobo) filter (
      where a.is_payable and a.status = 'settled' and a.basis in ('rent_principal','service_charge_principal','sale_principal')
  ), 0)::bigint as lifetime_earned_kobo,
  coalesce(sum(a.amount_kobo) filter (
      where not a.is_payable and a.basis in ('management_fee','sale_commission')
  ), 0)::bigint as lifetime_fees_kobo,
  coalesce(sum(a.amount_kobo) filter (
      where a.is_payable and a.status = 'settled' and a.basis = 'maintenance_deduction'
  ), 0)::bigint as lifetime_deductions_kobo,
  coalesce(sum(a.amount_kobo) filter (
      where a.is_payable and a.status = 'pending'
  ), 0)::bigint as pending_payout_kobo,
  coalesce((select sum(p.net_kobo) from public.payouts p
             where p.owner_id = o.id and p.status = 'paid'), 0)::bigint as lifetime_paid_kobo
from public.owners o
left join public.ledger_allocations a on a.owner_id = o.id
group by o.id;

create view public.owner_balances
with (security_invoker = true) as
select a.owner_id,
       coalesce(sum(a.amount_kobo) filter (where a.is_payable), 0) - coalesce(r.refunded_kobo, 0) as payable_kobo,
       coalesce(sum(a.amount_kobo) filter (where a.basis = 'deposit_holding'), 0) - coalesce(r.refunded_kobo, 0) as held_kobo
from public.ledger_allocations a
join public.payments_ledger p on p.id = a.payment_id and p.status = 'succeeded'
left join (select allocation_id, sum(amount_kobo) as refunded_kobo
           from public.refund_allocations group by allocation_id) r on r.allocation_id = a.id
where a.owner_id is not null
group by a.owner_id, r.refunded_kobo;
