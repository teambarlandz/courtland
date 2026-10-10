// src/app.ts — Express assembly, exported for tests (docs/roadmap § Phase 3).
// Never calls listen: every integration test is a supertest call against an
// in-process app with no port bound. server.ts owns listen and shutdown.
//
// Auth is per-route, not global: /v1 mixes anonymous (OTP, csrf) and guarded
// endpoints, so each route composes its own authenticate/requirePermission
// chain. Test-only routes mount under /t/* via testRoutes.

import type { Logger } from "@courtland/logger";
import { createLogger } from "@courtland/logger";
import cors from "cors";
import type { Express, Router } from "express";
import express from "express";
import helmet from "helmet";
import { NotFoundError } from "./lib/errors.ts";
import { createErrorHandler } from "./middleware/error.ts";
import { rateLimit } from "./middleware/rateLimit.ts";
import { requestId } from "./middleware/requestId.ts";
import { healthRouter } from "./routes/health.ts";

interface CreateAppOptions {
  logger?: Logger;
  corsOrigins?: string[];
  v1Routes?: Router;
  testRoutes?: Router;
}

export function createApp(options: CreateAppOptions = {}): Express {
  const logger = options.logger ?? createLogger();
  const app = express();
  app.disable("x-powered-by");
  app.use(helmet());
  app.use(
    cors({
      origin: options.corsOrigins ?? [],
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "256kb" }));
  app.use(requestId());
  app.use("/health", healthRouter);
  app.use(
    rateLimit({
      windowMs: 60_000,
      max: 1000,
    }),
  );
  if (options.v1Routes) {
    app.use("/v1", options.v1Routes);
  }
  if (options.testRoutes) {
    app.use("/t", options.testRoutes);
  }
  app.use((_req, _res, next) => {
    next(new NotFoundError());
  });
  app.use(createErrorHandler(logger));
  return app;
}
