// enums.ts — every Postgres enum as a TS const object plus its Drizzle pgEnum.
// Generated from pg_enum; values must match the migration order exactly.
import { customType, pgEnum } from "drizzle-orm/pg-core";

export const citext = customType<{ data: string; driverData: string }>({
  dataType() {
    return "citext";
  },
});

export const AllocationBasis = {
  rent_principal: "rent_principal",
  service_charge_principal: "service_charge_principal",
  management_fee: "management_fee",
  maintenance_deduction: "maintenance_deduction",
  sale_principal: "sale_principal",
  sale_commission: "sale_commission",
  deposit_holding: "deposit_holding",
  agreement_fee_holding: "agreement_fee_holding",
} as const;
export type AllocationBasis = (typeof AllocationBasis)[keyof typeof AllocationBasis];
export const allocationBasisEnum = pgEnum("allocation_basis", [
  AllocationBasis.rent_principal,
  AllocationBasis.service_charge_principal,
  AllocationBasis.management_fee,
  AllocationBasis.maintenance_deduction,
  AllocationBasis.sale_principal,
  AllocationBasis.sale_commission,
  AllocationBasis.deposit_holding,
  AllocationBasis.agreement_fee_holding,
]);

export const AllocationSaleStatus = {
  proposed: "proposed",
  allocated: "allocated",
  paid_outright: "paid_outright",
  released: "released",
  disputed: "disputed",
  cancelled: "cancelled",
} as const;
export type AllocationSaleStatus = (typeof AllocationSaleStatus)[keyof typeof AllocationSaleStatus];
export const allocationSaleStatusEnum = pgEnum("allocation_sale_status", [
  AllocationSaleStatus.proposed,
  AllocationSaleStatus.allocated,
  AllocationSaleStatus.paid_outright,
  AllocationSaleStatus.released,
  AllocationSaleStatus.disputed,
  AllocationSaleStatus.cancelled,
]);

export const AllocationStatus = {
  pending: "pending",
  settled: "settled",
  reversed: "reversed",
} as const;
export type AllocationStatus = (typeof AllocationStatus)[keyof typeof AllocationStatus];
export const allocationStatusEnum = pgEnum("allocation_status", [
  AllocationStatus.pending,
  AllocationStatus.settled,
  AllocationStatus.reversed,
]);

export const AppRole = {
  admin: "admin",
  landlord: "landlord",
  tenant: "tenant",
  buyer: "buyer",
} as const;
export type AppRole = (typeof AppRole)[keyof typeof AppRole];
export const appRoleEnum = pgEnum("app_role", [
  AppRole.admin,
  AppRole.landlord,
  AppRole.tenant,
  AppRole.buyer,
]);

export const BeneficiaryType = {
  owner: "owner",
  platform: "platform",
  contractor: "contractor",
  reserve: "reserve",
} as const;
export type BeneficiaryType = (typeof BeneficiaryType)[keyof typeof BeneficiaryType];
export const beneficiaryTypeEnum = pgEnum("beneficiary_type", [
  BeneficiaryType.owner,
  BeneficiaryType.platform,
  BeneficiaryType.contractor,
  BeneficiaryType.reserve,
]);

export const ContractKind = {
  lease: "lease",
  sale: "sale",
} as const;
export type ContractKind = (typeof ContractKind)[keyof typeof ContractKind];
export const contractKindEnum = pgEnum("contract_kind", [ContractKind.lease, ContractKind.sale]);

export const ContractStatus = {
  draft: "draft",
  in_review: "in_review",
  approved: "approved",
  active: "active",
  suspended: "suspended",
  terminated: "terminated",
  rejected: "rejected",
  expired: "expired",
  renewed: "renewed",
} as const;
export type ContractStatus = (typeof ContractStatus)[keyof typeof ContractStatus];
export const contractStatusEnum = pgEnum("contract_status", [
  ContractStatus.draft,
  ContractStatus.in_review,
  ContractStatus.approved,
  ContractStatus.active,
  ContractStatus.suspended,
  ContractStatus.terminated,
  ContractStatus.rejected,
  ContractStatus.expired,
  ContractStatus.renewed,
]);

export const DisputeStatus = {
  open: "open",
  under_review: "under_review",
  escalated: "escalated",
  resolved: "resolved",
  dismissed: "dismissed",
} as const;
export type DisputeStatus = (typeof DisputeStatus)[keyof typeof DisputeStatus];
export const disputeStatusEnum = pgEnum("dispute_status", [
  DisputeStatus.open,
  DisputeStatus.under_review,
  DisputeStatus.escalated,
  DisputeStatus.resolved,
  DisputeStatus.dismissed,
]);

export const DocumentKind = {
  tenancy_agreement: "tenancy_agreement",
  contract_of_sale: "contract_of_sale",
  installment_agreement: "installment_agreement",
  receipt: "receipt",
  monthly_statement: "monthly_statement",
  payout_statement: "payout_statement",
  payout_advice: "payout_advice",
  arrears_notice: "arrears_notice",
  notice_to_vacate: "notice_to_vacate",
  title_release: "title_release",
  inspection_report: "inspection_report",
  kyc_bundle: "kyc_bundle",
  title_deed: "title_deed",
  survey_plan: "survey_plan",
  certificate_of_occupancy: "certificate_of_occupancy",
  gazette_notice: "gazette_notice",
  id_verification: "id_verification",
  power_of_attorney: "power_of_attorney",
  receipt_evidence: "receipt_evidence",
  other: "other",
} as const;
export type DocumentKind = (typeof DocumentKind)[keyof typeof DocumentKind];
export const documentKindEnum = pgEnum("document_kind", [
  DocumentKind.tenancy_agreement,
  DocumentKind.contract_of_sale,
  DocumentKind.installment_agreement,
  DocumentKind.receipt,
  DocumentKind.monthly_statement,
  DocumentKind.payout_statement,
  DocumentKind.payout_advice,
  DocumentKind.arrears_notice,
  DocumentKind.notice_to_vacate,
  DocumentKind.title_release,
  DocumentKind.inspection_report,
  DocumentKind.kyc_bundle,
  DocumentKind.title_deed,
  DocumentKind.survey_plan,
  DocumentKind.certificate_of_occupancy,
  DocumentKind.gazette_notice,
  DocumentKind.id_verification,
  DocumentKind.power_of_attorney,
  DocumentKind.receipt_evidence,
  DocumentKind.other,
]);

export const DocumentOrigin = {
  generated: "generated",
  uploaded: "uploaded",
} as const;
export type DocumentOrigin = (typeof DocumentOrigin)[keyof typeof DocumentOrigin];
export const documentOriginEnum = pgEnum("document_origin", [
  DocumentOrigin.generated,
  DocumentOrigin.uploaded,
]);

export const DocumentStatus = {
  draft: "draft",
  generated: "generated",
  signed: "signed",
  released: "released",
  superseded: "superseded",
  void: "void",
} as const;
export type DocumentStatus = (typeof DocumentStatus)[keyof typeof DocumentStatus];
export const documentStatusEnum = pgEnum("document_status", [
  DocumentStatus.draft,
  DocumentStatus.generated,
  DocumentStatus.signed,
  DocumentStatus.released,
  DocumentStatus.superseded,
  DocumentStatus.void,
]);

export const DocumentVisibility = {
  private: "private",
  counterparty: "counterparty",
  staff: "staff",
  public: "public",
} as const;
export type DocumentVisibility = (typeof DocumentVisibility)[keyof typeof DocumentVisibility];
export const documentVisibilityEnum = pgEnum("document_visibility", [
  DocumentVisibility.private,
  DocumentVisibility.counterparty,
  DocumentVisibility.staff,
  DocumentVisibility.public,
]);

export const KycStatus = {
  not_started: "not_started",
  pending: "pending",
  verified: "verified",
  rejected: "rejected",
} as const;
export type KycStatus = (typeof KycStatus)[keyof typeof KycStatus];
export const kycStatusEnum = pgEnum("kyc_status", [
  KycStatus.not_started,
  KycStatus.pending,
  KycStatus.verified,
  KycStatus.rejected,
]);

export const LateFeePolicy = {
  none: "none",
  flat: "flat",
  percent: "percent",
} as const;
export type LateFeePolicy = (typeof LateFeePolicy)[keyof typeof LateFeePolicy];
export const lateFeePolicyEnum = pgEnum("late_fee_policy", [
  LateFeePolicy.none,
  LateFeePolicy.flat,
  LateFeePolicy.percent,
]);

export const LedgerStatus = {
  pending: "pending",
  succeeded: "succeeded",
  failed: "failed",
  reversed: "reversed",
  refunded: "refunded",
} as const;
export type LedgerStatus = (typeof LedgerStatus)[keyof typeof LedgerStatus];
export const ledgerStatusEnum = pgEnum("ledger_status", [
  LedgerStatus.pending,
  LedgerStatus.succeeded,
  LedgerStatus.failed,
  LedgerStatus.reversed,
  LedgerStatus.refunded,
]);

export const ListingType = {
  rent: "rent",
  sale: "sale",
} as const;
export type ListingType = (typeof ListingType)[keyof typeof ListingType];
export const listingTypeEnum = pgEnum("listing_type", [ListingType.rent, ListingType.sale]);

export const MediaKind = {
  image: "image",
  video: "video",
  floorplan: "floorplan",
  brochure: "brochure",
} as const;
export type MediaKind = (typeof MediaKind)[keyof typeof MediaKind];
export const mediaKindEnum = pgEnum("media_kind", [
  MediaKind.image,
  MediaKind.video,
  MediaKind.floorplan,
  MediaKind.brochure,
]);

export const NoticeChannel = {
  email: "email",
  sms: "sms",
  whatsapp: "whatsapp",
  in_app: "in_app",
} as const;
export type NoticeChannel = (typeof NoticeChannel)[keyof typeof NoticeChannel];
export const noticeChannelEnum = pgEnum("notice_channel", [
  NoticeChannel.email,
  NoticeChannel.sms,
  NoticeChannel.whatsapp,
  NoticeChannel.in_app,
]);

export const NoticeKind = {
  welcome: "welcome",
  otp: "otp",
  verify_email: "verify_email",
  rent_reminder: "rent_reminder",
  rent_due: "rent_due",
  arrears_notice: "arrears_notice",
  quit_notice: "quit_notice",
  renewal_offer: "renewal_offer",
  installment_reminder: "installment_reminder",
  payment_receipt: "payment_receipt",
  payment_failed: "payment_failed",
  title_release: "title_release",
  lease_agreement_ready: "lease_agreement_ready",
  contract_of_sale_ready: "contract_of_sale_ready",
  ticket_created: "ticket_created",
  ticket_updated: "ticket_updated",
  owner_application_received: "owner_application_received",
  listing_submitted: "listing_submitted",
  payout_processed: "payout_processed",
  dispute_opened: "dispute_opened",
  dispute_resolved: "dispute_resolved",
} as const;
export type NoticeKind = (typeof NoticeKind)[keyof typeof NoticeKind];
export const noticeKindEnum = pgEnum("notice_kind", [
  NoticeKind.welcome,
  NoticeKind.otp,
  NoticeKind.verify_email,
  NoticeKind.rent_reminder,
  NoticeKind.rent_due,
  NoticeKind.arrears_notice,
  NoticeKind.quit_notice,
  NoticeKind.renewal_offer,
  NoticeKind.installment_reminder,
  NoticeKind.payment_receipt,
  NoticeKind.payment_failed,
  NoticeKind.title_release,
  NoticeKind.lease_agreement_ready,
  NoticeKind.contract_of_sale_ready,
  NoticeKind.ticket_created,
  NoticeKind.ticket_updated,
  NoticeKind.owner_application_received,
  NoticeKind.listing_submitted,
  NoticeKind.payout_processed,
  NoticeKind.dispute_opened,
  NoticeKind.dispute_resolved,
]);

export const NoticeStatus = {
  queued: "queued",
  sending: "sending",
  sent: "sent",
  delivered: "delivered",
  bounced: "bounced",
  failed: "failed",
  cancelled: "cancelled",
} as const;
export type NoticeStatus = (typeof NoticeStatus)[keyof typeof NoticeStatus];
export const noticeStatusEnum = pgEnum("notice_status", [
  NoticeStatus.queued,
  NoticeStatus.sending,
  NoticeStatus.sent,
  NoticeStatus.delivered,
  NoticeStatus.bounced,
  NoticeStatus.failed,
  NoticeStatus.cancelled,
]);

export const OccupancyRelationship = {
  primary: "primary",
  spouse: "spouse",
  child: "child",
  dependent: "dependent",
  guest: "guest",
  subtenant: "subtenant",
  unrelated: "unrelated",
} as const;
export type OccupancyRelationship =
  (typeof OccupancyRelationship)[keyof typeof OccupancyRelationship];
export const occupancyRelationshipEnum = pgEnum("occupancy_relationship", [
  OccupancyRelationship.primary,
  OccupancyRelationship.spouse,
  OccupancyRelationship.child,
  OccupancyRelationship.dependent,
  OccupancyRelationship.guest,
  OccupancyRelationship.subtenant,
  OccupancyRelationship.unrelated,
]);

export const OnboardingState = {
  phone_only: "phone_only",
  verified: "verified",
  profile_complete: "profile_complete",
  role_selected: "role_selected",
  complete: "complete",
} as const;
export type OnboardingState = (typeof OnboardingState)[keyof typeof OnboardingState];
export const onboardingStateEnum = pgEnum("onboarding_state", [
  OnboardingState.phone_only,
  OnboardingState.verified,
  OnboardingState.profile_complete,
  OnboardingState.role_selected,
  OnboardingState.complete,
]);

export const OwnerType = {
  individual: "individual",
  company: "company",
  agent: "agent",
  joint_venture: "joint_venture",
} as const;
export type OwnerType = (typeof OwnerType)[keyof typeof OwnerType];
export const ownerTypeEnum = pgEnum("owner_type", [
  OwnerType.individual,
  OwnerType.company,
  OwnerType.agent,
  OwnerType.joint_venture,
]);

export const PartyRole = {
  landlord: "landlord",
  co_landlord: "co_landlord",
  owner_representative: "owner_representative",
  tenant: "tenant",
  co_tenant: "co_tenant",
  subtenant: "subtenant",
  seller: "seller",
  buyer: "buyer",
  co_buyer: "co_buyer",
  guarantor: "guarantor",
  witness: "witness",
  solicitor: "solicitor",
} as const;
export type PartyRole = (typeof PartyRole)[keyof typeof PartyRole];
export const partyRoleEnum = pgEnum("party_role", [
  PartyRole.landlord,
  PartyRole.co_landlord,
  PartyRole.owner_representative,
  PartyRole.tenant,
  PartyRole.co_tenant,
  PartyRole.subtenant,
  PartyRole.seller,
  PartyRole.buyer,
  PartyRole.co_buyer,
  PartyRole.guarantor,
  PartyRole.witness,
  PartyRole.solicitor,
]);

export const PaymentChannel = {
  card: "card",
  bank: "bank",
  bank_transfer: "bank_transfer",
  ussd: "ussd",
  mobile_money: "mobile_money",
  split: "split",
  other: "other",
} as const;
export type PaymentChannel = (typeof PaymentChannel)[keyof typeof PaymentChannel];
export const paymentChannelEnum = pgEnum("payment_channel", [
  PaymentChannel.card,
  PaymentChannel.bank,
  PaymentChannel.bank_transfer,
  PaymentChannel.ussd,
  PaymentChannel.mobile_money,
  PaymentChannel.split,
  PaymentChannel.other,
]);

export const PaymentIntentStatus = {
  created: "created",
  pending: "pending",
  processing: "processing",
  succeeded: "succeeded",
  failed: "failed",
  cancelled: "cancelled",
  expired: "expired",
  refunded: "refunded",
  partially_refunded: "partially_refunded",
} as const;
export type PaymentIntentStatus = (typeof PaymentIntentStatus)[keyof typeof PaymentIntentStatus];
export const paymentIntentStatusEnum = pgEnum("payment_intent_status", [
  PaymentIntentStatus.created,
  PaymentIntentStatus.pending,
  PaymentIntentStatus.processing,
  PaymentIntentStatus.succeeded,
  PaymentIntentStatus.failed,
  PaymentIntentStatus.cancelled,
  PaymentIntentStatus.expired,
  PaymentIntentStatus.refunded,
  PaymentIntentStatus.partially_refunded,
]);

export const PaymentKind = {
  rent: "rent",
  service_charge: "service_charge",
  installment: "installment",
  outright_purchase: "outright_purchase",
  deposit: "deposit",
  agreement_fee: "agreement_fee",
  penalty: "penalty",
  refund: "refund",
} as const;
export type PaymentKind = (typeof PaymentKind)[keyof typeof PaymentKind];
export const paymentKindEnum = pgEnum("payment_kind", [
  PaymentKind.rent,
  PaymentKind.service_charge,
  PaymentKind.installment,
  PaymentKind.outright_purchase,
  PaymentKind.deposit,
  PaymentKind.agreement_fee,
  PaymentKind.penalty,
  PaymentKind.refund,
]);

export const PaymentPlan = {
  outright: "outright",
  installment: "installment",
} as const;
export type PaymentPlan = (typeof PaymentPlan)[keyof typeof PaymentPlan];
export const paymentPlanEnum = pgEnum("payment_plan", [
  PaymentPlan.outright,
  PaymentPlan.installment,
]);

export const PayoutMethod = {
  paystack_transfer: "paystack_transfer",
  manual: "manual",
} as const;
export type PayoutMethod = (typeof PayoutMethod)[keyof typeof PayoutMethod];
export const payoutMethodEnum = pgEnum("payout_method", [
  PayoutMethod.paystack_transfer,
  PayoutMethod.manual,
]);

export const PayoutStatus = {
  draft: "draft",
  approved: "approved",
  initiating: "initiating",
  paid: "paid",
  failed: "failed",
  cancelled: "cancelled",
} as const;
export type PayoutStatus = (typeof PayoutStatus)[keyof typeof PayoutStatus];
export const payoutStatusEnum = pgEnum("payout_status", [
  PayoutStatus.draft,
  PayoutStatus.approved,
  PayoutStatus.initiating,
  PayoutStatus.paid,
  PayoutStatus.failed,
  PayoutStatus.cancelled,
]);

export const PropertyStatus = {
  draft: "draft",
  in_review: "in_review",
  published: "published",
  let_agreed: "let_agreed",
  under_offer: "under_offer",
  sold: "sold",
  withdrawn: "withdrawn",
  archived: "archived",
} as const;
export type PropertyStatus = (typeof PropertyStatus)[keyof typeof PropertyStatus];
export const propertyStatusEnum = pgEnum("property_status", [
  PropertyStatus.draft,
  PropertyStatus.in_review,
  PropertyStatus.published,
  PropertyStatus.let_agreed,
  PropertyStatus.under_offer,
  PropertyStatus.sold,
  PropertyStatus.withdrawn,
  PropertyStatus.archived,
]);

export const PropertyType = {
  face_me_i_face_you: "face_me_i_face_you",
  self_contained: "self_contained",
  flat: "flat",
  apartment: "apartment",
  bungalow: "bungalow",
  duplex: "duplex",
  mansion: "mansion",
  terrace: "terrace",
  land: "land",
  commercial: "commercial",
  office: "office",
  shop: "shop",
} as const;
export type PropertyType = (typeof PropertyType)[keyof typeof PropertyType];
export const propertyTypeEnum = pgEnum("property_type", [
  PropertyType.face_me_i_face_you,
  PropertyType.self_contained,
  PropertyType.flat,
  PropertyType.apartment,
  PropertyType.bungalow,
  PropertyType.duplex,
  PropertyType.mansion,
  PropertyType.terrace,
  PropertyType.land,
  PropertyType.commercial,
  PropertyType.office,
  PropertyType.shop,
]);

export const ScheduleKind = {
  rent: "rent",
  service_charge: "service_charge",
  installment: "installment",
  deposit: "deposit",
  agreement_fee: "agreement_fee",
  penalty: "penalty",
  balance_clearance: "balance_clearance",
} as const;
export type ScheduleKind = (typeof ScheduleKind)[keyof typeof ScheduleKind];
export const scheduleKindEnum = pgEnum("schedule_kind", [
  ScheduleKind.rent,
  ScheduleKind.service_charge,
  ScheduleKind.installment,
  ScheduleKind.deposit,
  ScheduleKind.agreement_fee,
  ScheduleKind.penalty,
  ScheduleKind.balance_clearance,
]);

export const ScheduleStatus = {
  pending: "pending",
  partial: "partial",
  paid: "paid",
  waived: "waived",
  overdue: "overdue",
} as const;
export type ScheduleStatus = (typeof ScheduleStatus)[keyof typeof ScheduleStatus];
export const scheduleStatusEnum = pgEnum("schedule_status", [
  ScheduleStatus.pending,
  ScheduleStatus.partial,
  ScheduleStatus.paid,
  ScheduleStatus.waived,
  ScheduleStatus.overdue,
]);

export const SmsProviderKind = {
  twilio: "twilio",
  msg: "msg",
  termii: "termii",
  sendchamp: "sendchamp",
  mock: "mock",
} as const;
export type SmsProviderKind = (typeof SmsProviderKind)[keyof typeof SmsProviderKind];
export const smsProviderKindEnum = pgEnum("sms_provider_kind", [
  SmsProviderKind.twilio,
  SmsProviderKind.msg,
  SmsProviderKind.termii,
  SmsProviderKind.sendchamp,
  SmsProviderKind.mock,
]);

export const TicketPriority = {
  low: "low",
  medium: "medium",
  high: "high",
  urgent: "urgent",
} as const;
export type TicketPriority = (typeof TicketPriority)[keyof typeof TicketPriority];
export const ticketPriorityEnum = pgEnum("ticket_priority", [
  TicketPriority.low,
  TicketPriority.medium,
  TicketPriority.high,
  TicketPriority.urgent,
]);

export const TicketStatus = {
  open: "open",
  acknowledged: "acknowledged",
  in_progress: "in_progress",
  awaiting_parts: "awaiting_parts",
  awaiting_tenant: "awaiting_tenant",
  resolved: "resolved",
  closed: "closed",
  cancelled: "cancelled",
} as const;
export type TicketStatus = (typeof TicketStatus)[keyof typeof TicketStatus];
export const ticketStatusEnum = pgEnum("ticket_status", [
  TicketStatus.open,
  TicketStatus.acknowledged,
  TicketStatus.in_progress,
  TicketStatus.awaiting_parts,
  TicketStatus.awaiting_tenant,
  TicketStatus.resolved,
  TicketStatus.closed,
  TicketStatus.cancelled,
]);

export const TicketVisibility = {
  internal: "internal",
  shared: "shared",
} as const;
export type TicketVisibility = (typeof TicketVisibility)[keyof typeof TicketVisibility];
export const ticketVisibilityEnum = pgEnum("ticket_visibility", [
  TicketVisibility.internal,
  TicketVisibility.shared,
]);

export const TitleReleaseStatus = {
  not_eligible: "not_eligible",
  eligible: "eligible",
  approved: "approved",
  released: "released",
} as const;
export type TitleReleaseStatus = (typeof TitleReleaseStatus)[keyof typeof TitleReleaseStatus];
export const titleReleaseStatusEnum = pgEnum("title_release_status", [
  TitleReleaseStatus.not_eligible,
  TitleReleaseStatus.eligible,
  TitleReleaseStatus.approved,
  TitleReleaseStatus.released,
]);

export const TitleType = {
  c_of_o: "c_of_o",
  right_of_occupancy: "right_of_occupancy",
  excision_in_progress: "excision_in_progress",
  gazette_notice: "gazette_notice",
  deed_of_assignment: "deed_of_assignment",
  registered_certificate: "registered_certificate",
  unregistered: "unregistered",
} as const;
export type TitleType = (typeof TitleType)[keyof typeof TitleType];
export const titleTypeEnum = pgEnum("title_type", [
  TitleType.c_of_o,
  TitleType.right_of_occupancy,
  TitleType.excision_in_progress,
  TitleType.gazette_notice,
  TitleType.deed_of_assignment,
  TitleType.registered_certificate,
  TitleType.unregistered,
]);

export const Topography = {
  flat: "flat",
  gentle_slope: "gentle_slope",
  steep_slope: "steep_slope",
  swampy: "swampy",
  rocky: "rocky",
} as const;
export type Topography = (typeof Topography)[keyof typeof Topography];
export const topographyEnum = pgEnum("topography", [
  Topography.flat,
  Topography.gentle_slope,
  Topography.steep_slope,
  Topography.swampy,
  Topography.rocky,
]);

export const UnitStatus = {
  vacant: "vacant",
  occupied: "occupied",
  notice_served: "notice_served",
  evicted: "evicted",
  under_maintenance: "under_maintenance",
} as const;
export type UnitStatus = (typeof UnitStatus)[keyof typeof UnitStatus];
export const unitStatusEnum = pgEnum("unit_status", [
  UnitStatus.vacant,
  UnitStatus.occupied,
  UnitStatus.notice_served,
  UnitStatus.evicted,
  UnitStatus.under_maintenance,
]);

export const WebhookProvider = {
  paystack: "paystack",
  cloudinary: "cloudinary",
  resend: "resend",
} as const;
export type WebhookProvider = (typeof WebhookProvider)[keyof typeof WebhookProvider];
export const webhookProviderEnum = pgEnum("webhook_provider", [
  WebhookProvider.paystack,
  WebhookProvider.cloudinary,
  WebhookProvider.resend,
]);

export const WebhookStatus = {
  received: "received",
  processing: "processing",
  processed: "processed",
  failed: "failed",
  ignored: "ignored",
  replayed: "replayed",
} as const;
export type WebhookStatus = (typeof WebhookStatus)[keyof typeof WebhookStatus];
export const webhookStatusEnum = pgEnum("webhook_status", [
  WebhookStatus.received,
  WebhookStatus.processing,
  WebhookStatus.processed,
  WebhookStatus.failed,
  WebhookStatus.ignored,
  WebhookStatus.replayed,
]);
