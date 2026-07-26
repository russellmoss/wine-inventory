import { describe, it, expect } from "vitest";
import fixtures from "./fixtures/pesticide/appril-rows.json";
import {
  parseApprilRow,
  parseAisCell,
  parseSitesCell,
  isGrapeCropSite,
  parseSiteModifier,
  excelSerialToDate,
} from "@/lib/pesticide/appril-parse";

// Spray S2 Unit 3 — pure APPRIL parsing over real-shaped fixture rows. The safety-relevant cases:
// the grape/ornamental discrimination (Grape-Ivy IS matched by the plan's bare regex — the fix is
// tested here), the K11 bearing modifier (EPA spells it "Nonbearing"), blank PEST_CAT survival, and
// malformed AIS cells being reported rather than silently dropped.

type Row = Record<string, string>;
const row = (key: keyof typeof fixtures): Row => fixtures[key] as Row;

describe("grape-crop site discrimination", () => {
  it("accepts the real grape site vocabulary", () => {
    for (const s of [
      "Grapes (Foliar Treatment)",
      "Grapes (Wine) (Foliar Treatment)",
      "Grapes (Raisin) (Soil Treatment)",
      "Grapes (Muscadine) (Foliar Treatment)",
      "Grapes (Nonbearing)",
      "Grapes (Thompson Seedless) (Foliar Treatment)",
    ]) {
      expect(isGrapeCropSite(s), `${s} is a grape crop site`).toBe(true);
    }
  });

  it("rejects every look-alike in the dump's vocabulary — including Grape-Ivy, which the plan's bare regex matches", () => {
    for (const s of [
      "Grapefruit (Foliar Treatment)",
      "Grape-Ivy (Interior Plantscapes)",
      "Grape-Ivy (Houseplant)",
      "Oregongrape (Foliar Treatment)",
      "Grapevines (Ornamental) (Foliar Treatment)",
      "Grapefruit (Nonbearing)",
    ]) {
      expect(isGrapeCropSite(s), `${s} must NOT count as grape`).toBe(false);
    }
  });

  it("a row whose only grape-ish sites are ornamental/citrus yields zero grape sites", () => {
    const r = parseApprilRow(row("ornamental_traps_only"));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.record.sites.filter((s) => s.isGrape)).toEqual([]);
  });
});

describe("siteModifier (K11 — council G1)", () => {
  it("EPA's 'Nonbearing' spelling yields NON_BEARING", () => {
    expect(parseSiteModifier("Grapes (Nonbearing)")).toBe("NON_BEARING");
  });
  it("a hyphenated 'Non-bearing' also yields NON_BEARING", () => {
    expect(parseSiteModifier("Grapes (Non-bearing)")).toBe("NON_BEARING");
  });
  it("a bare 'Grapes' site is UNSPECIFIED — never BEARING", () => {
    expect(parseSiteModifier("Grapes (Foliar Treatment)")).toBe("UNSPECIFIED");
    expect(parseSiteModifier("Grapes (Soil Treatment)")).toBe("UNSPECIFIED");
  });
  it("the real non-bearing-only herbicide row carries NON_BEARING on its grape site", () => {
    const r = parseApprilRow(row("surflan_nonbearing"));
    expect(r.ok).toBe(true);
    if (r.ok) {
      const grape = r.record.sites.filter((s) => s.isGrape);
      expect(grape).toHaveLength(1);
      expect(grape[0].siteModifier).toBe("NON_BEARING");
    }
  });
});

describe("AIS cell parsing", () => {
  it("a premix yields BOTH active ingredients with PC codes (the Switch case)", () => {
    const r = parseApprilRow(row("switch_premix"));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.record.ais).toEqual([
        { name: "Cyprodinil", pcCode: "288202", casNumber: "121552-61-2", percent: 37.5 },
        { name: "Fludioxonil", pcCode: "071503", casNumber: "131341-86-1", percent: 25 },
      ]);
      expect(r.record.aisErrors).toEqual([]);
    }
  });

  it("an AI name containing a comma parses whole (1,3-Dichloropropene — entries split on signature, not commas)", () => {
    const { ais, errors } = parseAisCell(row("comma_in_ai_name").AIS);
    expect(errors).toEqual([]);
    expect(ais.map((a) => a.name)).toEqual(["1,3-Dichloropropene", "Chloropicrin"]);
  });

  it("a malformed AIS tail is REPORTED, never silently dropped", () => {
    const r = parseApprilRow(row("malformed_ais_tail"));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.record.ais).toHaveLength(1); // the parseable Captan entry survives
      expect(r.record.aisErrors).toHaveLength(1);
      expect(r.record.aisErrors[0]).toContain("Mystery Compound");
    }
  });

  it("an empty AIS cell yields no AIs and no errors", () => {
    expect(parseAisCell("")).toEqual({ ais: [], errors: [] });
  });
});

describe("row-level parsing", () => {
  it("blank PEST_CAT survives as null (unknown), the row is NOT dropped", () => {
    const r = parseApprilRow(row("blank_pest_cat"));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.record.pestCategoryRaw).toBeNull();
      expect(r.record.sites.some((s) => s.isGrape)).toBe(true);
    }
  });

  it("multi-class PEST_CAT is kept raw, uncollapsed", () => {
    const r = parseApprilRow({ ...row("maneb_single_ai"), PEST_CAT: "Insecticide, Miticide" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.record.pestCategoryRaw).toBe("Insecticide, Miticide");
  });

  it("Excel serial label dates convert (45768 → 2025-04-21, matching the label PDF's own date)", () => {
    expect(excelSerialToDate("45768.0")?.toISOString().slice(0, 10)).toBe("2025-04-21");
    expect(excelSerialToDate("")).toBeNull();
    expect(excelSerialToDate("not-a-number")).toBeNull();
  });

  it("a row without REG_NUM is a typed failure, not a guess", () => {
    expect(parseApprilRow({ PRODUCT_NAME: "X" })).toEqual({ ok: false, error: "missing REG_NUM" });
  });

  it("sites cell parses into the full typed list", () => {
    const sites = parseSitesCell(row("maneb_single_ai").SITES);
    expect(sites).toHaveLength(3);
    expect(sites.filter((s) => s.isGrape)).toHaveLength(2);
  });
});
