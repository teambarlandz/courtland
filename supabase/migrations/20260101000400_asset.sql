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
comment on column public.property_media.alt_text is
  'Required and non-null. Screen-reader users and image SEO both depend on it.';

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
comment on table public.units is
  'Every rental property has at least one unit, including single-occupancy houses. See 04-domain-model 3.4.';

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
