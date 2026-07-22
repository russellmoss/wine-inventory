// Read-side logic for measurement/analysis HISTORY questions ("what's T5's Brix", "pH of
// barrels 1 through 5", "which tank is closest to dry"). DB-free so it is unit-tested without a
// database; the Prisma read + tool wrapper live in src/lib/assistant/tools/query-measurements.ts.
//
// The governing rule (winemaker, 2026-07-22): a vessel's reading is ITS OWN. We NEVER average a
// value across vessels — a mean pH over 40 barrels is a number that describes no wine anybody can
// taste. Cross-vessel questions are answered two ways instead:
//
//   • ENUMERATION  — "pH of barrels 1-5" → one row per barrel, every value reported.
//   • SUPERLATIVE  — "which tank is closest to dry" → sort the per-vessel LATEST values and name
//                    the winner, with the neighbours still visible so the margin is legible.
//
// Both keep the individual values in front of the winemaker. The only cross-vessel arithmetic here
// is a sort.

import { ANALYTE_KEYS, getAnalyte } from "@/lib/chemistry/analytes";

/** One reading, flattened out of its panel. `observedAt` is epoch ms (the time axis). */
export type FlatReading = {
  analyte: string;
  value: number;
  unit: string;
  observedAt: number;
  panelId: string;
};

/** A vessel (or lot) in a comparison, carrying the ONE reading being compared. */
export type RankRow = {
  vesselLabel: string;
  lotCode: string | null;
  reading: FlatReading | null;
};

const MS_PER_DAY = 86_400_000;

/**
 * A wine is dry a touch BELOW zero Brix, not at it: alcohol is less dense than water, so a
 * fully-fermented red typically parks around -1.5 to -2 °Bx. Ranking is a plain ascending sort
 * (which gets this right for free); this threshold only labels the result.
 */
export const DRY_BRIX_THRESHOLD = -1.5;
/** Above zero but closing in — still fermenting, but within a day or two of dry on most ferments. */
export const NEARLY_DRY_BRIX_THRESHOLD = 1.0;

export type DrynessLabel = "dry" | "nearly dry" | "fermenting";

/** Plain-language dryness for a Brix value. Labels only — never used to rank. */
export function drynessLabel(brix: number): DrynessLabel {
  if (!Number.isFinite(brix)) return "fermenting";
  if (brix <= DRY_BRIX_THRESHOLD) return "dry";
  if (brix <= NEARLY_DRY_BRIX_THRESHOLD) return "nearly dry";
  return "fermenting";
}

/** Age of a reading in days, one decimal. Negative clock skew clamps to 0. */
export function ageDays(observedAt: number, nowMs: number): number {
  return Math.max(0, Math.round(((nowMs - observedAt) / MS_PER_DAY) * 10) / 10);
}

/** Sort key for an analyte: registry order first (stable pickers), unknown keys last. */
function analyteOrder(key: string): number {
  const i = ANALYTE_KEYS.indexOf(key);
  return i === -1 ? ANALYTE_KEYS.length : i;
}

/**
 * Collapse a reading stream to the NEWEST reading per analyte. Input order is not trusted.
 * Output is registry-ordered (pH, TA, VA, free SO₂, …) so two vessels' rows read the same way.
 */
export function latestPerAnalyte(readings: FlatReading[]): FlatReading[] {
  const newest = new Map<string, FlatReading>();
  for (const r of readings) {
    const seen = newest.get(r.analyte);
    if (!seen || r.observedAt > seen.observedAt) newest.set(r.analyte, r);
  }
  return [...newest.values()].sort(
    (a, b) => analyteOrder(a.analyte) - analyteOrder(b.analyte) || a.analyte.localeCompare(b.analyte),
  );
}

export type RankDirection = "lowest" | "highest";

export type RankResult = {
  /** Vessels that HAVE a reading, sorted by the requested direction. */
  ranked: RankRow[];
  /**
   * Vessels with no reading for this analyte. Reported, never silently dropped — otherwise
   * "lowest free SO₂ is B-17" is answered off a partial set and reads as though it covered
   * every barrel.
   */
  noData: string[];
};

/**
 * Rank vessels by their single compared reading. Ties break on the FRESHER reading first, then
 * label, so the order is deterministic. Vessels without a reading are separated out, not sorted
 * to the bottom — they are a different answer ("no data"), not a worse value.
 */
export function rankVessels(rows: RankRow[], direction: RankDirection): RankResult {
  const withReading: RankRow[] = [];
  const noData: string[] = [];
  for (const r of rows) {
    if (r.reading && Number.isFinite(r.reading.value)) withReading.push(r);
    else noData.push(r.vesselLabel);
  }
  const sign = direction === "lowest" ? 1 : -1;
  withReading.sort((a, b) => {
    const av = a.reading!.value;
    const bv = b.reading!.value;
    if (av !== bv) return (av - bv) * sign;
    if (a.reading!.observedAt !== b.reading!.observedAt) return b.reading!.observedAt - a.reading!.observedAt;
    return a.vesselLabel.localeCompare(b.vesselLabel);
  });
  return { ranked: withReading, noData: noData.sort((a, b) => a.localeCompare(b)) };
}

export type StalenessInput = { vesselLabel: string; observedAt: number };

export type Staleness = {
  /** Days since the OLDEST compared reading. */
  oldestDays: number;
  /** Days since the NEWEST compared reading. */
  newestDays: number;
  /** Gap between them — the number that decides whether a ranking is trustworthy. */
  spreadDays: number;
  oldestVessel: string | null;
  /** Vessels whose reading is materially older than the freshest one in the set. */
  staleVessels: string[];
  /** Human warning to hand the model verbatim, or null when the set is comparable. */
  warning: string | null;
};

/**
 * Decide whether a cross-vessel comparison is safe to state flatly.
 *
 * A ranking compares each vessel's LATEST reading, and those readings were taken on different
 * days. Tank 5 measured this morning at 2.1 °Bx and Tank 9 measured four days ago at 6 °Bx: T5
 * "wins" the sort, but T9 has had four days to ferment and is very likely drier right now. Stating
 * that ranking without the caveat is how someone presses a tank that isn't ready. So when the
 * spread across the compared set exceeds `spreadThresholdDays`, we hand the model an explicit
 * warning to pass on.
 */
export function stalenessVerdict(
  rows: StalenessInput[],
  nowMs: number,
  opts: { spreadThresholdDays?: number } = {},
): Staleness | null {
  if (rows.length === 0) return null;
  const spreadThreshold = opts.spreadThresholdDays ?? 2;

  let oldest = rows[0];
  let newest = rows[0];
  for (const r of rows) {
    if (r.observedAt < oldest.observedAt) oldest = r;
    if (r.observedAt > newest.observedAt) newest = r;
  }
  const oldestDays = ageDays(oldest.observedAt, nowMs);
  const newestDays = ageDays(newest.observedAt, nowMs);
  const spreadDays = Math.round((oldestDays - newestDays) * 10) / 10;

  const staleVessels = rows
    .filter((r) => ageDays(r.observedAt, nowMs) - newestDays > spreadThreshold)
    .map((r) => r.vesselLabel)
    .sort((a, b) => a.localeCompare(b));

  const warning =
    rows.length > 1 && spreadDays > spreadThreshold
      ? `These readings were not taken at the same time — the oldest (${oldest.vesselLabel}) is ${oldestDays} days old and the newest is ${newestDays} days old. A ranking across them may be out of date; re-measure ${staleVessels.join(", ")} before acting on the order.`
      : null;

  return { oldestDays, newestDays, spreadDays, oldestVessel: oldest.vesselLabel, staleVessels, warning };
}

/** Vessel-range separators a winemaker actually types or says. */
const RANGE_RE = /^(.*?)(\d+)\s*(?:-|–|—|\bto\b|\bthrough\b|\bthru\b)\s*([a-z]*)\s*(\d+)\s*$/i;

/** "tanks" → "tank", "barrels" → "barrel"; anything else passes through. */
function singularVesselWord(word: string): string {
  const w = word.trim().replace(/\s+/g, " ");
  if (/^tanks$/i.test(w)) return "tank";
  if (/^barrels$/i.test(w)) return "barrel";
  return w;
}

/**
 * Expand a vessel RANGE reference into individual vessel references.
 *
 *   "barrels 1 through 5" → ["barrel 1", "barrel 2", … "barrel 5"]
 *   "B1-B5"              → ["B 1", "B 2", … "B 5"]     (codes normalize to b1…b5 downstream)
 *   "tank 5"             → ["tank 5"]                   (not a range — passed through)
 *
 * A non-range, an inverted range, or a span wider than `maxSpan` returns the input unchanged, so
 * the caller's normal single-vessel resolution reports the problem in its own words rather than
 * this quietly inventing 900 lookups.
 */
export function expandVesselRange(ref: string, maxSpan = 60): string[] {
  const raw = (ref ?? "").trim();
  if (!raw) return [];
  const m = raw.match(RANGE_RE);
  if (!m) return [raw];

  const [, prefixRaw, startStr, , endStr] = m;
  const start = Number(startStr);
  const end = Number(endStr);
  if (!Number.isInteger(start) || !Number.isInteger(end)) return [raw];
  if (end < start || end - start + 1 > maxSpan) return [raw];

  const prefix = singularVesselWord(prefixRaw);
  const out: string[] = [];
  for (let n = start; n <= end; n++) out.push(prefix ? `${prefix} ${n}` : String(n));
  return out;
}

/** Expand every entry of a vessel list, de-duplicated, order preserved. */
export function expandVesselRefs(refs: string[], maxSpan = 60): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const ref of refs) {
    for (const one of expandVesselRange(ref, maxSpan)) {
      const key = one.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(one);
    }
  }
  return out;
}

/** Format a reading at its analyte's display precision, with the unit. */
export function formatReading(analyte: string, value: number, unit: string): string {
  const def = getAnalyte(analyte);
  const precision = def?.precision ?? 2;
  return `${value.toFixed(precision)} ${unit}`;
}

/** Human label for an analyte key, falling back to the raw stored key (append-only registry). */
export function analyteLabel(analyte: string): string {
  return getAnalyte(analyte)?.label ?? analyte;
}
