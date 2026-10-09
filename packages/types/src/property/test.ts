import { describe, expect, it } from "vitest";
import { PropertyCreate } from "./create.ts";
import { PropertyFilters } from "./filters.ts";
import { LandDetailsCreate } from "./land.ts";
import { MediaReorder, PropertyMediaCreate } from "./media.ts";

const base = {
  title: "Three bedroom bungalow",
  listingType: "rent",
  propertyType: "bungalow",
  addressLine1: "1 Seed Street",
  city: "Lekki",
  lga: "Eti-Osa",
  state: "Lagos",
  priceKobo: 5000000000,
} as const;

describe("property", () => {
  it("accepts a minimal create with defaults", () => {
    const parsed = PropertyCreate.parse({ ...base });
    expect(parsed.negotiable).toBe(false);
    expect(parsed.amenities).toEqual([]);
  });
  it.each([{ title: "Ab" }, { priceKobo: -5 }, { listingType: "lease" }, { extra: 1 }])(
    "rejects create %s",
    (patch) => {
      expect(() => PropertyCreate.parse({ ...base, ...patch })).toThrow();
    },
  );
  it("rejects an inverted price band", () => {
    expect(() => PropertyFilters.parse({ minPriceKobo: 9, maxPriceKobo: 3 })).toThrow();
    expect(PropertyFilters.parse({ q: "lekki" }).q).toBe("lekki");
  });
  it("accepts media create and reorder", () => {
    expect(PropertyMediaCreate.parse({ publicId: "a/b" }).kind).toBe("image");
    expect(MediaReorder.parse({ orderedPublicIds: ["a", "b"] }).orderedPublicIds).toHaveLength(2);
    expect(() => MediaReorder.parse({ orderedPublicIds: [] })).toThrow();
  });
  it("accepts land details with title defaults", () => {
    const land = LandDetailsCreate.parse({ sizeSqm: 600 });
    expect(land.topography).toBe("flat");
    expect(land.titleType).toBe("unregistered");
    expect(() => LandDetailsCreate.parse({ sizeSqm: -1 })).toThrow();
  });
});
