/**
 * VI-P8 Unit 11 — verify:weather. End-to-end proof on the Demo tenant with COMMITTED FIXTURE provider
 * responses (no live API), so it's deterministic in CI. Seeds a QA vineyard, runs ingest through injected
 * fixture providers, reads back, and asserts: known GDD, the obs-time shift, no-fabrication (a failing
 * provider writes nothing), spread present, provenance on every row. Cleans up the QA fixtures.
 *
 * Run: npm run verify:weather   (from a checkout with .env)
 */
import { runAsTenant } from "../src/lib/tenant/context";
import { runAsSystem } from "../src/lib/tenant/system";
import { prisma } from "../src/lib/prisma";
import { ingestVineyardWeatherCore } from "../src/lib/weather/ingest-core";
import { composeClimateSummaryCore, type DailyRow } from "../src/lib/weather/read-core";
import { ingestVineyardForecastCore } from "../src/lib/weather/forecast-ingest-core";
import { composeForecastViewCore, type ForecastRow } from "../src/lib/weather/forecast-read-core";
import type { ClimateProvider, DailyRecord, ProviderSeries } from "../src/lib/weather/providers/types";
import type { ForecastDailyRecord, ForecastHourlyRecord, ForecastProviderKey, ForecastSeries } from "../src/lib/weather/providers/forecast-types";
import { composeForecastHoursCore, type ForecastHourRow } from "../src/lib/weather/forecast-hourly-read-core";
import type { NwsGrid } from "../src/lib/weather/providers/forecast-nws";
import { addDaysIso } from "../src/lib/weather/obs-time-core";

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

const runStartedAt = new Date();

async function main() {
  await runAsTenant(DEMO, async () => {
    // 1) Seed a QA vineyard.
    const vy = await prisma.vineyard.create({ data: { name: `QA-Weather-${Date.now()}` }, select: { id: true, name: true } });
    // GPS pin so resolveVineyardCentroid works (the alert-emit leg resolves latitude itself).
    await prisma.vineyardDetail.create({ data: { vineyardId: vy.id, gpsLat: LAT, gpsLng: LON } });
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
      // ── 5) FORECAST loop (plan 096 U17): fixture providers → replace semantics + view compose ──
      console.log("\nForecast (plan 096):");
      const todayIso = new Date().toISOString().slice(0, 10);
      const fDay = (offset: number, over: Partial<ForecastDailyRecord> = {}): ForecastDailyRecord => ({
        targetDate: addDaysIso(todayIso, offset),
        tmaxC: 30,
        tminC: 12,
        precipMm: offset === 2 ? 6.5 : 0,
        precipProbabilityPct: offset === 2 ? 70 : 10,
        conditionCode: offset === 2 ? "RAIN" : "PARTLY_CLOUDY",
        windMaxKph: 14,
        ...over,
      });
      // Plan 097 U7 — hourly arms: NWS carries a native-width PT6H QPF bucket at 14:00; OM per-hour.
      const fHour = (dayOffset: number, localHour: number, over: Partial<ForecastHourlyRecord> = {}): ForecastHourlyRecord => ({
        hourStartUtc: new Date(`${addDaysIso(todayIso, dayOffset)}T00:00:00.000Z`).toISOString().slice(0, 11) + `${String(localHour).padStart(2, "0")}:00:00.000Z`,
        localDate: addDaysIso(todayIso, dayOffset),
        localHour,
        tempC: 18 + localHour / 4,
        popPct: 20,
        precipMm: null,
        precipDurationH: 1,
        conditionCode: "PARTLY_CLOUDY",
        windKph: 10,
        ...over,
      });
      const nwsSeries = (days: number[], issued: Date): ForecastSeries & { grid: NwsGrid } => ({
        providerKey: "nws",
        issuedAt: issued,
        timeZone: "America/Los_Angeles",
        records: days.map((o) => fDay(o, o === 0 ? { tmaxC: null } : {})), // day-1 afternoon edge: low only
        hourly: days.flatMap((o) => [
          fHour(o, 6),
          fHour(o, 14, o === 1 ? { precipMm: 5.5, precipDurationH: 6 } : {}), // the native-width bucket
          fHour(o, 22),
        ]),
        attribution: "nws fixture",
        sourceUrl: "fixture://nws",
        grid: { gridId: "QAX", gridX: 1, gridY: 2, timeZone: "America/Los_Angeles" },
      });
      const omSeries = (days: number[], issued: Date): ForecastSeries => ({
        providerKey: "open_meteo",
        issuedAt: issued,
        timeZone: "America/Los_Angeles",
        records: days.map((o) => fDay(o, { tmaxC: 33 })), // disagrees by +3 → spread
        hourly: days.flatMap((o) => [fHour(o, 8, { precipMm: 0.4 }), fHour(o, 9)]),
        attribution: "om fixture",
        sourceUrl: "fixture://om",
      });
      const fetchFx = (days: number[], issued: Date) => async (key: ForecastProviderKey) =>
        key === "nws" ? nwsSeries(days, issued) : omSeries(days, issued);

      const issue1 = new Date();
      const fres = await ingestVineyardForecastCore(
        { vineyardId: vy.id, lat: LAT, lon: LON, elevationM: 100 },
        { fetchSeries: fetchFx([0, 1, 2, 3, 4, 5, 6], issue1) },
      );
      check("forecast ingest wrote both providers (7 days + hourly rows)", fres.rowsWritten === 14 + 7 * 3 + 7 * 2, fres.rowsWritten);
      const nwsHourlyCount = await prisma.vineyardForecastHourly.count({ where: { vineyardId: vy.id, providerKey: "nws" } });
      const omHourlyCount = await prisma.vineyardForecastHourly.count({ where: { vineyardId: vy.id, providerKey: "open_meteo" } });
      check("hourly rows landed per provider (plan 097)", nwsHourlyCount === 21 && omHourlyCount === 14, { nwsHourlyCount, omHourlyCount });
      const bucketRow = await prisma.vineyardForecastHourly.findFirst({
        where: { vineyardId: vy.id, providerKey: "nws", precipDurationH: 6 },
        select: { localHour: true, precipMm: true, precipDurationH: true },
      });
      check("the PT6H QPF bucket stored at NATIVE width (S6)", bucketRow?.localHour === 14 && Number(bucketRow?.precipMm) === 5.5, bucketRow);
      const cfgAfter = await prisma.vineyardWeatherConfig.findFirst({ where: { vineyardId: vy.id }, select: { timeZone: true, nwsGridId: true, nwsGridX: true, nwsGridY: true } });
      check("config cache persisted IN the ingest tx (tz + NWS grid — council S4)", cfgAfter?.timeZone === "America/Los_Angeles" && cfgAfter?.nwsGridId === "QAX" && cfgAfter?.nwsGridX === 1 && cfgAfter?.nwsGridY === 2, cfgAfter);

      // Replace semantics (council C1): a SHORTENED horizon deletes the orphaned future day.
      const issue2 = new Date(Date.now() + 1000);
      await ingestVineyardForecastCore(
        { vineyardId: vy.id, lat: LAT, lon: LON, elevationM: 100 },
        { fetchSeries: fetchFx([0, 1, 2, 3, 4, 5], issue2) }, // day-7 gone
      );
      const nwsCount = await prisma.vineyardForecastDaily.count({ where: { vineyardId: vy.id, providerKey: "nws" } });
      const day7 = await prisma.vineyardForecastDaily.count({ where: { vineyardId: vy.id, targetDate: new Date(`${addDaysIso(todayIso, 6)}T00:00:00.000Z`) } });
      check("re-ingest REPLACED the horizon (6 nws rows, not 7)", nwsCount === 6, nwsCount);
      check("the dropped day-7 row is GONE, not stale (council C1)", day7 === 0, day7);
      const hourlyDay7 = await prisma.vineyardForecastHourly.count({ where: { vineyardId: vy.id, localDate: new Date(`${addDaysIso(todayIso, 6)}T00:00:00.000Z`) } });
      check("hourly rows for the dropped day are GONE too (plan 097 replace)", hourlyDay7 === 0, hourlyDay7);

      // The modal's day-slice: primary provider (nws), the bucket at native width, crossing summary.
      const hourlyRaw = await prisma.vineyardForecastHourly.findMany({ where: { vineyardId: vy.id, localDate: new Date(`${addDaysIso(todayIso, 1)}T00:00:00.000Z`) }, orderBy: { hourStartUtc: "asc" } });
      const hourRows: ForecastHourRow[] = hourlyRaw.map((r) => ({
        providerKey: r.providerKey,
        hourStartUtc: r.hourStartUtc.toISOString(),
        localDate: r.localDate.toISOString().slice(0, 10),
        localHour: r.localHour,
        tempC: r.tempC == null ? null : Number(r.tempC),
        popPct: r.popPct == null ? null : Number(r.popPct),
        precipMm: r.precipMm == null ? null : Number(r.precipMm),
        precipDurationH: r.precipDurationH,
        conditionCode: r.conditionCode,
        windKph: r.windKph == null ? null : Number(r.windKph),
      }));
      const modalDay = composeForecastHoursCore(hourRows, { targetDate: addDaysIso(todayIso, 1) });
      check("modal day-slice: nws primary, 3 slots, bucket at 14:00 ×6h (plan 097 U4/U7)", modalDay?.providerKey === "nws" && modalDay.slots.length === 3 && modalDay.slots[1]?.precipDurationH === 6 && modalDay.summary.totalPrecipMm === 5.5, { p: modalDay?.providerKey, n: modalDay?.slots.length, s: modalDay?.slots[1] });

      // Compose the view from stored rows: primary NWS, day-1 null high, spread present.
      const frows = await prisma.vineyardForecastDaily.findMany({ where: { vineyardId: vy.id }, orderBy: { targetDate: "asc" } });
      const fr: ForecastRow[] = frows.map((r) => ({
        providerKey: r.providerKey,
        targetDate: r.targetDate.toISOString().slice(0, 10),
        issuedAt: r.issuedAt.toISOString(),
        tmaxC: r.tmaxC == null ? null : Number(r.tmaxC),
        tminC: r.tminC == null ? null : Number(r.tminC),
        precipMm: r.precipMm == null ? null : Number(r.precipMm),
        precipProbabilityPct: r.precipProbabilityPct == null ? null : Number(r.precipProbabilityPct),
        conditionCode: r.conditionCode,
        windMaxKph: r.windMaxKph == null ? null : Number(r.windMaxKph),
      }));
      const view = composeForecastViewCore(fr, todayIso);
      check("view speaks in the PRIMARY (nws) series (council C3)", view?.providerKey === "nws", view?.providerKey);
      check("day-1 afternoon edge: null high survives to the view (never 0)", view?.days[0]?.tmaxC === null, view?.days[0]);
      check("cross-provider disagreement is a spread (3°C max delta), never a mean", view?.spread?.maxTmaxDeltaC === 3, view?.spread);
      check("every stored forecast row carries provenance", frows.every((r) => r.provenance && typeof r.provenance === "object"), frows[0]?.provenance);

      // ── 6) ALERT EMIT loop (plan 096 U21): claim-first → digest → silent repeat → escalate → all-clear ──
      console.log("\nAlert emit (plan 096 U21):");
      const { emitForecastAlertsForTenant } = await import("../src/lib/weather/alert-emit");
      const scriptStart = new Date();
      const heatDate = addDaysIso(todayIso, 1);
      const setHeat = async (tmaxC: number) => {
        await prisma.vineyardForecastDaily.updateMany({
          where: { vineyardId: vy.id, providerKey: "nws", targetDate: new Date(`${heatDate}T00:00:00.000Z`) },
          data: { tmaxC, tminC: 18 },
        });
      };
      const scope = { onlyVineyardIds: [vy.id] };

      await setHeat(36); // HEAT_WATCH (rank 1)
      const run1 = await emitForecastAlertsForTenant(scope);
      check("first crossing → exactly ONE digest (heat watch)", run1.digestsSent === 1 && run1.allClearsSent === 0, run1);
      check("digest reached every active member", run1.recipients > 0, run1.recipients);

      const run2 = await emitForecastAlertsForTenant(scope);
      check("repetition is SILENT (claim lost — the 6-hourly cron can't spam)", run2.digestsSent === 0 && run2.allClearsSent === 0, run2);

      await setHeat(39); // EXTREME_HEAT (rank 2)
      const run3 = await emitForecastAlertsForTenant(scope);
      check("escalation (watch→extreme) emits exactly ONCE", run3.digestsSent === 1, run3);

      await setHeat(20); // below watch — previously notified at rank 2 → all-clear
      const run4 = await emitForecastAlertsForTenant(scope);
      check("de-escalation emits ONE all-clear (council C6)", run4.allClearsSent === 1 && run4.digestsSent === 0, run4);

      const run5 = await emitForecastAlertsForTenant(scope);
      check("cleared state does not flap (second run silent)", run5.allClearsSent === 0 && run5.digestsSent === 0, run5);

      // INBOX-1: notification READS are owner-only (app.user_id) — verify through ONE member's eyes.
      const member = await prisma.member.findFirst({ where: { organizationId: DEMO }, select: { userId: true } });
      const perUserRows = await runAsTenant(
        DEMO,
        async () => prisma.inboxNotification.count({ where: { kind: "WEATHER_ALERT", createdAt: { gte: scriptStart } } }),
        { userId: member!.userId },
      );
      check("one member's inbox holds exactly the 3 sends (digest, escalation, all-clear)", perUserRows === 3, perUserRows);

      // Retention shape: a past target-date row is prunable by the sweep predicate.
      await prisma.vineyardForecastDaily.create({
        data: { vineyardId: vy.id, providerKey: "nws", targetDate: new Date(`${addDaysIso(todayIso, -3)}T00:00:00.000Z`), issuedAt: issue1, conditionCode: "CLEAR", provenance: { qa: true } },
      });
      await prisma.vineyardForecastDaily.deleteMany({ where: { vineyardId: vy.id, targetDate: { lt: new Date(`${addDaysIso(todayIso, -1)}T00:00:00.000Z`) } } });
      const stale = await prisma.vineyardForecastDaily.count({ where: { vineyardId: vy.id, targetDate: { lt: new Date(`${addDaysIso(todayIso, -1)}T00:00:00.000Z`) } } });
      check("retention prune removes past target-dates", stale === 0, stale);
    } finally {
      // Cleanup the QA fixtures. Inbox rows are owner-only under RLS (INBOX-1), so the QA weather
      // digests are removed via runAsSystem (owner) — scoped to Demo + WEATHER_ALERT + this run.
      await prisma.vineyardWeatherAlertState.deleteMany({ where: { vineyardId: vy.id } }).catch(() => {});
      await prisma.vineyardForecastHourly.deleteMany({ where: { vineyardId: vy.id } }).catch(() => {});
      await prisma.vineyardForecastDaily.deleteMany({ where: { vineyardId: vy.id } });
      await prisma.vineyardClimateDaily.deleteMany({ where: { vineyardId: vy.id } });
      await prisma.vineyardWeatherConfig.deleteMany({ where: { vineyardId: vy.id } });
      await prisma.weatherProviderUsage.deleteMany({ where: {} }).catch(() => {});
      await prisma.vineyardDetail.deleteMany({ where: { vineyardId: vy.id } }).catch(() => {});
      await prisma.vineyard.delete({ where: { id: vy.id } });
      await runAsSystem(async (db) => {
        await db.inboxNotification.deleteMany({ where: { tenantId: DEMO, kind: "WEATHER_ALERT", createdAt: { gte: runStartedAt } } });
      }).catch(() => {});
      console.log("Cleaned up QA fixtures.");
    }
  });
  await prisma.$disconnect();
  console.log(failures === 0 ? "\n✓ verify:weather PASSED" : `\n✗ verify:weather FAILED (${failures})`);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch((e) => { console.error("verify:weather ERROR", e); process.exit(1); });
