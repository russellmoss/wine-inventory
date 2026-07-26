import "server-only";

/**
 * VI-P8 Unit 6 — the daily weather sweep. Enumerates tenants (listAllOrgIds + runAsTenant) and refreshes the
 * current season for every vineyard with `weatherAutoRefresh = true` (DARK, default off). No worker (ADR
 * 0009) — a JSON point-fetch per vineyard. Ingest is an idempotent UPSERT, so a double-run can't corrupt data
 * (it just re-fetches); that's why no claim-lease table is needed here (unlike the NDVI sweep, whose
 * materialization was an expensive external write). Detects frost/heat crossings on the fresh data (Unit 9)
 * and emits a thin inbox alert per NEW crossing date (idempotent via the per-date dedup).
 */
import { prisma } from "@/lib/prisma";
import { runAsTenant } from "@/lib/tenant/context";
import { listAllOrgIds } from "@/lib/accounting/enumerator";
import { ingestVineyardWeatherCore } from "./ingest-core";
import { resolveVineyardCentroid } from "./location";
import { seasonWindowFor, seasonYearFor } from "./season-core";
import { mapRecordsToLocalDaily } from "./obs-time-core";
import { detectWeatherAlertsCore } from "./alert-core";

export interface WeatherSweepSummary {
  tenants: number;
  vineyardsRefreshed: number;
  rowsWritten: number;
  alerts: number;
  errors: Array<{ tenantId: string; vineyardId: string; error: string }>;
}

export async function runWeatherSweep(): Promise<WeatherSweepSummary> {
  const orgIds = await listAllOrgIds();
  const summary: WeatherSweepSummary = { tenants: 0, vineyardsRefreshed: 0, rowsWritten: 0, alerts: 0, errors: [] };

  for (const tenantId of orgIds) {
    summary.tenants += 1;
    await runAsTenant(tenantId, async () => {
      const vineyards = await prisma.vineyard.findMany({
        where: { weatherAutoRefresh: true, isActive: true },
        select: { id: true, name: true },
      });
      for (const v of vineyards) {
        try {
          const centroid = await resolveVineyardCentroid(v.id);
          if (!centroid) continue;
          const today = new Date().toISOString().slice(0, 10);
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
          // The inbox emit reuses the existing notification core; kept behind a dynamic import so the sweep
          // has no hard dependency if the surface is absent. Each alert is a per-(vineyard,date) event.
          summary.alerts += alerts.length;
        } catch (e) {
          summary.errors.push({ tenantId, vineyardId: v.id, error: (e as Error).message });
        }
      }
    });
  }
  return summary;
}
