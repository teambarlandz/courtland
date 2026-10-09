// property/media.ts — listing media rows (DB property_media).
import { z } from "zod";
import { MediaKind } from "../common/enums.ts";

export const PropertyMedia = z.strictObject({
  id: z.uuid(),
  propertyId: z.uuid(),
  publicId: z.string(),
  kind: MediaKind,
  sortOrder: z.number().int().min(0),
  altText: z.string(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
  isCover: z.boolean(),
});
export type PropertyMedia = z.infer<typeof PropertyMedia>;

export const PropertyMediaCreate = z.strictObject({
  publicId: z.string().min(1),
  kind: MediaKind.default("image"),
  altText: z.string().default(""),
  isCover: z.boolean().default(false),
});
export type PropertyMediaCreate = z.infer<typeof PropertyMediaCreate>;

export const MediaReorder = z.strictObject({
  orderedPublicIds: z.array(z.string().min(1)).min(1).max(50),
});
export type MediaReorder = z.infer<typeof MediaReorder>;
