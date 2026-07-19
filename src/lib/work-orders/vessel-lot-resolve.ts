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
 * Correctness over convenience: a vessel holding MULTIPLE lots (a blend) or ZERO lots must NEVER be
 * silently resolved to one lot. A blend narrows the picker to its residents and still asks; an empty
 * vessel has nothing to attach and says so. Only an unambiguous single resident auto-resolves.
 *
 * Pure (no Prisma, no React) so the single / blend / empty decision is unit-testable in isolation.
 */

export type LotOption = { id: string; label: string };

/** Which lots a vessel currently holds, keyed by vessel id. A vessel with no entry holds nothing. */
export type LotsByVessel = Record<string, LotOption[]>;

export type VesselLotState =
  /** No vessel chosen yet — we can't narrow anything, so fall back to the full lot list. */
  | { kind: "no-vessel" }
  /** Exactly one resident lot: the answer is knowable, so resolve it and stop asking. */
  | { kind: "single"; lot: LotOption }
  /** A blend. Genuinely ambiguous — narrow to the residents and make the human choose. */
  | { kind: "blend"; lots: LotOption[] }
  /** No wine in the vessel. There is no lot to attach to. */
  | { kind: "empty" };

/**
 * Decide the lot field's state from the task's currently-selected vessel.
 * An absent key means the vessel has no `vesselLot` rows, i.e. it is empty.
 */
export function vesselLotState(vesselId: string | null | undefined, lotsByVessel: LotsByVessel): VesselLotState {
  const id = typeof vesselId === "string" ? vesselId.trim() : "";
  if (!id) return { kind: "no-vessel" };
  const lots = lotsByVessel[id] ?? [];
  if (lots.length === 0) return { kind: "empty" };
  if (lots.length === 1) return { kind: "single", lot: lots[0] };
  return { kind: "blend", lots };
}

/**
 * VALIDATION-time reconcile: the lot value a task may legitimately submit. Keeps an explicit choice that
 * is resident in the vessel, pins the sole lot of a single-lot vessel, and drops anything that isn't
 * actually in there — so a lot left over from a different vessel can never reach the work order.
 */
export function reconcileLotValue(state: VesselLotState, currentLotId: string): string {
  switch (state.kind) {
    case "no-vessel":
      return currentLotId; // nothing to validate against yet — leave the winemaker's choice alone
    case "single":
      return state.lot.id;
    case "blend":
      return state.lots.some((l) => l.id === currentLotId) ? currentLotId : "";
    case "empty":
      return "";
  }
}

/**
 * VESSEL-CHANGE-time reconcile: what the lot field becomes the moment a new vessel is picked.
 *
 * Differs from reconcileLotValue in exactly one case, and it's the one that matters: a BLEND always
 * clears. A carried-over value would show up pre-filled on a multi-lot vessel — and since the previous
 * value may itself have been auto-resolved from a different single-lot vessel, the winemaker would be
 * looking at an answer nobody chose. A blend must be answered deliberately, for THIS vessel, every time.
 * (Once they do pick, reconcileLotValue keeps it — this only fires on a vessel change.)
 */
export function lotValueForNewVessel(state: VesselLotState, currentLotId: string): string {
  return state.kind === "blend" ? "" : reconcileLotValue(state, currentLotId);
}
