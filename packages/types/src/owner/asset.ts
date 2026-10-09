// owner/asset.ts — owner asset rollup (properties + units owned).
import { z } from "zod";
import { KoboAmount } from "../common/money.ts";

export const OwnerAssetSummary = z.strictObject({
  ownerId: z.uuid(),
  propertyCount: z.number().int().min(0),
  unitCount: z.number().int().min(0),
  occupiedUnitCount: z.number().int().min(0),
  portfolioValueKobo: KoboAmount,
});
export type OwnerAssetSummary = z.infer<typeof OwnerAssetSummary>;
