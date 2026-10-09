import { describe, expect, it } from "vitest";
import { isValidNgPhone, maskPhone, normaliseNgPhone } from "../phone.ts";

describe("phone", () => {
  it.each(["+2348012345678"])("accepts %s", (v) => {
    expect(isValidNgPhone(v)).toBe(true);
  });
  it.each(["08012345678", "+234801234567", "+1234567890123", ""])("rejects %s", (v) => {
    expect(isValidNgPhone(v)).toBe(false);
  });
  it.each([
    ["08012345678", "+2348012345678"],
    ["2348012345678", "+2348012345678"],
    ["+2348012345678", "+2348012345678"],
    ["0801 234 5678", "+2348012345678"],
  ])("normalises %s", (input, expected) => {
    expect(normaliseNgPhone(input)).toBe(expected);
  });
  it("rejects unnormalisable input", () => {
    expect(() => normaliseNgPhone("+1234567890123")).toThrow();
  });
  it("masks", () => {
    expect(maskPhone("+2348012345678")).toBe("+23480***78");
    expect(() => maskPhone("0801")).toThrow();
  });
});
