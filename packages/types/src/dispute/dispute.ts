// dispute/dispute.ts — disputes (DB disputes; docs/08 §10).
import { z } from "zod";
import { DisputeStatus } from "../common/enums.ts";

export const DisputeCreate = z.strictObject({
  contractId: z.uuid().optional(),
  propertyId: z.uuid().optional(),
  unitId: z.uuid().optional(),
  category: z.string().min(1).max(80),
  description: z.string().min(1).max(4000),
});
export type DisputeCreate = z.infer<typeof DisputeCreate>;

export const Dispute = z.strictObject({
  id: z.uuid(),
  reference: z.string(),
  contractId: z.uuid().nullable(),
  propertyId: z.uuid().nullable(),
  unitId: z.uuid().nullable(),
  raisedBy: z.uuid(),
  category: z.string(),
  description: z.string(),
  status: DisputeStatus,
  resolution: z.string().nullable(),
});
export type Dispute = z.infer<typeof Dispute>;
