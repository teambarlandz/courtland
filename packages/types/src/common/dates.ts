// common/dates.ts — wire date/time representation (docs/08 §3).
// Datetimes are ISO 8601 UTC with Z; calendar dates are YYYY-MM-DD.
import { z } from "zod";

export const DateTimeZ = z.iso.datetime();
export type DateTimeZ = z.infer<typeof DateTimeZ>;

export const DateOnly = z.iso.date();
export type DateOnly = z.infer<typeof DateOnly>;
