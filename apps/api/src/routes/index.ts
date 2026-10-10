// routes/index.ts — router assembly, /v1 mount.
// Phase 3 mounts no domain routes (they arrive with their phases); the /v1
// router exists so the mount point and its middleware order are settled now.
import { Router } from "express";

const v1Router = Router();

export const routes = Router();
routes.use("/v1", v1Router);
