create table public.maintenance_tickets (
  id                    uuid primary key default gen_random_uuid(),
  reference             text not null unique,
  property_id           uuid not null references public.properties(id) on delete restrict,
  unit_id               uuid references public.units(id) on delete restrict,
  raised_by             uuid not null references auth.users(id) on delete restrict,
  assigned_to           uuid references auth.users(id) on delete set null,
  category              text not null check (category in
                          ('plumbing','electrical','structural','appliance','pest','cleaning',
                           'security','painting','landscaping','other')),
  priority              public.ticket_priority not null default 'medium',
  title                 text not null check (char_length(title) between 4 and 200),
  description           text not null,
  status                public.ticket_status not null default 'open',
  permission_to_enter   boolean not null default false,
  quoted_amount_kobo    bigint check (quoted_amount_kobo >= 0),
  cost_approved_by      uuid references auth.users(id) on delete set null,
  cost_approved_at      timestamptz,
  contractor_name       text,
  contractor_phone_e164 text check (contractor_phone_e164 is null or contractor_phone_e164 ~ '^\+234[0-9]{10}$'),
  resolution_note       text,
  resolved_at           timestamptz,
  closed_at             timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint ticket_approved_has_amount check (
    cost_approved_at is null or (quoted_amount_kobo is not null and cost_approved_by is not null)
  ),
  constraint ticket_resolved_has_time check (status not in ('resolved','closed') or resolved_at is not null)
);

alter table public.ledger_allocations
  add constraint allocations_deduction_ticket_fk
  foreign key (deduction_source_ticket_id) references public.maintenance_tickets(id) on delete restrict;

create table public.ticket_updates (
  id              uuid primary key default gen_random_uuid(),
  ticket_id       uuid not null references public.maintenance_tickets(id) on delete cascade,
  author_id       uuid not null references auth.users(id) on delete restrict,
  body            text not null check (char_length(body) between 1 and 4000),
  visibility      public.ticket_visibility not null default 'shared',
  attachment_public_id text,
  created_at      timestamptz not null default now()
);

create table public.notices (
  id                  uuid primary key default gen_random_uuid(),
  kind                public.notice_kind not null,
  channel             public.notice_channel not null,
  recipient_user_id   uuid references auth.users(id) on delete cascade,
  recipient_address   text not null,
  recipient_name      text,
  template_key        text not null,
  payload             jsonb not null default '{}'::jsonb,
  status              public.notice_status not null default 'queued',
  scheduled_for       timestamptz not null default now(),
  provider_message_id text,
  provider            text,
  sent_at             timestamptz,
  delivered_at        timestamptz,
  failed_at           timestamptz,
  failure_reason      text,
  dedupe_key          text not null unique,
  contract_id         uuid references public.contracts(id) on delete cascade,
  unit_id             uuid references public.units(id) on delete cascade,
  related_entity      text,
  related_id          uuid,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table public.disputes (
  id                uuid primary key default gen_random_uuid(),
  reference         text not null unique,
  contract_id       uuid references public.contracts(id) on delete set null,
  property_id       uuid references public.properties(id) on delete set null,
  unit_id           uuid references public.units(id) on delete set null,
  raised_by         uuid not null references auth.users(id) on delete restrict,
  against_user_id   uuid references auth.users(id) on delete set null,
  category          text not null check (category in
                        ('arrears','deposit_dispute','maintenance','eviction','title',
                         'payout','misrepresentation','other')),
  description       text not null,
  status            public.dispute_status not null default 'open',
  resolution        text,
  resolved_by       uuid references auth.users(id) on delete set null,
  resolved_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint dispute_has_subject check (
    contract_id is not null or property_id is not null or unit_id is not null
  ),
  constraint dispute_resolved_complete check (
    status <> 'resolved' or (resolution is not null and resolved_at is not null)
  )
);
