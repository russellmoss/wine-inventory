import { describe, it, expect } from "vitest";
import { createCustomUnitCore, normalizeUnitName, MAX_UNIT_NAME } from "@/lib/units/custom-unit-core";

// The validation branches all return BEFORE the tx body runs, so they're pure (no DB). The happy path +
// per-tenant uniqueness are proven against the DB in the plan's manual/DB verification, not here.
const actor = { actorUserId: "u_test", actorEmail: "test@demo.com" };

describe("createCustomUnitCore validation (pure, no DB)", () => {
  it("rejects an empty name", async () => {
    const r = await createCustomUnitCore(actor, { name: "  ", dimension: "mass", perCanonical: 1000 });
    expect(r).toEqual({ ok: false, error: expect.stringContaining("Enter a name") });
  });

  it("rejects a name over the length cap", async () => {
    const r = await createCustomUnitCore(actor, { name: "x".repeat(MAX_UNIT_NAME + 1), dimension: "mass", perCanonical: 1 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("too long");
  });

  it("rejects a non-dimension", async () => {
    const r = await createCustomUnitCore(actor, { name: "furlong", dimension: "length", perCanonical: 1 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("weight, volume, or count");
  });

  it("rejects a non-positive or non-finite factor", async () => {
    for (const bad of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const r = await createCustomUnitCore(actor, { name: "drum", dimension: "mass", perCanonical: bad });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toContain("positive number");
    }
  });

  it("rejects a name that shadows a built-in unit or alias (cost-safety)", async () => {
    for (const reserved of ["kg", "KG", "g", "gal", "gallon", "lb", "ton", "each", "mL"]) {
      const r = await createCustomUnitCore(actor, { name: reserved, dimension: "count", perCanonical: 1 });
      expect(r.ok, `"${reserved}" must be rejected`).toBe(false);
      if (!r.ok) expect(r.error).toContain("already a standard unit");
    }
  });
});

describe("normalizeUnitName", () => {
  it("lowercases + trims", () => {
    expect(normalizeUnitName("  Drum ")).toBe("drum");
    expect(normalizeUnitName(null)).toBe("");
  });
});
