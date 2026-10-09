import { describe, expect, it } from "vitest";
import { DisputeCreate } from "./dispute.ts";

describe("dispute", () => {
  it("accepts a dispute with a subject", () => {
    expect(
      DisputeCreate.parse({
        propertyId: "11111111-1111-4111-8111-111111111111",
        category: "arrears",
        description: "Unpaid for two months.",
      }).category,
    ).toBe("arrears");
  });
  it("rejects empty descriptions", () => {
    expect(() => DisputeCreate.parse({ category: "arrears", description: "" })).toThrow();
  });
});
