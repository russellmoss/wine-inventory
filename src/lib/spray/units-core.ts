// Spray Intelligence S3a — pure unit conversions for the spray family (KD-5). No Prisma, no I/O.
// Canonical storage is METRIC (L / KG / kph / °C / ha); the material-line quantity is ALSO stored
// as entered (the legally-filed number — the PUR export reprints what the applicator wrote).
//
// Deliberately NO `*Core`-suffixed exports: these are conversion helpers, not a capability, so
// they stay out of the verify:ai-native matrix (the capability is the record/read cores).
//
// An unknown unit or unusable input returns null — NEVER 0 (rule §3.6).

import { SQ_FT_PER_ACRE, SQ_M_PER_HECTARE, FT_PER_M } from "@/lib/vineyard/units";
import type { SprayQuantityDimension, SprayQuantityUnit, SprayWindDirection } from "./types";

// Exact legal definitions.
export const L_PER_GAL = 3.785411784; // US gallon
export const KG_PER_LB = 0.45359237;
export const KM_PER_MILE = 1.609344;
export const HA_PER_ACRE = (SQ_FT_PER_ACRE / (FT_PER_M * FT_PER_M)) / SQ_M_PER_HECTARE; // ≈ 0.404686

const VOLUME_TO_L: Record<string, number> = {
  GAL: L_PER_GAL,
  QT: L_PER_GAL / 4,
  PT: L_PER_GAL / 8,
  FLOZ: L_PER_GAL / 128,
  L: 1,
  ML: 0.001,
};
const MASS_TO_KG: Record<string, number> = {
  LB: KG_PER_LB,
  OZ: KG_PER_LB / 16,
  KG: 1,
  G: 0.001,
};

function finitePositive(v: number | null | undefined): number | null {
  if (v == null || typeof v !== "number" || !Number.isFinite(v) || v <= 0) return null;
  return v;
}

/**
 * An entered quantity → its canonical metric amount (L for volumes, KG for masses).
 * Returns null for an unknown unit or a non-positive/non-finite value — never 0, never a guess.
 */
export function toCanonicalQuantity(
  value: number | null | undefined,
  unit: SprayQuantityUnit | string,
): { value: number; dimension: SprayQuantityDimension } | null {
  const v = finitePositive(value ?? null);
  if (v == null) return null;
  const volFactor = VOLUME_TO_L[unit];
  if (volFactor != null) return { value: v * volFactor, dimension: "VOLUME" };
  const massFactor = MASS_TO_KG[unit];
  if (massFactor != null) return { value: v * massFactor, dimension: "MASS" };
  return null;
}

// ── simple scalar conversions ──
export function galPerAcreToLPerHa(galPerAcre: number): number {
  return (galPerAcre * L_PER_GAL) / HA_PER_ACRE;
}
export function lPerHaToGalPerAcre(lPerHa: number): number {
  return (lPerHa * HA_PER_ACRE) / L_PER_GAL;
}
export function mphToKph(mph: number): number {
  return mph * KM_PER_MILE;
}
export function kphToMph(kph: number): number {
  return kph / KM_PER_MILE;
}
export function fahrenheitToCelsius(f: number): number {
  return ((f - 32) * 5) / 9;
}
export function celsiusToFahrenheit(c: number): number {
  return (c * 9) / 5 + 32;
}
export function acresToHectares(acres: number): number {
  return acres * HA_PER_ACRE;
}
export function hectaresToAcres(ha: number): number {
  return ha / HA_PER_ACRE;
}

// ── compass (KD-15) ──
const COMPASS_16: SprayWindDirection[] = [
  "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
  "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW",
];

/** Degrees (0–359, measured) → the 16-point compass label. Null for an unusable input. */
export function compassLabel(deg: number | null | undefined): SprayWindDirection | null {
  if (deg == null || !Number.isFinite(deg)) return null;
  const normalized = ((deg % 360) + 360) % 360;
  return COMPASS_16[Math.round(normalized / 22.5) % 16];
}

/** A compass label → its center bearing in degrees. CALM/VARIABLE have no bearing → null. */
export function compassToDeg(label: SprayWindDirection | null | undefined): number | null {
  if (!label || label === "CALM" || label === "VARIABLE") return null;
  const i = COMPASS_16.indexOf(label);
  return i === -1 ? null : i * 22.5;
}
