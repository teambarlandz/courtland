-- identity
create index profiles_kyc_idx on public.profiles (created_at)
  where kyc_status in ('not_started','pending');
create index user_roles_role_idx on public.user_roles (role);
create unique index admin_filter_views_owner_name_idx
  on public.admin_filter_views (owner_id, name) where is_shared = false;
create unique index admin_filter_views_shared_name_idx
  on public.admin_filter_views (name) where is_shared = true;

-- asset
create index owners_user_idx     on public.owners (user_id) where user_id is not null;
create index owners_kyc_idx      on public.owners (kyc_status, created_at) where kyc_status in ('not_started','pending');
create index owners_phone_idx    on public.owners (phone_e164) where phone_e164 is not null;
create index owners_search_idx   on public.owners using gin (to_tsvector('english',
                                  coalesce(legal_name,'') || ' ' || coalesce(business_name,'')
                                  || ' ' || coalesce(rc_number,'')));
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
create unique index property_media_single_cover_idx
  on public.property_media (property_id) where is_cover;
create index property_media_property_order_idx
  on public.property_media (property_id, sort_order);
create index land_details_title_type_idx on public.land_details (title_type);
create index land_details_topography_idx  on public.land_details (topography);
-- doc05 asks for gist, but core Postgres ships no GiST opclass for jsonb; GIN (containment @>) is
-- the supported access method for boundary_geojson queries.
create index land_details_boundary_gix    on public.land_details using gin (boundary_geojson);
create index units_property_idx   on public.units (property_id);
create index units_status_idx     on public.units (status);
create index units_contract_idx   on public.units (current_contract_id) where current_contract_id is not null;
create unique index sale_allocations_plot_unique
  on public.sale_allocations (property_id, plot_label)
  where status not in ('cancelled');
create index sale_allocations_buyer_idx   on public.sale_allocations (buyer_id);
create index sale_allocations_property_idx on public.sale_allocations (property_id, status);

-- contract
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
-- I7: at most one primary per contract
create unique index contract_parties_one_primary
  on public.contract_parties (contract_id) where is_primary;
create index contract_parties_user_idx on public.contract_parties (user_id) where user_id is not null;
create index contract_parties_contract_idx on public.contract_parties (contract_id);
create index contract_schedule_due_idx
  on public.contract_schedule (due_date) where status in ('pending','partial');
create index contract_schedule_contract_idx on public.contract_schedule (contract_id, seq);
create index contract_schedule_intent_idx
  on public.contract_schedule (payment_intent_id) where payment_intent_id is not null;
create index contract_events_contract_idx on public.contract_events (contract_id, created_at desc);
create index contract_events_type_idx     on public.contract_events (event_type, created_at desc);
create unique index occupancy_one_current_per_unit
  on public.unit_occupancies (unit_id) where moved_out is null;
create index occupancy_contract_idx on public.unit_occupancies (contract_id) where contract_id is not null;
create index occupancy_person_idx  on public.unit_occupancies (user_id) where user_id is not null;

-- money
create unique index payment_intents_reference_uk on public.payment_intents (paystack_reference)
  where paystack_reference is not null;
create index payment_intents_contract_idx on public.payment_intents (contract_id, status);
create index payment_intents_payer_idx    on public.payment_intents (payer_id, created_at desc);
create index payment_intents_due_idx      on public.payment_intents (due_date)
  where status in ('created','pending','processing');
create index payment_intents_open_idx     on public.payment_intents (expires_at)
  where status in ('created','pending');
create index payments_ledger_contract_idx on public.payments_ledger (contract_id, paid_at desc);
create index payments_ledger_payer_idx    on public.payments_ledger (payer_id, paid_at desc);
create index payments_ledger_owner_idx    on public.payments_ledger (owner_id, paid_at desc);
create index payments_ledger_succeeded_idx on public.payments_ledger (paid_at desc) where status = 'succeeded';
create index payments_ledger_reconcile_idx on public.payments_ledger (paystack_reference)
  where status in ('pending','succeeded');
create unique index allocation_deduction_ticket_unique
  on public.ledger_allocations (deduction_source_ticket_id)
  where deduction_source_ticket_id is not null;
create index allocations_payment_idx     on public.ledger_allocations (payment_id);
create index allocations_owner_payable_idx on public.ledger_allocations (owner_id, settled_at)
  where is_payable and status = 'settled';
create index allocations_payout_idx      on public.ledger_allocations (payout_id) where payout_id is not null;
create index allocations_batch_idx       on public.ledger_allocations (settlement_batch);
create index payouts_owner_period_idx on public.payouts (owner_id, period_start desc);
create index payouts_status_idx      on public.payouts (status, period_start desc);
create unique index payouts_owner_period_unique
  on public.payouts (owner_id, period_start, period_end)
  where status <> 'cancelled';
create index refunds_payment_idx on public.refunds (payment_id);
create index refunds_status_idx  on public.refunds (status) where status <> 'processed';
create index refund_allocations_allocation_idx on public.refund_allocations (allocation_id);
create unique index paystack_accounts_active_uk on public.paystack_accounts (owner_id) where is_active;

-- ops
create index tickets_unit_idx     on public.maintenance_tickets (unit_id) where unit_id is not null;
create index tickets_property_idx on public.maintenance_tickets (property_id);
create index tickets_status_idx   on public.maintenance_tickets (status, priority);
create index tickets_raiser_idx   on public.maintenance_tickets (raised_by, created_at desc);
create index tickets_open_idx     on public.maintenance_tickets (created_at)
  where status not in ('resolved','closed','cancelled');
create index ticket_updates_ticket_idx on public.ticket_updates (ticket_id, created_at);
create index notices_dispatch_idx on public.notices (scheduled_for)
  where status = 'queued';
create index notices_recipient_idx on public.notices (recipient_user_id, created_at desc);
create index notices_contract_idx  on public.notices (contract_id) where contract_id is not null;
create index notices_provider_id_idx on public.notices (provider, provider_message_id)
  where provider_message_id is not null;
create index disputes_status_idx   on public.disputes (status, created_at desc);
create index disputes_contract_idx on public.disputes (contract_id) where contract_id is not null;

-- documents
create index documents_contract_idx on public.documents (contract_id) where contract_id is not null;
create index documents_property_idx on public.documents (property_id) where property_id is not null;
create index documents_owner_idx    on public.documents (owner_id) where owner_id is not null;
create index documents_kind_status_idx on public.documents (kind, status);
create index documents_latest_idx   on public.documents (contract_id, kind, version desc);
create index document_access_document_idx on public.document_access_log (document_id, created_at desc);
create index document_access_user_idx    on public.document_access_log (user_id, created_at desc);

-- platform
create index webhook_events_pending_idx on public.webhook_events (received_at)
  where status in ('received','failed');
create index webhook_events_provider_idx on public.webhook_events (provider, event_type, received_at desc);
create index idempotency_expiry_idx on public.idempotency_keys (expires_at);
create index outbox_unpublished_idx on public.outbox_events (occurred_at)
  where published_at is null;
create index audit_log_entity_idx  on public.audit_log (entity_type, entity_id, created_at desc);
create index audit_log_actor_idx   on public.audit_log (actor_id, created_at desc) where actor_id is not null;
create index audit_log_action_idx  on public.audit_log (action, created_at desc);
create index audit_log_created_idx on public.audit_log (created_at desc);
create index job_runs_name_idx  on public.job_runs (job_name, started_at desc);
create index job_runs_failed_idx on public.job_runs (started_at desc) where status = 'failed';
