import { describe, expect, it } from "vitest";
import { z } from "zod";
import { DateOnly, DateTimeZ } from "./dates.ts";
import { contractStatusValues } from "./enums.ts";
import { KoboAmount, MAX_SAFE_KOBO, Money } from "./money.ts";
import { dataOf, PageMeta, pageOf } from "./pagination.ts";
import { PROBLEM_CODES, Problem } from "./problem.ts";

describe("money", () => {
  it.each([0, 1, 45000000, MAX_SAFE_KOBO])("accepts kobo %d", (v) => {
    expect(KoboAmount.parse(v)).toBe(v);
  });
  it.each([-1, 1.5, Number.NaN, MAX_SAFE_KOBO + 1])("rejects kobo %s", (v) => {
    expect(() => KoboAmount.parse(v)).toThrow();
  });
  it("parses a money object with default currency", () => {
    expect(Money.parse({ amountKobo: 100 })).toEqual({ amountKobo: 100, currency: "NGN" });
  });
});

describe("dates", () => {
  it.each(["2026-09-30T00:00:00Z", "2026-01-01T12:34:56.789Z"])("accepts %s", (v) => {
    expect(DateTimeZ.parse(v)).toBe(v);
  });
  it.each(["2026-09-30", "not-a-date", "2026-13-01T00:00:00Z"])("rejects %s", (v) => {
    expect(() => DateTimeZ.parse(v)).toThrow();
  });
  it.each(["2026-09-30", "2027-12-31"])("accepts date-only %s", (v) => {
    expect(DateOnly.parse(v)).toBe(v);
  });
  it.each(["2026-09-30T00:00:00Z", "30-09-2026"])("rejects date-only %s", (v) => {
    expect(() => DateOnly.parse(v)).toThrow();
  });
});

describe("pagination", () => {
  const Item = z.strictObject({ id: z.string() });
  it("builds a page envelope", () => {
    const page = pageOf(Item).parse({
      data: [{ id: "a" }],
      meta: { nextCursor: null, hasMore: false, count: 1 },
    });
    expect(page.meta.count).toBe(1);
  });
  it("rejects unknown meta keys", () => {
    expect(() =>
      PageMeta.parse({ nextCursor: null, hasMore: false, count: 0, total: 99 }),
    ).toThrow();
  });
  it("builds a data envelope", () => {
    expect(dataOf(Item).parse({ data: { id: "a" } })).toEqual({ data: { id: "a" } });
  });
});

describe("problem", () => {
  it("every catalogue code maps to its status", () => {
    expect(PROBLEM_CODES.validation_failed).toBe(422);
    expect(PROBLEM_CODES.not_found).toBe(404);
    expect(PROBLEM_CODES.internal_error).toBe(500);
  });
  it("parses a full problem document", () => {
    const doc = {
      type: "https://docs.courtland.com.ng/errors/validation-failed",
      title: "Validation failed",
      status: 422,
      detail: "priceKobo must be positive",
      instance: "/v1/properties",
      code: "validation_failed",
      requestId: "req_01J9X4M2K7",
      errors: [{ path: "priceKobo", code: "too_small", message: "too small" }],
    };
    expect(Problem.parse(doc)).toEqual(doc);
  });
  it("rejects a problem missing requestId", () => {
    expect(() =>
      Problem.parse({
        type: "t",
        title: "t",
        status: 500,
        detail: "d",
        instance: "/",
        code: "internal_error",
      }),
    ).toThrow();
  });
});

describe("enums", () => {
  it("contract states are the documented nine", () => {
    expect([...contractStatusValues].sort()).toEqual(
      [
        "active",
        "approved",
        "draft",
        "expired",
        "in_review",
        "rejected",
        "renewed",
        "suspended",
        "terminated",
      ].sort(),
    );
  });
});
