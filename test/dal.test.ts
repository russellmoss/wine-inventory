import { describe, it, expect } from "vitest";
import { accessDecision, canManagerAccessVineyard, type AppUser } from "@/lib/access";

const base: AppUser = {
  id: "u1",
  name: "Test",
  email: "t@bhutanwine.com",
  role: "user",
  banned: false,
  mustChangePassword: false,
  assignedVineyardId: null,
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

describe("canManagerAccessVineyard", () => {
  it("denies anonymous", () => {
    expect(canManagerAccessVineyard(null, "v1")).toBe(false);
  });
  it("admin reaches any vineyard", () => {
    expect(canManagerAccessVineyard({ ...base, role: "admin" }, "v1")).toBe(true);
    expect(canManagerAccessVineyard({ ...base, role: "admin", assignedVineyardId: "v2" }, "v1")).toBe(
      true,
    );
  });
  it("manager reaches only their assigned vineyard", () => {
    const mgr = { ...base, role: "user", assignedVineyardId: "v1" };
    expect(canManagerAccessVineyard(mgr, "v1")).toBe(true);
    expect(canManagerAccessVineyard(mgr, "v2")).toBe(false);
  });
  it("manager with no assignment reaches nothing", () => {
    expect(canManagerAccessVineyard({ ...base, role: "user", assignedVineyardId: null }, "v1")).toBe(
      false,
    );
  });
});
