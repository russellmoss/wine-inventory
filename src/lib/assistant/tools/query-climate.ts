import "server-only";
import type { AssistantTool } from "../registry";
import { resolveVineyards } from "../scope";
import { prisma } from "@/lib/prisma";
import { getWineryTimeZone, getUnitPrefs } from "@/lib/settings/data";
import { climateDisplay, forecastDayDisplay, precipDisplay, tempDisplay } from "./climate-display";
import { resolveSiteTimeZone, siteTodayIso } from "@/lib/weather/site-time-core";
import { composeRainfallRangeCore } from "@/lib/weather/rainfall-range-core";
import { composeForecastViewCore, isForecastStale, type ForecastRow } from "@/lib/weather/forecast-read-core";
import { composeForecastHoursCore, type ForecastHourRow } from "@/lib/weather/forecast-hourly-read-core";
import { gddCToF } from "@/lib/weather/units-core";
import { formatGdd } from "@/lib/units/display";
import { composeClimateSummaryCore, type DailyRow, type ClimateConfig, type ClimateSummary } from "@/lib/weather/read-core";
import type { CurvePoint, NamedCurve } from "@/lib/weather/normals-core";
import { resolveVineyardCentroid } from "@/lib/weather/location";
import { addDaysIso } from "@/lib/weather/obs-time-core";

type QueryClimateInput = { vineyard?: string };

const dec = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

// The cumulative °F GDD a day-indexed curve had reached BY a given day-of-season index. Curves skip days
// with missing temps, so we take the last point AT OR BEFORE the target index (never interpolate forward
// into a day the season hasn't reached). null when the curve has no point that early (no data yet).
function cumFAtDayIndex(curve: CurvePoint[], dayIndex: number): number | null {
  let val: number | null = null;
  for (const p of curve) {
    if (p.dayIndex <= dayIndex) val = p.cumF;
    else break;
  }
  return val;
}

// SAME-DATE GDD comparison (plan VI-P8, feedback: "how far ahead/behind are we vs the SAME DAY last year /
// the long-term average"). The headline.priorYear is the FULL prior season — apples-to-oranges against a
// partial season-to-date. The day-indexed comparison curves (normals.comparison) already hold cumulative
// °F GDD by day-of-season for last year, the long-term average, and the coolest/hottest years; we read this
// year's current day-of-season index off its own curve and look every other curve up AT THAT SAME INDEX.
// This is exactly what the Weather & climate graph shows, so the assistant and the page now agree.
function sameDateGdd(s: ClimateSummary): {
  asOfDate: string | null;
  dayOfSeason: number | null;
  thisYear: { seasonYear: number; toDate: string; toDateF: number } | null;
  vs: Array<{
    key: NamedCurve["key"];
    label: string;
    toDateF: number;
    toDate: string;
    deltaF: number;
    delta: string;
    aheadOrBehind: "ahead" | "behind" | "even";
  }>;
  note: string;
} {
  const u = s.unitSystem;
  const curves = s.normals.comparison;
  const current = curves.find((c) => c.key === "current");
  const currentLast = current && current.curve.length ? current.curve[current.curve.length - 1] : null;
  // The current day-of-season index = where this year's curve has reached. Everything is read at THIS index.
  const dayIndex = currentLast ? currentLast.dayIndex : null;
  const asOfDate = s.headline.gddCumulative.length ? s.headline.gddCumulative[s.headline.gddCumulative.length - 1].date : null;

  if (dayIndex === null || currentLast === null) {
    return {
      asOfDate,
      dayOfSeason: null,
      thisYear: null,
      vs: [],
      note: !s.normals.hasHistory
        ? "No complete past seasons are loaded yet, so a same-date year-over-year comparison isn't possible. Load multi-year history on the Weather & climate page."
        : "The current season has no GDD accumulated yet, so there's nothing to compare on this date.",
    };
  }

  // Convert °F back to °C only to reuse formatGdd (which speaks the tenant's unit system). formatGdd expects
  // a °C GDD value and scales it; gddF / 1.8 = gddC.
  const fToGddC = (f: number) => f / 1.8;
  const thisYearF = currentLast.cumF;

  const vs: ReturnType<typeof sameDateGdd>["vs"] = [];
  for (const c of curves) {
    if (c.key === "current") continue;
    const cum = cumFAtDayIndex(c.curve, dayIndex);
    if (cum === null) continue; // that year has no reading this early in the season
    const deltaF = Math.round(thisYearF - cum);
    const aheadOrBehind = deltaF > 0 ? "ahead" : deltaF < 0 ? "behind" : "even";
    vs.push({
      key: c.key,
      label: c.label,
      toDateF: cum,
      toDate: formatGdd(fToGddC(cum), u),
      deltaF,
      delta: `${deltaF >= 0 ? "+" : "\u2212"}${formatGdd(fToGddC(Math.abs(deltaF)), u)}`,
      aheadOrBehind,
    });
  }

  return {
    asOfDate,
    dayOfSeason: dayIndex + 1, // human day-of-season (1-based)
    thisYear: { seasonYear: s.seasonYear, toDate: formatGdd(fToGddC(thisYearF), u), toDateF: thisYearF },
    vs,
    note:
      "Same-date comparison: every figure is cumulative GDD to THIS point in the season (not full-season totals). " +
      "'ahead'/'behind' is this year minus that reference on the same day-of-season. This matches the Weather & climate graph.",
  };
}

// VI-P8 — read the stored weather/climate for a vineyard and answer the grower's plain-English questions:
// GDD vs last year, warmer/cooler than last year (GST), "was last night a frost?", Winkler region, and the
// current-season summary. Speaks in the vineyard's PRIMARY source (R14); the multi-source spread is included
// as the "compare sources" view. READS stored data (no live fetch); refreshing weather is a separate action.
export const queryClimateTool: AssistantTool = {
  name: "query_climate",
  description:
    "Get a vineyard's weather & climate: the 7-DAY FORECAST (highs/lows, conditions, expected rain), growing " +
    "degree days (GDD), whether the season is running ahead of or behind last year AND the long-term average " +
    "ON THIS SAME DATE (a true same-date year-over-year comparison — how far ahead/behind we are today vs the " +
    "previous season and the multi-year normal, which also indicates relative phenology), the Winkler region, " +
    "frost risk (including 'was last night a frost?'), heat days, season rainfall, and the last 30 days of rain. " +
    "Call this for questions about the forecast, this week's weather, rain coming, temperature, GDD, degree days, " +
    "heat, frost, Winkler, growing season, 'how does this year compare', 'how far ahead/behind are we', 'GDD vs " +
    "last year at this point', or 'vs the long-term average on this day'. Answers in the vineyard's chosen primary " +
    "source; reads stored data only. This tool only reports the tenant's own weather numbers — it does NOT " +
    "explain disease biology. For 'why' a condition favors a pathogen (e.g. why rain/humidity raises downy " +
    "mildew pressure), still call search_knowledge_base for the epidemiology even if this tool shows nothing " +
    "unusual; a quiet weather record is not evidence there is no biological explanation to give.",
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
    // Plan 098: the tenant master for the per-site unit chain (config override → tenant → geo).
    // ctx.units is the loop-resolved value; a direct settings read is the legitimate fallback for
    // callers outside the chat loop (only the LOOP is DB-free, not the tools).
    const tenantSystem =
      ctx.units !== undefined ? ctx.units.configuredSystem : (await getUnitPrefs().catch(() => null))?.configuredSystem ?? null;

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
        primarySourceElevationM: dec(configRow.primarySourceElevationM),
        attribution: configRow.attribution,
        lastRefreshAt: configRow.lastRefreshAt ? configRow.lastRefreshAt.toISOString() : null,
        unitSystem: configRow.unitSystem,
      };
      // Plan 098: the summary resolves the display system (override → tenant → geo) — the tool
      // previously loaded config.unitSystem and silently DROPPED it (the Oregon-forecast bug).
      const s = composeClimateSummaryCore({
        vineyardId: v.id,
        rows: dailyRows,
        config,
        latitude: centroid.lat,
        longitude: centroid.lon,
        today: todayLocal,
        tenantUnitSystem: tenantSystem,
      });

      // "Frost last night" — R9 freshness fallback: the primary's prior-local-day Tmin, or "not in yet".
      const primaryRows = dailyRows.filter((r) => r.providerKey === s.primaryProviderKey);
      const lastNightRow = primaryRows.find((r) => r.localDate === lastNight);
      const latestWithTmin = [...primaryRows].reverse().find((r) => r.tminC !== null);
      const frostLastNight =
        !lastNightRow || lastNightRow.tminC === null
          ? { status: "not_in_yet", note: `Last night's low isn't in yet (provider latency). Latest reading is ${latestWithTmin?.localDate ?? "none"}. Check a physical gauge — don't infer a frost from missing data.`, latestDate: latestWithTmin?.localDate ?? null }
          : { status: "in", localDate: lastNight, low: tempDisplay(lastNightRow.tminC, s.unitSystem), tminC: lastNightRow.tminC, wasFrost: lastNightRow.tminC <= 0, wasKilling: lastNightRow.tminC <= -2 };

      results.push({
        vineyard: v.name,
        // Plan 098 (council SF4): the display strings the model should use VERBATIM — formatted in
        // the vineyard's resolved unit system. The raw metric keys below stay for back-compat.
        unitSystem: s.unitSystem,
        display: climateDisplay(s),
        primarySource: s.primaryProviderKey,
        coverage: s.coverageState,
        station: s.station.name ? { name: s.station.name, distanceKm: s.station.distanceM ? Math.round(s.station.distanceM / 100) / 10 : null } : null,
        siteElevationM: s.siteElevationM,
        seasonYear: s.seasonYear,
        // NOTE: vsLastYearC/lastYearC here are FULL-SEASON prior-year totals — do NOT use them to answer
        // "where are we vs last year AT THIS POINT". For a same-date comparison use `gddSameDate` below.
        gdd: { seasonToDateC: s.headline.seasonGddC, completenessPct: s.headline.gddCompletenessPct, vsLastYearFullSeasonC: s.headline.priorYear?.deltaC ?? null, lastYearFullSeasonC: s.headline.priorYear?.seasonGddC ?? null },
        // Same-date year-over-year (feedback fix): how far AHEAD or BEHIND this year is at this exact
        // point in the season vs last year, the long-term average, and the coolest/hottest years —
        // an apples-to-apples partial-season comparison, and the phenology-relevant answer. Use THIS,
        // not the full-season gdd figures above, when the user asks "how far ahead/behind are we".
        gddSameDate: sameDateGdd(s),
        // Source fidelity — does the primary series describe THIS site? When it doesn't, the
        // classifications below are withheld and the model must say why rather than guess.
        sourceFidelity: {
          band: s.sourceFidelity.band,
          classificationAllowed: s.sourceFidelity.classificationAllowed,
          sourceElevationM: s.sourceFidelity.sourceElevationM,
          deltaM: s.sourceFidelity.deltaM,
          note: s.sourceFidelity.reason,
        },
        winkler: (() => {
          // Winkler is classified on the LONG-TERM full-season average (20-yr preferred), NOT the partial
          // current season. Two distinct reasons it can be absent — never conflate them (§3.6).
          if (!s.sourceFidelity.classificationAllowed) {
            return { region: null, refused: true, note: s.sourceFidelity.reason };
          }
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
        // Rolling recent rainfall (plan 096 U8) — year-round rows make this answerable in winter too.
        rainfallLast30Days: (() => {
          const r = composeRainfallRangeCore({
            rows: dailyRows.map((row) => ({ providerKey: row.providerKey, localDate: row.localDate, precipMm: row.precipMm })),
            primaryProviderKey: s.primaryProviderKey,
            // Non-US history comes from the elevation-corrected archive, not the raw coarse grid.
            historyProviderKey: s.coverageState === "US_HIGH_RES" ? "gridmet" : "open_meteo_archive",
            startIso: addDaysIso(todayLocal, -29),
            endIso: todayLocal,
          });
          return { total: precipDisplay(r.stats.totalMm, s.unitSystem), totalMm: r.stats.totalMm, wetDays: r.stats.wetDays, daysSinceLastRain: r.stats.daysSinceLastRain, missingDays: r.stats.missingDays, filledDays: r.stats.filledDays };
        })(),
        compareSources: s.spread ? { gddRange: `${s.spread.min}–${s.spread.max} GDD across ${s.spread.sources.join(", ")}`, perSource: s.perSource } : undefined,
        lastRefresh: s.lastRefreshAt,
        // 7-day forecast (plan 096 Phase 2) — stored rows only, ONE primary series (council C3),
        // R11 no-fabrication: no rows → an honest note, never inferred weather.
        forecast: await (async () => {
          const frows = await prisma.vineyardForecastDaily.findMany({ where: { vineyardId: v.id }, orderBy: { targetDate: "asc" } });
          const fr: ForecastRow[] = frows.map((r) => ({
            providerKey: r.providerKey,
            targetDate: r.targetDate.toISOString().slice(0, 10),
            issuedAt: r.issuedAt.toISOString(),
            tmaxC: dec(r.tmaxC),
            tminC: dec(r.tminC),
            precipMm: dec(r.precipMm),
            precipProbabilityPct: dec(r.precipProbabilityPct),
            conditionCode: r.conditionCode,
            windMaxKph: dec(r.windMaxKph),
          }));
          const view = composeForecastViewCore(fr, todayLocal);
          if (!view) return { note: "No forecast stored for this vineyard yet — it loads on the Weather & climate page and refreshes every 6 hours." };

          // Plan 097 U6 — hourly CROSSING TIMES for today + tomorrow ("when will it freeze
          // tonight?"). Same core as the modal's chart/copy; R11: no hourly rows → an honest note.
          const tomorrow = addDaysIso(todayLocal, 1);
          const hourlyRaw = await prisma.vineyardForecastHourly.findMany({
            where: { vineyardId: v.id, localDate: { in: [new Date(`${todayLocal}T00:00:00.000Z`), new Date(`${tomorrow}T00:00:00.000Z`)] } },
            orderBy: { hourStartUtc: "asc" },
          });
          const hourlyRows: ForecastHourRow[] = hourlyRaw.map((r) => ({
            providerKey: r.providerKey,
            hourStartUtc: r.hourStartUtc.toISOString(),
            localDate: r.localDate.toISOString().slice(0, 10),
            localHour: r.localHour,
            tempC: dec(r.tempC),
            popPct: dec(r.popPct),
            precipMm: dec(r.precipMm),
            precipDurationH: r.precipDurationH,
            conditionCode: r.conditionCode,
            windKph: dec(r.windKph),
          }));
          const crossingTimes = [todayLocal, tomorrow].map((date) => {
            const dayHours = composeForecastHoursCore(hourlyRows, { targetDate: date });
            if (!dayHours) return { date, note: "no hourly detail stored for this day yet" };
            return {
              date,
              firstFrostHourLocal: dayHours.summary.firstFrostHour,
              firstHeatHourLocal: dayHours.summary.firstHeatHour,
              minTemp: tempDisplay(dayHours.summary.minTempC, s.unitSystem),
              maxTemp: tempDisplay(dayHours.summary.maxTempC, s.unitSystem),
              minTempC: dayHours.summary.minTempC,
              maxTempC: dayHours.summary.maxTempC,
            };
          });

          return {
            source: view.providerKey,
            issuedAt: view.issuedAt,
            stale: isForecastStale(view.issuedAt, new Date()),
            days: view.days.map((d) => ({
              date: d.targetDate,
              // Display-ready strings first (plan 098) — the model uses these verbatim.
              ...forecastDayDisplay(d, s.unitSystem),
              highC: d.tmaxC,
              lowC: d.tminC,
              condition: d.conditionCode,
              expectedRainMm: d.precipMm,
              rainProbabilityPct: d.precipProbabilityPct,
              lowerConfidence: d.reducedConfidence || undefined,
            })),
            crossingTimes,
            note: "Days 6–7 are lower confidence. One source shown, never an average of providers. crossingTimes hours are vineyard-local (0–23).",
          };
        })(),
      });
    }
    return { results, timeZone: tz };
  },
};
