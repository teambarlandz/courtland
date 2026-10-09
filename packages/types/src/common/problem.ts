// common/problem.ts — application/problem+json envelope (docs/08 §4.4, §4.5).
import { z } from "zod";

export const PROBLEM_CODES = {
  validation_failed: 422,
  unauthenticated: 401,
  token_expired: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  idempotency_key_reused: 409,
  idempotency_in_progress: 409,
  rate_limited: 429,
  business_rule_violation: 422,
  payment_required: 402,
  provider_error: 502,
  verification_pending: 202,
  internal_error: 500,
} as const;
export type ProblemCode = keyof typeof PROBLEM_CODES;

export const ProblemCode = z.enum(Object.keys(PROBLEM_CODES) as [ProblemCode, ...ProblemCode[]]);

export const ProblemErrorItem = z.strictObject({
  path: z.string(),
  code: z.string(),
  message: z.string(),
});
export type ProblemErrorItem = z.infer<typeof ProblemErrorItem>;

export const Problem = z.strictObject({
  type: z.string(),
  title: z.string(),
  status: z.number().int(),
  detail: z.string(),
  instance: z.string(),
  code: ProblemCode,
  requestId: z.string(),
  errors: z.array(ProblemErrorItem).optional(),
});
export type Problem = z.infer<typeof Problem>;
