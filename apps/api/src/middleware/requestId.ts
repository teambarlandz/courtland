// middleware/requestId.ts — accept or mint x-request-id (docs/08 §2, §5).
// The id runs the whole request: response header, log lines (via AsyncLocalStorage
// context), and the problem envelope's requestId. Attaches req.requestId.
import { randomUUID } from "node:crypto";
import { runWithContext } from "@courtland/logger";
import type { NextFunction, Request, Response } from "express";

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
    }
  }
}

function requestIdHeader(value?: string): string {
  if (value && value.trim().length > 0) return value.trim().slice(0, 128);
  return `req_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
}

export function requestId() {
  return (req: Request, res: Response, next: NextFunction): void => {
    const id = requestIdHeader(req.header("x-request-id") ?? undefined);
    req.requestId = id;
    res.setHeader("x-request-id", id);
    runWithContext({ requestId: id }, () => next());
  };
}
