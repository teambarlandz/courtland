alter table public.contracts enable row level security;
alter table public.contract_parties enable row level security;
alter table public.contract_schedule enable row level security;
alter table public.contract_events enable row level security;
alter table public.unit_occupancies enable row level security;

-- The payer and any named party
create policy contracts_select_party on public.contracts
for select to authenticated
using (
  private.has_permission('contract_read_own')
  and private.is_contract_party(id)
);

-- The owner of the underlying property
create policy contracts_select_landlord on public.contracts
for select to authenticated
using (
  private.has_permission('contract_read_own')
  and private.owns_property(property_id)
);

-- Staff
create policy contracts_select_staff on public.contracts
for select to authenticated
using ( private.has_permission('contract_read_any') );

-- Nobody but staff mutates a contract. Not even the payer.
create policy contracts_update_staff on public.contracts
for update to authenticated
using ( private.has_permission('contract_update') )
with check ( private.has_permission('contract_update') );

create policy contracts_insert_staff on public.contracts
for insert to authenticated
with check ( private.has_permission('contract_create') );

-- No delete policy at all: contracts are never deleted. See I11's neighbours.
