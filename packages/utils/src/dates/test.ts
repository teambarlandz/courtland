import { describe, expect, it } from "vitest";
import { addMonths, isSameDay, periodFor, startOfDayUtc } from "../dates.ts";

describe("dates", () => {
  it("computes Lagos periods", () => {
    expect(periodFor(new Date("2026-01-31T23:30:00Z"))).toBe("2026-02");
    expect(periodFor(new Date("2026-01-01T00:30:00Z"))).toBe("2026-01");
  });
  it("adds months across year boundaries", () => {
    expect(addMonths(new Date("2026-11-15T00:00:00Z"), 3).getUTCMonth()).toBe(1);
  });
  it("compares calendar days", () => {
    const a = new Date("2026-05-01T00:00:01Z");
    const b = new Date("2026-05-01T23:59:59Z");
    expect(isSameDay(a, b)).toBe(true);
    expect(isSameDay(a, new Date("2026-05-02T00:00:00Z"))).toBe(false);
    expect(startOfDayUtc(a).toISOString()).toBe("2026-05-01T00:00:00.000Z");
  });
});
