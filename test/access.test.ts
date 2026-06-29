import { describe, it, expect } from "vitest";
import { canAccessVineyard, canAccessLot, canManagerAccessVineyard, type AppUser } from "@/lib/access";

const base: AppUser = {
  id: "u1",
  name: "Test",
  email: "t@bhutanwine.com",
  role: "user",
  banned: false,
  mustChangePassword: false,
  vineyardIds: [],
};

describe("canAccessVineyard (D9 set membership)", () => {
  it("denies anonymous", () => {
    expect(canAccessVineyard(null, "v1")).toBe(false);
  });

  it("admin reaches every vineyard regardless of membership", () => {
    expect(canAccessVineyard({ ...base, role: "admin", vineyardIds: [] }, "v1")).toBe(true);
  });

  // PARITY (IRON RULE): one membership == the old single assignedVineyardId behavior.
  it("single-vineyard manager: identical to pre-migration", () => {
    const mgr = { ...base, vineyardIds: ["v1"] };
    expect(canAccessVineyard(mgr, "v1")).toBe(true);
    expect(canAccessVineyard(mgr, "v2")).toBe(false);
  });

  it("multi-vineyard manager reaches every vineyard in their set", () => {
    const mgr = { ...base, vineyardIds: ["v1", "v2", "v3"] };
    expect(canAccessVineyard(mgr, "v1")).toBe(true);
    expect(canAccessVineyard(mgr, "v3")).toBe(true);
    expect(canAccessVineyard(mgr, "v4")).toBe(false);
  });

  it("empty-set manager reaches nothing", () => {
    expect(canAccessVineyard(base, "v1")).toBe(false);
  });

  it("canManagerAccessVineyard is the same predicate (back-compat alias)", () => {
    const mgr = { ...base, vineyardIds: ["v1"] };
    expect(canManagerAccessVineyard(mgr, "v1")).toBe(canAccessVineyard(mgr, "v1"));
    expect(canManagerAccessVineyard(mgr, "v2")).toBe(canAccessVineyard(mgr, "v2"));
  });
});

describe("canAccessLot (source-set intersection — the lens predicate)", () => {
  it("denies anonymous", () => {
    expect(canAccessLot(null, ["v1"])).toBe(false);
  });

  it("admin reaches every lot", () => {
    expect(canAccessLot({ ...base, role: "admin" }, ["v9"])).toBe(true);
    expect(canAccessLot({ ...base, role: "admin" }, [])).toBe(true);
  });

  it("manager reaches a blend whose source set intersects their membership", () => {
    const mgr = { ...base, vineyardIds: ["A"] };
    expect(canAccessLot(mgr, ["A", "B"])).toBe(true); // blend spanning A+B, manager of A
  });

  it("manager does NOT reach a lot sourced only from other vineyards", () => {
    const mgr = { ...base, vineyardIds: ["A"] };
    expect(canAccessLot(mgr, ["C"])).toBe(false);
    expect(canAccessLot(mgr, [])).toBe(false); // NULL-source / admin-only bucket
  });
});

describe("'my fruit downstream' lens semantics (Unit 10)", () => {
  // The lens (an opt-in filter, NOT a scope) keeps a lot iff canAccessLot is true for the
  // manager. With the lens OFF, listLots is unfiltered and the manager sees every lot.
  const mgrA = { ...base, vineyardIds: ["A"] };
  it("the lens keeps a blend spanning the manager's vineyard and drops others", () => {
    const lots = [
      { code: "BLEND-AB", sources: ["A", "B"] },
      { code: "CAB-A", sources: ["A"] },
      { code: "SYR-C", sources: ["C"] },
      { code: "MYSTERY", sources: [] }, // null-source bucket
    ];
    const lensed = lots.filter((l) => canAccessLot(mgrA, l.sources)).map((l) => l.code);
    expect(lensed.sort()).toEqual(["BLEND-AB", "CAB-A"]);
  });
});
