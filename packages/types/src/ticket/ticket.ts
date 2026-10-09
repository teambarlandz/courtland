// ticket/ticket.ts — maintenance tickets (DB maintenance_tickets).
import { z } from "zod";
import { TicketPriority, TicketStatus } from "../common/enums.ts";

const NG_PHONE = /^\+234[0-9]{10}$/;

export const TicketCreate = z.strictObject({
  propertyId: z.uuid(),
  unitId: z.uuid().optional(),
  category: z.string().min(1).max(80),
  priority: TicketPriority.default("medium"),
  title: z.string().min(4).max(200),
  description: z.string().min(1).max(4000),
  permissionToEnter: z.boolean().default(false),
});
export type TicketCreate = z.infer<typeof TicketCreate>;

export const Ticket = z.strictObject({
  id: z.uuid(),
  reference: z.string(),
  propertyId: z.uuid(),
  unitId: z.uuid().nullable(),
  raisedBy: z.uuid(),
  category: z.string(),
  priority: TicketPriority,
  title: z.string(),
  description: z.string(),
  status: TicketStatus,
  permissionToEnter: z.boolean(),
  quotedAmountKobo: z.number().int().min(0).nullable(),
  contractorName: z.string().nullable(),
  contractorPhoneE164: z.string().regex(NG_PHONE).nullable(),
  resolutionNote: z.string().nullable(),
});
export type Ticket = z.infer<typeof Ticket>;
