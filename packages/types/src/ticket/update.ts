// ticket/update.ts — ticket thread entries (DB ticket_updates).
import { z } from "zod";
import { TicketVisibility } from "../common/enums.ts";

export const TicketUpdateCreate = z.strictObject({
  body: z.string().min(1).max(4000),
  visibility: TicketVisibility.default("shared"),
  attachmentPublicId: z.string().optional(),
});
export type TicketUpdateCreate = z.infer<typeof TicketUpdateCreate>;

export const TicketUpdate = z.strictObject({
  id: z.uuid(),
  ticketId: z.uuid(),
  authorId: z.uuid(),
  body: z.string(),
  visibility: TicketVisibility,
  attachmentPublicId: z.string().nullable(),
});
export type TicketUpdate = z.infer<typeof TicketUpdate>;
