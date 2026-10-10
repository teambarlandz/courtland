// src/instrumentation.ts — Sentry and process diagnostics init.
// server.ts calls initInstrumentation() before anything else loads: the Sentry
// preload, as an explicit call rather than import magic so tests can invoke it
// with a silent logger. OpenTelemetry SDK stays out until Phase 15
// (observability): without a collector it is pure overhead, and its setup
// belongs with the dashboards that consume it.
//
// Rules: no env.ts import here (env validation runs in server.ts after this
// module loads, and tests must import the app without production env); options
// arrive as arguments so every path is unit-testable.
import type { Logger } from "@courtland/logger";
import { createLogger } from "@courtland/logger";

interface InstrumentationOptions {
  logger?: Logger;
  sentryDsn?: string;
  onError?: (error: unknown) => void;
}

export function initInstrumentation(options: InstrumentationOptions = {}): void {
  const logger = options.logger ?? createLogger();
  const report =
    options.onError ??
    ((error: unknown): void => {
      logger.error({ err: error }, "unhandled rejection");
    });
  if (options.sentryDsn) {
    void import("@sentry/node")
      .then((sentry) => {
        sentry.init({ dsn: options.sentryDsn });
      })
      .catch((error: unknown) => {
        logger.error({ err: error }, "sentry init failed");
      });
  }
  process.on("unhandledRejection", (reason: unknown) => {
    report(reason);
  });
  process.on("uncaughtException", (error: unknown) => {
    logger.error({ err: error }, "uncaught exception");
  });
}
