// document/release.ts — document release gating (DB released_at flow).
import { z } from "zod";

export const DocumentRelease = z.strictObject({
  releaseApprovedBy: z.uuid().optional(),
});
export type DocumentRelease = z.infer<typeof DocumentRelease>;
