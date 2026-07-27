import { describe, expect, it } from "vitest";
import { buildFactsSnapshot, normalizeAiKey, normalizeResistanceCode } from "@/lib/spray/facts-snapshot-core";
import { NullProductFactsResolver, UNRESOLVED_PRODUCT_FACTS, type ResolvedProductFacts } from "@/lib/spray/product-facts-port";

const resolved = (overrides: Partial<ResolvedProductFacts>): ResolvedProductFacts => ({
  ...UNRESOLVED_PRODUCT_FACTS,
  ...overrides,
});

describe("KD-3 — the null resolver makes unknown-never-clear TRUE TODAY", () => {
  it("yields UNKNOWN, every discrete column null, both arrays empty, both knownness flags FALSE", async () => {
    const [facts] = await NullProductFactsResolver.resolveMany([{ productName: "Pristine" }]);
    const snap = buildFactsSnapshot(facts);
    expect(snap.factsCompleteness).toBe("UNKNOWN");
    expect(snap.snapshotPhiDays).toBeNull();
    expect(snap.snapshotReiHours).toBeNull();
    expect(snap.snapshotRainfastHours).toBeNull();
    expect(snap.snapshotMobilityClass).toBeNull();
    expect(snap.snapshotResistanceGroups).toEqual([]);
    expect(snap.resistanceGroupsKnown).toBe(false);
    expect(snap.snapshotActiveIngredientKeys).toEqual([]);
    expect(snap.activeIngredientsKnown).toBe(false);
    expect(snap.factsSource).toBe("NONE");
  });
});

describe("KD-4 / council C7 — knownness is derived from content, never claimed", () => {
  it("a partial result yields PARTIAL, never KNOWN", () => {
    const snap = buildFactsSnapshot(resolved({ completeness: "KNOWN", phiDays: 14, reiHours: 24 }));
    expect(snap.factsCompleteness).toBe("PARTIAL");
    expect(snap.factsCompleteness).not.toBe("KNOWN");
  });

  it("factsCompleteness is never KNOWN when any input is null", () => {
    const snap = buildFactsSnapshot(
      resolved({
        phiDays: 14,
        reiHours: 24,
        rainfastHours: 2,
        mobilityClass: null, // one hole
        resistanceGroups: ["FRAC:7"],
        activeIngredientKeys: ["BOSCALID"],
      }),
    );
    expect(snap.factsCompleteness).toBe("PARTIAL");
  });

  it("all fields present ⇒ KNOWN with both flags true", () => {
    const snap = buildFactsSnapshot(
      resolved({
        phiDays: 14,
        reiHours: 24,
        rainfastHours: 2,
        mobilityClass: "TRANSLAMINAR",
        resistanceGroups: ["FRAC:7", "FRAC:11"],
        activeIngredientKeys: ["BOSCALID", "PYRACLOSTROBIN"],
        source: "REGISTRY",
      }),
    );
    expect(snap.factsCompleteness).toBe("KNOWN");
    expect(snap.resistanceGroupsKnown).toBe(true);
    expect(snap.activeIngredientsKnown).toBe(true);
  });

  it("a premix carries BOTH codes in snapshotResistanceGroups", () => {
    const snap = buildFactsSnapshot(resolved({ resistanceGroups: ["FRAC:7", "FRAC:11"] }));
    expect(snap.snapshotResistanceGroups).toEqual(["FRAC:7", "FRAC:11"]);
    expect(snap.resistanceGroupsKnown).toBe(true);
  });

  it("an empty array can NEVER be emitted with known = true (mirror of the DB CHECK, SPRAY-3)", () => {
    for (const groups of [null, [], ["", "   "]]) {
      const snap = buildFactsSnapshot(resolved({ resistanceGroups: groups as string[] | null }));
      // The plausible-but-wrong implementation would set known=true off a non-null array.
      expect(snap.resistanceGroupsKnown && snap.snapshotResistanceGroups.length === 0).toBe(false);
      expect(snap.resistanceGroupsKnown).toBe(false);
      expect(snap.snapshotResistanceGroups).toEqual([]);
    }
  });
});

describe("normalization", () => {
  it("scheme-prefixes and uppercases resistance codes", () => {
    expect(normalizeResistanceCode(" frac: 7 ")).toBe("FRAC:7");
    expect(normalizeResistanceCode("11")).toBe("FRAC:11");
    expect(normalizeResistanceCode("irac:4a")).toBe("IRAC:4A");
    expect(normalizeResistanceCode("  ")).toBeNull();
  });
  it("normalizes AI keys to stripped uppercase", () => {
    expect(normalizeAiKey("Copper Hydroxide")).toBe("COPPERHYDROXIDE");
    expect(normalizeAiKey("sulfur")).toBe("SULFUR");
    expect(normalizeAiKey("---")).toBeNull();
  });
  it("dedupes groups after normalization", () => {
    const snap = buildFactsSnapshot(resolved({ resistanceGroups: ["FRAC:7", "frac:7", "7"] }));
    expect(snap.snapshotResistanceGroups).toEqual(["FRAC:7"]);
  });
});

describe("S2↔S3a seam — the facts-as-of watermark is a COMPOSITE, not a scalar", () => {
  // Shaped exactly like S2's frozen PesticideFactsAsOf (contract doc: phases/S2-S3a-factsAsOf-contract.md).
  const registryFacts = {
    publishedRevisionId: "cmxyz0000abcd", // a cuid STRING — the seam defect was an Int column
    apprilAsOf: "2026-06-01T00:00:00.000Z",
    cdprAsOf: "2026-06-10T00:00:00.000Z",
    resistanceArtifactSha256: "sha256-of-the-committed-artifact",
  };

  it("flattens every component onto its own column — nothing is collapsed", () => {
    const snap = buildFactsSnapshot(resolved({ source: "REGISTRY", factsAsOf: registryFacts }));
    expect(snap.factsPublishedRevisionId).toBe("cmxyz0000abcd");
    expect(snap.factsApprilAsOf?.toISOString()).toBe("2026-06-01T00:00:00.000Z");
    expect(snap.factsCdprAsOf?.toISOString()).toBe("2026-06-10T00:00:00.000Z");
    expect(snap.factsResistanceArtifactSha256).toBe("sha256-of-the-committed-artifact");
  });

  it("the display factsAsOf is the NEWEST component, not the first or an average", () => {
    const snap = buildFactsSnapshot(resolved({ source: "REGISTRY", factsAsOf: registryFacts }));
    expect(snap.factsAsOf?.toISOString()).toBe("2026-06-10T00:00:00.000Z"); // cdpr, not april
  });

  it("a null component stays null — 'never published' is not 'current' (rule §3.6)", () => {
    const snap = buildFactsSnapshot(
      resolved({ source: "REGISTRY", factsAsOf: { ...registryFacts, cdprAsOf: null, resistanceArtifactSha256: null } }),
    );
    expect(snap.factsCdprAsOf).toBeNull();
    expect(snap.factsResistanceArtifactSha256).toBeNull();
    // …and the display date falls back to the newest component that DOES exist.
    expect(snap.factsAsOf?.toISOString()).toBe("2026-06-01T00:00:00.000Z");
  });

  it("no watermark at all (the null resolver) leaves every component null", () => {
    const snap = buildFactsSnapshot(resolved({}));
    expect(snap.factsPublishedRevisionId).toBeNull();
    expect(snap.factsApprilAsOf).toBeNull();
    expect(snap.factsCdprAsOf).toBeNull();
    expect(snap.factsResistanceArtifactSha256).toBeNull();
    expect(snap.factsAsOf).toBeNull();
  });

  it("a malformed ISO component is null, never an Invalid Date", () => {
    const snap = buildFactsSnapshot(resolved({ source: "REGISTRY", factsAsOf: { ...registryFacts, apprilAsOf: "not-a-date" } }));
    expect(snap.factsApprilAsOf).toBeNull();
    expect(snap.factsAsOf?.toISOString()).toBe("2026-06-10T00:00:00.000Z");
  });
});
