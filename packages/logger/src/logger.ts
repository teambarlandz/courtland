// logger.ts — the one Pino instance factory. Nothing else may construct a
// logger, which is what makes the redaction list a guarantee rather than a
// convention. Base fields (env, version) come from the caller so this package
// never reads process.env itself.

import type { Logger } from "pino";
import pino from "pino";
import { REDACTED_CENSOR, REDACTED_KEYS } from "./redact.ts";
import { getContext } from "./requestContext.ts";

export interface LoggerOptions {
  level?: string;
  env?: string;
  version?: string;
  destination?: pino.DestinationStream;
}

export function createLogger(options: LoggerOptions = {}): Logger {
  // Pino redact paths match per level, not at depth: each key is censored at
  // the top four nesting levels. Anything credential-shaped deeper than that
  // is a code smell the reviewer should flag, not silently log.
  const keys = [...REDACTED_KEYS] as string[];
  const paths = keys.flatMap((key) => [key, `*.${key}`, `*.*.${key}`, `*.*.*.${key}`]);
  return pino(
    {
      level: options.level ?? "info",
      base: {
        env: options.env ?? "development",
        version: options.version ?? "local",
      },
      redact: {
        paths,
        censor: REDACTED_CENSOR,
      },
      mixin() {
        const context = getContext();
        if (!context) return {};
        return { requestId: context.requestId };
      },
    },
    options.destination,
  );
}

export type { Logger };
