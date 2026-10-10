// middleware/auth.ts — verify the JWT, attach the profile (docs/08 §5).
// The verifier is injected so tests run without GoTrue: createApp defaults to
// the Supabase verifier, tests pass a stub. Reads req.auth afterwards;
// requirePermission (same file: one concern, one place) guards on it.
import type { NextFunction, Request, Response } from "express";
import { ForbiddenError, UnauthenticatedError } from "../lib/errors.ts";

export interface ReqAuth {
  userId: string;
  email?: string;
  phone?: string;
  roles: string[];
  permissions: string[];
  via: "cookie" | "bearer";
}

export type AuthVerifier = (token: string) => Promise<ReqAuth>;

declare global {
  namespace Express {
    interface Request {
      auth?: ReqAuth;
    }
  }
}

function bearerOrCookie(req: Request): { token: string; via: "cookie" | "bearer" } | null {
  const header = req.header("authorization");
  if (header?.startsWith("Bearer ")) {
    return { token: header.slice("Bearer ".length).trim(), via: "bearer" };
  }
  const cookieHeader = req.header("cookie") ?? "";
  const session = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("session="));
  if (session)
    return { token: decodeURIComponent(session.slice("session=".length)), via: "cookie" };
  return null;
}

export function authenticate(verifier: AuthVerifier) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const found = bearerOrCookie(req);
    if (!found || found.token.length === 0) {
      next(new UnauthenticatedError());
      return;
    }
    try {
      req.auth = await verifier(found.token);
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function supabaseVerifier(supabaseUrl: string, anonKey: string): AuthVerifier {
  let client: import("@supabase/supabase-js").SupabaseClient | undefined;
  return async (token: string): Promise<ReqAuth> => {
    if (!client) {
      const { createClient } = await import("@supabase/supabase-js");
      client = createClient(supabaseUrl, anonKey);
    }
    const { data, error } = await client.auth.getUser(token);
    if (error || !data.user) throw new UnauthenticatedError("Invalid session");
    return {
      userId: data.user.id,
      email: data.user.email ?? undefined,
      phone: data.user.phone ?? undefined,
      roles: [],
      permissions: [],
      via: "bearer",
    };
  };
}

export function requirePermission(permission: string) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.auth) {
      next(new UnauthenticatedError());
      return;
    }
    if (!req.auth.permissions.includes(permission)) {
      next(new ForbiddenError(`Requires permission: ${permission}`));
      return;
    }
    next();
  };
}
