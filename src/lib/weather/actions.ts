"use server";

// VI-P8 — server entry points for the weather spine. Also the verify:ai-native ANCHOR: it imports the pure
// cores (ingest + read composition) so they're reachable in the import graph (mirrors spatial/actions.ts).

import { prisma } from "@/lib/prisma";
import { requireReadyUser } from "@/lib/dal";
import { composeClimateSummaryCore, type ClimateSummary, type DailyRow, type ClimateConfig } from "./read-core";
import { ingestVineyardWeatherCore, type IngestResult } from "./ingest-core";
import { resolveVineyardCentroid } from "./location";
import { listAcisStations, type AcisStation } from "./providers/rcc-acis";
import { seasonWindowFor, seasonYearFor } from "./season-core";
import { revalidatePath } from "next/cache";

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
  await requireReadyUser();
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
    return { ok: false, error: (e as Error).message };
  }
}

/** Pick a specific station (map click): store the choice, make it primary, and re-ingest from it. */
export async function setVineyardStation(vineyardId: string, station: StationOption): Promise<{ ok: true; rows: number } | { ok: false; error: string }> {
  try {
    await requireReadyUser();
    const centroid = await resolveVineyardCentroid(vineyardId);
    if (!centroid) return { ok: false, error: "This vineyard has no planting-area geometry yet." };
    const cfg = await prisma.vineyardWeatherConfig.findFirst({ where: { vineyardId }, select: { id: true } });
    if (!cfg) return { ok: false, error: "Refresh this vineyard's weather first, then choose a station." };
    // Record the choice + make the station the primary source.
    await prisma.vineyardWeatherConfig.update({ where: { id: cfg.id }, data: { stationOverrideId: station.sid, primaryProviderOverride: "rcc_acis" } });
    const today = new Date().toISOString().slice(0, 10);
    const { startIso } = seasonWindowFor(centroid.lat, seasonYearFor(centroid.lat, today));
    // Clear the season's existing rcc_acis rows first so the NEW station fully replaces the old one — an
    // upsert alone would leave stale rows from the previous station on dates the new station doesn't cover
    // (mixing two stations under one providerKey). Scoped to the re-ingested window; older data untouched.
    await prisma.vineyardClimateDaily.deleteMany({ where: { vineyardId, providerKey: "rcc_acis", localDate: { gte: new Date(`${startIso}T00:00:00.000Z`) } } });
    const full: AcisStation = { sid: station.sid, name: station.name, lat: station.lat, lon: station.lon, elevM: station.elevM, distanceM: station.distanceKm * 1000 };
    const res = await ingestVineyardWeatherCore({ vineyardId, lat: centroid.lat, lon: centroid.lon, startIso, endIso: today, stationOverride: full });
    revalidatePath("/vineyards/weather");
    return { ok: true, rows: res.rowsWritten };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

const dec = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

/** Read the composed climate summary for a vineyard (offline — no live provider call). Null if not set up. */
export async function loadVineyardClimateSummary(vineyardId: string, today?: string): Promise<ClimateSummary | null> {
  await requireReadyUser();
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
    attribution: configRow.attribution,
    lastRefreshAt: configRow.lastRefreshAt ? configRow.lastRefreshAt.toISOString() : null,
  };
  const todayIso = today ?? new Date().toISOString().slice(0, 10);
  return composeClimateSummaryCore({ vineyardId, rows: dailyRows, config, latitude: centroid.lat, today: todayIso });
}

/** The provider keys a grower may choose as their primary climate source (R14). */
const SELECTABLE_PROVIDERS = new Set(["gridmet", "rcc_acis", "nasa_power", "daymet", "noaa_cdo"]);

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
  await requireReadyUser();
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

/** Refresh a vineyard's weather from live providers (resolves the centroid, runs ingest). */
export async function refreshVineyardWeather(vineyardId: string, startIso: string, endIso: string): Promise<IngestResult> {
  await requireReadyUser();
  const centroid = await resolveVineyardCentroid(vineyardId);
  if (!centroid) throw new Error("Vineyard has no planting-area geometry yet — draw its boundary first.");
  return ingestVineyardWeatherCore({ vineyardId, lat: centroid.lat, lon: centroid.lon, startIso, endIso });
}

/** Refresh the CURRENT growing season (season start → today) — the button on the climate card. */
export async function refreshVineyardWeatherCurrentSeason(vineyardId: string): Promise<{ ok: true; rows: number } | { ok: false; error: string }> {
  try {
    await requireReadyUser();
    const centroid = await resolveVineyardCentroid(vineyardId);
    if (!centroid) return { ok: false, error: "This vineyard has no planting-area geometry yet — draw its boundary first." };
    const today = new Date().toISOString().slice(0, 10);
    const seasonYear = seasonYearFor(centroid.lat, today);
    const { startIso } = seasonWindowFor(centroid.lat, seasonYear);
    // Preserve a grower's map-picked station across refreshes (else it'd revert to auto-nearest).
    const stationOverride = await resolveChosenStation(vineyardId, centroid.lat, centroid.lon);
    const res = await ingestVineyardWeatherCore({ vineyardId, lat: centroid.lat, lon: centroid.lon, startIso, endIso: today, stationOverride });
    revalidatePath("/vineyards/weather");
    return { ok: true, rows: res.rowsWritten };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
