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
import { getWineryTimeZone } from "@/lib/settings/data";
import { ingestVineyardWeatherCore } from "./ingest-core";
import { backfillVineyardGridmetHistory } from "./backfill-core";
import { resolveVineyardCentroid } from "./location";
import { seasonYearFor } from "./season-core";
import { addDaysIso } from "./obs-time-core";
import { FULL_YEAR_WINDOW_YEARS, HISTORY_TOP_UP_DAYS, ROLLING_INGEST_DAYS } from "./backfill-window-core";
import { resolveSiteTimeZone, siteTodayIso } from "./site-time-core";
import { mapRecordsToLocalDaily } from "./obs-time-core";
import { detectWeatherAlertsCore } from "./alert-core";

/** Cap on NEW vineyards primed per run (each does a live fetch + a 20-yr backfill). The rest catch up next run. */
const PRIME_CAP_PER_RUN = 30;

export interface WeatherSweepSummary {
  tenants: number;
  vineyardsRefreshed: number;
  vineyardsPrimed: number;
  /** Monthly recent-history re-backfills run this sweep (plan 096 U6 — keeps 13–24-month rainfall coverage alive). */
  historyTopUps: number;
  rowsWritten: number;
  alerts: number;
  errors: Array<{ tenantId: string; vineyardId: string; error: string }>;
}

export async function runWeatherSweep(): Promise<WeatherSweepSummary> {
  const orgIds = await listAllOrgIds();
  const summary: WeatherSweepSummary = { tenants: 0, vineyardsRefreshed: 0, vineyardsPrimed: 0, historyTopUps: 0, rowsWritten: 0, alerts: 0, errors: [] };
  let primedThisRun = 0;

  for (const tenantId of orgIds) {
    summary.tenants += 1;
    await runAsTenant(tenantId, async () => {
      const vineyards = await prisma.vineyard.findMany({ where: { isActive: true }, select: { id: true, weatherAutoRefresh: true } });
      // Site-local "today" per vineyard (plan 096 U2): config tz → tenant AppSettings tz → UTC.
      const wineryTz = await getWineryTimeZone().catch(() => null);
      const configByVineyard = new Map(
        (await prisma.vineyardWeatherConfig.findMany({ select: { vineyardId: true, timeZone: true, lastHistoryTopUpAt: true } })).map((c) => [c.vineyardId, c]),
      );

      for (const v of vineyards) {
        try {
          const cfg = configByVineyard.get(v.id);
          const today = siteTodayIso(resolveSiteTimeZone(cfg?.timeZone, wineryTz));
          const hasWeather = (await prisma.vineyardClimateDaily.findFirst({ where: { vineyardId: v.id }, select: { id: true } })) !== null;

          // ── PRIME: a located vineyard with no weather yet ──
          if (!hasWeather) {
            if (primedThisRun >= PRIME_CAP_PER_RUN) continue; // budget for this run spent; catches up next run
            const centroid = await resolveVineyardCentroid(v.id);
            if (!centroid) continue; // no location (no pin / geometry) → nothing to fetch against
            const seasonYear = seasonYearFor(centroid.lat, today);
            // Rolling window (plan 096 U6) — the current season PLUS the recent off-season (rainfall).
            const startIso = addDaysIso(today, -ROLLING_INGEST_DAYS);
            const res = await ingestVineyardWeatherCore({ vineyardId: v.id, lat: centroid.lat, lon: centroid.lon, startIso, endIso: today });
            await backfillVineyardGridmetHistory(v.id, centroid.lat, centroid.lon, 20, seasonYear).catch(() => ({ rowsWritten: 0 }));
            await prisma.vineyardWeatherConfig.updateMany({ where: { vineyardId: v.id }, data: { lastHistoryTopUpAt: new Date() } }).catch(() => {});
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
          const startIso = addDaysIso(today, -ROLLING_INGEST_DAYS);
          const res = await ingestVineyardWeatherCore({ vineyardId: v.id, lat: centroid.lat, lon: centroid.lon, startIso, endIso: today });
          summary.vineyardsRefreshed += 1;
          summary.rowsWritten += res.rowsWritten;

          // Monthly history TOP-UP (plan 096 U6, council S3): the rolling window alone decays the
          // 13–24-month rainfall coverage as the calendar advances. The recent-N-year backfill is
          // idempotent and ~one request per provider, so re-run it monthly per vineyard.
          const topUpDue =
            !cfg?.lastHistoryTopUpAt || Date.now() - cfg.lastHistoryTopUpAt.getTime() > HISTORY_TOP_UP_DAYS * 86_400_000;
          if (topUpDue) {
            await backfillVineyardGridmetHistory(v.id, centroid.lat, centroid.lon, FULL_YEAR_WINDOW_YEARS, seasonYear).catch(() => ({ rowsWritten: 0 }));
            await prisma.vineyardWeatherConfig.updateMany({ where: { vineyardId: v.id }, data: { lastHistoryTopUpAt: new Date() } }).catch(() => {});
            summary.historyTopUps += 1;
          }

          // Forecast retention (plan 096 U15): past target-dates are dead weight — prune anything
          // older than yesterday (site-local). Accuracy history is a deliberate Later (own table).
          await prisma.vineyardForecastDaily
            .deleteMany({ where: { vineyardId: v.id, targetDate: { lt: new Date(`${addDaysIso(today, -1)}T00:00:00.000Z`) } } })
            .catch(() => {});
          // Plan 097 U3: the hourly slots prune on the same boundary.
          await prisma.vineyardForecastHourly
            .deleteMany({ where: { vineyardId: v.id, localDate: { lt: new Date(`${addDaysIso(today, -1)}T00:00:00.000Z`) } } })
            .catch(() => {});

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
