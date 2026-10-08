create table public.profiles (
  id                uuid primary key references auth.users(id) on delete cascade,
  full_name         text,
  email             citext,
  phone_e164        text unique check (phone_e164 ~ '^\+234[0-9]{10}$'),
  avatar_public_id  text,
  onboarding_state  public.onboarding_state not null default 'phone_only',
  -- Payer-side KYC. The vendor side lives on owners.kyc_status, because an owner is a business entity
  -- with a BVN or TIN while the payer side is always a natural person with an identity document, and the
  -- two are reviewed by different staff against different checklists.
  kyc_status        public.kyc_status not null default 'not_started',
  kyc_notes         text,
  kyc_reviewed_by   uuid references auth.users(id) on delete set null,
  kyc_reviewed_at   timestamptz,
  last_seen_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,
  constraint profiles_email_format check (email is null or email ~ '^[^@]+@[^@]+\.[^@]+$')
);
comment on table public.profiles is 'Application-side mirror of auth.users. Credentials live in auth.';
comment on column public.profiles.phone_e164 is 'Nigerian numbers only, E.164 format. Uniquely identifies a portal user.';
comment on column public.profiles.kyc_status is
  'Payer identity verification. Gates contract approval for a tenant or buyer; owners.kyc_status gates payouts.';

create table public.user_roles (
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        public.app_role not null,
  granted_by  uuid references auth.users(id) on delete set null,
  granted_at  timestamptz not null default now(),
  expires_at  timestamptz,
  primary key (user_id, role)
);
comment on table public.user_roles is
  'Effective role grants. JWT custom_access_token_hook projects these into app_metadata.courtland_roles.';

create table public.role_permissions (
  role        public.app_role not null,
  permission  text not null check (permission ~ '^[a-z_]+$'),
  granted_at  timestamptz not null default now(),
  primary key (role, permission)
);
comment on table public.role_permissions is
  'Seeded from packages/types/src/permissions/matrix.ts. A test asserts code and database agree.';

create table public.saved_searches (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  name          text not null,
  filters       jsonb not null default '{}'::jsonb,
  alerts_on     boolean not null default false,
  last_alerted_at timestamptz,
  created_at    timestamptz not null default now(),
  unique (user_id, name)
);

create table public.admin_filter_views (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid references auth.users(id) on delete cascade,
  name        text not null,
  entity      text not null check (entity in ('clients', 'contracts', 'properties', 'payments',
                                              'tickets', 'documents', 'owners')),
  filters     jsonb not null default '{}'::jsonb,
  columns     text[] not null default '{}',
  is_shared   boolean not null default false,
  sort        jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint admin_filter_views_shared_needs_owner
    check (is_shared = false or owner_id is not null)
);
