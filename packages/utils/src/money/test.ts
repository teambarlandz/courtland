import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  allocatePayment,
  allocateProRata,
  formatNaira,
  parseNairaToKobo,
  splitAnnualRent,
} from "../money.ts";

describe("formatNaira", () => {
  it.each([
    [0n, "₦0.00"],
    [1250050n, "₦12,500.50"],
    [5000000000n, "₦50,000,000.00"],
    [-150n, "-₦1.50"],
  ] as [bigint, string][])("formats %s as %s", (kobo, expected) => {
    expect(formatNaira(kobo)).toBe(expected);
  });
});

describe("parseNairaToKobo", () => {
  it.each([
    ["12,500.50", 1250050n],
    ["₦50,000,000.00", 5000000000n],
    ["100", 10000n],
    ["0.05", 5n],
  ] as [string, bigint][])("parses %s", (input, expected) => {
    expect(parseNairaToKobo(input)).toBe(expected);
  });
  it("rejects garbage", () => {
    expect(() => parseNairaToKobo("twelve")).toThrow();
    expect(() => parseNairaToKobo("1.234")).toThrow();
  });
  it("round-trips through formatNaira", () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 0n, max: 999999999999n }), (kobo) => {
        expect(parseNairaToKobo(formatNaira(kobo))).toBe(kobo);
      }),
      { numRuns: 200 },
    );
  });
});

describe("splitAnnualRent", () => {
  it("splits annual rent so the instalments sum to exactly the annual rent", () => {
    const parts = splitAnnualRent(33333333n, 12);
    expect(parts.reduce((a, b) => a + b, 0n)).toBe(33333333n);
    expect(parts).toHaveLength(12);
    expect(
      Number(parts.reduce((a, b) => (a > b ? a : b), 0n)) -
        Number(parts.reduce((a, b) => (a < b ? a : b), parts[0] as bigint)),
    ).toBeLessThanOrEqual(1);
  });
  it("rejects bad inputs", () => {
    expect(() => splitAnnualRent(100n, 0)).toThrow();
    expect(() => splitAnnualRent(-1n, 12)).toThrow();
  });
  it("sums exactly for arbitrary inputs", () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 0n, max: 1000000000000n }),
        fc.integer({ min: 1, max: 60 }),
        (total, months) => {
          const parts = splitAnnualRent(total, months);
          expect(parts).toHaveLength(months);
          expect(parts.reduce((a, b) => a + b, 0n)).toBe(total);
        },
      ),
      { numRuns: 1000 },
    );
  });
});

describe("allocateProRata", () => {
  it("distributes remainder to the largest fractional parts", () => {
    expect(allocateProRata(1000n, [1n, 1n, 1n])).toEqual([334n, 333n, 333n]);
    expect(allocateProRata(5n, [1n, 2n])).toEqual([2n, 3n]);
    expect(allocateProRata(0n, [1n, 2n, 3n])).toEqual([0n, 0n, 0n]);
    expect(allocateProRata(10n, [2n, 3n])).toEqual([4n, 6n]);
    expect(allocateProRata(5n, [0n, 0n, 1n])).toEqual([0n, 0n, 5n]);
  });
  it("rejects negative totals, negative weights and non-positive weight sums", () => {
    expect(() => allocateProRata(-1n, [1n])).toThrow();
    expect(() => allocateProRata(5n, [0n, 0n])).toThrow();
    expect(() => allocateProRata(5n, [-1n, -1n])).toThrow();
    expect(() => allocateProRata(100n, [-1n, 2n])).toThrow();
  });
  it("sums exactly to the total for arbitrary inputs", () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 0n, max: 1000000000000n }),
        fc.array(fc.bigInt({ min: 0n, max: 1000000n }), { minLength: 1, maxLength: 12 }),
        (total, weights) => {
          fc.pre(weights.some((w) => w > 0n));
          const parts = allocateProRata(total, weights);
          expect(parts).toHaveLength(weights.length);
          expect(parts.reduce((a, b) => a + b, 0n)).toBe(total);
          for (const p of parts) expect(p >= 0n).toBe(true);
        },
      ),
      { numRuns: 1000 },
    );
  });
});

describe("allocatePayment", () => {
  it("fills balances in order", () => {
    expect(allocatePayment(100n, [60n, 60n])).toEqual([60n, 40n]);
    expect(allocatePayment(200n, [60n, 60n])).toEqual([60n, 60n]);
    expect(allocatePayment(0n, [60n])).toEqual([0n]);
  });
  it("rejects negative amounts", () => {
    expect(() => allocatePayment(-1n, [1n])).toThrow();
  });
});
