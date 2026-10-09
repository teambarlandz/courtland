// common/money.ts — wire representation of money (docs/08 §3).
// JSON carries integer kobo as a number (never string/float); currency is NGN-only in v1.
import { z } from "zod";

export const MAX_SAFE_KOBO = 9007199254740991;

export const KoboAmount = z.number().int().min(0).max(MAX_SAFE_KOBO);
export type KoboAmount = z.infer<typeof KoboAmount>;

export const Currency = z.literal("NGN");
export type Currency = z.infer<typeof Currency>;

export const Money = z.strictObject({
  amountKobo: KoboAmount,
  currency: Currency.default("NGN"),
});
export type Money = z.infer<typeof Money>;
