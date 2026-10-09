import { describe, expect, it } from "vitest";
import { OtpRequest, OtpVerify } from "./otp.ts";
import { ProfilePatch } from "./profile.ts";

describe("auth", () => {
  it.each(["+2348012345678"])("accepts phone %s", (phoneE164) => {
    expect(OtpRequest.parse({ phoneE164 }).phoneE164).toBe(phoneE164);
  });
  it.each(["08012345678", "+234801234567", "+1234567890123"])("rejects phone %s", (phoneE164) => {
    expect(() => OtpRequest.parse({ phoneE164 })).toThrow();
  });
  it("accepts a six-digit code, rejects anything else", () => {
    expect(OtpVerify.parse({ phoneE164: "+2348012345678", code: "123456" }).code).toBe("123456");
    expect(() => OtpVerify.parse({ phoneE164: "+2348012345678", code: "12345" })).toThrow();
  });
  it("rejects empty profile patches", () => {
    expect(() => ProfilePatch.parse({})).toThrow();
    expect(ProfilePatch.parse({ whatsappOptIn: true }).whatsappOptIn).toBe(true);
  });
});
