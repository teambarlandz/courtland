// redact.ts — the redaction list, exported so tests (and auditors) can assert
// against it. Any key that could carry a credential, token or one-time code
// is censored wherever it appears in a logged object, at any depth.
export const REDACTED_KEYS = [
  "password",
  "passwd",
  "secret",
  "token",
  "authorization",
  "cookie",
  "set-cookie",
  "otp",
  "code",
  "apiKey",
  "api_key",
  "clientSecret",
  "client_secret",
  "privateKey",
  "private_key",
  "session",
  "refreshToken",
  "refresh_token",
  "accessToken",
  "access_token",
] as const;
export type RedactedKey = (typeof REDACTED_KEYS)[number];

export const REDACTED_CENSOR = "[Redacted]";
