import { prisma } from "@/lib/prisma";
import { abvBumpForSugar } from "@/lib/sparkling/sugar";

// Unit 2 (Fork 1A) — the tax-ABV resolver. Tax class is set AT the taxable/bottling event, so ABV is
// resolved as-of that moment, in precedence order (OV#6):
//   1. `Lot.taxAbvOverride`         — an explicit per-lot tax ABV (highest)
//   2. latest `ALCOHOL` AnalysisReading with observedAt ≤ the event (the measured value at the event)
//   3. null                          — the fold defaults to class a (S2, keeps the volume) AND raises a
//                                       BLOCKING anomaly so "Mark Filed" is disabled until resolved.
// Batched: one query for overrides, one for readings — never per-lot round-trips (eng-review E5).

export type TaxAbvSource = "override" | "reading" | "none";
export type TaxAbvResult = { abv: number | null; source: TaxAbvSource };

/** Pure precedence: override > reading > none. Exported so the ordering is unit-tested without a DB. */
export function pickTaxAbv(override: number | null | undefined, reading: number | null | undefined): TaxAbvResult {
  if (override != null) return { abv: override, source: "override" };
  if (reading != null) return { abv: reading, source: "reading" };
  return { abv: null, source: "none" };
}

export async function resolveTaxAbvForLots(lotIds: string[], asOf: Date): Promise<Map<string, TaxAbvResult>> {
  const out = new Map<string, TaxAbvResult>();
  const ids = [...new Set(lotIds)].filter(Boolean);
  if (ids.length === 0) return out;

  // 1. Per-lot overrides (one query).
  const lots = await prisma.lot.findMany({ where: { id: { in: ids } }, select: { id: true, taxAbvOverride: true } });
  const overrideByLot = new Map(lots.map((l) => [l.id, l.taxAbvOverride == null ? null : Number(l.taxAbvOverride)]));

  // 2. Latest ALCOHOL reading as-of `asOf` per lot (one query; reduce to newest in memory — E5).
  const panels = await prisma.analysisPanel.findMany({
    where: { lotId: { in: ids }, voidedAt: null, observedAt: { lte: asOf }, readings: { some: { analyte: "ALCOHOL" } } },
    orderBy: { observedAt: "desc" },
    select: { lotId: true, readings: { where: { analyte: "ALCOHOL" }, select: { value: true } } },
  });
  const readingByLot = new Map<string, number>();
  for (const p of panels) {
    if (readingByLot.has(p.lotId)) continue; // orderBy desc → first seen is newest
    const r = p.readings[0];
    if (r) readingByLot.set(p.lotId, Number(r.value));
  }

  // 3. Precedence (pure helper).
  for (const id of ids) out.set(id, pickTaxAbv(overrideByLot.get(id) ?? null, readingByLot.get(id) ?? null));
  return out;
}

/** Single-lot convenience over the batched resolver. */
export async function resolveTaxAbv(lotId: string, asOf: Date): Promise<TaxAbvResult> {
  return (await resolveTaxAbvForLots([lotId], asOf)).get(lotId) ?? { abv: null, source: "none" };
}

/**
 * Sparkling ABV is NOT known at TIRAGE (it rises with tirage sugar) — resolve it at FINISH:
 * base-wine ABV (as-of tirage) + the tirage-sugar bump (src/lib/sparkling/sugar.ts). Returns null
 * when the base ABV is unknown (→ needs review before filing).
 */
export async function resolveSparklingBottledAbv(lotId: string, tirageAt: Date, tirageSugarGpl: number | null): Promise<number | null> {
  const base = await resolveTaxAbv(lotId, tirageAt);
  if (base.abv == null) return null;
  const bump = tirageSugarGpl != null && tirageSugarGpl > 0 ? abvBumpForSugar(tirageSugarGpl) : 0;
  return Math.round((base.abv + bump) * 100) / 100;
}

/** Validate a still-wine bottling ABV. Rejects ≤0; allows >24 (unusual → tax-class review flags it). */
export function assertBottlingAbv(abv: number): void {
  if (!(abv > 0)) throw new Error("Enter the wine's alcohol by volume (%). ABV is required to classify the wine for TTB reporting.");
}
