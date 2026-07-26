import "server-only";

// Plan 096 Phase 2 Unit 15 — forecast ingest. Fetch every covering forecast provider OUTSIDE any
// tx (R8), then ONE runInTenantTx that, per provider: DELETES the forward horizon (targetDate >=
// the earliest incoming day) and inserts the fresh rows — council C1: an upsert alone leaves a
// stale future row alive when a later response shortens or shifts the horizon; delete-then-insert
// makes "replace" true. Council S4: the config cache (timeZone, NWS grid) persists as an explicit
// step INSIDE the same tx — otherwise siteToday silently falls back to AppSettings/UTC and the
// one-today guarantee dies. Rows store per single provider (never blended); display/alerts/
// assistant consume ONE primary series via forecast-read-core's selectPrimaryForecastSeries (C3).

import { prisma } from "@/lib/prisma";
import { runInTenantTx } from "@/lib/tenant/tx";
import { forecastProvidersForLocation } from "./providers/forecast-registry";
import { fetchNwsForecast, type NwsGrid } from "./providers/forecast-nws";
import { fetchNwsActiveAlerts, type NwsActiveAlert } from "./providers/nws-alerts";
import { isUsForecastCoverage } from "./us-coverage";
import { ProviderFetchError } from "./providers/types";
import type { ForecastProviderKey, ForecastSeries } from "./providers/forecast-types";
import { recordWeatherUsage } from "./usage-core";

export interface ForecastIngestInput {
  vineyardId: string;
  lat: number;
  lon: number;
  elevationM: number | null;
  /** Cached NWS grid from the config row (skips /points); refreshed here when missing. */
  nwsGrid?: NwsGrid | null;
}

export interface ForecastIngestDeps {
  /** Injectable series fetchers (fixtures in verify-weather). Keyed by provider. */
  fetchSeries?: (key: ForecastProviderKey, input: ForecastIngestInput) => Promise<ForecastSeries & { grid?: NwsGrid }>;
  now?: Date;
}

export interface ForecastIngestResult {
  vineyardId: string;
  providersSucceeded: ForecastProviderKey[];
  providersFailed: Array<{ provider: ForecastProviderKey; error: string }>;
  rowsWritten: number;
  timeZone: string | null;
}

async function defaultFetchSeries(key: ForecastProviderKey, input: ForecastIngestInput): Promise<ForecastSeries & { grid?: NwsGrid }> {
  if (key === "nws") return fetchNwsForecast({ lat: input.lat, lon: input.lon }, { grid: input.nwsGrid ?? null });
  const provider = forecastProvidersForLocation(input.lat, input.lon).find((p) => p.key === key);
  if (!provider) throw new ProviderFetchError(key, "http", "provider not covering this point");
  return provider.fetchForecast({ lat: input.lat, lon: input.lon, elevationM: input.elevationM });
}

export async function ingestVineyardForecastCore(input: ForecastIngestInput, deps: ForecastIngestDeps = {}): Promise<ForecastIngestResult> {
  const now = deps.now ?? new Date();
  const fetchSeries = deps.fetchSeries ?? defaultFetchSeries;
  const covering = forecastProvidersForLocation(input.lat, input.lon).map((p) => p.key);

  // ── OUTSIDE any tx (R8): every covering provider; one failure never blocks the others ──
  // U24 observability: one structured line per attempt outcome (the inbox.emit `evt:` idiom — the
  // repo has no logger module; don't invent one). A silently failing forecast is a user-visible
  // blank strip, so failures must be greppable in the platform logs, not just in lastError.
  const succeeded: Array<ForecastSeries & { grid?: NwsGrid }> = [];
  const providersFailed: Array<{ provider: ForecastProviderKey; error: string }> = [];
  for (const key of covering) {
    const t0 = Date.now();
    try {
      const series = await fetchSeries(key, input);
      if (series.records.length > 0) succeeded.push(series);
      await recordWeatherUsage(key, { requests: 1 }, now).catch(() => {});
      console.info(JSON.stringify({ evt: "weather.forecast.success", provider: key, vineyardId: input.vineyardId, days: series.records.length, ms: Date.now() - t0 }));
    } catch (e) {
      const msg = e instanceof ProviderFetchError ? e.message : (e as Error).message;
      providersFailed.push({ provider: key, error: msg });
      await recordWeatherUsage(key, { requests: 1, error: msg }, now).catch(() => {});
      console.info(JSON.stringify({ evt: "weather.forecast.failure", provider: key, vineyardId: input.vineyardId, error: msg.slice(0, 300), ms: Date.now() - t0 }));
    }
  }
  if (succeeded.length === 0) {
    throw new Error(`forecast ingest: all ${covering.length} providers failed for vineyard ${input.vineyardId}`);
  }

  const timeZone = succeeded.find((s) => s.timeZone)?.timeZone ?? null;
  const nwsGrid = succeeded.find((s) => s.providerKey === "nws")?.grid ?? null;

  // Official NWS active alerts (U22, US only) — enrich-only, fetched OUTSIDE the tx like everything
  // else; a failure stores nothing new and the banner keeps rendering the previous copy.
  let activeAlerts: NwsActiveAlert[] | null = null;
  if (isUsForecastCoverage(input.lat, input.lon)) {
    activeAlerts = await fetchNwsActiveAlerts(input.lat, input.lon).catch(() => null);
  }

  // ── ONE tx: per-provider replace (delete forward horizon, insert fresh) + config cache (S4) ──
  let rowsWritten = 0;
  await runInTenantTx(
    async (tx) => {
      for (const series of succeeded) {
        const dates = series.records.map((r) => r.targetDate).sort();
        const horizonStart = new Date(`${dates[0]}T00:00:00.000Z`);
        // C1: replace means REPLACE — a day the new response no longer carries must not survive.
        await tx.vineyardForecastDaily.deleteMany({
          where: { vineyardId: input.vineyardId, providerKey: series.providerKey, targetDate: { gte: horizonStart } },
        });
        await tx.vineyardForecastDaily.createMany({
          data: series.records.map((r) => ({
            vineyardId: input.vineyardId,
            providerKey: series.providerKey,
            targetDate: new Date(`${r.targetDate}T00:00:00.000Z`),
            issuedAt: series.issuedAt,
            tmaxC: r.tmaxC,
            tminC: r.tminC,
            precipMm: r.precipMm,
            precipProbabilityPct: r.precipProbabilityPct,
            conditionCode: r.conditionCode,
            windMaxKph: r.windMaxKph,
            provenance: { providerKey: series.providerKey, attribution: series.attribution, sourceUrl: series.sourceUrl, timeZone: series.timeZone },
          })),
        });
        rowsWritten += series.records.length;
      }
      // S4: the config cache is an EXPLICIT tx step — timeZone feeds siteToday; the grid skips /points.
      await tx.vineyardWeatherConfig.updateMany({
        where: { vineyardId: input.vineyardId },
        data: {
          ...(timeZone ? { timeZone } : {}),
          ...(nwsGrid ? { nwsGridId: nwsGrid.gridId, nwsGridX: nwsGrid.gridX, nwsGridY: nwsGrid.gridY } : {}),
          // C4: the banner's persisted copy — verbatim official alerts (empty array = "none active").
          ...(activeAlerts !== null ? { activeAlertsJson: activeAlerts as object[], activeAlertsFetchedAt: now } : {}),
        },
      });
    },
    { timeout: 20_000, maxWait: 10_000 },
  );

  return {
    vineyardId: input.vineyardId,
    providersSucceeded: succeeded.map((s) => s.providerKey),
    providersFailed,
    rowsWritten,
    timeZone,
  };
}
