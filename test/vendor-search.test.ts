import { describe, it, expect } from "vitest";
import { rankVendors } from "@/lib/inventory/vendor-search";
import type { VendorRow } from "@/lib/vendors/vendors-shared";

const v = (id: string, name: string, extra: Partial<VendorRow> = {}): VendorRow => ({
  id, name, phone: null, email: null, contactName: null, accountNumber: null,
  poRequired: false, terms: null, url: null, notes: null, isActive: true, contacts: [], ...extra,
});

const vendors: VendorRow[] = [
  v("v1", "Scott Laboratories", { contactName: "Jordan Rivera", email: "orders@scottlab.com" }),
  v("v2", "Gusmer Enterprises"),
  v("v3", "BSG Wine"),
];

describe("rankVendors", () => {
  it("returns identity order for a blank query", () => {
    expect(rankVendors("", vendors).map((x) => x.id)).toEqual(["v1", "v2", "v3"]);
  });

  it("finds by fuzzy name (typo tolerant)", () => {
    expect(rankVendors("scot labs", vendors)[0].id).toBe("v1");
  });

  it("finds by contact name", () => {
    expect(rankVendors("Rivera", vendors).map((x) => x.id)).toContain("v1");
  });

  it("finds by email fragment", () => {
    expect(rankVendors("scottlab.com", vendors).map((x) => x.id)).toContain("v1");
  });

  it("excludes non-matches", () => {
    expect(rankVendors("gusmer", vendors).map((x) => x.id)).toEqual(["v2"]);
  });
});
