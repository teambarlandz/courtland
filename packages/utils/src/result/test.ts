import { describe, expect, it } from "vitest";
import { err, isOk, ok, unwrap } from "../result.ts";

describe("result", () => {
  it("ok/err round-trip", () => {
    expect(isOk(ok(1))).toBe(true);
    expect(isOk(err("bad"))).toBe(false);
    expect(unwrap(ok(1))).toBe(1);
    expect(() => unwrap(err("bad"))).toThrow();
  });
});
