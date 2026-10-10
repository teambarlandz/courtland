// services/auth/session.ts — session bootstrap (docs/08 §5.1, docs/06 §7).
// Pure functions: profile + redirect destination, and the Set-Cookie values.
// Cookie attributes carry the security model (HttpOnly session, readable CSRF),
// so they are built — and asserted — here, not scattered across routes.
import { randomUUID } from "node:crypto";
import type { Profile } from "@courtland/types";

interface SessionResponse {
  profile: Profile;
  redirectTo: string;
}

function redirectFor(profile: Pick<Profile, "onboardingState" | "roles">): string {
  if (profile.onboardingState !== "complete") return "/auth/onboarding";
  if (profile.roles.includes("admin")) return "/admin";
  if (profile.roles.includes("landlord")) return "/portal/owner";
  if (profile.roles.includes("tenant")) return "/portal/tenant";
  if (profile.roles.includes("buyer")) return "/portal/buyer";
  return "/auth/onboarding";
}

export function buildSessionResponse(profile: Profile): SessionResponse {
  return { profile, redirectTo: redirectFor(profile) };
}

export function generateCsrfToken(): string {
  return randomUUID().replace(/-/g, "");
}

interface SessionCookies {
  session: string;
  csrf: string;
}

export function sessionCookies(
  accessToken: string,
  refreshToken: string,
  csrfToken: string,
  domain: string,
): SessionCookies {
  // One HttpOnly cookie carries the whole GoTrue session so browser clients
  // can refresh without ever seeing a token in JavaScript.
  const sessionValue = encodeURIComponent(
    JSON.stringify({ access_token: accessToken, refresh_token: refreshToken }),
  );
  const base = `Domain=${domain}; Path=/; Secure; SameSite=None`;
  return {
    session: `session=${sessionValue}; HttpOnly; ${base}`,
    csrf: `courtland-csrf=${encodeURIComponent(csrfToken)}; ${base}`,
  };
}

export function clearSessionCookies(domain: string): SessionCookies {
  const expired = `Domain=${domain}; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
  return {
    session: `session=; HttpOnly; ${expired}`,
    csrf: `courtland-csrf=; ${expired}`,
  };
}
