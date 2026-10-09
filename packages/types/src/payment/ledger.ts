// payment/ledger.ts — ledger rows (DB payments_ledger; net is generated).
import { z } from "zod";
import { DateTimeZ } from "../common/dates.ts";
import { LedgerStatus, PaymentChannel, PaymentKind } from "../common/enums.ts";
import { KoboAmount } from "../common/money.ts";

export const LedgerEntry = z.strictObject({
  id: z.uuid(),
  reference: z.string(),
  intentId: z.uuid(),
  contractId: z.uuid(),
  payerId: z.uuid(),
  ownerId: z.uuid(),
  kind: PaymentKind,
  amountKobo: KoboAmount,
  paystackFeeKobo: KoboAmount,
  netKobo: KoboAmount,
  currency: z.string(),
  status: LedgerStatus,
  channel: PaymentChannel.nullable(),
  paidAt: DateTimeZ.nullable(),
  refundedKobo: KoboAmount,
  createdAt: DateTimeZ,
});
export type LedgerEntry = z.infer<typeof LedgerEntry>;
