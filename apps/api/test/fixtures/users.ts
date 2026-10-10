// test/fixtures/users.ts — one fake session per role, with sessions.
// DB-free stand-ins for authenticated callers: the token strings are opaque to
// the tests, and the stub verifier in the auth suite maps each to its ReqAuth.
// Every role in matrix.ts has a fixture user (Phase 4 dead-code gate).

import { UnauthenticatedError } from "../../src/lib/errors.ts";
import type { ReqAuth } from "../../src/middleware/auth.ts";

interface FixtureUser {
  token: string;
  auth: ReqAuth;
}

function fixture(
  role: string,
  permissions: string[],
  overrides: Partial<ReqAuth> = {},
): FixtureUser {
  const id = `10000000-0000-4000-8000-00000000000${role === "admin" ? 1 : role === "landlord" ? 2 : role === "tenant" ? 3 : 4}`;
  return {
    token: `test-token-${role}`,
    auth: {
      userId: id,
      email: `${role}@courtland.test`,
      phone: "+2348012345678",
      roles: [role],
      permissions,
      via: "bearer",
      ...overrides,
    },
  };
}

export const ADMIN = fixture("admin", ["user_manage", "property_publish"]);
export const LANDLORD = fixture("landlord", ["property_create"]);
export const TENANT = fixture("tenant", ["payment_create_own"]);
export const BUYER = fixture("buyer", ["payment_create_own"]);

export const TENANT_COOKIE: FixtureUser = {
  token: "cookie-session-tenant",
  auth: { ...TENANT.auth, via: "cookie" },
};

export const FIXTURES: Record<string, FixtureUser> = {
  ADMIN,
  LANDLORD,
  TENANT,
  BUYER,
  TENANT_COOKIE,
};

export function verifierFor(fixtures: Record<string, FixtureUser>) {
  const byToken = new Map(Object.values(fixtures).map((f) => [f.token, f.auth]));
  return async (token: string): Promise<ReqAuth> => {
    const found = byToken.get(token);
    if (!found) throw new UnauthenticatedError("Invalid session");
    return found;
  };
}
