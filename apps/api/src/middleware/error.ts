// middleware/error.ts — the problem serialiser, last in the stack (docs/08 §4.4).
// AppError subclasses become their catalogue problem; anything else becomes a
// 500 with no leak (the detail is logged with the request id, never sent).

import type { Logger } from "@courtland/logger";
import type { NextFunction, Request, Response } from "express";
import { AppError, InternalError, problemTypeUri } from "../lib/errors.ts";

export function createErrorHandler(logger: Logger) {
  return (err: unknown, req: Request, res: Response, _next: NextFunction): void => {
    const requestId = req.requestId ?? (req.header("x-request-id") || `req_unknown_${Date.now()}`);
    if (err instanceof AppError) {
      if (err.code === "internal_error") {
        logger.error({ err, requestId, path: req.path }, "internal error");
      }
      res
        .status(err.status)
        .type("application/problem+json")
        .json({
          type: problemTypeUri(err.code),
          title: err.title,
          status: err.status,
          detail: err.message,
          instance: req.path,
          code: err.code,
          requestId,
          ...(err.fieldErrors ? { errors: err.fieldErrors } : {}),
        });
      return;
    }
    logger.error({ err, requestId, path: req.path }, "unhandled error");
    const fallback = new InternalError();
    res
      .status(fallback.status)
      .type("application/problem+json")
      .json({
        type: problemTypeUri(fallback.code),
        title: fallback.title,
        status: fallback.status,
        detail: fallback.message,
        instance: req.path,
        code: fallback.code,
        requestId,
      });
  };
}
