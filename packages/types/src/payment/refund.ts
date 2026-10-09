// payment/refund.ts — refund requests (DB refunds).
import { z } from "zod";
import { KoboAmount } from "../common/money.ts";

export const RefundCreate = z.strictObject({
  paymentId: z.uuid(),
  amountKobo: KoboAmount,
  reason: z.string().min(1).max(1000),
});
export type RefundCreate = z.infer<typeof RefundCreate>;

export const Refund = z.strictObject({
  id: z.uuid(),
  paymentId: z.uuid(),
  requestedBy: z.uuid(),
  amountKobo: KoboAmount,
  reason: z.string(),
  status: z.string(),
  failureReason: z.string().nullable(),
});
export type Refund = z.infer<typeof Refund>;
