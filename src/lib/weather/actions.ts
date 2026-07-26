"use server";

// VI-P8 — server entry points for the weather spine. Also the verify:ai-native ANCHOR: it imports the pure
// cores (ingest + read composition) so they're reachable in the import graph (mirrors spatial/actions.ts).

import { prisma } from "@/lib/prisma";
import { requireReadyUser } from "@/lib/dal";
import { composeClimateSummaryCore, type ClimateSummary, type DailyRow, type ClimateConfig } from "./read-core";
import { ingestVineyardWeatherCore, type IngestResult } from "./ingest-core";
import { resolveVineyardCentroid } from "./location";
import { seasonWindowFor, seasonYearFor } from "./season-core";
import { revalidatePath } from "next/cache";

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
    // Cap the window start at the season start; a dormant-season refresh still gets the season so far.
    const res = await ingestVineyardWeatherCore({ vineyardId, lat: centroid.lat, lon: centroid.lon, startIso, endIso: today });
    revalidatePath("/vineyards/weather");
    return { ok: true, rows: res.rowsWritten };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
