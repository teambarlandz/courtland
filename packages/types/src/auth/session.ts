// auth/session.ts — session bootstrap (docs/08 §5.1, §10 verify/me/link/change-phone).
import { z } from "zod";
import { Profile } from "./profile.ts";

const NG_PHONE = /^\+234[0-9]{10}$/;

export const VerifyResponse = z.strictObject({
  profile: Profile,
  redirectTo: z.string(),
});
export type VerifyResponse = z.infer<typeof VerifyResponse>;

export const CsrfResponse = z.strictObject({
  csrfToken: z.string(),
});
export type CsrfResponse = z.infer<typeof CsrfResponse>;

export const LinkOwner = z.strictObject({
  phoneE164: z.string().regex(NG_PHONE),
});
export type LinkOwner = z.infer<typeof LinkOwner>;

export const ChangePhone = z.strictObject({
  newPhoneE164: z.string().regex(NG_PHONE),
  code: z.string().regex(/^[0-9]{6}$/),
});
export type ChangePhone = z.infer<typeof ChangePhone>;
