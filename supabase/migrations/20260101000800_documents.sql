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

alter table public.contract_parties
  add constraint contract_parties_signature_fk
  foreign key (signature_document_id) references public.documents(id) on delete set null;

create table public.document_access_log (
  id           uuid primary key default gen_random_uuid(),
  document_id  uuid not null references public.documents(id) on delete cascade,
  user_id      uuid references auth.users(id) on delete set null,
  action       text not null check (action in ('view','download','sign','release','revoke')),
  ip           inet,
  user_agent   text,
  created_at   timestamptz not null default now()
);
comment on table public.document_access_log is
  'Append-only audit of every access to a legal document. Retained for the life of the contract.';
