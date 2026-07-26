// VI-P8 Unit 9 — pure frost/heat crossing detection for the sweep's thin inbox alert. Framed "elevated risk
// → check", never "damage occurred". Dedup (don't re-alert the same date) is the caller's job via
// `alreadyAlerted`. Pure + tested.

import type { LocalDailyRecord } from "./obs-time-core";
import { formatTemp, type UnitSystem } from "@/lib/units/display";

export type WeatherAlertKind = "FROST" | "HEAT";

export interface WeatherAlert {
  kind: WeatherAlertKind;
  localDate: string;
  valueC: number; // the Tmin (frost) or Tmax (heat) that crossed
}

export interface AlertThresholds {
  frostC?: number; // Tmin ≤ this → FROST (default 0)
  heatC?: number; // Tmax ≥ this → HEAT (default 38)
}

/**
 * Detect frost/heat crossings in a series, excluding dates already alerted. Returns one alert per crossing
 * date (frost takes precedence if a day somehow crosses both — it won't, but be deterministic).
 */
export function detectWeatherAlertsCore(
  series: LocalDailyRecord[],
  thresholds: AlertThresholds = {},
  alreadyAlerted: ReadonlySet<string> = new Set(),
): WeatherAlert[] {
  const frostC = thresholds.frostC ?? 0;
  const heatC = thresholds.heatC ?? 38;
  const out: WeatherAlert[] = [];
  for (const r of series) {
    if (alreadyAlerted.has(r.localDate)) continue;
    if (r.tminC !== null && r.tminC <= frostC) {
      out.push({ kind: "FROST", localDate: r.localDate, valueC: r.tminC });
    } else if (r.tmaxC !== null && r.tmaxC >= heatC) {
      out.push({ kind: "HEAT", localDate: r.localDate, valueC: r.tmaxC });
    }
  }
  return out;
}

/** Grower-facing copy for an alert — risk framing, never a damage claim. Prose renders in the
 *  site's resolved display units (plan 098); detection stays °C like everything stored. */
export function alertMessage(a: WeatherAlert, vineyardName: string, unitSystem: UnitSystem = "METRIC"): string {
  if (a.kind === "FROST") {
    const severity = a.valueC <= -2 ? "killing-range" : "light";
    return `Frost risk at ${vineyardName}: ${formatTemp(a.valueC, unitSystem, 1)} low on ${a.localDate} (${severity}). Elevated risk — check the vines; this is not a damage report.`;
  }
  return `Heat stress at ${vineyardName}: ${formatTemp(a.valueC, unitSystem, 1)} high on ${a.localDate}. Check irrigation and canopy exposure.`;
}

// ────────────────────────── Plan 096 Phase 3 (U20) — FORECAST tier classification ──────────────────────────
// Same file, same purity, ONE detector family (the spec forbids a second detector). Classification
// always runs over the FULL 7-day primary series (council C5 — a 3-day heat run is invisible inside
// a 72 h window until it has begun); the 72 h notify horizon gates single-day tiers only. The
// hemisphere-mirrored vulnerable window is a SEVERITY MODIFIER, not a gate: out-of-window frost
// still badges, never notifies (a 28 °F November night is information, not an emergency).

import { vulnerableWindowFor } from "./frost-core";
import { seasonYearFor } from "./season-core";
import { addDaysIso } from "./obs-time-core";

export type ForecastAlertType = "FROST" | "HEAT" | "SUSTAINED_HEAT";
export type ForecastAlertTier = "FROST_WATCH" | "FROST_WARNING" | "HARD_FREEZE" | "HEAT_WATCH" | "EXTREME_HEAT" | "SUSTAINED_HEAT";

/** The claim comparator (family-relative; the SQL WHERE "notifiedRank" < new compares these). */
export const TIER_RANK: Record<ForecastAlertTier, number> = {
  FROST_WATCH: 1,
  FROST_WARNING: 2,
  HARD_FREEZE: 3,
  HEAT_WATCH: 1,
  EXTREME_HEAT: 2,
  SUSTAINED_HEAT: 1,
};

export interface ForecastTierThresholds {
  frostWatchC?: number; // default 2  (36 °F — radiational cooling undershoots the forecast min)
  frostWarnC?: number; // default 0  (32 °F — damage to green tissue begins)
  hardFreezeC?: number; // default −2 (28 °F — severe shoot loss)
  heatWatchC?: number; // default 35 (95 °F — photosynthesis shutdown)
  extremeHeatC?: number; // default 38 (100 °F — sunburn / raisining)
}

export interface ForecastDayInput {
  targetDate: string; // vineyard-local card date
  tminC: number | null;
  tmaxC: number | null;
}

export interface ForecastAlertCandidate {
  alertType: ForecastAlertType;
  /** Dedup identity date — the card date; for SUSTAINED_HEAT the FIRST day of the run (Codex DQ1). */
  targetDate: string;
  tier: ForecastAlertTier;
  rank: number;
  valueC: number;
  /** Frost only: inside the hemisphere-mirrored vulnerable window? (modifier for copy/styling) */
  withinVulnerableWindow: boolean;
  /** May this candidate NOTIFY (vs badge-only)? Horizon + window + tier floor applied. */
  notifyEligible: boolean;
  /** SUSTAINED_HEAT: the run's span for copy ("Jul 29 – Aug 1"). */
  runEndDate?: string;
}

/**
 * Classify the full forecast series into tier candidates. Notify floor (spec 3.3): frost
 * WARNING-or-worse, heat WATCH-or-worse, within `notifyHorizonDays` of today; SUSTAINED_HEAT
 * notifies whenever detected (multi-day prep — council C5). Badges render every candidate.
 */
export function classifyForecastAlertsCore(
  days: ForecastDayInput[],
  opts: { latitude: number; todayIso: string; thresholds?: ForecastTierThresholds; notifyHorizonDays?: number },
): ForecastAlertCandidate[] {
  const t = opts.thresholds ?? {};
  const frostWatchC = t.frostWatchC ?? 2;
  const frostWarnC = t.frostWarnC ?? 0;
  const hardFreezeC = t.hardFreezeC ?? -2;
  const heatWatchC = t.heatWatchC ?? 35;
  const extremeHeatC = t.extremeHeatC ?? 38;
  const horizonEnd = addDaysIso(opts.todayIso, opts.notifyHorizonDays ?? 3);
  const window = vulnerableWindowFor(opts.latitude, seasonYearFor(opts.latitude, opts.todayIso));

  const sorted = [...days].sort((a, b) => (a.targetDate < b.targetDate ? -1 : 1));
  const out: ForecastAlertCandidate[] = [];

  for (const d of sorted) {
    // FROST family — highest matching tier wins.
    if (d.tminC !== null) {
      let tier: ForecastAlertTier | null = null;
      if (d.tminC <= hardFreezeC) tier = "HARD_FREEZE";
      else if (d.tminC <= frostWarnC) tier = "FROST_WARNING";
      else if (d.tminC <= frostWatchC) tier = "FROST_WATCH";
      if (tier) {
        const within = d.targetDate >= window.startIso && d.targetDate <= window.endIso;
        out.push({
          alertType: "FROST",
          targetDate: d.targetDate,
          tier,
          rank: TIER_RANK[tier],
          valueC: d.tminC,
          withinVulnerableWindow: within,
          // Badge always; notify only in-window, within the horizon, at WARNING or worse.
          notifyEligible: within && d.targetDate <= horizonEnd && TIER_RANK[tier] >= TIER_RANK.FROST_WARNING,
        });
      }
    }
    // HEAT family.
    if (d.tmaxC !== null) {
      let tier: ForecastAlertTier | null = null;
      if (d.tmaxC >= extremeHeatC) tier = "EXTREME_HEAT";
      else if (d.tmaxC >= heatWatchC) tier = "HEAT_WATCH";
      if (tier) {
        out.push({
          alertType: "HEAT",
          targetDate: d.targetDate,
          tier,
          rank: TIER_RANK[tier],
          valueC: d.tmaxC,
          withinVulnerableWindow: false,
          notifyEligible: d.targetDate <= horizonEnd, // heat notifies from WATCH up
        });
      }
    }
  }

  // SUSTAINED_HEAT — ≥3 consecutive days at/above the watch threshold; identity = the run's FIRST
  // day (a shifted run start is a NEW event — re-notify is correct there). Detected over the FULL
  // series and notify-eligible regardless of horizon (heat prep is multi-day planning).
  let runStart: string | null = null;
  let runEnd: string | null = null;
  let runLen = 0;
  let runMax = -Infinity;
  const flushRun = () => {
    if (runStart && runEnd && runLen >= 3) {
      out.push({
        alertType: "SUSTAINED_HEAT",
        targetDate: runStart,
        tier: "SUSTAINED_HEAT",
        rank: TIER_RANK.SUSTAINED_HEAT,
        valueC: runMax,
        withinVulnerableWindow: false,
        notifyEligible: true,
        runEndDate: runEnd,
      });
    }
    runStart = null;
    runEnd = null;
    runLen = 0;
    runMax = -Infinity;
  };
  let prevDate: string | null = null;
  for (const d of sorted) {
    const hot = d.tmaxC !== null && d.tmaxC >= heatWatchC;
    const consecutive = prevDate !== null && d.targetDate === addDaysIso(prevDate, 1);
    if (hot) {
      if (runStart === null || !consecutive) {
        flushRun();
        runStart = d.targetDate;
      }
      runEnd = d.targetDate;
      runLen = runStart === d.targetDate ? 1 : runLen + 1;
      runMax = Math.max(runMax, d.tmaxC!);
    } else {
      flushRun();
    }
    prevDate = d.targetDate;
  }
  flushRun();

  return out;
}

/** The escalation state machine, pure (council C2/C6). `notifiedRank` 0 = never/cleared. */
export function escalationAction(
  currentRank: number,
  state: { notifiedRank: number; cleared: boolean },
): "notify" | "clear" | "silent" {
  if (currentRank > state.notifiedRank) return "notify"; // first alert or escalation (also re-escalation after a clear — rank was reset to 0)
  if (currentRank === 0 && state.notifiedRank >= 2 && !state.cleared) return "clear"; // WARNING+ dropped below watch → one all-clear
  return "silent"; // repetition or de-escalation-without-clear-floor
}

/** "night of Sat Apr 3 → Sun Apr 4" (council S5 — a frost card's low is physically the NEXT morning). */
export function nightSpanLabel(cardDateIso: string): string {
  const fmt = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
  return `night of ${fmt(cardDateIso)} → ${fmt(addDaysIso(cardDateIso, 1))}`;
}

const TIER_LABEL: Record<ForecastAlertTier, string> = {
  FROST_WATCH: "Frost watch",
  FROST_WARNING: "Frost warning",
  HARD_FREEZE: "Hard freeze warning",
  HEAT_WATCH: "Heat watch",
  EXTREME_HEAT: "Extreme heat warning",
  SUSTAINED_HEAT: "Sustained heat",
};
export function tierLabel(tier: ForecastAlertTier): string {
  return TIER_LABEL[tier];
}

/**
 * ONE digest per (targetDate, tier) across the tenant's vineyards (Gemini S2, user-confirmed) —
 * a regional freeze must not become 24 separate notifications. Risk-framed like alertMessage.
 */
export function weatherAlertDigest(input: {
  tier: ForecastAlertTier;
  targetDate: string;
  vineyardNames: string[];
  worstValueC: number;
  runEndDate?: string;
  /** Plan 098 — the tenant's display system for the prose; detection stays °C. Default = metric (pre-098 copy). */
  unitSystem?: UnitSystem;
}): { title: string; snippet: string } {
  const u: UnitSystem = input.unitSystem ?? "METRIC";
  const many = input.vineyardNames.length;
  const list = input.vineyardNames.slice(0, 6).join(", ") + (many > 6 ? ` +${many - 6} more` : "");
  const isFrost = input.tier.startsWith("FROST") || input.tier === "HARD_FREEZE";
  const when = isFrost
    ? nightSpanLabel(input.targetDate)
    : input.runEndDate
      ? `${input.targetDate} – ${input.runEndDate}`
      : input.targetDate;
  const title = `${tierLabel(input.tier)} — ${when}${many > 1 ? ` · ${many} vineyards` : ` · ${input.vineyardNames[0] ?? ""}`}`;
  const detail = isFrost
    ? `forecast low ${formatTemp(input.worstValueC, u, 1)}. Elevated risk — check the vines and your frost protection; this is a forecast, not a damage report.`
    : `forecast high ${formatTemp(input.worstValueC, u, 1)}. Check irrigation and canopy exposure.`;
  return { title, snippet: `${list}: ${detail}` };
}

/** The all-clear (council C6) — a grower who mobilized crews must hear the stand-down. */
export function weatherAllClearDigest(input: { tier: ForecastAlertTier; targetDate: string; vineyardNames: string[] }): { title: string; snippet: string } {
  const many = input.vineyardNames.length;
  const list = input.vineyardNames.slice(0, 6).join(", ") + (many > 6 ? ` +${many - 6} more` : "");
  const isFrost = input.tier.startsWith("FROST") || input.tier === "HARD_FREEZE";
  const when = isFrost ? nightSpanLabel(input.targetDate) : input.targetDate;
  return {
    title: `Forecast improved — ${tierLabel(input.tier).toLowerCase()} cleared, ${when}`,
    snippet: `${list}: the forecast no longer crosses the alert threshold. Keep an eye on the page — forecasts move.`,
  };
}
