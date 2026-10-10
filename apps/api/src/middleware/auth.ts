// middleware/auth.ts — verify the JWT, attach the profile (docs/08 §5).
// The verifier is injected so tests run without GoTrue: createApp defaults to
// the Supabase verifier, tests pass a stub. Reads req.auth afterwards;
// requirePermission (same file: one concern, one place) guards on it.
import type { NextFunction, Request, Response } from "express";
import { createAnonClient } from "../integrations/supabase/client.ts";
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
      authToken?: string;
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
  if (!session) return null;
  const raw = decodeURIComponent(session.slice("session=".length));
  try {
    const parsed = JSON.parse(raw) as { access_token?: unknown };
    if (typeof parsed.access_token === "string" && parsed.access_token.length > 0) {
      return { token: parsed.access_token, via: "cookie" };
    }
  } catch {
    // Not JSON: treat the whole value as the access token (test and legacy clients).
  }
  if (raw.length === 0) return null;
  return { token: raw, via: "cookie" };
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
      req.authToken = found.token;
      next();
    } catch (error) {
      next(error);
    }
  };
}

// supabaseSessionVerifier: the production verifier. GoTrue validates the
// token (the authority on identity); the admin client resolves roles and
// permissions from user_roles + role_permissions (the authority on access).
// Cookie and bearer callers converge here; req.auth.via records which.
export function supabaseSessionVerifier(
  supabaseUrl: string,
  anonKey: string,
  admin: import("@supabase/supabase-js").SupabaseClient,
): AuthVerifier {
  let anon: ReturnType<typeof createAnonClient> | undefined;
  return async (token: string): Promise<ReqAuth> => {
    anon ??= createAnonClient(supabaseUrl, anonKey);
    const { data, error } = await anon.auth.getUser(token);
    if (error || !data.user) throw new UnauthenticatedError("Invalid session");
    const base = {
      userId: data.user.id,
      email: data.user.email ?? undefined,
      phone: data.user.phone ?? undefined,
      via: "bearer" as const,
    };
    const { data: roleRows, error: roleError } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", base.userId);
    if (roleError) throw new UnauthenticatedError("Session has no roles");
    const roles = ((roleRows ?? []) as { role: string }[]).map((r) => r.role);
    const { data: permRows, error: permError } = await admin
      .from("role_permissions")
      .select("permission")
      .in("role", roles.length > 0 ? roles : ["__none__"]);
    if (permError) throw new UnauthenticatedError("Session has no permissions");
    return {
      ...base,
      roles,
      permissions: ((permRows ?? []) as { permission: string }[]).map((r) => r.permission),
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

const UNSAFE_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);

// requireCsrf: double-submit token plus exact Origin allowlist, only for
// cookie sessions on unsafe methods (docs/08 §5.1). Bearer callers skip:
// there is no ambient credential to forge. Failure is 403, never 401, so a
// missing token is not confused with a missing session.
export function requireCsrf(allowedOrigins: readonly string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (req.auth?.via !== "cookie" || !UNSAFE_METHODS.has(req.method)) {
      next();
      return;
    }
    const cookieHeader = req.header("cookie") ?? "";
    const csrfCookie = cookieHeader
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith("courtland-csrf="));
    const token = req.header("x-csrf-token") ?? "";
    const origin = req.header("origin") ?? "";
    if (!csrfCookie || token.length === 0 || csrfCookie.slice("courtland-csrf=".length) !== token) {
      next(new ForbiddenError("CSRF token missing or mismatched"));
      return;
    }
    if (!allowedOrigins.includes(origin)) {
      next(new ForbiddenError("Origin not allowed"));
      return;
    }
    next();
  };
}
