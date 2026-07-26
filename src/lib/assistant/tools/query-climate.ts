import "server-only";
import type { AssistantTool } from "../registry";
import { resolveVineyards } from "../scope";
import { prisma } from "@/lib/prisma";
import { getWineryTimeZone } from "@/lib/settings/data";
import { resolveSiteTimeZone, siteTodayIso } from "@/lib/weather/site-time-core";
import { gddCToF } from "@/lib/weather/units-core";
import { composeClimateSummaryCore, type DailyRow, type ClimateConfig } from "@/lib/weather/read-core";
import { resolveVineyardCentroid } from "@/lib/weather/location";
import { addDaysIso } from "@/lib/weather/obs-time-core";

type QueryClimateInput = { vineyard?: string };

const dec = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

// VI-P8 — read the stored weather/climate for a vineyard and answer the grower's plain-English questions:
// GDD vs last year, warmer/cooler than last year (GST), "was last night a frost?", Winkler region, and the
// current-season summary. Speaks in the vineyard's PRIMARY source (R14); the multi-source spread is included
// as the "compare sources" view. READS stored data (no live fetch); refreshing weather is a separate action.
export const queryClimateTool: AssistantTool = {
  name: "query_climate",
  description:
    "Get a vineyard's weather & climate: growing degree days (GDD) vs last year, whether the season is warmer " +
    "or cooler than last year, the Winkler region, frost risk (including 'was last night a frost?'), heat days, " +
    "and rainfall. Call this for questions about weather, temperature, GDD, degree days, heat, frost, Winkler, " +
    "growing season, or 'how does this year compare'. Answers in the vineyard's chosen primary source; reads " +
    "stored data only.",
  kind: "read",
  inputSchema: {
    type: "object",
    properties: {
      vineyard: {
        type: "string",
        description: "Vineyard name (partial match). Optional for a manager — defaults to their assigned vineyard.",
      },
    },
  },
  async run(ctx, rawInput) {
    const input = (rawInput ?? {}) as QueryClimateInput;
    const vineyards = await resolveVineyards(ctx.user, input.vineyard);
    if (vineyards.length === 0) return { message: "No matching vineyard you can access." };
    if (vineyards.length > 3)
      return { message: `That matches ${vineyards.length} vineyards: ${vineyards.map((v) => v.name).join(", ")}. Ask about one of them.` };

    // Site-local time (plan 096 U2 — ONE "today" definition, shared with the card/actions/sweep).
    // Chain per vineyard: config.timeZone (provider-reported) → winery AppSettings tz → viewer tz →
    // UTC. Preserves tickets #472/#473 (operating tz beats viewer) and adds the vineyard's own zone
    // on top. "Frost last night" is tz-sensitive, so this resolves PER VINEYARD inside the loop.
    const wineryTz = await getWineryTimeZone().catch(() => undefined);
    let tz = resolveSiteTimeZone(null, wineryTz, ctx.timeZone);

    const results = [];
    for (const v of vineyards) {
      const centroid = await resolveVineyardCentroid(v.id);
      const configRow = await prisma.vineyardWeatherConfig.findFirst({ where: { vineyardId: v.id } });
      if (!configRow || !centroid) {
        results.push({ vineyard: v.name, note: "No weather has been set up for this vineyard yet — refresh its weather first." });
        continue;
      }
      tz = resolveSiteTimeZone(configRow.timeZone, wineryTz, ctx.timeZone);
      const todayLocal = siteTodayIso(tz);
      const lastNight = addDaysIso(todayLocal, -1);
      const rows = await prisma.vineyardClimateDaily.findMany({
        where: { vineyardId: v.id },
        select: { providerKey: true, localDate: true, tmaxC: true, tminC: true, precipMm: true, rhMaxPct: true, rhMinPct: true },
        orderBy: { localDate: "asc" },
      });
      const dailyRows: DailyRow[] = rows.map((r) => ({
        providerKey: r.providerKey,
        localDate: r.localDate.toISOString().slice(0, 10),
        tmaxC: dec(r.tmaxC),
        tminC: dec(r.tminC),
        precipMm: dec(r.precipMm),
        rhMaxPct: dec(r.rhMaxPct),
        rhMinPct: dec(r.rhMinPct),
      }));
      const config: ClimateConfig = {
        primaryProviderKey: configRow.primaryProviderKey,
        primaryProviderOverride: configRow.primaryProviderOverride,
        coverageState: configRow.coverageState,
        stationId: configRow.stationId,
        stationName: configRow.stationName,
        stationDistanceM: dec(configRow.stationDistanceM),
        stationElevationDeltaM: dec(configRow.stationElevationDeltaM),
        siteElevationM: dec(configRow.siteElevationM),
        attribution: configRow.attribution,
        lastRefreshAt: configRow.lastRefreshAt ? configRow.lastRefreshAt.toISOString() : null,
        unitSystem: configRow.unitSystem,
      };
      const s = composeClimateSummaryCore({ vineyardId: v.id, rows: dailyRows, config, latitude: centroid.lat, today: todayLocal });

      // "Frost last night" — R9 freshness fallback: the primary's prior-local-day Tmin, or "not in yet".
      const primaryRows = dailyRows.filter((r) => r.providerKey === s.primaryProviderKey);
      const lastNightRow = primaryRows.find((r) => r.localDate === lastNight);
      const latestWithTmin = [...primaryRows].reverse().find((r) => r.tminC !== null);
      const frostLastNight =
        !lastNightRow || lastNightRow.tminC === null
          ? { status: "not_in_yet", note: `Last night's low isn't in yet (provider latency). Latest reading is ${latestWithTmin?.localDate ?? "none"}. Check a physical gauge — don't infer a frost from missing data.`, latestDate: latestWithTmin?.localDate ?? null }
          : { status: "in", localDate: lastNight, tminC: lastNightRow.tminC, wasFrost: lastNightRow.tminC <= 0, wasKilling: lastNightRow.tminC <= -2 };

      results.push({
        vineyard: v.name,
        primarySource: s.primaryProviderKey,
        coverage: s.coverageState,
        station: s.station.name ? { name: s.station.name, distanceKm: s.station.distanceM ? Math.round(s.station.distanceM / 100) / 10 : null } : null,
        siteElevationM: s.siteElevationM,
        seasonYear: s.seasonYear,
        gdd: { seasonToDateC: s.headline.seasonGddC, completenessPct: s.headline.gddCompletenessPct, vsLastYearC: s.headline.priorYear?.deltaC ?? null, lastYearC: s.headline.priorYear?.seasonGddC ?? null },
        winkler: (() => {
          // Winkler is classified on the LONG-TERM full-season average (20-yr preferred), NOT the partial
          // current season. Falls back to a prompt to load history if none is backfilled yet.
          const n = s.normals.winkler20 ?? s.normals.winkler10;
          if (!n) return { region: null, note: "No long-term history loaded yet — Winkler needs the multi-year full-season average. Load history on the Weather & climate page." };
          return { region: n.region, basis: `${n.yearsUsed}-yr average`, avgGddF: n.avgGddF };
        })(),
        gddThisYearVsAverageF: s.normals.graph.avg20.length ? { thisYearToDateF: Math.round(gddCToF(s.headline.seasonGddC)) } : undefined,
        gst: { degC: s.headline.gst.gstC, group: s.headline.gst.group },
        frostLastNight,
        frostSeason: { vulnerableWindow: s.headline.frost.vulnerableWindow, lightNights: s.headline.frost.lightCount, killingNights: s.headline.frost.killingCount, framing: s.honesty.frostFraming },
        heatDaysOver35C: s.headline.heat.daysOverByThreshold["35"],
        rainfall: { seasonMm: s.headline.rainfall.totalMm, label: "Regional Rainfall Estimate (≈4 km average, not your rain gauge)" },
        compareSources: s.spread ? { gddRange: `${s.spread.min}–${s.spread.max} GDD across ${s.spread.sources.join(", ")}`, perSource: s.perSource } : undefined,
        lastRefresh: s.lastRefreshAt,
      });
    }
    return { results, timeZone: tz };
  },
};
