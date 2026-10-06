/**
 * Every environment variable name Courtland reads, as a const object.
 *
 * This file is the code side of the contract documented in
 * `docs/22-configuration-and-environments.md § 4`. The two must agree exactly:
 * `tooling/scripts/env-sync.mjs` parses the tables in that document and fails
 * when either side names a variable the other does not. A variable that exists
 * only in code is undocumented; a variable that exists only in the document is
 * unread. Both are bugs.
 *
 * Values equal the keys on purpose. The object exists so that code refers to a
 * variable by a checked name (`env.DATABASE_URL`) instead of a raw string, and
 * so a rename is a compile error rather than a silent `undefined` at runtime.
 * Reading `process.env` anywhere except the schema module is banned by the
 * import boundary (`docs/22 § 11`).
 */
export const env = {
  // 4.1 Core
  NODE_ENV: "NODE_ENV",
  PORT: "PORT",
  TZ: "TZ",
  APP_URL: "APP_URL",
  ADMIN_URL: "ADMIN_URL",
  CORS_ORIGINS: "CORS_ORIGINS",
  LOG_LEVEL: "LOG_LEVEL",
  GIT_SHA: "GIT_SHA",

  // 4.2 Supabase
  SUPABASE_URL: "SUPABASE_URL",
  SUPABASE_ANON_KEY: "SUPABASE_ANON_KEY",
  SUPABASE_SERVICE_ROLE_KEY: "SUPABASE_SERVICE_ROLE_KEY",
  SUPABASE_DB_PASSWORD: "SUPABASE_DB_PASSWORD",
  DATABASE_URL: "DATABASE_URL",

  // 4.3 Paystack
  PAYSTACK_SECRET_KEY: "PAYSTACK_SECRET_KEY",
  PAYSTACK_PUBLIC_KEY: "PAYSTACK_PUBLIC_KEY",
  PAYSTACK_WEBHOOK_SECRET: "PAYSTACK_WEBHOOK_SECRET",
  PAYSTACK_PAYMENT_LAG_DAYS: "PAYSTACK_PAYMENT_LAG_DAYS",
  PAYSTACK_SUBACCOUNT_PREFIX: "PAYSTACK_SUBACCOUNT_PREFIX",

  // 4.4 Cloudinary
  CLOUDINARY_CLOUD_NAME: "CLOUDINARY_CLOUD_NAME",
  CLOUDINARY_API_KEY: "CLOUDINARY_API_KEY",
  CLOUDINARY_API_SECRET: "CLOUDINARY_API_SECRET",
  NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: "NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME",

  // 4.5 SMS
  SMS_PROVIDER: "SMS_PROVIDER",
  SMS_SENDER_ID: "SMS_SENDER_ID",
  SMS_HOOK_SECRET: "SMS_HOOK_SECRET",
  TERMII_API_KEY: "TERMII_API_KEY",
  TWILIO_ACCOUNT_SID: "TWILIO_ACCOUNT_SID",
  TWILIO_AUTH_TOKEN: "TWILIO_AUTH_TOKEN",
  TWILIO_FROM_NUMBER: "TWILIO_FROM_NUMBER",
  MSG_API_KEY: "MSG_API_KEY",
  SENDCHAMP_API_KEY: "SENDCHAMP_API_KEY",

  // 4.6 Email
  RESEND_API_KEY: "RESEND_API_KEY",
  RESEND_FROM: "RESEND_FROM",
  RESEND_WEBHOOK_SECRET: "RESEND_WEBHOOK_SECRET",

  // 4.7 Inngest and jobs
  INNGEST_EVENT_KEY: "INNGEST_EVENT_KEY",
  INNGEST_SIGNING_KEY: "INNGEST_SIGNING_KEY",
  INTERNAL_JOB_TOKEN: "INTERNAL_JOB_TOKEN",
  CRON_TZ: "CRON_TZ",

  // 4.8 Infrastructure
  REDIS_URL: "REDIS_URL",
  DATABASE_POOL_MAX: "DATABASE_POOL_MAX",
  METRICS_TOKEN: "METRICS_TOKEN",
  SENTRY_DSN: "SENTRY_DSN",
  SENTRY_AUTH_TOKEN: "SENTRY_AUTH_TOKEN",
  SENTRY_TRACES_SAMPLE_RATE: "SENTRY_TRACES_SAMPLE_RATE",
  POSTHOG_API_KEY: "POSTHOG_API_KEY",
  POSTHOG_HOST: "POSTHOG_HOST",

  // 4.9 Build-time flags (environment variables, not feature_flags rows)
  NEXT_PUBLIC_ENABLE_WHATSAPP_OTP: "NEXT_PUBLIC_ENABLE_WHATSAPP_OTP",
  NEXT_PUBLIC_ENABLE_SAVED_SEARCH_ALERTS: "NEXT_PUBLIC_ENABLE_SAVED_SEARCH_ALERTS",
  NEXT_PUBLIC_ENABLE_360_VIEWER: "NEXT_PUBLIC_ENABLE_360_VIEWER",
  ENABLE_MAINTENANCE_MODULE: "ENABLE_MAINTENANCE_MODULE",
  ENABLE_AUDIT_EXPORT: "ENABLE_AUDIT_EXPORT",
} as const;

/** The name of any environment variable Courtland reads. */
export type EnvName = keyof typeof env;
