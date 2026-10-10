import { Writable } from "node:stream";
import { createLogger } from "@courtland/logger";
import { Router } from "express";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { createApp } from "../../../src/app.ts";
import { initInstrumentation } from "../../../src/instrumentation.ts";
import {
  BusinessRuleError,
  ConflictError,
  PaymentRequiredError,
  ProviderError,
  TokenExpiredError,
  VerificationPendingError,
} from "../../../src/lib/errors.ts";
import type { ReqAuth } from "../../../src/middleware/auth.ts";
import { authenticate } from "../../../src/middleware/auth.ts";
import type { IdempotencyStore } from "../../../src/middleware/idempotency.ts";
import { idempotency, memoryIdempotencyStore } from "../../../src/middleware/idempotency.ts";
import { rateLimit, resetRateLimitWindows } from "../../../src/middleware/rateLimit.ts";
import { requirePermission } from "../../../src/middleware/requirePermission.ts";
import { validate } from "../../../src/middleware/validate.ts";

function silentLogger() {
  return createLogger({
    destination: new Writable({
      write(_chunk, _encoding, done) {
        done();
      },
    }),
  });
}

const USER: ReqAuth = {
  userId: "11111111-1111-4111-8111-111111111111",
  roles: ["tenant"],
  permissions: ["property_read_public"],
  via: "bearer",
};

async function goodVerifier(): Promise<ReqAuth> {
  return USER;
}

async function expiredVerifier(): Promise<ReqAuth> {
  throw new TokenExpiredError();
}

const idempotencyStore: IdempotencyStore = memoryIdempotencyStore();
let idempotentRuns = 0;

const harness = Router();
harness.post(
  "/validate",
  validate({ body: z.strictObject({ name: z.string().min(1) }) }),
  (_req, res) => {
    res.json({ ok: true });
  },
);
harness.get("/auth", authenticate(goodVerifier), (_req, res) => {
  res.json({ ok: true });
});
harness.get("/expired", authenticate(expiredVerifier), (_req, res) => {
  res.json({ ok: true });
});
harness.get(
  "/guarded",
  authenticate(goodVerifier),
  requirePermission("user_manage"),
  (_req, res) => {
    res.json({ ok: true });
  },
);
harness.get("/conflict", (_req, _res) => {
  throw new ConflictError("Slug is taken");
});
harness.post("/idem", idempotency(idempotencyStore), (_req, res) => {
  idempotentRuns += 1;
  res.status(201).json({ runs: idempotentRuns });
});
harness.get("/limited", rateLimit({ windowMs: 60_000, max: 1 }), (_req, res) => {
  res.json({ ok: true });
});
harness.get("/rule", (_req, _res) => {
  throw new BusinessRuleError("Contract is not active");
});
harness.get("/pay", (_req, _res) => {
  throw new PaymentRequiredError("Plan quota exhausted");
});
harness.get("/provider", (_req, _res) => {
  throw new ProviderError("Paystack is unreachable");
});
harness.get("/pending", (_req, _res) => {
  throw new VerificationPendingError("Email verification is pending");
});
harness.get("/boom", (_req, _res) => {
  throw new Error("kaboom-secret-detail");
});

const app = createApp({ logger: silentLogger(), testRoutes: harness });

beforeEach(() => {
  resetRateLimitWindows();
});

describe("middleware integration", () => {
  it("GET /health returns 200 without auth, rate limit or database", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
    expect(res.headers["x-request-id"]).toBeDefined();
  });

  it("validation_failed names the field path and carries the request id", async () => {
    const res = await request(app).post("/t/validate").send({ name: "" });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe("validation_failed");
    expect(res.body.type).toBe("https://docs.courtland.com.ng/errors/validation-failed");
    expect(res.body.errors[0].path).toBe("name");
    expect(res.body.requestId).toBe(res.headers["x-request-id"]);
  });

  it("rejects unknown fields with 422", async () => {
    const res = await request(app).post("/t/validate").send({ name: "Ada", extra: 1 });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe("validation_failed");
  });

  it("unauthenticated without a token", async () => {
    const res = await request(app).get("/t/auth");
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("unauthenticated");
    expect(res.body.requestId).toBeDefined();
  });

  it("token_expired for an expired session", async () => {
    const res = await request(app).get("/t/expired").set("Authorization", "Bearer stale-token");
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("token_expired");
  });

  it("forbidden names the missing permission", async () => {
    const res = await request(app).get("/t/guarded").set("Authorization", "Bearer good-token");
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("forbidden");
    expect(res.body.detail).toContain("user_manage");
  });

  it("unknown paths are 404 problems, not HTML", async () => {
    const res = await request(app).get("/nope");
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("not_found");
  });

  it("conflict maps to 409", async () => {
    const res = await request(app).get("/t/conflict");
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("conflict");
  });

  it("idempotency replays the original response and refuses reused keys", async () => {
    const first = await request(app)
      .post("/t/idem")
      .set("Idempotency-Key", "11111111-1111-4111-8111-111111111111")
      .send({ a: 1 });
    expect(first.status).toBe(201);
    const replay = await request(app)
      .post("/t/idem")
      .set("Idempotency-Key", "11111111-1111-4111-8111-111111111111")
      .send({ a: 1 });
    expect(replay.status).toBe(201);
    expect(replay.body).toEqual(first.body);
    const reused = await request(app)
      .post("/t/idem")
      .set("Idempotency-Key", "11111111-1111-4111-8111-111111111111")
      .send({ a: 2 });
    expect(reused.status).toBe(409);
    expect(reused.body.code).toBe("idempotency_key_reused");
  });

  it("memory store reports in-progress on double reserve", async () => {
    const store = memoryIdempotencyStore();
    expect(await store.reserve("k", "fp")).toEqual({ kind: "proceed" });
    expect(await store.reserve("k", "fp")).toEqual({ kind: "in-progress" });
  });

  it("rate_limited carries Retry-After", async () => {
    expect((await request(app).get("/t/limited")).status).toBe(200);
    const res = await request(app).get("/t/limited");
    expect(res.status).toBe(429);
    expect(res.body.code).toBe("rate_limited");
    expect(res.headers["retry-after"]).toBeDefined();
  });

  it("business_rule_violation is 422, not 403", async () => {
    const res = await request(app).get("/t/rule");
    expect(res.status).toBe(422);
    expect(res.body.code).toBe("business_rule_violation");
  });

  it("payment_required, provider_error and verification_pending map correctly", async () => {
    expect((await request(app).get("/t/pay")).status).toBe(402);
    expect((await request(app).get("/t/provider")).status).toBe(502);
    const pending = await request(app).get("/t/pending");
    expect(pending.status).toBe(202);
    expect(pending.body.code).toBe("verification_pending");
  });

  it("internal errors hide details but keep the request id", async () => {
    const res = await request(app).get("/t/boom");
    expect(res.status).toBe(500);
    expect(res.body.code).toBe("internal_error");
    expect(JSON.stringify(res.body)).not.toContain("kaboom");
    expect(res.body.requestId).toBe(res.headers["x-request-id"]);
  });

  it("echoes a caller request id end to end", async () => {
    const res = await request(app).get("/t/auth").set("x-request-id", "caller-123");
    expect(res.headers["x-request-id"]).toBe("caller-123");
  });

  it("instrumentation boots without a DSN", () => {
    expect(() => initInstrumentation({ logger: silentLogger() })).not.toThrow();
  });
});
