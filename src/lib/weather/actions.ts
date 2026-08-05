"use server";

// VI-P8 — server entry points for the weather spine. Also the verify:ai-native ANCHOR: it imports the pure
// cores (ingest + read composition) so they're reachable in the import graph (mirrors spatial/actions.ts).

import { prisma } from "@/lib/prisma";
import { requireReadyUser } from "@/lib/dal";
import { runAsTenant } from "@/lib/tenant/context";
import { resolveActiveTenantId } from "@/lib/tenant/resolve";
import { composeClimateSummaryCore, resolveWeatherUnitSystem, type ClimateSummary, type DailyRow, type ClimateConfig } from "./read-core";
import { composeRainfallRangeCore, type RainfallRangeResult } from "./rainfall-range-core";
import { attachForecastBadges, composeForecastViewCore, isForecastStale, type ForecastView } from "./forecast-read-core";
import { composeForecastHoursCore, type ForecastHourlyDay } from "./forecast-hourly-read-core";
import { classifyForecastAlertsCore } from "./alert-core";
import { ingestVineyardForecastCore } from "./forecast-ingest-core";
import type { NwsActiveAlert } from "./providers/nws-alerts";
import { effectivePrimary } from "./source-selection-core";
import { ingestVineyardWeatherCore, type IngestResult } from "./ingest-core";
import { resolveVineyardCentroid } from "./location";
import { fetchAcisStationSeries, listAcisStations, type AcisStation } from "./providers/rcc-acis";
import { seasonWindowFor, seasonYearFor } from "./season-core";
import { zonedClock } from "@/lib/work-orders/due-at";
import { addDaysIso } from "./obs-time-core";
import { ROLLING_INGEST_DAYS } from "./backfill-window-core";
import { resolveSiteTimeZone, siteTodayIso } from "./site-time-core";
import { getWineryTimeZone, getUnitPrefs } from "@/lib/settings/data";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
// D9 vineyard-membership scoping — every action in this file is keyed to ONE vineyard, so the gate is
// threaded through the two chokepoints below rather than repeated per action.
import { requireVineyardAccess } from "@/lib/vineyard/scope";

/**
 * Auth + resolve the session's active tenant. The weather WRITE path (ingest → requireTenantId() +
 * runInTenantTx) needs an ALS tenant context; plain "use server" actions don't set one, which is the
 * "No tenant context — wrap this call in runAsTenant()" bug. Callers wrap their body in
 * `runAsTenant(tenantId, …)`. Throws (caught by each action's try/catch) when there's no active org.
 *
 * ⚠️ WHY EVERY CATCH IN THIS FILE STARTS WITH `unstable_rethrow(e)`: `requireReadyUser()` does NOT
 * return a decision — it calls Next's `redirect()`, which signals by THROWING `NEXT_REDIRECT`. The
 * gate below sits inside each action's `try`, so a catch-all `return { ok: false, error: e.message }`
 * swallowed that control-flow throw and the browser rendered the literal string
 * "NEXT_REDIRECT;replace;/login;307;" as an error message — the user with an expired session was never
 * bounced to /login. `getCurrentUser()` also reads `headers()`, whose request-time bailout throws the
 * same way. `unstable_rethrow` re-throws exactly the framework-controlled errors (redirect /
 * permanentRedirect / notFound / dynamic-API bailouts) and falls through for real app errors, so the
 * `{ ok: false }` contract is unchanged. It MUST be the first statement in the catch (Next docs:
 * node_modules/next/dist/docs/01-app/03-api-reference/04-functions/unstable_rethrow.md).
 */
async function requireTenant(vineyardId?: string): Promise<string> {
  // Pass the vineyard whenever the caller has one: D9 scoping is per-vineyard, and a tenant-only gate let
  // a manager assigned to vineyard A rewrite vineyard B's weather config, station pick and history.
  if (vineyardId) await requireVineyardAccess(vineyardId);
  else await requireReadyUser();
  const tenantId = await resolveActiveTenantId();
  if (!tenantId) throw new Error("No active organization on your session — sign in to a winery first.");
  return tenantId;
}

/**
 * Site-local "today" for a vineyard (plan 096 U2 — the ONE today, was UTC here vs winery-tz in the
 * assistant). Chain: config.timeZone (provider-reported) → AppSettings.timeZone → UTC.
 */
async function siteTodayFor(vineyardId: string): Promise<string> {
  const cfg = await prisma.vineyardWeatherConfig.findFirst({ where: { vineyardId }, select: { timeZone: true } });
  const wineryTz = await getWineryTimeZone().catch(() => null);
  return siteTodayIso(resolveSiteTimeZone(cfg?.timeZone, wineryTz));
}

/**
 * D9 gate in the RETURN-don't-throw idiom: hands back this module's `{ ok:false, error }` on denial, or
 * `null` to proceed. Needed for the actions whose gate cannot sit inside an existing `try` — a thrown
 * `ActionError` escapes to Next, which redacts it in production, so the user would see an opaque string
 * instead of "You can only work with your assigned vineyard." `unstable_rethrow` first, so a redirect
 * from the session gate underneath stays a redirect (REDIRECT-1).
 */
async function gateVineyard(vineyardId: string): Promise<{ ok: false; error: string } | null> {
  try {
    await requireVineyardAccess(vineyardId);
    return null;
  } catch (e) {
    unstable_rethrow(e);
    return { ok: false, error: e instanceof Error ? e.message : "You can only work with your assigned vineyard." };
  }
}

/** A nearby station option for the map picker. */
export interface StationOption {
  sid: string;
  name: string;
  lat: number;
  lon: number;
  distanceKm: number;
  elevM: number | null;
}

/** Resolve the grower's chosen station (config.stationOverrideId) back to a full AcisStation, or null. */
async function resolveChosenStation(vineyardId: string, lat: number, lon: number): Promise<AcisStation | null> {
  const cfg = await prisma.vineyardWeatherConfig.findFirst({ where: { vineyardId }, select: { stationOverrideId: true } });
  if (!cfg?.stationOverrideId) return null;
  const stations = await listAcisStations(lat, lon).catch(() => []);
  return stations.find((s) => s.sid === cfg.stationOverrideId) ?? null;
}

/** List nearby ACIS stations for a vineyard's map picker (nearest first). */
export async function listNearbyStations(vineyardId: string): Promise<{ ok: true; stations: StationOption[]; center: { lat: number; lon: number } } | { ok: false; error: string }> {
  const denied = await gateVineyard(vineyardId);
  if (denied) return denied;
  const centroid = await resolveVineyardCentroid(vineyardId);
  if (!centroid) return { ok: false, error: "This vineyard has no planting-area geometry yet — draw its boundary first." };
  try {
    const stations = await listAcisStations(centroid.lat, centroid.lon);
    return {
      ok: true,
      center: centroid,
      stations: stations.map((s) => ({ sid: s.sid, name: s.name, lat: s.lat, lon: s.lon, distanceKm: Math.round(s.distanceM / 100) / 10, elevM: s.elevM })),
    };
  } catch (e) {
    unstable_rethrow(e);
    return { ok: false, error: (e as Error).message };
  }
}

/** Pick a specific station (map click): store the choice, make it primary, and re-ingest from it. */
export async function setVineyardStation(vineyardId: string, station: StationOption): Promise<{ ok: true; rows: number } | { ok: false; error: string }> {
  try {
    const tenantId = await requireTenant(vineyardId);
    return await runAsTenant(tenantId, async () => {
    const centroid = await resolveVineyardCentroid(vineyardId);
    if (!centroid) return { ok: false, error: "This vineyard has no planting-area geometry yet." };
    const cfg = await prisma.vineyardWeatherConfig.findFirst({ where: { vineyardId }, select: { id: true } });
    if (!cfg) return { ok: false, error: "Refresh this vineyard's weather first, then choose a station." };
    const today = await siteTodayFor(vineyardId);
    const { startIso } = seasonWindowFor(centroid.lat, seasonYearFor(centroid.lat, today));
    const full: AcisStation = { sid: station.sid, name: station.name, lat: station.lat, lon: station.lon, elevM: station.elevM, distanceM: station.distanceKm * 1000 };

    // VALIDATE FIRST (bug caught in browser QA): some stations report no daily data this season. Probe before
    // mutating — else we'd delete the current station's rows and replace them with nothing, leaving the
    // primary source empty. Refuse the pick and change nothing.
    let probe;
    try {
      probe = await fetchAcisStationSeries(full, startIso, today);
    } catch {
      probe = null;
    }
    if (!probe || probe.records.length === 0) {
      return { ok: false, error: `${station.name} has no reported data for this season — try a different station.` };
    }

    // Clear the season's existing rcc_acis rows so the NEW station fully replaces the old one — an upsert
    // alone would leave stale rows from the previous station on dates the new station doesn't cover (mixing
    // two stations under one providerKey). Scoped to the re-ingested window; older data untouched.
    await prisma.vineyardClimateDaily.deleteMany({ where: { vineyardId, providerKey: "rcc_acis", localDate: { gte: new Date(`${startIso}T00:00:00.000Z`) } } });
    const res = await ingestVineyardWeatherCore({ vineyardId, lat: centroid.lat, lon: centroid.lon, startIso, endIso: today, stationOverride: full });
    // Only AFTER a successful ingest do we lock in the override flags — so a mid-ingest failure self-heals to
    // the auto-nearest on the next refresh instead of pinning a half-written station.
    await prisma.vineyardWeatherConfig.update({ where: { id: cfg.id }, data: { stationOverrideId: station.sid, primaryProviderOverride: "rcc_acis" } });
    revalidatePath("/vineyards/weather");
    return { ok: true, rows: res.rowsWritten };
    });
  } catch (e) {
    unstable_rethrow(e);
    return { ok: false, error: (e as Error).message };
  }
}

const dec = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

/** Plan 098: the display system for a vineyard's weather surfaces — config override -> winery master ->
 *  geo default. One owner for the loaders below; best-effort on the settings read. */
async function resolveVineyardDisplaySystem(vineyardId: string, configUnitSystem: string | null | undefined): Promise<"METRIC" | "IMPERIAL"> {
  const centroid = await resolveVineyardCentroid(vineyardId);
  const prefs = await getUnitPrefs().catch(() => null);
  return resolveWeatherUnitSystem(configUnitSystem, prefs?.configuredSystem ?? null, centroid?.lat, centroid?.lon);
}


/** Read the composed climate summary for a vineyard (offline — no live provider call). Null if not set up. */
export async function loadVineyardClimateSummary(vineyardId: string, today?: string): Promise<ClimateSummary | null> {
  await requireVineyardAccess(vineyardId);
  const centroid = await resolveVineyardCentroid(vineyardId);
  const configRow = await prisma.vineyardWeatherConfig.findFirst({ where: { vineyardId } });
  if (!configRow || !centroid) return null;

  const rows = await prisma.vineyardClimateDaily.findMany({
    where: { vineyardId },
    select: { providerKey: true, localDate: true, tmaxC: true, tminC: true, precipMm: true, rhMaxPct: true, rhMinPct: true },
    orderBy: { localDate: "asc" },
  });
  const dailyRows: DailyRow[] = rows.map((r) => ({
    providerKey: r.providerKey,
    localDate: r.localDate.toISOString().slice(0, 10),
    tmaxC: dec(r.tmaxC),
    tminC: dec(r.tminC),
    precipMm: dec(r.precipMm),
    rhMaxPct: dec(r.rhMaxPct),
    rhMinPct: dec(r.rhMinPct),
  }));
  const config: ClimateConfig = {
    primaryProviderKey: configRow.primaryProviderKey,
    primaryProviderOverride: configRow.primaryProviderOverride,
    coverageState: configRow.coverageState,
    stationId: configRow.stationId,
    stationName: configRow.stationName,
    stationDistanceM: dec(configRow.stationDistanceM),
    stationElevationDeltaM: dec(configRow.stationElevationDeltaM),
    siteElevationM: dec(configRow.siteElevationM),
    primarySourceElevationM: dec(configRow.primarySourceElevationM),
    attribution: configRow.attribution,
    lastRefreshAt: configRow.lastRefreshAt ? configRow.lastRefreshAt.toISOString() : null,
    unitSystem: configRow.unitSystem,
  };
  // Site-local today (config row is already in hand — no second lookup).
  const wineryTz = await getWineryTimeZone().catch(() => null);
  const todayIso = today ?? siteTodayIso(resolveSiteTimeZone(configRow.timeZone, wineryTz));
  // Plan 098 — tenant master for the unit chain (config override → tenant → geo). Best-effort like the tz read.
  const prefs = await getUnitPrefs().catch(() => null);
  return composeClimateSummaryCore({
    vineyardId,
    rows: dailyRows,
    config,
    latitude: centroid.lat,
    longitude: centroid.lon,
    today: todayIso,
    tenantUnitSystem: prefs?.configuredSystem ?? null,
  });
}

/** The provider keys a grower may choose as their primary climate source (R14). */
const SELECTABLE_PROVIDERS = new Set([
  "gridmet",
  "rcc_acis",
  "open_meteo_archive",
  "nasa_power",
  "daymet",
  "noaa_cdo",
]);

/**
 * Set (or clear) the grower's primary-source override for a vineyard (R14). `providerKey = null` reverts to
 * the auto-resolved default (nearest quality station / best grid). effectivePrimary = override ?? resolved,
 * so the summary + assistant immediately answer in the chosen source. Only a provider that actually has
 * stored data for the vineyard may be chosen — no dangling override.
 */
export async function setVineyardPrimarySource(
  vineyardId: string,
  providerKey: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const denied = await gateVineyard(vineyardId);
  if (denied) return denied;
  const config = await prisma.vineyardWeatherConfig.findFirst({ where: { vineyardId }, select: { id: true } });
  if (!config) return { ok: false, error: "This vineyard has no weather set up yet — refresh its weather first." };

  if (providerKey !== null) {
    if (!SELECTABLE_PROVIDERS.has(providerKey)) return { ok: false, error: `Unknown source "${providerKey}".` };
    const hasData = await prisma.vineyardClimateDaily.findFirst({ where: { vineyardId, providerKey }, select: { id: true } });
    if (!hasData) return { ok: false, error: `No stored data from "${providerKey}" for this vineyard yet.` };
  }

  // Picking "Auto" (null) clears the station pick too — fully automatic. Choosing a non-station source also
  // drops a stale station lock (it only applies to rcc_acis).
  const clearStation = providerKey === null || providerKey !== "rcc_acis";
  await prisma.vineyardWeatherConfig.update({
    where: { id: config.id },
    data: { primaryProviderOverride: providerKey, ...(clearStation ? { stationOverrideId: null } : {}) },
  });
  revalidatePath("/vineyards/weather");
  return { ok: true };
}

/**
 * The 7-day forecast view for the strip (plan 096 U15/U16). Reads STORED rows only — the cron and
 * the on-view refresh write; a page load never fetches a provider. Null view = no forecast yet.
 */
export async function loadVineyardForecast(
  vineyardId: string,
): Promise<
  | { ok: true; view: ForecastView | null; unitSystem: string; stale: boolean; activeAlerts: NwsActiveAlert[] }
  | { ok: false; error: string }
> {
  try {
    await requireVineyardAccess(vineyardId);
    const configRow = await prisma.vineyardWeatherConfig.findFirst({
      where: { vineyardId },
      select: {
        timeZone: true,
        unitSystem: true,
        activeAlertsJson: true,
        frostWatchC: true,
        frostWarnC: true,
        hardFreezeC: true,
        heatWatchC: true,
        extremeHeatC: true,
      },
    });
    if (!configRow) return { ok: true, view: null, unitSystem: "METRIC", stale: false, activeAlerts: [] };
    const wineryTz = await getWineryTimeZone().catch(() => null);
    const todayIso = siteTodayIso(resolveSiteTimeZone(configRow.timeZone, wineryTz));
    // Plan 098 — resolve the display system up front (the badge path below reuses this centroid).
    const centroid = await resolveVineyardCentroid(vineyardId);
    const prefs = await getUnitPrefs().catch(() => null);
    const unitSystem = resolveWeatherUnitSystem(configRow.unitSystem, prefs?.configuredSystem ?? null, centroid?.lat, centroid?.lon);
    const rows = await prisma.vineyardForecastDaily.findMany({
      where: { vineyardId },
      orderBy: { targetDate: "asc" },
    });
    let view = composeForecastViewCore(
      rows.map((r) => ({
        providerKey: r.providerKey,
        targetDate: r.targetDate.toISOString().slice(0, 10),
        issuedAt: r.issuedAt.toISOString(),
        tmaxC: dec(r.tmaxC),
        tminC: dec(r.tminC),
        precipMm: dec(r.precipMm),
        precipProbabilityPct: dec(r.precipProbabilityPct),
        conditionCode: r.conditionCode,
        windMaxKph: dec(r.windMaxKph),
      })),
      todayIso,
    );
    // U23 — warning badges from the SAME classification core that drives notifications (one truth).
    if (view) {
      if (centroid) {
        const candidates = classifyForecastAlertsCore(
          view.days.map((d) => ({ targetDate: d.targetDate, tminC: d.tminC, tmaxC: d.tmaxC })),
          {
            latitude: centroid.lat,
            todayIso,
            thresholds: {
              frostWatchC: dec(configRow.frostWatchC) ?? undefined,
              frostWarnC: dec(configRow.frostWarnC) ?? undefined,
              hardFreezeC: dec(configRow.hardFreezeC) ?? undefined,
              heatWatchC: dec(configRow.heatWatchC) ?? undefined,
              extremeHeatC: dec(configRow.extremeHeatC) ?? undefined,
            },
          },
        );
        view = { ...view, days: attachForecastBadges(view.days, candidates) };
      }
    }
    const stale = view ? isForecastStale(view.issuedAt, new Date()) : false;
    const activeAlerts = Array.isArray(configRow.activeAlertsJson) ? (configRow.activeAlertsJson as unknown as NwsActiveAlert[]) : [];
    return { ok: true, view, unitSystem, stale, activeAlerts };
  } catch (e) {
    unstable_rethrow(e);
    return { ok: false, error: (e as Error).message };
  }
}

/**
 * One day's hourly forecast for the modal (plan 097 U4). STORED rows only; ONE provider (the same
 * rank discipline as the strip — C3); thresholds returned so the chart's reference lines and the
 * crossing copy use identical numbers. Null day = no hourly detail stored (honest empty state).
 */
export async function loadVineyardForecastHours(
  vineyardId: string,
  targetDate: string,
): Promise<
  | {
      ok: true;
      day: ForecastHourlyDay | null;
      unitSystem: string;
      thresholds: { frostWarnC: number; hardFreezeC: number; heatWatchC: number; extremeHeatC: number };
      /** Site-local current hour when targetDate IS today (drives the chart's now-marker); else null. */
      nowLocalHour: number | null;
    }
  | { ok: false; error: string }
> {
  try {
    await requireVineyardAccess(vineyardId);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) return { ok: false, error: "Invalid date." };
    const configRow = await prisma.vineyardWeatherConfig.findFirst({
      where: { vineyardId },
      select: { unitSystem: true, timeZone: true, frostWarnC: true, hardFreezeC: true, heatWatchC: true, extremeHeatC: true },
    });
    // The now-marker: only meaningful when the modal's day IS the site-local today.
    const wineryTz = await getWineryTimeZone().catch(() => null);
    const tz = resolveSiteTimeZone(configRow?.timeZone, wineryTz);
    const nowLocalHour = siteTodayIso(tz) === targetDate ? Number(zonedClock(new Date(), tz).slice(0, 2)) : null;
    const thresholds = {
      frostWarnC: dec(configRow?.frostWarnC) ?? 0,
      hardFreezeC: dec(configRow?.hardFreezeC) ?? -2,
      heatWatchC: dec(configRow?.heatWatchC) ?? 35,
      extremeHeatC: dec(configRow?.extremeHeatC) ?? 38,
    };
    const rows = await prisma.vineyardForecastHourly.findMany({
      where: { vineyardId, localDate: new Date(`${targetDate}T00:00:00.000Z`) },
      orderBy: { hourStartUtc: "asc" },
    });
    const day = composeForecastHoursCore(
      rows.map((r) => ({
        providerKey: r.providerKey,
        hourStartUtc: r.hourStartUtc.toISOString(),
        localDate: r.localDate.toISOString().slice(0, 10),
        localHour: r.localHour,
        tempC: dec(r.tempC),
        popPct: dec(r.popPct),
        precipMm: dec(r.precipMm),
        precipDurationH: r.precipDurationH,
        conditionCode: r.conditionCode,
        windKph: dec(r.windKph),
      })),
      { targetDate, frostWarnC: thresholds.frostWarnC, heatWatchC: thresholds.heatWatchC },
    );
    // Plan 098 — the modal must resolve the same chain as the strip, or the two disagree on a US site.
    const unitSystem = await resolveVineyardDisplaySystem(vineyardId, configRow?.unitSystem);
    return { ok: true, day, unitSystem, thresholds, nowLocalHour };
  } catch (e) {
    unstable_rethrow(e);
    return { ok: false, error: (e as Error).message };
  }
}

/** Refresh a vineyard's 7-day forecast from live providers (on-view when stale >6h, or manual). */
export async function refreshVineyardForecast(vineyardId: string): Promise<{ ok: true; rows: number } | { ok: false; error: string }> {
  try {
    const tenantId = await requireTenant(vineyardId);
    return await runAsTenant(tenantId, async () => {
      const centroid = await resolveVineyardCentroid(vineyardId);
      if (!centroid) return { ok: false as const, error: "This vineyard has no location yet — draw its boundary or drop a GPS pin first." };
      const cfg = await prisma.vineyardWeatherConfig.findFirst({
        where: { vineyardId },
        select: { siteElevationM: true, nwsGridId: true, nwsGridX: true, nwsGridY: true, timeZone: true },
      });
      const res = await ingestVineyardForecastCore({
        vineyardId,
        lat: centroid.lat,
        lon: centroid.lon,
        elevationM: cfg?.siteElevationM === null || cfg?.siteElevationM === undefined ? null : Number(cfg.siteElevationM),
        nwsGrid:
          cfg?.nwsGridId && cfg.nwsGridX !== null && cfg.nwsGridY !== null
            ? { gridId: cfg.nwsGridId, gridX: cfg.nwsGridX!, gridY: cfg.nwsGridY!, timeZone: cfg.timeZone ?? null }
            : null,
      });
      revalidatePath("/vineyards/weather");
      return { ok: true as const, rows: res.rowsWritten };
    });
  } catch (e) {
    unstable_rethrow(e);
    return { ok: false, error: (e as Error).message };
  }
}

/**
 * Rainfall-over-time for the chart (plan 096 U8). Reads STORED rows only (no live fetch), primary
 * provider only (never-blend — a missing day is a labeled gap, not a fill). Range is site-local ISO
 * dates from the client control; capped at 24 months by the core.
 */
export async function loadVineyardRainfallRange(
  vineyardId: string,
  startIso: string,
  endIso: string,
): Promise<{ ok: true; range: RainfallRangeResult; unitSystem: string } | { ok: false; error: string }> {
  try {
    await requireVineyardAccess(vineyardId);
    const configRow = await prisma.vineyardWeatherConfig.findFirst({
      where: { vineyardId },
      select: { primaryProviderKey: true, primaryProviderOverride: true, unitSystem: true, coverageState: true },
    });
    if (!configRow) return { ok: false, error: "This vineyard has no weather set up yet — refresh its weather first." };
    const primary = effectivePrimary({ primaryProviderKey: configRow.primaryProviderKey, primaryProviderOverride: configRow.primaryProviderOverride });
    // The deep-history source (mirrors backfill-core's provider choice) — labeled per-day fallback
    // where the primary (e.g. a station) has no off-season coverage. One source per day, never a mix.
    const historyKey = configRow.coverageState === "US_HIGH_RES" ? "gridmet" : "open_meteo_archive";
    const rows = await prisma.vineyardClimateDaily.findMany({
      where: { vineyardId, providerKey: { in: [primary, historyKey] }, localDate: { gte: new Date(`${startIso}T00:00:00.000Z`), lte: new Date(`${endIso}T00:00:00.000Z`) } },
      select: { providerKey: true, localDate: true, precipMm: true },
      orderBy: { localDate: "asc" },
    });
    const range = composeRainfallRangeCore({
      rows: rows.map((r) => ({ providerKey: r.providerKey, localDate: r.localDate.toISOString().slice(0, 10), precipMm: dec(r.precipMm) })),
      primaryProviderKey: primary,
      historyProviderKey: historyKey,
      startIso,
      endIso,
    });
    // Plan 098 — resolved chain, same as the card that hosts this section.
    const unitSystem = await resolveVineyardDisplaySystem(vineyardId, configRow.unitSystem);
    return { ok: true, range, unitSystem };
  } catch (e) {
    unstable_rethrow(e);
    return { ok: false, error: (e as Error).message };
  }
}

/**
 * Set (or clear) the vineyard's display unit-system OVERRIDE (plan 096 U3, plan 098). Storage stays
 * metric; this only changes what the card/assistant RENDER. `null` = "Auto": follow the winery's
 * display units, else the geo default — the resolution chain in resolveWeatherUnitSystem.
 */
export async function setVineyardUnitSystem(
  vineyardId: string,
  unitSystem: "METRIC" | "IMPERIAL" | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const denied = await gateVineyard(vineyardId);
  if (denied) return denied;
  if (unitSystem !== null && unitSystem !== "METRIC" && unitSystem !== "IMPERIAL") return { ok: false, error: "Unknown unit system." };
  const config = await prisma.vineyardWeatherConfig.findFirst({ where: { vineyardId }, select: { id: true } });
  if (!config) return { ok: false, error: "This vineyard has no weather set up yet — refresh its weather first." };
  await prisma.vineyardWeatherConfig.update({ where: { id: config.id }, data: { unitSystem } });
  revalidatePath("/vineyards/weather");
  return { ok: true };
}

/** Refresh a vineyard's weather from live providers (resolves the centroid, runs ingest). */
export async function refreshVineyardWeather(vineyardId: string, startIso: string, endIso: string): Promise<IngestResult> {
  const tenantId = await requireTenant(vineyardId);
  return runAsTenant(tenantId, async () => {
    const centroid = await resolveVineyardCentroid(vineyardId);
    if (!centroid) throw new Error("Vineyard has no planting-area geometry yet — draw its boundary first.");
    return ingestVineyardWeatherCore({ vineyardId, lat: centroid.lat, lon: centroid.lon, startIso, endIso });
  });
}

/** Backfill N years of historical gridMET so the card can show the Winkler normal + 10/20-yr GDD curves. */
export async function backfillVineyardWeatherHistory(
  vineyardId: string,
  years = 20,
): Promise<{ ok: true; rows: number; fromYear: number; toYear: number } | { ok: false; error: string }> {
  try {
    const tenantId = await requireTenant(vineyardId);
    return await runAsTenant(tenantId, async () => {
      const centroid = await resolveVineyardCentroid(vineyardId);
      if (!centroid) return { ok: false as const, error: "This vineyard has no planting-area geometry yet — draw its boundary first." };
      const currentYear = seasonYearFor(centroid.lat, await siteTodayFor(vineyardId));
      const { backfillVineyardGridmetHistory } = await import("./backfill-core");
      const res = await backfillVineyardGridmetHistory(vineyardId, centroid.lat, centroid.lon, years, currentYear);
      if (res.rowsWritten === 0) {
        return { ok: false as const, error: "No historical weather available for this location yet." };
      }
      revalidatePath("/vineyards/weather");
      return { ok: true as const, rows: res.rowsWritten, fromYear: res.fromYear, toYear: res.toYear };
    });
  } catch (e) {
    unstable_rethrow(e);
    return { ok: false, error: (e as Error).message };
  }
}

/** Refresh the CURRENT growing season (season start → today) — the button on the climate card. */
export async function refreshVineyardWeatherCurrentSeason(vineyardId: string): Promise<{ ok: true; rows: number } | { ok: false; error: string }> {
  try {
    const tenantId = await requireTenant(vineyardId);
    return await runAsTenant(tenantId, async () => {
      const centroid = await resolveVineyardCentroid(vineyardId);
      if (!centroid) return { ok: false as const, error: "This vineyard has no planting-area geometry yet — draw its boundary first." };
      const today = await siteTodayFor(vineyardId);
      // Plan 096 U6: rolling window (not season-start→today) so the recent OFF-season lands too —
      // that's what makes "last 30 days of rain" work in January. Covers the whole current season.
      const startIso = addDaysIso(today, -ROLLING_INGEST_DAYS);
      // Preserve a grower's map-picked station across refreshes (else it'd revert to auto-nearest).
      const stationOverride = await resolveChosenStation(vineyardId, centroid.lat, centroid.lon);
      const res = await ingestVineyardWeatherCore({ vineyardId, lat: centroid.lat, lon: centroid.lon, startIso, endIso: today, stationOverride });
      // Once a vineyard's weather has been fetched, keep it fresh automatically via the daily sweep (DARK
      // flag flips on here) — so growers never have to click Refresh again.
      await prisma.vineyard.update({ where: { id: vineyardId }, data: { weatherAutoRefresh: true } }).catch(() => {});
      revalidatePath("/vineyards/weather");
      return { ok: true as const, rows: res.rowsWritten };
    });
  } catch (e) {
    unstable_rethrow(e);
    return { ok: false, error: (e as Error).message };
  }
}
