// Spray Intelligence S3a — the PURE read fold every Wave-2 lane consumes (S6 residual, S7a
// legality/rotation, S8 lot residue). Rows in, DTOs out, no Prisma.
//
// The honesty contracts this file OWNS (each pinned by a test + a verify:spray-record assertion):
//   - rotationContribution NEVER returns an empty group list — an empty list reads as "no groups
//     used" and would grant a rotation-OK claim (rule §3.6). It keys off resistanceGroupsKnown,
//     not array length (council C7).
//   - reiWindow / residualAnchor return UNKNOWN for a block line whose OWN finishedAt is null and
//     NEVER fall back to the header timestamp (council G2/C14 — a fallback starts the clock early
//     for the blocks sprayed last and clears a block still under restricted entry).
//   - materialRatePerHa returns null (never 0) for anything it cannot convert (council G3).

import type {
  SprayApplicationRow,
  SprayBlockLineRow,
  SprayFactsCompleteness,
  SprayMaterialLineRow,
  SprayMobilityClass,
  SprayRateBasis,
  UnknownValue,
} from "./types";

/** The current view: chain heads only. SUPERSEDED and VOIDED rows never appear (KD-1). */
export function foldCurrentApplications<T extends { status: string }>(rows: T[]): T[] {
  return rows.filter((r) => r.status === "ACTIVE");
}

export type RotationContribution = { groups: string[] } | UnknownValue;

/**
 * What one material line contributes to a rotation budget. A premix counts against EVERY group it
 * contains, by construction. Keys off resistanceGroupsKnown — never off array length (SPRAY-3).
 */
export function rotationContribution(line: {
  resistanceGroupsKnown: boolean;
  snapshotResistanceGroups: string[];
  factsCompleteness: SprayFactsCompleteness;
  productName: string;
}): RotationContribution {
  if (!line.resistanceGroupsKnown || line.snapshotResistanceGroups.length === 0) {
    return {
      unknown: true,
      reason: `Resistance groups for "${line.productName}" are not determined (factsCompleteness: ${line.factsCompleteness}) — this blocks a rotation-OK claim rather than granting one.`,
    };
  }
  return { groups: [...line.snapshotResistanceGroups] };
}

/**
 * The MATERIAL rate per hectare for one block line, derived on demand (KD-7 — never stored).
 * Branches on quantityBasis; null (never 0) for a basis it cannot convert:
 *   PER_AREA           → quantityCanonical (already per ha)
 *   TOTAL_IN_TANK      → total ÷ the pass's total treated area (needs every block line)
 *   PER_CARRIER_VOLUME → per-L-of-carrier × the block's carrier rate (needs a carrier rate)
 */
export function materialRatePerHa(
  application: Pick<SprayApplicationRow, "sprayVolumePerHaL">,
  blockLine: Pick<SprayBlockLineRow, "treatedAreaHa" | "computedVolumePerHaL">,
  materialLine: Pick<SprayMaterialLineRow, "quantityCanonical" | "quantityBasis" | "quantityDimension">,
  allBlockLines: Pick<SprayBlockLineRow, "treatedAreaHa">[],
): { ratePerHa: number; dimension: SprayMaterialLineRow["quantityDimension"] } | null {
  const q = materialLine.quantityCanonical;
  if (!(q > 0)) return null;
  switch (materialLine.quantityBasis) {
    case "PER_AREA":
      return { ratePerHa: q, dimension: materialLine.quantityDimension };
    case "TOTAL_IN_TANK": {
      const totalHa = allBlockLines.reduce((sum, b) => sum + (b.treatedAreaHa > 0 ? b.treatedAreaHa : 0), 0);
      if (!(totalHa > 0)) return null;
      return { ratePerHa: q / totalHa, dimension: materialLine.quantityDimension };
    }
    case "PER_CARRIER_VOLUME": {
      const carrierRate = blockLine.computedVolumePerHaL ?? application.sprayVolumePerHaL;
      if (carrierRate == null || !(carrierRate > 0)) return null;
      return { ratePerHa: q * carrierRate, dimension: materialLine.quantityDimension };
    }
  }
}

export type ReiWindow =
  | { state: "KNOWN"; reiEndsAt: Date; reiHours: number; basis: "SNAPSHOT" | "ENTERED" }
  | { state: "UNKNOWN"; reason: string };

/**
 * The restricted-entry window for one block line. UNKNOWN when the block's own finishedAt is null
 * (NEVER the header's — council G2/C14) or when no line carries any REI. The longest REI across
 * the tank governs. Registry snapshot beats the hand-copied form value; both are labelled.
 */
export function reiWindow(
  blockLine: Pick<SprayBlockLineRow, "finishedAt" | "blockLabelSnapshot">,
  materialLines: Pick<SprayMaterialLineRow, "snapshotReiHours" | "enteredReiHours">[],
): ReiWindow {
  if (blockLine.finishedAt == null) {
    return {
      state: "UNKNOWN",
      reason: `Block ${blockLine.blockLabelSnapshot}: no per-block finish time recorded — the REI clock cannot start (a header-time fallback would clear a block still under restricted entry).`,
    };
  }
  let best: { reiHours: number; basis: "SNAPSHOT" | "ENTERED" } | null = null;
  for (const line of materialLines) {
    const candidate =
      line.snapshotReiHours != null
        ? { reiHours: line.snapshotReiHours, basis: "SNAPSHOT" as const }
        : line.enteredReiHours != null
          ? { reiHours: line.enteredReiHours, basis: "ENTERED" as const }
          : null;
    if (candidate && (best == null || candidate.reiHours > best.reiHours)) best = candidate;
  }
  if (best == null) {
    return { state: "UNKNOWN", reason: "No REI is determined for any material in this pass — unknown, not clear." };
  }
  return {
    state: "KNOWN",
    reiEndsAt: new Date(blockLine.finishedAt.getTime() + best.reiHours * 3600_000),
    reiHours: best.reiHours,
    basis: best.basis,
  };
}

export type ResidualAnchor = { anchor: Date } | UnknownValue;

/** The instant S6's residual clocks decay from — the block's OWN finish time, never the header's. */
export function residualAnchor(blockLine: Pick<SprayBlockLineRow, "finishedAt" | "blockLabelSnapshot">): ResidualAnchor {
  if (blockLine.finishedAt == null) {
    return {
      unknown: true,
      reason: `Block ${blockLine.blockLabelSnapshot}: no per-block finish time — the residual clock has no anchor (never borrows the header timestamp).`,
    };
  }
  return { anchor: blockLine.finishedAt };
}

export interface BlockMaterialFacts {
  productName: string;
  epaRegistrationNumber: string | null;
  resistanceGroups: RotationContribution;
  aiKeys: string[] | UnknownValue;
  phiDays: number | null;
  reiHours: number | null;
  rainfastHours: number | null;
  mobilityClass: SprayMobilityClass | null;
  factsCompleteness: SprayFactsCompleteness;
  ratePerHa: { ratePerHa: number; dimension: "VOLUME" | "MASS" } | null;
}

export interface BlockApplicationFacts {
  applicationId: string;
  blockId: string;
  segmentNo: number;
  blockLabel: string;
  startedAt: Date | null;
  finishedAt: Date | null;
  treatedAreaHa: number;
  treatedAreaSource: SprayBlockLineRow["treatedAreaSource"];
  carrierRatePerHaL: number | null;
  rateBasis: SprayRateBasis;
  hasDepositionEvidence: boolean;
  reiWindow: ReiWindow;
  residualAnchor: ResidualAnchor;
  materials: BlockMaterialFacts[];
}

/** The S6 contract: everything the residual/legality/residue engines read for one block line. */
export function blockApplicationFacts(
  application: SprayApplicationRow,
  blockLine: SprayBlockLineRow,
  materialLines: SprayMaterialLineRow[],
  allBlockLines: SprayBlockLineRow[],
): BlockApplicationFacts {
  return {
    applicationId: application.id,
    blockId: blockLine.blockId,
    segmentNo: blockLine.segmentNo,
    blockLabel: blockLine.blockLabelSnapshot,
    startedAt: blockLine.startedAt,
    finishedAt: blockLine.finishedAt,
    treatedAreaHa: blockLine.treatedAreaHa,
    treatedAreaSource: blockLine.treatedAreaSource,
    carrierRatePerHaL: blockLine.computedVolumePerHaL,
    rateBasis: blockLine.rateBasis,
    hasDepositionEvidence: blockLine.depositionMethod != null,
    reiWindow: reiWindow(blockLine, materialLines),
    residualAnchor: residualAnchor(blockLine),
    materials: materialLines.map((m) => ({
      productName: m.productName,
      epaRegistrationNumber: m.epaRegistrationNumber,
      resistanceGroups: rotationContribution(m),
      aiKeys: m.activeIngredientsKnown && m.snapshotActiveIngredientKeys.length
        ? [...m.snapshotActiveIngredientKeys]
        : { unknown: true, reason: `Active ingredients for "${m.productName}" are not determined.` },
      phiDays: m.snapshotPhiDays ?? m.enteredPhiDays,
      reiHours: m.snapshotReiHours ?? m.enteredReiHours,
      rainfastHours: m.snapshotRainfastHours,
      mobilityClass: m.snapshotMobilityClass,
      factsCompleteness: m.factsCompleteness,
      ratePerHa: materialRatePerHa(application, blockLine, m, allBlockLines),
    })),
  };
}
