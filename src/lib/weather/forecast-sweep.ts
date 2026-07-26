import "server-only";

// Plan 096 Phase 2 Unit 15 — the forecast sweep (cron `/api/cron/forecast-poll`, DAILY on the
// Vercel Hobby cron allowance — sub-daily schedules fail DEPLOYMENT there; the strip's on-view
// refresh at issuedAt > 6 h carries intra-day freshness, and `10 */6 * * *` can be restored on a
// Pro plan). Enumerates
// tenants → every active vineyard with a resolvable location gets its 7-day forecast replaced
// (idempotent delete-then-insert per provider — a double run is safe). Per-vineyard failures land
// in the summary, never abort the sweep. Volume: ~13 vineyards × ≤3 requests × 4 runs/day ≈
// 150 calls/day — far under every provider limit.

import { prisma } from "@/lib/prisma";
import { runAsTenant } from "@/lib/tenant/context";
import { listAllOrgIds } from "@/lib/accounting/enumerator";
import { resolveVineyardCentroid } from "./location";
import { ingestVineyardForecastCore } from "./forecast-ingest-core";
import { emitForecastAlertsForTenant } from "./alert-emit";
import type { NwsGrid } from "./providers/forecast-nws";

export interface ForecastSweepSummary {
  tenants: number;
  vineyardsForecasted: number;
  rowsWritten: number;
  /** Plan 096 U21 — digest + all-clear notifications sent this run (claim-first, so re-runs stay 0). */
  digestsSent: number;
  allClearsSent: number;
  errors: Array<{ tenantId: string; vineyardId: string; error: string }>;
}

export async function runForecastSweep(): Promise<ForecastSweepSummary> {
  const orgIds = await listAllOrgIds();
  const summary: ForecastSweepSummary = { tenants: 0, vineyardsForecasted: 0, rowsWritten: 0, digestsSent: 0, allClearsSent: 0, errors: [] };

  for (const tenantId of orgIds) {
    summary.tenants += 1;
    await runAsTenant(tenantId, async () => {
      const vineyards = await prisma.vineyard.findMany({ where: { isActive: true }, select: { id: true } });
      const configs = new Map(
        (
          await prisma.vineyardWeatherConfig.findMany({
            select: { vineyardId: true, siteElevationM: true, nwsGridId: true, nwsGridX: true, nwsGridY: true, timeZone: true },
          })
        ).map((c) => [c.vineyardId, c]),
      );

      for (const v of vineyards) {
        try {
          const centroid = await resolveVineyardCentroid(v.id);
          if (!centroid) continue; // no location → nothing to forecast against
          const cfg = configs.get(v.id);
          const grid: NwsGrid | null =
            cfg?.nwsGridId && cfg.nwsGridX !== null && cfg.nwsGridY !== null
              ? { gridId: cfg.nwsGridId, gridX: cfg.nwsGridX!, gridY: cfg.nwsGridY!, timeZone: cfg.timeZone ?? null }
              : null;
          const res = await ingestVineyardForecastCore({
            vineyardId: v.id,
            lat: centroid.lat,
            lon: centroid.lon,
            elevationM: cfg?.siteElevationM === null || cfg?.siteElevationM === undefined ? null : Number(cfg.siteElevationM),
            nwsGrid: grid,
          });
          summary.vineyardsForecasted += 1;
          summary.rowsWritten += res.rowsWritten;
        } catch (e) {
          summary.errors.push({ tenantId, vineyardId: v.id, error: (e as Error).message });
        }
      }

      // Alerts AFTER the tenant's forecasts are fresh (plan 096 U21): classify the primary series,
      // claim-first, digest per (night, tier), all-clears. A failure here never blocks other tenants.
      try {
        const alerts = await emitForecastAlertsForTenant();
        summary.digestsSent += alerts.digestsSent;
        summary.allClearsSent += alerts.allClearsSent;
      } catch (e) {
        summary.errors.push({ tenantId, vineyardId: "(alert-emit)", error: (e as Error).message });
      }
    });
  }
  return summary;
}
