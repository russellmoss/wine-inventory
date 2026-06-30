import type { AlcoholicFermState, MalolacticState, LotForm } from "@/lib/ledger/vocabulary";

// Phase 6 Unit 5: the THREE orthogonal fermentation vectors (council C1) — physical `form`
// (LotForm) × alcoholic-ferment state × malolactic state — and the legal combinations + the
// transitions each allows. PURE: no DB, unit-tested before any UI/action wires it. Form is
// mutable only through these transitions (direct writes banned); origin/code/provenance stay
// immutable.

export type LotState = { form: LotForm; afState: AlcoholicFermState; mlfState: MalolacticState };

export type StateVector = "FORM" | "AF" | "MLF";

/**
 * Is this (form × af × mlf) combination coherent?
 *
 * - FRUIT: uncrushed — no ferment can be running (af/mlf NONE).
 * - MUST: the widest — on skins through the whole red lifecycle. Cold soak (AF NONE), primary
 *   (AF ACTIVE), extended maceration dry-on-skins (AF DRY); MLF may co-occur (co-inoculation).
 * - JUICE: white/rosé off skins, pre/peri primary. Once dry it becomes WINE, so AF DRY on JUICE
 *   is incoherent. MLF may run or be complete.
 * - WINE: off skins / finished primary. AF DRY (fermented to dryness in-system) OR NONE (a
 *   legacy/seeded wine that was never fermented THROUGH this system — the migration default).
 *   AF ACTIVE on a WINE is incoherent (it'd still be JUICE/MUST). MLF any.
 */
export function isLegalState(s: LotState): boolean {
  switch (s.form) {
    case "FRUIT":
      return s.afState === "NONE" && s.mlfState === "NONE";
    case "MUST":
      return true; // every af × mlf combination is reachable on skins
    case "JUICE":
      return s.afState === "NONE" || s.afState === "ACTIVE";
    case "WINE":
      return s.afState === "NONE" || s.afState === "DRY";
    case "BOTTLED_IN_PROCESS":
    case "FINISHED":
      return true; // packaging forms — ferment vectors are historical, not constrained here
    default:
      return false;
  }
}

export type TransitionInput = { kind: StateVector; to: string };

export type TransitionResult = {
  next: LotState;
  event: { kind: StateVector; fromValue: string; toValue: string };
  /** true when this transition also flipped `form` as a side effect (white AF→DRY → WINE). */
  formAutoFlipped: boolean;
};

const AF_ORDER: AlcoholicFermState[] = ["NONE", "ACTIVE", "DRY"];
const MLF_ORDER: MalolacticState[] = ["NONE", "ACTIVE", "COMPLETE"];

/**
 * Plan a single-vector transition and return the resulting full state (or throw on an illegal
 * move). Rules:
 *  - AF advances NONE→ACTIVE→DRY (no skips, no rewind). When AF reaches DRY on a JUICE lot the
 *    wine is off skins and dry → `form` auto-flips to WINE. On a MUST lot it stays MUST
 *    (extended maceration — dry on skins); the form→WINE flip there happens at PRESS.
 *  - MLF advances NONE→ACTIVE→COMPLETE (independent of AF — co-inoculation is legal).
 *  - FORM transitions are limited to the real physical path: MUST→JUICE (saignée/white press),
 *    MUST→WINE and JUICE→WINE. A move INTO WINE requires AF=DRY (you can't skip fermentation to
 *    reach wine — this is the plan's "form=WINE while afState=NONE" guard, applied to the
 *    transition rather than to legacy seeded wine).
 * The resulting state must satisfy `isLegalState`.
 */
export function planStateTransition(lot: LotState, input: TransitionInput): TransitionResult {
  const next: LotState = { ...lot };
  let formAutoFlipped = false;
  let fromValue: string;

  if (input.kind === "AF") {
    fromValue = lot.afState;
    const to = input.to as AlcoholicFermState;
    if (!AF_ORDER.includes(to)) throw new Error(`Unknown alcoholic-ferment state "${input.to}".`);
    const fromIdx = AF_ORDER.indexOf(lot.afState);
    const toIdx = AF_ORDER.indexOf(to);
    if (toIdx === fromIdx) throw new Error(`Alcoholic ferment is already ${to}.`);
    if (toIdx !== fromIdx + 1) {
      throw new Error(`Alcoholic ferment goes NONE→ACTIVE→DRY one step at a time (not ${lot.afState}→${to}).`);
    }
    next.afState = to;
    if (to === "DRY" && lot.form === "JUICE") {
      next.form = "WINE"; // white/rosé pressed-off juice, now dry → wine
      formAutoFlipped = true;
    }
  } else if (input.kind === "MLF") {
    fromValue = lot.mlfState;
    const to = input.to as MalolacticState;
    if (!MLF_ORDER.includes(to)) throw new Error(`Unknown malolactic state "${input.to}".`);
    const fromIdx = MLF_ORDER.indexOf(lot.mlfState);
    const toIdx = MLF_ORDER.indexOf(to);
    if (toIdx === fromIdx) throw new Error(`Malolactic is already ${to}.`);
    if (toIdx !== fromIdx + 1) {
      throw new Error(`Malolactic goes NONE→ACTIVE→COMPLETE one step at a time (not ${lot.mlfState}→${to}).`);
    }
    next.mlfState = to;
  } else if (input.kind === "FORM") {
    fromValue = lot.form;
    const to = input.to as LotForm;
    const legalForm: Record<string, LotForm[]> = {
      MUST: ["JUICE", "WINE"],
      JUICE: ["WINE"],
    };
    if (!(legalForm[lot.form] ?? []).includes(to)) {
      throw new Error(`Can't change form ${lot.form}→${to}.`);
    }
    if (to === "WINE" && lot.afState !== "DRY") {
      throw new Error("A lot can only become WINE once alcoholic ferment is dry.");
    }
    next.form = to;
  } else {
    throw new Error(`Unknown state vector "${input.kind}".`);
  }

  if (!isLegalState(next)) {
    throw new Error(`Illegal resulting state: ${next.form} / AF:${next.afState} / MLF:${next.mlfState}.`);
  }
  return { next, event: { kind: input.kind, fromValue, toValue: input.to }, formAutoFlipped };
}

/**
 * PURE planning helper for the state-transition action: given the current state + a requested
 * vector move, return the minimal DB update payload + the event payload (or throw on an illegal
 * move). Keeps the "use server" action thin + lets this stay unit-testable.
 */
export function planLotStateUpdate(
  current: LotState,
  input: TransitionInput,
): {
  update: Partial<Pick<LotState, "form" | "afState" | "mlfState">>;
  event: { kind: StateVector; fromValue: string; toValue: string };
  formAutoFlipped: boolean;
} {
  const r = planStateTransition(current, input);
  const update: Partial<LotState> = {};
  if (r.next.form !== current.form) update.form = r.next.form;
  if (r.next.afState !== current.afState) update.afState = r.next.afState;
  if (r.next.mlfState !== current.mlfState) update.mlfState = r.next.mlfState;
  return { update, event: r.event, formAutoFlipped: r.formAutoFlipped };
}

/** Primary ferment is "dry" at roughly −1.5 °Bx (sugar gone, density ~0.992–0.996). */
export function isDry(brix: number, threshold = -1.5): boolean {
  return brix <= threshold;
}

/** MLF is complete when malic acid falls below ~0.1–0.3 g/L (default 0.3). */
export function mlfComplete(malicGL: number, threshold = 0.3): boolean {
  return malicGL < threshold;
}
