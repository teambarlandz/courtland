import { describe, expect, it } from "vitest";
import { NoticeCompose } from "./compose.ts";

describe("notice", () => {
  it("accepts a composed notice", () => {
    expect(
      NoticeCompose.parse({
        kind: "rent_due",
        channel: "sms",
        recipientAddress: "+2348012345678",
        templateKey: "rent_due_v1",
      }).kind,
    ).toBe("rent_due");
  });
  it("rejects unknown channels", () => {
    expect(() =>
      NoticeCompose.parse({
        kind: "rent_due",
        channel: "pigeon",
        recipientAddress: "+2348012345678",
        templateKey: "rent_due_v1",
      }),
    ).toThrow();
  });
});
