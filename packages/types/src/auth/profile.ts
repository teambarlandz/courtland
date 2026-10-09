// auth/profile.ts — the authenticated profile (docs/08 §10 GET/PATCH /v1/auth/me).
import { z } from "zod";
import { KycStatus, OnboardingState } from "../common/enums.ts";
import { AppRole } from "../permissions/roles.ts";
import { PermissionSlug } from "../permissions/slug.ts";

export const Profile = z.strictObject({
  id: z.uuid(),
  fullName: z.string().nullable(),
  email: z.string().nullable(),
  phoneE164: z.string().nullable(),
  avatarPublicId: z.string().nullable(),
  onboardingState: OnboardingState,
  kycStatus: KycStatus,
  roles: z.array(AppRole),
  permissions: z.array(PermissionSlug),
});
export type Profile = z.infer<typeof Profile>;

export const ProfilePatch = z
  .strictObject({
    fullName: z.string().min(1).max(200).nullable().optional(),
    avatarPublicId: z.string().nullable().optional(),
    whatsappOptIn: z.boolean().optional(),
    notificationPrefs: z.record(z.string(), z.boolean()).optional(),
  })
  .refine((p) => Object.keys(p).length > 0, { message: "empty PATCH is a no-op" });
export type ProfilePatch = z.infer<typeof ProfilePatch>;
