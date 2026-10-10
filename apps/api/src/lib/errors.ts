// lib/errors.ts — AppError subclasses mapped to problem+json (docs/08 §4.5).
// One subclass per catalogue code. Routes construct them; error.ts serialises.
// A subclass constructed nowhere fails the Phase 3 dead-code gate, so the
// integration suite triggers every one through harness routes.
type ProblemCode =
  | "validation_failed"
  | "unauthenticated"
  | "token_expired"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "idempotency_key_reused"
  | "idempotency_in_progress"
  | "rate_limited"
  | "business_rule_violation"
  | "payment_required"
  | "provider_error"
  | "verification_pending"
  | "internal_error";

export interface ProblemFieldError {
  path: string;
  code: string;
  message: string;
}

const STATUS: Record<ProblemCode, number> = {
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
};

const TITLES: Record<ProblemCode, string> = {
  validation_failed: "Validation failed",
  unauthenticated: "Unauthenticated",
  token_expired: "Token expired",
  forbidden: "Forbidden",
  not_found: "Not found",
  conflict: "Conflict",
  idempotency_key_reused: "Idempotency key reused",
  idempotency_in_progress: "Idempotency in progress",
  rate_limited: "Rate limited",
  business_rule_violation: "Business rule violation",
  payment_required: "Payment required",
  provider_error: "Provider error",
  verification_pending: "Verification pending",
  internal_error: "Internal error",
};

export function problemTypeUri(code: ProblemCode): string {
  return `https://docs.courtland.com.ng/errors/${code.replace(/_/g, "-")}`;
}

export class AppError extends Error {
  readonly code: ProblemCode;
  readonly status: number;
  readonly title: string;
  readonly fieldErrors?: ProblemFieldError[];

  constructor(code: ProblemCode, detail: string, fieldErrors?: ProblemFieldError[]) {
    super(detail);
    this.name = "AppError";
    this.code = code;
    this.status = STATUS[code];
    this.title = TITLES[code];
    this.fieldErrors = fieldErrors;
  }
}

export class ValidationFailedError extends AppError {
  constructor(detail: string, fieldErrors: ProblemFieldError[] = []) {
    super("validation_failed", detail, fieldErrors);
    this.name = "ValidationFailedError";
  }
}

export class UnauthenticatedError extends AppError {
  constructor(detail = "Authentication is required") {
    super("unauthenticated", detail);
    this.name = "UnauthenticatedError";
  }
}

export class TokenExpiredError extends AppError {
  constructor(detail = "Session expired; refresh and retry once") {
    super("token_expired", detail);
    this.name = "TokenExpiredError";
  }
}

export class ForbiddenError extends AppError {
  constructor(detail: string) {
    super("forbidden", detail);
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends AppError {
  constructor(detail = "Not found") {
    super("not_found", detail);
    this.name = "NotFoundError";
  }
}

export class ConflictError extends AppError {
  constructor(detail: string) {
    super("conflict", detail);
    this.name = "ConflictError";
  }
}

export class IdempotencyKeyReusedError extends AppError {
  constructor(detail = "Idempotency key was used with a different request body") {
    super("idempotency_key_reused", detail);
    this.name = "IdempotencyKeyReusedError";
  }
}

export class IdempotencyInProgressError extends AppError {
  constructor(detail = "An identical request is already in progress") {
    super("idempotency_in_progress", detail);
    this.name = "IdempotencyInProgressError";
  }
}

export class RateLimitedError extends AppError {
  readonly retryAfterSeconds?: number;

  constructor(detail = "Too many requests", retryAfterSeconds?: number) {
    super("rate_limited", detail);
    this.name = "RateLimitedError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class BusinessRuleError extends AppError {
  constructor(detail: string) {
    super("business_rule_violation", detail);
    this.name = "BusinessRuleError";
  }
}

export class PaymentRequiredError extends AppError {
  constructor(detail: string) {
    super("payment_required", detail);
    this.name = "PaymentRequiredError";
  }
}

export class ProviderError extends AppError {
  constructor(detail: string) {
    super("provider_error", detail);
    this.name = "ProviderError";
  }
}

export class VerificationPendingError extends AppError {
  constructor(detail: string) {
    super("verification_pending", detail);
    this.name = "VerificationPendingError";
  }
}

export class InternalError extends AppError {
  constructor(detail = "Something went wrong") {
    super("internal_error", detail);
    this.name = "InternalError";
  }
}
