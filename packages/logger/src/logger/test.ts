import { Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import { createLogger } from "../logger.ts";
import { REDACTED_CENSOR, REDACTED_KEYS } from "../redact.ts";
import { runWithContext } from "../requestContext.ts";

function capture() {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk, _encoding, done) {
      lines.push(chunk.toString());
      done();
    },
  });
  return { lines, stream };
}

describe("logger", () => {
  it("redacts credentials at any depth", () => {
    expect(REDACTED_KEYS).toContain("password");
    expect(REDACTED_KEYS).toContain("authorization");
    expect(REDACTED_KEYS).toContain("otp");
    const { lines, stream } = capture();
    const log = createLogger({ destination: stream });
    log.info({ password: "hunter2", nested: { token: "abc" }, safe: "visible" });
    const logged = lines.join("");
    expect(logged).not.toContain("hunter2");
    expect(logged).not.toContain("abc");
    expect(logged).toContain(REDACTED_CENSOR);
    expect(logged).toContain("visible");
  });

  it("carries base fields and the request context", () => {
    const { lines, stream } = capture();
    const log = createLogger({ env: "test", version: "abc123", destination: stream });
    runWithContext({ requestId: "req_test123" }, () => {
      log.info("hello");
    });
    const parsed = JSON.parse(lines[0] as string) as Record<string, unknown>;
    expect(parsed.env).toBe("test");
    expect(parsed.version).toBe("abc123");
    expect(parsed.requestId).toBe("req_test123");
  });
});
