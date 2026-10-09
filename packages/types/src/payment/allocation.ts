// payment/allocation.ts — ledger splits (DB ledger_allocations).
import { z } from "zod";
import { AllocationBasis, AllocationStatus, BeneficiaryType } from "../common/enums.ts";
import { KoboAmount } from "../common/money.ts";

export const LedgerAllocation = z.strictObject({
  id: z.uuid(),
  paymentId: z.uuid(),
  beneficiaryType: BeneficiaryType,
  ownerId: z.uuid().nullable(),
  basis: AllocationBasis,
  amountKobo: KoboAmount,
  status: AllocationStatus,
  isPayable: z.boolean(),
  settledAt: z.string().nullable(),
  note: z.string().nullable(),
});
export type LedgerAllocation = z.infer<typeof LedgerAllocation>;
