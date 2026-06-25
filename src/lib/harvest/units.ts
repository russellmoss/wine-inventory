// Pure weight conversion + formatting for the harvest ledger. Canonical storage
// is kg (matches the codebase's canonical-metric convention); the UI converts to
// the vineyard's defaultUnit for entry + display. No Prisma, no I/O.

import type { Unit } from "@/lib/vineyard/units";

export type { Unit };

export const KG_PER_LB = 0.45359237;
export const KG_PER_TONNE = 1000; // metric tonne
export const LB_PER_SHORT_TON = 2000; // US short ton

function finiteNonNeg(v: number | null | undefined): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

/** A weight typed in the active unit (kg or lb) → canonical kg. Null if invalid. */
export function toKg(value: number | null | undefined, unit: Unit): number | null {
  const v = finiteNonNeg(value);
  if (v == null) return null;
  return unit === "metric" ? v : v * KG_PER_LB;
}

/** Canonical kg → a weight in the active unit (kg or lb). Null if invalid. */
export function fromKg(kg: number | null | undefined, unit: Unit): number | null {
  const v = finiteNonNeg(kg);
  if (v == null) return null;
  return unit === "metric" ? v : v / KG_PER_LB;
}

export function weightUnitLabel(unit: Unit): string {
  return unit === "metric" ? "kg" : "lb";
}

/**
 * Format a canonical-kg weight for display in the active unit, rolling up to
 * tonnes (metric) / short tons (imperial) once the amount is large enough.
 * e.g. "850 kg", "1.25 t", "1,800 lb", "2.50 short tons".
 */
export function formatWeightFromKg(kg: number | null | undefined, unit: Unit): string {
  const v = fromKg(kg, unit);
  if (v == null) return "—";
  if (unit === "metric") {
    return v >= KG_PER_TONNE ? `${(v / KG_PER_TONNE).toFixed(2)} t` : `${v.toFixed(1)} kg`;
  }
  return v >= LB_PER_SHORT_TON
    ? `${(v / LB_PER_SHORT_TON).toFixed(2)} short tons`
    : `${v.toFixed(1)} lb`;
}
