import { describe, expect, it } from "vitest";
import { legacySprayRecords, type LegacyMappingInput } from "@/lib/fieldnotes/legacy-spray-core";
import { suggestLegacyMappings } from "@/lib/spray/legacy-mapping-core";

const note = {
  weekOf: "2025-06-13",
  vineyardId: "vy1",
  sprays: [{ name: "PRISTINE", scope: "BLOCKS" as const, blockIds: ["blk1", "blk2"] }],
};

describe("council S11 — a legacy spray is a LOW-CONFIDENCE RECORD, not an absence", () => {
  it("an unmapped legacy spray yields rotationContribution UNKNOWN and usableFor.rotation=false", () => {
    const [rec] = legacySprayRecords([note], []);
    expect(rec).toBeDefined();
    expect(rec.confidence).toBe("LOW");
    expect(rec.productIdentity).toBeNull();
    expect("unknown" in rec.rotationContribution && rec.rotationContribution.unknown).toBe(true);
    expect(rec.rotationContribution).not.toEqual({ groups: [] }); // the §3.6 failure mode, pinned
    expect(rec.usableFor).toEqual({ rotation: false, residual: false, compliance: false });
  });

  it("a CONFIRMED mapping yields groups but STILL confidence LOW and residual=false", () => {
    const mapping: LegacyMappingInput = {
      normalizedName: "PRISTINE",
      status: "CONFIRMED",
      epaRegistrationNumber: "7969-199",
      productName: "Pristine Fungicide",
      resistanceGroups: ["FRAC:7", "FRAC:11"],
    };
    const [rec] = legacySprayRecords([note], [mapping]);
    expect(rec.rotationContribution).toEqual({ groups: ["FRAC:7", "FRAC:11"] });
    expect(rec.confidence).toBe("LOW"); // a week bucket has no timestamp and no rate
    expect(rec.usableFor.rotation).toBe(true);
    expect(rec.usableFor.residual).toBe(false);
    expect(rec.usableFor.compliance).toBe(false);
    expect(rec.productIdentity).toEqual({ epaRegistrationNumber: "7969-199", productName: "Pristine Fungicide" });
  });

  it("a CONFIRMED mapping with UNRESOLVED groups still blocks a rotation-OK claim", () => {
    const mapping: LegacyMappingInput = {
      normalizedName: "PRISTINE",
      status: "CONFIRMED",
      epaRegistrationNumber: "7969-199",
      productName: "Pristine Fungicide",
      resistanceGroups: null,
    };
    const [rec] = legacySprayRecords([note], [mapping]);
    expect("unknown" in rec.rotationContribution && rec.rotationContribution.unknown).toBe(true);
  });

  it("a SUGGESTED-but-unconfirmed mapping is treated exactly like no mapping (rule §3.2)", () => {
    const mapping: LegacyMappingInput = {
      normalizedName: "PRISTINE",
      status: "SUGGESTED",
      epaRegistrationNumber: "7969-199",
      productName: "Pristine Fungicide",
      resistanceGroups: ["FRAC:7", "FRAC:11"],
    };
    const [rec] = legacySprayRecords([note], [mapping]);
    expect(rec.productIdentity).toBeNull();
    expect("unknown" in rec.rotationContribution && rec.rotationContribution.unknown).toBe(true);
    expect(rec.usableFor.rotation).toBe(false);
  });

  it("name variants collapse to one normalized key (NEEM OIL / neem-oil)", () => {
    const notes = [{ ...note, sprays: [{ name: "NEEM-OIL", scope: "WHOLE" as const, blockIds: [] }] }];
    const mapping: LegacyMappingInput = { normalizedName: "NEEMOIL", status: "CONFIRMED", epaRegistrationNumber: null, productName: "Neem Oil", resistanceGroups: null };
    const [rec] = legacySprayRecords(notes, [mapping]);
    expect(rec.normalizedName).toBe("NEEMOIL");
    expect(rec.productIdentity).not.toBeNull();
  });
});

describe("rule §3.2 — the suggester is deterministic, never fuzzy", () => {
  const catalog = [
    { epaRegistrationNumber: "7969-199", productName: "Pristine" },
    { epaRegistrationNumber: "100-1234", productName: "Quintec" },
  ];

  it("suggests on an EXACT normalized-key match", () => {
    const s = suggestLegacyMappings(["pristine", "PRISTINE"], catalog);
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ normalizedName: "PRISTINE", epaRegistrationNumber: "7969-199", suggestionBasis: "EXACT_NORMALIZED_NAME_MATCH" });
  });

  it("NEVER returns a partial-string match", () => {
    // "PRISTINE PLUS" contains "PRISTINE" — a fuzzy matcher would map it; ours must not.
    expect(suggestLegacyMappings(["PRISTINE PLUS"], catalog)).toEqual([]);
    expect(suggestLegacyMappings(["QUIN"], catalog)).toEqual([]);
  });

  it("an unknown name yields no suggestion (unknown stays unknown)", () => {
    expect(suggestLegacyMappings(["MYSTERY BREW"], catalog)).toEqual([]);
  });
});
