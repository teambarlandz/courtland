import { describe, expect, it } from "vitest";
import { DocumentGenerate } from "./document.ts";

describe("document", () => {
  it("accepts a receipt generation request", () => {
    expect(DocumentGenerate.parse({ kind: "receipt", title: "January receipt" }).kind).toBe(
      "receipt",
    );
  });
  it("rejects unknown kinds and empty titles", () => {
    expect(() => DocumentGenerate.parse({ kind: "passport", title: "x" })).toThrow();
    expect(() => DocumentGenerate.parse({ kind: "receipt", title: "" })).toThrow();
  });
});
