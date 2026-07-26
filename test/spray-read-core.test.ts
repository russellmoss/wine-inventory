import { describe, expect, it } from "vitest";
import {
  blockApplicationFacts,
  foldCurrentApplications,
  materialRatePerHa,
  reiWindow,
  residualAnchor,
  rotationContribution,
} from "@/lib/spray/read-core";
import type { SprayApplicationRow, SprayBlockLineRow, SprayMaterialLineRow } from "@/lib/spray/types";

const app: SprayApplicationRow = {
  id: "app1",
  vineyardId: "vy1",
  status: "ACTIVE",
  revision: 1,
  supersedesApplicationId: null,
  supersededByApplicationId: null,
  correctionKind: null,
  applicationMethod: "AIRBLAST",
  startedAt: new Date("2026-07-01T06:00:00Z"),
  finishedAt: new Date("2026-07-01T18:00:00Z"),
  sprayVolumePerHaL: 900,
  carrierWaterVolumeL: null,
  tankVolumeL: null,
};

const materialLine = (over: Partial<SprayMaterialLineRow> = {}): SprayMaterialLineRow => ({
  id: "m1",
  applicationId: "app1",
  lineNo: 1,
  productName: "QA Pristine",
  epaRegistrationNumber: "7969-199",
  tenantProductRef: null,
  productIdentitySource: "EPA_REGISTRY",
  materialRole: "PESTICIDE",
  adjuvantClass: null,
  quantityEntered: 10,
  quantityUnit: "OZ",
  quantityBasis: "PER_AREA",
  quantityCanonical: 0.7,
  quantityDimension: "MASS",
  enteredReiHours: null,
  enteredPhiDays: null,
  snapshotPhiDays: 14,
  snapshotReiHours: 24,
  snapshotRainfastHours: 2,
  snapshotMobilityClass: "TRANSLAMINAR",
  snapshotResistanceGroups: ["FRAC:7", "FRAC:11"],
  resistanceGroupsKnown: true,
  snapshotActiveIngredientKeys: ["BOSCALID", "PYRACLOSTROBIN"],
  activeIngredientsKnown: true,
  factsRevision: 3,
  factsAsOf: new Date("2026-06-01T00:00:00Z"),
  factsSource: "REGISTRY",
  factsCompleteness: "KNOWN",
  ...over,
});

const blockLine = (over: Partial<SprayBlockLineRow> = {}): SprayBlockLineRow => ({
  id: "b1",
  applicationId: "app1",
  blockId: "blk1",
  segmentNo: 1,
  blockLabelSnapshot: "Block 1",
  treatedAreaHa: 2,
  treatedAreaSource: "DERIVED_FROM_SPACING",
  startedAt: new Date("2026-07-01T06:00:00Z"),
  finishedAt: new Date("2026-07-01T07:00:00Z"),
  volumeUsedL: null,
  computedVolumePerHaL: 900,
  rateBasis: "HEADER_VOLUME",
  depositionMethod: null,
  depositionAdequate: null,
  driedBeforeRainDerived: null,
  driedBeforeRainBasis: null,
  ...over,
});

describe("the current view (KD-1)", () => {
  it("a superseded or voided record never appears", () => {
    const rows = [
      { id: "a", status: "SUPERSEDED" },
      { id: "b", status: "ACTIVE" },
      { id: "c", status: "VOIDED" },
    ];
    expect(foldCurrentApplications(rows).map((r) => r.id)).toEqual(["b"]);
  });
});

describe("rule §3.6 — rotationContribution keys off KNOWNNESS, not array length", () => {
  it("an UNKNOWN-facts line yields { unknown: true } — NOT { groups: [] }", () => {
    const c = rotationContribution(materialLine({ resistanceGroupsKnown: false, snapshotResistanceGroups: [], factsCompleteness: "UNKNOWN" }));
    expect(c).not.toEqual({ groups: [] }); // the plausible-but-wrong implementation
    expect("unknown" in c && c.unknown).toBe(true);
  });

  it("a premix contributes BOTH groups", () => {
    const c = rotationContribution(materialLine());
    expect(c).toEqual({ groups: ["FRAC:7", "FRAC:11"] });
  });

  it("known=false with a non-empty array (impossible at the DB, defended anyway) is unknown", () => {
    const c = rotationContribution(materialLine({ resistanceGroupsKnown: false }));
    expect("unknown" in c && c.unknown).toBe(true);
  });
});

describe("council G2/C14 — REI/residual NEVER borrow the header timestamp", () => {
  it("a twelve-hour pass where block 10 has no finishedAt → UNKNOWN for block 10, block 1 resolves", () => {
    const lines = [materialLine()];
    const block1 = blockLine();
    const block10 = blockLine({ id: "b10", blockId: "blk10", blockLabelSnapshot: "Block 10", startedAt: new Date("2026-07-01T17:00:00Z"), finishedAt: null });

    const w1 = reiWindow(block1, lines);
    expect(w1.state).toBe("KNOWN");
    if (w1.state === "KNOWN") {
      // Anchored on the BLOCK's 07:00 finish, not the header's 18:00 — never borrows.
      expect(w1.reiEndsAt.toISOString()).toBe("2026-07-02T07:00:00.000Z");
    }

    const w10 = reiWindow(block10, lines);
    expect(w10.state).toBe("UNKNOWN");

    const a10 = residualAnchor(block10);
    expect("unknown" in a10 && a10.unknown).toBe(true);
    const a1 = residualAnchor(block1);
    expect("anchor" in a1 && a1.anchor.toISOString()).toBe("2026-07-01T07:00:00.000Z");
  });

  it("no REI on any line → UNKNOWN, never clear", () => {
    const w = reiWindow(blockLine(), [materialLine({ snapshotReiHours: null, enteredReiHours: null })]);
    expect(w.state).toBe("UNKNOWN");
  });

  it("the snapshot beats the hand-copied form value; the form value is a labelled fallback", () => {
    const snap = reiWindow(blockLine(), [materialLine({ snapshotReiHours: 48, enteredReiHours: 12 })]);
    if (snap.state === "KNOWN") expect(snap).toMatchObject({ reiHours: 48, basis: "SNAPSHOT" });
    const entered = reiWindow(blockLine(), [materialLine({ snapshotReiHours: null, enteredReiHours: 12 })]);
    if (entered.state === "KNOWN") expect(entered).toMatchObject({ reiHours: 12, basis: "ENTERED" });
  });
});

describe("KD-7 / council G3 — materialRatePerHa", () => {
  const blocks = [blockLine(), blockLine({ id: "b2", blockId: "blk2", treatedAreaHa: 3 })];

  it("PER_AREA → the canonical per-ha amount directly", () => {
    const r = materialRatePerHa(app, blocks[0], materialLine({ quantityBasis: "PER_AREA", quantityCanonical: 5.6 }), blocks);
    expect(r).toEqual({ ratePerHa: 5.6, dimension: "MASS" });
  });

  it("TOTAL_IN_TANK → total ÷ the pass's total area", () => {
    const r = materialRatePerHa(app, blocks[0], materialLine({ quantityBasis: "TOTAL_IN_TANK", quantityCanonical: 10 }), blocks);
    expect(r!.ratePerHa).toBeCloseTo(2, 9); // 10 kg over 5 ha
  });

  it("PER_CARRIER_VOLUME → per-L × the block's carrier rate", () => {
    const r = materialRatePerHa(app, blocks[0], materialLine({ quantityBasis: "PER_CARRIER_VOLUME", quantityCanonical: 0.0024 }), blocks);
    expect(r!.ratePerHa).toBeCloseTo(2.16, 6); // 0.0024 kg/L × 900 L/ha
  });

  it("returns null (NOT 0) with a missing area, quantity, or unconvertible basis", () => {
    expect(materialRatePerHa(app, blocks[0], materialLine({ quantityCanonical: 0 }), blocks)).toBeNull();
    expect(materialRatePerHa(app, blocks[0], materialLine({ quantityBasis: "TOTAL_IN_TANK" }), [])).toBeNull();
    const noCarrier = { ...app, sprayVolumePerHaL: null };
    expect(
      materialRatePerHa(noCarrier, blockLine({ computedVolumePerHaL: null }), materialLine({ quantityBasis: "PER_CARRIER_VOLUME" }), blocks),
    ).toBeNull();
  });
});

describe("blockApplicationFacts — the S6 contract", () => {
  it("composes per-block facts with honesty intact", () => {
    const facts = blockApplicationFacts(app, blockLine(), [materialLine({ factsCompleteness: "UNKNOWN", resistanceGroupsKnown: false, snapshotResistanceGroups: [], activeIngredientsKnown: false, snapshotActiveIngredientKeys: [] })], [blockLine()]);
    expect(facts.blockId).toBe("blk1");
    expect(facts.hasDepositionEvidence).toBe(false);
    const m = facts.materials[0];
    expect("unknown" in m.resistanceGroups && m.resistanceGroups.unknown).toBe(true);
    expect("unknown" in (m.aiKeys as object)).toBe(true);
  });
});
