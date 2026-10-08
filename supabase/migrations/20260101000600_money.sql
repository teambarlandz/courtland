create table public.payment_intents (
  id                    uuid primary key default gen_random_uuid(),
  contract_id           uuid not null references public.contracts(id) on delete restrict,
  schedule_id           uuid references public.contract_schedule(id) on delete set null,
  payer_id              uuid not null references auth.users(id) on delete restrict,
  kind                  public.payment_kind not null,
  amount_kobo           bigint not null check (amount_kobo > 0),
  currency              text not null default 'NGN' check (currency = 'NGN'),
  status                public.payment_intent_status not null default 'created',

  due_date              date,
  period_start          date,
  period_end            date,
  description           text,

  -- Paystack
  paystack_reference    text unique,
  paystack_access_code  text,
  authorization_code    text,
  authorization_reusable boolean not null default false,
  split_snapshot        jsonb,
  provider_metadata     jsonb not null default '{}'::jsonb,

  idempotency_key       text,
  expires_at            timestamptz not null default (now() + interval '24 hours'),
  settled_at            timestamptz,
  failure_reason        text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
comment on column public.payment_intents.split_snapshot is
  'The split configuration sent to Paystack at initialisation. Makes any payout dispute reconstructable from the ledger.';

create table public.payments_ledger (
  id                  uuid primary key default gen_random_uuid(),
  reference           text not null unique,
  intent_id           uuid not null references public.payment_intents(id) on delete restrict,
  contract_id         uuid not null references public.contracts(id) on delete restrict,
  payer_id            uuid not null references auth.users(id) on delete restrict,
  owner_id            uuid not null references public.owners(id) on delete restrict,
  kind                public.payment_kind not null,
  amount_kobo         bigint not null check (amount_kobo > 0),
  paystack_fee_kobo   bigint not null default 0 check (paystack_fee_kobo >= 0),
  net_kobo            bigint generated always as (amount_kobo - paystack_fee_kobo) stored,
  currency            text not null default 'NGN' check (currency = 'NGN'),
  status              public.ledger_status not null default 'pending',
  channel             public.payment_channel,
  paystack_reference  text not null unique,
  paystack_event_id   text,
  paystack_authorization_code text,
  paid_at             timestamptz,
  reversed_at         timestamptz,
  reversal_reason     text,
  refunded_kobo       bigint not null default 0 check (refunded_kobo >= 0 and refunded_kobo <= amount_kobo),
  metadata            jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
comment on table public.payments_ledger is
  'Immutable evidence that money moved. I11: no delete policy exists.';

create table public.ledger_allocations (
  id                    uuid primary key default gen_random_uuid(),
  payment_id            uuid not null references public.payments_ledger(id) on delete restrict,
  beneficiary_type      public.beneficiary_type not null,
  owner_id              uuid references public.owners(id) on delete restrict,
  basis                 public.allocation_basis not null,
  amount_kobo           bigint not null check (amount_kobo >= 0),
  status                public.allocation_status not null default 'pending',
  is_payable            boolean not null default true,
  paystack_subaccount_code text,
  -- Set by the payout run, in the same transaction that inserts the payout. A real foreign key rather than
  -- a settlement_batch text join: the money must not be able to belong to a batch that does not exist.
  payout_id             uuid,
  settlement_batch      text,
  settled_at            timestamptz,
  note                  text,
  created_at            timestamptz not null default now(),
  -- I12: a ticket is deducted at most once
  deduction_source_ticket_id uuid,
  constraint allocation_owner_required check (
    beneficiary_type <> 'owner' or owner_id is not null
  ),
  constraint allocation_deduction_has_ticket check (
    basis <> 'maintenance_deduction' or deduction_source_ticket_id is not null
  ),
  constraint allocation_deduction_to_owner check (
    basis <> 'maintenance_deduction' or beneficiary_type = 'owner'
  ),
  constraint allocation_reserve_not_payable check (
    beneficiary_type <> 'reserve' or is_payable = false
  )
);

create table public.payouts (
  id                    uuid primary key default gen_random_uuid(),
  reference             text not null unique,
  owner_id              uuid not null references public.owners(id) on delete restrict,
  period_start          date not null,
  period_end            date not null,
  currency              text not null default 'NGN' check (currency = 'NGN'),
  gross_kobo            bigint not null check (gross_kobo >= 0),
  deductions_kobo       bigint not null default 0 check (deductions_kobo >= 0),
  carry_forward_kobo    bigint not null default 0,
  net_kobo              bigint not null check (net_kobo >= 0),
  status                public.payout_status not null default 'draft',
  method                public.payout_method not null default 'paystack_transfer',
  paystack_subaccount_code text,
  paystack_transfer_reference text,
  allocation_count      integer not null default 0,
  initiated_by          uuid references auth.users(id) on delete set null,
  initiated_at          timestamptz,
  approved_by           uuid references auth.users(id) on delete set null,
  approved_at           timestamptz,
  paid_at               timestamptz,
  failure_reason        text,
  statement_document_id uuid,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  -- I13
  constraint payouts_net_matches check (net_kobo = gross_kobo - deductions_kobo + carry_forward_kobo),
  constraint payouts_period_ordered check (period_end >= period_start)
);

alter table public.ledger_allocations
  add constraint allocations_payout_fk
  foreign key (payout_id) references public.payouts(id) on delete restrict;

create table public.refunds (
  id                  uuid primary key default gen_random_uuid(),
  payment_id          uuid not null references public.payments_ledger(id) on delete restrict,
  requested_by        uuid not null references auth.users(id) on delete restrict,
  amount_kobo         bigint not null check (amount_kobo > 0),
  reason              text not null,
  status              text not null default 'pending'
                        check (status in ('pending','processing','processed','failed','needs_attention')),
  paystack_refund_id  text unique,
  failure_reason      text,
  created_at          timestamptz not null default now(),
  processed_at        timestamptz,
  updated_at          timestamptz not null default now()
);

create table public.refund_allocations (
  id                uuid primary key default gen_random_uuid(),
  refund_id         uuid not null references public.refunds(id) on delete cascade,
  allocation_id     uuid not null references public.ledger_allocations(id) on delete restrict,
  amount_kobo       bigint not null check (amount_kobo > 0),   -- always positive; the refund_id carries the sign
  created_at        timestamptz not null default now(),
  unique (refund_id, allocation_id)
);

create table public.paystack_accounts (
  id                    uuid primary key default gen_random_uuid(),
  owner_id              uuid not null unique references public.owners(id) on delete cascade,
  subaccount_code       text not null unique,
  paystack_subaccount_id text,
  business_name         text not null,
  settlement_bank       text not null,
  account_number        text not null,
  percentage_charge_bps integer not null default 0
                          check (percentage_charge_bps between 0 and 10000),
  settlement_schedule   text not null default 'auto'
                          check (settlement_schedule in ('auto','weekly','monthly','manual')),
  is_active             boolean not null default true,
  verified_at           timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
