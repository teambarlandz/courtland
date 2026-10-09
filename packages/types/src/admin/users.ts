// admin/users.ts — staff user administration (docs/08 §10 /v1/admin/users).
import { z } from "zod";
import { AppRole } from "../permissions/roles.ts";

export const AdminUser = z.strictObject({
  id: z.uuid(),
  email: z.string().nullable(),
  phoneE164: z.string().nullable(),
  fullName: z.string().nullable(),
  roles: z.array(AppRole),
});
export type AdminUser = z.infer<typeof AdminUser>;

export const AdminUserRolesPatch = z.strictObject({
  roles: z.array(AppRole).min(1),
});
export type AdminUserRolesPatch = z.infer<typeof AdminUserRolesPatch>;
