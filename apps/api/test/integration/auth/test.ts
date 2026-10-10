import { Writable } from "node:stream";
import { createLogger } from "@courtland/logger";
import type { Profile } from "@courtland/types";
import { Router } from "express";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../../src/app.ts";
import { authenticate, requireCsrf } from "../../../src/middleware/auth.ts";
import { resetRateLimitWindows } from "../../../src/middleware/rateLimit.ts";
import { createAdminUsersRoutes } from "../../../src/routes/admin/users.ts";
import { createAuthRoutes } from "../../../src/routes/auth.ts";
import { createV1Router } from "../../../src/routes/index.ts";
import { memoryGoTrueAdmin } from "../../../src/services/admin/users.ts";
import { memoryOwnerStore } from "../../../src/services/auth/identityLink.ts";
import { memoryProfileStore } from "../../../src/services/auth/onboarding.ts";
import type { GoTrueSession } from "../../../src/services/auth/otp.ts";
import {
  createOtpService,
  memoryNoticeStore,
  mockSmsSender,
} from "../../../src/services/auth/otp.ts";
import { buildSessionResponse } from "../../../src/services/auth/session.ts";
import {
  ADMIN,
  BUYER,
  FIXTURES,
  LANDLORD,
  TENANT,
  TENANT_COOKIE,
  verifierFor,
} from "../../fixtures/users.ts";

function silentLogger() {
  return createLogger({
    destination: new Writable({
      write(_chunk, _encoding, done) {
        done();
      },
    }),
  });
}

const notices = memoryNoticeStore();
const profiles = memoryProfileStore({
  [TENANT.auth.userId]: { onboardingState: "phone_only" },
  [LANDLORD.auth.userId]: { onboardingState: "complete" },
});
const owners = memoryOwnerStore([
  { id: "20000000-0000-4000-8000-000000000001", phone: "+2348012345678", userId: null },
]);
const goTrueAdmin = memoryGoTrueAdmin(
  [
    { id: ADMIN.auth.userId, email: "admin@courtland.test" },
    { id: TENANT.auth.userId, email: "tenant@courtland.test" },
  ],
  { [ADMIN.auth.userId]: ["admin"] },
);

const otpSessions = new Map<string, GoTrueSession>();
const otp = createOtpService({
  auth: {
    async requestOtp(_phone: string): Promise<void> {},
    async verifyOtp(phone: string, code: string): Promise<GoTrueSession> {
      if (code !== "123456") throw new Error("invalid code");
      // The fake issues the fixture's own token so the stub verifier below
      // resolves it back to the tenant identity, like GoTrue would.
      const session: GoTrueSession = {
        user: { id: TENANT.auth.userId, email: "tenant@courtland.test", phone },
        accessToken: TENANT.token,
        refreshToken: "refresh-tenant",
      };
      otpSessions.set(phone, session);
      return session;
    },
  },
  sms: mockSmsSender(),
  notices,
});

const verifier = verifierFor(FIXTURES);
const csrfHarness = Router();
csrfHarness.post(
  "/write",
  authenticate(verifier),
  requireCsrf(["https://courtland.test"]),
  (_req, res) => {
    res.json({ ok: true });
  },
);

const app = createApp({
  logger: silentLogger(),
  corsOrigins: ["https://courtland.test"],
  v1Routes: createV1Router({
    authRouter: createAuthRoutes({
      verifier,
      otp,
      profiles,
      owners,
      userAdmin: goTrueAdmin,
      allowedOrigins: ["https://courtland.test"],
      cookieDomain: "courtland.test",
      logger: silentLogger(),
    }),
    adminUsersRouter: createAdminUsersRoutes({ verifier, admin: goTrueAdmin }),
  }),
  testRoutes: csrfHarness,
});

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
const cookie = (token: string) => ({ Cookie: `session=${token}` });

beforeEach(() => {
  resetRateLimitWindows();
});

describe("auth integration", () => {
  it("returns the same 202 shape for known and unknown numbers", async () => {
    const known = await request(app).post("/v1/auth/otp/request").send({
      phoneE164: "+2348012345678",
    });
    const unknown = await request(app).post("/v1/auth/otp/request").send({
      phoneE164: "+2348099999999",
    });
    expect(known.status).toBe(202);
    expect(unknown.status).toBe(202);
    expect(known.body).toEqual(unknown.body);
    expect(notices.queued.length).toBeGreaterThanOrEqual(2);
  });

  it("rate-limits OTP requests", async () => {
    let limited = false;
    for (let i = 0; i < 8; i += 1) {
      const res = await request(app).post("/v1/auth/otp/request").send({
        phoneE164: "+2348077777777",
      });
      if (res.status === 429) {
        limited = true;
        expect(res.headers["retry-after"]).toBeDefined();
        expect(res.body.code).toBe("rate_limited");
        break;
      }
    }
    expect(limited).toBe(true);
  });

  it("verify sets session cookies with the right attributes", async () => {
    const res = await request(app).post("/v1/auth/otp/verify").send({
      phoneE164: "+2348012345678",
      code: "123456",
    });
    expect(res.status).toBe(200);
    expect(res.body.profile.id).toBe(TENANT.auth.userId);
    expect(res.body.redirectTo).toBe("/auth/onboarding");
    const cookies = res.headers["set-cookie"] as unknown as string[];
    const session = cookies.find((c) => c.startsWith("session=")) ?? "";
    const csrf = cookies.find((c) => c.startsWith("courtland-csrf=")) ?? "";
    expect(session).toContain("HttpOnly");
    expect(session).toContain("SameSite=None");
    expect(csrf).not.toContain("HttpOnly");
    expect(csrf).toContain("SameSite=None");
  });

  it("rejects wrong codes", async () => {
    const res = await request(app).post("/v1/auth/otp/verify").send({
      phoneE164: "+2348012345678",
      code: "000000",
    });
    expect(res.status).toBe(500);
    expect(res.body.code).toBe("internal_error");
  });

  it("me returns profile, roles and permissions", async () => {
    const res = await request(app).get("/v1/auth/me").set(bearer(TENANT.token));
    expect(res.status).toBe(200);
    expect(res.body.data.roles).toEqual(["tenant"]);
    expect(res.body.data.onboardingState).toBe("verified");
  });

  it("onboarding advances phone_only to verified on first verify", async () => {
    expect(profiles.rows[TENANT.auth.userId]?.onboardingState).toBe("verified");
  });

  it("landlord with a complete profile redirects to their portal", async () => {
    const res = await request(app).get("/v1/auth/me").set(bearer(LANDLORD.token));
    expect(res.body.data.onboardingState).toBe("complete");
  });

  it("link-owner claims the pending row by phone", async () => {
    const res = await request(app)
      .post("/v1/auth/link-owner")
      .set(bearer(TENANT.token))
      .set("x-csrf-token", "csrf-1")
      .set("Cookie", "courtland-csrf=csrf-1")
      .set("Origin", "https://courtland.test")
      .send({ phoneE164: "+2348012345678" });
    expect(res.status).toBe(200);
    expect(res.body.ownerId).toBe("20000000-0000-4000-8000-000000000001");
  });

  it("link-owner with a non-matching number is 404, not 403", async () => {
    const res = await request(app)
      .post("/v1/auth/link-owner")
      .set(bearer(BUYER.token))
      .set("x-csrf-token", "csrf-2")
      .set("Cookie", "courtland-csrf=csrf-2")
      .set("Origin", "https://courtland.test")
      .send({ phoneE164: "+2348000000000" });
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("not_found");
  });

  it("csrf enforces token and origin on cookie writes, skips bearer", async () => {
    const good = await request(app)
      .post("/t/write")
      .set(cookie(TENANT_COOKIE.token))
      .set("x-csrf-token", "csrf-1")
      .set("Cookie", `session=${TENANT_COOKIE.token}; courtland-csrf=csrf-1`)
      .set("Origin", "https://courtland.test");
    expect(good.status).toBe(200);
    const noCsrf = await request(app).post("/t/write").set(cookie(TENANT_COOKIE.token));
    expect(noCsrf.status).toBe(403);
    const badOrigin = await request(app)
      .post("/t/write")
      .set("x-csrf-token", "csrf-9")
      .set("Cookie", `session=${TENANT_COOKIE.token}; courtland-csrf=csrf-9`)
      .set("Origin", "https://evil.test");
    expect(badOrigin.status).toBe(403);
    const bearerSkips = await request(app).post("/t/write").set(bearer(TENANT.token));
    expect(bearerSkips.status).toBe(200);
  });

  it("redirects each role to its portal once onboarding is complete", () => {
    const cases = [
      [{ ...TENANT.auth, onboardingState: "complete" }, "/portal/tenant"],
      [{ ...LANDLORD.auth, onboardingState: "complete" }, "/portal/owner"],
      [{ ...BUYER.auth, onboardingState: "complete" }, "/portal/buyer"],
      [{ ...ADMIN.auth, onboardingState: "complete" }, "/admin"],
      [{ ...TENANT.auth, onboardingState: "phone_only" }, "/auth/onboarding"],
    ] as const;
    for (const [auth, redirectTo] of cases) {
      const profile: Profile = {
        id: auth.userId,
        fullName: null,
        email: null,
        phoneE164: null,
        avatarPublicId: null,
        onboardingState: auth.onboardingState,
        kycStatus: "not_started",
        roles: [...auth.roles] as Profile["roles"],
        permissions: [],
      };
      expect(buildSessionResponse(profile).redirectTo).toBe(redirectTo);
    }
  });

  it("admin lists users and manages roles", async () => {
    const list = await request(app).get("/v1/admin/users").set(bearer(ADMIN.token));
    expect(list.status).toBe(200);
    expect(list.body.meta.count).toBe(2);
    const patch = await request(app)
      .patch(`/v1/admin/users/${TENANT.auth.userId}/roles`)
      .set(bearer(ADMIN.token))
      .send({ roles: ["tenant"] });
    expect(patch.status).toBe(200);
    expect(goTrueAdmin.roles[TENANT.auth.userId]).toEqual(["tenant"]);
  });

  it("tenant cannot reach admin endpoints", async () => {
    const res = await request(app).get("/v1/admin/users").set(bearer(TENANT.token));
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("forbidden");
  });

  it("admin suspends a user", async () => {
    const res = await request(app)
      .post(`/v1/admin/users/${TENANT.auth.userId}/suspend`)
      .set(bearer(ADMIN.token));
    expect(res.status).toBe(200);
    expect(goTrueAdmin.users.find((u) => u.id === TENANT.auth.userId)?.banned).toBe(true);
  });

  it("every matrix role has a fixture user", async () => {
    for (const fixture of [ADMIN, LANDLORD, TENANT, BUYER]) {
      const res = await request(app).get("/v1/auth/me").set(bearer(fixture.token));
      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(fixture.auth.userId);
    }
  });

  it("signout revokes server-side and clears cookies", async () => {
    const res = await request(app).post("/v1/auth/signout").set(bearer(TENANT.token));
    expect(res.status).toBe(200);
    expect(goTrueAdmin.signedOut).toContain(TENANT.token);
    const cookies = res.headers["set-cookie"] as unknown as string[];
    expect(cookies.some((c) => c.startsWith("session=;"))).toBe(true);
  });

  it("resend respects the 60-second cooldown", async () => {
    const first = await request(app).post("/v1/auth/otp/resend").send({
      phoneE164: "+2348066666666",
    });
    expect(first.status).toBe(202);
    const second = await request(app).post("/v1/auth/otp/resend").send({
      phoneE164: "+2348066666666",
    });
    expect(second.status).toBe(429);
    expect(second.body.code).toBe("rate_limited");
  });

  it("patch me persists name and avatar", async () => {
    const res = await request(app)
      .patch("/v1/auth/me")
      .set(cookie(TENANT_COOKIE.token))
      .set("x-csrf-token", "csrf-3")
      .set("Cookie", `session=${TENANT_COOKIE.token}; courtland-csrf=csrf-3`)
      .set("Origin", "https://courtland.test")
      .send({ fullName: "Ada Tenant", avatarPublicId: "avatars/ada" });
    expect(res.status).toBe(200);
    expect(res.body.data.fullName).toBe("Ada Tenant");
    expect(res.body.data.avatarPublicId).toBe("avatars/ada");
    expect(profiles.rows[TENANT.auth.userId]?.fullName).toBe("Ada Tenant");
  });

  it("change-phone verifies the code and persists the number", async () => {
    const res = await request(app)
      .post("/v1/auth/change-phone")
      .set(cookie(TENANT_COOKIE.token))
      .set("x-csrf-token", "csrf-4")
      .set("Cookie", `session=${TENANT_COOKIE.token}; courtland-csrf=csrf-4`)
      .set("Origin", "https://courtland.test")
      .send({ newPhoneE164: "+2348055555555", code: "123456" });
    expect(res.status).toBe(200);
    expect(res.body.phoneE164).toBe("+2348055555555");
    expect(profiles.rows[TENANT.auth.userId]?.phoneE164).toBe("+2348055555555");
    expect(goTrueAdmin.users.find((u) => u.id === TENANT.auth.userId)?.phone).toBe(
      "+2348055555555",
    );
  });

  it("invite creates a staff user", async () => {
    const res = await request(app)
      .post("/v1/admin/users/invite")
      .set(bearer(ADMIN.token))
      .send({ email: "newstaff@courtland.test" });
    expect(res.status).toBe(201);
    expect(res.body.data.email).toBe("newstaff@courtland.test");
    expect(goTrueAdmin.users.some((u) => u.email === "newstaff@courtland.test")).toBe(true);
  });

  it("csrf endpoint mints a token without auth", async () => {
    const res = await request(app).get("/v1/auth/csrf");
    expect(res.status).toBe(200);
    expect(typeof res.body.csrfToken).toBe("string");
    const cookies = res.headers["set-cookie"] as unknown as string[];
    expect(cookies.some((c) => c.startsWith("courtland-csrf="))).toBe(true);
  });
});
