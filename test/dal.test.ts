import { describe, it, expect } from "vitest";
import { accessDecision, canManagerAccessVineyard, type AppUser } from "@/lib/access";

const base: AppUser = {
  id: "u1",
  name: "Test",
  email: "t@bhutanwine.com",
  role: "user",
  banned: false,
  mustChangePassword: false,
  vineyardIds: [],
  organizationIds: ["org_bhutan_wine_co"],
  activeOrganizationId: "org_bhutan_wine_co",
};

describe("accessDecision", () => {
  it("redirects anonymous to login", () => {
    expect(accessDecision(null)).toBe("login");
  });

  it("blocks banned users", () => {
    expect(accessDecision({ ...base, banned: true })).toBe("banned");
  });

  it("forces password change when flagged", () => {
    expect(accessDecision({ ...base, mustChangePassword: true })).toBe("change-password");
  });

  it("password-change takes precedence over admin requirement", () => {
    expect(
      accessDecision({ ...base, role: "admin", mustChangePassword: true }, { requireAdmin: true }),
    ).toBe("change-password");
  });

  it("allows a ready user", () => {
    expect(accessDecision(base)).toBe("ok");
  });

  it("forbids non-admin from admin areas", () => {
    expect(accessDecision(base, { requireAdmin: true })).toBe("forbidden");
  });

  it("allows admin into admin areas", () => {
    expect(accessDecision({ ...base, role: "admin" }, { requireAdmin: true })).toBe("ok");
  });
});

describe("canManagerAccessVineyard (set-based alias)", () => {
  it("denies anonymous", () => {
    expect(canManagerAccessVineyard(null, "v1")).toBe(false);
  });
  it("admin reaches any vineyard", () => {
    expect(canManagerAccessVineyard({ ...base, role: "admin" }, "v1")).toBe(true);
    expect(canManagerAccessVineyard({ ...base, role: "admin", vineyardIds: ["v2"] }, "v1")).toBe(
      true,
    );
  });
  // PARITY (IRON RULE): a single-vineyard manager behaves EXACTLY as before the set migration.
  it("single-vineyard manager reaches only their vineyard", () => {
    const mgr = { ...base, role: "user", vineyardIds: ["v1"] };
    expect(canManagerAccessVineyard(mgr, "v1")).toBe(true);
    expect(canManagerAccessVineyard(mgr, "v2")).toBe(false);
  });
  it("manager with no memberships reaches nothing", () => {
    expect(canManagerAccessVineyard({ ...base, role: "user", vineyardIds: [] }, "v1")).toBe(false);
  });
});
