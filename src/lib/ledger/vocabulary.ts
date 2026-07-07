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
  // ── Phase 5 blends ──
  "BLEND", // draw from N parent lots into one child lot (new or grown) — originates lineage
  // ── Phase 6 state transforms ──
  "CRUSH", // consume harvest picks → originate a MUST lot at measured liters (kg = metadata)
  "PRESS", // split a must/wine lot into free-run + press fraction child lots (1 parent → N)
  "SAIGNEE", // bleed juice off a MUST lot pre-ferment (the same split, form MUST→JUICE)
  // ── Phase 7 sparkling (bottle-as-continuable-container) ──
  "TIRAGE", // bottle a bulk lot into an en-tirage bottle lot (+ liqueur de tirage)
  "RIDDLING", // remuage — a zero-volume work step
  "DISGORGEMENT", // eject the lees plug — a per-bottle volume LOSS (partial = a SPLIT)
  "DOSAGE", // liqueur d'expédition — adds volume back and sets the sweetness style
  "FINISH", // close the bottled lot into a sellable WineSku (shared materialization core)
  // ── Phase 14: tax determination + removal/used-for dispositions (TTB F 5120.17 A14–A23 / B8–B14) ──
  "REMOVE_TAXPAID", // wine removed/used out of bond; the disposition (reason) picks the form line
  // ── Phase 2: bond + tax-class model (BOND-1 / TAXPAID-1) ──
  "TRANSFER_IN_BOND", // move wine across bonds — one balanced op, symmetric removed(§A15/§B9)/received(§A7/§B3)
  "RETURN_TO_BOND", // refund-flagged re-admission of tax-paid wine (§B4) — the ONLY way past the TAXPAID-1 terminal state
  // CHANGE_OWNERSHIP is DEFERRED (Phase-2 OQ-1: needs alternate-proprietor logic) — not in this list.
] as const;
export type OperationType = (typeof OPERATION_TYPES)[number];

/**
 * Phase 6 fermentation state — THREE orthogonal vectors, NOT a linear phase enum
 * (council C1). `afState` (alcoholic ferment) + `mlfState` (malolactic) live on the Lot
 * alongside the physical `LotForm`. STUCK is DERIVED from the Brix trend (council C3),
 * never a stored state. Mirrors the Prisma enums AlcoholicFermState / MalolacticState.
 */
export const ALCOHOLIC_FERM_STATES = ["NONE", "ACTIVE", "DRY"] as const;
export type AlcoholicFermState = (typeof ALCOHOLIC_FERM_STATES)[number];

export const MALOLACTIC_STATES = ["NONE", "ACTIVE", "COMPLETE"] as const;
export type MalolacticState = (typeof MALOLACTIC_STATES)[number];

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

/**
 * Phase 7 (K3): the account a ledger line touches. Mirrors the Prisma `LedgerBucket` enum.
 * VESSEL = wine in a tank/barrel; EXTERNAL = left the cellar (seed-in, loss-out, bottle-out);
 * BOTTLE_STORAGE = wine-in-bottle (an en-tirage lot). The explicit discriminator lets Phase 8
 * tell wine-in-bottle from wine-gone, rather than overloading `vesselId = null`.
 */
export const LEDGER_BUCKETS = ["VESSEL", "EXTERNAL", "BOTTLE_STORAGE"] as const;
export type LedgerBucket = (typeof LEDGER_BUCKETS)[number];

/** Reason tag on an external (vesselId = null) ledger line. */
export const LINE_REASONS = [
  "seed",
  "loss",
  "bottle",
  "deplete",
  "adjust",
  "topping", // Phase 3: the +volume leg when topping from a keg lot
  "filtration", // Phase 3: volume lost to the filter medium
  "evaporation", // Phase 3: angel's share — DERIVED from topping, not a recorded event
  "dump", // Phase 3: deliberate disposal of wine (the standalone LOSS op)
  // Phase 6: the −V counter-leg of a CRUSH that ORIGINATES a must lot from harvest fruit.
  // It is origination-from-harvest (kg→L birth, D8), NOT loss — explicitly EXCLUDED from
  // shrink/loss reports (loss totals filter reason === "loss" only). See council S8.
  "crush_origination",
  // Phase 7 sparkling: the +volume counter-leg when liqueur d'expédition (dosage) enters a
  // bottle lot from outside. NOT loss (loss reports filter reason === "loss"), so it needs its
  // own tag. Tirage draws vessel→bottle (no external leg) and disgorgement is a real "loss".
  "dosage",
  // Phase 14: the external out-leg of a REMOVE_TAXPAID op (wine removed/used out of bond). The
  // SPECIFIC disposition (TAXPAID/EXPORT/…) that picks the §A/§B form line lives in the op's
  // metadata.disposition (authoritative); this generic tag keeps the line self-describing.
  "tax_removal",
  // Phase 2 (TAXPAID-1): the external counter-leg of a RETURN_TO_BOND op — refund-flagged re-admission
  // of tax-paid wine BACK into bond (the vessel +V leg posts §A11 "taxpaid wine returned to bulk").
  // The ONLY sanctioned way past the REMOVE_TAXPAID terminal state. NOT loss (excluded from loss reports).
  "tax_return",
] as const;
export type LineReason = (typeof LINE_REASONS)[number];

/**
 * Functional-zero threshold in liters. A residual balance at or below this (centiliter
 * granularity — matches Decimal(10,2)) is swept to zero so the projection never
 * accumulates microscopic lot fractions ("dust"). See docs/INVARIANTS.md.
 */
export const FUNCTIONAL_ZERO_L = 0.01;
