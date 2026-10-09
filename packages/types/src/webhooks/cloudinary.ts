// webhooks/cloudinary.ts — Cloudinary notification webhook (docs/01 §B3).
// Payload shape is not documented in docs/14, so this models the documented
// verification contract plus the standard notification fields the handler
// reads; everything else passes through (loose object, same rationale as
// Paystack: providers evolve without warning).
import { z } from "zod";

export const CloudinaryNotification = z.looseObject({
  notification_type: z.string(),
  public_id: z.string().optional(),
  version: z.union([z.string(), z.number()]).optional(),
  width: z.number().int().optional(),
  height: z.number().int().optional(),
  format: z.string().optional(),
  resource_type: z.string().optional(),
  created_at: z.string().optional(),
  tags: z.array(z.string()).optional(),
  eager: z.unknown().optional(),
});
export type CloudinaryNotification = z.infer<typeof CloudinaryNotification>;
