# 05 â€” Database Schema

Column-level reference for the Supabase Postgres database. This is the authoritative document for
structure. Behaviour and invariants are in [`04-domain-model.md`](./04-domain-model.md).

Read the conventions first; they explain most of the decisions.

## 1. Conventions

| Convention | Rule |
|---|---|
| Primary keys | `uuid` with `default gen_random_uuid()`. No auto-increment integers on business tables. |
| Human references | `text` with `default` from a Postgres sequence, set by trigger. Never generated in application code. |
| Money | `bigint` named `*_kobo`. Never `numeric`, never `float`. |
| Timestamps | `timestamptz`, always stored UTC. Columns named `*_at`. |
| Calendar dates | `date`. Used for due dates, tenancy terms, pay periods. Named without `_at`. |
| Booleans | Prefixed `is_` or `has_`. Always `not null` with an explicit default. No nullable booleans. |
| Soft delete | `deleted_at timestamptz` where deletion must be auditable. Hard delete is never used on a table with financial or legal history. |
| Enums | Native Postgres enums, snake_case values. Adding a value is a migration. Renaming or removing one is a breaking migration with a data backfill. |
| JSONB | Only for genuinely open-ended data: filter payloads, webhook bodies, template variables, audit snapshots. Never for anything that is queried, filtered on or aggregated. |
| Enumerated text | Where the value list is open-ended and validated only in application code (ticket `category`, dispute `category`), use `text` with a Zod enum on the API side. Where it is closed and drives branching, use a native enum. |
| Arrays | `text[]` only for tags and amenities. Anything relational is a join table. |
| Triggers | For invariants that span rows or reference other tables. A `CHECK` constraint is always preferred when it can express the rule. |
| Comments | `comment on table` / `comment on column` for anything non-obvious. Required for enum columns. |

## 2. Schemas

| Schema | Purpose | Exposed to Supabase clients |
|---|---|---|
| `public` | All application tables and views | Yes, but RLS governs everything |
| `private` | Helper functions that must not be callable over RPC | **No.** Excluded from exposed schemas |
| `auth` | Supabase-managed identities | No, Supabase's business |
| `storage` | Unused â€” Cloudinary holds files, not Supabase Storage | No |
| `extensions` | `pgcrypto`, `pg_trgm`, `unaccent`, `citext` | No |

Helper functions that read across tables during policy evaluation live in `private` and are
`security definer` with `set search_path = ''`. A user cannot call them; a policy can.

## 3. Extensions and generated columns

```sql
create extension if not exists pgcrypto with schema extensions;   -- gen_random_uuid, crypt
create extension if not exists pg_trgm with schema extensions;    -- fuzzy title search
create extension if not exists unaccent with schema extensions;   -- diacritic-insensitive search
create extension if not exists citext with schema extensions;     -- case-insensitive email
```

## 4. Enums

```sql
create type app_role          as enum ('admin', 'landlord', 'tenant', 'buyer');

create type onboarding_state  as enum ('phone_only', 'verified', 'profile_complete',
                                      'role_selected', 'complete');

create type owner_type        as enum ('individual', 'company', 'agent', 'joint_venture');
create type kyc_status        as enum ('not_started', 'pending', 'verified', 'rejected');

create type listing_type      as enum ('rent', 'sale');

create type property_type     as enum (
  'face_me_i_face_you', 'self_contained', 'flat', 'apartment', 'bungalow',
  'duplex', 'mansion', 'terrace', 'land', 'commercial', 'office', 'shop');

create type property_status   as enum ('draft', 'in_review', 'published', 'let_agreed',
                                      'under_offer', 'sold', 'withdrawn', 'archived');

create type unit_status       as enum ('vacant', 'occupied', 'notice_served',
                                      'evicted', 'under_maintenance');

create type title_type        as enum ('c_of_o', 'right_of_occupancy', 'excision_in_progress',
                                      'gazette_notice', 'deed_of_assignment', 'registered_certificate',
                                      'unregistered');

create type topography        as enum ('flat', 'gentle_slope', 'steep_slope', 'swampy', 'rocky');

create type media_kind        as enum ('image', 'video', 'floorplan', 'brochure');

create type contract_kind     as enum ('lease', 'sale');

create type contract_status   as enum ('draft', 'in_review', 'approved', 'active', 'suspended',
                                      'terminated', 'rejected', 'expired', 'renewed');

create type payment_plan      as enum ('outright', 'installment');

create type late_fee_policy   as enum ('none', 'flat', 'percent');

create type title_release_status as enum ('not_eligible', 'eligible', 'approved', 'released');

-- Both sides of every agreement. A vendor who has no Courtland account still needs a row, because the
-- agreement names a person and the row is what a document renders and what a signature attaches to.
create type party_role        as enum ('landlord', 'co_landlord', 'owner_representative',
                                      'tenant', 'co_tenant', 'subtenant',
                                      'seller', 'buyer', 'co_buyer',
                                      'guarantor', 'witness', 'solicitor');

create type occupancy_relationship as enum ('primary', 'spouse', 'child', 'dependent',
                                           'guest', 'subtenant', 'unrelated');

create type schedule_kind     as enum ('rent', 'service_charge', 'installment', 'deposit',
                                      'agreement_fee', 'penalty', 'balance_clearance');

create type schedule_status   as enum ('pending', 'partial', 'paid', 'waived', 'overdue');

create type payment_kind      as enum ('rent', 'service_charge', 'installment', 'outright_purchase',
                                      'deposit', 'agreement_fee', 'penalty', 'refund');

create type payment_intent_status as enum ('created', 'pending', 'processing', 'succeeded',
                                           'failed', 'cancelled', 'expired',
                                           'refunded', 'partially_refunded');

create type ledger_status     as enum ('pending', 'succeeded', 'failed', 'reversed', 'refunded');

create type payment_channel   as enum ('card', 'bank', 'bank_transfer', 'ussd', 'mobile_money',
                                      'split', 'other');

create type beneficiary_type  as enum ('owner', 'platform', 'contractor', 'reserve');

create type allocation_basis  as enum ('rent_principal', 'service_charge_principal',
                                      'management_fee', 'maintenance_deduction',
                                      'sale_principal', 'sale_commission',
                                      'deposit_holding', 'agreement_fee_holding');

create type allocation_status as enum ('pending', 'settled', 'reversed');

create type payout_status     as enum ('draft', 'approved', 'initiating', 'paid', 'failed', 'cancelled');
create type payout_method     as enum ('paystack_transfer', 'manual');

create type ticket_status     as enum ('open', 'acknowledged', 'in_progress', 'awaiting_parts',
                                      'awaiting_tenant', 'resolved', 'closed', 'cancelled');
create type ticket_priority   as enum ('low', 'medium', 'high', 'urgent');
create type ticket_visibility as enum ('internal', 'shared');

create type dispute_status    as enum ('open', 'under_review', 'escalated', 'resolved', 'dismissed');

create type notice_kind       as enum (
  'welcome', 'otp', 'verify_email',
  'rent_reminder', 'rent_due', 'arrears_notice', 'quit_notice', 'renewal_offer',
  'installment_reminder', 'payment_receipt', 'payment_failed',
  'title_release', 'lease_agreement_ready', 'contract_of_sale_ready',
  'ticket_created', 'ticket_updated', 'owner_application_received', 'listing_submitted',
  'payout_processed', 'dispute_opened', 'dispute_resolved');

create type notice_channel    as enum ('email', 'sms', 'whatsapp', 'in_app');
create type notice_status     as enum ('queued', 'sending', 'sent', 'delivered',
                                      'bounced', 'failed', 'cancelled');

-- Two families. The first eleven are generated by Courtland from a template, and each maps to exactly one
-- template in packages/pdf/templates, so check-template-usage.mjs can assert the pairing both ways. The rest
-- are evidence a human uploaded and Courtland never renders.
create type document_kind     as enum (
  'tenancy_agreement', 'contract_of_sale', 'installment_agreement', 'receipt',
  'monthly_statement', 'payout_statement', 'payout_advice', 'arrears_notice', 'notice_to_vacate',
  'title_release', 'inspection_report', 'kyc_bundle',
  'title_deed', 'survey_plan', 'certificate_of_occupancy', 'gazette_notice',
  'id_verification', 'power_of_attorney', 'receipt_evidence', 'other');

create type document_visibility as enum ('private', 'counterparty', 'staff', 'public');
create type document_status   as enum ('draft', 'generated', 'signed',
                                      'released', 'superseded', 'void');

-- A generated document has a template and a version; an uploaded one has neither. CHECK in documents ties
-- these two facts together so the kind/template pairing cannot drift.
create type document_origin   as enum ('generated', 'uploaded');

create type allocation_sale_status as enum ('proposed', 'allocated', 'paid_outright',
                                            'released', 'disputed', 'cancelled');

create type webhook_provider  as enum ('paystack', 'cloudinary', 'resend');
create type webhook_status    as enum ('received', 'processing', 'processed',
                                      'failed', 'ignored', 'replayed');

create type sms_provider_kind as enum ('twilio', 'msg', 'termii', 'sendchamp', 'mock');
```

### 4.11 Reference sequences

Human-facing references are the one thing a support agent reads aloud on the phone, so they are formatted,
sequential per entity type, and never reused. They are created in the same migration that creates the table
using them, because a column default calling `nextval` on a sequence that does not exist yet fails at
`create table` rather than at the first insert â€” and that is the cheap place to find out.

```sql
create sequence public.owner_reference_seq     start 1000;
create sequence public.property_reference_seq  start 1000;
create sequence public.contract_reference_seq  start 1000;
create sequence public.allocation_reference_seq start 1000;
create sequence public.payment_reference_seq   start 1000;
create sequence public.ticket_reference_seq     start 1000;
create sequence public.dispute_reference_seq   start 1000;
create sequence public.document_reference_seq  start 1000;
```

Starting at 1000 rather than 1 keeps short references out of circulation before the sequence is configured,
and makes an obviously fake test fixture (`CLT-000001`) recognisable in a log. Each table formats its own
reference in a trigger so the prefix is defined once, next to the table, not in seven column defaults:

| Sequence | Prefix | Example |
|---|---|---|
| `owner_reference_seq` | `OWN-` | `OWN-000123` |
| `property_reference_seq` | `PRT-` | `PRT-000912` |
| `contract_reference_seq` | `CLT-` | `CLT-004310` |
| `allocation_reference_seq` | `ALC-` | `ALC-000204` |
| `payment_reference_seq` | `PAY-` | `PAY-118302` |
| `ticket_reference_seq` | `MNT-` | `MNT-002377` |
| `dispute_reference_seq` | `DSP-` | `DSP-000088` |
| `document_reference_seq` | `DOC-` | `DOC-007512` |

A trigger rather than a `default`, because a default would have to concatenate the prefix and the padded
sequence value inline for every table, and the format would then be duplicated in eight column definitions
and in the type definitions. The trigger is `private.set_reference()`, defined in
[`Â§ 12.4`](#124-reference-generation) and attached to each table in the same migration as the table, before
its first insert. That is why the columns above are plain `reference text not null unique` with no column
default: a default would set a bare integer, the trigger would see a non-null value, and the reference
would ship as `1042` instead of `OWN-001042`.

## 5. Identity tables

### 5.1 `profiles`

```sql
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
create index profiles_kyc_idx on public.profiles (created_at)
  where kyc_status in ('not_started','pending');
comment on table public.profiles is 'Application-side mirror of auth.users. Credentials live in auth.';
comment on column public.profiles.phone_e164 is 'Nigerian numbers only, E.164 format. Uniquely identifies a portal user.';
comment on column public.profiles.kyc_status is
  'Payer identity verification. Gates contract approval for a tenant or buyer; owners.kyc_status gates payouts.';
```

### 5.2 `user_roles`

A user may hold several roles simultaneously. A landlord is frequently also a tenant and a buyer.

```sql
create table public.user_roles (
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        public.app_role not null,
  granted_by  uuid references auth.users(id) on delete set null,
  granted_at  timestamptz not null default now(),
  expires_at  timestamptz,
  primary key (user_id, role)
);
create index user_roles_role_idx on public.user_roles (role);
comment on table public.user_roles is
  'Effective role grants. JWT custom_access_token_hook projects these into app_metadata.courtland_roles.';
```

The hook writes the active set to `app_metadata.courtland_roles` as an array. RLS reads roles from the
token. Because a JWT is a snapshot, a role change is not reflected until the token refreshes; the API
calls `supabase.auth.admin` token invalidation for staff actions so the change takes effect within a
session refresh cycle. See [`07-authorization-and-rls.md Â§ Staleness`](./07-authorization-and-rls.md#7-jwt-staleness-and-revocation).

### 5.3 `role_permissions`

```sql
create table public.role_permissions (
  role        public.app_role not null,
  permission  text not null check (permission ~ '^[a-z_]+$'),
  granted_at  timestamptz not null default now(),
  primary key (role, permission)
);
comment on table public.role_permissions is
  'Seeded from packages/types/src/permissions/matrix.ts. A test asserts code and database agree.';
```

### 5.4 `saved_searches`

```sql
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
```

### 5.5 `admin_filter_views`

Saved staff filters. The backing store for the "create custom filters" requirement.

```sql
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
create unique index admin_filter_views_owner_name_idx
  on public.admin_filter_views (owner_id, name) where is_shared = false;
create unique index admin_filter_views_shared_name_idx
  on public.admin_filter_views (name) where is_shared = true;
```

## 6. Asset tables

### 6.1 `owners`

The legal counterparty for an asset. One owner holds many properties. Defined before `properties`, which
references it.

```sql
create table public.owners (
  id                  uuid primary key default gen_random_uuid(),
  reference           text not null unique,
  user_id             uuid unique references auth.users(id) on delete set null,

  -- Identity
  owner_type          public.owner_type not null,
  legal_name          text not null check (char_length(legal_name) between 2 and 200),
  business_name       text,
  email               text,
  phone_e164          text check (phone_e164 is null or phone_e164 ~ '^\+234[0-9]{10}$'),
  address             text,

  -- Corporate
  rc_number           text,

  -- KYC
  kyc_status          public.kyc_status not null default 'not_started',
  kyc_notes           text,
  kyc_reviewed_by     uuid references auth.users(id) on delete set null,
  kyc_reviewed_at     timestamptz,
  pep                 boolean not null default false,

  -- Commercial terms
  management_fee_bps  integer not null default 1000 check (management_fee_bps between 0 and 5000),
  commission_bps      integer not null default 500  check (commission_bps    between 0 and 5000),

  is_active           boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  -- An agent must say whose behalf they act, and a company must be registered.
  constraint owners_agent_requires_authority
    check ( owner_type <> 'agent' or business_name is not null ),
  constraint owners_company_requires_rc
    check ( owner_type <> 'company' or rc_number is not null )
);
create index owners_user_idx     on public.owners (user_id) where user_id is not null;
create index owners_kyc_idx      on public.owners (kyc_status, created_at) where kyc_status in ('not_started','pending');
create index owners_phone_idx    on public.owners (phone_e164) where phone_e164 is not null;
create index owners_search_idx   on public.owners using gin (to_tsvector('english',
                                  coalesce(legal_name,'') || ' ' || coalesce(business_name,'')
                                  || ' ' || coalesce(rc_number,'')));
```

Two `CHECK` constraints carry real rules and are worth stating plainly, because they are the kind of thing
that looks like validation and should be:

- **`owners_agent_requires_authority`** â€” an owner registered as an `agent` must name the principal they act
  for. A sale agreement cannot otherwise say who authorised it, which
  [`25-nigeria-compliance.md Â§ Sale`](./25-nigeria-compliance.md#3-land-and-property-transactions) requires.
- **`owners_company_requires_rc`** â€” a `company` must carry a CAC registration number.

`legal_name` is the name as it appears on the title. A trigger refuses to change it once any contract on one
of the owner's properties reaches `active`, because the executed document and the database must not disagree
about who signed it.

Payout eligibility is a two-table condition, checked in `private.payout_eligible(owner_id)` rather than by a
constraint: `kyc_status = 'verified'` **and** an active `paystack_accounts` row
(see [`Â§ 8.7`](#87-paystack_accounts)). It cannot be a `CHECK` because it spans tables.

### 6.2 `properties`

```sql
create table public.properties (
  id                  uuid primary key default gen_random_uuid(),
  reference           text not null unique,
  slug                text not null unique,
  title               text not null check (char_length(title) between 5 and 160),
  description         text not null default '',
  listing_type        public.listing_type not null,
  property_type       public.property_type not null,
  status              public.property_status not null default 'draft',
  owner_id            uuid not null references public.owners(id) on delete restrict,

  -- Location
  address_line1       text not null,
  address_line2       text,
  city                text not null,
  lga                 text not null,
  state               text not null,
  country             char(2) not null default 'NG',
  latitude            numeric(9,6) check (latitude between -90 and 90),
  longitude           numeric(9,6) check (longitude between -180 and 180),

  -- Physical
  bedrooms            smallint check (bedrooms between 0 and 50),
  bathrooms           smallint check (bathrooms between 0 and 50),
  toilets             smallint check (toilets between 0 and 50),
  parking_spaces      smallint not null default 0 check (parking_spaces >= 0),
  size_sqm            numeric(10,2) check (size_sqm > 0),
  size_plot           numeric(10,2) check (size_plot > 0),
  year_built          smallint check (year_built between 1900 and 2100),
  is_furnished        boolean not null default false,
  is_shared           boolean not null default false,   -- face-me-I-face-you / compound
  is_corner           boolean not null default false,
  is_gated            boolean not null default false,
  has_24h_power       boolean not null default false,
  has_borehole        boolean not null default false,
  has_elevator        boolean not null default false,
  has_generator       boolean not null default false,
  has_swimming_pool   boolean not null default false,
  has_gas             boolean not null default false,
  amenities           text[] not null default '{}',

  -- Commercial
  max_price_kobo      bigint check (max_price_kobo > 0),  -- for a whole parcel, per plot

  -- Pricing
  price_kobo          bigint not null check (price_kobo > 0),
  price_cadence       text not null default 'outright'
                        check (price_cadence in ('month','quarter','year','outright','one_off')),
  negotiable          boolean not null default false,

  -- Media
  cover_photo_public_id text,

  -- Lifecycle
  published_at        timestamptz,
  withdrawn_at        timestamptz,
  sold_at             timestamptz,
  archived_at         timestamptz,

  created_by          uuid references auth.users(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz,

  -- I2: land needs land_details, decided at update time by trigger since land_details is a child
  constraint properties_published_has_timestamp
    check (status <> 'published' or published_at is not null),
  constraint properties_sold_has_timestamp
    check (status <> 'sold' or sold_at is not null)
);

create index properties_owner_idx        on public.properties (owner_id) where deleted_at is null;
create index properties_status_listing_idx on public.properties (status, listing_type)
  where deleted_at is null;
create index properties_type_idx          on public.properties (property_type) where deleted_at is null;
create index properties_state_idx         on public.properties (state) where deleted_at is null;
create index properties_price_idx         on public.properties (price_kobo) where deleted_at is null;
create index properties_created_idx       on public.properties (created_at desc);

-- Fuzzy title and location search
create index properties_search_trgm on public.properties
  using gin ((title || ' ' || city || ' ' || lga || ' ' || state) extensions.gin_trgm_ops);
```

### 6.3 `property_media`

```sql
create table public.property_media (
  id             uuid primary key default gen_random_uuid(),
  property_id    uuid not null references public.properties(id) on delete cascade,
  public_id      text not null unique,             -- Cloudinary public id
  kind           public.media_kind not null default 'image',
  sort_order     smallint not null default 0,
  alt_text       text not null,                    -- required: accessibility, not decoration
  width          integer,
  height         integer,
  byte_size      integer,
  format         text,
  blurhash       text,
  is_cover       boolean not null default false,
  created_at     timestamptz not null default now(),
  unique (property_id, public_id)
);
create unique index property_media_single_cover_idx
  on public.property_media (property_id) where is_cover;
create index property_media_property_order_idx
  on public.property_media (property_id, sort_order);
comment on column public.property_media.alt_text is
  'Required and non-null. Screen-reader users and image SEO both depend on it.';
```

### 6.4 `land_details`

Child of `properties`, one row only when `property_type = 'land'`.

```sql
create table public.land_details (
  property_id        uuid primary key references public.properties(id) on delete cascade,
  size_sqm           numeric(12,2) not null check (size_sqm > 0),
  size_plot          numeric(10,2),
  plot_count         smallint check (plot_count > 0),
  topography         public.topography not null default 'flat',
  title_type         public.title_type not null default 'unregistered',
  title_document_reference text,
  gazette_reference  text,
  survey_plan_public_id text,
  allocation_letter_public_id text,
  block_and_plot     text,
  latitude           numeric(9,6),
  longitude          numeric(9,6),
  boundary_geojson   jsonb,     -- GeoJSON Polygon or MultiPolygon
  site_access_note   text,
  is_allocated       boolean not null default false,
  is_corner_plot     boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint land_details_coords_pair check ((latitude is null) = (longitude is null)),
  constraint land_details_geojson_type check (
    boundary_geojson is null or boundary_geojson->>'type' in ('Polygon','MultiPolygon')
  )
);
create index land_details_title_type_idx on public.land_details (title_type);
create index land_details_topography_idx  on public.land_details (topography);
create index land_details_boundary_gix    on public.land_details using gist (boundary_geojson);
```

The GiST index makes "show me land within 2km of this location" a fast query rather than a full scan.
Enable PostGIS only if the polygon queries become load-bearing; GeoJSON plus GiST is sufficient at
Courtland's scale and avoids another managed dependency.

### 6.5 `units`

```sql
create table public.units (
  id                    uuid primary key default gen_random_uuid(),
  property_id           uuid not null references public.properties(id) on delete cascade,
  code                  text not null,
  floor                 smallint,
  bedrooms              smallint check (bedrooms between 0 and 50),
  bathrooms             smallint check (bathrooms between 0 and 50),
  toilets               smallint check (toilets between 0 and 50),
  size_sqm              numeric(10,2) check (size_sqm > 0),
  asking_rent_kobo      bigint check (asking_rent_kobo > 0),
  service_charge_kobo   bigint not null default 0 check (service_charge_kobo >= 0),
  status                public.unit_status not null default 'vacant',
  current_contract_id   uuid,       -- FK added after contracts exists
  available_from        date,
  notes                 text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (property_id, code)
);
create index units_property_idx   on public.units (property_id);
create index units_status_idx     on public.units (status);
create index units_contract_idx   on public.units (current_contract_id) where current_contract_id is not null;
comment on table public.units is
  'Every rental property has at least one unit, including single-occupancy houses. See 04-domain-model 3.4.';
```

### 6.6 `sale_allocations`

Which plot, sold to whom, at what stage.

```sql
create table public.sale_allocations (
  id                  uuid primary key default gen_random_uuid(),
  reference           text not null unique,
  property_id         uuid not null references public.properties(id) on delete restrict,
  buyer_id            uuid references auth.users(id) on delete set null,
  buyer_name          text not null,
  buyer_phone_e164    text,
  plot_label          text not null default 'Entire parcel',
  size_sqm            numeric(12,2),
  size_plot           numeric(10,2),
  price_kobo          bigint not null check (price_kobo > 0),
  deposit_paid_kobo   bigint not null default 0 check (deposit_paid_kobo >= 0),
  contract_id         uuid,
  status              public.allocation_sale_status not null default 'proposed',
  allocated_at        timestamptz,
  released_at         timestamptz,
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create unique index sale_allocations_plot_unique
  on public.sale_allocations (property_id, plot_label)
  where status not in ('cancelled');
create index sale_allocations_buyer_idx   on public.sale_allocations (buyer_id);
create index sale_allocations_property_idx on public.sale_allocations (property_id, status);
```

The partial unique index is what prevents two buyers being allocated the same plot while allowing a
cancelled allocation to be reused.

## 7. Contract tables

### 7.1 `contracts`

```sql
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

-- I5: at most one live lease per unit. 'renewed' is deliberately absent: a lease that has been renewed is
-- a predecessor, and the renewal that replaced it is the live one. Counting predecessors as live would make
-- the unit permanently unleasable, since every renewal adds another row that satisfies the index.
create unique index contracts_one_live_lease_per_unit
  on public.contracts (unit_id)
  where kind = 'lease' and status in ('approved','active','suspended');

create index contracts_property_idx  on public.contracts (property_id);
create index contracts_unit_idx      on public.contracts (unit_id) where unit_id is not null;
create index contracts_payer_idx     on public.contracts (primary_payer_id);
create index contracts_owner_idx     on public.contracts (owner_id);
create index contracts_status_idx    on public.contracts (status, kind);
create index contracts_expiry_idx    on public.contracts (end_date)
  where kind = 'lease' and status = 'active';
create index contracts_outstanding_idx on public.contracts (outstanding_kobo desc)
  where outstanding_kobo > 0;
```

`reference` is unique across the whole table, leases and sales alike, from the single
`contract_reference_seq`. Two partial unique indexes split by `kind` would only be needed if leases and sales
drew from separate sequences, and they do not: a support agent who reads `CLT-004310` should be able to look
it up without first knowing which kind of agreement it is.

`units.current_contract_id` gets its foreign key after this table is created:

```sql
alter table public.units
  add constraint units_current_contract_fk
  foreign key (current_contract_id) references public.contracts(id) on delete set null;
```

### 7.2 `contract_parties`

```sql
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
  signature_document_id uuid references public.documents(id) on delete set null,
  added_at              timestamptz not null default now(),
  unique (contract_id, party_role, party_name)
);
-- I7: at most one primary per contract
create unique index contract_parties_one_primary
  on public.contract_parties (contract_id) where is_primary;
create index contract_parties_user_idx on public.contract_parties (user_id) where user_id is not null;
create index contract_parties_contract_idx on public.contract_parties (contract_id);
```

`signature_document_id` is the one forward reference in the contract tables: `documents` is created in
[`Â§ 10.1`](#101-documents), after this table, so the constraint cannot be inline. It is added in the
migration that creates `documents`, not left to a later cleanup:

```sql
-- in the documents migration, after create table public.documents (...)
alter table public.contract_parties
  add constraint contract_parties_signature_fk
  foreign key (signature_document_id) references public.documents(id) on delete set null;
```

An inline `references public.documents(id)` here would fail the migration with
`relation "public.documents" does not exist`, which is a loud failure at the right time â€” but it stops the
whole schema build, so the ordering is stated here instead of discovered there.

### 7.3 `contract_schedule`

```sql
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
create index contract_schedule_due_idx
  on public.contract_schedule (due_date) where status in ('pending','partial');
create index contract_schedule_contract_idx on public.contract_schedule (contract_id, seq);
create index contract_schedule_intent_idx
  on public.contract_schedule (payment_intent_id) where payment_intent_id is not null;
```

### 7.4 `contract_events`

Append-only. This is the legal history of the agreement.

```sql
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
create index contract_events_contract_idx on public.contract_events (contract_id, created_at desc);
create index contract_events_type_idx     on public.contract_events (event_type, created_at desc);
comment on table public.contract_events is
  'Append-only. No update or delete policy exists. This is the evidential record of the agreement.';
```

### 7.5 `unit_occupancies`

```sql
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
-- "Current" is the absence of moved_out, not a stored boolean. A stored is_current column can disagree
-- with moved_out, and then "who is in this unit" has two answers and the tenant view picks one at random.
create unique index occupancy_one_current_per_unit
  on public.unit_occupancies (unit_id) where moved_out is null;
create index occupancy_contract_idx on public.unit_occupancies (contract_id) where contract_id is not null;
create index occupancy_person_idx  on public.unit_occupancies (user_id) where user_id is not null;
comment on table public.unit_occupancies is
  'Who physically occupies a unit, which may not be who holds the lease. 04-domain-model 3.7.';
```

Closing an occupancy is `update unit_occupancies set moved_out = $today where id = $id`, and the partial unique
index then automatically lets the next person be recorded as current. Nothing has to remember to flip a
flag, so there is no state in which a unit has two current occupants or none.

`contract_id` is nullable on purpose: a unit can be occupied by someone the contract does not name â€” a live-in
domestic helper, an occupant added during a dispute â€” and refusing to record that would push the truth into a
spreadsheet. The invariant that *is* enforced is `unit_occupancies` versus `contract_parties` for `primary`
relationships, in [`Â§ 13`](#13-triggers-and-invariants).

## 8. Money tables

### 8.1 `payment_intents`

```sql
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
create unique index payment_intents_reference_uk on public.payment_intents (paystack_reference)
  where paystack_reference is not null;
create index payment_intents_contract_idx on public.payment_intents (contract_id, status);
create index payment_intents_payer_idx    on public.payment_intents (payer_id, created_at desc);
create index payment_intents_due_idx      on public.payment_intents (due_date)
  where status in ('created','pending','processing');
create index payment_intents_open_idx     on public.payment_intents (expires_at)
  where status in ('created','pending');
comment on column public.payment_intents.split_snapshot is
  'The split configuration sent to Paystack at initialisation. Makes any payout dispute reconstructable from the ledger.';
```

### 8.2 `payments_ledger`

```sql
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
create index payments_ledger_contract_idx on public.payments_ledger (contract_id, paid_at desc);
create index payments_ledger_payer_idx    on public.payments_ledger (payer_id, paid_at desc);
create index payments_ledger_owner_idx    on public.payments_ledger (owner_id, paid_at desc);
create index payments_ledger_succeeded_idx on public.payments_ledger (paid_at desc) where status = 'succeeded';
create index payments_ledger_reconcile_idx on public.payments_ledger (paystack_reference)
  where status in ('pending','succeeded');
comment on table public.payments_ledger is
  'Immutable evidence that money moved. I11: no delete policy exists.';
```

`net_kobo` is a stored generated column so reporting never has to remember to subtract the fee.

### 8.3 `ledger_allocations`

```sql
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
  payout_id             uuid references public.payouts(id) on delete restrict,
  settlement_batch      text,
  settled_at            timestamptz,
  note                  text,
  created_at            timestamptz not null default now(),
  -- I12: a ticket is deducted at most once
  deduction_source_ticket_id uuid references public.maintenance_tickets(id) on delete restrict,
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
create unique index allocation_deduction_ticket_unique
  on public.ledger_allocations (deduction_source_ticket_id)
  where deduction_source_ticket_id is not null;
create index allocations_payment_idx     on public.ledger_allocations (payment_id);
create index allocations_owner_payable_idx on public.ledger_allocations (owner_id, settled_at)
  where is_payable and status = 'settled';
create index allocations_payout_idx      on public.ledger_allocations (payout_id) where payout_id is not null;
create index allocations_batch_idx       on public.ledger_allocations (settlement_batch);
```

`payouts` is created after this table in the document order, so its migration adds the column:

```sql
-- in the payouts migration, after create table public.payouts (...)
alter table public.ledger_allocations
  add constraint allocations_payout_fk
  foreign key (payout_id) references public.payouts(id) on delete restrict;
```

`settlement_batch` then holds `payouts.reference`, copied by the payout run so a settlement statement can be
reconciled against the provider using the batch label a human reads, while `payout_id` is what the database
actually joins on. Two representations is only a problem when one is authoritative and the other is not; here
`payout_id` is authoritative and the batch label is a convenience copy with a test asserting they agree.

### 8.4 `payouts`

```sql
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
create index payouts_owner_period_idx on public.payouts (owner_id, period_start desc);
create index payouts_status_idx      on public.payouts (status, period_start desc);
create unique index payouts_owner_period_unique
  on public.payouts (owner_id, period_start, period_end)
  where status <> 'cancelled';
```

### 8.5 `refunds`

```sql
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
create index refunds_payment_idx on public.refunds (payment_id);
create index refunds_status_idx  on public.refunds (status) where status <> 'processed';
```

### 8.6 `refund_allocations`

A refund reverses part of a payment, and "which part" is a real question when the payment was split across
an owner, a management fee, a maintenance deduction and a held deposit. Splitting the reversal pro rata is
the only defensible default, so it is recorded rather than computed at read time.

```sql
create table public.refund_allocations (
  id                uuid primary key default gen_random_uuid(),
  refund_id         uuid not null references public.refunds(id) on delete cascade,
  allocation_id     uuid not null references public.ledger_allocations(id) on delete restrict,
  amount_kobo       bigint not null check (amount_kobo > 0),   -- always positive; the refund_id carries the sign
  created_at        timestamptz not null default now(),
  unique (refund_id, allocation_id)
);
create index refund_allocations_allocation_idx on public.refund_allocations (allocation_id);
```

Amounts are positive and the reversal lives in this table rather than in `ledger_allocations.amount_kobo`.
Three reasons, all of them the ledger invariant:

- `ledger_allocations.amount_kobo` has `check (amount_kobo >= 0)`, so a negative row needs either that check
  loosened or an `effective_amount` column alongside a stored positive one. Either way the column stops
  meaning "money received" and starts meaning "money received minus money sent back", which is the wrong
  meaning for a column a payout query sums.
- `private.assert_ledger_balanced` requires `sum(allocations) = net_kobo` for a succeeded payment. Writing
  reversals into `ledger_allocations` would break that invariant the first time anybody refunded anything,
  and the trigger would fire on the refund. The invariant is about what was *received*; a refund does not
  change what was received.
- "How much of this payment is still ours?" is then one query instead of a sign convention:
  `net_kobo - coalesce(sum(refund_allocations.amount_kobo), 0)` grouped by `allocation_id`.

An allocation cannot be refunded beyond its own amount: the API checks
`sum(refund_allocations) for this allocation + requested <= ledger_allocations.amount_kobo`, and a pgTAP test
covers the boundary.

### 8.7 `paystack_accounts`

```sql
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
create unique index paystack_accounts_active_uk on public.paystack_accounts (owner_id) where is_active;
```

## 9. Operations tables

### 9.1 `maintenance_tickets`

```sql
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
create index tickets_unit_idx     on public.maintenance_tickets (unit_id) where unit_id is not null;
create index tickets_property_idx on public.maintenance_tickets (property_id);
create index tickets_status_idx   on public.maintenance_tickets (status, priority);
create index tickets_raiser_idx   on public.maintenance_tickets (raised_by, created_at desc);
create index tickets_open_idx     on public.maintenance_tickets (created_at)
  where status not in ('resolved','closed','cancelled');
```

### 9.2 `ticket_updates`

```sql
create table public.ticket_updates (
  id              uuid primary key default gen_random_uuid(),
  ticket_id       uuid not null references public.maintenance_tickets(id) on delete cascade,
  author_id       uuid not null references auth.users(id) on delete restrict,
  body            text not null check (char_length(body) between 1 and 4000),
  visibility      public.ticket_visibility not null default 'shared',
  attachment_public_id text,
  created_at      timestamptz not null default now()
);
create index ticket_updates_ticket_idx on public.ticket_updates (ticket_id, created_at);
```

### 9.3 `notices`

```sql
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
create index notices_dispatch_idx on public.notices (scheduled_for)
  where status = 'queued';
create index notices_recipient_idx on public.notices (recipient_user_id, created_at desc);
create index notices_contract_idx  on public.notices (contract_id) where contract_id is not null;
create index notices_provider_id_idx on public.notices (provider, provider_message_id)
  where provider_message_id is not null;
```

`dedupe_key` is the mechanism preventing a tenant receiving three arrears emails from three overlapping
schedules. Format: `{kind}:{entity}:{id}:{period}` â€” for example
`rent_reminder:LSE-000123:2026-11-01`. See [`13-notifications.md Â§ Deduplication`](./13-notifications.md#31-deduplication).

### 9.4 `disputes`

```sql
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
create index disputes_status_idx   on public.disputes (status, created_at desc);
create index disputes_contract_idx on public.disputes (contract_id) where contract_id is not null;
```

## 10. Document tables

### 10.1 `documents`

```sql
create table public.documents (
  id                      uuid primary key default gen_random_uuid(),
  reference               text not null unique,
  origin                  public.document_origin not null default 'generated',
  kind                    public.document_kind not null,
  visibility              public.document_visibility not null default 'private',
  status                  public.document_status not null default 'draft',

  contract_id             uuid references public.contracts(id) on delete cascade,
  property_id             uuid references public.properties(id) on delete cascade,
  owner_id                uuid references public.owners(id) on delete cascade,
  owner_user_id           uuid references auth.users(id) on delete cascade,

  title                   text not null,
  storage_public_id       text unique,
  filename                text not null,
  mime_type               text not null default 'application/pdf',
  byte_size               bigint check (byte_size is null or byte_size > 0),
  page_count              smallint check (page_count is null or page_count > 0),
  checksum_sha256         text check (checksum_sha256 is null or checksum_sha256 ~ '^[a-f0-9]{64}$'),

  template_key            text,
  template_version        smallint check (template_version is null or template_version > 0),
  rendered_data           jsonb not null default '{}'::jsonb,

  version                 smallint not null default 1 check (version > 0),
  supersedes_document_id  uuid references public.documents(id) on delete set null,

  issued_at               timestamptz,
  expires_at              timestamptz,
  released_at             timestamptz,
  release_approved_by     uuid references auth.users(id) on delete set null,

  metadata                jsonb not null default '{}'::jsonb,
  created_by              uuid references auth.users(id) on delete set null,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),

  -- A draft exists before the bytes do, because generate-document is asynchronous and can fail. The moment
  -- the status leaves 'draft' the file facts must all be present, so nothing can be released without them.
  constraint document_draft_may_be_empty check (
    status <> 'draft'
    or (storage_public_id is null and byte_size is null and checksum_sha256 is null)
  ),
  constraint document_generated_has_bytes check (
    status = 'draft'
    or (storage_public_id is not null and byte_size is not null and checksum_sha256 is not null)
  ),
  -- The kind/template pairing lives here rather than in code, so an uploaded evidence row cannot claim a
  -- template and a generated row cannot claim an upload-only kind.
  constraint document_template_matches_origin check (
    (origin = 'generated' and template_key is not null and template_version is not null
       and kind in ('tenancy_agreement','contract_of_sale','installment_agreement','receipt',
'monthly_statement','payout_statement','payout_advice','arrears_notice','notice_to_vacate',
                     'title_release','inspection_report','kyc_bundle'))
    or
    (origin = 'uploaded' and template_key is null and template_version is null
       and kind in ('title_deed','survey_plan','certificate_of_occupancy','gazette_notice',
                    'id_verification','power_of_attorney','receipt_evidence','other'))
  ),
  constraint document_supersedes_not_self check (supersedes_document_id is null or supersedes_document_id <> id),
  constraint document_issued_requires_time check (status not in ('signed','released') or issued_at is not null),
  constraint document_released_requires_time check (status <> 'released' or released_at is not null)
);
create index documents_contract_idx on public.documents (contract_id) where contract_id is not null;
create index documents_property_idx on public.documents (property_id) where property_id is not null;
create index documents_owner_idx    on public.documents (owner_id) where owner_id is not null;
create index documents_kind_status_idx on public.documents (kind, status);
create index documents_latest_idx   on public.documents (contract_id, kind, version desc);
```

One `kind` cannot be both families, so `check-template-usage.mjs` reads this constraint to learn which kinds
must have a template, rather than hard-coding a second list that can drift from this one.

### 10.2 `document_access_log`

```sql
create table public.document_access_log (
  id           uuid primary key default gen_random_uuid(),
  document_id  uuid not null references public.documents(id) on delete cascade,
  user_id      uuid references auth.users(id) on delete set null,
  action       text not null check (action in ('view','download','sign','release','revoke')),
  ip           inet,
  user_agent   text,
  created_at   timestamptz not null default now()
);
create index document_access_document_idx on public.document_access_log (document_id, created_at desc);
create index document_access_user_idx    on public.document_access_log (user_id, created_at desc);
comment on table public.document_access_log is
  'Append-only audit of every access to a legal document. Retained for the life of the contract.';
```

## 11. Platform tables

### 11.1 `webhook_events`

```sql
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
create index webhook_events_pending_idx on public.webhook_events (received_at)
  where status in ('received','failed');
create index webhook_events_provider_idx on public.webhook_events (provider, event_type, received_at desc);
comment on column public.webhook_events.payload is
  'Raw provider payload. Retained for dispute resolution. Access is staff-only.';
```

### 11.2 `idempotency_keys`

```sql
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
create index idempotency_expiry_idx on public.idempotency_keys (expires_at);
```

### 11.3 `outbox_events`

```sql
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
create index outbox_unpublished_idx on public.outbox_events (occurred_at)
  where published_at is null;
comment on table public.outbox_events is
  'Transactional outbox. Written in the same transaction as the state change, published by a separate job. I22: no delete policy.';
```

The three-column unique constraint is a coarse deduplication key. It is deliberately not
`(event_type, aggregate_id)` alone, because the same aggregate can legitimately emit the same event type
more than once, for example two `payment.succeeded` events on one contract.

### 11.4 `audit_log`

```sql
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
create index audit_log_entity_idx  on public.audit_log (entity_type, entity_id, created_at desc);
create index audit_log_actor_idx   on public.audit_log (actor_id, created_at desc) where actor_id is not null;
create index audit_log_action_idx  on public.audit_log (action, created_at desc);
create index audit_log_created_idx on public.audit_log (created_at desc);
comment on table public.audit_log is
  'Append-only. I23: update and delete are blocked by trigger and no policies exist. Partition by month past 12 months.';
```

### 11.5 `job_runs`

Job execution history. Sourced by the observability dashboards and by reconciliation.

```sql
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
create index job_runs_name_idx  on public.job_runs (job_name, started_at desc);
create index job_runs_failed_idx on public.job_runs (started_at desc) where status = 'failed';
```

### 11.6 `feature_flags`

Database-backed flags, so a decision can be made without a deploy. Keys are declared in
`packages/config/flags.ts` beside `env-names.ts`, and `tooling/scripts/check-flag-usage.mjs` asserts in CI that
the table, the TypeScript keys and the call sites agree, and that every key is read in at least two source
files. A flag with one reader is a constant that should have been a constant. See
[`23-ci-cd-and-deployment.md Â§ 7`](./23-ci-cd-and-deployment.md#7-feature-flags).

```sql
create table public.feature_flags (
  key        text primary key,
  enabled    boolean not null default false,
  reason     text,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

Read through `private.flag_enabled(key)`. `security definer` so that a client holding only `authenticated`
can call it without a table grant; the function exposes booleans, never the reason. Payment paths are never
behind a flag, so no key in this table may be consulted from `services/payments/`.

## 12. Helper functions (schema `private`)

Every one is `security definer` with `set search_path = ''` and full schema qualification. Both are
mandatory: `security definer` without a pinned `search_path` is exploitable through schema shadowing.

### 12.1 Role and permission helpers

```sql
create schema if not exists private;

create or replace function private.current_user_roles()
returns public.app_role[]
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select array_agg((auth.jwt() -> 'app_metadata' -> 'courtland_roles')::text::public.app_role)
     where auth.jwt() -> 'app_metadata' -> 'courtland_roles' is not null),
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
```

`has_permission` reads the role from the JWT but the permission map from the database. That split is
deliberate: roles change rarely and belong in the token for speed, while the permission map changes
frequently and belongs in a table for flexibility. Adding a permission to `moderator` is one `INSERT`, with
no policy changes.

The API additionally accepts a roles parameter so that jobs and staff impersonation can evaluate policies
against an explicit identity. This is the `set_config` path described in
[`07-authorization-and-rls.md Â§ Testing as a role`](./07-authorization-and-rls.md#6-testing-as-a-role).

### 12.2 Ownership helpers

```sql
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
```

### 12.3 Money functions

```sql
-- Largest-remainder pro-rata split. Never loses or invents kobo.
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
```

The pgTAP suite in `supabase/tests/functions.test.sql` asserts the exact split for a range of inputs,
including awkward ones like `(1000, [1,1,1])`, `(5, [1,2])` and a mixed-sign `(100, [-1,2])`, plus the
rejections (negative total, zero-sum weights).

```sql
-- Compute a payment's allocations. Pure function of its inputs.
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
```

### 12.4 Reference generation

One function, not eight. The prefix and the sequence are the only things that differ per table, so they
arrive as trigger arguments; `tg_argv` is the standard way to make a trigger function parameterised without
inventing a second function.

```sql
create or replace function private.set_reference()
returns trigger language plpgsql as $$
declare
  seq    text := tg_argv[0];
  prefix text := tg_argv[1];
begin
  if new.reference is null then
    new.reference := prefix || lpad(nextval(seq)::text, 6, '0');
  end if;
  return new;
end $$;

-- Attached in the same migration as each table:
--   create trigger properties_set_reference before insert or update of reference on public.properties
--     for each row execute function private.set_reference('public.property_reference_seq', 'PRT-');
```

`if new.reference is null` rather than `not exists`, so an explicitly imported or migrated reference is
preserved. `before insert or update of reference` rather than `before insert`, because a later migration
that backfills references must not be silently overwritten by the trigger.

The prefixes and sequences are the table in [`Â§ 4.11`](#411-reference-sequences). `private.set_reference()`
is the only place a prefix appears in SQL, so `tooling/scripts/check-doc-freshness.mjs` can compare that one
list against the eight `execute function` calls and catch a prefix that drifted.

### 12.5 `updated_at` maintenance

```sql
create or replace function private.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
```

Applied to every table with an `updated_at` column.

### 12.6 `flag_enabled`

```sql
create or replace function private.flag_enabled(p_key text)
returns boolean
language sql stable security definer set search_path = ''
as $$ select coalesce((select enabled from public.feature_flags where key = p_key), false) $$;
```

`security definer` with an empty `search_path` so it reads `public.feature_flags` without granting the table.
A `stable` SQL function, so the planner evaluates it once per statement rather than per row, and the whole
predicate can be cached for the statement.

Returns `false` for an unknown key rather than raising. A missing flag must fail closed; a typo in a flag
name that throws at runtime would take a payout batch down.

## 13. Triggers and invariants

Two ordering rules decide everything in this section, and getting either wrong produces a trigger that
silently does nothing:

1. **A BEFORE trigger sees the row the statement is about to write; an AFTER trigger sees the database
   after it.** Anything that validates against another table must be AFTER, because in a BEFORE trigger the
   other table has not moved yet. Anything that must be able to reject the row itself must be BEFORE.
2. **Postgres fires same-timing triggers in alphabetical order of trigger name.** Names here are
   `<table>_<what it does>`, so on a table with both a guard and a sync, the guard sorts first and the sync
   runs against state the guard has already accepted. Renaming a trigger can change behaviour; renaming
   these is not a cosmetic change.

Every trigger in this section is in the same migration as the table it fires on, so no migration can
install a trigger against a function that does not exist yet.

```sql
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

  select coalesce(sum(amount_kobo), 0) into allocated,
         coalesce(sum(amount_kobo) filter (where is_payable), 0),
         coalesce(sum(amount_kobo) filter (where not is_payable), 0)
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
returns trigger language plpgsql as $$
declare
  v_actor uuid := auth.uid();
  v_role  text := coalesce(private.current_user_roles()[1]::text, 'anon');
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
```

`audit_log` is populated only for these seven tables. Auditing every table would add write amplification
to hot paths like `contract_schedule` and produce noise that buries the meaningful entries.

## 14. Views

All views use `security_invoker = true` so they obey the calling role's RLS. A view without this setting
is `security definer` by default and silently bypasses every policy on its underlying tables â€” a
well-known Supabase data-exfiltration shape. There is a CI check for `security_invoker`.

### 14.1 `property_search`

The public listing read model. Includes computed fields the UI needs so it does not do client arithmetic.

```sql
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
```

### 14.2 `contract_balances`

```sql
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
```

### 14.3 `owner_payout_summary`

```sql
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
```

### 14.4 `owner_balances`

ADR 0008's derived balance, written out for real. A refund is recorded in `refund_allocations` and
**subtracted here** rather than by mutating the allocation rows, which is what keeps the allocation-sum
trigger (I10) holding: `allocation_status` deliberately has no `refunded` value.

```sql
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
```

The join on `payments_ledger` with `p.status = 'succeeded'` means a failed-then-reversed payment contributes
nothing, and a refunded allocation net is the allocation minus what `refund_allocations` charged against it.

## 15. Grants

Default privileges on a Supabase project grant `select, insert, update, delete` on new `public` tables
to both `anon` and `authenticated`. **Adding policies does not remove those grants.** A table protected
only by policies still hands `anon` an insert path.

```sql
-- Revoke the defaults for everything in public, now and for the future
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema private from anon, authenticated, public;
alter default privileges in schema public
  revoke all on tables from anon, authenticated;
alter default privileges in schema public
  revoke all on sequences from anon, authenticated;

-- Grant back only what is needed. These are the ONLY client-facing grants.
grant select on public.property_search to anon, authenticated;
grant select on public.properties to anon;   -- RLS restricts to published
grant select on public.property_media to anon;
grant select on public.land_details to anon;
grant select on public.owners to authenticated;  -- RLS restricts to self; only legal_name is projected
grant select on public.profiles to authenticated;
grant update (full_name, avatar_public_id) on public.profiles to authenticated;

grant usage on schema public to anon, authenticated;
revoke all on schema private from anon, authenticated;
```

`service_role` keeps full access and bypasses RLS. It is only used server-side, and a CI grep enforces
that the string `SERVICE_ROLE` never appears in `apps/web` or `apps/admin`.

There is a CI check that fails if any table in `public` has RLS disabled:

```sql
select c.relname
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
  and not c.relrowsecurity
order by 1;
```

## 16. Migration rules

1. Filenames are `YYYYMMDDHHMMSS_snake_case_name.sql`. Applied in lexicographic order.
2. **Never edit an applied migration.** Add a new one. The Supabase CLI's `db push` and `db reset` both
   rely on the ordered history and on the checksums Supabase records.
3. Schema changes are authored as Drizzle schema changes, then generated:
   ```bash
   pnpm db:generate          # drizzle-kit generate -> supabase/migrations/<ts>_<name>.sql
   pnpm db:diff              # drizzle-kit diff against the shadow database
   ```
4. Apply locally, then remotely:
   ```bash
   supabase db reset          # local: drop, apply all migrations in order, run seed
   supabase db push           # linked project: apply pending migrations
   ```
5. `drizzle-kit push` is **banned**. It skips migration history, which pgTAP and the audit trail both
   depend on.
6. Every migration that adds a table must, in the same file: enable RLS, add the policies, add the
   grants, and add a pgTAP test file. A migration that adds a table without RLS fails the CI check in
   Â§15 even if it passes locally.
7. Every migration that adds an enum value must also update `packages/types/src/common/enums.ts` in the
   same pull request. A test asserts the TypeScript union and the Postgres enum have identical members.
8. Adding a permission requires updating `packages/types/src/permissions/matrix.ts` and inserting into
   `role_permissions` in the same migration. A test asserts agreement in both directions.

## 17. pgTAP tests

Run with `supabase test db`. Each file runs inside its own transaction and is rolled back regardless of
outcome, so tests are isolated by construction.

```bash
supabase test new money_rls.test        # scaffold from the pgtap template
supabase test db                        # requires the local stack
supabase test db --db-url "postgresql://..."   # percent-encode
```

| File | Asserts |
|---|---|
| `identity_rls.test.sql` | A tenant cannot read another tenant's profile. A user cannot grant themselves `admin`. Staff can read all profiles. Expired role grants are ignored. |
| `asset_rls.test.sql` | Anonymous can read published properties and nothing else. An owner can read their own draft but not another owner's draft. `land_details` is hidden from anon when its property is not published. |
| `contract_rls.test.sql` | A tenant reads only their own contracts. A party who is not the primary payer reads their own contract. A landlord reads contracts on their properties only. Staff read all. Nobody but staff can mutate. |
| `money_rls.test.sql` | A payer reads their own intents and ledger rows. Nobody reads `ledger_allocations` except staff and the beneficiary owner. Landlord financials expose only their own owner's rows. |
| `ops_rls.test.sql` | A tenant reads tickets they raised; `internal` visibility updates are hidden from them. Staff read all. Notices are readable only by their recipient and staff. |
| `documents_rls.test.sql` | A buyer reads released documents on their contract. A landlord reads documents on their properties. Nobody reads `private` documents. `document_access_log` is staff-only. |
| `platform_rls.test.sql` | `audit_log` is staff-only and has no insert policy for anyone. `outbox_events` and `webhook_events` are service-role only. `idempotency_keys` readable only by their owner. |
| `invariants.test.sql` | Every one of I1â€“I26 in [`04-domain-model.md Â§ 5`](./04-domain-model.md#5-cross-cutting-invariants). Each is a `throws_ok` on a violating write plus a `lives_ok` on a valid one. |
| `functions.test.sql` | `allocate_pro_rata` sums to the total for a range of awkward inputs. `compute_allocations` respects the fee basis points. Reference generation produces the expected format and is unique. |
| `money_types.test.sql` | No monetary column in any table has type `numeric`, `real` or `double precision`. A schema-level guard for the kobo rule. |

The RLS shape that most of these follow:

```sql
begin;
select plan(6);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'tenant-a@test.local'),
  ('22222222-2222-2222-2222-222222222222', 'tenant-b@test.local'),
  ('33333333-3333-3333-3333-333333333333', 'staff@test.local');

-- fixtures: properties, units, contracts

set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select set_config('request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated",
    "app_metadata":{"courtland_roles":["tenant"]}}', true);

select results_eq(
  $$ select count(*)::text from public.contracts $$,
  ARRAY['1'],
  'tenant A sees only their own contract'
);

select results_eq(
  $$ select count(*)::text from public.contracts where primary_payer_id <>
        '22222222-2222-2222-2222-222222222222' $$,
  ARRAY['0'],
  'tenant A cannot see tenant B contracts even by crafting a where clause'
);

select throws_ok(
  $$ update public.contracts set status = 'terminated' where id = '...' $$,
  '42501', null,
  'tenant cannot mutate a contract'
);

select results_eq(
  $$ select count(*)::text from public.audit_log $$,
  ARRAY['0'],
  'no audit row was written by the denied update'
);

select * from finish();
rollback;
```

The last assertion matters. A denied write must leave no trace. If a policy denied the write but a trigger
had already inserted an audit row, the request would not be atomic.

## 18. Retention and maintenance

| Data | Retention | Mechanism |
|---|---|---|
| `audit_log` | 7 years | Monthly partitions. Archive older partitions to cold storage. |
| `payments_ledger` | Indefinite | Never deleted. |
| `document_access_log` | Life of contract + 7 years | |
| `webhook_events` | 2 years | Partition by month. Drop after 24. Paystack can re-deliver. |
| `idempotency_keys` | 24 hours | Nightly `delete where expires_at < now()`. The only deliberate bulk delete in the system. |
| `job_runs` | 90 days | Nightly prune. |
| `contract_events` | Indefinite | Legal record. |
| `outbox_events` | 30 days after publication | Nightly prune of published rows. |

All pruning runs inside `private.prune_*()` functions called by the nightly job. Each is idempotent.

## 19. Related documents

- Entity semantics and state machines: [`04-domain-model.md`](./04-domain-model.md)
- RLS policy strategy in full: [`07-authorization-and-rls.md`](./07-authorization-and-rls.md)
- Local setup and Supabase CLI workflow: [`22-configuration-and-environments.md Â§ Database](./22-configuration-and-environments.md#42-supabase)
- Migration order and the pgTAP gate: [`roadmap.md Â§ Phase 1â€“2](./roadmap.md#phase-1--data-foundation)
