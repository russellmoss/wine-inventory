/**
 * Vessel → lot resolution for the work-order builder.
 *
 * A task like ADDITION declares BOTH a vessel and a lot (template-vocabulary.ts), and the builder used to
 * render them as two independent flat dropdowns — so naming a tank still made the winemaker hunt for the
 * lot in a list of every active lot in the winery. The system already knows: `vesselLot` is the
 * authoritative occupancy projection (the same fold the /vessels page reads), and the NL drafter has
 * always pinned the sole resident lot (nl-resolve.ts). This is that same rule, made shared + pure so the
 * manual builder can't drift from the AI path.
 *
 * A vessel holds ONE cohesive liquid (LEDGER-12), so naming the vessel ALWAYS answers "which lot" —
 * there is no ambiguous case left to ask about. The `blend` state this module used to carry, and the
 * "— blend: which lot? —" dropdown it drove, are gone with plan 088: they asked the winemaker to split a
 * tank of wine into parts that do not physically exist. Only an EMPTY vessel has no answer, and it says
 * so rather than offering every lot in the winery.
 *
 * Pure (no Prisma, no React) so the single / empty decision is unit-testable in isolation.
 */

export type LotOption = { id: string; label: string };

/** Which lots a vessel currently holds, keyed by vessel id. A vessel with no entry holds nothing. */
export type LotsByVessel = Record<string, LotOption[]>;

export type VesselLotState =
  /** No vessel chosen yet — we can't narrow anything, so fall back to the full lot list. */
  | { kind: "no-vessel" }
  /** The vessel's wine. The answer is knowable, so resolve it and stop asking. */
  | { kind: "single"; lot: LotOption }
  /** No wine in the vessel. There is no lot to attach to. */
  | { kind: "empty" };

/**
 * Decide the lot field's state from the task's currently-selected vessel.
 * An absent key means the vessel has no `vesselLot` rows, i.e. it is empty.
 *
 * `lotsByVessel` arrives ordered by volume descending (data.ts), so a pre-invariant row that still
 * carries several residents resolves to the wine that is actually in the tank instead of stalling
 * the builder on a question with no physical answer.
 */
export function vesselLotState(vesselId: string | null | undefined, lotsByVessel: LotsByVessel): VesselLotState {
  const id = typeof vesselId === "string" ? vesselId.trim() : "";
  if (!id) return { kind: "no-vessel" };
  const lots = lotsByVessel[id] ?? [];
  if (lots.length === 0) return { kind: "empty" };
  return { kind: "single", lot: lots[0] };
}

/**
 * The lot value a task may legitimately submit, applied BOTH on every validation pass and the moment a
 * new vessel is picked. It pins the vessel's wine and drops anything that isn't actually in there — so a
 * lot left over from a different vessel can never reach the work order.
 *
 * (There used to be a second, vessel-change-only variant that cleared the field for a blend so nobody
 * was shown an answer they hadn't chosen. With one lot per vessel the two rules coincide, so there is
 * one rule.)
 */
export function reconcileLotValue(state: VesselLotState, currentLotId: string): string {
  switch (state.kind) {
    case "no-vessel":
      return currentLotId; // nothing to validate against yet — leave the winemaker's choice alone
    case "single":
      return state.lot.id;
    case "empty":
      return "";
  }
}
