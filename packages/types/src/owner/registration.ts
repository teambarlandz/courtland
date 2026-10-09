// owner/registration.ts — owner onboarding (DB owners; docs/08 §10).
import { z } from "zod";
import { KycStatus, OwnerType } from "../common/enums.ts";

const NG_PHONE = /^\+234[0-9]{10}$/;

export const OwnerRegistration = z.strictObject({
  ownerType: OwnerType,
  legalName: z.string().min(1).max(200),
  businessName: z.string().max(200).optional(),
  email: z.email().optional(),
  phoneE164: z.string().regex(NG_PHONE).optional(),
  address: z.string().max(500).optional(),
  rcNumber: z.string().max(50).optional(),
});
export type OwnerRegistration = z.infer<typeof OwnerRegistration>;

export const Owner = z.strictObject({
  id: z.uuid(),
  reference: z.string(),
  userId: z.uuid().nullable(),
  ownerType: OwnerType,
  legalName: z.string(),
  businessName: z.string().nullable(),
  email: z.string().nullable(),
  phoneE164: z.string().nullable(),
  kycStatus: KycStatus,
  managementFeeBps: z.number().int().min(0).max(5000),
  commissionBps: z.number().int().min(0).max(5000),
  isActive: z.boolean(),
});
export type Owner = z.infer<typeof Owner>;
