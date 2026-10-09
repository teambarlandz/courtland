import { describe, expect, it } from "vitest";
import { AdminFilterViewCreate } from "./clientFilters.ts";
import { AdminUserRolesPatch } from "./users.ts";

describe("admin", () => {
  it("accepts role patches", () => {
    expect(AdminUserRolesPatch.parse({ roles: ["admin"] }).roles).toEqual(["admin"]);
    expect(() => AdminUserRolesPatch.parse({ roles: [] })).toThrow();
    expect(() => AdminUserRolesPatch.parse({ roles: ["superuser"] })).toThrow();
  });
  it("defaults filter views to private", () => {
    expect(AdminFilterViewCreate.parse({ name: "Due", entity: "contracts" }).isShared).toBe(false);
  });
});
