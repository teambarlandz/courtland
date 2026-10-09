// contract/schedule.ts — billing schedule rows (DB contract_schedule).
import { z } from "zod";
import { DateOnly, DateTimeZ } from "../common/dates.ts";
import { ScheduleKind, ScheduleStatus } from "../common/enums.ts";
import { KoboAmount } from "../common/money.ts";

export const ContractScheduleRow = z.strictObject({
  id: z.uuid(),
  contractId: z.uuid(),
  seq: z.number().int().min(1),
  kind: ScheduleKind,
  dueDate: DateOnly,
  amountKobo: KoboAmount,
  paidKobo: KoboAmount,
  status: ScheduleStatus,
  paidAt: DateTimeZ.nullable(),
  notes: z.string().nullable(),
});
export type ContractScheduleRow = z.infer<typeof ContractScheduleRow>;

export const ScheduleGenerate = z.strictObject({
  annualRentKobo: KoboAmount,
  startDate: DateOnly,
  months: z.number().int().min(1).max(60).default(12),
});
export type ScheduleGenerate = z.infer<typeof ScheduleGenerate>;
