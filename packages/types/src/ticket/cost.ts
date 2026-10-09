// ticket/cost.ts — quote and cost approval (ticket quoted_amount_kobo flow).
import { z } from "zod";
import { KoboAmount } from "../common/money.ts";

export const TicketQuote = z.strictObject({
  quotedAmountKobo: KoboAmount,
  contractorName: z.string().max(200).optional(),
  contractorPhoneE164: z
    .string()
    .regex(/^\+234[0-9]{10}$/)
    .optional(),
});
export type TicketQuote = z.infer<typeof TicketQuote>;

export const TicketResolve = z.strictObject({
  resolutionNote: z.string().min(1).max(2000),
});
export type TicketResolve = z.infer<typeof TicketResolve>;
