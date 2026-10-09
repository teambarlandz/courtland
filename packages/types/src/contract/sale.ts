// contract/sale.ts — outright and installment sale input (DB contracts kind=sale,
// sale_allocations; docs/09 §6-7).
import { z } from "zod";
import { DateOnly } from "../common/dates.ts";
import { AllocationSaleStatus } from "../common/enums.ts";
import { KoboAmount } from "../common/money.ts";

export const SaleCreate = z.strictObject({
  propertyId: z.uuid(),
  primaryPayerId: z.uuid(),
  totalKobo: KoboAmount,
  paymentPlan: z.enum(["outright", "installment"]),
  installmentCount: z.number().int().min(2).max(60).optional(),
  installmentDayOfMonth: z.number().int().min(1).max(28).optional(),
  depositKobo: KoboAmount.default(0),
  startDate: DateOnly.optional(),
  notes: z.string().max(2000).optional(),
});
export type SaleCreate = z.infer<typeof SaleCreate>;

export const SaleAllocation = z.strictObject({
  id: z.uuid(),
  reference: z.string(),
  propertyId: z.uuid(),
  buyerId: z.uuid().nullable(),
  buyerName: z.string(),
  buyerPhoneE164: z.string().nullable(),
  plotLabel: z.string(),
  sizeSqm: z.number().positive().nullable(),
  priceKobo: KoboAmount,
  depositPaidKobo: KoboAmount,
  status: AllocationSaleStatus,
});
export type SaleAllocation = z.infer<typeof SaleAllocation>;
