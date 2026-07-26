// VI-P8 — compose the grower-facing climate summary from stored daily rows. PURE (rows + config in, summary
// out) so it's unit-testable and reachable from the assistant tool (verify:ai-native). Council R14: the
// HEADLINE speaks in the PRIMARY source's numbers only; the spread + per-source completeness are the
// "compare sources" view. Council R3: aggregates are per-source with a completeness %; gap-fill is a
// separately-labelled continuous series composed HERE on read (never a stored row).

import type { LocalDailyRecord } from "./obs-time-core";
import { accumulateGdd, dailyGdd } from "./gdd-core";
import { winklerRegion, type WinklerResult } from "./winkler-core";
import { growingSeasonTemp, type GstResult } from "./gst-core";
import { frostEvents, type FrostResult } from "./frost-core";
import { heatDays, type HeatResult } from "./heat-core";
import { rainfall, type RainfallResult } from "./rainfall-core";
import { filterToSeason, seasonCompleteness, seasonWindowFor, seasonYearFor, hemisphereFor } from "./season-core";
import { computeSpreadCore, effectivePrimary, gapFillCore, type Spread, type WeatherConfigLike } from "./source-selection-core";
import { comparisonSeries, gddGraphCurves, perYearSeasonGdd, winklerNormal, type CurvePoint, type NamedCurve, type WinklerNormal, type YearGdd } from "./normals-core";
import { parseUnitSystem, type UnitSystem } from "@/lib/units/display";
import { defaultUnitSystemFor } from "./us-coverage";
import type { ProviderKey } from "./providers/types";

/**
 * Plan 098 — the weather-family unit resolution chain, mirroring `resolveSiteTimeZone`:
 * per-vineyard config override → tenant master (AppSettings.unitSystem, raw — an UNCONFIGURED
 * tenant falls through) → the geo default at the site. No coordinates (legacy callers/tests) →
 * METRIC, the storage system, exactly what `normalizeUnitSystem` did before.
 */
export function resolveWeatherUnitSystem(
  configOverride: string | null | undefined,
  tenantMaster: UnitSystem | null | undefined,
  lat?: number,
  lon?: number,
): UnitSystem {
  const override = parseUnitSystem(configOverride);
  if (override) return override;
  if (tenantMaster) return tenantMaster;
  if (lat !== undefined && lon !== undefined) return defaultUnitSystemFor(lat, lon);
  return "METRIC";
}

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
  stationId: string | null;
  stationName: string | null;
  stationDistanceM: number | null;
  stationElevationDeltaM: number | null;
  siteElevationM: number | null;
  attribution: string | null;
  lastRefreshAt: string | null;
  /** Display units ("METRIC" | "IMPERIAL") — plan 096 U3; storage stays metric, units-core converts. */
  unitSystem?: string | null;
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
  primaryProviderKey: string; // the EFFECTIVE primary (override ?? resolved) — what the headline speaks in
  primaryProviderResolved: string; // the auto-resolved default (nearest quality station / best grid)
  primaryProviderOverride: string | null; // the grower's explicit pick, if any (null = auto)
  station: { id: string | null; name: string | null; distanceM: number | null; elevationDeltaM: number | null };
  siteElevationM: number | null;
  attribution: string | null;
  lastRefreshAt: string | null;
  /** The RESOLVED display unit system (plan 098): config override → tenant master → geo default. */
  unitSystem: "METRIC" | "IMPERIAL";
  /** The vineyard's EXPLICIT override, if any — null means "Auto" (following the tenant/geo chain). */
  unitSystemOverride: "METRIC" | "IMPERIAL" | null;
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
    /** Cumulative GDD by local date (primary season), for the card sparkline. */
    gddCumulative: Array<{ date: string; cumC: number }>;
  };
  // Long-term climate NORMAL — the correct basis for Winkler (full-season average over many years), from
  // backfilled gridMET history. Null pieces when history hasn't been backfilled yet.
  normals: {
    source: string; // provider the normals were computed from (gridmet when backfilled)
    perYear: YearGdd[];
    winkler10: WinklerNormal | null;
    winkler20: WinklerNormal | null;
    graph: { current: CurvePoint[]; avg10: CurvePoint[]; avg20: CurvePoint[]; avg10Years: number; avg20Years: number };
    comparison: NamedCurve[]; // WSU-style: long-term avg + coolest + hottest + last year + current
    hasHistory: boolean; // ≥1 complete past season available
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
  /** Plan 098 — geo unit default needs the full point; omitted (legacy callers/tests) → METRIC fallback. */
  longitude?: number;
  /** Plan 098 — the tenant's RAW master system (UnitPrefs.configuredSystem); null/omitted = unconfigured. */
  tenantUnitSystem?: UnitSystem | null;
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

  // The configured/effective primary — but if it has NO usable temp data (e.g. a nearby station that only
  // reports precip), the headline would read 0. Fall back to the source with the most paired-temp days so the
  // grower always sees real numbers. (Ingest's selectPrimaryCore now avoids this at write time; this covers
  // configs written before that fix, until the next auto-refresh corrects them.)
  const hasTemps = (rows2: LocalDailyRecord[]) => rows2.some((r) => r.tmaxC !== null && r.tminC !== null);
  let primary = effectivePrimary(config);
  if (!hasTemps(toLocal(byProvider.get(primary) ?? []))) {
    let best = primary;
    let bestCount = 0;
    for (const [prov, provRows] of byProvider) {
      const n = toLocal(provRows).filter((r) => r.tmaxC !== null && r.tminC !== null).length;
      if (n > bestCount) { bestCount = n; best = prov; }
    }
    primary = best;
  }
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
  // Cumulative GDD by day (primary season) for the card sparkline.
  const gddCumulative: Array<{ date: string; cumC: number }> = [];
  let running = 0;
  for (const r of primarySeason) {
    const g = dailyGdd(r.tmaxC, r.tminC);
    if (g !== null) {
      running += g;
      gddCumulative.push({ date: r.localDate, cumC: Math.round(running * 10) / 10 });
    }
  }
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

  // Long-term normals — computed from gridMET (the backfilled consistent long series), else the primary.
  const normalsSource = byProvider.has("gridmet") ? "gridmet" : primary;
  const normalsRows = toLocal(byProvider.get(normalsSource) ?? []);
  const perYearNormals = perYearSeasonGdd(normalsRows, latitude);
  const winkler10 = winklerNormal(perYearNormals, 10, seasonYear);
  const winkler20 = winklerNormal(perYearNormals, 20, seasonYear);
  const graph = gddGraphCurves(normalsRows, latitude, seasonYear);
  const comparison = comparisonSeries(normalsRows, latitude, seasonYear);
  const normals = {
    source: normalsSource,
    perYear: perYearNormals,
    winkler10,
    winkler20,
    graph,
    comparison,
    hasHistory: perYearNormals.some((y) => y.complete && y.seasonYear < seasonYear),
  };

  // Spread across sources (R3) — the only ensemble output, a range not a mean.
  const spread = computeSpreadCore(perSource.map((p) => ({ source: p.provider, value: p.seasonGddC })));

  return {
    vineyardId,
    seasonYear,
    hemisphere: hemisphereFor(latitude),
    seasonWindow,
    coverageState: config.coverageState,
    primaryProviderKey: primary,
    primaryProviderResolved: config.primaryProviderKey,
    primaryProviderOverride: config.primaryProviderOverride ?? null,
    station: { id: config.stationId, name: config.stationName, distanceM: config.stationDistanceM, elevationDeltaM: config.stationElevationDeltaM },
    siteElevationM: config.siteElevationM,
    attribution: config.attribution,
    lastRefreshAt: config.lastRefreshAt,
    unitSystem: resolveWeatherUnitSystem(config.unitSystem, input.tenantUnitSystem, latitude, input.longitude),
    unitSystemOverride: parseUnitSystem(config.unitSystem),
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
      gddCumulative,
    },
    normals,
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
