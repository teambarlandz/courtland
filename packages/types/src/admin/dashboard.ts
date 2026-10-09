// admin/dashboard.ts — staff dashboard cards (docs/08 §10 GET /v1/admin/dashboard).
import { z } from "zod";
import { KoboAmount } from "../common/money.ts";

export const DashboardCard = z.strictObject({
  key: z.string(),
  label: z.string(),
  valueKobo: KoboAmount.nullable(),
  count: z.number().int().min(0).nullable(),
});
export type DashboardCard = z.infer<typeof DashboardCard>;

export const AdminDashboard = z.strictObject({
  cards: z.array(DashboardCard),
  collectionsDueKobo: KoboAmount,
  openDisputeCount: z.number().int().min(0),
});
export type AdminDashboard = z.infer<typeof AdminDashboard>;
