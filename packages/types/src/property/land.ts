// property/land.ts — land parcel details (DB land_details; PUT replaces whole).
import { z } from "zod";
import { TitleType, Topography } from "../common/enums.ts";

export const LandDetails = z.strictObject({
  propertyId: z.uuid(),
  sizeSqm: z.number().positive(),
  sizePlot: z.number().positive().nullable(),
  plotCount: z.number().int().positive().nullable(),
  topography: Topography,
  titleType: TitleType,
  titleDocumentReference: z.string().nullable(),
  gazetteReference: z.string().nullable(),
  surveyPlanPublicId: z.string().nullable(),
  blockAndPlot: z.string().nullable(),
  latitude: z.number().min(-90).max(90).nullable(),
  longitude: z.number().min(-180).max(180).nullable(),
  isAllocated: z.boolean(),
  isCornerPlot: z.boolean(),
});
export type LandDetails = z.infer<typeof LandDetails>;

export const LandDetailsCreate = z.strictObject({
  sizeSqm: z.number().positive(),
  sizePlot: z.number().positive().optional(),
  plotCount: z.number().int().positive().optional(),
  topography: Topography.default("flat"),
  titleType: TitleType.default("unregistered"),
  titleDocumentReference: z.string().optional(),
  gazetteReference: z.string().optional(),
  surveyPlanPublicId: z.string().optional(),
  blockAndPlot: z.string().optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
});
export type LandDetailsCreate = z.infer<typeof LandDetailsCreate>;
