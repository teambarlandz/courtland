// payment/receipt.ts — payment receipt view (ledger + allocations + contract).
import { z } from "zod";
import { DateTimeZ } from "../common/dates.ts";
import { LedgerStatus, PaymentKind } from "../common/enums.ts";
import { Money } from "../common/money.ts";
import { LedgerAllocation } from "./allocation.ts";

export const PaymentReceipt = z.strictObject({
  paymentId: z.uuid(),
  reference: z.string(),
  kind: PaymentKind,
  status: LedgerStatus,
  gross: Money,
  paystackFee: Money,
  net: Money,
  paidAt: DateTimeZ.nullable(),
  allocations: z.array(LedgerAllocation),
});
export type PaymentReceipt = z.infer<typeof PaymentReceipt>;
