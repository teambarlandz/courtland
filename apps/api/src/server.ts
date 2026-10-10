// src/server.ts — listen, graceful shutdown, Sentry preload (docs/roadmap § Phase 3).
import { createLogger } from "@courtland/logger";
import { createApp } from "./app.ts";
import { loadEnv } from "./env.ts";
import { initInstrumentation } from "./instrumentation.ts";
import { createServiceClient } from "./integrations/supabase/admin.ts";
import { supabaseSessionVerifier } from "./middleware/auth.ts";
import { wireAdminUsersRoutes } from "./routes/admin/users.ts";
import { wireAuthRoutes } from "./routes/auth.ts";
import { createV1Router } from "./routes/index.ts";

const env = loadEnv();
const logger = createLogger({ level: env.LOG_LEVEL, env: env.NODE_ENV, version: env.GIT_SHA });
initInstrumentation({ logger, sentryDsn: env.SENTRY_DSN });

const admin = createServiceClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const corsOrigins = env.CORS_ORIGINS.split(",")
  .map((origin) => origin.trim())
  .filter((origin) => origin.length > 0);
const verifier = supabaseSessionVerifier(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, admin);

const app = createApp({
  logger,
  corsOrigins,
  v1Routes: createV1Router({
    authRouter: wireAuthRoutes({
      supabaseUrl: env.SUPABASE_URL,
      supabaseAnonKey: env.SUPABASE_ANON_KEY,
      supabaseServiceKey: env.SUPABASE_SERVICE_ROLE_KEY,
      allowedOrigins: corsOrigins,
      cookieDomain: new URL(env.APP_URL).hostname,
      logger,
    }),
    adminUsersRouter: wireAdminUsersRoutes(admin, verifier),
  }),
});

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, "api listening");
});

function shutdown(signal: string): void {
  logger.info({ signal }, "shutting down");
  server.close((error?: Error) => {
    if (error) {
      logger.error({ err: error }, "error during shutdown");
      process.exitCode = 1;
      return;
    }
    process.exitCode = 0;
  });
  setTimeout(() => {
    logger.error("shutdown timed out; forcing exit");
    process.exit(1);
  }, 10_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
