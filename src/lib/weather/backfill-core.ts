import "server-only";

// VI-P8b — backfill many years of historical daily weather so the card can show the Winkler LONG-TERM normal
// + the 10/20-yr average GDD curves. In CONUS this is gridMET (4 km, via ACIS GridData grid 21, keyless);
// OUTSIDE the US it's NASA POWER (global, ~50 km, keyless, 1981–present) — so a site like Bhutan still gets a
// long-term normal + graph. One request returns the whole multi-year range; we keep only the growing-season
// days and bulk-upsert them as FINAL rows under the chosen provider's key. No config change, no quota churn.

import { Prisma } from "@prisma/client";
import { requireTenantId } from "@/lib/tenant/context";
import { runInTenantTx } from "@/lib/tenant/tx";
import { gridmetProvider } from "./providers/gridmet";
import { nasaPowerProvider } from "./providers/nasa-power";
import { mapSeriesToLocalDaily } from "./obs-time-core";
import { hemisphereFor } from "./season-core";

/** Fetch + store `years` of historical growing-season days for a vineyard (gridMET in US, else NASA POWER). */
export async function backfillVineyardGridmetHistory(
  vineyardId: string,
  lat: number,
  lon: number,
  years: number,
  currentYear: number,
): Promise<{ rowsWritten: number; fromYear: number; toYear: number }> {
  // gridMET (4 km) where it covers; NASA POWER (global) everywhere else — the latter never returns UNAVAILABLE.
  const provider = gridmetProvider.coverageFor(lat, lon) !== "UNAVAILABLE" ? gridmetProvider : nasaPowerProvider;
  const nh = hemisphereFor(lat) === "N";
  const fromYear = currentYear - years;
  const toYear = currentYear - 1; // complete past seasons only
  // NH season Apr–Oct sits in one calendar year; SH crosses, so widen the fetch window and filter by month.
  const startIso = `${fromYear}-01-01`;
  const endIso = `${toYear + (nh ? 0 : 1)}-12-31`;

  const series = await provider.fetchDailySeries(lat, lon, startIso, endIso);
  // Keep only growing-season months (NH Apr–Oct = 4..10; SH Oct–Apr = 10,11,12,1,2,3,4).
  const inSeasonMonth = (m: number) => (nh ? m >= 4 && m <= 10 : m >= 10 || m <= 4);
  const seasonRecords = series.records.filter((r) => inSeasonMonth(Number(r.sourceDate.slice(5, 7))));
  const local = mapSeriesToLocalDaily({ ...series, records: seasonRecords });

  const tenantId = requireTenantId();
  const provenanceBase = JSON.stringify({
    providerKey: provider.key,
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
      Prisma.sql`(gen_random_uuid()::text, ${tenantId}, ${vineyardId}, ${r.localDate}::date, ${provider.key},
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
