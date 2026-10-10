// middleware/idempotency.ts — reserve, replay (docs/08 §7).
// The store is injected: production passes a Drizzle-backed store (lands with
// the first route that needs it — Phase 4 at the earliest), tests pass the
// in-memory store. Same semantics both ways: hash mismatch replays 409,
// in-progress replays 409, completed replays the original status and body.
import { createHash } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { IdempotencyInProgressError, IdempotencyKeyReusedError } from "../lib/errors.ts";

export type IdempotencyOutcome =
  | { readonly kind: "proceed" }
  | { readonly kind: "replay"; readonly status: number; readonly body: unknown }
  | { readonly kind: "reused" }
  | { readonly kind: "in-progress" };

export interface IdempotencyStore {
  reserve(key: string, fingerprint: string): Promise<IdempotencyOutcome>;
  complete(key: string, status: number, body: unknown): Promise<void>;
  fail(key: string): Promise<void>;
}

function fingerprintOf(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(value) ?? "")
    .digest("hex");
}

type Row = {
  fingerprint: string;
  status: "in_progress" | "completed";
  code?: number;
  body?: unknown;
};

export function memoryIdempotencyStore(): IdempotencyStore {
  const rows = new Map<string, Row>();
  return {
    async reserve(key: string, fingerprint: string): Promise<IdempotencyOutcome> {
      const existing = rows.get(key);
      if (!existing) {
        rows.set(key, { fingerprint, status: "in_progress" });
        return { kind: "proceed" };
      }
      if (existing.fingerprint !== fingerprint) return { kind: "reused" };
      if (existing.status === "in_progress") return { kind: "in-progress" };
      return { kind: "replay", status: existing.code ?? 200, body: existing.body };
    },
    async complete(key: string, status: number, body: unknown): Promise<void> {
      const existing = rows.get(key);
      if (existing) rows.set(key, { ...existing, status: "completed", code: status, body });
    },
    async fail(key: string): Promise<void> {
      rows.delete(key);
    },
  };
}

function sendReplay(res: Response, status: number, body: unknown): void {
  res.status(status);
  if (typeof body === "object" && body !== null) res.json(body);
  else res.send(body as string);
}

export function idempotency(store: IdempotencyStore) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const key = req.header("Idempotency-Key");
    if (!key) {
      next();
      return;
    }
    const outcome = await store.reserve(key, fingerprintOf(req.body)).catch(next);
    if (!outcome || typeof outcome !== "object") return;
    if (outcome.kind === "proceed") {
      const originalJson = res.json.bind(res);
      const originalSend = res.send.bind(res);
      let settled = false;
      const complete = (status: number, body: unknown): void => {
        if (settled) return;
        settled = true;
        store.complete(key, status, body).catch(() => undefined);
      };
      res.json = ((body: unknown) => {
        complete(res.statusCode, body);
        return originalJson(body);
      }) as typeof res.json;
      res.send = ((body: unknown) => {
        complete(res.statusCode, body);
        return originalSend(body as string);
      }) as typeof res.send;
      res.on("close", () => {
        if (!settled && res.statusCode >= 500) void store.fail(key);
      });
      next();
      return;
    }
    if (outcome.kind === "replay") {
      sendReplay(res, outcome.status, outcome.body);
      return;
    }
    if (outcome.kind === "reused") {
      next(new IdempotencyKeyReusedError());
      return;
    }
    next(new IdempotencyInProgressError());
  };
}
