import "server-only";

// VI-P8b — backfill many years of historical gridMET (via ACIS GridData grid 21, keyless, back to 1979) so
// the card can show the Winkler LONG-TERM normal + the 10/20-yr average GDD curves. One ACIS request returns
// the whole multi-year range; we keep only the Apr–Oct (NH) growing-season days and bulk-upsert them as
// gridMET FINAL rows. No config change (the primary source is unaffected) and no live-provider quota churn.

import { Prisma } from "@prisma/client";
import { requireTenantId } from "@/lib/tenant/context";
import { runInTenantTx } from "@/lib/tenant/tx";
import { gridmetProvider } from "./providers/gridmet";
import { mapSeriesToLocalDaily } from "./obs-time-core";
import { hemisphereFor } from "./season-core";

/** Fetch + store `years` of historical gridMET growing-season days for a vineyard. Returns rows written. */
export async function backfillVineyardGridmetHistory(
  vineyardId: string,
  lat: number,
  lon: number,
  years: number,
  currentYear: number,
): Promise<{ rowsWritten: number; fromYear: number; toYear: number }> {
  if (gridmetProvider.coverageFor(lat, lon) === "UNAVAILABLE") {
    // Non-CONUS: gridMET history isn't available; caller falls back to whatever live history exists.
    return { rowsWritten: 0, fromYear: currentYear, toYear: currentYear };
  }
  const nh = hemisphereFor(lat) === "N";
  const fromYear = currentYear - years;
  const toYear = currentYear - 1; // complete past seasons only
  // NH season Apr–Oct sits in one calendar year; SH crosses, so widen the fetch window and filter by month.
  const startIso = `${fromYear}-01-01`;
  const endIso = `${toYear + (nh ? 0 : 1)}-12-31`;

  const series = await gridmetProvider.fetchDailySeries(lat, lon, startIso, endIso);
  // Keep only growing-season months (NH Apr–Oct = 4..10; SH Oct–Apr = 10,11,12,1,2,3,4).
  const inSeasonMonth = (m: number) => (nh ? m >= 4 && m <= 10 : m >= 10 || m <= 4);
  const seasonRecords = series.records.filter((r) => inSeasonMonth(Number(r.sourceDate.slice(5, 7))));
  const local = mapSeriesToLocalDaily({ ...series, records: seasonRecords });

  const tenantId = requireTenantId();
  const provenanceBase = JSON.stringify({
    providerKey: "gridmet",
    obsConvention: series.obsConvention,
    resolutionM: series.resolutionM,
    attribution: series.attribution,
    sourceUrl: series.sourceUrl,
    backfill: true,
  });
  const tuples: Prisma.Sql[] = [];
  for (const r of local) {
    if (r.tmaxC === null && r.tminC === null && r.precipMm === null) continue;
    tuples.push(
      Prisma.sql`(gen_random_uuid()::text, ${tenantId}, ${vineyardId}, ${r.localDate}::date, 'gridmet',
        ${r.tmaxC}::decimal, ${r.tminC}::decimal, ${r.precipMm}::decimal, null::decimal, null::decimal,
        'FINAL', ${provenanceBase}::jsonb, now(), now())`,
    );
  }
  if (tuples.length === 0) return { rowsWritten: 0, fromYear, toYear };

  await runInTenantTx(
    async (tx) => {
      const BATCH = 1_000;
      for (let i = 0; i < tuples.length; i += BATCH) {
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO "vineyard_climate_daily"
            ("id","tenantId","vineyardId","localDate","providerKey","tmaxC","tminC","precipMm","rhMaxPct","rhMinPct","dataStatus","provenance","createdAt","updatedAt")
          VALUES ${Prisma.join(tuples.slice(i, i + BATCH))}
          ON CONFLICT ("tenantId","vineyardId","localDate","providerKey") DO UPDATE SET
            "tmaxC"=EXCLUDED."tmaxC","tminC"=EXCLUDED."tminC","precipMm"=EXCLUDED."precipMm",
            "dataStatus"=EXCLUDED."dataStatus","provenance"=EXCLUDED."provenance","updatedAt"=now()`);
      }
    },
    { timeout: 30_000, maxWait: 10_000 },
  );
  return { rowsWritten: tuples.length, fromYear, toYear };
}
