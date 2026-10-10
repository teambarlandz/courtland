// routes/health.ts — GET /health, outside the limiter (docs/08 §10).
// Liveness only: no auth, no rate limit, and no database round trip.
import { Router } from "express";

export const healthRouter = Router();

healthRouter.get("/", (_req, res) => {
  res.json({ status: "ok" });
});
