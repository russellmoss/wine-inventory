import { round2 } from "@/lib/bottling/draw";
import { FUNCTIONAL_ZERO_L } from "@/lib/ledger/vocabulary";

// Pure occupancy-window computation for a single vessel (plan 045, Unit 2). No prisma,
// no server imports — folded per-vessel and unit-tested directly. The caller pre-aggregates
// the vessel's ledger lines into ONE `deltaL` per operation (the SUM of that op's lines whose
// vesselId is THIS vessel), so a rack A→B contributes −δ to A and +δ to B on separate,
// unambiguous running totals (sidesteps within-op source/dest ordering — Codex #3).
//
// The "occupancy window" is the vessel's CURRENT fill: everything since the vessel was last
// empty. History + the ferment graphs scope to it. The immutable ledger is never deleted —
// this only derives the scope boundary, matching how the `vessel_lot` projection sweeps a
// residual ≤ FUNCTIONAL_ZERO_L to zero (the row drops). See docs/architecture + plan 045.

/** One per-op aggregate for a single vessel: the op id, when it was observed, and the SUM of
 *  that op's lines whose vesselId is THIS vessel. `observedAt` may arrive as a Date or an ISO
 *  string (loaders vary); both are accepted and normalized. */
export type VesselOpAggregate = {
  opId: number;
  observedAt: Date | string;
  deltaL: number;
};

/** A CLEAN / SANITIZE / STEAM VesselActivityEvent — a hard window boundary (see below). */
export type VesselResetEvent = {
  at: Date | string;
};

export type OccupancyWindowOpts = {
  /** CLEAN/SANITIZE/STEAM vessel-activity events. The most recent one at-or-before "now" is a
   *  hard reset boundary (Gemini G1 circuit-breaker). Optional. */
  resetEvents?: VesselResetEvent[];
};

/**
 * The vessel's current occupancy window: `{ startOpId, startAt }`, or `null` if the vessel is
 * currently empty (or has no activity). `startAt` is an ISO string; `startOpId` is the op that
 * (re)filled the vessel, or `null` when a reset event — not a volume op — begins the window.
 */
export type OccupancyWindow = {
  /** The op id that raised the running total above FUNCTIONAL_ZERO_L after the last empty.
   *  `null` when a reset event (CLEAN/SANITIZE/STEAM) is the later, governing boundary — the
   *  downstream loader then filters ledger ops by `observedAt >= startAt`. */
  startOpId: number | null;
  /** ISO timestamp the window starts at (the later of the volume fill and the latest reset). */
  startAt: string;
};

const toDate = (d: Date | string): Date => (d instanceof Date ? d : new Date(d));

/**
 * Compute the current occupancy window for ONE vessel from its per-op volume aggregates.
 *
 * Volume fold: sort ascending by opId, keep a running total (rounded to 2 dp each step, so the
 * fold stays exact at centiliter granularity like the projection). The window opens on the op
 * that lifts a functionally-empty vessel above FUNCTIONAL_ZERO_L, and is cleared whenever the
 * total drops back to ≤ the epsilon. The last surviving open is the current window.
 *
 * Circuit-breaker (Gemini G1 — "dirty empty"): volume alone misses a rack-out that leaves a
 * lees heel (never crosses FUNCTIONAL_ZERO_L) before a wash + refill, which would merge two
 * vintages. So the effective window start is the LATER of the volume fill's `startAt` and the
 * latest CLEAN/SANITIZE/STEAM `resetEvent.at` that is ≤ now — a clean/sanitize/steam happens
 * only on an emptied vessel, so it forces a fresh window. If a reset is the later boundary,
 * `startOpId` is null (there is no fill op to pin) and the downstream loader filters by
 * `observedAt >= startAt`. Assumption: a clean implies the vessel was empty; cleaning a
 * partially-full vessel would over-reset (rare; accepted v1 — revisit if reported).
 *
 * Returns null if the vessel is currently empty (running total ≤ epsilon at the end) or has no
 * events.
 */
export function currentOccupancyWindow(
  events: VesselOpAggregate[],
  opts: OccupancyWindowOpts = {},
): OccupancyWindow | null {
  if (events.length === 0) return null;

  // Sort ascending by op id — the monotonic fold order (volume truth). Copy first (pure).
  const ordered = [...events].sort((a, b) => a.opId - b.opId);

  let running = 0;
  let windowStart: { startOpId: number; startAt: Date } | null = null;

  for (const ev of ordered) {
    const wasEmpty = running <= FUNCTIONAL_ZERO_L;
    running = round2(running + ev.deltaL);
    if (wasEmpty && running > FUNCTIONAL_ZERO_L) {
      // Empty → non-empty: this op opens a new occupancy window.
      windowStart = { startOpId: ev.opId, startAt: toDate(ev.observedAt) };
    } else if (running <= FUNCTIONAL_ZERO_L) {
      // Dropped back to functional-empty: close the window.
      windowStart = null;
    }
  }

  // Currently empty (or never filled) → no window, regardless of reset events.
  if (windowStart === null) return null;

  // Circuit-breaker: the window start is the LATER of the volume fill and the most recent
  // reset boundary at-or-before now.
  let startOpId: number | null = windowStart.startOpId;
  let startAt: Date = windowStart.startAt;

  const resetEvents = opts.resetEvents ?? [];
  if (resetEvents.length > 0) {
    const now = Date.now();
    let latestReset: Date | null = null;
    for (const r of resetEvents) {
      const at = toDate(r.at);
      if (at.getTime() <= now && (latestReset === null || at.getTime() > latestReset.getTime())) {
        latestReset = at;
      }
    }
    if (latestReset !== null && latestReset.getTime() > startAt.getTime()) {
      // A clean/sanitize/steam happened AFTER the volume fill — start a fresh window there.
      // There is no fill op to pin to, so startOpId is null; the loader filters by startAt.
      startOpId = null;
      startAt = latestReset;
    }
  }

  return { startOpId, startAt: startAt.toISOString() };
}
