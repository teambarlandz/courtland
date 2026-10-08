create table public.webhook_events (
  id             uuid primary key default gen_random_uuid(),
  provider       public.webhook_provider not null,
  event_id       text not null,
  event_type     text not null,
  signature_valid boolean not null default false,
  status         public.webhook_status not null default 'received',
  payload        jsonb not null,
  headers        jsonb not null default '{}'::jsonb,
  attempts       smallint not null default 0,
  last_error     text,
  received_at    timestamptz not null default now(),
  processing_at  timestamptz,
  processed_at   timestamptz,
  unique (provider, event_id)          -- I20
);
comment on column public.webhook_events.payload is
  'Raw provider payload. Retained for dispute resolution. Access is staff-only.';

create table public.idempotency_keys (
  id                  uuid primary key default gen_random_uuid(),
  scope               text not null,
  key                 text not null check (char_length(key) between 8 and 255),
  user_id             uuid references auth.users(id) on delete cascade,
  request_fingerprint text not null,
  response_status     smallint,
  response_body       jsonb,
  locked_at           timestamptz not null default now(),
  created_at          timestamptz not null default now(),
  expires_at          timestamptz not null default (now() + interval '24 hours'),
  unique (scope, key)                 -- I21
);

create table public.outbox_events (
  id             uuid primary key default gen_random_uuid(),
  event_type     text not null,
  aggregate_type text not null,
  aggregate_id   uuid not null,
  payload        jsonb not null,
  occurred_at    timestamptz not null default now(),
  published_at   timestamptz,
  publish_attempts smallint not null default 0,
  last_error     text,
  unique (event_type, aggregate_id, occurred_at)
);
comment on table public.outbox_events is
  'Transactional outbox. Written in the same transaction as the state change, published by a separate job. I22: no delete policy.';

create table public.audit_log (
  id          bigint generated always as identity primary key,
  actor_id    uuid references auth.users(id) on delete set null,
  actor_role  text not null default 'system',
  action      text not null,
  entity_type text not null,
  entity_id   uuid,
  before      jsonb,
  after       jsonb,
  changed_keys text[],
  ip          inet,
  request_id  text,
  created_at  timestamptz not null default now()
);
comment on table public.audit_log is
  'Append-only. I23: update and delete are blocked by trigger and no policies exist. Partition by month past 12 months.';

create table public.job_runs (
  id             uuid primary key default gen_random_uuid(),
  job_name       text not null,
  run_id         text not null,
  trigger        text not null check (trigger in ('cron','event','manual','replay')),
  status         text not null check (status in ('running','succeeded','failed','cancelled','skipped')),
  started_at     timestamptz not null default now(),
  finished_at    timestamptz,
  duration_ms    integer,
  items_processed integer not null default 0,
  items_failed   integer not null default 0,
  summary        jsonb not null default '{}'::jsonb,
  error          text
);

create table public.feature_flags (
  key        text primary key,
  enabled    boolean not null default false,
  reason     text,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
