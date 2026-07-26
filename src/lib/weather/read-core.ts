// VI-P8 — compose the grower-facing climate summary from stored daily rows. PURE (rows + config in, summary
// out) so it's unit-testable and reachable from the assistant tool (verify:ai-native). Council R14: the
// HEADLINE speaks in the PRIMARY source's numbers only; the spread + per-source completeness are the
// "compare sources" view. Council R3: aggregates are per-source with a completeness %; gap-fill is a
// separately-labelled continuous series composed HERE on read (never a stored row).

import type { LocalDailyRecord } from "./obs-time-core";
import { accumulateGdd } from "./gdd-core";
import { winklerRegion, type WinklerResult } from "./winkler-core";
import { growingSeasonTemp, type GstResult } from "./gst-core";
import { frostEvents, type FrostResult } from "./frost-core";
import { heatDays, type HeatResult } from "./heat-core";
import { rainfall, type RainfallResult } from "./rainfall-core";
import { filterToSeason, seasonCompleteness, seasonWindowFor, seasonYearFor, hemisphereFor } from "./season-core";
import { computeSpreadCore, effectivePrimary, gapFillCore, type Spread, type WeatherConfigLike } from "./source-selection-core";
import type { ProviderKey } from "./providers/types";

/** A stored daily row (Prisma Decimals already coerced to number|null). */
export interface DailyRow {
  providerKey: string;
  localDate: string; // ISO YYYY-MM-DD
  tmaxC: number | null;
  tminC: number | null;
  precipMm: number | null;
  rhMaxPct: number | null;
  rhMinPct: number | null;
}

export interface ClimateConfig extends WeatherConfigLike {
  coverageState: string;
  stationName: string | null;
  stationDistanceM: number | null;
  stationElevationDeltaM: number | null;
  siteElevationM: number | null;
  attribution: string | null;
  lastRefreshAt: string | null;
}

export interface PerSourceAggregate {
  provider: ProviderKey | string;
  seasonGddC: number;
  daysCounted: number;
  completenessPct: number;
}

export interface ClimateSummary {
  vineyardId: string;
  seasonYear: number;
  hemisphere: "N" | "S";
  seasonWindow: { startIso: string; endIso: string };
  coverageState: string;
  primaryProviderKey: string;
  station: { name: string | null; distanceM: number | null; elevationDeltaM: number | null };
  siteElevationM: number | null;
  attribution: string | null;
  lastRefreshAt: string | null;
  // Headline — the PRIMARY's numbers (R14).
  headline: {
    seasonGddC: number;
    gddCompletenessPct: number;
    winkler: WinklerResult;
    gst: GstResult;
    frost: FrostResult;
    heat: HeatResult;
    rainfall: RainfallResult;
    priorYear: { seasonYear: number; seasonGddC: number; deltaC: number; completenessPct: number } | null;
    /** A separately-labelled continuous series total (primary gap-filled from the best grid), NOT the headline. */
    gridFilledGddC: number | null;
  };
  // Compare-sources view (R3/R14): the spread across sources, never an average.
  spread: Spread | null;
  perSource: PerSourceAggregate[];
  honesty: {
    winklerNearBoundary: boolean;
    precipLowConfidence: boolean;
    frostFraming: string;
    gridFilledIsDerived: boolean;
  };
}

function toLocal(rows: DailyRow[]): LocalDailyRecord[] {
  return rows
    .map((r) => ({ localDate: r.localDate, tmaxC: r.tmaxC, tminC: r.tminC, precipMm: r.precipMm, rhMaxPct: r.rhMaxPct, rhMinPct: r.rhMinPct }))
    .sort((a, b) => (a.localDate < b.localDate ? -1 : a.localDate > b.localDate ? 1 : 0));
}

/** Pure composition of the whole summary. `today` gates season-to-date completeness. */
export function composeClimateSummaryCore(input: {
  vineyardId: string;
  rows: DailyRow[];
  config: ClimateConfig;
  latitude: number;
  today: string;
  seasonYear?: number;
}): ClimateSummary {
  const { vineyardId, rows, config, latitude, today } = input;
  const seasonYear = input.seasonYear ?? seasonYearFor(latitude, today);
  const seasonWindow = seasonWindowFor(latitude, seasonYear);

  // Group rows by provider.
  const byProvider = new Map<string, DailyRow[]>();
  for (const r of rows) {
    const list = byProvider.get(r.providerKey) ?? [];
    list.push(r);
    byProvider.set(r.providerKey, list);
  }

  const primary = effectivePrimary(config);
  const primaryLocalAll = toLocal(byProvider.get(primary) ?? []);
  const primarySeason = filterToSeason(primaryLocalAll, latitude, seasonYear);

  // Per-source season GDD + completeness (R3 — never blended).
  const perSource: PerSourceAggregate[] = [];
  for (const [provider, provRows] of byProvider) {
    const season = filterToSeason(toLocal(provRows), latitude, seasonYear);
    const acc = accumulateGdd(season);
    const comp = seasonCompleteness(season, latitude, seasonYear, today);
    perSource.push({ provider, seasonGddC: acc.gddTotal, daysCounted: acc.daysCounted, completenessPct: Math.round(comp.fraction * 100) });
  }
  perSource.sort((a, b) => a.provider.localeCompare(b.provider));

  // Headline aggregates from the PRIMARY series.
  const headlineGdd = accumulateGdd(primarySeason);
  const headlineComp = seasonCompleteness(primarySeason, latitude, seasonYear, today);
  const winkler = winklerRegion(headlineGdd.gddTotal);
  const gst = growingSeasonTemp(primarySeason);
  const frost = frostEvents(primaryLocalAll, latitude, seasonYear);
  const heat = heatDays(primarySeason);
  const rain = rainfall(primarySeason);

  // Prior-year comparison keyed by SeasonYear (R4).
  const priorSeason = filterToSeason(primaryLocalAll, latitude, seasonYear - 1);
  let priorYear: ClimateSummary["headline"]["priorYear"] = null;
  if (priorSeason.length > 0) {
    const pAcc = accumulateGdd(priorSeason);
    const pComp = seasonCompleteness(priorSeason, latitude, seasonYear - 1, `${seasonYear - 1}-12-31`);
    priorYear = { seasonYear: seasonYear - 1, seasonGddC: pAcc.gddTotal, deltaC: Math.round((headlineGdd.gddTotal - pAcc.gddTotal) * 100) / 100, completenessPct: Math.round(pComp.fraction * 100) };
  }

  // Separately-labelled continuous (grid-filled) series — composed ON READ, never stored.
  const bestGrid = ["gridmet", "nasa_power", "daymet"].find((k) => k !== primary && byProvider.has(k)) as ProviderKey | undefined;
  let gridFilledGddC: number | null = null;
  if (bestGrid) {
    const gridSeason = filterToSeason(toLocal(byProvider.get(bestGrid) ?? []), latitude, seasonYear);
    const composed = gapFillCore(primarySeason, gridSeason, bestGrid);
    gridFilledGddC = accumulateGdd(composed).gddTotal;
  }

  // Spread across sources (R3) — the only ensemble output, a range not a mean.
  const spread = computeSpreadCore(perSource.map((p) => ({ source: p.provider, value: p.seasonGddC })));

  return {
    vineyardId,
    seasonYear,
    hemisphere: hemisphereFor(latitude),
    seasonWindow,
    coverageState: config.coverageState,
    primaryProviderKey: primary,
    station: { name: config.stationName, distanceM: config.stationDistanceM, elevationDeltaM: config.stationElevationDeltaM },
    siteElevationM: config.siteElevationM,
    attribution: config.attribution,
    lastRefreshAt: config.lastRefreshAt,
    headline: {
      seasonGddC: headlineGdd.gddTotal,
      gddCompletenessPct: Math.round(headlineComp.fraction * 100),
      winkler,
      gst,
      frost,
      heat,
      rainfall: rain,
      priorYear,
      gridFilledGddC,
    },
    spread,
    perSource,
    honesty: {
      winklerNearBoundary: winkler.nearBoundary,
      precipLowConfidence: true,
      frostFraming: "Sub-freezing nights in the vulnerable window are an elevated-risk signal — check the vines; they are not a damage report.",
      gridFilledIsDerived: gridFilledGddC !== null,
    },
  };
}
