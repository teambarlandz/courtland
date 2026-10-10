// routes/auth.ts — OTP, session, profile, owner link (docs/08 §10 Auth).
// Factory takes services; tests inject fakes, server.ts wires GoTrue.
// Rate limits: OTP endpoints are limited by number and IP.

import type { Logger } from "@courtland/logger";
import type { Profile } from "@courtland/types";
import {
  ChangePhone,
  LinkOwner,
  OtpRequest,
  OtpResend,
  OtpVerify,
  ProfilePatch,
} from "@courtland/types";
import { Router } from "express";
import { createServiceClient as createAdminClient } from "../integrations/supabase/admin.ts";
import { createAnonClient } from "../integrations/supabase/client.ts";
import { NotFoundError, UnauthenticatedError } from "../lib/errors.ts";
import type { AuthVerifier } from "../middleware/auth.ts";
import { authenticate, requireCsrf, supabaseSessionVerifier } from "../middleware/auth.ts";
import { rateLimit } from "../middleware/rateLimit.ts";
import { validate } from "../middleware/validate.ts";
import type { GoTrueAdmin } from "../services/admin/users.ts";
import { supabaseGoTrueAdmin } from "../services/admin/users.ts";
import type { OwnerStore } from "../services/auth/identityLink.ts";
import { supabaseOwnerStore } from "../services/auth/identityLink.ts";
import type { ProfileStore } from "../services/auth/onboarding.ts";
import { advanceOnboarding, supabaseProfileStore } from "../services/auth/onboarding.ts";
import type { OtpService } from "../services/auth/otp.ts";
import {
  createOtpService,
  mockSmsSender,
  supabaseGoTrue,
  supabaseNoticeStore,
} from "../services/auth/otp.ts";
import {
  buildSessionResponse,
  clearSessionCookies,
  generateCsrfToken,
  sessionCookies,
} from "../services/auth/session.ts";

interface AuthRouteDeps {
  verifier: AuthVerifier;
  otp: OtpService;
  profiles: ProfileStore;
  owners: OwnerStore;
  userAdmin: GoTrueAdmin;
  allowedOrigins: readonly string[];
  cookieDomain: string;
  logger?: Logger;
}

function toProfile(input: {
  id: string;
  fullName: string | null;
  email: string | null;
  phoneE164: string | null;
  avatarPublicId: string | null;
  onboardingState: string;
  roles: string[];
  permissions: string[];
}): Profile {
  return {
    id: input.id,
    fullName: input.fullName,
    email: input.email,
    phoneE164: input.phoneE164,
    avatarPublicId: input.avatarPublicId,
    onboardingState: input.onboardingState as Profile["onboardingState"],
    kycStatus: "not_started",
    roles: input.roles as Profile["roles"],
    permissions: input.permissions as Profile["permissions"],
  };
}

export function createAuthRoutes(deps: AuthRouteDeps) {
  const router = Router();
  const otpByNumberAndIp = rateLimit({
    windowMs: 60_000,
    max: 5,
    key: (req) =>
      `${req.ip ?? "unknown"}:${String((req.body as { phoneE164?: unknown })?.phoneE164 ?? "")}`,
  });
  // Code entry is the brute-force surface: tighter than request, same key.
  const verifyByNumberAndIp = rateLimit({
    windowMs: 60_000,
    max: 10,
    key: (req) =>
      `${req.ip ?? "unknown"}:${String((req.body as { phoneE164?: unknown })?.phoneE164 ?? "")}`,
  });

  router.post(
    "/otp/request",
    otpByNumberAndIp,
    validate({ body: OtpRequest }),
    async (req, res, next) => {
      try {
        const { phoneE164 } = OtpRequest.parse(req.body);
        await deps.otp.requestOtp(phoneE164);
        res.status(202).json({ message: "If the number exists, a code was sent." });
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/otp/verify",
    verifyByNumberAndIp,
    validate({ body: OtpVerify }),
    async (req, res, next) => {
      try {
        const { phoneE164, code } = OtpVerify.parse(req.body);
        const session = await deps.otp.verifyOtp(phoneE164, code);
        await advanceOnboarding(deps.profiles, session.user.id, "verify").catch(() => undefined);
        // Resolve the full identity (roles included) through the verifier so
        // the bootstrap response never ships empty roles.
        const auth = await deps.verifier(session.accessToken);
        const stored = await deps.profiles.getProfile(session.user.id).catch(() => null);
        const response = buildSessionResponse(
          toProfile({
            id: session.user.id,
            fullName: stored?.fullName ?? null,
            email: session.user.email ?? auth.email ?? null,
            phoneE164: session.user.phone ?? phoneE164,
            avatarPublicId: stored?.avatarPublicId ?? null,
            onboardingState: stored?.onboardingState ?? "verified",
            roles: auth.roles,
            permissions: auth.permissions,
          }),
        );
        const csrf = generateCsrfToken();
        const cookies = sessionCookies(
          session.accessToken,
          session.refreshToken,
          csrf,
          deps.cookieDomain,
        );
        res.setHeader("Set-Cookie", [cookies.session, cookies.csrf]);
        res.json(response);
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/otp/resend",
    otpByNumberAndIp,
    validate({ body: OtpResend }),
    async (req, res, next) => {
      try {
        const { phoneE164 } = OtpResend.parse(req.body);
        await deps.otp.resendOtp(phoneE164);
        res.status(202).json({ message: "If the number exists, a code was sent." });
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/signout",
    authenticate(deps.verifier),
    requireCsrf(deps.allowedOrigins),
    async (req, res, next) => {
      try {
        // Revoke the refresh family server-side; cookie clearing below still
        // runs if revocation fails, so the browser always ends logged out.
        if (req.authToken) {
          await deps.userAdmin.signOut(req.authToken).catch(() => undefined);
        }
        const cleared = clearSessionCookies(deps.cookieDomain);
        res.setHeader("Set-Cookie", [cleared.session, cleared.csrf]);
        res.json({ message: "Signed out." });
      } catch (error) {
        next(error);
      }
    },
  );

  router.get("/me", authenticate(deps.verifier), async (req, res, next) => {
    try {
      const auth = req.auth;
      if (!auth) throw new UnauthenticatedError();
      const stored = await deps.profiles.getProfile(auth.userId).catch(() => null);
      res.json({
        data: toProfile({
          id: auth.userId,
          fullName: stored?.fullName ?? null,
          email: auth.email ?? null,
          phoneE164: stored?.phoneE164 ?? auth.phone ?? null,
          avatarPublicId: stored?.avatarPublicId ?? null,
          onboardingState: stored?.onboardingState ?? "phone_only",
          roles: auth.roles,
          permissions: auth.permissions,
        }),
      });
    } catch (error) {
      next(error);
    }
  });

  router.patch(
    "/me",
    authenticate(deps.verifier),
    requireCsrf(deps.allowedOrigins),
    validate({ body: ProfilePatch }),
    async (req, res, next) => {
      try {
        const auth = req.auth;
        if (!auth) throw new UnauthenticatedError();
        const patch = ProfilePatch.parse(req.body);
        await advanceOnboarding(deps.profiles, auth.userId, "save-profile", {
          ...(patch.fullName !== undefined && patch.fullName !== null
            ? { fullName: patch.fullName }
            : {}),
          ...(patch.avatarPublicId !== undefined && patch.avatarPublicId !== null
            ? { avatarPublicId: patch.avatarPublicId }
            : {}),
        }).catch(() => undefined);
        const stored = await deps.profiles.getProfile(auth.userId).catch(() => null);
        res.json({
          data: toProfile({
            id: auth.userId,
            fullName: stored?.fullName ?? patch.fullName ?? null,
            email: auth.email ?? null,
            phoneE164: stored?.phoneE164 ?? auth.phone ?? null,
            avatarPublicId: stored?.avatarPublicId ?? patch.avatarPublicId ?? null,
            onboardingState: stored?.onboardingState ?? "phone_only",
            roles: auth.roles,
            permissions: auth.permissions,
          }),
        });
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/link-owner",
    authenticate(deps.verifier),
    requireCsrf(deps.allowedOrigins),
    validate({ body: LinkOwner }),
    async (req, res, next) => {
      try {
        const auth = req.auth;
        if (!auth?.phone) throw new UnauthenticatedError();
        const { phoneE164 } = LinkOwner.parse(req.body);
        if (phoneE164 !== auth.phone)
          throw new NotFoundError("No pending owner row for this number.");
        const claimed = await deps.owners.claimByPhone(auth.userId, phoneE164);
        if (!claimed) throw new NotFoundError("No pending owner row for this number.");
        res.json({ message: "Owner row claimed.", ownerId: claimed.ownerId });
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/change-phone",
    authenticate(deps.verifier),
    requireCsrf(deps.allowedOrigins),
    validate({ body: ChangePhone }),
    async (req, res, next) => {
      try {
        const auth = req.auth;
        if (!auth) throw new UnauthenticatedError();
        const { newPhoneE164, code } = ChangePhone.parse(req.body);
        await deps.otp.verifyOtp(newPhoneE164, code);
        // Persist everywhere the number is read from: GoTrue owns phone auth,
        // profiles mirrors it for queries. Both must succeed together.
        await deps.userAdmin.updatePhone(auth.userId, newPhoneE164);
        await deps.profiles.updateProfile(auth.userId, { phoneE164: newPhoneE164 });
        res.json({ message: "Number changed.", phoneE164: newPhoneE164 });
      } catch (error) {
        next(error);
      }
    },
  );

  router.get("/csrf", (_req, res) => {
    const csrf = generateCsrfToken();
    res.setHeader("Set-Cookie", `courtland-csrf=${csrf}; Domain=${deps.cookieDomain}; Path=/`);
    res.json({ csrfToken: csrf });
  });

  return router;
}

interface SupabaseAuthWiring {
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseServiceKey: string;
  allowedOrigins: readonly string[];
  cookieDomain: string;
  logger?: Logger;
}

export function wireAuthRoutes(wiring: SupabaseAuthWiring) {
  const anon = createAnonClient(wiring.supabaseUrl, wiring.supabaseAnonKey);
  const admin = createAdminClient(wiring.supabaseUrl, wiring.supabaseServiceKey);
  return createAuthRoutes({
    verifier: supabaseSessionVerifier(wiring.supabaseUrl, wiring.supabaseAnonKey, admin),
    otp: createOtpService({
      auth: supabaseGoTrue(anon),
      sms: mockSmsSender(wiring.logger),
      notices: supabaseNoticeStore(admin),
      logger: wiring.logger,
    }),
    profiles: supabaseProfileStore(anon),
    owners: supabaseOwnerStore(admin),
    userAdmin: supabaseGoTrueAdmin(admin),
    allowedOrigins: wiring.allowedOrigins,
    cookieDomain: wiring.cookieDomain,
    logger: wiring.logger,
  });
}
