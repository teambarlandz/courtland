// contract/lease.ts — lease input/output (DB contracts kind=lease; docs/09 §2).
import { z } from "zod";
import { DateOnly } from "../common/dates.ts";
import { ContractStatus, LateFeePolicy, PaymentPlan } from "../common/enums.ts";
import { KoboAmount } from "../common/money.ts";

export const LeaseCreate = z.strictObject({
  propertyId: z.uuid(),
  unitId: z.uuid().optional(),
  primaryPayerId: z.uuid(),
  startDate: DateOnly,
  endDate: DateOnly.optional(),
  rentKobo: KoboAmount,
  rentCadenceMonths: z.number().int().min(1).max(12).default(12),
  serviceChargeKobo: KoboAmount.default(0),
  securityDepositKobo: KoboAmount.default(0),
  agreementFeeKobo: KoboAmount.default(0),
  lateFeePolicy: LateFeePolicy.default("none"),
  lateFeeValue: KoboAmount.default(0),
  graceDays: z.number().int().min(0).max(90).default(3),
  notes: z.string().max(2000).optional(),
});
export type LeaseCreate = z.infer<typeof LeaseCreate>;

export const ContractSummary = z.strictObject({
  id: z.uuid(),
  reference: z.string(),
  kind: z.string(),
  status: ContractStatus,
  propertyId: z.uuid(),
  unitId: z.uuid().nullable(),
  ownerId: z.uuid(),
  primaryPayerId: z.uuid(),
  startDate: DateOnly.nullable(),
  endDate: DateOnly.nullable(),
  totalKobo: KoboAmount,
  outstandingKobo: KoboAmount,
  currency: z.string(),
});
export type ContractSummary = z.infer<typeof ContractSummary>;

export const PaymentPlanInput = z.strictObject({
  paymentPlan: PaymentPlan,
  installmentCount: z.number().int().min(2).max(60).optional(),
  installmentDayOfMonth: z.number().int().min(1).max(28).optional(),
});
export type PaymentPlanInput = z.infer<typeof PaymentPlanInput>;
