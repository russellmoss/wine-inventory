import "server-only";

/**
 * VI-P8 Unit 6 — the daily weather sweep. Enumerates tenants (listAllOrgIds + runAsTenant) and, for every
 * active vineyard:
 *   • PRIMES it if it has a location (planting-area / block polygon / GPS pin) but NO weather yet — fetch the
 *     current season + backfill the long-term history + flip weatherAutoRefresh on. This is what makes weather
 *     "just be there" for EVERY vineyard without anyone opening its page (a new vineyard, or one that was just
 *     pinned, populates on the next nightly run). Bounded per run so a big tenant catches up over a few nights.
 *   • REFRESHES the current season if it already has weather AND weatherAutoRefresh is on (keeps it fresh) and
 *     detects frost/heat crossings (Unit 9).
 * No worker (ADR 0009) — a JSON point-fetch per vineyard; ingest is an idempotent UPSERT so a double-run can't
 * corrupt data (no claim-lease needed).
 */
import { prisma } from "@/lib/prisma";
import { runAsTenant } from "@/lib/tenant/context";
import { listAllOrgIds } from "@/lib/accounting/enumerator";
import { ingestVineyardWeatherCore } from "./ingest-core";
import { backfillVineyardGridmetHistory } from "./backfill-core";
import { resolveVineyardCentroid } from "./location";
import { seasonWindowFor, seasonYearFor } from "./season-core";
import { mapRecordsToLocalDaily } from "./obs-time-core";
import { detectWeatherAlertsCore } from "./alert-core";

/** Cap on NEW vineyards primed per run (each does a live fetch + a 20-yr backfill). The rest catch up next run. */
const PRIME_CAP_PER_RUN = 30;

export interface WeatherSweepSummary {
  tenants: number;
  vineyardsRefreshed: number;
  vineyardsPrimed: number;
  rowsWritten: number;
  alerts: number;
  errors: Array<{ tenantId: string; vineyardId: string; error: string }>;
}

export async function runWeatherSweep(): Promise<WeatherSweepSummary> {
  const orgIds = await listAllOrgIds();
  const summary: WeatherSweepSummary = { tenants: 0, vineyardsRefreshed: 0, vineyardsPrimed: 0, rowsWritten: 0, alerts: 0, errors: [] };
  let primedThisRun = 0;

  for (const tenantId of orgIds) {
    summary.tenants += 1;
    await runAsTenant(tenantId, async () => {
      const vineyards = await prisma.vineyard.findMany({ where: { isActive: true }, select: { id: true, weatherAutoRefresh: true } });
      const today = new Date().toISOString().slice(0, 10);

      for (const v of vineyards) {
        try {
          const hasWeather = (await prisma.vineyardClimateDaily.findFirst({ where: { vineyardId: v.id }, select: { id: true } })) !== null;

          // ── PRIME: a located vineyard with no weather yet ──
          if (!hasWeather) {
            if (primedThisRun >= PRIME_CAP_PER_RUN) continue; // budget for this run spent; catches up next run
            const centroid = await resolveVineyardCentroid(v.id);
            if (!centroid) continue; // no location (no pin / geometry) → nothing to fetch against
            const seasonYear = seasonYearFor(centroid.lat, today);
            const { startIso } = seasonWindowFor(centroid.lat, seasonYear);
            const res = await ingestVineyardWeatherCore({ vineyardId: v.id, lat: centroid.lat, lon: centroid.lon, startIso, endIso: today });
            await backfillVineyardGridmetHistory(v.id, centroid.lat, centroid.lon, 20, seasonYear).catch(() => ({ rowsWritten: 0 }));
            if (!v.weatherAutoRefresh) await prisma.vineyard.update({ where: { id: v.id }, data: { weatherAutoRefresh: true } }).catch(() => {});
            summary.vineyardsPrimed += 1;
            summary.rowsWritten += res.rowsWritten;
            primedThisRun += 1;
            continue;
          }

          // ── REFRESH: keep an already-populated, opted-in vineyard current ──
          if (!v.weatherAutoRefresh) continue;
          const centroid = await resolveVineyardCentroid(v.id);
          if (!centroid) continue;
          const seasonYear = seasonYearFor(centroid.lat, today);
          const { startIso } = seasonWindowFor(centroid.lat, seasonYear);
          const res = await ingestVineyardWeatherCore({ vineyardId: v.id, lat: centroid.lat, lon: centroid.lon, startIso, endIso: today });
          summary.vineyardsRefreshed += 1;
          summary.rowsWritten += res.rowsWritten;

          // Alert detection on the PRIMARY series (recent window), idempotent via per-date dedup.
          const recentIso = new Date(Date.now() - 5 * 86_400_000).toISOString().slice(0, 10);
          const primaryRows = await prisma.vineyardClimateDaily.findMany({
            where: { vineyardId: v.id, providerKey: res.primaryProviderKey, localDate: { gte: new Date(`${recentIso}T00:00:00.000Z`) } },
            orderBy: { localDate: "asc" },
            select: { localDate: true, tmaxC: true, tminC: true, precipMm: true },
          });
          const series = mapRecordsToLocalDaily(
            primaryRows.map((r) => ({ sourceDate: r.localDate.toISOString().slice(0, 10), tmaxC: r.tmaxC == null ? null : Number(r.tmaxC), tminC: r.tminC == null ? null : Number(r.tminC), precipMm: r.precipMm == null ? null : Number(r.precipMm), rhMaxPct: null, rhMinPct: null })),
            "MIDNIGHT_LOCAL",
          );
          const alerts = detectWeatherAlertsCore(series);
          summary.alerts += alerts.length;
        } catch (e) {
          summary.errors.push({ tenantId, vineyardId: v.id, error: (e as Error).message });
        }
      }
    });
  }
  return summary;
}
