create schema if not exists private;

create or replace function private.current_user_roles()
returns public.app_role[]
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select array_agg(u.role)
       from jsonb_array_elements_text(
              coalesce(auth.jwt() -> 'app_metadata' -> 'courtland_roles', '[]'::jsonb)
            ) as requested(role_text)
       join public.user_roles u
         on u.role = requested.role_text::public.app_role
        and u.user_id = auth.uid()
       where u.expires_at is null or u.expires_at > now()),
    '{}'::public.app_role[]
  );
$$;

create or replace function private.has_role(required public.app_role)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select required = any(private.current_user_roles());
$$;

create or replace function private.has_role_any(required public.app_role[])
returns boolean
language sql stable security definer set search_path = ''
as $$
  select private.current_user_roles() && required;
$$;

create or replace function private.has_permission(required text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.role_permissions rp
    where rp.permission = required
      and rp.role = any(private.current_user_roles())
  );
$$;

create or replace function private.is_staff()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select private.has_role('admin');
$$;

create or replace function private.owns_property(p_property_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.properties p
    join public.owners o on o.id = p.owner_id
    where p.id = p_property_id and o.user_id = auth.uid()
  );
$$;

create or replace function private.is_contract_party(p_contract_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.contracts c
    where c.id = p_contract_id
      and (c.primary_payer_id = auth.uid()
           or exists (select 1 from public.contract_parties cp
                      where cp.contract_id = c.id and cp.user_id = auth.uid()))
  );
$$;

create or replace function private.unit_belongs_to_property(p_unit_id uuid, p_property_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.units u
                 where u.id = p_unit_id and u.property_id = p_property_id);
$$;

create or replace function private.owner_of(p_property_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.owners o where o.user_id = auth.uid());
$$;

create or replace function private.owns_owner(p_owner_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.owners o
                 where o.id = p_owner_id and o.user_id = auth.uid());
$$;

create or replace function private.occupies_unit(p_unit_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
           select 1 from public.unit_occupancies uo
           where uo.unit_id = p_unit_id
             and uo.user_id = auth.uid()
             and uo.moved_out is null
         )
      or exists (
           select 1 from public.contracts c
           where c.unit_id = p_unit_id
             and c.primary_payer_id = auth.uid()
         );
$$;

create or replace function private.property_is_public(p_property_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.properties p
    where p.id = p_property_id
      and p.status in ('published','let_agreed','under_offer')
      and p.deleted_at is null
  );
$$;

create or replace function private.ticket_is_mine(p_ticket_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.maintenance_tickets t
    where t.id = p_ticket_id
      and (t.raised_by = auth.uid() or private.owns_property(t.property_id))
  );
$$;

create or replace function private.allocate_pro_rata(total bigint, weights bigint[])
returns bigint[]
language plpgsql immutable set search_path = ''
as $$
declare
  sum_w bigint;
  base bigint;
  extra bigint;
  v_idx integer;
  v_grant record;
  result bigint[] := '{}';
  running bigint := 0;
begin
  if total < 0 then raise exception 'total must be non-negative'; end if;
  if coalesce(array_length(weights,1),0) = 0 then
    return '{}';
  end if;
  select coalesce(sum(w), 0) into sum_w from unnest(weights) as w;
  if sum_w <= 0 then
    raise exception 'weights must sum to a positive value';
  end if;
  base := total / sum_w;
  extra := total - (base * sum_w);
  -- Floor everyone, then hand the `extra` units to the largest remainders (ties to earlier index).
  for v_idx in 1..array_length(weights,1) loop
    result := result || base;
    running := running + base;
  end loop;
  -- extra is always less than sum_w, so the limit can never run past the array.
  for v_grant in
    select t.i as idx
      from unnest(weights) with ordinality as t(w, i)
     order by (total * t.w) % sum_w desc, t.i asc
     limit extra
  loop
    result[v_grant.idx] := result[v_grant.idx] + 1;
    running := running + 1;
  end loop;
  -- Any residual drift lands on the last element; the sum is the invariant that matters.
  result[array_length(result,1)] := result[array_length(result,1)] + (total - running);
  return result;
end;
$$;

create or replace function private.compute_allocations(
  p_amount_kobo        bigint,
  p_paystack_fee_kobo  bigint,
  p_kind               public.payment_kind,
  p_management_fee_bps integer,
  p_commission_bps     integer,
  p_owner_id           uuid
) returns table (basis public.allocation_basis, beneficiary public.beneficiary_type,
                 amount bigint, is_payable boolean)
language plpgsql immutable set search_path = ''
as $$
declare
  net bigint := p_amount_kobo - p_paystack_fee_kobo;
  fee bigint;
begin
  if net < 0 then raise exception 'paystack fee exceeds amount'; end if;

  if p_kind in ('rent','service_charge') then
    fee := (net * p_management_fee_bps) / 10000;
    return query
      select 'management_fee'::public.allocation_basis, 'platform'::public.beneficiary_type, fee, false
      union all
      select 'rent_principal', 'owner', net - fee, true;
  elsif p_kind in ('installment','outright_purchase') then
    fee := (net * p_commission_bps) / 10000;
    return query
      select 'sale_commission'::public.allocation_basis, 'platform'::public.beneficiary_type, fee, false
      union all
      select 'sale_principal'::public.allocation_basis, 'owner'::public.beneficiary_type, net - fee, true;
  elsif p_kind = 'deposit' then
    return query select 'deposit_holding'::public.allocation_basis, 'reserve'::public.beneficiary_type, net, false;
  elsif p_kind = 'agreement_fee' then
    return query select 'agreement_fee_holding'::public.allocation_basis, 'reserve'::public.beneficiary_type, net, false;
  elsif p_kind = 'penalty' then
    fee := 0;
    return query
      select 'management_fee'::public.allocation_basis, 'platform'::public.beneficiary_type, fee, false
      union all
      select 'rent_principal'::public.allocation_basis, 'owner'::public.beneficiary_type, net, true;
  else
    return query select 'rent_principal'::public.allocation_basis, 'owner'::public.beneficiary_type, net, true;
  end if;
end;
$$;

create or replace function private.set_reference()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  seq    text := tg_argv[0];
  prefix text := tg_argv[1];
begin
  if new.reference is null then
    new.reference := prefix || lpad(nextval(seq)::text, 6, '0');
  end if;
  return new;
end $$;

create or replace function private.touch_updated_at()
returns trigger language plpgsql security definer set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;

create or replace function private.flag_enabled(p_key text)
returns boolean
language sql stable security definer set search_path = ''
as $$ select coalesce((select enabled from public.feature_flags where key = p_key), false) $$;

create or replace function private.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  wanted public.app_role[];
begin
  insert into public.profiles (id, phone_e164, email)
  values (new.id, new.phone, new.email)
  on conflict (id) do nothing;

  -- Roles requested at creation time, else the default. The API cannot insert a role first:
  -- user_roles.user_id references auth.users(id), so there is no id to insert against until GoTrue
  -- has written the user, and by then this trigger has already run inside the same transaction.
  -- The request therefore travels in app_metadata and is read here, once, at creation.
  wanted := coalesce(
    (select array_agg(r::public.app_role)
       from jsonb_array_elements_text(coalesce(new.raw_app_meta_data->'courtland_roles', '[]'::jsonb)) r),
    array['tenant'::public.app_role]);

  insert into public.user_roles (user_id, role)
  select new.id, unnest(wanted)
  on conflict do nothing;
  return new;
end $$;
