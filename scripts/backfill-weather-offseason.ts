// Plan 096 Phase 1 Unit 7 — ONE-TIME seed: existing vineyards' weather history was stored
// season-only (pre-U6), so their recent winters are missing and a January rainfall window would be
// empty. Re-run the (now year-round-aware) recent-history backfill for every vineyard that already
// has weather. Idempotent — the (tenantId,vineyardId,localDate,providerKey) upsert absorbs re-runs;
// going forward the sweep's monthly top-up keeps this fresh, so this script never needs to run twice.
//
// Run from a checkout WITH .env:  npm run backfill:weather-offseason

import { prisma } from "@/lib/prisma";
import { runAsTenant } from "@/lib/tenant/context";
import { listAllOrgIds } from "@/lib/accounting/enumerator";
import { resolveVineyardCentroid } from "@/lib/weather/location";
import { backfillVineyardGridmetHistory } from "@/lib/weather/backfill-core";
import { seasonYearFor } from "@/lib/weather/season-core";
import { FULL_YEAR_WINDOW_YEARS } from "@/lib/weather/backfill-window-core";

async function main() {
  const orgIds = await listAllOrgIds();
  let totalRows = 0;
  for (const tenantId of orgIds) {
    await runAsTenant(tenantId, async () => {
      const withWeather = await prisma.vineyardClimateDaily.groupBy({ by: ["vineyardId"], _count: { _all: true } });
      for (const { vineyardId } of withWeather) {
        const centroid = await resolveVineyardCentroid(vineyardId);
        if (!centroid) {
          console.log(`  ${tenantId}/${vineyardId}: no centroid — skipped`);
          continue;
        }
        const today = new Date().toISOString().slice(0, 10);
        const seasonYear = seasonYearFor(centroid.lat, today);
        try {
          const res = await backfillVineyardGridmetHistory(vineyardId, centroid.lat, centroid.lon, FULL_YEAR_WINDOW_YEARS, seasonYear);
          await prisma.vineyardWeatherConfig.updateMany({ where: { vineyardId }, data: { lastHistoryTopUpAt: new Date() } }).catch(() => {});
          totalRows += res.rowsWritten;
          console.log(`  ${tenantId}/${vineyardId}: ${res.rowsWritten} rows (${res.fromYear}–${res.toYear}, full-year recent ${FULL_YEAR_WINDOW_YEARS})`);
        } catch (e) {
          console.error(`  ${tenantId}/${vineyardId}: FAILED — ${(e as Error).message}`);
        }
      }
    });
  }
  console.log(`\nDone. ${totalRows} rows written/updated across ${orgIds.length} tenants.`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
