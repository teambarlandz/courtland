alter table public.owners enable row level security;
alter table public.properties enable row level security;
alter table public.property_media enable row level security;
alter table public.land_details enable row level security;
alter table public.units enable row level security;
alter table public.sale_allocations enable row level security;

create policy owners_select_own on public.owners
for select to authenticated
using ( private.has_permission('owner_read_own') and user_id = auth.uid() );

create policy owners_select_staff on public.owners
for select to authenticated
using ( private.has_permission('owner_read_any') );

-- Anonymous and every signed-in user: published listings only
create policy properties_select_public on public.properties
for select to anon, authenticated
using ( status in ('published','let_agreed','under_offer') and deleted_at is null );

-- Owners: their own drafts and in-review listings, via a helper that reads `owners`
create policy properties_select_own_draft on public.properties
for select to authenticated
using (
  private.has_permission('property_update_own')
  and private.owns_property(id)
  and status in ('draft','in_review','withdrawn','archived')
);

-- Staff: everything
create policy properties_select_staff on public.properties
for select to authenticated
using ( private.has_permission('property_update_any') );

-- Insert: an owner creates a draft on their own asset record
create policy properties_insert_owner on public.properties
for insert to authenticated
with check (
  private.has_permission('property_create')
  and private.owner_of(id)         -- ensures the owner row exists and is theirs
  and status = 'draft'
  and deleted_at is null
);

-- Update: owners may edit only their own drafts, and may not publish
create policy properties_update_owner on public.properties
for update to authenticated
using (
  private.has_permission('property_update_own')
  and private.owns_property(id)
  and status in ('draft','in_review')
)
with check (
  private.owns_property(id)
  and status in ('draft','in_review','withdrawn')   -- may withdraw, may not self-publish
);

-- Postgres evaluates the USING of one policy and the WITH CHECK of a DIFFERENT policy independently
-- for UPDATE, so a permissive "with check (true)" on the staff policy would let any owner who passes
-- the owner policy's USING write anything (they flipped a draft to published). The check therefore
-- repeats the staff permission, which is the only combination that is safe.
create policy properties_update_staff on public.properties
for update to authenticated
using ( private.has_permission('property_update_any') )
with check ( private.has_permission('property_update_any') );

-- Delete: staff only, and never on a property with a contract
create policy properties_delete_staff on public.properties
for delete to authenticated
using (
  private.has_permission('property_delete')
  and not exists (select 1 from public.contracts c where c.property_id = properties.id)
);

create policy property_media_select_public on public.property_media
for select to anon, authenticated
using ( private.property_is_public(property_id) );

create policy property_media_select_own on public.property_media
for select to authenticated
using ( private.has_permission('property_update_own') and private.owns_property(property_id) );

create policy property_media_select_staff on public.property_media
for select to authenticated
using ( private.has_permission('property_update_any') );

create policy land_details_select_public on public.land_details
for select to anon, authenticated
using ( private.property_is_public(property_id) );

create policy units_select_public_vacant on public.units
for select to anon, authenticated
using (
  private.has_permission('unit_read')
  and (status in ('vacant','under_maintenance')
       or exists (select 1 from public.properties p
                  where p.id = units.property_id
                    and p.status in ('published','let_agreed')))
);

create policy units_select_staff on public.units
for select to authenticated
using ( private.has_permission('unit_update_any') );

create policy units_select_owner on public.units
for select to authenticated
using ( private.has_permission('unit_read') and private.owns_property(property_id) );

create policy units_update_owner on public.units
for update to authenticated
using ( private.has_permission('unit_update_own') and private.owns_property(property_id) )
with check ( private.owns_property(property_id) );
