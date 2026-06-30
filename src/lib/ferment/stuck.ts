import type { AlcoholicFermState } from "@/lib/ledger/vocabulary";

// Phase 6 Unit 5: the stuck/sluggish-ferment signal. DERIVED, never stored (council C3):
// recomputed over ALL non-voided Brix on every read, so a late offline backfill self-corrects.
// Phase + threshold aware (council S9): fire ONLY while alcoholic ferment is ACTIVE, the wine
// still carries sugar (Brix above a floor), and Brix has gone essentially flat over a window.
// Cold soak (AF NONE) and the near-dryness crawl are explicitly NOT stuck.

export type BrixReading = {
  observedAt: Date | string;
  brix: number;
  voided?: boolean;
};

export type StuckOptions = {
  afState: AlcoholicFermState;
  /** Only flag while sugar remains above this floor (default 3 °Bx) — ignores near-dryness. */
  brixFloor?: number;
  /** The look-back window in hours (default 48). */
  windowHours?: number;
  /** Minimum Brix DROP across the window below which the ferment is "flat" (default 1 °Bx). */
  minDropPerWindow?: number;
  /** IANA winery timezone for day-bucketing (default UTC). */
  timeZone?: string;
};

export type StuckResult = {
  stuck: boolean;
  reason: "not-active" | "insufficient-data" | "near-dryness" | "insufficient-window" | "dropping" | "flat-brix";
  latestBrix: number | null;
  earlierBrix: number | null;
  dropOverWindow: number | null;
  windowHours: number;
};

const toDate = (d: Date | string): Date => (d instanceof Date ? d : new Date(d));

/** Calendar-day key for a reading in the winery timezone, so multiple readings/day collapse and
 * the signal is tz-stable (a 6am and a 4pm reading are the same "day"). */
function dayKey(d: Date, timeZone: string): string {
  try {
    // en-CA yields YYYY-MM-DD; the timeZone option does the winery-tz normalization.
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

/**
 * Decide whether a ferment looks stuck from its Brix history. Pure + order-independent: readings
 * may arrive out of order (late offline sync) — we sort and re-derive every call. Readings are
 * collapsed to one value per winery-tz day (the last reading of the day) before the window
 * comparison, so a tank read 2–3×/day doesn't bias the trend.
 */
export function detectStuck(readings: BrixReading[], opts: StuckOptions): StuckResult {
  const windowHours = opts.windowHours ?? 48;
  const brixFloor = opts.brixFloor ?? 3;
  const minDrop = opts.minDropPerWindow ?? 1;
  const timeZone = opts.timeZone ?? "UTC";
  const base: Omit<StuckResult, "stuck" | "reason"> = {
    latestBrix: null,
    earlierBrix: null,
    dropOverWindow: null,
    windowHours,
  };

  // Only an ACTIVE alcoholic ferment can be stuck (cold soak / dry are not).
  if (opts.afState !== "ACTIVE") return { ...base, stuck: false, reason: "not-active" };

  const live = readings
    .filter((r) => !r.voided && Number.isFinite(r.brix))
    .map((r) => ({ at: toDate(r.observedAt), brix: r.brix }))
    .sort((a, b) => a.at.getTime() - b.at.getTime());
  if (live.length < 2) return { ...base, stuck: false, reason: "insufficient-data" };

  // Collapse to one reading per winery-tz day (keep the last of each day).
  const byDay = new Map<string, { at: Date; brix: number }>();
  for (const r of live) byDay.set(dayKey(r.at, timeZone), r); // live is sorted asc → last wins
  const daily = [...byDay.values()].sort((a, b) => a.at.getTime() - b.at.getTime());

  const latest = daily[daily.length - 1];
  // Near dryness (or below): sugar is essentially gone — never "stuck".
  if (latest.brix <= brixFloor) {
    return { ...base, stuck: false, reason: "near-dryness", latestBrix: latest.brix };
  }

  // The most recent daily reading at least `windowHours` before the latest.
  const cutoff = latest.at.getTime() - windowHours * 3600_000;
  let earlier: { at: Date; brix: number } | null = null;
  for (let i = daily.length - 2; i >= 0; i--) {
    if (daily[i].at.getTime() <= cutoff) {
      earlier = daily[i];
      break;
    }
  }
  if (!earlier) {
    return { ...base, stuck: false, reason: "insufficient-window", latestBrix: latest.brix };
  }

  const dropOverWindow = Math.round((earlier.brix - latest.brix) * 100) / 100;
  const stuck = dropOverWindow < minDrop;
  return {
    stuck,
    reason: stuck ? "flat-brix" : "dropping",
    latestBrix: latest.brix,
    earlierBrix: earlier.brix,
    dropOverWindow,
    windowHours,
  };
}
