import { describe, expect, it } from "vitest";
import { PayoutAccountCreate } from "./payout.ts";
import { OwnerRegistration } from "./registration.ts";

describe("owner", () => {
  it("accepts an individual registration", () => {
    expect(
      OwnerRegistration.parse({ ownerType: "individual", legalName: "Ada Owner" }).legalName,
    ).toBe("Ada Owner");
  });
  it("rejects bad account numbers", () => {
    expect(() =>
      PayoutAccountCreate.parse({
        businessName: "Biz",
        settlementBank: "GTB",
        accountNumber: "123",
      }),
    ).toThrow();
    expect(
      PayoutAccountCreate.parse({
        businessName: "Biz",
        settlementBank: "GTB",
        accountNumber: "0123456789",
      }).percentageChargeBps,
    ).toBe(0);
  });
});
