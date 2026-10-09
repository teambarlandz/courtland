-- updated_at on every table that has one
do $$
declare t text;
begin
  foreach t in array array[
    'profiles','owners','properties','land_details','units','contracts',
    'contract_schedule','payment_intents','payments_ledger',
    'payouts','refunds','maintenance_tickets','notices','disputes','documents',
    'sale_allocations','admin_filter_views','paystack_accounts'
  ] loop
    execute format(
      'create trigger %I_touch before update on public.%I
       for each row execute function private.touch_updated_at()', t, t);
  end loop;
end $$;

-- I1: units only on rental properties
create or replace function private.check_unit_listing_type()
returns trigger language plpgsql as $$
begin
  if not exists (select 1 from public.properties p
                 where p.id = new.property_id and p.listing_type = 'rent') then
    raise exception 'units may only exist on properties with listing_type = rent'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger units_listing_type_guard
  before insert or update of property_id on public.units
  for each row execute function private.check_unit_listing_type();

-- I2: land_details presence matches property_type
create or replace function private.check_land_details_presence()
returns trigger language plpgsql as $$
declare
  is_land boolean;
  has_details boolean;
begin
  select property_type = 'land' into is_land from public.properties where id = new.id;
  select exists (select 1 from public.land_details where property_id = new.id) into has_details;
  if new.property_type = 'land' and not has_details then
    raise exception 'property_type = land requires a land_details row'
      using errcode = 'check_violation';
  end if;
  if new.property_type <> 'land' and has_details then
    raise exception 'property_type <> land must not have a land_details row'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger properties_land_details_guard
  after insert or update of property_type on public.properties
  for each row execute function private.check_land_details_presence();

-- I4: contract listing_type matches its property
create or replace function private.check_contract_listing_type()
returns trigger language plpgsql as $$
declare
  expected public.listing_type;
  actual   public.listing_type;
begin
  select listing_type into expected from public.properties where id = new.property_id;
  select listing_type into actual
    from public.properties p
    join public.units u on u.property_id = p.id
   where u.id = new.unit_id;
  if actual is not null and actual <> expected then
    raise exception 'contract unit % belongs to a % property but contract implies %',
      new.unit_id, actual, expected using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger contracts_listing_type_guard
  before insert or update of property_id, unit_id on public.contracts
  for each row execute function private.check_contract_listing_type();

-- I6: unit status follows contract status
create or replace function private.sync_unit_from_contract()
returns trigger language plpgsql as $$
begin
  if new.kind = 'lease' and new.unit_id is not null
     and new.status is distinct from old.status then
    if new.status = 'active' then
      update public.units set status = 'occupied', current_contract_id = new.id
       where id = new.unit_id;
    elsif new.status = 'terminated' then
      update public.units set current_contract_id = null, status = 'evicted'::public.unit_status
       where id = new.unit_id and current_contract_id = new.id;
    elsif new.status = 'expired' then
      update public.units set current_contract_id = null, status = 'vacant'::public.unit_status
       where id = new.unit_id and current_contract_id = new.id;
    end if;
    -- The other six statuses leave the unit alone. 'approved' is the important one: a contract that is
    -- approved but not yet activated must not mark a unit occupied, or a unit could be blocked by an
    -- agreement nobody has moved into, and 'suspended' must not free a unit somebody is still paying for.
  end if;
  return new;
end $$;

create trigger contracts_sync_unit
  after update of status on public.contracts
  for each row when (old.status is distinct from new.status)
  execute function private.sync_unit_from_contract();

-- I10: the ledger invariant. The most important trigger in the database.
-- The assertion is a plain function so both the payment trigger and the allocation trigger can call it;
-- putting the logic in the trigger function would have left the allocation path calling a function that
-- did not exist.
create or replace function private.assert_ledger_balanced(p_payment_id uuid)
returns void
language plpgsql as $$
declare
  p        public.payments_ledger%rowtype;
  allocated bigint;
  payable   bigint;
  nonpayable bigint;
begin
  select * into p from public.payments_ledger where id = p_payment_id;
  if p.id is null or p.status <> 'succeeded' then
    return;   -- only a succeeded payment has to balance
  end if;

  select coalesce(sum(amount_kobo), 0),
         coalesce(sum(amount_kobo) filter (where is_payable), 0),
         coalesce(sum(amount_kobo) filter (where not is_payable), 0)
    into allocated, payable, nonpayable
    from public.ledger_allocations where payment_id = p_payment_id;

  if allocated <> p.amount_kobo - p.paystack_fee_kobo then
    raise exception
      'ledger unbalanced: payment % amount % - fee % = % but allocations total %',
      p.id, p.amount_kobo, p.paystack_fee_kobo, p.amount_kobo - p.paystack_fee_kobo, allocated
      using errcode = 'check_violation';
  end if;
  if payable + nonpayable <> allocated then
    raise exception 'ledger payable split does not sum to the allocation total for payment %', p.id
      using errcode = 'check_violation';
  end if;
end $$;

create or replace function private.payments_ledger_assert_balanced()
returns trigger language plpgsql as $$
begin
  perform private.assert_ledger_balanced(new.id);
  return new;
end $$;

create trigger payments_ledger_assert_balanced
  before insert or update of status, amount_kobo, paystack_fee_kobo on public.payments_ledger
  for each row execute function private.payments_ledger_assert_balanced();

-- The same assertion after an allocation changes, so a late allocation or an edited split cannot break a
-- payment that already succeeded. AFTER, not BEFORE: the allocation row has to be visible to the
-- assertion, and it is not until the statement completes.
create or replace function private.allocations_assert_balanced()
returns trigger language plpgsql as $$
begin
  perform private.assert_ledger_balanced(new.payment_id);
  perform private.assert_ledger_balanced(old.payment_id);   -- an update may move an allocation
  return null;
end $$;

create trigger allocations_assert_balanced
  after insert or update or delete on public.ledger_allocations
  for each row execute function private.allocations_assert_balanced();

-- I14: paid payouts are immutable
create or replace function private.block_paid_payout_mutation()
returns trigger language plpgsql as $$
begin
  if old.status = 'paid' then
    raise exception 'payout % is paid and immutable', old.id using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger payouts_immutable_when_paid
  before update or delete on public.payouts
  for each row execute function private.block_paid_payout_mutation();

-- I11, I22, I23: append-only tables reject delete
create or replace function private.reject_delete()
returns trigger language plpgsql as $$
begin
  raise exception '% is append-only; % is not permitted', TG_TABLE_NAME, TG_OP
    using errcode = 'insufficient_privilege';
end $$;

create trigger payments_ledger_no_delete   before delete on public.payments_ledger   execute function private.reject_delete();
create trigger outbox_events_no_delete     before delete on public.outbox_events     execute function private.reject_delete();
create trigger audit_log_no_delete         before delete on public.audit_log         execute function private.reject_delete();
create trigger audit_log_no_update         before update on public.audit_log         execute function private.reject_delete();
create trigger contract_events_no_delete   before delete on public.contract_events   execute function private.reject_delete();
create trigger document_access_no_delete   before delete on public.document_access_log execute function private.reject_delete();

-- audit_log population
create or replace function private.capture_audit()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_role  text := coalesce((private.current_user_roles())[1]::text, 'anon');
  v_changed text[];
begin
  if TG_OP = 'INSERT' then
    v_changed := array(select jsonb_object_keys(to_jsonb(NEW)));
  else
    v_changed := array(select key from jsonb_each_text(to_jsonb(NEW)) n
                        where n.value is distinct from to_jsonb(OLD) ->> key);
    if v_changed = '{}' then return new; end if;
  end if;
  insert into public.audit_log
    (actor_id, actor_role, action, entity_type, entity_id, before, after, changed_keys, ip, request_id)
  values
    (v_actor, v_role, lower(TG_OP), TG_TABLE_NAME,
     coalesce((to_jsonb(NEW) ->> 'id')::uuid, (to_jsonb(NEW) ->> 'property_id')::uuid),
     case when TG_OP = 'UPDATE' then to_jsonb(OLD) end,
     to_jsonb(NEW), v_changed,
     nullif(current_setting('request.headers', true)::jsonb ->> 'x-forwarded-for','')::inet,
     current_setting('application_name', true));
  return new;
end $$;

create trigger audit_properties      after insert or update or delete on public.properties     execute function private.capture_audit();
create trigger audit_contracts       after insert or update or delete on public.contracts      execute function private.capture_audit();
create trigger audit_payments_ledger after insert or update on public.payments_ledger          execute function private.capture_audit();
create trigger audit_payouts         after insert or update on public.payouts                  execute function private.capture_audit();
create trigger audit_owners         after insert or update on public.owners                  execute function private.capture_audit();
create trigger audit_documents       after insert or update on public.documents                execute function private.capture_audit();
create trigger audit_user_roles      after insert or update or delete on public.user_roles     execute function private.capture_audit();

create trigger properties_set_reference before insert or update of reference on public.properties
  for each row execute function private.set_reference('public.property_reference_seq', 'PRT-');
create trigger owners_set_reference before insert or update of reference on public.owners
  for each row execute function private.set_reference('public.owner_reference_seq', 'OWN-');
create trigger contracts_set_reference before insert or update of reference on public.contracts
  for each row execute function private.set_reference('public.contract_reference_seq', 'CLT-');
create trigger sale_allocations_set_reference before insert or update of reference on public.sale_allocations
  for each row execute function private.set_reference('public.allocation_reference_seq', 'ALC-');
create trigger payments_ledger_set_reference before insert or update of reference on public.payments_ledger
  for each row execute function private.set_reference('public.payment_reference_seq', 'PAY-');
create trigger maintenance_tickets_set_reference before insert or update of reference on public.maintenance_tickets
  for each row execute function private.set_reference('public.ticket_reference_seq', 'MNT-');
create trigger disputes_set_reference before insert or update of reference on public.disputes
  for each row execute function private.set_reference('public.dispute_reference_seq', 'DSP-');
create trigger documents_set_reference before insert or update of reference on public.documents
  for each row execute function private.set_reference('public.document_reference_seq', 'DOC-');

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();
