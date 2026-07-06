import { describe, it, expect } from "vitest";
import { scopedVineyardWhere, parseWorkOrderRef } from "@/lib/assistant/scope";
import type { AppUser } from "@/lib/access";

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

describe("scopedVineyardWhere", () => {
  it("returns an unfiltered where for admins", () => {
    expect(scopedVineyardWhere({ ...base, role: "admin" })).toEqual({});
  });

  // PARITY: a single-vineyard manager scopes to exactly that one vineyard (via an IN of one).
  it("pins a single-vineyard manager to their vineyard", () => {
    expect(scopedVineyardWhere({ ...base, vineyardIds: ["v9"] })).toEqual({ id: { in: ["v9"] } });
  });

  it("scopes a multi-vineyard manager to their whole set", () => {
    expect(scopedVineyardWhere({ ...base, vineyardIds: ["v9", "v3"] })).toEqual({
      id: { in: ["v9", "v3"] },
    });
  });

  it("returns null for a manager with no vineyards", () => {
    expect(scopedVineyardWhere(base)).toBeNull();
  });
});

describe("parseWorkOrderRef", () => {
  it("takes a raw number", () => {
    expect(parseWorkOrderRef(142)).toEqual({ number: 142 });
  });

  it("parses human-number strings", () => {
    expect(parseWorkOrderRef("142")).toEqual({ number: 142 });
    expect(parseWorkOrderRef("WO 142")).toEqual({ number: 142 });
    expect(parseWorkOrderRef("#142")).toEqual({ number: 142 });
  });

  it("recognizes a bare database id (cuid) as an id, NOT a number", () => {
    // Regression: the old parser ran /\d+/ over this and resolved WO #8 (from 'cmr8…') — the wrong order.
    expect(parseWorkOrderRef("cmr8fnrmg0002jp04t5yx61c2")).toEqual({ id: "cmr8fnrmg0002jp04t5yx61c2" });
  });

  it("extracts the id from a pasted in-app URL", () => {
    expect(parseWorkOrderRef("https://wine-inventory-seven.vercel.app/work-orders/cmr8fnrmg0002jp04t5yx61c2/execute")).toEqual({
      id: "cmr8fnrmg0002jp04t5yx61c2",
    });
    expect(parseWorkOrderRef("/work-orders/cmr8fnrmg0002jp04t5yx61c2")).toEqual({ id: "cmr8fnrmg0002jp04t5yx61c2" });
  });

  it("returns null when nothing usable is present", () => {
    expect(parseWorkOrderRef("")).toBeNull();
    expect(parseWorkOrderRef("cancel it please")).toBeNull();
  });
});
