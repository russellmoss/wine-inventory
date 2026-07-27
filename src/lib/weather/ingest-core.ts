import "server-only";

/**
 * VI-P8 Unit 5 — ingest a vineyard's weather: fetch → normalize → obs-time-map → upsert. Council R8: ALL
 * outbound fetch + normalization + obs-time mapping + selection happen OUTSIDE any tx; the short
 * runInTenantTx wraps only the write set (daily-row upserts + the 1:1 config upsert). Council R1: rows are
 * UPSERTED on (tenant, vineyard, localDate, providerKey) — no snapshot to supersede, so no supersede race.
 * Council R11: a provider fetch that fails contributes NO rows for that provider (never a fabricated value);
 * as long as ONE provider succeeds the others still land. Gap-fill/spread are computed on READ, not here — no
 * synthesized rows are ever written.
 */
import { Prisma } from "@prisma/client";
import { requireTenantId } from "@/lib/tenant/context";
import { runInTenantTx } from "@/lib/tenant/tx";
import { mapSeriesToLocalDaily, type LocalDailyRecord } from "./obs-time-core";
import { selectPrimaryCore, type PrimaryCandidate } from "./source-selection-core";
import { recordWeatherUsage } from "./usage-core";
import { coverageStateFor, providersForLocation } from "./providers/registry";
import { fetchSiteElevationM } from "./providers/open-meteo-elevation";
import { fetchAcisStationSeries, type AcisStation } from "./providers/rcc-acis";
import { ProviderFetchError, type ClimateProvider, type ProviderKey, type ProviderSeries } from "./providers/types";

const PROVISIONAL_WINDOW_DAYS = 10; // days back from "now" that are still legitimately mutable (gridMET finalizes).

export interface IngestInput {
  vineyardId: string;
  lat: number;
  lon: number;
  startIso: string;
  endIso: string;
  /** Grower's map-picked station — when set, the rcc_acis series comes from THIS station, not the auto-nearest. */
  stationOverride?: AcisStation | null;
}

export interface IngestDeps {
  providers?: ClimateProvider[]; // default: providersForLocation(lat, lon)
  fetchSeries?: (p: ClimateProvider, lat: number, lon: number, s: string, e: string) => Promise<ProviderSeries>;
  fetchElevationM?: (lat: number, lon: number) => Promise<number | null>;
  now?: Date;
}

export interface IngestResult {
  vineyardId: string;
  providersSucceeded: ProviderKey[];
  providersFailed: Array<{ provider: ProviderKey; error: string }>;
  primaryProviderKey: ProviderKey;
  coverageState: string;
  rowsWritten: number;
  siteElevationM: number | null;
}

function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function completeness(local: LocalDailyRecord[], startIso: string, endIso: string): number {
  const windowDays = Math.floor((Date.parse(`${endIso}T00:00:00Z`) - Date.parse(`${startIso}T00:00:00Z`)) / 86_400_000) + 1;
  const paired = local.filter((r) => r.tmaxC !== null && r.tminC !== null).length;
  return windowDays <= 0 ? 0 : paired / windowDays;
}

/**
 * Ingest. Fetches every covering provider (recording usage per attempt), obs-time-maps each, picks the
 * default primary, then writes all successful providers' pure single-source rows + the 1:1 config in ONE tx.
 */
export async function ingestVineyardWeatherCore(input: IngestInput, deps: IngestDeps = {}): Promise<IngestResult> {
  const { vineyardId, lat, lon, startIso, endIso } = input;
  const now = deps.now ?? new Date();
  const providers = deps.providers ?? providersForLocation(lat, lon);
  const fetchSeries = deps.fetchSeries ?? ((p, la, lo, s, e) => p.fetchDailySeries(la, lo, s, e));
  // Elevation chain (plan 096 U5): EPQS (US) → Open-Meteo (global) — Bhutan finally gets a real siteElevationM.
  const elevFn = deps.fetchElevationM ?? fetchSiteElevationM;

  // ── OUTSIDE any tx (R8): elevation + all provider fetches ──
  const siteElevationM = await elevFn(lat, lon).catch(() => null);

  const succeeded: Array<{ series: ProviderSeries; local: LocalDailyRecord[] }> = [];
  const providersFailed: Array<{ provider: ProviderKey; error: string }> = [];
  for (const p of providers) {
    try {
      // Honor a grower's map-picked station for the rcc_acis series (else the provider's auto-nearest).
      const series =
        p.key === "rcc_acis" && input.stationOverride
          ? await fetchAcisStationSeries(input.stationOverride, startIso, endIso)
          : await fetchSeries(p, lat, lon, startIso, endIso);
      succeeded.push({ series, local: mapSeriesToLocalDaily(series) });
      await recordWeatherUsage(p.key, { requests: 1 }, now).catch(() => {});
    } catch (e) {
      const msg = e instanceof ProviderFetchError ? e.message : (e as Error).message;
      providersFailed.push({ provider: p.key, error: msg });
      await recordWeatherUsage(p.key, { requests: 1, error: msg }, now).catch(() => {});
    }
  }
  if (succeeded.length === 0) {
    // R11: every provider failed → store NOTHING (never fabricate weather).
    throw new Error(`weather ingest: all ${providers.length} providers failed for vineyard ${vineyardId}`);
  }

  // ── Pure decisions (outside tx): default primary + station context ──
  const candidates: PrimaryCandidate[] = succeeded.map(({ series, local }) => {
    const stationDistanceM =
      series.stationLat != null && series.stationLon != null ? haversineM(lat, lon, series.stationLat, series.stationLon) : null;
    return {
      providerKey: series.providerKey,
      kind: series.kind,
      stationDistanceM,
      stationElevationDeltaM: null, // filled below when we have site + station elevation
      completeness: completeness(local, startIso, endIso),
    };
  });
  const primaryProviderKey = selectPrimaryCore(candidates) ?? succeeded[0].series.providerKey;
  const primarySeries = succeeded.find((s) => s.series.providerKey === primaryProviderKey)!.series;
  const coverageState = coverageStateFor(lat, lon);

  const stationSeries = succeeded.find((s) => s.series.kind === "station")?.series;
  const stationDistanceM =
    stationSeries?.stationLat != null && stationSeries.stationLon != null
      ? haversineM(lat, lon, stationSeries.stationLat, stationSeries.stationLon)
      : null;
  const provisionalCutoff = new Date(now.getTime() - PROVISIONAL_WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10);

  // ── Build the bulk write payload (still outside tx). One VALUES tuple per non-empty local-day row. ──
  const tenantId = requireTenantId();
  const tuples: Prisma.Sql[] = [];
  for (const { series, local } of succeeded) {
    for (const r of local) {
      if (r.tmaxC === null && r.tminC === null && r.precipMm === null && r.rhMaxPct === null && r.rhMinPct === null) continue;
      const dataStatus = r.localDate >= provisionalCutoff ? "PROVISIONAL" : "FINAL";
      const provenance = JSON.stringify({
        providerKey: series.providerKey,
        obsConvention: series.obsConvention,
        resolutionM: series.resolutionM,
        attribution: series.attribution,
        sourceUrl: series.sourceUrl,
        fetchedAt: now.toISOString(),
      });
      tuples.push(
        Prisma.sql`(gen_random_uuid()::text, ${tenantId}, ${vineyardId}, ${r.localDate}::date, ${series.providerKey},
          ${r.tmaxC}::decimal, ${r.tminC}::decimal, ${r.precipMm}::decimal, ${r.rhMaxPct}::decimal, ${r.rhMinPct}::decimal,
          ${dataStatus}, ${provenance}::jsonb, now(), now())`,
      );
    }
  }
  const rowsWritten = tuples.length;

  // ── The ONLY tx (R8): ONE bulk upsert of the pure single-source rows + the 1:1 config ──
  await runInTenantTx(
    async (tx) => {
      // Chunk to stay well under Postgres' 32767-bind-parameter cap (~12 binds/row → ~2700 rows/batch).
      const BATCH = 1_000;
      for (let i = 0; i < tuples.length; i += BATCH) {
        const batch = tuples.slice(i, i + BATCH);
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO "vineyard_climate_daily"
            ("id","tenantId","vineyardId","localDate","providerKey","tmaxC","tminC","precipMm","rhMaxPct","rhMinPct","dataStatus","provenance","createdAt","updatedAt")
          VALUES ${Prisma.join(batch)}
          ON CONFLICT ("tenantId","vineyardId","localDate","providerKey") DO UPDATE SET
            "tmaxC"=EXCLUDED."tmaxC","tminC"=EXCLUDED."tminC","precipMm"=EXCLUDED."precipMm",
            "rhMaxPct"=EXCLUDED."rhMaxPct","rhMinPct"=EXCLUDED."rhMinPct",
            "dataStatus"=EXCLUDED."dataStatus","provenance"=EXCLUDED."provenance","updatedAt"=now()`);
      }
      await tx.vineyardWeatherConfig.upsert({
      where: { tenantId_vineyardId: { tenantId, vineyardId } },
      create: {
        vineyardId,
        primaryProviderKey,
        stationId: stationSeries?.stationId ?? null,
        stationName: stationSeries?.stationName ?? null,
        stationDistanceM,
        siteElevationM,
        coverageState,
        // Plan 098: a NEW config starts on "Auto" (NULL) — the read chain resolves
        // grower override → winery display units → the geo default at this point, so the
        // pre-098 geo behavior (plan 096 U3 council S2: US forecast coverage → IMPERIAL) is
        // unchanged for an unconfigured winery, and a configured winery isn't shadowed by a
        // seeded value the grower never chose. The toggle owns the column after creation.
        attribution: [...new Set(succeeded.map((s) => s.series.attribution))].join(" · "),
        lastRefreshAt: now,
      },
      update: {
        primaryProviderKey,
        stationId: stationSeries?.stationId ?? null,
        stationName: stationSeries?.stationName ?? null,
        stationDistanceM,
        siteElevationM,
        coverageState,
        attribution: [...new Set(succeeded.map((s) => s.series.attribution))].join(" · "),
        lastRefreshAt: now,
      },
    });
    },
    { timeout: 20_000, maxWait: 10_000 },
  );

  return {
    vineyardId,
    providersSucceeded: succeeded.map((s) => s.series.providerKey),
    providersFailed,
    primaryProviderKey,
    coverageState,
    rowsWritten,
    siteElevationM,
  };
}
