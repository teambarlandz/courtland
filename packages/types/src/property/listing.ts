// property/listing.ts — published-listing read model (docs/08 §2, §9; DB properties).
import { z } from "zod";
import { DateTimeZ } from "../common/dates.ts";
import { ListingType, PropertyStatus, PropertyType } from "../common/enums.ts";
import { KoboAmount } from "../common/money.ts";

export const NG_PHONE = /^\+234[0-9]{10}$/;

export const PropertyListing = z.strictObject({
  id: z.uuid(),
  reference: z.string(),
  slug: z.string(),
  title: z.string(),
  listingType: ListingType,
  propertyType: PropertyType,
  status: PropertyStatus,
  addressLine1: z.string(),
  city: z.string(),
  lga: z.string(),
  state: z.string(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  bedrooms: z.number().int().nullable(),
  bathrooms: z.number().int().nullable(),
  sizeSqm: z.number().nullable(),
  amenities: z.array(z.string()),
  priceKobo: KoboAmount,
  priceCadence: z.string(),
  negotiable: z.boolean(),
  coverPhotoPublicId: z.string().nullable(),
  publishedAt: DateTimeZ.nullable(),
  ownerDisplayName: z.string().nullable(),
  unitCount: z.number().int().nullable(),
  vacantUnitCount: z.number().int().nullable(),
});
export type PropertyListing = z.infer<typeof PropertyListing>;
