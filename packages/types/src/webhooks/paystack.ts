// webhooks/paystack.ts — Paystack event payloads (docs/10 §4.3-4.4).
// Only the fields the handlers read are strict; provider envelopes use loose
// objects because Paystack adds fields without warning and an unknown field
// must never turn a delivery into a 500. Unhandled event types still return
// 200 (docs/10 §4.5), so the union ends with an unknown-event passthrough.
import { z } from "zod";

export const PaystackEventName = z.enum([
  "charge.success",
  "charge.failed",
  "transfer.success",
  "transfer.failed",
  "transfer.reversed",
  "customer.created",
]);
export type PaystackEventName = z.infer<typeof PaystackEventName>;

export const PaystackPaymentMetadata = z.looseObject({
  payment_id: z.string().optional(),
  contract_id: z.string().optional(),
  purpose: z.enum(["rent", "deposit", "sale", "general"]).optional(),
  schedule_seqs: z.string().optional(),
});
export type PaystackPaymentMetadata = z.infer<typeof PaystackPaymentMetadata>;

export const PaystackChargeData = z.looseObject({
  id: z.union([z.string(), z.number()]),
  reference: z.string(),
  channel: z.enum(["card", "bank", "ussd", "bank_transfer", "mobile_money"]).optional(),
  paid_at: z.string().optional(),
  metadata: PaystackPaymentMetadata.optional(),
});
export type PaystackChargeData = z.infer<typeof PaystackChargeData>;

export const ChargeSuccess = z.looseObject({
  event: z.literal("charge.success"),
  data: PaystackChargeData,
});
export const ChargeFailed = z.looseObject({
  event: z.literal("charge.failed"),
  data: PaystackChargeData,
});
export const TransferEvent = z.looseObject({
  event: z.enum(["transfer.success", "transfer.failed", "transfer.reversed"]),
  data: z.looseObject({ reference: z.string() }),
});
export const CustomerCreated = z.looseObject({
  event: z.literal("customer.created"),
  data: z.looseObject({}),
});
export const UnknownPaystackEvent = z.looseObject({
  event: z.string(),
  data: z.unknown(),
});

export const PaystackWebhook = z.union([
  ChargeSuccess,
  ChargeFailed,
  TransferEvent,
  CustomerCreated,
  UnknownPaystackEvent,
]);
export type PaystackWebhook = z.infer<typeof PaystackWebhook>;
