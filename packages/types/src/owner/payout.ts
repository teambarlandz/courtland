// owner/payout.ts — payout account management (DB paystack_accounts).
import { z } from "zod";

export const PayoutAccountCreate = z.strictObject({
  businessName: z.string().min(1).max(200),
  settlementBank: z.string().min(1).max(120),
  accountNumber: z.string().regex(/^[0-9]{10}$/),
  percentageChargeBps: z.number().int().min(0).max(10000).default(0),
  settlementSchedule: z.string().default("auto"),
});
export type PayoutAccountCreate = z.infer<typeof PayoutAccountCreate>;

export const PayoutAccount = z.strictObject({
  id: z.uuid(),
  ownerId: z.uuid(),
  subaccountCode: z.string(),
  businessName: z.string(),
  settlementBank: z.string(),
  accountNumber: z.string(),
  percentageChargeBps: z.number().int(),
  settlementSchedule: z.string(),
  isActive: z.boolean(),
});
export type PayoutAccount = z.infer<typeof PayoutAccount>;
