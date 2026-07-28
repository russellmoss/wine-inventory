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
  afState: "NONE" | "ACTIVE" | "DRY" | null;
  mlfState: "NONE" | "ACTIVE" | "COMPLETE" | null;
  /** `computeFill().over` — filled beyond nominal capacity. */
  over: boolean;
  /** ISO timestamp of the newest non-voided reading on this vessel, or null. */
  lastReadingAt: string | null;
  /** Injected, never read from the clock inside — the caller owns "now" so this stays pure. */
  now: string;
  staleReadingHours?: number;
};

function isFermenting(i: TankStateInput): boolean {
  return i.afState === "ACTIVE" || i.mlfState === "ACTIVE";
}

function readingIsStale(i: TankStateInput): boolean {
  const limit = i.staleReadingHours ?? STALE_READING_HOURS;
  // No reading at all on an active ferment is the worst case, not an unknown one.
  if (i.lastReadingAt == null) return true;
  const last = Date.parse(i.lastReadingAt);
  const now = Date.parse(i.now);
  if (Number.isNaN(last) || Number.isNaN(now)) return false;
  return now - last > limit * 3_600_000;
}

/**
 * Precedence is deliberate: attention beats fermenting. A tank that is both actively
 * fermenting AND over capacity needs a person before it needs a label describing what it
 * is doing. Empty wins outright, because an empty vessel cannot be over or fermenting.
 */
export function tankState(i: TankStateInput): TankState {
  if (!i.hasWine) return "empty";
  if (i.over) return "attention";
  if (isFermenting(i)) return readingIsStale(i) ? "attention" : "fermenting";
  return "aging";
}
