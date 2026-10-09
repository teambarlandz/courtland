import { describe, expect, it } from "vitest";
import { formatPayoutReference, formatReference, parseReferenceKind } from "../reference.ts";

describe("reference", () => {
  it("formats SQL-truth prefixes", () => {
    expect(formatReference("property", 912)).toBe("PRT-000912");
    expect(formatReference("contract", 4310)).toBe("CLT-004310");
    expect(formatReference("owner", 123)).toBe("OWN-000123");
  });
  it("formats payout references", () => {
    expect(formatPayoutReference(2026, 1, 1)).toBe("PO-2026-01-0001");
  });
  it("parses kinds back", () => {
    expect(parseReferenceKind("PRT-000912")).toBe("property");
    expect(() => parseReferenceKind("XXX-000001")).toThrow();
  });
  it("rejects bad sequences", () => {
    expect(() => formatReference("property", -1)).toThrow();
    expect(() => formatReference("property", 1.5)).toThrow();
  });
});
