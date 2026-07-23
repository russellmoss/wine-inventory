import type { AlcoholicFermState, LotForm, MalolacticState } from "@/lib/ledger/vocabulary";
import type { WineTaxClass } from "@/lib/compliance/types";

/**
 * LEDGER-12 — the ONE decision every combining operation shares (plan 088, Unit 4).
 *
 * A vessel holds one cohesive liquid. So the moment wine enters an occupied vessel, its
 * identity has to be resolved right there, in the operation — the same question InnoVint asks
 * at every movement (retain / combine with existing / create new). Racking, crushing, pressing,
 * topping, seeding, splitting and blending all route through here so they cannot drift.
 *
 *   destination empty ........................ KEEP      (plain move)
 *   destination holds the SAME lot ........... KEEP      (a merge, not a blend)
 *   destination holds a DIFFERENT lot ........ ABSORB    (default — the physical truth)
 *                                              NEW_BLEND (explicit escape, mints a child)
 *
 * ABSORB makes the arriving wine take on the RESIDENT's identity. That is right when they are
 * the same kind of thing and wrong the moment they are not — so it is refused across tax class,
 * ownership, bond, physical form, and ferment state. Tax class is the sharp one: silently
 * inheriting the resident's class misreports TTB 5120.17 lines 5 and 20 (produced by / used for
 * blending), which is exactly the hazard InnoVint documents in its own blend guidance.
 *
 * Pure — no DB, no Prisma. The caller supplies each lot's already-derived state (tax class comes
 * from deriveTaxClass with the as-of ABV, bond from the point-in-time bond resolver). Every
 * field is REQUIRED on purpose: a caller that forgets to load one is a type error, not a
 * silently permissive decision.
 */

export const COMBINE_MODES = ["KEEP", "ABSORB", "NEW_BLEND"] as const;
export type CombineMode = (typeof COMBINE_MODES)[number];

/** A lot's identity-relevant state at the moment of the combine. No optional fields (see above). */
export type CombineLotState = {
  lotId: string;
  /** The human code. Refusal copy uses this — a winemaker never sees an internal id. */
  lotCode: string;
  form: LotForm;
  afState: AlcoholicFermState;
  mlfState: MalolacticState;
  /** Derived by the caller via deriveTaxClass() with the as-of ABV. */
  taxClass: WineTaxClass;
  ownership: "ESTATE" | "CUSTOM_CRUSH_CLIENT";
  /** Point-in-time bond affiliation (BOND-1). null when the tenant has no bonds configured. */
  bondId: string | null;
};

export type CombineRefusalReason =
  | "destination-already-co-resident"
  | "keep-needs-empty-destination"
  | "multi-incoming-needs-new-blend"
  | "tax-class-mismatch"
  | "ownership-mismatch"
  | "bond-mismatch"
  | "form-mismatch"
  | "ferment-state-mismatch";

export type CombineDecision =
  | { ok: true; mode: CombineMode; residentLotId: string | null }
  | {
      ok: false;
      reason: CombineRefusalReason;
      /** Winery language, names the wines, and always says what to do instead (no dead ends). */
      message: string;
      /** Set when the refusal HAS a legal escape the caller can offer as a button. */
      requires?: "NEW_BLEND";
    };

export type CombineRouteInput = {
  /** The destination's current residents. Empty = the vessel is empty. */
  destResidentLots: CombineLotState[];
  /** The lots the operation is putting into that destination (may repeat one lot). */
  incoming: CombineLotState[];
  /** The winemaker's explicit choice, when they made one. */
  explicit?: CombineMode;
};

const FORM_LABEL: Record<LotForm, string> = {
  FRUIT: "fruit",
  MUST: "must",
  JUICE: "juice",
  WINE: "wine",
  BOTTLED_IN_PROCESS: "wine in bottle",
  FINISHED: "finished wine",
};

/** Distinct lot ids, order-preserving. */
function distinct(lots: CombineLotState[]): CombineLotState[] {
  const seen = new Set<string>();
  return lots.filter((l) => (seen.has(l.lotId) ? false : (seen.add(l.lotId), true)));
}

/**
 * Is absorbing `incoming` into `resident` legal? Absorb means the arriving wine ADOPTS the
 * resident's identity, so anything that makes them different things in the eyes of the cellar,
 * the TTB, or the customer blocks it.
 */
function checkAbsorbLegality(resident: CombineLotState, incoming: CombineLotState): CombineDecision | null {
  // Plan 093 Unit 6 (council C2): a cross-OWNER absorb is ALLOWED — refusing it deadlocks the daily
  // topping op (facility wine into a client barrel). The receiving/resident owner dominates the scalar
  // result; the consumed minority owner's fraction is billed via emitBillableConsumption at execution, not
  // blocked here. (Cross-BOND is still refused below — that IS a real TTB boundary needing a transfer.)
  if (resident.bondId !== incoming.bondId) {
    return {
      ok: false,
      reason: "bond-mismatch",
      message:
        `${incoming.lotCode} and ${resident.lotCode} are under different bonds. ` +
        `Record a bond-to-bond transfer first, then combine them.`,
    };
  }

  if (resident.form !== incoming.form) {
    return {
      ok: false,
      reason: "form-mismatch",
      message:
        `${incoming.lotCode} is ${FORM_LABEL[incoming.form]} and ${resident.lotCode} is ` +
        `${FORM_LABEL[resident.form]}. Send it to its own vessel, or finish processing it first.`,
    };
  }

  if (resident.afState !== incoming.afState || resident.mlfState !== incoming.mlfState) {
    return {
      ok: false,
      reason: "ferment-state-mismatch",
      message:
        `${incoming.lotCode} and ${resident.lotCode} aren't at the same stage of fermentation, ` +
        `so combining them would misreport both. Send it to its own vessel, or wait until they match.`,
    };
  }

  // Tax class LAST: unlike the others it has a legal escape (mint a new blend lot and the class
  // is re-derived from the combined wine), so we only offer that once nothing else is blocking.
  if (resident.taxClass !== incoming.taxClass) {
    return {
      ok: false,
      reason: "tax-class-mismatch",
      requires: "NEW_BLEND",
      message:
        `${incoming.lotCode} and ${resident.lotCode} report under different tax classes, so ` +
        `${incoming.lotCode} can't simply join ${resident.lotCode}. Create a new blend lot to combine them.`,
    };
  }

  return null;
}

/** Decide how an operation putting `incoming` into a destination should resolve lot identity. */
export function decideCombineRoute(input: CombineRouteInput): CombineDecision {
  const residents = distinct(input.destResidentLots);
  const incoming = distinct(input.incoming);

  // Reachable only before the live collapse (Unit 12) has run. After the invariant is on, the
  // DB makes this state impossible.
  if (residents.length > 1) {
    return {
      ok: false,
      reason: "destination-already-co-resident",
      message:
        `That vessel is still recorded as holding ${residents.length} separate wines ` +
        `(${residents.map((r) => r.lotCode).join(", ")}). Sort out what's actually in it before moving wine in.`,
    };
  }

  const resident = residents[0] ?? null;

  // ── Empty destination ──────────────────────────────────────────────────────
  if (!resident) {
    // One lot arriving keeps its identity. Several arriving ARE a blend on arrival.
    return { ok: true, mode: incoming.length > 1 ? "NEW_BLEND" : "KEEP", residentLotId: null };
  }

  // ── Destination holds exactly the lot that is arriving ──────────────────────
  const allSameAsResident = incoming.length > 0 && incoming.every((i) => i.lotId === resident.lotId);
  if (allSameAsResident) {
    return { ok: true, mode: "KEEP", residentLotId: resident.lotId };
  }

  // ── Destination holds a DIFFERENT lot ──────────────────────────────────────
  if (input.explicit === "KEEP") {
    return {
      ok: false,
      reason: "keep-needs-empty-destination",
      message:
        `${resident.lotCode} is already in that vessel, so ${incoming[0]?.lotCode ?? "this wine"} can't stay separate there. ` +
        `Pick an empty vessel to keep it on its own.`,
    };
  }

  // Bond is absolute — it blocks even the new-blend escape, so it is checked before the mode branches.
  // (Ownership is NOT — Plan 093 Unit 6 allows cross-owner combines, billed at execution.)
  for (const i of incoming) {
    if (resident.bondId !== i.bondId) {
      return checkAbsorbLegality(resident, i)!;
    }
  }

  if (input.explicit === "NEW_BLEND") {
    return { ok: true, mode: "NEW_BLEND", residentLotId: resident.lotId };
  }

  // Two or more DIFFERENT wines arriving into an occupied vessel is a three-way blend. Absorbing
  // would quietly pick the resident's identity for all of them, so make the winemaker say so.
  if (incoming.length > 1) {
    return {
      ok: false,
      reason: "multi-incoming-needs-new-blend",
      requires: "NEW_BLEND",
      message:
        `${incoming.map((i) => i.lotCode).join(" and ")} are both going into a vessel that already holds ` +
        `${resident.lotCode}. Create a new blend lot for the result, or move them separately.`,
    };
  }

  const blocked = checkAbsorbLegality(resident, incoming[0]);
  if (blocked) return blocked;

  return { ok: true, mode: "ABSORB", residentLotId: resident.lotId };
}
