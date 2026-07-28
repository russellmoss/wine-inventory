/**
 * Tank state (v2 DM-40) — DERIVED, never stored.
 *
 * A stored `state` column would be a second source of truth that drifts the first time
 * anything is corrected, which is the same argument Phase 5 made for the derived
 * `StageIndicator` and it holds here. State is recomputed from the ledger facts on every
 * read: occupancy (`VesselLot`), the lot's two ferment vectors, capacity, and reading recency.
 *
 * Pure and dependency-free — no prisma, no React — so it is unit-testable under the repo's
 * `environment: "node"` vitest config, and so the board and the assistant can share it.
 *
 * NOT `StageIndicator`. That component takes six work-order stages and is work-order-specific.
 * Tank state renders through `StatusChip`, which is what v2 §B18 and doc 03 §14 specify for
 * status: hue + glyph + text, never hue alone.
 */

import type { StatusVariant } from "@/components/ui/status-variants";

export type TankState = "empty" | "fermenting" | "aging" | "attention";

/**
 * Display order. Drives the filter chips, so it reads the way a cellar hand triages:
 * what needs me, then what is working, then what is resting, then what is free.
 */
export const TANK_STATES: readonly TankState[] = ["attention", "fermenting", "aging", "empty"] as const;

export const TANK_STATE_LABEL: Record<TankState, string> = {
  attention: "Needs attention",
  fermenting: "Fermenting",
  aging: "Aging",
  empty: "Empty",
};

/**
 * The `StatusChip` variant per state. Each maps to a DISTINCT glyph in `STATUS_GLYPH`
 * (▲ ◐ ● ○), which is the AC-S24 guarantee: greyscale the screenshot and the four are
 * still told apart, because the glyph and the text carry the meaning and the colour only
 * reinforces it.
 */
export const TANK_STATE_VARIANT: Record<TankState, StatusVariant> = {
  attention: "attention",
  fermenting: "active",
  aging: "done",
  empty: "neutral",
};

/**
 * A fermenting tank with no reading for this long is the classic "needs me today".
 * 24h is the floor most cellars work to during AF; it is a display heuristic, not a rule
 * anyone is held to, so it is a parameter rather than a constant buried in a branch.
 */
export const STALE_READING_HOURS = 24;

export type TankStateInput = {
  /** Does the vessel hold wine? Sourced from `VesselLot`, never from `VesselComponent`. */
  hasWine: boolean;
  /**
   * The ferment vectors of EVERY resident lot, not just the largest. LEDGER-12 says a vessel
   * holds one lot, but nothing in the read path enforces it and this repo has real
   * co-resident fan-out history — so a 1000 L DRY lot beside a 900 L ACTIVE one must not
   * report "aging".
   */
  lots: { afState: "NONE" | "ACTIVE" | "DRY" | null; mlfState: "NONE" | "ACTIVE" | "COMPLETE" | null }[];
  /** `computeFill().over` — filled beyond nominal capacity. */
  over: boolean;
  /**
   * The ledger cannot confirm what is in this vessel (composition on record, no occupancy),
   * or its capacity is unusable. Either way a person should look: it is NOT a free tank.
   */
  unknown?: boolean;
  /** ISO timestamp of the newest non-voided reading on this vessel, or null. */
  lastReadingAt: string | null;
  /** Injected, never read from the clock inside — the caller owns "now" so this stays pure. */
  now: string;
  staleReadingHours?: number;
};

function isFermenting(i: TankStateInput): boolean {
  return i.lots.some((l) => l.afState === "ACTIVE" || l.mlfState === "ACTIVE");
}

/**
 * FAIL TOWARDS A HUMAN. Every uncertain case returns "stale", because the cost of asking a
 * winemaker to glance at a tank is a glance, and the cost of not asking is a stuck ferment
 * nobody looked at.
 *
 * Two shapes previously failed OPEN: an unparseable timestamp returned false, and a
 * FUTURE-dated reading made `now - last` negative so the tank was never stale again for the
 * rest of the vintage. `observedAt` is user-entered and `deviceObservedAt` comes from tablet
 * clocks the schema itself says can be wrong, so one fat-fingered year permanently silenced
 * the attention flag on that vessel.
 */
function readingIsStale(i: TankStateInput): boolean {
  const limit = i.staleReadingHours ?? STALE_READING_HOURS;
  // No reading at all on an active ferment is the worst case, not an unknown one.
  if (i.lastReadingAt == null) return true;
  const last = Date.parse(i.lastReadingAt);
  const now = Date.parse(i.now);
  if (Number.isNaN(last) || Number.isNaN(now)) return true;
  const age = now - last;
  // A reading from the future is a clock or data-entry fault, not a fresh sample.
  if (age < 0) return true;
  return age > limit * 3_600_000;
}

/**
 * Precedence is deliberate: attention beats fermenting. A tank that is both actively
 * fermenting AND over capacity needs a person before it needs a label describing what it
 * is doing. Empty wins outright, because an empty vessel cannot be over or fermenting.
 */
export function tankState(i: TankStateInput): TankState {
  // Unknown outranks empty. Filing a vessel whose contents the ledger cannot confirm under
  // "Empty" hands it to a cellar hand hunting for a free tank.
  if (i.unknown) return "attention";
  if (!i.hasWine) return "empty";
  if (i.over) return "attention";
  if (isFermenting(i)) return readingIsStale(i) ? "attention" : "fermenting";
  return "aging";
}
