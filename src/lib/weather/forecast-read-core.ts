// Plan 096 Phase 2 Unit 16 (core) — compose the forecast strip DTO from stored rows, PURE.
// Council C3: `selectPrimaryForecastSeries` is THE ONE primary-series selector — the strip (U16),
// warning badges (U23), notifications (U21), and the assistant (U25) all consume exactly this, so
// an alert can never fire off a provider the grower isn't looking at. NWS where present (higher
// tier), else Open-Meteo. Disagreement between providers is a spread on the compare view — never
// an average. Days 6–7 are flagged reduced-confidence (forecast skill for precip degrades sharply
// past a week — the section's voice never overstates).

import type { ConditionCode, ForecastProviderKey } from "./providers/forecast-types";

/** A stored forecast row, Decimals already coerced (the actions layer owns that). */
export interface ForecastRow {
  providerKey: string;
  targetDate: string; // YYYY-MM-DD
  issuedAt: string; // ISO
  tmaxC: number | null;
  tminC: number | null;
  precipMm: number | null;
  precipProbabilityPct: number | null;
  conditionCode: string;
  windMaxKph: number | null;
}

export interface ForecastDay {
  targetDate: string;
  tmaxC: number | null;
  tminC: number | null;
  precipMm: number | null;
  precipProbabilityPct: number | null;
  conditionCode: ConditionCode;
  windMaxKph: number | null;
  /** Days 6–7 of the horizon — render de-emphasized with an explicit label. */
  reducedConfidence: boolean;
}

export interface ForecastView {
  providerKey: ForecastProviderKey;
  issuedAt: string; // the series' issue time — the staleness label the strip must show
  days: ForecastDay[]; // today onward, ascending, max 7
  /** Cross-provider disagreement on overlapping days (spread, never a mean); null when one provider. */
  spread: { maxTmaxDeltaC: number; maxTminDeltaC: number; days: number } | null;
}

const PROVIDER_RANK: Record<string, number> = { nws: 0, open_meteo: 1 };

/** THE primary-series selector (council C3). Highest-ranked provider that has any FUTURE rows. */
export function selectPrimaryForecastSeries(rows: ForecastRow[], todayIso: string): { providerKey: ForecastProviderKey; rows: ForecastRow[] } | null {
  const future = rows.filter((r) => r.targetDate >= todayIso);
  const byProvider = new Map<string, ForecastRow[]>();
  for (const r of future) {
    const list = byProvider.get(r.providerKey) ?? [];
    list.push(r);
    byProvider.set(r.providerKey, list);
  }
  const keys = [...byProvider.keys()].sort((a, b) => (PROVIDER_RANK[a] ?? 9) - (PROVIDER_RANK[b] ?? 9));
  if (keys.length === 0) return null;
  const key = keys[0] as ForecastProviderKey;
  return { providerKey: key, rows: byProvider.get(key)!.sort((a, b) => (a.targetDate < b.targetDate ? -1 : 1)) };
}

/** Compose the strip view: primary days (≤7, today onward) + cross-provider spread. */
export function composeForecastViewCore(rows: ForecastRow[], todayIso: string): ForecastView | null {
  const primary = selectPrimaryForecastSeries(rows, todayIso);
  if (!primary) return null;

  const days: ForecastDay[] = primary.rows.slice(0, 7).map((r, i) => ({
    targetDate: r.targetDate,
    tmaxC: r.tmaxC,
    tminC: r.tminC,
    precipMm: r.precipMm,
    precipProbabilityPct: r.precipProbabilityPct,
    conditionCode: (r.conditionCode as ConditionCode) ?? "UNKNOWN",
    windMaxKph: r.windMaxKph,
    reducedConfidence: i >= 5, // days 6–7
  }));

  // Spread vs the other provider on overlapping days — a range statement, never a blend.
  const secondaryRows = rows.filter((r) => r.targetDate >= todayIso && r.providerKey !== primary.providerKey);
  let spread: ForecastView["spread"] = null;
  if (secondaryRows.length > 0) {
    const secByDate = new Map(secondaryRows.map((r) => [r.targetDate, r]));
    let maxTmax = 0;
    let maxTmin = 0;
    let overlap = 0;
    for (const d of days) {
      const s = secByDate.get(d.targetDate);
      if (!s) continue;
      overlap += 1;
      if (d.tmaxC !== null && s.tmaxC !== null) maxTmax = Math.max(maxTmax, Math.abs(d.tmaxC - s.tmaxC));
      if (d.tminC !== null && s.tminC !== null) maxTmin = Math.max(maxTmin, Math.abs(d.tminC - s.tminC));
    }
    if (overlap > 0) spread = { maxTmaxDeltaC: Math.round(maxTmax * 10) / 10, maxTminDeltaC: Math.round(maxTmin * 10) / 10, days: overlap };
  }

  const issuedAt = primary.rows.reduce((latest, r) => (r.issuedAt > latest ? r.issuedAt : latest), primary.rows[0].issuedAt);
  return { providerKey: primary.providerKey, issuedAt, days, spread };
}

/** Is the stored forecast stale (older than the 6-hour refresh cadence)? Stale still RENDERS — with its issuedAt. */
export function isForecastStale(issuedAtIso: string, now: Date, maxAgeHours = 6): boolean {
  const t = new Date(issuedAtIso).getTime();
  return !Number.isFinite(t) || now.getTime() - t > maxAgeHours * 3_600_000;
}
