import { describe, expect, it } from "vitest";
import { COMPLIANCE_COPY, COMPLIANCE_COPY_VERSION } from "../compliance.ts";

describe("compliance", () => {
  it("is versioned", () => {
    expect(COMPLIANCE_COPY_VERSION).toBe("v1");
    expect(COMPLIANCE_COPY.version).toBe("v1");
    expect(COMPLIANCE_COPY.otpConsent.length).toBeGreaterThan(0);
  });
});
