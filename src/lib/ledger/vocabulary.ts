// Canonical vocabulary for the Lot + operation ledger (Phase 1 spine).
// These TS constants MIRROR the Prisma enums in schema.prisma — keep them in sync.
// The ledger is the source of truth for bulk wine; invariants live in docs/INVARIANTS.md.

/**
 * Operation types. Controlled + versioned (VISION D4): extend this list per phase,
 * never accept free-text. A correctness-critical ledger uses an enum, not a string.
 */
export const OPERATION_TYPES = [
  "SEED", // wine enters the system (Day-Zero legacy lot, manual create-in-vessel)
  "RACK", // move wine between vessels (optionally losing volume to lees)
  "LOSS", // standalone volume leaving the system (evaporation / angel's share)
  "ADJUST", // correct a vessel's volume to a measured actual
  "DEPLETE", // remove a lot's remaining volume from a vessel
  "BOTTLE", // wine leaves bulk into packaged goods
  "CORRECTION", // compensating reversal of a prior op (VISION D6/D15)
  // ── Phase 3 cellar operations ──
  "ADDITION", // a dose of a material (SO₂, nutrient, acid, tannin) — volume-neutral
  "TOPPING", // top up a vessel from a keg lot (a transfer) — adds volume
  "FINING", // a fining agent (bentonite, gelatin…) — volume-neutral (loss comes at racking)
  "FILTRATION", // filter the wine — small volume loss (~1%)
  "CAP_MGMT", // cap management (pump-over / punch-down) — volume-neutral, near-zero data
] as const;
export type OperationType = (typeof OPERATION_TYPES)[number];

/** A lot's physical form. Changeable over its life (VISION D4). */
export const LOT_FORMS = [
  "FRUIT",
  "MUST",
  "JUICE",
  "WINE",
  "BOTTLED_IN_PROCESS",
  "FINISHED",
] as const;
export type LotForm = (typeof LOT_FORMS)[number];

/** How a record was captured — provenance (VISION D14). */
export const CAPTURE_METHODS = ["MANUAL", "VOICE", "SENSOR", "IMPORT"] as const;
export type CaptureMethod = (typeof CAPTURE_METHODS)[number];

/** Reason tag on an external (vesselId = null) ledger line. */
export const LINE_REASONS = [
  "seed",
  "loss",
  "bottle",
  "deplete",
  "adjust",
  "topping", // Phase 3: the +volume leg when topping from a keg lot
  "filtration", // Phase 3: volume lost to the filter medium
  "evaporation", // Phase 3: angel's share / evaporative loss (a flavour of LOSS)
] as const;
export type LineReason = (typeof LINE_REASONS)[number];

/**
 * Functional-zero threshold in liters. A residual balance at or below this (centiliter
 * granularity — matches Decimal(10,2)) is swept to zero so the projection never
 * accumulates microscopic lot fractions ("dust"). See docs/INVARIANTS.md.
 */
export const FUNCTIONAL_ZERO_L = 0.01;
