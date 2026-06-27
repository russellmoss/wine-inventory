import { round2 } from "@/lib/bottling/draw";
import type { OperationType } from "@/lib/ledger/vocabulary";

// Pure cellar-additions math + volume-effect classification (Phase 3). No prisma, no
// server imports — unit-tested directly (test/additions-math.test.ts). A dose is a RATE
// against the vessel's CURRENT volume; the computed total + the volume snapshot are
// STORED, never recomputed on read (recompute-on-read corrupts history — VISION D14, the
// plan's Key Decisions). All figures go through round2 (centi-granularity, matches
// Decimal(10,2)) so sums are exact.

/**
 * Dose bases. A rate is "amount per volume"; the basis says which.
 *   G_HL  grams per hectoLITRE   → total g  = rate * V / 100
 *   MG_L  milligrams per litre (= ppm) → total g  = rate * V / 1000
 *   G_L   grams per litre        → total g  = rate * V
 *   ML_L  millilitres per litre  → total mL = rate * V
 * Domain identity: 1 g/hL = 10 mg/L = 10 ppm. `%` is a material property (percentActive),
 * never a dose basis, so it is intentionally absent.
 */
export const RATE_BASES = ["G_HL", "MG_L", "G_L", "ML_L"] as const;
export type RateBasis = (typeof RATE_BASES)[number];

/** Human labels for the basis picker (Design Spec: "g/hL · ppm (mg/L) · g/L · mL/L"). */
export const RATE_BASIS_LABELS: Record<RateBasis, string> = {
  G_HL: "g/hL",
  MG_L: "ppm (mg/L)",
  G_L: "g/L",
  ML_L: "mL/L",
};

export type AdditionTotal = { total: number; unit: "g" | "mL" };

/**
 * Turn a dictated rate into a computed total from the vessel's current volume.
 * Mass bases (G_HL, MG_L, G_L) yield grams; ML_L yields millilitres. Throws on a
 * negative rate, a non-positive volume, or an unknown basis (controlled vocabulary).
 */
export function computeAdditionTotal(rateValue: number, basis: RateBasis, volumeL: number): AdditionTotal {
  if (!Number.isFinite(rateValue) || rateValue < 0) {
    throw new Error("Addition rate must be a non-negative number.");
  }
  if (!Number.isFinite(volumeL) || volumeL <= 0) {
    throw new Error("Vessel volume must be greater than 0 to compute an addition.");
  }
  switch (basis) {
    case "G_HL":
      return { total: round2((rateValue * volumeL) / 100), unit: "g" };
    case "MG_L":
      return { total: round2((rateValue * volumeL) / 1000), unit: "g" };
    case "G_L":
      return { total: round2(rateValue * volumeL), unit: "g" };
    case "ML_L":
      return { total: round2(rateValue * volumeL), unit: "mL" };
    default:
      throw new Error(`Unknown rate basis: ${String(basis)}`);
  }
}

/** How an operation type changes the vessel's volume (drives form copy + line building). */
export type VolumeEffect = "neutral" | "adds" | "removes";

export const VOLUME_EFFECT: Partial<Record<OperationType, VolumeEffect>> = {
  ADDITION: "neutral",
  FINING: "neutral",
  CAP_MGMT: "neutral",
  TOPPING: "adds",
  FILTRATION: "removes",
  LOSS: "removes",
};
