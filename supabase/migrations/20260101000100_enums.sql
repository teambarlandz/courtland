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
