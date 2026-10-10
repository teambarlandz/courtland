// src/app.ts — Express assembly, exported for tests (docs/roadmap § Phase 3).
// Never calls listen: every integration test is a supertest call against an
// in-process app with no port bound. server.ts owns listen and shutdown.

import type { Logger } from "@courtland/logger";
import { createLogger } from "@courtland/logger";
import cors from "cors";
import type { Express, Router } from "express";
import express from "express";
import helmet from "helmet";
import { NotFoundError } from "./lib/errors.ts";
import type { AuthVerifier } from "./middleware/auth.ts";
import { authenticate, supabaseVerifier } from "./middleware/auth.ts";
import { createErrorHandler } from "./middleware/error.ts";
import { rateLimit } from "./middleware/rateLimit.ts";
import { requestId } from "./middleware/requestId.ts";
import { healthRouter } from "./routes/health.ts";
import { routes } from "./routes/index.ts";

interface AppOptions {
  logger?: Logger;
  authVerifier?: AuthVerifier;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  corsOrigins?: string[];
  testRoutes?: Router;
}

export function createApp(options: AppOptions = {}): Express {
  const logger = options.logger ?? createLogger();
  const verifier =
    options.authVerifier ??
    (options.supabaseUrl && options.supabaseAnonKey
      ? supabaseVerifier(options.supabaseUrl, options.supabaseAnonKey)
      : null);
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
  app.use(routes);
  if (verifier) {
    app.use("/v1", authenticate(verifier));
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
