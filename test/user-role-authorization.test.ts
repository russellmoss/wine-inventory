import { describe, it, expect } from "vitest";
import {
  ASSIGNABLE_ROLES,
  isAssignableRole,
  canAssignRole,
  canManageDeveloperTarget,
  canChangeOwnRole,
} from "@/lib/access";

const developer = { role: "developer" };
const admin = { role: "admin" };
const user = { role: "user" };

describe("isAssignableRole", () => {
  it("accepts the known roles", () => {
    for (const r of ASSIGNABLE_ROLES) expect(isAssignableRole(r)).toBe(true);
  });
  it("rejects unknown / malformed roles", () => {
    expect(isAssignableRole("superadmin")).toBe(false);
    expect(isAssignableRole("owner")).toBe(false);
    expect(isAssignableRole("")).toBe(false);
    expect(isAssignableRole(null)).toBe(false);
    expect(isAssignableRole(undefined)).toBe(false);
    expect(isAssignableRole(42)).toBe(false);
  });
});

describe("canAssignRole — developer is self-replicating", () => {
  it("a developer can assign every role, including developer", () => {
    expect(canAssignRole(developer, "developer")).toBe(true);
    expect(canAssignRole(developer, "admin")).toBe(true);
    expect(canAssignRole(developer, "user")).toBe(true);
  });

  it("an admin can assign admin/user but NEVER developer (no escalation backdoor)", () => {
    expect(canAssignRole(admin, "admin")).toBe(true);
    expect(canAssignRole(admin, "user")).toBe(true);
    expect(canAssignRole(admin, "developer")).toBe(false);
  });

  it("a plain user can assign nothing", () => {
    expect(canAssignRole(user, "user")).toBe(false);
    expect(canAssignRole(user, "admin")).toBe(false);
    expect(canAssignRole(user, "developer")).toBe(false);
  });

  it("nobody (anonymous) can assign anything", () => {
    expect(canAssignRole(null, "user")).toBe(false);
    expect(canAssignRole(null, "developer")).toBe(false);
  });

  it("an unknown target role is never assignable, even by a developer", () => {
    expect(canAssignRole(developer, "superadmin")).toBe(false);
    expect(canAssignRole(developer, "owner")).toBe(false);
  });
});

describe("canManageDeveloperTarget — who may touch a developer account", () => {
  it("only a developer may manage a developer target", () => {
    expect(canManageDeveloperTarget(developer, "developer")).toBe(true);
    expect(canManageDeveloperTarget(admin, "developer")).toBe(false);
    expect(canManageDeveloperTarget(user, "developer")).toBe(false);
    expect(canManageDeveloperTarget(null, "developer")).toBe(false);
  });

  it("any admin-like actor may manage non-developer targets (unchanged)", () => {
    expect(canManageDeveloperTarget(admin, "user")).toBe(true);
    expect(canManageDeveloperTarget(admin, "admin")).toBe(true);
    expect(canManageDeveloperTarget(admin, null)).toBe(true);
  });
});

describe("canChangeOwnRole — no self-downgrade lockout", () => {
  it("a developer cannot lower their own role", () => {
    expect(canChangeOwnRole("developer", "user", true)).toBe(false);
    expect(canChangeOwnRole("developer", "admin", true)).toBe(false);
    expect(canChangeOwnRole("developer", "developer", true)).toBe(true);
  });

  it("an admin cannot demote themselves to user, but can stay admin (pre-existing rule)", () => {
    expect(canChangeOwnRole("admin", "user", true)).toBe(false);
    expect(canChangeOwnRole("admin", "admin", true)).toBe(true);
  });

  it("promoting yourself is allowed by this guard (authorization is enforced separately)", () => {
    expect(canChangeOwnRole("admin", "developer", true)).toBe(true);
  });

  it("changing someone else's role is never blocked by this guard", () => {
    expect(canChangeOwnRole("developer", "user", false)).toBe(true);
    expect(canChangeOwnRole("admin", "user", false)).toBe(true);
  });
});
