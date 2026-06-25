// Pure shaping for the admin harvest dashboard. No Prisma, no I/O.
// The aggregator in actions.ts fetches rows; these helpers turn them into the
// per-block view the dashboard renders, and resolve the Brix a pick came off at.

export type SeriesPoint = { recordedAt: string; brixValue: number };
export type PickLike = { pickDate: string; brixAtPick: number | null };

/**
 * The Brix a pick was harvested at: the explicitly-recorded value when present,
 * otherwise the nearest Brix reading by date. Null when neither is available
 * (no explicit value AND no readings to fall back to). On a tie the earliest
 * reading wins, so callers should pass `series` ordered oldest-first.
 */
export function deriveBrixAtPick(pick: PickLike, series: SeriesPoint[]): number | null {
  if (pick.brixAtPick != null) return pick.brixAtPick;
  if (series.length === 0) return null;
  const target = Date.parse(pick.pickDate);
  if (Number.isNaN(target)) return null;
  let best: SeriesPoint | null = null;
  let bestDiff = Infinity;
  for (const p of series) {
    const t = Date.parse(p.recordedAt);
    if (Number.isNaN(t)) continue;
    const diff = Math.abs(t - target);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = p;
    }
  }
  return best ? best.brixValue : null;
}

/** Group flat Brix readings into per-block series, preserving input order (oldest-first). */
export function groupSeriesByBlock(
  rows: Array<{ blockId: string; recordedAt: string; brixValue: number }>,
): Record<string, SeriesPoint[]> {
  const out: Record<string, SeriesPoint[]> = {};
  for (const r of rows) {
    (out[r.blockId] ??= []).push({ recordedAt: r.recordedAt, brixValue: r.brixValue });
  }
  return out;
}
