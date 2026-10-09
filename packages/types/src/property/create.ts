// property/create.ts — new listing input (DB properties; docs/08 §8).
import { z } from "zod";
import { ListingType, PropertyType } from "../common/enums.ts";
import { KoboAmount } from "../common/money.ts";

export const PropertyCreate = z.strictObject({
  title: z.string().min(4).max(200),
  description: z.string().max(5000).default(""),
  listingType: ListingType,
  propertyType: PropertyType,
  addressLine1: z.string().min(1).max(300),
  addressLine2: z.string().max(300).optional(),
  city: z.string().min(1).max(120),
  lga: z.string().min(1).max(120),
  state: z.string().min(1).max(120),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  bedrooms: z.number().int().min(0).optional(),
  bathrooms: z.number().int().min(0).optional(),
  toilets: z.number().int().min(0).optional(),
  sizeSqm: z.number().positive().optional(),
  yearBuilt: z.number().int().min(1900).max(2100).optional(),
  amenities: z.array(z.string().max(60)).max(50).default([]),
  priceKobo: KoboAmount,
  priceCadence: z.string().default("outright"),
  negotiable: z.boolean().default(false),
});
export type PropertyCreate = z.infer<typeof PropertyCreate>;
