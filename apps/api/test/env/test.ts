import { describe, expect, it } from "vitest";
import type { Env } from "../../src/env.ts";
import { loadEnv } from "../../src/env.ts";

const BASE = {
  NODE_ENV: "test",
  APP_URL: "https://api.courtland.test",
  ADMIN_URL: "https://admin.courtland.test",
  CORS_ORIGINS: "https://courtland.test",
  SUPABASE_URL: "https://xyz.supabase.co",
  SUPABASE_ANON_KEY: "anon",
  SUPABASE_SERVICE_ROLE_KEY: "service",
  SUPABASE_DB_PASSWORD: "postgres",
  DATABASE_URL: "postgresql://postgres:postgres@localhost/postgres",
  PAYSTACK_SECRET_KEY: "sk_test_x",
  PAYSTACK_PUBLIC_KEY: "pk_test_x",
  PAYSTACK_WEBHOOK_SECRET: "whsec",
  CLOUDINARY_CLOUD_NAME: "demo",
  CLOUDINARY_API_KEY: "key",
  CLOUDINARY_API_SECRET: "secret",
  NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: "demo",
  SMS_HOOK_SECRET: "hook",
  RESEND_API_KEY: "re_x",
  RESEND_FROM: "notifications@courtland.com.ng",
  RESEND_WEBHOOK_SECRET: "whsec",
  INNGEST_EVENT_KEY: "ev",
  INNGEST_SIGNING_KEY: "sign",
  INTERNAL_JOB_TOKEN: "tok",
  METRICS_TOKEN: "tok",
} as const;

describe("env", () => {
  it("parses a complete test environment with defaults", () => {
    const env: Env = loadEnv({ ...BASE });
    expect(env.PORT).toBe(4000);
    expect(env.SMS_PROVIDER).toBe("mock");
    expect(env.NEXT_PUBLIC_ENABLE_SAVED_SEARCH_ALERTS).toBe(true);
  });

  it("fails fast on a missing required variable", () => {
    const { DATABASE_URL: _dropped, ...rest } = BASE;
    expect(() => loadEnv({ ...rest })).toThrow();
  });

  it("enforces production rules", () => {
    expect(() =>
      loadEnv({ ...BASE, NODE_ENV: "production", PAYSTACK_SECRET_KEY: "sk_test_x" }),
    ).toThrow(/live in production/);
    const prod = loadEnv({
      ...BASE,
      NODE_ENV: "production",
      PAYSTACK_SECRET_KEY: "sk_live_x",
      SMS_PROVIDER: "sendchamp",
      SENDCHAMP_API_KEY: "sc",
      REDIS_URL: "redis://localhost:6379",
    });
    expect(prod.NODE_ENV).toBe("production");
  });
});
