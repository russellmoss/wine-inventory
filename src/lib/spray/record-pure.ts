// Spray Intelligence S3a — the PURE half of the write core: validation, rate basis, area
// snapshotting, canonical quantity, request hashing. No Prisma, no I/O — unit-tested directly;
// record-core.ts calls these inside the transaction.

import { blockHectares } from "@/lib/vineyard/units";
import { acresToHectares, toCanonicalQuantity } from "./units-core";
import type {
  RecordSprayInput,
  SprayAreaSource,
  SprayBlockLineInput,
  SprayMaterialLineInput,
  SprayQuantityDimension,
  SprayRateBasis,
  SprayWarning,
} from "./types";

export const SEGMENT_GAP_WARN_HOURS = 24; // open question D3 — default 24h, warn only, never block

export interface SprayValidationResult {
  errors: string[];
  warnings: SprayWarning[];
}

/**
 * Validate a record input. Errors block the write; warnings never do (KD-12 — the two soft cases
 * warn: segments of one block >24h apart, and a PER_CARRIER_VOLUME line with no carrier volume).
 */
export function validateSprayInput(input: RecordSprayInput): SprayValidationResult {
  const errors: string[] = [];
  const warnings: SprayWarning[] = [];

  if (!input.applicatorName?.trim()) errors.push("applicatorName is required.");
  if (!input.materialLines?.length) errors.push("At least one material line is required.");
  if (!input.blockLines?.length) errors.push("At least one block line is required.");
  if (input.finishedAt && input.finishedAt < input.startedAt) errors.push("finishedAt must be >= startedAt.");

  const seenLineNo = new Set<number>();
  (input.materialLines ?? []).forEach((line, i) => {
    const lineNo = i + 1;
    if (seenLineNo.has(lineNo)) errors.push(`Duplicate material lineNo ${lineNo}.`);
    seenLineNo.add(lineNo);
    if (!line.productName?.trim()) errors.push(`Material line ${lineNo}: productName is required.`);
    if (line.adjuvantClass && line.materialRole !== "ADJUVANT")
      errors.push(`Material line ${lineNo}: adjuvantClass is only valid when materialRole is ADJUVANT.`);
    if (!(line.quantityEntered > 0)) errors.push(`Material line ${lineNo}: quantityEntered must be > 0.`);
    if (line.quantityBasis === "PER_AREA" && !line.perAreaUnit)
      errors.push(`Material line ${lineNo}: perAreaUnit (ACRE|HECTARE) is required for a PER_AREA quantity — never guessed (council G3).`);
    if (line.quantityBasis === "PER_CARRIER_VOLUME" && !line.perCarrierVolume)
      errors.push(`Material line ${lineNo}: perCarrierVolume is required for a PER_CARRIER_VOLUME quantity — never guessed (council G3).`);
    if (line.quantityBasis === "PER_CARRIER_VOLUME" && input.carrierWaterVolumeL == null && input.sprayVolumePerHaL == null)
      warnings.push({
        code: "MISSING_CARRIER_VOLUME_FOR_BASIS",
        message: `Material line ${lineNo} is dosed per carrier volume but no carrier volume or header spray volume was recorded — the material rate will be UNKNOWN downstream.`,
      });
  });

  const seenBlockSegment = new Set<string>();
  const segmentsByBlock = new Map<string, SprayBlockLineInput[]>();
  (input.blockLines ?? []).forEach((line, i) => {
    const segmentNo = line.segmentNo ?? 1;
    const key = `${line.blockId}#${segmentNo}`;
    if (seenBlockSegment.has(key)) errors.push(`Block line ${i + 1}: duplicate (blockId, segmentNo) ${key}.`);
    seenBlockSegment.add(key);
    if (segmentNo < 1) errors.push(`Block line ${i + 1}: segmentNo must be >= 1.`);
    if (line.treatedAreaHa != null && !(line.treatedAreaHa > 0)) errors.push(`Block line ${i + 1}: treatedAreaHa must be > 0.`);
    if (line.startedAt && line.finishedAt && line.finishedAt < line.startedAt)
      errors.push(`Block line ${i + 1}: finishedAt must be >= startedAt.`);
    const list = segmentsByBlock.get(line.blockId) ?? [];
    list.push(line);
    segmentsByBlock.set(line.blockId, list);
  });

  // D3: two segments of one block more than 24h apart — two dates mean two residual clocks.
  for (const [blockId, segments] of segmentsByBlock) {
    if (segments.length < 2) continue;
    const times = segments
      .flatMap((s) => [s.startedAt, s.finishedAt])
      .filter((t): t is Date => t != null)
      .map((t) => t.getTime());
    if (times.length >= 2 && Math.max(...times) - Math.min(...times) > SEGMENT_GAP_WARN_HOURS * 3600_000) {
      warnings.push({
        code: "SEGMENT_GAP_OVER_24H",
        message: `Block ${blockId}: segments are more than ${SEGMENT_GAP_WARN_HOURS}h apart — consider a separate spray record (two dates mean two residual clocks).`,
      });
    }
  }

  return { errors, warnings };
}

/**
 * The carrier rate for one block line with its provenance (KD-7). MEASURED when the block's own
 * volumeUsedL exists, HEADER_VOLUME when only the header spray volume does, else UNKNOWN with a
 * null rate — never 0.
 */
export function computeRateBasis(
  blockLine: { volumeUsedL?: number | null; treatedAreaHa: number },
  headerSprayVolumePerHaL: number | null | undefined,
): { rateBasis: SprayRateBasis; computedVolumePerHaL: number | null } {
  if (blockLine.volumeUsedL != null && blockLine.volumeUsedL > 0 && blockLine.treatedAreaHa > 0) {
    return { rateBasis: "MEASURED", computedVolumePerHaL: blockLine.volumeUsedL / blockLine.treatedAreaHa };
  }
  if (headerSprayVolumePerHaL != null && headerSprayVolumePerHaL > 0) {
    return { rateBasis: "HEADER_VOLUME", computedVolumePerHaL: headerSprayVolumePerHaL };
  }
  return { rateBasis: "UNKNOWN", computedVolumePerHaL: null };
}

export interface BlockAreaSnapshot {
  treatedAreaHa: number | null;
  treatedAreaSource: SprayAreaSource;
  blockLabelSnapshot: string;
}

/**
 * Snapshot a block line's treated area at ENTRY (KD-6): operator-entered wins (recorded as such,
 * council CQ2), else derived from spacing × vine count. Null area (underivable, not entered) is an
 * error the caller surfaces — never silently defaulted.
 */
export function snapshotBlockLine(
  line: SprayBlockLineInput,
  block: {
    blockLabel: string | null;
    code: string | null;
    rowSpacingM: number | null;
    vineSpacingM: number | null;
    vineCount: number | null;
  },
): BlockAreaSnapshot {
  const blockLabelSnapshot = block.blockLabel?.trim() || block.code?.trim() || line.blockId;
  if (line.treatedAreaHa != null && line.treatedAreaHa > 0) {
    return { treatedAreaHa: line.treatedAreaHa, treatedAreaSource: line.treatedAreaSource ?? "OPERATOR_ENTERED", blockLabelSnapshot };
  }
  const derived = blockHectares(block.rowSpacingM, block.vineSpacingM, block.vineCount);
  if (derived != null && derived > 0) {
    return { treatedAreaHa: derived, treatedAreaSource: "DERIVED_FROM_SPACING", blockLabelSnapshot };
  }
  return { treatedAreaHa: null, treatedAreaSource: line.treatedAreaSource ?? "OPERATOR_ENTERED", blockLabelSnapshot };
}

/**
 * Canonicalize one material-line quantity by its basis (KD-5):
 *   TOTAL_IN_TANK      → total canonical amount (L | KG)
 *   PER_AREA           → canonical amount PER HECTARE (denominator from the REQUIRED perAreaUnit)
 *   PER_CARRIER_VOLUME → canonical amount PER LITER of carrier (denominator from the REQUIRED perCarrierVolume)
 * Returns null when the quantity/denominator cannot be converted — never a guess.
 */
export function canonicalQuantityForBasis(
  line: SprayMaterialLineInput,
): { quantityCanonical: number; quantityDimension: SprayQuantityDimension } | null {
  const amount = toCanonicalQuantity(line.quantityEntered, line.quantityUnit);
  if (!amount) return null;
  switch (line.quantityBasis) {
    case "TOTAL_IN_TANK":
      return { quantityCanonical: amount.value, quantityDimension: amount.dimension };
    case "PER_AREA": {
      if (!line.perAreaUnit) return null;
      const perHa = line.perAreaUnit === "HECTARE" ? amount.value : amount.value / acresToHectares(1);
      return { quantityCanonical: perHa, quantityDimension: amount.dimension };
    }
    case "PER_CARRIER_VOLUME": {
      if (!line.perCarrierVolume) return null;
      const carrier = toCanonicalQuantity(line.perCarrierVolume.value, line.perCarrierVolume.unit);
      if (!carrier || carrier.dimension !== "VOLUME") return null;
      return { quantityCanonical: amount.value / carrier.value, quantityDimension: amount.dimension };
    }
  }
}

// ── request hashing (council C8 — uniqueness is not idempotency) ──

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

/** FNV-1a 64-bit over a stable serialization — a deterministic retry comparator, not a secret.
 * BigInt via the constructor (not literals) — the tsconfig target predates ES2020 literals. */
const FNV_OFFSET = BigInt("0xcbf29ce484222325");
const FNV_PRIME = BigInt("0x100000001b3");
const FNV_MASK = BigInt("0xffffffffffffffff");
export function computeRequestHash(payload: unknown): string {
  const s = stableStringify(payload);
  let h = FNV_OFFSET;
  for (let i = 0; i < s.length; i++) {
    h ^= BigInt(s.charCodeAt(i));
    h = (h * FNV_PRIME) & FNV_MASK;
  }
  return h.toString(16).padStart(16, "0");
}
