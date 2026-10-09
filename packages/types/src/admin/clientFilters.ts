// admin/clientFilters.ts — saved admin filter views (DB admin_filter_views).
import { z } from "zod";

export const AdminFilterView = z.strictObject({
  id: z.uuid(),
  ownerId: z.uuid().nullable(),
  name: z.string(),
  entity: z.string(),
  isShared: z.boolean(),
  columns: z.array(z.string()),
});
export type AdminFilterView = z.infer<typeof AdminFilterView>;

export const AdminFilterViewCreate = z.strictObject({
  name: z.string().min(1).max(200),
  entity: z.string().min(1).max(80),
  filters: z.record(z.string(), z.unknown()).default({}),
  columns: z.array(z.string().max(80)).default([]),
  isShared: z.boolean().default(false),
});
export type AdminFilterViewCreate = z.infer<typeof AdminFilterViewCreate>;
