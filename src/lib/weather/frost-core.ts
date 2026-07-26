// VI-P8 council R6/R15 — frost as VULNERABLE-WINDOW sub-0 events, not raw dates.
// Without phenology, a March frost is dormancy (harmless) and a post-budbreak May frost is catastrophic — so
// the primary output is sub-threshold events inside a lat-derived vulnerable window (NH Apr 1–Jun 15), split
// into 0 °C (light) vs −2 °C (killing), always framed "elevated risk → check", never "safe" or "damaged".
// Raw last-spring / first-fall frost dates are a SECONDARY stat. Real phenology-gated frost is Release 4B.
// Pure.

import type { LocalDailyRecord } from "./obs-time-core";
import { hemisphereFor } from "./season-core";

export type FrostSeverity = "light" | "killing";

export interface FrostEvent {
  localDate: string;
  tminC: number;
  severity: FrostSeverity;
}

export interface FrostThresholds {
  lightC?: number; // default 0 (light frost)
  killC?: number; // default −2 (killing frost)
}

export interface FrostResult {
  vulnerableWindow: { startIso: string; endIso: string };
  events: FrostEvent[]; // sub-threshold nights INSIDE the vulnerable window (primary)
  lightCount: number;
  killingCount: number;
  /** Secondary raw stats over the full series (any-time frost), not the headline. */
  lastSpringFrostDate: string | null;
  firstFallFrostDate: string | null;
}

/** The spring-frost vulnerable window for a SeasonYear (lat-derived). SH mirrors to Oct 1–Nov 15. */
export function vulnerableWindowFor(latitude: number, seasonYear: number): { startIso: string; endIso: string } {
  if (hemisphereFor(latitude) === "S") {
    return { startIso: `${seasonYear - 1}-10-01`, endIso: `${seasonYear - 1}-11-15` };
  }
  return { startIso: `${seasonYear}-04-01`, endIso: `${seasonYear}-06-15` };
}

export function frostEvents(
  records: LocalDailyRecord[],
  latitude: number,
  seasonYear: number,
  thresholds: FrostThresholds = {},
): FrostResult {
  const lightC = thresholds.lightC ?? 0;
  const killC = thresholds.killC ?? -2;
  const vulnerableWindow = vulnerableWindowFor(latitude, seasonYear);

  const events: FrostEvent[] = [];
  let lastSpringFrostDate: string | null = null;
  let firstFallFrostDate: string | null = null;

  const sorted = [...records].sort((a, b) => (a.localDate < b.localDate ? -1 : a.localDate > b.localDate ? 1 : 0));
  const springEndIso = hemisphereFor(latitude) === "S" ? `${seasonYear - 1}-11-30` : `${seasonYear}-06-30`;

  for (const r of sorted) {
    if (r.tminC === null) continue;
    // Primary: events inside the vulnerable window.
    if (r.localDate >= vulnerableWindow.startIso && r.localDate <= vulnerableWindow.endIso && r.tminC <= lightC) {
      events.push({ localDate: r.localDate, tminC: r.tminC, severity: r.tminC <= killC ? "killing" : "light" });
    }
    // Secondary raw stats (any freeze in the series).
    if (r.tminC <= 0) {
      if (r.localDate <= springEndIso) lastSpringFrostDate = r.localDate; // last freeze up to end of spring
      else if (firstFallFrostDate === null) firstFallFrostDate = r.localDate; // first freeze after spring
    }
  }

  return {
    vulnerableWindow,
    events,
    lightCount: events.filter((e) => e.severity === "light").length,
    killingCount: events.filter((e) => e.severity === "killing").length,
    lastSpringFrostDate,
    firstFallFrostDate,
  };
}
