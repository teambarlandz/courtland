// property/filters.ts — listing search filters (docs/08 §9). Unknown filter
// keys are rejected with 422, so this object is strict and exhaustive.
import { z } from "zod";
import { ListingType, PropertyType } from "../common/enums.ts";
import { KoboAmount } from "../common/money.ts";

export const PropertyFilters = z
  .strictObject({
    state: z.string().optional(),
    city: z.string().optional(),
    lga: z.string().optional(),
    listingType: ListingType.optional(),
    propertyType: PropertyType.optional(),
    bedrooms: z.coerce.number().int().min(0).optional(),
    minPriceKobo: KoboAmount.optional(),
    maxPriceKobo: KoboAmount.optional(),
    negotiable: z.coerce.boolean().optional(),
    q: z.string().optional(),
    bbox: z.string().optional(),
    near: z.string().optional(),
    radiusKm: z.coerce.number().positive().optional(),
  })
  .refine(
    (f) =>
      f.minPriceKobo === undefined ||
      f.maxPriceKobo === undefined ||
      f.minPriceKobo <= f.maxPriceKobo,
    { message: "minPriceKobo must not exceed maxPriceKobo", path: ["minPriceKobo"] },
  );
export type PropertyFilters = z.infer<typeof PropertyFilters>;

export const PropertySortKey = z.enum(["createdAt", "priceKobo", "bedrooms"]);
export type PropertySortKey = z.infer<typeof PropertySortKey>;
