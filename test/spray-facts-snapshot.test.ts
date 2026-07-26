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
