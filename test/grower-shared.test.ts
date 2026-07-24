import { describe, it, expect } from "vitest";
import {
  sanitizeGrower,
  sanitizeGrowerContacts,
  findGrowerNearMatches,
} from "@/lib/grower/grower-shared";

describe("sanitizeGrower", () => {
  it("requires a name", () => {
    expect(sanitizeGrower({ name: "  " }).error).toMatch(/name/i);
    expect(sanitizeGrower({ name: "  " }).fields).toBeNull();
  });

  it("trims fields and coerces isEstate", () => {
    const { fields, error } = sanitizeGrower({ name: "  Bien Nacido  ", phone: " 805-555-1000 ", isEstate: true });
    expect(error).toBeNull();
    expect(fields).toMatchObject({ name: "Bien Nacido", phone: "805-555-1000", isEstate: true });
  });

  it("rejects an invalid email", () => {
    const { fields, error } = sanitizeGrower({ name: "Sunny Vineyard", email: "not-an-email" });
    expect(error).toMatch(/email/i);
    expect(fields).toBeNull();
  });

  it("blanks empty optional fields to null", () => {
    const { fields } = sanitizeGrower({ name: "Estate Block", company: "  ", contactName: "" });
    expect(fields?.company).toBeNull();
    expect(fields?.contactName).toBeNull();
  });
});

describe("sanitizeGrowerContacts", () => {
  it("keeps at most one primary — first flagged wins, the rest demote", () => {
    const { rows, error } = sanitizeGrowerContacts([
      { name: "Ana", isPrimary: true },
      { name: "Beto", isPrimary: true },
      { name: "Cy", isPrimary: false },
    ]);
    expect(error).toBeNull();
    expect(rows.map((r) => r.isPrimary)).toEqual([true, false, false]);
  });

  it("drops nameless / empty form rows", () => {
    const { rows } = sanitizeGrowerContacts([
      { name: "  " },
      { name: "Real Person", phone: "123" },
      { name: "" },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Real Person");
  });

  it("rejects a contact with an invalid email", () => {
    const { rows, error } = sanitizeGrowerContacts([{ name: "Dana", email: "nope@" }]);
    expect(error).toMatch(/invalid email/i);
    expect(rows).toEqual([]);
  });

  it("returns an empty set for no input", () => {
    expect(sanitizeGrowerContacts(undefined)).toEqual({ rows: [], error: null });
  });
});

describe("findGrowerNearMatches", () => {
  it("flags a high-confidence near-duplicate name", () => {
    const growers = [
      { id: "g1", name: "Bien Nacido Vineyard" },
      { id: "g2", name: "Sunny Slope Ranch" },
    ];
    const { high } = findGrowerNearMatches("Bien Nacido Vineyards", growers);
    expect(high.map((g) => g.id)).toContain("g1");
  });

  it("returns nothing for an empty candidate", () => {
    expect(findGrowerNearMatches("  ", [{ id: "g1", name: "Anything" }])).toEqual({ high: [], medium: [] });
  });
});
