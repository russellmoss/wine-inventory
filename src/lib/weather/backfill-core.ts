import "server-only";

// VI-P8b — backfill many years of historical daily weather so the card can show the Winkler LONG-TERM normal
// + the 10/20-yr average GDD curves. In CONUS this is gridMET (4 km, via ACIS GridData grid 21, keyless);
// OUTSIDE the US it's the Open-Meteo ERA5 archive (global, keyless, elevation-downscaled to the site) — so a
// site like Bhutan still gets a long-term normal + graph. One request returns the whole multi-year range; we
// keep only the growing-season days and bulk-upsert them as FINAL rows under the chosen provider's key.
//
// This used to be NASA POWER, which reports its ~50 km cell's MEAN elevation. The Winkler NORMAL is computed
// from exactly these rows, and at the Bhutan vineyards that cell sits 1.0–1.8 km above the vines — so the
// most authoritative-looking number on the card (the 20-yr Winkler region) was the most wrong one, showing
// Region I at a Region V site (docs/analysis/bhutan-nasa-power-elevation-bias.md).

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireTenantId } from "@/lib/tenant/context";
import { runInTenantTx } from "@/lib/tenant/tx";
import { gridmetProvider } from "./providers/gridmet";
import { openMeteoArchiveProvider } from "./providers/open-meteo-archive";
import { mapSeriesToLocalDaily } from "./obs-time-core";
import { hemisphereFor } from "./season-core";
import { keepBackfillDay } from "./backfill-window-core";

/** Fetch + store `years` of historical growing-season days for a vineyard (gridMET in US, else ERA5). */
export async function backfillVineyardGridmetHistory(
  vineyardId: string,
  lat: number,
  lon: number,
  years: number,
  currentYear: number,
): Promise<{ rowsWritten: number; fromYear: number; toYear: number }> {
  // gridMET (4 km) where it covers; the elevation-corrected ERA5 archive everywhere else.
  const provider = gridmetProvider.coverageFor(lat, lon) !== "UNAVAILABLE" ? gridmetProvider : openMeteoArchiveProvider;
  // The downscale target for the archive. Read here rather than threaded through four call sites — a
  // missing value is fine (Open-Meteo falls back to its own 90 m DEM at the point).
  const siteElevationM =
    provider === openMeteoArchiveProvider
      ? Number(
          (await prisma.vineyardWeatherConfig.findFirst({ where: { vineyardId }, select: { siteElevationM: true } }))
            ?.siteElevationM ?? NaN,
        )
      : NaN;
  const nh = hemisphereFor(lat) === "N";
  const fromYear = currentYear - years;
  const toYear = currentYear - 1; // complete past seasons only
  // NH season Apr–Oct sits in one calendar year; SH crosses, so widen the fetch window and filter by month.
  const startIso = `${fromYear}-01-01`;
  const endIso = `${toYear + (nh ? 0 : 1)}-12-31`;

  const series = await provider.fetchDailySeries(lat, lon, startIso, endIso, {
    siteElevationM: Number.isFinite(siteElevationM) ? siteElevationM : null,
  });
  // Plan 096 U6: FULL-YEAR days for the recent FULL_YEAR_WINDOW_YEARS (rainfall needs winter),
  // growing-season months only beyond (the normals never read off-season). One pure decision.
  const keptRecords = series.records.filter((r) => keepBackfillDay(r.sourceDate, toYear, nh));
  const local = mapSeriesToLocalDaily({ ...series, records: keptRecords });

  const tenantId = requireTenantId();
  const provenanceBase = JSON.stringify({
    providerKey: provider.key,
    obsConvention: series.obsConvention,
    resolutionM: series.resolutionM,
    attribution: series.attribution,
    sourceUrl: series.sourceUrl,
    backfill: true,
    sourceElevationM: series.sourceElevationM ?? null,
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
