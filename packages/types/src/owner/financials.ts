// owner/financials.ts — owner money views (DB owner_payout_summary view,
// owner_balances view).
import { z } from "zod";
import { KoboAmount } from "../common/money.ts";

export const OwnerPayoutSummary = z.strictObject({
  ownerId: z.uuid(),
  lifetimeEarnedKobo: KoboAmount,
  lifetimeFeesKobo: KoboAmount,
  lifetimeDeductionsKobo: KoboAmount,
  pendingPayoutKobo: KoboAmount,
  lifetimePaidKobo: KoboAmount,
});
export type OwnerPayoutSummary = z.infer<typeof OwnerPayoutSummary>;

export const OwnerBalances = z.strictObject({
  ownerId: z.uuid(),
  payableKobo: KoboAmount,
  heldKobo: KoboAmount,
});
export type OwnerBalances = z.infer<typeof OwnerBalances>;
