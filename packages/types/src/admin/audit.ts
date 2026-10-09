// admin/audit.ts — audit trail reads (DB audit_log).
import { z } from "zod";
import { DateTimeZ } from "../common/dates.ts";

export const AuditEntry = z.strictObject({
  id: z.number().int(),
  actorId: z.uuid().nullable(),
  actorRole: z.string(),
  action: z.string(),
  entityType: z.string(),
  entityId: z.uuid().nullable(),
  changedKeys: z.array(z.string()).nullable(),
  ip: z.string().nullable(),
  requestId: z.string().nullable(),
  createdAt: DateTimeZ,
});
export type AuditEntry = z.infer<typeof AuditEntry>;
