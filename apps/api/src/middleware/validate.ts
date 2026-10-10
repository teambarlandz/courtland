// middleware/validate.ts — body, query and params parsing (docs/08 §5).
// Strict Zod: unknown fields are 422, never silently stripped. Failures become
// validation_failed problems whose errors[] names the field path.
import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import type { ProblemFieldError } from "../lib/errors.ts";
import { ValidationFailedError } from "../lib/errors.ts";

interface ValidateSchemas {
  body?: z.ZodType;
  query?: z.ZodType;
  params?: z.ZodType;
}

export function validate(schemas: ValidateSchemas) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      if (schemas.body) req.body = schemas.body.parse(req.body) as unknown;
      if (schemas.query) {
        const parsed = schemas.query.parse(req.query) as Record<string, unknown>;
        for (const key of Object.keys(parsed)) {
          (req.query as Record<string, unknown>)[key] = parsed[key];
        }
      }
      if (schemas.params)
        req.params = schemas.params.parse(req.params) as unknown as typeof req.params;
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        const fieldErrors: ProblemFieldError[] = error.issues.map((issue) => ({
          path: issue.path.map(String).join("."),
          code: issue.code,
          message: issue.message,
        }));
        next(new ValidationFailedError("Request validation failed", fieldErrors));
        return;
      }
      next(error);
    }
  };
}
