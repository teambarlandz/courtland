alter table public.payment_intents enable row level security;
alter table public.payments_ledger enable row level security;
alter table public.ledger_allocations enable row level security;
alter table public.payouts enable row level security;
alter table public.refunds enable row level security;
alter table public.refund_allocations enable row level security;
alter table public.paystack_accounts enable row level security;

create policy ledger_select_payer on public.payments_ledger
for select to authenticated
using ( private.has_permission('payment_read_own') and payer_id = auth.uid() );

create policy ledger_select_owner on public.payments_ledger
for select to authenticated
using (
  private.has_permission('payout_read_own')
  and private.owns_owner(owner_id)
);

create policy ledger_select_staff on public.payments_ledger
for select to authenticated
using ( private.has_permission('payment_read_any') );

-- Intents: a payer may create an intent for their own contract.
create policy intents_insert_payer on public.payment_intents
for insert to authenticated
with check (
  private.has_permission('payment_create_own')
  and payer_id = auth.uid()
  and private.is_contract_party(contract_id)
  and status = 'created'
);

-- A payer may only move an intent from created to pending. Anything further is the webhook's job,
-- and the webhook runs as service_role.
create policy intents_update_payer on public.payment_intents
for update to authenticated
using ( private.has_permission('payment_create_own') and payer_id = auth.uid() and status = 'created' )
with check ( private.has_permission('payment_create_own') and payer_id = auth.uid() );

create policy intents_select_payer on public.payment_intents
for select to authenticated
using ( private.has_permission('payment_read_own') and payer_id = auth.uid() );

create policy intents_select_staff on public.payment_intents
for select to authenticated
using ( private.has_permission('payment_read_any') );

create policy allocations_select_owner on public.ledger_allocations
for select to authenticated
using (
  private.has_permission('payout_read_own')
  and beneficiary_type = 'owner'
  and private.owns_owner(owner_id)
);

create policy allocations_select_staff on public.ledger_allocations
for select to authenticated
using ( private.has_permission('payment_read_any') );

-- No insert, update or delete policy. Allocations are written only by the payment workflow
-- as service_role, or by the payout job. The API cannot be tricked into writing one.
