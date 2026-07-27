// Spray Intelligence S5a — the latent-infection resolution rules. PURE: no Prisma, no I/O, no
// clock. `today` is always injected by the caller (site-time-core resolves it) — never `new Date()`
// in here, which is the bug plan 096 Phase 0 fixed.
//
// Deliberately NOT `*Core`-suffixed: like units-core.ts these are domain rules consumed by the
// ledger core, not a capability of their own, so they stay out of the verify:ai-native matrix.

import type { InfectionHostOrgan, InfectionPathogen, InfectionProjectionKind, InfectionResolutionKind } from "@prisma/client";

// ── The latent-period interval, and why it is an INTERVAL ──────────────────────────────────────
//
// The powdery literature does not agree, and the disagreement is roughly 2x:
//   Delp 1954 ................. 5 d at optimum, 25 d at 9 C, limits 6-32 C
//   Chellemi & Marois 1991 .... 5 d at 22-30 C, 7 d at 19 C
//   UC IPM .................... 7-10 d
//   Cornell ................... 5-7 d generation
//   Bendek et al. 2007 ........ 13-14 d at 20-23 C  <- roughly double the rest
// Bendek is most likely measuring a different endpoint (first sporulation on heavily-inoculated
// detached leaves, vs naked-eye colonies on whole vines). Unconfirmed.
//
// KD-4, AND THIS IS THE SAFETY BUG COUNCIL CAUGHT (C1): the plan's first draft resolved the
// conflict by holding events open on the "conservative (longer)" bound. That is INVERTED for the
// transition that matters. In epidemiology a LONGER latent period is the LESS cautious assumption:
// telling a grower an infection will not be infectious for fourteen days makes them wait, and if
// the true period is five days the pathogen sporulates on day five and seeds a secondary epidemic
// while the ledger still reads "incubating".
//
// The conflict does not need resolving. It becomes the two ends of one interval, each used where it
// is safe — which is independent confirmation that the two-transition design (KD-3b) is right,
// because a single date could not express this. NEVER average these.
export const POWDERY_LATENT_SHORT_DAYS = 5;
export const POWDERY_LATENT_LONG_DAYS = 14;

export const POWDERY_SHORT_BASIS =
  "Delp 1954; Chellemi & Marois 1991 — shortest plausible latent period. Used for infectiousExpectedAt because assuming LATER under-warns (KD-4).";
export const POWDERY_LONG_BASIS =
  "Bendek et al. 2007 (13-14 d at 20-23 C) — longest plausible latent period. Used for event expiry because closing EARLIER declares a block clean prematurely (KD-4).";
export const POWDERY_SYMPTOM_BASIS =
  "For Erysiphe necator the visible-colony and sporulation endpoints are not separated in the literature (KD-3b: powdery and botrytis conflate them, unlike black rot and downy). This date is the infectious date; it is not independent evidence.";

/** Day-count bounds per pathogen. One entry, because S5a implements one pathogen. */
export const LATENT_BOUNDS: Record<InfectionPathogen, { shortDays: number; longDays: number }> = {
  POWDERY_MILDEW: { shortDays: POWDERY_LATENT_SHORT_DAYS, longDays: POWDERY_LATENT_LONG_DAYS },
};

/** UTC-anchored date math on ISO YYYY-MM-DD, matching phenology/read.ts's local addDays. */
export function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

export interface ProjectionInput {
  pathogen: InfectionPathogen;
  hostOrgan: InfectionHostOrgan;
  resolutionKind: InfectionResolutionKind;
  /** ISO YYYY-MM-DD — the day the infection is believed to have occurred. */
  infectionOccurredOn: string;
}

export interface Projection {
  symptomExpectedAt: string | null;
  symptomProjectionKind: InfectionProjectionKind;
  symptomBasis: string | null;
  infectiousExpectedAt: string | null;
  infectiousProjectionKind: InfectionProjectionKind;
  infectiousBasis: string | null;
  expiresOn: string | null;
  latentShortDays: number | null;
  latentLongDays: number | null;
}

/**
 * Project the two transitions and the expiry from an infection date.
 *
 * The asymmetry below looks like a bug until you know why it is there, so it is stated in the code
 * rather than left to the schema comment: `infectiousExpectedAt` uses the SHORT bound and
 * `expiresOn` uses the LONG one. They are not two attempts at the same number.
 */
export function projectTransitions(input: ProjectionInput): Projection {
  if (input.resolutionKind !== "FIXED_WINDOW") {
    // UNKNOWN and ERADICATED project nothing. `UNKNOWN` is a first-class arm (rule §3.3), not a
    // failure to compute, and the DB CHECK refuses a projected date on it.
    return {
      symptomExpectedAt: null,
      symptomProjectionKind: "UNKNOWN",
      symptomBasis: null,
      infectiousExpectedAt: null,
      infectiousProjectionKind: "UNKNOWN",
      infectiousBasis: null,
      expiresOn: null,
      latentShortDays: null,
      latentLongDays: null,
    };
  }

  const bounds = LATENT_BOUNDS[input.pathogen];
  const infectiousAt = addDaysIso(input.infectionOccurredOn, bounds.shortDays);

  return {
    symptomExpectedAt: infectiousAt,
    symptomProjectionKind: "PROJECTED",
    symptomBasis: POWDERY_SYMPTOM_BASIS,
    infectiousExpectedAt: infectiousAt,
    infectiousProjectionKind: "PROJECTED",
    infectiousBasis: POWDERY_SHORT_BASIS,
    expiresOn: addDaysIso(input.infectionOccurredOn, bounds.longDays),
    latentShortDays: bounds.shortDays,
    latentLongDays: bounds.longDays,
  };
}

// ── The resolution evaluator ───────────────────────────────────────────────────────────────────

export type ResolutionOutcome =
  | { close: false; reason: string }
  | { close: true; resolvedOn: string; reason: string };

export interface ResolutionState {
  resolutionKind: InfectionResolutionKind;
  expiresOn: string | null;
  /** Site-local today, injected. */
  today: string;
  /**
   * Whether somebody scouted this block and saw nothing. Passed in DELIBERATELY, and deliberately
   * NOT used to close the event — see KD-5 below. It exists so the reason string can say so.
   */
  scoutedCleanOn?: string | null;
}

/**
 * Decide whether an OPEN event should close.
 *
 * KD-5 — A CLEAN SCOUTING PASS NEVER CLOSES A MODELLED INFECTION EVENT. This is the whole reason
 * the ledger exists, and it is empirically grounded rather than asserted: Fedele et al. 2020
 * (Plant Disease 104(5):1291-1297) scored a Botrytis model at 65% against field assessment but
 * >87% against post-harvest incubation assays of SYMPTOMLESS berries. The model was correctly
 * predicting infections that scouting could not see. "Nobody saw anything" is not "there is
 * nothing there" — and during the latent period there is by definition nothing to see.
 *
 * So `scoutedCleanOn` is accepted and then ignored for the close decision. That is intentional; do
 * not "fix" it by wiring it up.
 */
export function evaluateResolution(state: ResolutionState): ResolutionOutcome {
  switch (state.resolutionKind) {
    case "FIXED_WINDOW": {
      if (!state.expiresOn) {
        return { close: false, reason: "A FIXED_WINDOW event with no expiry cannot resolve itself; it stays open." };
      }
      if (state.today > state.expiresOn) {
        return {
          close: true,
          resolvedOn: state.today,
          reason: `The ${LATENT_BOUNDS.POWDERY_MILDEW.longDays}-day latent window closed on ${state.expiresOn} without the infection being confirmed. Closing on the LONGEST plausible bound, so the block is never declared clean early.`,
        };
      }
      return {
        close: false,
        reason: state.scoutedCleanOn
          ? `Still incubating until ${state.expiresOn}. A clean scouting pass on ${state.scoutedCleanOn} does NOT close this — during the latent period there is nothing to see (KD-5, Fedele et al. 2020).`
          : `Still incubating until ${state.expiresOn}.`,
      };
    }
    case "UNKNOWN":
      // A first-class arm. It never projects a resolution and never self-closes; only an attributed
      // human append can end it.
      return {
        close: false,
        reason: "This event has no projectable resolution rule, so it cannot close itself. It stays open until a person closes it.",
      };
    case "ERADICATED":
      // Already resolved by a kickback spray; there is nothing left to evaluate.
      return { close: false, reason: "Already eradicated; no further resolution to evaluate." };
  }
}

/**
 * Is this event currently a source of inoculum? The question S6 and S7a will actually ask the
 * ledger, and the reason the two transitions could not be collapsed into one date.
 */
export function isInfectious(state: {
  infectiousExpectedAt: string | null;
  infectiousProjectionKind: InfectionProjectionKind;
  status: "OPEN" | "CLOSED" | "VOID";
  today: string;
}): boolean | null {
  if (state.status !== "OPEN") return false;
  // Never guess. An unprojected transition means we do not know, and null is a first-class answer.
  if (state.infectiousProjectionKind !== "PROJECTED" || !state.infectiousExpectedAt) return null;
  return state.today >= state.infectiousExpectedAt;
}
