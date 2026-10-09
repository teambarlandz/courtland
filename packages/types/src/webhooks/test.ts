import { describe, expect, it } from "vitest";
import { CloudinaryNotification } from "./cloudinary.ts";
import { PaystackWebhook } from "./paystack.ts";
import { ResendWebhook } from "./resend.ts";

describe("webhooks", () => {
  it("parses a charge.success event", () => {
    const parsed = PaystackWebhook.parse({
      event: "charge.success",
      data: { id: "evt-1", reference: "ref-1", channel: "card" },
    });
    expect(parsed.event).toBe("charge.success");
  });
  it("passes unknown event types through (200, no retry)", () => {
    const parsed = PaystackWebhook.parse({ event: "invoice.created", data: { id: 7 } });
    expect(parsed.event).toBe("invoice.created");
  });
  it("parses a cloudinary notification loosely", () => {
    expect(
      CloudinaryNotification.parse({
        notification_type: "eager",
        public_id: "a/b",
        extra_new_field: 1,
      }),
    ).toMatchObject({ notification_type: "eager" });
  });
  it("parses resend bounce and complaint", () => {
    expect(ResendWebhook.parse({ type: "email.bounced", data: {} }).type).toBe("email.bounced");
    expect(ResendWebhook.parse({ type: "email.complained", data: {} }).type).toBe(
      "email.complained",
    );
  });
});
