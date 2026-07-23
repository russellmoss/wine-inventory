import { describe, it, expect } from "vitest";
import { ownerLabel, isBillableOwner, type OwnerRow } from "@/lib/owner/data";

// Plan 093 Unit 1: the pure helpers behind the ownership presentation contract (design review) and the
// billability signal (replacing the LotOwnership enum predicate). These are the ONE definitions consumed
// by the assistant confirm cards, the verify script, and every future GUI cell — so they get a unit test.

const client: OwnerRow = { id: "o1", name: "Smith Family Cellars", kind: "CUSTOM_CRUSH_CLIENT", isActive: true };
const ap: OwnerRow = { id: "o2", name: "Vega AP Wines", kind: "AP_PROPRIETOR", isActive: true };

describe("ownerLabel", () => {
  it("renders a client's name", () => {
    expect(ownerLabel(client)).toBe("Smith Family Cellars");
  });
  it("renders NULL as 'Estate (facility)', never blank", () => {
    expect(ownerLabel(null)).toBe("Estate (facility)");
    expect(ownerLabel(undefined)).toBe("Estate (facility)");
  });
});

describe("isBillableOwner", () => {
  it("a custom-crush client is billable (cost billed back, not capitalized)", () => {
    expect(isBillableOwner(client)).toBe(true);
  });
  it("facility (NULL owner) is NOT billable — its cost capitalizes into facility inventory", () => {
    expect(isBillableOwner(null)).toBe(false);
    expect(isBillableOwner(undefined)).toBe(false);
  });
  it("an AP proprietor is not treated as the custom-crush billable case (its cost scope is a follow-on)", () => {
    // Kept literal to the pre-migration answer (ESTATE=false / CUSTOM_CRUSH_CLIENT=true) so verify:owner-model
    // sees identical results; AP billability is decided when AP cost is built (Open Q3).
    expect(isBillableOwner(ap)).toBe(false);
  });
});
