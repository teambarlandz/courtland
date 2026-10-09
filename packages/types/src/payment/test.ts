import { describe, expect, it } from "vitest";
import { PaymentIntentCreate } from "./intent.ts";
import { PayoutRunCreate } from "./payout.ts";
import { RefundCreate } from "./refund.ts";

const UUID = "11111111-1111-4111-8111-111111111111";

describe("payment", () => {
  it("accepts a rent intent", () => {
    const intent = PaymentIntentCreate.parse({ contractId: UUID, kind: "rent", amountKobo: 100 });
    expect(intent.currency).toBe("NGN");
  });
  it.each([{ amountKobo: 0 }, { kind: "misc" }, { contractId: "nope" }])(
    "rejects intent %s",
    (patch) => {
      expect(() =>
        PaymentIntentCreate.parse({ contractId: UUID, kind: "rent", amountKobo: 100, ...patch }),
      ).toThrow();
    },
  );
  it("rejects empty refund reasons", () => {
    expect(() => RefundCreate.parse({ paymentId: UUID, amountKobo: 5, reason: "" })).toThrow();
  });
  it("defaults payout method", () => {
    expect(
      PayoutRunCreate.parse({ ownerId: UUID, periodStart: "2026-01-01", periodEnd: "2026-01-31" })
        .method,
    ).toBe("paystack_transfer");
  });
});
