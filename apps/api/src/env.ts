// src/env.ts — Zod-validated process.env, fails fast (docs/22 §3).
// Every name comes from @courtland/config env-names; the shape (required,
// defaults, production rules) mirrors the docs/22 tables including the §3
// superRefine. Imported only by server entry points and env tests — never by
// route handlers (docs/22 §11 import boundary).
import { z } from "zod";

const EnvSchema = z
  .strictObject({
    NODE_ENV: z.enum(["development", "test", "production"]),
    PORT: z.coerce.number().int().positive().default(4000),
    TZ: z.string().default("Africa/Lagos"),
    APP_URL: z.string().url(),
    ADMIN_URL: z.string().url(),
    CORS_ORIGINS: z.string().min(1),
    LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
    GIT_SHA: z.string().default("local"),
    SUPABASE_URL: z.string().url(),
    SUPABASE_ANON_KEY: z.string().min(1),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
    SUPABASE_DB_PASSWORD: z.string().min(1),
    DATABASE_URL: z.string().min(1),
    PAYSTACK_SECRET_KEY: z.string().min(1),
    PAYSTACK_PUBLIC_KEY: z.string().min(1),
    PAYSTACK_WEBHOOK_SECRET: z.string().min(1),
    PAYSTACK_PAYMENT_LAG_DAYS: z.coerce.number().int().min(0).default(3),
    PAYSTACK_SUBACCOUNT_PREFIX: z.string().default("courtland"),
    CLOUDINARY_CLOUD_NAME: z.string().min(1),
    CLOUDINARY_API_KEY: z.string().min(1),
    CLOUDINARY_API_SECRET: z.string().min(1),
    NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: z.string().min(1),
    SMS_PROVIDER: z.enum(["mock", "termii", "msg", "twilio", "sendchamp"]).default("mock"),
    SMS_SENDER_ID: z.string().default("Courtland"),
    SMS_HOOK_SECRET: z.string().min(1),
    TERMII_API_KEY: z.string().optional(),
    TWILIO_ACCOUNT_SID: z.string().optional(),
    TWILIO_AUTH_TOKEN: z.string().optional(),
    TWILIO_FROM_NUMBER: z.string().optional(),
    MSG_API_KEY: z.string().optional(),
    SENDCHAMP_API_KEY: z.string().optional(),
    RESEND_API_KEY: z.string().min(1),
    RESEND_FROM: z.string().min(1),
    RESEND_WEBHOOK_SECRET: z.string().min(1),
    INNGEST_EVENT_KEY: z.string().min(1),
    INNGEST_SIGNING_KEY: z.string().min(1),
    INTERNAL_JOB_TOKEN: z.string().min(1),
    CRON_TZ: z.string().default("Africa/Lagos"),
    REDIS_URL: z.string().optional(),
    DATABASE_POOL_MAX: z.coerce.number().int().positive().default(10),
    METRICS_TOKEN: z.string().min(1),
    SENTRY_DSN: z.string().optional(),
    SENTRY_AUTH_TOKEN: z.string().optional(),
    SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0.1),
    POSTHOG_API_KEY: z.string().optional(),
    POSTHOG_HOST: z.string().default("https://eu.i.posthog.com"),
    NEXT_PUBLIC_ENABLE_WHATSAPP_OTP: z.stringbool().default(false),
    NEXT_PUBLIC_ENABLE_SAVED_SEARCH_ALERTS: z.stringbool().default(true),
    NEXT_PUBLIC_ENABLE_360_VIEWER: z.stringbool().default(false),
    ENABLE_MAINTENANCE_MODULE: z.stringbool().default(true),
    ENABLE_AUDIT_EXPORT: z.stringbool().default(false),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === "production") {
      if (env.SMS_PROVIDER === "mock") {
        ctx.addIssue({ code: "custom", message: "SMS_PROVIDER mock is banned in production" });
      }
      if (!env.SENDCHAMP_API_KEY) {
        ctx.addIssue({ code: "custom", message: "SENDCHAMP_API_KEY is required in production" });
      }
      if (!env.PAYSTACK_SECRET_KEY.startsWith("sk_live_")) {
        ctx.addIssue({ code: "custom", message: "PAYSTACK_SECRET_KEY must be live in production" });
      }
      if (!env.REDIS_URL) {
        ctx.addIssue({ code: "custom", message: "REDIS_URL is required in production" });
      }
    }
  });

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  return EnvSchema.parse(source);
}
