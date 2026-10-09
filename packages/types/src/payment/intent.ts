// payment/intent.ts — payment intent input/output (DB payment_intents).
import { z } from "zod";
import { DateOnly, DateTimeZ } from "../common/dates.ts";
import { PaymentIntentStatus, PaymentKind } from "../common/enums.ts";
import { Currency, MAX_SAFE_KOBO } from "../common/money.ts";

export const PaymentIntentCreate = z.strictObject({
  contractId: z.uuid(),
  scheduleId: z.uuid().optional(),
  kind: PaymentKind,
  amountKobo: z.number().int().min(1).max(MAX_SAFE_KOBO),
  currency: Currency.default("NGN"),
  dueDate: DateOnly.optional(),
  description: z.string().max(500).optional(),
  idempotencyKey: z.string().min(1).max(200).optional(),
});
export type PaymentIntentCreate = z.infer<typeof PaymentIntentCreate>;

export const PaymentIntent = z.strictObject({
  id: z.uuid(),
  contractId: z.uuid(),
  scheduleId: z.uuid().nullable(),
  payerId: z.uuid(),
  kind: PaymentKind,
  amountKobo: z.number().int().min(1).max(MAX_SAFE_KOBO),
  currency: z.string(),
  status: PaymentIntentStatus,
  dueDate: DateOnly.nullable(),
  description: z.string().nullable(),
  paystackReference: z.string().nullable(),
  expiresAt: DateTimeZ,
  createdAt: DateTimeZ,
});
export type PaymentIntent = z.infer<typeof PaymentIntent>;
