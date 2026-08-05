import { describe, it, expect } from "vitest";
import { vineyardScopeOf, narrowVineyardFilter, type VineyardScope } from "@/lib/vineyard/scope";
import { ActionError } from "@/lib/action-error";
import type { AppUser } from "@/lib/access";

/**
 * D9 vineyard-membership scoping — the pure half.
 *
 * The gates that hit the DB (requireBlockAccess, requireSprayApplicationAccess, …) are proven by
 * `npm run verify:vineyard-scope` (static: every exported action in a vineyard-scoped module reaches a
 * gate) plus the runtime tenant-isolation suite. What is unit-testable without a database is the
 * decision logic, and that is where the fail-closed direction lives.
 */

function user(overrides: Partial<AppUser> = {}): AppUser {
  return {
    id: "u1",
    name: "Test",
    email: "t@example.com",
    role: "user",
    banned: false,
    mustChangePassword: false,
    vineyardIds: [],
    organizationIds: ["org1"],
    activeOrganizationId: "org1",
    ...overrides,
  };
}

describe("vineyardScopeOf", () => {
  it("gives an admin unrestricted reach", () => {
    expect(vineyardScopeOf(user({ role: "admin" }))).toEqual({ kind: "all" });
  });

  it("gives a developer unrestricted reach (admin-like in every tenant)", () => {
    expect(vineyardScopeOf(user({ role: "developer" }))).toEqual({ kind: "all" });
  });

  it("pins a manager to their membership set", () => {
    expect(vineyardScopeOf(user({ vineyardIds: ["v1", "v2"] }))).toEqual({
      kind: "some",
      vineyardIds: ["v1", "v2"],
    });
  });

  it("FAILS CLOSED: a manager with no memberships reaches nothing, not everything", () => {
    // This is the load-bearing case. The tempting alternative — treat an empty set as "unscoped" —
    // is the fail-OPEN direction, and it is exactly what an unfinished membership backfill would
    // produce. Plan 092 requires the empty set to mean empty.
    expect(vineyardScopeOf(user({ vineyardIds: [] }))).toEqual({ kind: "none" });
  });

  it("a null role is a manager, not an admin", () => {
    expect(vineyardScopeOf(user({ role: null, vineyardIds: ["v1"] }))).toEqual({
      kind: "some",
      vineyardIds: ["v1"],
    });
  });
});

describe("narrowVineyardFilter", () => {
  const all: VineyardScope = { kind: "all" };
  const some: VineyardScope = { kind: "some", vineyardIds: ["v1", "v2"] };
  const none: VineyardScope = { kind: "none" };

  it("admin + no id = no predicate (read everything)", () => {
    expect(narrowVineyardFilter(all, null)).toBeNull();
  });

  it("admin + an explicit id = just that id", () => {
    expect(narrowVineyardFilter(all, "v9")).toEqual(["v9"]);
  });

  it("manager + no id = their whole set", () => {
    expect(narrowVineyardFilter(some, null)).toEqual(["v1", "v2"]);
  });

  it("manager + an in-scope id = that id", () => {
    expect(narrowVineyardFilter(some, "v2")).toEqual(["v2"]);
  });

  it("REFUSES an out-of-scope id rather than silently widening or emptying the read", () => {
    // Returning [] here would look like "no data" and hide the denial; returning the caller's id
    // unchecked would be the leak. It throws.
    expect(() => narrowVineyardFilter(some, "v3")).toThrow(ActionError);
    try {
      narrowVineyardFilter(some, "v3");
    } catch (e) {
      expect((e as ActionError).code).toBe("FORBIDDEN");
    }
  });

  it("REFUSES any explicit id when the caller has no memberships", () => {
    expect(() => narrowVineyardFilter(none, "v1")).toThrow(ActionError);
  });

  it("manager with no memberships + no id = an EMPTY filter, never an unfiltered read", () => {
    // `[]` makes `{ vineyardId: { in: [] } }`, which matches nothing. The dangerous bug would be
    // returning null here, because callers treat null as "no predicate needed".
    expect(narrowVineyardFilter(none, null)).toEqual([]);
    expect(narrowVineyardFilter(none, null)).not.toBeNull();
  });

  it("treats an empty-string vineyardId as absent, not as an id to match", () => {
    expect(narrowVineyardFilter(all, "")).toBeNull();
  });
});
