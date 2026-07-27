/**
 * Backfill-then-enforce: give every non-US vineyard an ELEVATION-CORRECTED daily series.
 *
 * Why (docs/analysis/bhutan-nasa-power-elevation-bias.md): `nasa_power` is a ~50 km grid and returns
 * the temperature of its cell's MEAN elevation. At the Bhutan Wine Co. vineyards that cell sits
 * 1.0–1.8 km above the vines, so the stored series ran 4.8–9.7 °C cold and the grower was shown
 * Winkler Region I at a Region V site, plus spring frost events on nights that were ~12 °C.
 *
 * What this does, per vineyard, in order (AGENTS.md: on a live tenant it is backfill-then-enforce):
 *   1. resolve + PERSIST the site elevation (the ERA5 downscale target),
 *   2. ingest the recent window through the normal ingest path — which now also fetches the
 *      `open_meteo_archive` series and records each source's own reported elevation,
 *   3. backfill the multi-year history from the same corrected source (the Winkler NORMAL reads it),
 *   4. report the before/after so the flip is auditable.
 *
 * The old `nasa_power` rows are deliberately LEFT IN PLACE. They stop being the headline (the primary
 * flips via the explicit grid preference in source-selection-core) but stay visible in the
 * compare-sources view — the design's R3 stance is that sources are shown side by side, never deleted
 * to make a number look tidy, and keeping them makes this change reversible.
 *
 * Run from the MAIN checkout (needs .env):
 *   npx tsx --env-file=.env scripts/backfill-elevation-corrected-weather.ts [--tenant=org_x] [--apply]
 * Without --apply it is a DRY RUN: it reports what it would do and writes nothing.
 */
import { runAsTenant } from "../src/lib/tenant/context";
import { prisma } from "../src/lib/prisma";
import { ingestVineyardWeatherCore } from "../src/lib/weather/ingest-core";
import { backfillVineyardGridmetHistory } from "../src/lib/weather/backfill-core";
import { fetchSiteElevationM } from "../src/lib/weather/providers/open-meteo-elevation";
import { isUsForecastCoverage } from "../src/lib/weather/us-coverage";
import { assessSourceFidelity } from "../src/lib/weather/source-fidelity-core";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const TENANT = (args.find((a) => a.startsWith("--tenant="))?.split("=")[1] ?? "org_bhutan_wine_co").trim();
const HISTORY_YEARS = 20;

const dec = (v: unknown) => (v == null ? null : Number(v));
const f = (n: number | null | undefined, p = 1) => (n === null || n === undefined ? "—" : n.toFixed(p));

async function main() {
  const seasonYear = new Date().getUTCFullYear();
  console.log(`${APPLY ? "APPLY" : "DRY RUN"} · tenant=${TENANT} · history=${HISTORY_YEARS}y\n${"=".repeat(100)}`);

  await runAsTenant(TENANT, async () => {
    const vineyards = await prisma.vineyard.findMany({
      where: { isActive: true },
      select: { id: true, name: true, detail: { select: { gpsLat: true, gpsLng: true, elevationM: true } } },
      orderBy: { name: "asc" },
    });

    for (const v of vineyards) {
      const lat = dec(v.detail?.gpsLat);
      const lon = dec(v.detail?.gpsLng);
      if (lat === null || lon === null) {
        console.log(`\n${v.name}: no GPS pin — skipped`);
        continue;
      }
      if (isUsForecastCoverage(lat, lon)) {
        console.log(`\n${v.name}: US coverage (gridMET/ACIS primary) — not affected, skipped`);
        continue;
      }

      const cfg = await prisma.vineyardWeatherConfig.findFirst({ where: { vineyardId: v.id } });
      const beforeFidelity = assessSourceFidelity({
        siteElevationM: dec(cfg?.siteElevationM) ?? dec(v.detail?.elevationM),
        sourceElevationM: dec(cfg?.primarySourceElevationM),
      });
      console.log(
        `\n${"-".repeat(100)}\n${v.name} @ ${lat}, ${lon}\n` +
          `  BEFORE  primary=${cfg?.primaryProviderKey ?? "—"} override=${cfg?.primaryProviderOverride ?? "—"} ` +
          `siteElev=${f(dec(cfg?.siteElevationM))} sourceElev=${f(dec(cfg?.primarySourceElevationM))} ` +
          `fidelity=${beforeFidelity.band}`,
      );

      // (1) The downscale target. VineyardDetail.elevationM is the recorded fallback when the lookup
      //     is down — better a known-good stored elevation than none (that NULL is why the column was
      //     empty at 7 of 8 Bhutan sites).
      const resolved = (await fetchSiteElevationM(lat, lon).catch(() => null)) ?? dec(cfg?.siteElevationM) ?? dec(v.detail?.elevationM);
      console.log(`  site elevation resolved: ${f(resolved)} m`);

      if (!APPLY) {
        console.log("  (dry run — no writes)");
        continue;
      }

      // (2) Recent window through the normal ingest path.
      const today = new Date().toISOString().slice(0, 10);
      const start = new Date(Date.now() - 400 * 86_400_000).toISOString().slice(0, 10);
      const res = await ingestVineyardWeatherCore(
        { vineyardId: v.id, lat, lon, startIso: start, endIso: today },
        { knownSiteElevationM: resolved },
      );
      console.log(
        `  ingest: primary=${res.primaryProviderKey} rows=${res.rowsWritten} ` +
          `siteElev=${f(res.siteElevationM)} sourceElev=${f(res.primarySourceElevationM)} ` +
          `ok=[${res.providersSucceeded.join(", ")}] failed=[${res.providersFailed.map((p) => p.provider).join(", ")}]`,
      );

      // (3) The multi-year history the Winkler NORMAL is computed from.
      const bf = await backfillVineyardGridmetHistory(v.id, lat, lon, HISTORY_YEARS, seasonYear);
      console.log(`  history backfill: ${bf.rowsWritten} rows, ${bf.fromYear}–${bf.toYear}`);

      // (4) Audit the result.
      const after = await prisma.vineyardWeatherConfig.findFirst({ where: { vineyardId: v.id } });
      const afterFidelity = assessSourceFidelity({
        siteElevationM: dec(after?.siteElevationM),
        sourceElevationM: dec(after?.primarySourceElevationM),
      });
      const counts = await prisma.vineyardClimateDaily.groupBy({
        by: ["providerKey"],
        where: { vineyardId: v.id },
        _count: { _all: true },
      });
      console.log(
        `  AFTER   primary=${after?.primaryProviderKey} siteElev=${f(dec(after?.siteElevationM))} ` +
          `sourceElev=${f(dec(after?.primarySourceElevationM))} fidelity=${afterFidelity.band} ` +
          `classify=${afterFidelity.classificationAllowed}`,
      );
      console.log(`  series: ${counts.map((c) => `${c.providerKey}=${c._count._all}`).join(" · ")}`);
      if (afterFidelity.band === "UNUSABLE") {
        console.log(`  ⚠️  STILL UNUSABLE — classifications will be withheld: ${afterFidelity.reason}`);
      }
      // Be a good citizen on Open-Meteo's free tier: two heavy multi-year requests per vineyard,
      // and the archive 429s if a fleet is walked back-to-back.
      await new Promise((r) => setTimeout(r, 5_000));
    }
  });

  if (!APPLY) console.log(`\n${"=".repeat(100)}\nDry run complete. Re-run with --apply to write.`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
