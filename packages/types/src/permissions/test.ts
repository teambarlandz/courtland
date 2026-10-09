import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GRANTS, GROUP_OF_PERMISSION, grantsInclude, PERMISSION_GROUPS } from "./matrix.ts";
import { APP_ROLES } from "./roles.ts";
import { PERMISSION_SLUGS } from "./slug.ts";

describe("permissions", () => {
  it("has four roles", () => {
    expect([...APP_ROLES].sort()).toEqual(["admin", "buyer", "landlord", "tenant"]);
  });

  it("has 56 slugs across 10 groups", () => {
    expect(PERMISSION_SLUGS).toHaveLength(56);
    expect(PERMISSION_GROUPS).toHaveLength(10);
    expect(new Set(PERMISSION_SLUGS).size).toBe(56);
  });

  it("grants per role match the committed seed (56/22/12/10)", () => {
    expect(GRANTS.admin).toHaveLength(56);
    expect(GRANTS.landlord).toHaveLength(22);
    expect(GRANTS.tenant).toHaveLength(12);
    expect(GRANTS.buyer).toHaveLength(10);
    expect(grantsInclude("admin", "user_manage")).toBe(true);
    expect(grantsInclude("tenant", "user_manage")).toBe(false);
  });

  it("every slug belongs to exactly one group and every group is used", () => {
    for (const slug of PERMISSION_SLUGS) {
      expect(GROUP_OF_PERMISSION[slug]).toBeDefined();
    }
    const used = new Set(Object.values(GROUP_OF_PERMISSION));
    for (const group of PERMISSION_GROUPS) expect(used.has(group)).toBe(true);
  });

  it("matrix agrees with the seed migration in both directions", () => {
    const seed = readFileSync(
      new URL(
        "../../../../supabase/migrations/20260101002200_seed_permissions.sql",
        import.meta.url,
      ),
      "utf8",
    );
    const seeded = new Set(
      [...seed.matchAll(/["']([a-z][a-z0-9]*(?:_[a-z0-9]+)+)["']/g)].map((m) => m[1] as string),
    );
    expect([...seeded].sort()).toEqual([...PERMISSION_SLUGS].sort());
    const granted = new Set(Object.values(GRANTS).flat());
    expect([...granted].sort()).toEqual([...PERMISSION_SLUGS].sort());
  });
});
