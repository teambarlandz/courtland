alter table public.documents enable row level security;
alter table public.document_access_log enable row level security;

create policy documents_select_party on public.documents
for select to authenticated
using (
  private.has_permission('document_read_own')
  and visibility in ('counterparty','staff','public')
  and (
      private.is_contract_party(contract_id)
      or private.owns_property(property_id)
      or private.owns_owner(owner_id)
      or (owner_user_id = auth.uid())
  )
);

create policy documents_select_staff on public.documents
for select to authenticated
using ( private.has_permission('document_read_any') );

-- Upload: owners may attach KYC to their own owner record. Nothing else is uploadable by a portal user.
create policy documents_insert_owner on public.documents
for insert to authenticated
with check (
  private.has_permission('document_upload')
  and private.owns_owner(owner_id)
  and kind = 'id_verification'
  and status = 'draft'
);

-- No update or delete policy. Superseding is an insert of a new row plus a status change by staff.

create policy document_access_log_select_staff on public.document_access_log
for select to authenticated
using ( private.has_permission('document_read_any') );
-- No insert policy. Writes are service_role only, from the file-delivery path.
