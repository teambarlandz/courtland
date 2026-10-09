import { describe, expect, it } from "vitest";
import { slugify, uniqueSlug } from "../slug.ts";

describe("slug", () => {
  it.each([
    ["Three Bedroom Bungalow", "three-bedroom-bungalow"],
    ["  Lekki Phase 1! ", "lekki-phase-1"],
  ])("slugifies %s", (input, expected) => {
    expect(slugify(input)).toBe(expected);
  });
  it("rejects empty results", () => {
    expect(() => slugify("!!!")).toThrow();
  });
  it("suffixes collisions", () => {
    const taken = new Set(["seed-rent-bungalow", "seed-rent-bungalow-2"]);
    expect(uniqueSlug("Seed Rent Bungalow", taken)).toBe("seed-rent-bungalow-3");
    expect(uniqueSlug("Fresh Title", taken)).toBe("fresh-title");
  });
});
