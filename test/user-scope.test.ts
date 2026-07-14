import { describe, it, expect } from "vitest";
import { memberOfTenant, tenantUserWhere } from "@/lib/users/scope";

// #90 guard: `User`/`Member` are GLOBAL, RLS-exempt tables, so these where-builders ARE the tenant
// isolation for user management. This suite locks their shape so the membership filter can't be
// accidentally dropped (which would re-open the cross-tenant leak). The end-to-end DB proof lives in
// the gated `tenant-isolation.test.ts`.

describe("memberOfTenant", () => {
  it("scopes a user list to members of the given org", () => {
    expect(memberOfTenant("org_a")).toEqual({ memberships: { some: { organizationId: "org_a" } } });
  });
});

describe("tenantUserWhere", () => {
  it("pins BOTH the user id AND org membership", () => {
    expect(tenantUserWhere("u1", "org_a")).toEqual({
      id: "u1",
      memberships: { some: { organizationId: "org_a" } },
    });
  });

  it("always carries the membership filter (never a bare id lookup)", () => {
    const w = tenantUserWhere("u1", "org_a");
    // A bare `{ id }` would match a user in ANY tenant — the membership clause is what excludes them.
    expect(w.memberships).toEqual({ some: { organizationId: "org_a" } });
  });

  it("different tenants produce different filters (a cross-tenant id can't match)", () => {
    expect(tenantUserWhere("u1", "org_a")).not.toEqual(tenantUserWhere("u1", "org_b"));
  });
});
