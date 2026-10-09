// payment/payout.ts — owner payout runs (DB payouts; docs/08 §10).
import { z } from "zod";
import { DateOnly, DateTimeZ } from "../common/dates.ts";
import { PayoutMethod, PayoutStatus } from "../common/enums.ts";
import { KoboAmount } from "../common/money.ts";

export const PayoutRunCreate = z.strictObject({
  ownerId: z.uuid(),
  periodStart: DateOnly,
  periodEnd: DateOnly,
  method: PayoutMethod.default("paystack_transfer"),
});
export type PayoutRunCreate = z.infer<typeof PayoutRunCreate>;

export const Payout = z.strictObject({
  id: z.uuid(),
  reference: z.string(),
  ownerId: z.uuid(),
  periodStart: DateOnly,
  periodEnd: DateOnly,
  currency: z.string(),
  grossKobo: KoboAmount,
  deductionsKobo: KoboAmount,
  carryForwardKobo: z.number().int(),
  netKobo: KoboAmount,
  status: PayoutStatus,
  method: PayoutMethod,
  allocationCount: z.number().int().min(0),
  initiatedAt: DateTimeZ.nullable(),
  approvedAt: DateTimeZ.nullable(),
  paidAt: DateTimeZ.nullable(),
  failureReason: z.string().nullable(),
});
export type Payout = z.infer<typeof Payout>;
