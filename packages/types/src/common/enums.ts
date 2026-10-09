// common/enums.ts — every Postgres enum from docs/05 §4 as a TS const array,
// plus its Zod schema. Single source for wire enum values; the contract
// lifecycle test pins the 9 contract states against this list.
import { z } from "zod";

export const appRoleValues = ["admin", "landlord", "tenant", "buyer"] as const;
export type AppRole = (typeof appRoleValues)[number];
export const AppRole = z.enum(appRoleValues);

export const onboardingStateValues = [
  "phone_only",
  "verified",
  "profile_complete",
  "role_selected",
  "complete",
] as const;
export type OnboardingState = (typeof onboardingStateValues)[number];
export const OnboardingState = z.enum(onboardingStateValues);

export const ownerTypeValues = ["individual", "company", "agent", "joint_venture"] as const;
export type OwnerType = (typeof ownerTypeValues)[number];
export const OwnerType = z.enum(ownerTypeValues);

export const kycStatusValues = ["not_started", "pending", "verified", "rejected"] as const;
export type KycStatus = (typeof kycStatusValues)[number];
export const KycStatus = z.enum(kycStatusValues);

export const listingTypeValues = ["rent", "sale"] as const;
export type ListingType = (typeof listingTypeValues)[number];
export const ListingType = z.enum(listingTypeValues);

export const propertyTypeValues = [
  "face_me_i_face_you",
  "self_contained",
  "flat",
  "apartment",
  "bungalow",
  "duplex",
  "mansion",
  "terrace",
  "land",
  "commercial",
  "office",
  "shop",
] as const;
export type PropertyType = (typeof propertyTypeValues)[number];
export const PropertyType = z.enum(propertyTypeValues);

export const propertyStatusValues = [
  "draft",
  "in_review",
  "published",
  "let_agreed",
  "under_offer",
  "sold",
  "withdrawn",
  "archived",
] as const;
export type PropertyStatus = (typeof propertyStatusValues)[number];
export const PropertyStatus = z.enum(propertyStatusValues);

export const unitStatusValues = [
  "vacant",
  "occupied",
  "notice_served",
  "evicted",
  "under_maintenance",
] as const;
export type UnitStatus = (typeof unitStatusValues)[number];
export const UnitStatus = z.enum(unitStatusValues);

export const titleTypeValues = [
  "c_of_o",
  "right_of_occupancy",
  "excision_in_progress",
  "gazette_notice",
  "deed_of_assignment",
  "registered_certificate",
  "unregistered",
] as const;
export type TitleType = (typeof titleTypeValues)[number];
export const TitleType = z.enum(titleTypeValues);

export const topographyValues = ["flat", "gentle_slope", "steep_slope", "swampy", "rocky"] as const;
export type Topography = (typeof topographyValues)[number];
export const Topography = z.enum(topographyValues);

export const mediaKindValues = ["image", "video", "floorplan", "brochure"] as const;
export type MediaKind = (typeof mediaKindValues)[number];
export const MediaKind = z.enum(mediaKindValues);

export const contractKindValues = ["lease", "sale"] as const;
export type ContractKind = (typeof contractKindValues)[number];
export const ContractKind = z.enum(contractKindValues);

export const contractStatusValues = [
  "draft",
  "in_review",
  "approved",
  "active",
  "suspended",
  "terminated",
  "rejected",
  "expired",
  "renewed",
] as const;
export type ContractStatus = (typeof contractStatusValues)[number];
export const ContractStatus = z.enum(contractStatusValues);

export const paymentPlanValues = ["outright", "installment"] as const;
export type PaymentPlan = (typeof paymentPlanValues)[number];
export const PaymentPlan = z.enum(paymentPlanValues);

export const lateFeePolicyValues = ["none", "flat", "percent"] as const;
export type LateFeePolicy = (typeof lateFeePolicyValues)[number];
export const LateFeePolicy = z.enum(lateFeePolicyValues);

export const titleReleaseStatusValues = [
  "not_eligible",
  "eligible",
  "approved",
  "released",
] as const;
export type TitleReleaseStatus = (typeof titleReleaseStatusValues)[number];
export const TitleReleaseStatus = z.enum(titleReleaseStatusValues);

export const partyRoleValues = [
  "landlord",
  "co_landlord",
  "owner_representative",
  "tenant",
  "co_tenant",
  "subtenant",
  "seller",
  "buyer",
  "co_buyer",
  "guarantor",
  "witness",
  "solicitor",
] as const;
export type PartyRole = (typeof partyRoleValues)[number];
export const PartyRole = z.enum(partyRoleValues);

export const occupancyRelationshipValues = [
  "primary",
  "spouse",
  "child",
  "dependent",
  "guest",
  "subtenant",
  "unrelated",
] as const;
export type OccupancyRelationship = (typeof occupancyRelationshipValues)[number];
export const OccupancyRelationship = z.enum(occupancyRelationshipValues);

export const scheduleKindValues = [
  "rent",
  "service_charge",
  "installment",
  "deposit",
  "agreement_fee",
  "penalty",
  "balance_clearance",
] as const;
export type ScheduleKind = (typeof scheduleKindValues)[number];
export const ScheduleKind = z.enum(scheduleKindValues);

export const scheduleStatusValues = ["pending", "partial", "paid", "waived", "overdue"] as const;
export type ScheduleStatus = (typeof scheduleStatusValues)[number];
export const ScheduleStatus = z.enum(scheduleStatusValues);

export const paymentKindValues = [
  "rent",
  "service_charge",
  "installment",
  "outright_purchase",
  "deposit",
  "agreement_fee",
  "penalty",
  "refund",
] as const;
export type PaymentKind = (typeof paymentKindValues)[number];
export const PaymentKind = z.enum(paymentKindValues);

export const paymentIntentStatusValues = [
  "created",
  "pending",
  "processing",
  "succeeded",
  "failed",
  "cancelled",
  "expired",
  "refunded",
  "partially_refunded",
] as const;
export type PaymentIntentStatus = (typeof paymentIntentStatusValues)[number];
export const PaymentIntentStatus = z.enum(paymentIntentStatusValues);

export const ledgerStatusValues = [
  "pending",
  "succeeded",
  "failed",
  "reversed",
  "refunded",
] as const;
export type LedgerStatus = (typeof ledgerStatusValues)[number];
export const LedgerStatus = z.enum(ledgerStatusValues);

export const paymentChannelValues = [
  "card",
  "bank",
  "bank_transfer",
  "ussd",
  "mobile_money",
  "split",
  "other",
] as const;
export type PaymentChannel = (typeof paymentChannelValues)[number];
export const PaymentChannel = z.enum(paymentChannelValues);

export const beneficiaryTypeValues = ["owner", "platform", "contractor", "reserve"] as const;
export type BeneficiaryType = (typeof beneficiaryTypeValues)[number];
export const BeneficiaryType = z.enum(beneficiaryTypeValues);

export const allocationBasisValues = [
  "rent_principal",
  "service_charge_principal",
  "management_fee",
  "maintenance_deduction",
  "sale_principal",
  "sale_commission",
  "deposit_holding",
  "agreement_fee_holding",
] as const;
export type AllocationBasis = (typeof allocationBasisValues)[number];
export const AllocationBasis = z.enum(allocationBasisValues);

export const allocationStatusValues = ["pending", "settled", "reversed"] as const;
export type AllocationStatus = (typeof allocationStatusValues)[number];
export const AllocationStatus = z.enum(allocationStatusValues);

export const payoutStatusValues = [
  "draft",
  "approved",
  "initiating",
  "paid",
  "failed",
  "cancelled",
] as const;
export type PayoutStatus = (typeof payoutStatusValues)[number];
export const PayoutStatus = z.enum(payoutStatusValues);

export const payoutMethodValues = ["paystack_transfer", "manual"] as const;
export type PayoutMethod = (typeof payoutMethodValues)[number];
export const PayoutMethod = z.enum(payoutMethodValues);

export const ticketStatusValues = [
  "open",
  "acknowledged",
  "in_progress",
  "awaiting_parts",
  "awaiting_tenant",
  "resolved",
  "closed",
  "cancelled",
] as const;
export type TicketStatus = (typeof ticketStatusValues)[number];
export const TicketStatus = z.enum(ticketStatusValues);

export const ticketPriorityValues = ["low", "medium", "high", "urgent"] as const;
export type TicketPriority = (typeof ticketPriorityValues)[number];
export const TicketPriority = z.enum(ticketPriorityValues);

export const ticketVisibilityValues = ["internal", "shared"] as const;
export type TicketVisibility = (typeof ticketVisibilityValues)[number];
export const TicketVisibility = z.enum(ticketVisibilityValues);

export const disputeStatusValues = [
  "open",
  "under_review",
  "escalated",
  "resolved",
  "dismissed",
] as const;
export type DisputeStatus = (typeof disputeStatusValues)[number];
export const DisputeStatus = z.enum(disputeStatusValues);

export const noticeKindValues = [
  "welcome",
  "otp",
  "verify_email",
  "rent_reminder",
  "rent_due",
  "arrears_notice",
  "quit_notice",
  "renewal_offer",
  "installment_reminder",
  "payment_receipt",
  "payment_failed",
  "title_release",
  "lease_agreement_ready",
  "contract_of_sale_ready",
  "ticket_created",
  "ticket_updated",
  "owner_application_received",
  "listing_submitted",
  "payout_processed",
  "dispute_opened",
  "dispute_resolved",
] as const;
export type NoticeKind = (typeof noticeKindValues)[number];
export const NoticeKind = z.enum(noticeKindValues);

export const noticeChannelValues = ["email", "sms", "whatsapp", "in_app"] as const;
export type NoticeChannel = (typeof noticeChannelValues)[number];
export const NoticeChannel = z.enum(noticeChannelValues);

export const noticeStatusValues = [
  "queued",
  "sending",
  "sent",
  "delivered",
  "bounced",
  "failed",
  "cancelled",
] as const;
export type NoticeStatus = (typeof noticeStatusValues)[number];
export const NoticeStatus = z.enum(noticeStatusValues);

export const documentKindValues = [
  "tenancy_agreement",
  "contract_of_sale",
  "installment_agreement",
  "receipt",
  "monthly_statement",
  "payout_statement",
  "payout_advice",
  "arrears_notice",
  "notice_to_vacate",
  "title_release",
  "inspection_report",
  "kyc_bundle",
  "title_deed",
  "survey_plan",
  "certificate_of_occupancy",
  "gazette_notice",
  "id_verification",
  "power_of_attorney",
  "receipt_evidence",
  "other",
] as const;
export type DocumentKind = (typeof documentKindValues)[number];
export const DocumentKind = z.enum(documentKindValues);

export const documentVisibilityValues = ["private", "counterparty", "staff", "public"] as const;
export type DocumentVisibility = (typeof documentVisibilityValues)[number];
export const DocumentVisibility = z.enum(documentVisibilityValues);

export const documentStatusValues = [
  "draft",
  "generated",
  "signed",
  "released",
  "superseded",
  "void",
] as const;
export type DocumentStatus = (typeof documentStatusValues)[number];
export const DocumentStatus = z.enum(documentStatusValues);

export const documentOriginValues = ["generated", "uploaded"] as const;
export type DocumentOrigin = (typeof documentOriginValues)[number];
export const DocumentOrigin = z.enum(documentOriginValues);

export const allocationSaleStatusValues = [
  "proposed",
  "allocated",
  "paid_outright",
  "released",
  "disputed",
  "cancelled",
] as const;
export type AllocationSaleStatus = (typeof allocationSaleStatusValues)[number];
export const AllocationSaleStatus = z.enum(allocationSaleStatusValues);

export const webhookProviderValues = ["paystack", "cloudinary", "resend"] as const;
export type WebhookProvider = (typeof webhookProviderValues)[number];
export const WebhookProvider = z.enum(webhookProviderValues);

export const webhookStatusValues = [
  "received",
  "processing",
  "processed",
  "failed",
  "ignored",
  "replayed",
] as const;
export type WebhookStatus = (typeof webhookStatusValues)[number];
export const WebhookStatus = z.enum(webhookStatusValues);

export const smsProviderKindValues = ["twilio", "msg", "termii", "sendchamp", "mock"] as const;
export type SmsProviderKind = (typeof smsProviderKindValues)[number];
export const SmsProviderKind = z.enum(smsProviderKindValues);
