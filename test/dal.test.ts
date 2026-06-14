import { describe, it, expect } from "vitest";
import { accessDecision, type AppUser } from "@/lib/access";

const base: AppUser = {
  id: "u1",
  name: "Test",
  email: "t@bhutanwine.com",
  role: "user",
  banned: false,
  mustChangePassword: false,
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
