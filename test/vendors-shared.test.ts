import { describe, it, expect } from "vitest";
import {
  sanitizeVendor,
  sanitizeVendorContacts,
  normalizeVendorUrl,
  isLikelyEmail,
  matchVendorsByName,
  validateVendorMerge,
  vendorMergeErrorMessage,
  resolveMergedExternalVendorId,
  vendorHasBlockingReferences,
  describeVendorUsage,
  findDuplicateVendorGroups,
  nearDuplicateLevel,
  findVendorNearMatches,
  stripVendorCurrencySuffix,
  type VendorUsage,
} from "@/lib/vendors/vendors-shared";

describe("sanitizeVendor", () => {
  it("requires a name", () => {
    expect(sanitizeVendor({ name: "  " }).error).toMatch(/name/i);
    expect(sanitizeVendor({ name: "  " }).fields).toBeNull();
  });

  it("trims fields and coerces poRequired", () => {
    const { fields, error } = sanitizeVendor({ name: "  Scott Labs  ", phone: " 555 ", poRequired: true });
    expect(error).toBeNull();
    expect(fields).toMatchObject({ name: "Scott Labs", phone: "555", poRequired: true });
  });

  it("rejects a malformed email", () => {
    expect(sanitizeVendor({ name: "V", email: "not-an-email" }).error).toMatch(/email/i);
  });

  it("accepts a blank email as null (email is optional at the sanitizer level)", () => {
    const { fields } = sanitizeVendor({ name: "V", email: "" });
    expect(fields?.email).toBeNull();
  });

  it("normalizes a bare-domain url to https and drops non-http schemes", () => {
    expect(sanitizeVendor({ name: "V", url: "scottlab.com" }).fields?.url).toBe("https://scottlab.com");
    expect(sanitizeVendor({ name: "V", url: "javascript:alert(1)" }).fields?.url).toBeNull();
  });
});

describe("sanitizeVendorContacts", () => {
  it("drops nameless rows and keeps named ones", () => {
    const { rows, error } = sanitizeVendorContacts([{ name: "" }, { name: "Jane", phone: "555" }]);
    expect(error).toBeNull();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: "Jane", phone: "555" });
  });

  it("enforces at most one primary (first primary wins)", () => {
    const { rows } = sanitizeVendorContacts([
      { name: "A", isPrimary: true },
      { name: "B", isPrimary: true },
      { name: "C", isPrimary: true },
    ]);
    expect(rows.map((r) => r.isPrimary)).toEqual([true, false, false]);
  });

  it("rejects a contact with a bad email", () => {
    expect(sanitizeVendorContacts([{ name: "A", email: "bad" }]).error).toMatch(/email/i);
  });

  it("returns no rows for undefined/empty", () => {
    expect(sanitizeVendorContacts(undefined).rows).toEqual([]);
    expect(sanitizeVendorContacts([]).rows).toEqual([]);
  });
});

describe("normalizeVendorUrl / isLikelyEmail", () => {
  it("keeps http(s) urls, https-prefixes bare domains, drops other schemes", () => {
    expect(normalizeVendorUrl("https://x.com")).toBe("https://x.com");
    expect(normalizeVendorUrl("x.com")).toBe("https://x.com");
    expect(normalizeVendorUrl("ftp://x.com")).toBeNull();
    expect(normalizeVendorUrl("")).toBeNull();
  });
  it("validates emails loosely", () => {
    expect(isLikelyEmail("a@b.co")).toBe(true);
    expect(isLikelyEmail("a@b")).toBe(false);
    expect(isLikelyEmail("nope")).toBe(false);
  });
});

describe("matchVendorsByName", () => {
  const all = [
    { id: "v1", name: "Scott Labs" },
    { id: "v2", name: "Gusmer Enterprises" },
    { id: "v3", name: "BSG" },
  ];
  it("matches two-directionally (needle in name and name in needle)", () => {
    expect(matchVendorsByName(all, "scott").map((v) => v.id)).toEqual(["v1"]); // needle ⊂ name
    expect(matchVendorsByName(all, "Scott Labs Incorporated").map((v) => v.id)).toEqual(["v1"]); // name ⊂ needle
  });
  it("prefers an exact normalized match over substring", () => {
    expect(matchVendorsByName(all, "BSG").map((v) => v.id)).toEqual(["v3"]);
  });
  it("pins by #id token", () => {
    expect(matchVendorsByName(all, "#v2").map((v) => v.id)).toEqual(["v2"]);
  });
  it("returns [] for no match / blank", () => {
    expect(matchVendorsByName(all, "zzz")).toEqual([]);
    expect(matchVendorsByName(all, "")).toEqual([]);
  });
});

// ── Plan 072: merge / remove planning ──

describe("validateVendorMerge", () => {
  it("allows a normal loser→survivor merge", () => {
    expect(validateVendorMerge({ loserId: "a", survivorId: "b" })).toBeNull();
  });
  it("rejects merging a vendor into itself", () => {
    expect(validateVendorMerge({ loserId: "a", survivorId: "a" })).toBe("SAME_VENDOR");
  });
  it("rejects missing ids", () => {
    expect(validateVendorMerge({ loserId: "", survivorId: "b" })).toBe("MISSING_LOSER");
    expect(validateVendorMerge({ loserId: "a", survivorId: "  " })).toBe("MISSING_SURVIVOR");
    expect(validateVendorMerge({ loserId: null, survivorId: undefined })).toBe("MISSING_LOSER");
  });
  it("refuses to make the Unknown fallback vendor a loser", () => {
    expect(validateVendorMerge({ loserId: "unk", survivorId: "b", unknownVendorId: "unk" })).toBe("LOSER_IS_UNKNOWN");
    // Unknown can still be the SURVIVOR (merge junk into it).
    expect(validateVendorMerge({ loserId: "a", survivorId: "unk", unknownVendorId: "unk" })).toBeNull();
  });
  it("maps every error to a user-safe message", () => {
    for (const e of ["SAME_VENDOR", "LOSER_IS_UNKNOWN", "MISSING_LOSER", "MISSING_SURVIVOR"] as const) {
      expect(vendorMergeErrorMessage(e)).toMatch(/\S/);
    }
  });
});

describe("resolveMergedExternalVendorId", () => {
  it("keeps the survivor's mapping when it has one", () => {
    expect(resolveMergedExternalVendorId({ externalVendorId: "S1" }, { externalVendorId: null })).toEqual({
      value: "S1", changed: false, conflict: false,
    });
  });
  it("carries the loser's mapping forward when the survivor is unmapped", () => {
    expect(resolveMergedExternalVendorId({ externalVendorId: null }, { externalVendorId: "L1" })).toEqual({
      value: "L1", changed: true, conflict: false,
    });
  });
  it("flags a conflict when both map to DIFFERENT QBO vendors (survivor wins, admin must ack)", () => {
    expect(resolveMergedExternalVendorId({ externalVendorId: "S1" }, { externalVendorId: "L1" })).toEqual({
      value: "S1", changed: false, conflict: true,
    });
  });
  it("is not a conflict when both map to the SAME QBO vendor", () => {
    expect(resolveMergedExternalVendorId({ externalVendorId: "X" }, { externalVendorId: "X" })).toEqual({
      value: "X", changed: false, conflict: false,
    });
  });
  it("treats blank/whitespace mappings as unmapped", () => {
    expect(resolveMergedExternalVendorId({ externalVendorId: "  " }, { externalVendorId: "L1" })).toEqual({
      value: "L1", changed: true, conflict: false,
    });
  });
});

describe("vendorHasBlockingReferences / describeVendorUsage", () => {
  const zero: VendorUsage = { materials: 0, lots: 0, apEvents: 0, contacts: 0 };
  it("contacts alone never block a removal (they cascade)", () => {
    expect(vendorHasBlockingReferences({ ...zero, contacts: 3 })).toBe(false);
  });
  it("any material/lot/bill blocks a removal", () => {
    expect(vendorHasBlockingReferences({ ...zero, materials: 1 })).toBe(true);
    expect(vendorHasBlockingReferences({ ...zero, lots: 1 })).toBe(true);
    expect(vendorHasBlockingReferences({ ...zero, apEvents: 1 })).toBe(true);
  });
  it("describes what will move, pluralizing correctly", () => {
    expect(describeVendorUsage({ materials: 1, lots: 2, apEvents: 0, contacts: 1 })).toBe(
      "1 material, 2 supply lots, 1 contact",
    );
    expect(describeVendorUsage(zero)).toBe("nothing");
  });
});

describe("findDuplicateVendorGroups", () => {
  it("groups a prefix/equal normalized-name family (Scott Labs ↔ Scott Laboratories)", () => {
    const vendors = [
      { id: "a", name: "Scott Labs" },
      { id: "b", name: "Scott Laboratories" },
      { id: "c", name: "Gusmer" },
    ];
    const groups = findDuplicateVendorGroups(vendors);
    expect(groups.length).toBe(1);
    expect(groups[0].map((v) => v.id).sort()).toEqual(["a", "b"]);
  });
  it("treats case/punctuation/whitespace as the same name", () => {
    const groups = findDuplicateVendorGroups([
      { id: "a", name: "BSG" },
      { id: "b", name: "b.s.g." },
    ]);
    expect(groups[0].map((v) => v.id).sort()).toEqual(["a", "b"]);
  });
  it("returns no groups when every vendor is distinct", () => {
    expect(findDuplicateVendorGroups([
      { id: "a", name: "Scott Labs" },
      { id: "b", name: "Gusmer" },
    ])).toEqual([]);
  });
  it("does not group unrelated names that merely share a word", () => {
    // "Lab Supply Co" and "Scott Labs" don't have a prefix relationship on normalized keys.
    expect(findDuplicateVendorGroups([
      { id: "a", name: "Scott Labs" },
      { id: "b", name: "Lab Supply Co" },
    ])).toEqual([]);
  });
  it("never groups the seeded Unknown fallback vendor", () => {
    expect(findDuplicateVendorGroups([
      { id: "a", name: "Unknown / Unspecified" },
      { id: "b", name: "Unknown Cellars" },
    ])).toEqual([]);
  });
});

// ── Plan 074: near-duplicate vendor guard ──

describe("stripVendorCurrencySuffix", () => {
  it("strips a known trailing currency code in parens", () => {
    expect(stripVendorCurrencySuffix("Acme (EUR)")).toEqual({ base: "Acme", had: true });
    expect(stripVendorCurrencySuffix("Château Fée (GBP)")).toEqual({ base: "Château Fée", had: true });
  });
  it("leaves a non-currency parenthetical alone", () => {
    expect(stripVendorCurrencySuffix("Acme (USA)")).toEqual({ base: "Acme (USA)", had: false });
    expect(stripVendorCurrencySuffix("Acme")).toEqual({ base: "Acme", had: false });
  });
});

describe("nearDuplicateLevel", () => {
  it("HIGH: abbreviation/expansion (Scott Labs ↔ Scott Laboratories)", () => {
    expect(nearDuplicateLevel("Scott Labs", "Scott Laboratories")).toBe("high");
  });
  it("HIGH: infix digit homophone (Crush2Cellar ↔ Crush to Cellar)", () => {
    expect(nearDuplicateLevel("Crush2Cellar", "Crush to Cellar")).toBe("high");
  });
  it("HIGH: legal-suffix noise (Gusmer ↔ Gusmer Enterprises; Acme Corp ↔ acme)", () => {
    expect(nearDuplicateLevel("Gusmer", "Gusmer Enterprises")).toBe("high");
    expect(nearDuplicateLevel("Acme Corp", "acme")).toBe("high");
  });
  it("HIGH: ampersand vs 'and'", () => {
    expect(nearDuplicateLevel("A & B Supply", "A and B Supply")).toBe("high");
  });
  it("HIGH: word order (ABC Supply ↔ Supply ABC) and punctuation (BSG ↔ b.s.g.)", () => {
    expect(nearDuplicateLevel("ABC Supply", "Supply ABC")).toBe("high");
    expect(nearDuplicateLevel("BSG", "b.s.g.")).toBe("high");
  });
  it("HIGH: identical up to case", () => {
    expect(nearDuplicateLevel("Scott Labs", "scott labs")).toBe("high");
  });
  it("NULL: genuinely distinct suppliers", () => {
    expect(nearDuplicateLevel("Scott Labs", "Scott Valley")).toBeNull();
    expect(nearDuplicateLevel("Crush Cellars", "Crush Wine Co")).toBeNull();
  });
  it("NULL: a digit at a word edge is not a homophone (3M ↔ Three M Coatings)", () => {
    expect(nearDuplicateLevel("3M", "Three M Coatings")).toBeNull();
  });
  it("NULL: differ ONLY by a currency suffix (same vendor — protects Plan 073 FX)", () => {
    expect(nearDuplicateLevel("Acme", "Acme (EUR)")).toBeNull();
    expect(nearDuplicateLevel("Acme (EUR)", "Acme (USD)")).toBeNull();
  });
  it("NULL: blank inputs", () => {
    expect(nearDuplicateLevel("", "Acme")).toBeNull();
    expect(nearDuplicateLevel("Acme", "")).toBeNull();
  });

  // Tuning: don't soft-block on a bare shared first word or a single-character surname difference.
  it("does NOT soft-block (HIGH) a longer name sharing only a bare first word", () => {
    expect(nearDuplicateLevel("Napa", "Napa Valley Barrel Co")).not.toBe("high");
    expect(nearDuplicateLevel("Wine", "Wine Warehouse")).not.toBe("high");
  });
  it("does NOT soft-block one-character-different surnames (Bell/Ball, Hill/Hall)", () => {
    expect(nearDuplicateLevel("Bell Wines", "Ball Wines")).not.toBe("high");
    expect(nearDuplicateLevel("Hill Family", "Hall Family")).not.toBe("high");
  });

  // Unicode: accented + non-Latin names must still dedup (were a silent no-op before).
  it("HIGH: accent-folded match (Château Fée ↔ Chateau Fee)", () => {
    expect(nearDuplicateLevel("Château Fée", "Chateau Fee")).toBe("high");
  });
  it("HIGH: identical non-Latin (CJK) names match instead of degrading to null", () => {
    expect(nearDuplicateLevel("李記酒莊", "李記酒莊")).toBe("high");
    expect(nearDuplicateLevel("李記酒莊", "李記酒")).not.toBeNull(); // near-variant still surfaces
  });
});

describe("findVendorNearMatches", () => {
  const vendors = [
    { id: "v1", name: "Scott Labs" },
    { id: "v2", name: "Gusmer" },
    { id: "v3", name: "Acme" },
    { id: "unk", name: "Unknown / Unspecified" },
  ];
  it("returns the HIGH candidate for a near-dup name", () => {
    const { high, medium } = findVendorNearMatches("Scott Laboratories", vendors);
    expect(high.map((v) => v.id)).toEqual(["v1"]);
    expect(medium.map((v) => v.id)).toEqual([]);
  });
  it("never surfaces the Unknown fallback vendor", () => {
    expect(findVendorNearMatches("Unknown / Unspecified", vendors)).toEqual({ high: [], medium: [] });
  });
  it("does not flag a currency-suffixed variant against its base (Plan 073)", () => {
    expect(findVendorNearMatches("Acme (EUR)", vendors).high.map((v) => v.id)).toEqual([]);
  });
  it("returns nothing for a blank name or an all-new name", () => {
    expect(findVendorNearMatches("", vendors)).toEqual({ high: [], medium: [] });
    expect(findVendorNearMatches("Totally New Vineyard Supply", vendors)).toEqual({ high: [], medium: [] });
  });
});
