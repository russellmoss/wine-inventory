// Pure unit-conversion + acreage math for vineyard blocks. No Prisma, no I/O.
//
// Canonical storage is METRIC: row/vine spacing in meters, elevation in meters.
// The UI converts to the active unit for display, and back to meters on save.
//
// "Planted area (spacing-based)" is the standard grower estimate
// `rowSpacing * vineSpacing * vineCount`, NOT surveyed acreage and NOT derived
// from any drawn polygon.

export type Unit = "imperial" | "metric";

export const SQ_FT_PER_ACRE = 43560;
export const SQ_M_PER_HECTARE = 10000;
export const FT_PER_M = 3.280839895;
const SQ_FT_PER_SQ_M = FT_PER_M * FT_PER_M;

/** A positive, finite number — or null if the input can't be used. */
function pos(v: number | null | undefined): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

// ── Length ──────────────────────────────────────────────────────────────
export function ftToM(ft: number): number {
  return ft / FT_PER_M;
}
export function mToFt(m: number): number {
  return m * FT_PER_M;
}

// ── Area ────────────────────────────────────────────────────────────────
export function acresToHa(acres: number): number {
  return (acres * SQ_FT_PER_ACRE) / SQ_FT_PER_SQ_M / SQ_M_PER_HECTARE;
}
export function haToAcres(ha: number): number {
  return (ha * SQ_M_PER_HECTARE * SQ_FT_PER_SQ_M) / SQ_FT_PER_ACRE;
}

/**
 * Planted area in square meters from canonical metric spacing + vine count.
 * Returns null when any input is missing or non-positive.
 */
export function blockAreaSqM(
  rowSpacingM: number | null | undefined,
  vineSpacingM: number | null | undefined,
  vineCount: number | null | undefined,
): number | null {
  const r = pos(rowSpacingM);
  const v = pos(vineSpacingM);
  const n = pos(vineCount);
  if (r == null || v == null || n == null) return null;
  return r * v * n;
}

export function blockAcres(
  rowSpacingM: number | null | undefined,
  vineSpacingM: number | null | undefined,
  vineCount: number | null | undefined,
): number | null {
  const sqM = blockAreaSqM(rowSpacingM, vineSpacingM, vineCount);
  if (sqM == null) return null;
  return (sqM * SQ_FT_PER_SQ_M) / SQ_FT_PER_ACRE;
}

export function blockHectares(
  rowSpacingM: number | null | undefined,
  vineSpacingM: number | null | undefined,
  vineCount: number | null | undefined,
): number | null {
  const sqM = blockAreaSqM(rowSpacingM, vineSpacingM, vineCount);
  if (sqM == null) return null;
  return sqM / SQ_M_PER_HECTARE;
}

/** Planted area in the active unit's terms (acres for imperial, hectares for metric). */
export function blockArea(
  rowSpacingM: number | null | undefined,
  vineSpacingM: number | null | undefined,
  vineCount: number | null | undefined,
  unit: Unit,
): number | null {
  return unit === "metric"
    ? blockHectares(rowSpacingM, vineSpacingM, vineCount)
    : blockAcres(rowSpacingM, vineSpacingM, vineCount);
}

// ── Canonical conversion for spacing inputs ───────────────────────────────
/** A spacing value typed in the active unit (ft or m) → canonical meters. */
export function toCanonicalSpacing(value: number | null | undefined, unit: Unit): number | null {
  const v = pos(value);
  if (v == null) return null;
  return unit === "metric" ? v : ftToM(v);
}

/** Canonical meters → a spacing value to display in the active unit (ft or m). */
export function fromCanonicalSpacing(valueM: number | null | undefined, unit: Unit): number | null {
  const v = pos(valueM);
  if (v == null) return null;
  return unit === "metric" ? v : mToFt(v);
}

// ── Display formatting ────────────────────────────────────────────────────
export function spacingUnitLabel(unit: Unit): string {
  return unit === "metric" ? "m" : "ft";
}
export function areaUnitLabel(unit: Unit): string {
  return unit === "metric" ? "ha" : "acres";
}

/** Format a canonical-metric spacing for display, e.g. "7.00 ft" / "2.13 m". */
export function formatSpacing(valueM: number | null | undefined, unit: Unit): string {
  const v = fromCanonicalSpacing(valueM, unit);
  if (v == null) return "—";
  return `${v.toFixed(2)} ${spacingUnitLabel(unit)}`;
}

/** Format an already-converted area value, e.g. "1.00 acres". */
export function formatArea(area: number | null | undefined, unit: Unit): string {
  if (area == null || !Number.isFinite(area)) return "—";
  return `${area.toFixed(2)} ${areaUnitLabel(unit)}`;
}

/** Optional informational readout: average vines per row. */
export function vinesPerRow(
  vineCount: number | null | undefined,
  numRows: number | null | undefined,
): number | null {
  const n = pos(vineCount);
  const r = pos(numRows);
  if (n == null || r == null) return null;
  return n / r;
}
