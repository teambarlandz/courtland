// auth/otp.ts — phone OTP flows (docs/06 §3-4, docs/08 §10).
import { z } from "zod";

const NG_PHONE = /^\+234[0-9]{10}$/;

export const OtpRequest = z.strictObject({
  phoneE164: z.string().regex(NG_PHONE),
});
export type OtpRequest = z.infer<typeof OtpRequest>;

export const OtpVerify = z.strictObject({
  phoneE164: z.string().regex(NG_PHONE),
  code: z.string().regex(/^[0-9]{6}$/),
});
export type OtpVerify = z.infer<typeof OtpVerify>;

export const OtpResend = z.strictObject({
  phoneE164: z.string().regex(NG_PHONE),
});
export type OtpResend = z.infer<typeof OtpResend>;
