/**
 * VI-P8 Unit 11 — verify:weather. End-to-end proof on the Demo tenant with COMMITTED FIXTURE provider
 * responses (no live API), so it's deterministic in CI. Seeds a QA vineyard, runs ingest through injected
 * fixture providers, reads back, and asserts: known GDD, the obs-time shift, no-fabrication (a failing
 * provider writes nothing), spread present, provenance on every row. Cleans up the QA fixtures.
 *
 * Run: npm run verify:weather   (from a checkout with .env)
 */
import { runAsTenant } from "../src/lib/tenant/context";
import { prisma } from "../src/lib/prisma";
import { ingestVineyardWeatherCore } from "../src/lib/weather/ingest-core";
import { composeClimateSummaryCore, type DailyRow } from "../src/lib/weather/read-core";
import type { ClimateProvider, DailyRecord, ProviderSeries } from "../src/lib/weather/providers/types";

const DEMO = "org_demo_winery";
const LAT = 38.5;
const LON = -122.8;
const START = "2026-06-01";
const END = "2026-06-05";

let failures = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`  ✓ ${name}`);
  else {
    failures += 1;
    console.log(`  ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`);
  }
}

// Fixture series builders (deterministic).
function grid(key: "gridmet" | "nasa_power", tmax: number, tmin: number): ProviderSeries {
  const records: DailyRecord[] = [];
  for (let d = 1; d <= 5; d++) records.push({ sourceDate: `2026-06-0${d}`, tmaxC: tmax, tminC: tmin, precipMm: 0, rhMaxPct: null, rhMinPct: null });
  return { providerKey: key, kind: "grid", obsConvention: "MIDNIGHT_LOCAL", resolutionM: key === "gridmet" ? 4000 : 50000, attribution: `${key} fixture`, sourceUrl: `fixture://${key}`, records };
}
function station(tmax: number, tmin: number): ProviderSeries {
  const records: DailyRecord[] = [];
  for (let d = 1; d <= 5; d++) records.push({ sourceDate: `2026-06-0${d}`, tmaxC: tmax, tminC: tmin, precipMm: 0, rhMaxPct: null, rhMinPct: null });
  return { providerKey: "rcc_acis", kind: "station", obsConvention: "AM_LST", resolutionM: null, attribution: "rcc_acis fixture", sourceUrl: "fixture://rcc_acis", records, stationId: "QA0001", stationName: "QA Fixture Station", stationLat: LAT + 0.02, stationLon: LON + 0.02 };
}

const provider = (key: string, kind: "grid" | "station"): ClimateProvider => ({
  key: key as ClimateProvider["key"],
  kind,
  role: "live",
  obsConvention: kind === "station" ? "AM_LST" : "MIDNIGHT_LOCAL",
  resolutionM: kind === "station" ? null : 4000,
  capabilities: ["tmax", "tmin", "precip"],
  coverageFor: () => "US_HIGH_RES",
  fetchDailySeries: async () => { throw new Error("unused — fetch is injected"); },
});

async function main() {
  await runAsTenant(DEMO, async () => {
    // 1) Seed a QA vineyard.
    const vy = await prisma.vineyard.create({ data: { name: `QA-Weather-${Date.now()}` }, select: { id: true, name: true } });
    console.log(`Seeded ${vy.name} (${vy.id})`);
    try {
      const seriesByKey: Record<string, ProviderSeries> = {
        gridmet: grid("gridmet", 30, 10), // GDD (30+10)/2-10 = 10/day × 5 = 50
        nasa_power: grid("nasa_power", 26, 12), // (26+12)/2-10 = 9/day × 5 = 45
        rcc_acis: station(32, 10),
      };
      const providers: ClimateProvider[] = [provider("gridmet", "grid"), provider("rcc_acis", "station"), provider("nasa_power", "grid")];

      // 2) Ingest through injected fixtures.
      const res = await ingestVineyardWeatherCore(
        { vineyardId: vy.id, lat: LAT, lon: LON, startIso: START, endIso: END },
        { providers, fetchSeries: async (p) => seriesByKey[p.key], fetchElevationM: async () => 100 },
      );
      check("ingest succeeded for 3 providers", res.providersSucceeded.length === 3, res.providersSucceeded);
      check("primary is the nearby station", res.primaryProviderKey === "rcc_acis", res.primaryProviderKey);

      // 3) Read back + compose.
      const rows = await prisma.vineyardClimateDaily.findMany({ where: { vineyardId: vy.id }, orderBy: { localDate: "asc" } });
      const gm = rows.filter((r) => r.providerKey === "gridmet");
      const st = rows.filter((r) => r.providerKey === "rcc_acis");
      check("gridmet wrote 5 rows", gm.length === 5, gm.length);
      check("station obs-shift added a day (6 local dates from 5 records)", st.length === 6, st.length);
      check("every row carries provenance", rows.every((r) => r.provenance && typeof r.provenance === "object"), rows[0]?.provenance);

      const dec = (v: unknown) => (v == null ? null : Number(v));
      const dr: DailyRow[] = rows.map((r) => ({ providerKey: r.providerKey, localDate: r.localDate.toISOString().slice(0, 10), tmaxC: dec(r.tmaxC), tminC: dec(r.tminC), precipMm: dec(r.precipMm), rhMaxPct: dec(r.rhMaxPct), rhMinPct: dec(r.rhMinPct) }));
      const cfg = await prisma.vineyardWeatherConfig.findFirst({ where: { vineyardId: vy.id } });
      const summary = composeClimateSummaryCore({
        vineyardId: vy.id, rows: dr, latitude: LAT, today: END,
        config: { primaryProviderKey: cfg!.primaryProviderKey, primaryProviderOverride: cfg!.primaryProviderOverride, coverageState: cfg!.coverageState, stationId: cfg!.stationId, stationName: cfg!.stationName, stationDistanceM: dec(cfg!.stationDistanceM), stationElevationDeltaM: dec(cfg!.stationElevationDeltaM), siteElevationM: dec(cfg!.siteElevationM), attribution: cfg!.attribution, lastRefreshAt: null },
      });
      const gmSrc = summary.perSource.find((p) => p.provider === "gridmet");
      const npSrc = summary.perSource.find((p) => p.provider === "nasa_power");
      check("gridmet season GDD = 50 (hand-computed)", gmSrc?.seasonGddC === 50, gmSrc);
      check("nasa_power season GDD = 45 (hand-computed)", npSrc?.seasonGddC === 45, npSrc);
      check("spread present, is a range not a mean", !!summary.spread && !("mean" in (summary.spread as object)), summary.spread);
      check("per-source completeness reported", summary.perSource.every((p) => typeof p.completenessPct === "number"), summary.perSource);

      // 4) No-fabrication: a failing primary provider writes NO rows for itself; others survive.
      const vy2 = await prisma.vineyard.create({ data: { name: `QA-Weather-fail-${Date.now()}` }, select: { id: true } });
      try {
        const res2 = await ingestVineyardWeatherCore(
          { vineyardId: vy2.id, lat: LAT, lon: LON, startIso: START, endIso: END },
          {
            providers,
            fetchSeries: async (p) => { if (p.key === "nasa_power") throw new Error("simulated provider outage"); return seriesByKey[p.key]; },
            fetchElevationM: async () => 100,
          },
        );
        const npRows = await prisma.vineyardClimateDaily.count({ where: { vineyardId: vy2.id, providerKey: "nasa_power" } });
        const gmRows = await prisma.vineyardClimateDaily.count({ where: { vineyardId: vy2.id, providerKey: "gridmet" } });
        check("failed provider wrote NO rows (no fabrication)", npRows === 0, npRows);
        check("other providers still landed", gmRows === 5, gmRows);
        check("failure recorded, not swallowed silently", res2.providersFailed.some((f) => f.provider === "nasa_power"), res2.providersFailed);
      } finally {
        await prisma.vineyardClimateDaily.deleteMany({ where: { vineyardId: vy2.id } });
        await prisma.vineyardWeatherConfig.deleteMany({ where: { vineyardId: vy2.id } });
        await prisma.vineyard.delete({ where: { id: vy2.id } });
      }
    } finally {
      // Cleanup the QA fixtures.
      await prisma.vineyardClimateDaily.deleteMany({ where: { vineyardId: vy.id } });
      await prisma.vineyardWeatherConfig.deleteMany({ where: { vineyardId: vy.id } });
      await prisma.weatherProviderUsage.deleteMany({ where: {} }).catch(() => {});
      await prisma.vineyard.delete({ where: { id: vy.id } });
      console.log("Cleaned up QA fixtures.");
    }
  });
  await prisma.$disconnect();
  console.log(failures === 0 ? "\n✓ verify:weather PASSED" : `\n✗ verify:weather FAILED (${failures})`);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch((e) => { console.error("verify:weather ERROR", e); process.exit(1); });
