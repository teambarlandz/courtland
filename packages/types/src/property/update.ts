// property/update.ts — partial update (docs/08 §8 PATCH semantics: absent
// untouched, null clears a nullable, {} is a no-op returning the current row).
import { z } from "zod";
import { KoboAmount } from "../common/money.ts";

export const PropertyUpdate = z
  .strictObject({
    title: z.string().min(4).max(200).nullable().optional(),
    description: z.string().max(5000).nullable().optional(),
    addressLine1: z.string().min(1).max(300).nullable().optional(),
    addressLine2: z.string().max(300).nullable().optional(),
    city: z.string().min(1).max(120).nullable().optional(),
    lga: z.string().min(1).max(120).nullable().optional(),
    state: z.string().min(1).max(120).nullable().optional(),
    bedrooms: z.number().int().min(0).nullable().optional(),
    bathrooms: z.number().int().min(0).nullable().optional(),
    sizeSqm: z.number().positive().nullable().optional(),
    amenities: z.array(z.string().max(60)).max(50).nullable().optional(),
    priceKobo: KoboAmount.nullable().optional(),
    negotiable: z.boolean().nullable().optional(),
    coverPhotoPublicId: z.string().nullable().optional(),
  })
  .refine((u) => Object.keys(u).length > 0, { message: "empty PATCH is a no-op" });
export type PropertyUpdate = z.infer<typeof PropertyUpdate>;
