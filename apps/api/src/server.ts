// src/server.ts — listen, graceful shutdown, Sentry preload (docs/roadmap § Phase 3).
import { createLogger } from "@courtland/logger";
import { createApp } from "./app.ts";
import { loadEnv } from "./env.ts";
import { initInstrumentation } from "./instrumentation.ts";

const env = loadEnv();
const logger = createLogger({ level: env.LOG_LEVEL, env: env.NODE_ENV, version: env.GIT_SHA });
initInstrumentation({ logger, sentryDsn: env.SENTRY_DSN });

const app = createApp({
  logger,
  supabaseUrl: env.SUPABASE_URL,
  supabaseAnonKey: env.SUPABASE_ANON_KEY,
  corsOrigins: env.CORS_ORIGINS.split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0),
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
