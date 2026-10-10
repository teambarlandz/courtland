// services/auth/otp.ts — OTP request, verify, resend (docs/06 §3-4).
// Dependencies are injected (GoTrue, SMS, notices) so tests run without GoTrue
// or Postgres: scripted fakes assert the behaviour, the supabase-backed
// adapters below are thin enough to review. The real SMS provider chain lands
// in Phase 11; until then the mock sender logs instead of sending.

import type { Logger } from "@courtland/logger";
import type { SupabaseClient } from "@supabase/supabase-js";
import { RateLimitedError } from "../../lib/errors.ts";

interface SmsSender {
  sendSms(to: string, body: string): Promise<{ providerMessageId?: string }>;
}

export function mockSmsSender(logger?: Logger): SmsSender {
  return {
    async sendSms(to: string, _body: string): Promise<{ providerMessageId?: string }> {
      logger?.info({ to }, "mock sms send");
      return { providerMessageId: `mock-${Date.now()}` };
    },
  };
}

export interface GoTrueSession {
  user: { id: string; email?: string; phone?: string };
  accessToken: string;
  refreshToken: string;
}

interface GoTrueAuth {
  requestOtp(phone: string): Promise<void>;
  verifyOtp(phone: string, code: string): Promise<GoTrueSession>;
}

export function supabaseGoTrue(client: SupabaseClient): GoTrueAuth {
  return {
    async requestOtp(phone: string): Promise<void> {
      const { error } = await client.auth.signInWithOtp({ phone });
      if (error) throw new Error(`otp request failed: ${error.message}`);
    },
    async verifyOtp(phone: string, code: string): Promise<GoTrueSession> {
      const { data, error } = await client.auth.verifyOtp({ phone, token: code, type: "sms" });
      if (error || !data.session || !data.user) {
        throw new Error(`otp verify failed: ${error?.message ?? "no session"}`);
      }
      return {
        user: {
          id: data.user.id,
          email: data.user.email ?? undefined,
          phone: data.user.phone ?? undefined,
        },
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
      };
    },
  };
}

interface NoticeInput {
  kind: string;
  channel: string;
  address: string;
  templateKey: string;
  dedupeKey: string;
}

interface NoticeStore {
  queue(input: NoticeInput): Promise<{ id: string }>;
}

export function memoryNoticeStore(): NoticeStore & { queued: NoticeInput[] } {
  const queued: NoticeInput[] = [];
  return {
    queued,
    async queue(input: NoticeInput): Promise<{ id: string }> {
      queued.push(input);
      return { id: `notice-${queued.length}` };
    },
  };
}

export function supabaseNoticeStore(admin: SupabaseClient): NoticeStore {
  return {
    async queue(input: NoticeInput): Promise<{ id: string }> {
      const { data, error } = await admin
        .from("notices")
        .insert({
          kind: input.kind,
          channel: input.channel,
          recipient_address: input.address,
          template_key: input.templateKey,
          dedupe_key: input.dedupeKey,
        })
        .select("id")
        .single();
      if (error || !data) throw new Error(`notice queue failed: ${error?.message ?? "no row"}`);
      return { id: data.id as string };
    },
  };
}

export interface OtpService {
  requestOtp(phone: string): Promise<void>;
  verifyOtp(phone: string, code: string): Promise<GoTrueSession>;
  resendOtp(phone: string): Promise<void>;
}

const RESEND_COOLDOWN_MS = 60_000;

export function createOtpService(deps: {
  auth: GoTrueAuth;
  sms: SmsSender;
  notices?: NoticeStore;
  logger?: Logger;
}): OtpService {
  const lastSent = new Map<string, number>();
  const note = async (phone: string): Promise<void> => {
    if (!deps.notices) return;
    await deps.notices
      .queue({
        kind: "otp",
        channel: "sms",
        address: phone,
        templateKey: "otp_v1",
        dedupeKey: `otp:${phone}:${Date.now()}`,
      })
      .catch((error: unknown) => {
        deps.logger?.error({ err: error, phone }, "otp notice queue failed");
      });
  };
  return {
    async requestOtp(phone: string): Promise<void> {
      // Same shape for known and unknown numbers: no enumeration oracle.
      // Timing similarity is best-effort here; the response body is identical.
      await deps.auth.requestOtp(phone);
      lastSent.set(phone, Date.now());
      await note(phone);
    },
    async verifyOtp(phone: string, code: string): Promise<GoTrueSession> {
      return deps.auth.verifyOtp(phone, code);
    },
    async resendOtp(phone: string): Promise<void> {
      const last = lastSent.get(phone) ?? 0;
      if (Date.now() - last < RESEND_COOLDOWN_MS) {
        throw new RateLimitedError("Resend available after the 60-second cooldown");
      }
      await deps.auth.requestOtp(phone);
      lastSent.set(phone, Date.now());
      await note(phone);
    },
  };
}
