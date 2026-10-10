// middleware/rateLimit.ts — global, auth, payment and webhook limiters (docs/08 §5).
// In-memory fixed windows keyed by client IP (and route where given). This is
// correct for the single-instance kernel; a shared limiter moves behind this
// same factory signature when Redis arrives. 429 carries Retry-After.
import type { NextFunction, Request, Response } from "express";
import { RateLimitedError } from "../lib/errors.ts";

interface RateLimitOptions {
  windowMs: number;
  max: number;
  key?: (req: Request) => string;
}

interface Window {
  count: number;
  resetAt: number;
}

const registries = new Set<Map<string, Window>>();

export function resetRateLimitWindows(): void {
  for (const windows of registries) windows.clear();
}

const MAX_TRACKED_KEYS = 10_000;

export function rateLimit(options: RateLimitOptions) {
  const windowMs = options.windowMs;
  const max = options.max;
  const keyOf = options.key ?? ((req: Request): string => req.ip ?? "unknown");
  const windows = new Map<string, Window>();
  registries.add(windows);
  return (req: Request, res: Response, next: NextFunction): void => {
    const now = Date.now();
    if (windows.size > MAX_TRACKED_KEYS) {
      for (const [key, window] of windows) {
        if (window.resetAt <= now) windows.delete(key);
      }
    }
    const key = keyOf(req);
    let window = windows.get(key);
    if (!window || window.resetAt <= now) {
      window = { count: 0, resetAt: now + windowMs };
      windows.set(key, window);
    }
    window.count += 1;
    const remaining = Math.max(0, max - window.count);
    res.setHeader("X-RateLimit-Limit", String(max));
    res.setHeader("X-RateLimit-Remaining", String(remaining));
    if (window.count > max) {
      const retryAfterSeconds = Math.max(1, Math.ceil((window.resetAt - now) / 1000));
      res.setHeader("Retry-After", String(retryAfterSeconds));
      next(new RateLimitedError("Too many requests", retryAfterSeconds));
      return;
    }
    next();
  };
}
