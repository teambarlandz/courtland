import { describe, expect, it } from "vitest";
import { buildOpenApiSpec, ENDPOINTS, renderOpenApiSpec } from "../../src/openapi.ts";

describe("openapi registry", () => {
  it("covers the §10 catalogue", () => {
    expect(ENDPOINTS.length).toBeGreaterThanOrEqual(100);
    const ids = new Set(ENDPOINTS.map((e) => e.operationId));
    for (const id of [
      "requestOtp",
      "verifyOtp",
      "listProperties",
      "createProperty",
      "activateContract",
      "createPaymentIntent",
      "runPayouts",
      "createTicket",
      "releaseDocument",
      "health",
    ]) {
      expect(ids.has(id)).toBe(true);
    }
  });

  it("gives every endpoint a request and a response schema", () => {
    for (const endpoint of ENDPOINTS) {
      expect(endpoint.response, `${endpoint.operationId} response`).toBeDefined();
      expect(endpoint.request, `${endpoint.operationId} request`).toBeDefined();
      expect(endpoint.operationId).toMatch(/^[a-z][a-zA-Z0-9]*$/);
    }
  });

  it("fails the build when an endpoint is incomplete", () => {
    expect(() =>
      buildOpenApiSpec([
        {
          method: "get",
          path: "/v1/broken",
          operationId: "broken",
          summary: "x",
          permission: null,
          idempotency: false,
          request: {},
          response: undefined as never,
        },
      ]),
    ).toThrow(/no response schema/);
  });

  it("renders deterministically", () => {
    expect(renderOpenApiSpec()).toBe(renderOpenApiSpec());
    const doc = buildOpenApiSpec();
    expect(doc.openapi).toBe("3.1.0");
    expect(Object.keys(doc.paths).length).toBeGreaterThanOrEqual(60);
  });
});
