// VI-P8 — Growing Season Temperature (Jones) = mean of daily mean temps over the growing season, and the
// Jones climate-maturity grouping. Complements Winkler (GST is a mean, not an accumulation, so it's robust to
// a few missing days). Pure. Window comes from season-core (hemisphere-aware).

import type { LocalDailyRecord } from "./obs-time-core";

export type JonesGroup = "Too cool" | "Cool" | "Intermediate" | "Warm" | "Hot" | "Very hot";

export interface GstResult {
  gstC: number | null; // null if no paired-temp days
  daysCounted: number;
  group: JonesGroup | null;
}

/** Jones (2006) climate-maturity groupings by GST in °C. */
export function jonesGroup(gstC: number): JonesGroup {
  if (gstC < 13) return "Too cool";
  if (gstC < 15) return "Cool";
  if (gstC < 17) return "Intermediate";
  if (gstC < 19) return "Warm";
  if (gstC < 21) return "Hot";
  return "Very hot";
}

/** Mean daily-mean temperature over the supplied (already season-filtered) records. */
export function growingSeasonTemp(records: LocalDailyRecord[]): GstResult {
  let sum = 0;
  let daysCounted = 0;
  for (const r of records) {
    if (r.tmaxC !== null && r.tminC !== null) {
      sum += (r.tmaxC + r.tminC) / 2;
      daysCounted += 1;
    }
  }
  if (daysCounted === 0) return { gstC: null, daysCounted: 0, group: null };
  const gstC = Math.round((sum / daysCounted) * 100) / 100;
  return { gstC, daysCounted, group: jonesGroup(gstC) };
}
