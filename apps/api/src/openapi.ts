// src/openapi.ts — builds docs/openapi/courtland.json (OpenAPI 3.1) from Zod schemas.
// Run: pnpm --filter @courtland/api gen:openapi. Output is deterministic; the
// drift script fails CI when the committed file differs from a fresh build.
//
// Notes on fidelity (docs/08 §10-§12):
// - Every endpoint below is transcribed from the §10 catalogue. Per-endpoint
//   query/body/response FIELD detail is mostly absent from the docs, so bodies
//   reuse the domain create/update schemas and responses reuse the read models;
//   shapes invented where the docs are silent are marked DERIVED.
// - Conversion uses z.toJSONSchema (JSON Schema 2020-12, which is what OpenAPI
//   3.1 uses) — no extra dependency instead of the zod-openapi mentioned in §12.
// - buildOpenApiSpec throws when an endpoint lacks its request or response
//   schema, so a missing one fails the build, not the review.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as T from "@courtland/types";
import { z } from "zod";

export type HttpMethod = "get" | "post" | "patch" | "put" | "delete";

export interface EndpointRequest {
  params?: z.ZodType;
  query?: z.ZodType;
  body?: z.ZodType;
}

export interface EndpointDef {
  method: HttpMethod;
  path: string;
  operationId: string;
  summary: string;
  permission: string | null;
  idempotency: boolean;
  request: EndpointRequest;
  response: z.ZodType;
  status?: number;
}

function defaultStatus(method: HttpMethod): number {
  return method === "post" ? 201 : 200;
}

function toSchemaObject(schema: z.ZodType): Record<string, unknown> {
  const raw = z.toJSONSchema(schema) as Record<string, unknown>;
  delete raw.$schema;
  return raw;
}

function parametersOf(shape: Record<string, z.ZodType>, location: "path" | "query"): unknown[] {
  return Object.entries(shape).map(([name, field]) => {
    const fieldSchema = toSchemaObject(field);
    const required = !field.isOptional();
    return {
      name,
      in: location,
      required: location === "path" ? true : required,
      schema: fieldSchema,
    };
  });
}

function shapeOf(schema: z.ZodType | undefined): Record<string, z.ZodType> | null {
  if (!schema) return null;
  const candidate = schema as unknown as { shape?: Record<string, z.ZodType> };
  if (!candidate.shape || typeof candidate.shape !== "object") return null;
  return candidate.shape;
}

// Shared shapes. DERIVED marks shapes the docs do not specify field-by-field;
// they follow the DB tables and the §4 envelopes.
const MessageResponse = z.strictObject({ message: z.string() });
const IdParam = z.strictObject({ id: z.uuid() });
const HealthResponse = z.strictObject({ status: z.literal("ok") });
const ReadyResponse = z.strictObject({
  status: z.enum(["ready", "degraded"]),
  checks: z.record(z.string(), z.boolean()),
});
const FacetsResponse = z.strictObject({
  byState: z.record(z.string(), z.number().int()),
  byType: z.record(z.string(), z.number().int()),
  byBedrooms: z.record(z.string(), z.number().int()),
});
const UnitRow = z.strictObject({
  id: z.uuid(),
  propertyId: z.uuid(),
  code: z.string(),
  floor: z.number().int().nullable(),
  bedrooms: z.number().int().nullable(),
  bathrooms: z.number().int().nullable(),
  sizeSqm: z.number().nullable(),
  askingRentKobo: z.number().int().nullable(),
  serviceChargeKobo: z.number().int(),
  status: T.UnitStatus,
  availableFrom: z.string().nullable(),
});
const UnitCreate = z.strictObject({
  code: z.string().min(1).max(40),
  floor: z.number().int().optional(),
  bedrooms: z.number().int().min(0).optional(),
  bathrooms: z.number().int().min(0).optional(),
  sizeSqm: z.number().positive().optional(),
  askingRentKobo: z.number().int().min(0).optional(),
  serviceChargeKobo: z.number().int().min(0).default(0),
  availableFrom: z.string().optional(),
  notes: z.string().max(1000).optional(),
});
const ContractEventRow = z.strictObject({
  id: z.uuid(),
  contractId: z.uuid(),
  eventType: z.string(),
  fromStatus: T.ContractStatus.nullable(),
  toStatus: T.ContractStatus.nullable(),
  actorId: z.uuid().nullable(),
  note: z.string().nullable(),
});
const SavedSearchRow = z.strictObject({
  id: z.uuid(),
  userId: z.uuid(),
  name: z.string(),
  alertsOn: z.boolean(),
});
const SavedSearchCreate = z.strictObject({
  name: z.string().min(1).max(200),
  filters: z.record(z.string(), z.unknown()).default({}),
  alertsOn: z.boolean().default(false),
});
const SavedSearchDelete = z.strictObject({ ids: z.array(z.uuid()).min(1).max(100) });
const ContractPatch = z.strictObject({
  notes: z.string().max(2000).nullable().optional(),
  serviceChargeKobo: z.number().int().min(0).nullable().optional(),
  lateFeePolicy: T.LateFeePolicy.nullable().optional(),
  lateFeeValue: z.number().int().min(0).nullable().optional(),
  graceDays: z.number().int().min(0).max(90).nullable().optional(),
});
const OwnerPatch = z.strictObject({
  legalName: z.string().min(1).max(200).nullable().optional(),
  businessName: z.string().max(200).nullable().optional(),
  email: z.email().nullable().optional(),
  phoneE164: z.string().nullable().optional(),
  address: z.string().max(500).nullable().optional(),
});
const TicketPatch = z.strictObject({
  priority: T.TicketPriority.nullable().optional(),
  status: T.TicketStatus.nullable().optional(),
  assignedTo: z.uuid().nullable().optional(),
});
const DisputePatch = z.strictObject({
  status: T.DisputeStatus.nullable().optional(),
  resolution: z.string().max(4000).nullable().optional(),
});
const ReconciliationSummary = z.strictObject({
  totalInKobo: z.number().int(),
  totalOutKobo: z.number().int(),
  openItemCount: z.number().int().min(0),
});
const QueueDepth = z.strictObject({ depth: z.number().int().min(0) });
const JobEnqueue = z.strictObject({ payload: z.record(z.string(), z.unknown()).default({}) });
const DownloadLink = z.strictObject({ url: z.string().url() });
const AdminInvite = z.strictObject({ email: z.email() });
const InvitedUser = z.strictObject({ id: z.uuid(), email: z.string().nullable() });
const SuspendedUser = z.strictObject({ id: z.uuid(), banned: z.boolean() });

export const ENDPOINTS: EndpointDef[] = [
  // Auth (docs/08 §10 Auth)
  {
    method: "post",
    path: "/v1/auth/otp/request",
    operationId: "requestOtp",
    summary: "Request a phone OTP",
    permission: null,
    idempotency: false,
    request: { body: T.OtpRequest },
    response: MessageResponse,
    status: 202,
  },
  {
    method: "post",
    path: "/v1/auth/otp/verify",
    operationId: "verifyOtp",
    summary: "Verify OTP and start a session",
    permission: null,
    idempotency: false,
    request: { body: T.OtpVerify },
    response: T.VerifyResponse,
  },
  {
    method: "post",
    path: "/v1/auth/otp/resend",
    operationId: "resendOtp",
    summary: "Resend a phone OTP",
    permission: null,
    idempotency: false,
    request: { body: T.OtpResend },
    response: MessageResponse,
    status: 202,
  },
  {
    method: "post",
    path: "/v1/auth/signout",
    operationId: "signOut",
    summary: "Revoke the session",
    permission: null,
    idempotency: false,
    request: {},
    response: MessageResponse,
  },
  {
    method: "get",
    path: "/v1/auth/me",
    operationId: "getProfile",
    summary: "Session bootstrap: profile, roles, permissions",
    permission: null,
    idempotency: false,
    request: {},
    response: T.Profile,
  },
  {
    method: "patch",
    path: "/v1/auth/me",
    operationId: "patchProfile",
    summary: "Update own profile",
    permission: null,
    idempotency: false,
    request: { body: T.ProfilePatch },
    response: T.Profile,
  },
  {
    method: "post",
    path: "/v1/auth/link-owner",
    operationId: "linkOwner",
    summary: "Claim a pending owner row by phone",
    permission: null,
    idempotency: false,
    request: { body: T.LinkOwner },
    response: MessageResponse,
  },
  {
    method: "post",
    path: "/v1/auth/change-phone",
    operationId: "changePhone",
    summary: "Change number with fresh OTP",
    permission: null,
    idempotency: false,
    request: { body: T.ChangePhone },
    response: MessageResponse,
  },
  {
    method: "get",
    path: "/v1/auth/csrf",
    operationId: "getCsrf",
    summary: "Mint a CSRF token",
    permission: null,
    idempotency: false,
    request: {},
    response: T.CsrfResponse,
  },
  // Properties
  {
    method: "get",
    path: "/v1/properties",
    operationId: "listProperties",
    summary: "Search published listings",
    permission: null,
    idempotency: false,
    request: { query: T.PropertyFilters },
    response: T.pageOf(T.PropertyListing),
  },
  {
    method: "get",
    path: "/v1/properties/facets",
    operationId: "propertyFacets",
    summary: "Facet counts for the current filter",
    permission: null,
    idempotency: false,
    request: { query: T.PropertyFilters },
    response: FacetsResponse,
  },
  {
    method: "get",
    path: "/v1/properties/:id",
    operationId: "getProperty",
    summary: "Property detail",
    permission: null,
    idempotency: false,
    request: { params: IdParam },
    response: T.dataOf(T.PropertyListing),
  },
  {
    method: "post",
    path: "/v1/properties",
    operationId: "createProperty",
    summary: "Create a listing draft",
    permission: "property_create",
    idempotency: false,
    request: { body: T.PropertyCreate },
    response: T.dataOf(T.PropertyListing),
  },
  {
    method: "patch",
    path: "/v1/properties/:id",
    operationId: "patchProperty",
    summary: "Partial listing update",
    permission: "property_update_own",
    idempotency: false,
    request: { params: IdParam, body: T.PropertyUpdate },
    response: T.dataOf(T.PropertyListing),
  },
  {
    method: "delete",
    path: "/v1/properties/:id",
    operationId: "deleteProperty",
    summary: "Soft-delete a listing",
    permission: "property_delete",
    idempotency: false,
    request: { params: IdParam },
    response: MessageResponse,
  },
  {
    method: "post",
    path: "/v1/properties/:id/submit",
    operationId: "submitProperty",
    summary: "Submit a draft for review",
    permission: "property_submit",
    idempotency: false,
    request: { params: IdParam },
    response: MessageResponse,
  },
  {
    method: "post",
    path: "/v1/properties/:id/withdraw",
    operationId: "withdrawProperty",
    summary: "Withdraw a listing",
    permission: "property_withdraw",
    idempotency: false,
    request: { params: IdParam },
    response: MessageResponse,
  },
  {
    method: "post",
    path: "/v1/properties/:id/publish",
    operationId: "publishProperty",
    summary: "Publish a reviewed listing (staff)",
    permission: "property_publish",
    idempotency: false,
    request: { params: IdParam },
    response: MessageResponse,
  },
  {
    method: "post",
    path: "/v1/properties/:id/reject",
    operationId: "rejectProperty",
    summary: "Reject a listing (staff)",
    permission: "property_publish",
    idempotency: false,
    request: { params: IdParam },
    response: MessageResponse,
  },
  {
    method: "get",
    path: "/v1/properties/:id/media",
    operationId: "listPropertyMedia",
    summary: "Listing media",
    permission: "property_update_own",
    idempotency: false,
    request: { params: IdParam },
    response: T.pageOf(T.PropertyMedia),
  },
  {
    method: "post",
    path: "/v1/properties/:id/media",
    operationId: "addPropertyMedia",
    summary: "Attach a Cloudinary asset",
    permission: "property_update_own",
    idempotency: false,
    request: { params: IdParam, body: T.PropertyMediaCreate },
    response: T.dataOf(T.PropertyMedia),
  },
  {
    method: "patch",
    path: "/v1/properties/:id/media",
    operationId: "patchPropertyMedia",
    summary: "Edit media rows",
    permission: "property_update_own",
    idempotency: false,
    request: { params: IdParam, body: T.PropertyMediaCreate },
    response: MessageResponse,
  },
  {
    method: "delete",
    path: "/v1/properties/:id/media",
    operationId: "deletePropertyMedia",
    summary: "Remove media rows",
    permission: "property_update_own",
    idempotency: false,
    request: { params: IdParam },
    response: MessageResponse,
  },
  {
    method: "post",
    path: "/v1/properties/:id/media/reorder",
    operationId: "reorderPropertyMedia",
    summary: "Reorder gallery",
    permission: "property_update_own",
    idempotency: false,
    request: { params: IdParam, body: T.MediaReorder },
    response: MessageResponse,
  },
  {
    method: "get",
    path: "/v1/properties/:id/units",
    operationId: "listUnits",
    summary: "Units on a property",
    permission: "unit_create",
    idempotency: false,
    request: { params: IdParam },
    response: T.pageOf(UnitRow),
  },
  {
    method: "post",
    path: "/v1/properties/:id/units",
    operationId: "createUnit",
    summary: "Add a unit",
    permission: "unit_create",
    idempotency: false,
    request: { params: IdParam, body: UnitCreate },
    response: T.dataOf(UnitRow),
  },
  {
    method: "patch",
    path: "/v1/properties/:id/units",
    operationId: "patchUnits",
    summary: "Edit units",
    permission: "unit_create",
    idempotency: false,
    request: { params: IdParam, body: UnitCreate },
    response: MessageResponse,
  },
  {
    method: "delete",
    path: "/v1/properties/:id/units",
    operationId: "deleteUnits",
    summary: "Remove units",
    permission: "unit_create",
    idempotency: false,
    request: { params: IdParam },
    response: MessageResponse,
  },
  {
    method: "get",
    path: "/v1/properties/:id/land",
    operationId: "getLandDetails",
    summary: "Land parcel details",
    permission: "unit_update_own",
    idempotency: false,
    request: { params: IdParam },
    response: T.dataOf(T.LandDetails),
  },
  {
    method: "put",
    path: "/v1/properties/:id/land",
    operationId: "putLandDetails",
    summary: "Replace land details",
    permission: "unit_update_own",
    idempotency: false,
    request: { params: IdParam, body: T.LandDetailsCreate },
    response: T.dataOf(T.LandDetails),
  },
  {
    method: "post",
    path: "/v1/properties/:id/viewings",
    operationId: "requestViewing",
    summary: "Request a viewing",
    permission: "property_update_own",
    idempotency: false,
    request: { params: IdParam },
    response: MessageResponse,
  },
  // Owners + payout accounts
  {
    method: "get",
    path: "/v1/owners",
    operationId: "listOwners",
    summary: "Owner directory (staff)",
    permission: "owner_read_any",
    idempotency: false,
    request: {},
    response: T.pageOf(T.Owner),
  },
  {
    method: "post",
    path: "/v1/owners",
    operationId: "registerOwner",
    summary: "Register an owner",
    permission: "owner_register",
    idempotency: false,
    request: { body: T.OwnerRegistration },
    response: T.dataOf(T.Owner),
  },
  {
    method: "get",
    path: "/v1/owners/me",
    operationId: "getOwnOwner",
    summary: "Own owner record",
    permission: "owner_read_own",
    idempotency: false,
    request: {},
    response: T.dataOf(T.Owner),
  },
  {
    method: "get",
    path: "/v1/owners/:id",
    operationId: "getOwner",
    summary: "Owner detail",
    permission: "owner_read_own",
    idempotency: false,
    request: { params: IdParam },
    response: T.dataOf(T.Owner),
  },
  {
    method: "patch",
    path: "/v1/owners/:id",
    operationId: "patchOwner",
    summary: "Update an owner",
    permission: "owner_update_own",
    idempotency: false,
    request: { params: IdParam, body: OwnerPatch },
    response: T.dataOf(T.Owner),
  },
  {
    method: "post",
    path: "/v1/owners/:id/kyc/submit",
    operationId: "submitOwnerKyc",
    summary: "Submit KYC",
    permission: "owner_update_own",
    idempotency: false,
    request: { params: IdParam },
    response: MessageResponse,
  },
  {
    method: "post",
    path: "/v1/owners/:id/kyc/approve",
    operationId: "approveOwnerKyc",
    summary: "Approve KYC (staff)",
    permission: "owner_kyc_approve",
    idempotency: false,
    request: { params: IdParam },
    response: MessageResponse,
  },
  {
    method: "post",
    path: "/v1/owners/:id/documents",
    operationId: "uploadOwnerDocument",
    summary: "Attach an owner document",
    permission: "document_upload",
    idempotency: true,
    request: { params: IdParam, body: T.DocumentGenerate },
    response: T.dataOf(T.Document),
  },
  {
    method: "patch",
    path: "/v1/owners/:id/documents",
    operationId: "patchOwnerDocument",
    summary: "Edit an owner document",
    permission: "document_upload",
    idempotency: false,
    request: { params: IdParam },
    response: MessageResponse,
  },
  {
    method: "delete",
    path: "/v1/owners/:id/documents",
    operationId: "deleteOwnerDocument",
    summary: "Remove an owner document",
    permission: "document_upload",
    idempotency: false,
    request: { params: IdParam },
    response: MessageResponse,
  },
  {
    method: "post",
    path: "/v1/payout-accounts",
    operationId: "createPayoutAccount",
    summary: "Add a settlement account",
    permission: "owner_update_own",
    idempotency: false,
    request: { body: T.PayoutAccountCreate },
    response: T.dataOf(T.PayoutAccount),
  },
  {
    method: "patch",
    path: "/v1/payout-accounts/:id",
    operationId: "patchPayoutAccount",
    summary: "Edit a settlement account",
    permission: "owner_update_own",
    idempotency: false,
    request: { params: IdParam },
    response: T.dataOf(T.PayoutAccount),
  },
  {
    method: "delete",
    path: "/v1/payout-accounts/:id",
    operationId: "deletePayoutAccount",
    summary: "Remove a settlement account",
    permission: "owner_update_own",
    idempotency: false,
    request: { params: IdParam },
    response: MessageResponse,
  },
  {
    method: "post",
    path: "/v1/payout-accounts/:id/verify",
    operationId: "verifyPayoutAccount",
    summary: "Verify a settlement account",
    permission: "owner_update_own",
    idempotency: false,
    request: { params: IdParam },
    response: MessageResponse,
  },
  // Contracts
  {
    method: "get",
    path: "/v1/contracts",
    operationId: "listContracts",
    summary: "Contracts visible to the caller",
    permission: "contract_read_own",
    idempotency: false,
    request: {},
    response: T.pageOf(T.ContractSummary),
  },
  {
    method: "post",
    path: "/v1/contracts",
    operationId: "createContract",
    summary: "Draft a lease",
    permission: "contract_create",
    idempotency: false,
    request: { body: T.LeaseCreate },
    response: T.dataOf(T.ContractSummary),
  },
  {
    method: "get",
    path: "/v1/contracts/:id",
    operationId: "getContract",
    summary: "Contract detail",
    permission: "contract_read_own",
    idempotency: false,
    request: { params: IdParam },
    response: T.dataOf(T.ContractSummary),
  },
  {
    method: "patch",
    path: "/v1/contracts/:id",
    operationId: "patchContract",
    summary: "Edit a draft contract",
    permission: "contract_update",
    idempotency: false,
    request: { params: IdParam, body: ContractPatch },
    response: T.dataOf(T.ContractSummary),
  },
  {
    method: "post",
    path: "/v1/contracts/:id/activate",
    operationId: "activateContract",
    summary: "Activate an approved contract",
    permission: "contract_update",
    idempotency: true,
    request: { params: IdParam, body: T.LifecycleAction },
    response: T.dataOf(T.ContractSummary),
  },
  {
    method: "post",
    path: "/v1/contracts/:id/suspend",
    operationId: "suspendContract",
    summary: "Suspend a contract",
    permission: "contract_suspend",
    idempotency: true,
    request: { params: IdParam, body: T.LifecycleAction },
    response: T.dataOf(T.ContractSummary),
  },
  {
    method: "post",
    path: "/v1/contracts/:id/terminate",
    operationId: "terminateContract",
    summary: "Terminate a contract",
    permission: "contract_terminate",
    idempotency: true,
    request: { params: IdParam, body: T.LifecycleAction },
    response: T.dataOf(T.ContractSummary),
  },
  {
    method: "post",
    path: "/v1/contracts/:id/renew",
    operationId: "renewContract",
    summary: "Renew into a successor",
    permission: "contract_renew",
    idempotency: true,
    request: { params: IdParam, body: T.LifecycleAction },
    response: T.dataOf(T.ContractSummary),
  },
  {
    method: "get",
    path: "/v1/contracts/:id/parties",
    operationId: "listContractParties",
    summary: "Contract parties",
    permission: "contract_read_own",
    idempotency: false,
    request: { params: IdParam },
    response: T.pageOf(T.ContractParty),
  },
  {
    method: "post",
    path: "/v1/contracts/:id/parties",
    operationId: "addContractParty",
    summary: "Add a party",
    permission: "contract_create",
    idempotency: false,
    request: { params: IdParam, body: T.ContractPartyCreate },
    response: T.dataOf(T.ContractParty),
  },
  {
    method: "get",
    path: "/v1/contracts/:id/schedule",
    operationId: "getContractSchedule",
    summary: "Billing schedule",
    permission: "contract_read_own",
    idempotency: false,
    request: { params: IdParam },
    response: T.pageOf(T.ContractScheduleRow),
  },
  {
    method: "get",
    path: "/v1/contracts/:id/events",
    operationId: "getContractEvents",
    summary: "Lifecycle timeline",
    permission: "contract_read_own",
    idempotency: false,
    request: { params: IdParam },
    response: T.pageOf(ContractEventRow),
  },
  {
    method: "get",
    path: "/v1/contracts/:id/payments",
    operationId: "listContractPayments",
    summary: "Payment intents on a contract",
    permission: "payment_create_own",
    idempotency: false,
    request: { params: IdParam },
    response: T.pageOf(T.PaymentIntent),
  },
  {
    method: "post",
    path: "/v1/contracts/:id/payments",
    operationId: "createContractPayment",
    summary: "Open a payment intent",
    permission: "payment_create_own",
    idempotency: true,
    request: { params: IdParam, body: T.PaymentIntentCreate },
    response: T.dataOf(T.PaymentIntent),
  },
  {
    method: "get",
    path: "/v1/contracts/:id/documents",
    operationId: "listContractDocuments",
    summary: "Contract documents",
    permission: "contract_read_own",
    idempotency: false,
    request: { params: IdParam },
    response: T.pageOf(T.Document),
  },
  {
    method: "post",
    path: "/v1/contracts/:id/documents",
    operationId: "generateContractDocument",
    summary: "Generate a document",
    permission: "document_generate",
    idempotency: true,
    request: { params: IdParam, body: T.DocumentGenerate },
    response: T.dataOf(T.Document),
  },
  {
    method: "get",
    path: "/v1/contracts/:id/disputes",
    operationId: "listContractDisputes",
    summary: "Disputes on a contract",
    permission: "dispute_read_own",
    idempotency: false,
    request: { params: IdParam },
    response: T.pageOf(T.Dispute),
  },
  {
    method: "post",
    path: "/v1/contracts/:id/disputes",
    operationId: "openContractDispute",
    summary: "Open a dispute",
    permission: "dispute_create",
    idempotency: false,
    request: { params: IdParam, body: T.DisputeCreate },
    response: T.dataOf(T.Dispute),
  },
  // Money
  {
    method: "get",
    path: "/v1/payments",
    operationId: "listPayments",
    summary: "Ledger entries visible to the caller",
    permission: "payment_read_own",
    idempotency: false,
    request: {},
    response: T.pageOf(T.LedgerEntry),
  },
  {
    method: "get",
    path: "/v1/payments/:id",
    operationId: "getPayment",
    summary: "Payment receipt drill-down",
    permission: "payment_read_own",
    idempotency: false,
    request: { params: IdParam },
    response: T.dataOf(T.PaymentReceipt),
  },
  {
    method: "get",
    path: "/v1/payments/:id/allocations",
    operationId: "getPaymentAllocations",
    summary: "Ledger splits",
    permission: "payment_read_any",
    idempotency: false,
    request: { params: IdParam },
    response: T.pageOf(T.LedgerAllocation),
  },
  {
    method: "post",
    path: "/v1/payments/:id/verify",
    operationId: "verifyPayment",
    summary: "Verify a payment with Paystack",
    permission: "payment_create_own",
    idempotency: true,
    request: { params: IdParam },
    response: T.dataOf(T.PaymentIntent),
  },
  {
    method: "post",
    path: "/v1/payment-intents",
    operationId: "createPaymentIntent",
    summary: "Open a payment intent",
    permission: "payment_create_own",
    idempotency: true,
    request: { body: T.PaymentIntentCreate },
    response: T.dataOf(T.PaymentIntent),
  },
  {
    method: "get",
    path: "/v1/payment-intents/:id",
    operationId: "getPaymentIntent",
    summary: "Intent status",
    permission: "payment_create_own",
    idempotency: false,
    request: { params: IdParam },
    response: T.dataOf(T.PaymentIntent),
  },
  {
    method: "post",
    path: "/v1/payments/:id/refund",
    operationId: "refundPayment",
    summary: "Request a refund",
    permission: "payment_refund",
    idempotency: true,
    request: { params: IdParam, body: T.RefundCreate },
    response: T.dataOf(T.Refund),
  },
  {
    method: "get",
    path: "/v1/payments/reconciliation",
    operationId: "getReconciliation",
    summary: "Reconciliation summary (staff)",
    permission: "payment_read_any",
    idempotency: false,
    request: {},
    response: T.dataOf(ReconciliationSummary),
  },
  {
    method: "get",
    path: "/v1/ledger/accounts/:id",
    operationId: "getLedgerAccount",
    summary: "Owner ledger balances",
    permission: "payment_read_any",
    idempotency: false,
    request: { params: IdParam },
    response: T.dataOf(T.OwnerBalances),
  },
  // Payouts
  {
    method: "get",
    path: "/v1/payouts",
    operationId: "listPayouts",
    summary: "Payouts visible to the caller",
    permission: "payout_read_own",
    idempotency: false,
    request: {},
    response: T.pageOf(T.Payout),
  },
  {
    method: "get",
    path: "/v1/payouts/:id",
    operationId: "getPayout",
    summary: "Payout detail",
    permission: "payout_read_own",
    idempotency: false,
    request: { params: IdParam },
    response: T.dataOf(T.Payout),
  },
  {
    method: "post",
    path: "/v1/payouts/runs",
    operationId: "runPayouts",
    summary: "Build a payout run (approve separately)",
    permission: "payout_run",
    idempotency: true,
    request: { body: T.PayoutRunCreate },
    response: T.dataOf(T.Payout),
  },
  {
    method: "get",
    path: "/v1/payouts/runs/:id",
    operationId: "getPayoutRun",
    summary: "Payout run detail",
    permission: "payout_approve",
    idempotency: false,
    request: { params: IdParam },
    response: T.dataOf(T.Payout),
  },
  {
    method: "post",
    path: "/v1/payouts/:id/approve",
    operationId: "approvePayout",
    summary: "Approve a payout",
    permission: "payout_approve",
    idempotency: true,
    request: { params: IdParam },
    response: T.dataOf(T.Payout),
  },
  {
    method: "post",
    path: "/v1/payouts/:id/initiate",
    operationId: "initiatePayout",
    summary: "Initiate transfer",
    permission: "payout_initiate",
    idempotency: true,
    request: { params: IdParam },
    response: T.dataOf(T.Payout),
  },
  // Maintenance
  {
    method: "get",
    path: "/v1/tickets",
    operationId: "listTickets",
    summary: "Tickets visible to the caller",
    permission: "ticket_read_own",
    idempotency: false,
    request: {},
    response: T.pageOf(T.Ticket),
  },
  {
    method: "post",
    path: "/v1/tickets",
    operationId: "createTicket",
    summary: "Raise a ticket",
    permission: "ticket_create_own",
    idempotency: false,
    request: { body: T.TicketCreate },
    response: T.dataOf(T.Ticket),
  },
  {
    method: "get",
    path: "/v1/tickets/:id",
    operationId: "getTicket",
    summary: "Ticket detail",
    permission: "ticket_read_own",
    idempotency: false,
    request: { params: IdParam },
    response: T.dataOf(T.Ticket),
  },
  {
    method: "patch",
    path: "/v1/tickets/:id",
    operationId: "patchTicket",
    summary: "Triage a ticket",
    permission: "ticket_manage",
    idempotency: false,
    request: { params: IdParam, body: TicketPatch },
    response: T.dataOf(T.Ticket),
  },
  {
    method: "post",
    path: "/v1/tickets/:id/updates",
    operationId: "addTicketUpdate",
    summary: "Append to the thread",
    permission: "ticket_create_own",
    idempotency: false,
    request: { params: IdParam, body: T.TicketUpdateCreate },
    response: T.dataOf(T.TicketUpdate),
  },
  {
    method: "post",
    path: "/v1/tickets/:id/quote",
    operationId: "quoteTicket",
    summary: "Record a quote",
    permission: "ticket_manage",
    idempotency: false,
    request: { params: IdParam, body: T.TicketQuote },
    response: MessageResponse,
  },
  {
    method: "post",
    path: "/v1/tickets/:id/approve-cost",
    operationId: "approveTicketCost",
    summary: "Approve quoted cost",
    permission: "ticket_approve_cost",
    idempotency: false,
    request: { params: IdParam },
    response: MessageResponse,
  },
  {
    method: "post",
    path: "/v1/tickets/:id/resolve",
    operationId: "resolveTicket",
    summary: "Resolve a ticket",
    permission: "ticket_manage",
    idempotency: false,
    request: { params: IdParam, body: T.TicketResolve },
    response: T.dataOf(T.Ticket),
  },
  // Documents, notices, disputes, search, admin
  {
    method: "get",
    path: "/v1/documents/:id",
    operationId: "getDocument",
    summary: "Document detail",
    permission: "document_read_own",
    idempotency: false,
    request: { params: IdParam },
    response: T.dataOf(T.Document),
  },
  {
    method: "get",
    path: "/v1/documents/:id/download",
    operationId: "downloadDocument",
    summary: "Download link",
    permission: "document_read_own",
    idempotency: false,
    request: { params: IdParam },
    response: T.dataOf(DownloadLink),
  },
  {
    method: "post",
    path: "/v1/documents/:id/release",
    operationId: "releaseDocument",
    summary: "Release a document",
    permission: "document_release",
    idempotency: true,
    request: { params: IdParam, body: T.DocumentRelease },
    response: T.dataOf(T.Document),
  },
  {
    method: "get",
    path: "/v1/notices",
    operationId: "listNotices",
    summary: "Own notices",
    permission: "notice_read_own",
    idempotency: false,
    request: {},
    response: T.pageOf(T.Notice),
  },
  {
    method: "post",
    path: "/v1/notices",
    operationId: "composeNotice",
    summary: "Compose a notice (staff)",
    permission: "notice_send",
    idempotency: false,
    request: { body: T.NoticeCompose },
    response: T.dataOf(T.Notice),
  },
  {
    method: "get",
    path: "/v1/disputes",
    operationId: "listDisputes",
    summary: "Own disputes",
    permission: "dispute_read_own",
    idempotency: false,
    request: {},
    response: T.pageOf(T.Dispute),
  },
  {
    method: "post",
    path: "/v1/disputes",
    operationId: "createDispute",
    summary: "Open a dispute",
    permission: "dispute_create",
    idempotency: false,
    request: { body: T.DisputeCreate },
    response: T.dataOf(T.Dispute),
  },
  {
    method: "get",
    path: "/v1/disputes/:id",
    operationId: "getDispute",
    summary: "Dispute detail",
    permission: "dispute_read_own",
    idempotency: false,
    request: { params: IdParam },
    response: T.dataOf(T.Dispute),
  },
  {
    method: "patch",
    path: "/v1/disputes/:id",
    operationId: "patchDispute",
    summary: "Resolve a dispute",
    permission: "dispute_resolve",
    idempotency: false,
    request: { params: IdParam, body: DisputePatch },
    response: T.dataOf(T.Dispute),
  },
  {
    method: "get",
    path: "/v1/saved-searches",
    operationId: "listSavedSearches",
    summary: "Saved searches",
    permission: "saved_search_manage",
    idempotency: false,
    request: {},
    response: T.pageOf(SavedSearchRow),
  },
  {
    method: "post",
    path: "/v1/saved-searches",
    operationId: "createSavedSearch",
    summary: "Save a search",
    permission: "saved_search_manage",
    idempotency: false,
    request: { body: SavedSearchCreate },
    response: T.dataOf(SavedSearchRow),
  },
  {
    method: "delete",
    path: "/v1/saved-searches",
    operationId: "deleteSavedSearches",
    summary: "Delete saved searches",
    permission: "saved_search_manage",
    idempotency: false,
    request: { body: SavedSearchDelete },
    response: MessageResponse,
  },
  {
    method: "get",
    path: "/v1/admin/filter-views",
    operationId: "listFilterViews",
    summary: "Shared filter views",
    permission: "client_filter_manage",
    idempotency: false,
    request: {},
    response: T.pageOf(T.AdminFilterView),
  },
  {
    method: "post",
    path: "/v1/admin/filter-views",
    operationId: "createFilterView",
    summary: "Save a filter view",
    permission: "client_filter_manage",
    idempotency: false,
    request: { body: T.AdminFilterViewCreate },
    response: T.dataOf(T.AdminFilterView),
  },
  {
    method: "get",
    path: "/v1/admin/dashboard",
    operationId: "getDashboard",
    summary: "Staff dashboard",
    permission: "admin_dashboard_read",
    idempotency: false,
    request: {},
    response: T.dataOf(T.AdminDashboard),
  },
  {
    method: "get",
    path: "/v1/admin/audit",
    operationId: "listAudit",
    summary: "Audit trail",
    permission: "audit_read",
    idempotency: false,
    request: {},
    response: T.pageOf(T.AuditEntry),
  },
  {
    method: "get",
    path: "/v1/admin/users",
    operationId: "listAdminUsers",
    summary: "User directory",
    permission: "user_manage",
    idempotency: false,
    request: {},
    response: T.pageOf(T.AdminUser),
  },
  {
    method: "patch",
    path: "/v1/admin/users/:id/roles",
    operationId: "patchAdminUserRoles",
    summary: "Set user roles",
    permission: "user_manage",
    idempotency: false,
    request: { params: IdParam, body: T.AdminUserRolesPatch },
    response: T.dataOf(T.AdminUser),
  },
  {
    method: "post",
    path: "/v1/admin/users/invite",
    operationId: "inviteAdminUser",
    summary: "Invite a staff user",
    permission: "user_manage",
    idempotency: false,
    request: { body: AdminInvite },
    response: T.dataOf(InvitedUser),
  },
  {
    method: "post",
    path: "/v1/admin/users/:id/suspend",
    operationId: "suspendAdminUser",
    summary: "Suspend a user",
    permission: "user_manage",
    idempotency: false,
    request: { params: IdParam },
    response: T.dataOf(SuspendedUser),
  },
  // System + integrations
  {
    method: "get",
    path: "/health",
    operationId: "health",
    summary: "Liveness (no auth, no DB)",
    permission: null,
    idempotency: false,
    request: {},
    response: HealthResponse,
  },
  {
    method: "get",
    path: "/health/ready",
    operationId: "ready",
    summary: "Readiness (DB + queue depth)",
    permission: null,
    idempotency: false,
    request: {},
    response: ReadyResponse,
  },
  {
    method: "post",
    path: "/v1/integrations/sms/outbound",
    operationId: "smsOutboundHook",
    summary: "Supabase Send SMS hook",
    permission: null,
    idempotency: false,
    request: {},
    response: MessageResponse,
  },
  {
    method: "post",
    path: "/v1/integrations/paystack/webhook",
    operationId: "paystackWebhook",
    summary: "Paystack events",
    permission: null,
    idempotency: false,
    request: { body: T.PaystackWebhook },
    response: MessageResponse,
  },
  {
    method: "post",
    path: "/v1/integrations/resend/events",
    operationId: "resendEvents",
    summary: "Resend delivery events",
    permission: null,
    idempotency: false,
    request: { body: T.ResendWebhook },
    response: MessageResponse,
  },
  {
    method: "post",
    path: "/v1/internal/jobs/:name/enqueue",
    operationId: "enqueueJob",
    summary: "Enqueue a job (cron token)",
    permission: null,
    idempotency: false,
    request: { params: z.strictObject({ name: z.string() }), body: JobEnqueue },
    response: MessageResponse,
  },
  {
    method: "get",
    path: "/v1/internal/queues",
    operationId: "queueDepth",
    summary: "Queue depth",
    permission: null,
    idempotency: false,
    request: {},
    response: T.dataOf(QueueDepth),
  },
  {
    method: "get",
    path: "/v1/internal/metrics",
    operationId: "metrics",
    summary: "Prometheus scrape",
    permission: null,
    idempotency: false,
    request: {},
    response: MessageResponse,
  },
];

function openApiPath(path: string): string {
  return path.replace(/:([A-Za-z]+)/g, (_m, name: string) => `{${name}}`);
}

export interface OpenApiDocument {
  openapi: string;
  info: { title: string; version: string };
  servers: { url: string }[];
  paths: Record<string, Record<string, unknown>>;
  components: { schemas: Record<string, unknown> };
}

export function buildOpenApiSpec(endpoints: EndpointDef[] = ENDPOINTS): OpenApiDocument {
  const seen = new Set<string>();
  const paths: Record<string, Record<string, unknown>> = {};
  const schemas: Record<string, unknown> = {
    Problem: toSchemaObject(T.Problem),
  };
  const register = (name: string, schema: z.ZodType): Record<string, unknown> => {
    if (!schemas[name]) schemas[name] = toSchemaObject(schema);
    return { $ref: `#/components/schemas/${name}` };
  };
  let auto = 0;
  const named = (schema: z.ZodType, hint: string): Record<string, unknown> => {
    auto += 1;
    return register(`${hint}${auto}`, schema);
  };

  for (const endpoint of endpoints) {
    const key = `${endpoint.method} ${endpoint.path}`;
    if (seen.has(key)) throw new Error(`duplicate endpoint ${key}`);
    seen.add(key);
    if (!endpoint.response) throw new Error(`endpoint ${key} has no response schema`);
    if (!endpoint.request) throw new Error(`endpoint ${key} has no request schema`);
    if (!endpoint.operationId) throw new Error(`endpoint ${key} has no operationId`);

    const oasPath = openApiPath(endpoint.path);
    const operation: Record<string, unknown> = {
      operationId: endpoint.operationId,
      summary: endpoint.summary,
      responses: {},
    };
    if (endpoint.permission) operation["x-permission"] = endpoint.permission;
    const parameters: unknown[] = [];
    const paramsShape = shapeOf(endpoint.request.params);
    if (paramsShape) parameters.push(...parametersOf(paramsShape, "path"));
    const queryShape = shapeOf(endpoint.request.query);
    if (queryShape) parameters.push(...parametersOf(queryShape, "query"));
    if (endpoint.idempotency) {
      parameters.push({
        name: "Idempotency-Key",
        in: "header",
        required: true,
        schema: { type: "string", format: "uuid" },
      });
    }
    if (parameters.length > 0) operation.parameters = parameters;
    if (endpoint.request.body) {
      operation.requestBody = {
        required: true,
        content: {
          "application/json": { schema: named(endpoint.request.body, endpoint.operationId) },
        },
      };
    }
    const status = String(endpoint.status ?? defaultStatus(endpoint.method));
    (operation.responses as Record<string, unknown>)[status] = {
      description: endpoint.summary,
      content: {
        "application/json": { schema: named(endpoint.response, endpoint.operationId) },
      },
    };
    (operation.responses as Record<string, unknown>).default = {
      description: "Error envelope",
      content: { "application/json": { $ref: "#/components/schemas/Problem" } },
    };
    if (!paths[oasPath]) paths[oasPath] = {};
    (paths[oasPath] as Record<string, unknown>)[endpoint.method] = operation;
  }

  return {
    openapi: "3.1.0",
    info: { title: "Courtland API", version: "1.0.0" },
    servers: [{ url: "https://api.courtland.com.ng/v1" }],
    paths,
    components: { schemas },
  };
}

export function renderOpenApiSpec(): string {
  return `${JSON.stringify(buildOpenApiSpec(), null, 2)}\n`;
}

const invokedAs = process.argv[1] === undefined ? "" : path.resolve(process.argv[1]);
if (invokedAs === fileURLToPath(import.meta.url)) {
  const outPath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../../docs/openapi/courtland.json",
  );
  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, renderOpenApiSpec(), "utf8");
  console.log(`wrote ${outPath} (${ENDPOINTS.length} endpoints)`);
}
