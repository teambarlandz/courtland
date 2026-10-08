create table public.contracts (
  id                    uuid primary key default gen_random_uuid(),
  kind                  public.contract_kind not null,
  reference             text not null unique,
  property_id           uuid not null references public.properties(id) on delete restrict,
  unit_id               uuid references public.units(id) on delete restrict,
  owner_id              uuid not null references public.owners(id) on delete restrict,
  primary_payer_id      uuid not null references auth.users(id) on delete restrict,

  status                public.contract_status not null default 'draft',
  suspension_reason     text,

  start_date            date,
  end_date              date,
  activated_at          timestamptz,
  terminated_at         timestamptz,
  termination_reason    text,
  expired_at            timestamptz,
  completed_at          timestamptz,

  -- Money
  currency              text not null default 'NGN' check (currency = 'NGN'),
  total_kobo            bigint not null check (total_kobo > 0),
  outstanding_kobo      bigint not null check (outstanding_kobo >= 0),
  balance_reconciled_at timestamptz,

  -- Lease
  rent_kobo             bigint check (rent_kobo > 0),
  rent_cadence_months   smallint check (rent_cadence_months in (1,3,6,12)),
  service_charge_kobo   bigint check (service_charge_kobo >= 0),
  security_deposit_kobo bigint check (security_deposit_kobo >= 0),
  agreement_fee_kobo    bigint check (agreement_fee_kobo >= 0),
  late_fee_policy       public.late_fee_policy not null default 'none',
  late_fee_value        bigint not null default 0 check (late_fee_value >= 0),
  grace_days            smallint not null default 3 check (grace_days between 0 and 90),

  -- Sale
  payment_plan          public.payment_plan,
  installment_count     smallint check (installment_count > 0),
  installment_amount_kobo bigint check (installment_amount_kobo > 0),
  installment_day_of_month smallint check (installment_day_of_month between 1 and 28),
  title_release_status  public.title_release_status not null default 'not_eligible',
  allocation_id         uuid references public.sale_allocations(id) on delete set null,

  agreement_document_id uuid,
  notes                 text,
  created_by            uuid references auth.users(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  -- I3: unit required for lease, forbidden for sale
  constraint contracts_unit_matches_kind check (
    (kind = 'lease' and unit_id is not null) or (kind = 'sale' and unit_id is null)
  ),
  -- I15: suspension needs a reason
  constraint contracts_suspended_has_reason check (
    status <> 'suspended' or suspension_reason is not null
  ),
  -- I16: installment shape
  constraint contracts_installment_shape check (
    payment_plan is null
    or (payment_plan = 'outright' and installment_count = 1)
    or (payment_plan = 'installment'
        and installment_count >= 2
        and installment_amount_kobo > 0
        and installment_day_of_month between 1 and 28)
  ),
  -- Lease money shape
  constraint contracts_lease_money_shape check (
    kind <> 'lease' or (rent_kobo > 0 and rent_cadence_months is not null)
  ),
  -- Dates
  constraint contracts_dates_ordered check (end_date is null or start_date is null or end_date > start_date),
  -- A finished agreement owes nothing. 'terminated' is the terminal state for both kinds: a completed
  -- sale is terminated once the price is settled in full, which is the only way a sale ends in this
  -- machine. There is no separate 'completed' status, so the check names the state that actually exists.
  constraint contracts_terminated_owes_nothing check (
    status <> 'terminated' or outstanding_kobo = 0
  )
);

alter table public.units
  add constraint units_current_contract_fk
  foreign key (current_contract_id) references public.contracts(id) on delete set null;

create table public.contract_parties (
  id                    uuid primary key default gen_random_uuid(),
  contract_id           uuid not null references public.contracts(id) on delete cascade,
  user_id               uuid references auth.users(id) on delete set null,
  party_name            text not null check (char_length(party_name) between 2 and 160),
  party_role            public.party_role not null,
  email                 citext,
  phone_e164            text check (phone_e164 is null or phone_e164 ~ '^\+234[0-9]{10}$'),
  nationality           text,
  address               text,
  is_primary            boolean not null default false,
  signed_at             timestamptz,
  signature_document_id uuid,
  added_at              timestamptz not null default now(),
  unique (contract_id, party_role, party_name)
);

create table public.contract_schedule (
  id                uuid primary key default gen_random_uuid(),
  contract_id       uuid not null references public.contracts(id) on delete cascade,
  seq               smallint not null check (seq > 0),
  kind              public.schedule_kind not null,
  due_date          date not null,
  amount_kobo       bigint not null check (amount_kobo > 0),
  paid_kobo         bigint not null default 0 check (paid_kobo >= 0),
  status            public.schedule_status not null default 'pending',
  paid_at           timestamptz,
  waived_by         uuid references auth.users(id) on delete set null,
  waiver_reason     text,
  payment_intent_id uuid,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  -- I9
  constraint schedule_paid_within_amount check (paid_kobo <= amount_kobo),
  -- I8
  unique (contract_id, seq)
);

create table public.contract_events (
  id           uuid primary key default gen_random_uuid(),
  contract_id  uuid not null references public.contracts(id) on delete cascade,
  event_type   text not null,
  from_status  public.contract_status,
  to_status    public.contract_status,
  actor_id     uuid references auth.users(id) on delete set null,
  actor_role   text not null,       -- 'system', 'admin', 'tenant', 'buyer', 'owner', 'job:<name>'
  note         text,
  metadata     jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);
comment on table public.contract_events is
  'Append-only. No update or delete policy exists. This is the evidential record of the agreement.';

create table public.unit_occupancies (
  id            uuid primary key default gen_random_uuid(),
  unit_id       uuid not null references public.units(id) on delete cascade,
  contract_id   uuid references public.contracts(id) on delete set null,
  person_name   text not null,
  user_id       uuid references auth.users(id) on delete set null,
  relationship  public.occupancy_relationship not null default 'primary',
  moved_in      date not null default current_date,
  moved_out     date,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint occupancy_dates check (moved_out is null or moved_out >= moved_in)
);
comment on table public.unit_occupancies is
  'Who physically occupies a unit, which may not be who holds the lease. 04-domain-model 3.7.';
