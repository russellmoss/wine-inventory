export type PressGuidanceTask = {
  lotId?: string | null;
  sourceVesselId?: string | null;
  plannedPayload?: unknown;
};

export type PressGuidancePosition = {
  vesselId: string;
  vesselCode: string;
  lotId: string;
  lotCode: string;
  form: string;
  status?: string;
  volumeL: number;
};

export type PressGuidanceVessel = { id: string; code: string };

export type PlannedGuidance = {
  items: { label: string; value: string }[];
  plannedDestVesselId: string | null;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function buildPressGuidance(
  task: PressGuidanceTask,
  positions: PressGuidancePosition[],
  vessels: PressGuidanceVessel[],
): PlannedGuidance {
  const planned = asRecord(task.plannedPayload);
  const source = positions.find((p) => p.lotId === task.lotId && (!task.sourceVesselId || p.vesselId === task.sourceVesselId));
  const plannedSourceVesselLabel = asString(planned.plannedSourceVesselLabel);
  const plannedSourceLotCode = asString(planned.plannedSourceLotCode);
  const plannedDestVesselId = asString(planned.plannedDestVesselId);
  const plannedDestLabel = asString(planned.plannedDestVesselLabel) ?? vessels.find((v) => v.id === plannedDestVesselId)?.code ?? null;
  const items: PlannedGuidance["items"] = [];
  if (source) {
    items.push({ label: "Pinned source", value: `${source.vesselCode} / ${source.lotCode}` });
  } else if (plannedSourceVesselLabel || plannedSourceLotCode) {
    items.push({ label: "Pinned source", value: [plannedSourceVesselLabel, plannedSourceLotCode].filter(Boolean).join(" / ") });
  }
  if (plannedDestLabel) items.push({ label: "Destination hint", value: plannedDestLabel });
  if (asString(planned.pressCycle)) items.push({ label: "Press cycle", value: asString(planned.pressCycle)! });
  if (asString(planned.note)) items.push({ label: "Note", value: asString(planned.note)! });
  return { items, plannedDestVesselId };
}

/**
 * The pressable position a task pinned, or null when it pinned nothing (or nothing matches).
 *
 * Honours a PARTIAL pin. It used to require BOTH the lot and the vessel, which was fine while only the
 * assistant could pin a press — it always resolves both. The manual builder now offers either one on
 * its own (feedback cmsf3vmlw0000l704pnaiep22), and "press whatever is in T5" is a perfectly good
 * instruction, so a vessel-only pin has to select the position rather than silently fall through to
 * "the first pressable thing in the cellar".
 */
export function pinnedPressPosition(
  task: PressGuidanceTask,
  positions: PressGuidancePosition[],
): PressGuidancePosition | null {
  if (!task.lotId && !task.sourceVesselId) return null;
  return (
    positions.find(
      (p) => (!task.lotId || p.lotId === task.lotId) && (!task.sourceVesselId || p.vesselId === task.sourceVesselId),
    ) ?? null
  );
}

export function stalePinnedPressSource(task: PressGuidanceTask, positions: PressGuidancePosition[]): {
  stale: boolean;
  expected: string;
  current: string[];
} {
  // Either half counts as a pin — see pinnedPressPosition. A vessel pinned at authoring time that no
  // longer holds a pressable must is exactly as stale as a pinned lot that has moved, and staying
  // silent about it would send the crew to the wrong tank.
  if (!task.lotId && !task.sourceVesselId) return { stale: false, expected: "", current: [] };
  if (pinnedPressPosition(task, positions)) return { stale: false, expected: "", current: [] };
  const planned = asRecord(task.plannedPayload);
  const expected = [
    asString(planned.plannedSourceVesselLabel) ?? task.sourceVesselId,
    asString(planned.plannedSourceLotCode) ?? task.lotId,
  ].filter(Boolean).join(" / ");
  return {
    stale: true,
    expected,
    current: positions.map((p) => `${p.vesselCode} / ${p.lotCode} (${p.volumeL} L)`),
  };
}

/**
 * The destination a press fraction STARTS on.
 *
 * Honours the manager's planned destination when there is one, and otherwise returns "" — the
 * operator must pick. It used to fall back to `vessels[0]`, which is the alphabetically first
 * ACTIVE vessel, which in a real cellar is barrel B1. So a press with no planned destination
 * silently pointed a multi-thousand-litre free-run cut at a 225 L barrel, the picker rendered
 * nothing but "B1", and the only thing that ever said so was the ledger capacity guard, after the
 * round-trip, phrased as "That would exceed B1's 225 L capacity". The reporter read that as the
 * system mistaking his tank for a barrel (feedback cmsf3y8090000l1049jg251nx). A destination is a
 * decision; never guess it.
 */
export function initialPressFractionDestination(vessels: PressGuidanceVessel[], plannedDestVesselId: string | null): string {
  if (plannedDestVesselId && vessels.some((v) => v.id === plannedDestVesselId)) return plannedDestVesselId;
  return "";
}

// ---------------------------------------------------------------------------
// Landing a fraction in a vessel that ALREADY holds wine
// ---------------------------------------------------------------------------
//
// `press-core.ts` has always allowed this, by MERGING the fraction into the lot already in the vessel
// instead of minting a child (`mergeIntoLotId`, legal exactly when the vessel holds ONE lot and that is
// the one named). The work-order contract passes the field through too. But no screen ever set it — the
// field existed in one form's state and payload with no control behind it — so from every UI the answer
// to "can I press into a vessel that already has wine in it?" was no (feedback cmsgc9bw80000la04b42ftqvy).
//
// These helpers are the CLIENT half of that rule, kept pure so both press forms share one implementation
// and the rule is unit-testable. They mirror press-core's checks exactly; the core stays the authority.

export type PressResidentLot = { lotId: string; code: string; volumeL: number };
export type PressDestination = { id: string; code: string; capacityL: number; residents?: PressResidentLot[] };

/**
 * What the UI must ask about a chosen destination.
 *  - "free"        — empty, or the press's own source vessel (the parent is drawn down by the same
 *                    operation, so it is not a foreign resident). Mint a child lot; ask nothing.
 *  - "merge"       — exactly one resident. The fraction can ONLY land here by joining that lot, so the
 *                    user must say so explicitly. Never assume it (see initialPressFractionDestination).
 *  - "blocked"     — more than one resident. press-core refuses; merging is defined against a single lot.
 */
export function pressDestinationMode(
  dest: PressDestination | undefined,
  sourceVesselId: string | null | undefined,
): "free" | "merge" | "blocked" {
  if (!dest) return "free";
  if (sourceVesselId && dest.id === sourceVesselId) return "free";
  const residents = dest.residents ?? [];
  if (residents.length === 0) return "free";
  return residents.length === 1 ? "merge" : "blocked";
}

/**
 * The message for a fraction whose destination is occupied and unresolved, or null when it is fine.
 * Says what the vessel holds and names the two ways forward, in the core's own terms.
 */
export function occupiedDestinationMessage(
  fraction: { label?: string; destVesselId: string; volumeL: number; mergeIntoLotId?: string | null },
  vessels: PressDestination[],
  sourceVesselId: string | null | undefined,
): string | null {
  if (!fraction.destVesselId || !(fraction.volumeL > 0)) return null;
  const dest = vessels.find((v) => v.id === fraction.destVesselId);
  if (!dest) return null;
  const mode = pressDestinationMode(dest, sourceVesselId);
  const which = fraction.label?.trim() ? `the "${fraction.label.trim()}" fraction` : "that fraction";
  const residents = dest.residents ?? [];

  if (mode === "blocked") {
    return `${dest.code} holds ${residents.map((r) => r.code).join(" and ")}. A fraction can only join a vessel holding ONE lot — send ${which} to an empty vessel.`;
  }
  if (mode === "merge") {
    const resident = residents[0];
    if (fraction.mergeIntoLotId === resident.lotId) {
      // Merging is the one case where headroom is fully known client-side: exactly one resident, and
      // we have its volume. Still a strict subset of the ledger's check (which sums every resident),
      // so it can only flag what the ledger would also refuse — but it says so before the round-trip.
      if (dest.capacityL > 0 && resident.volumeL + fraction.volumeL > dest.capacityL + 1e-6) {
        const room = Math.round((dest.capacityL - resident.volumeL) * 100) / 100;
        return `${dest.code} holds ${resident.volumeL} L of ${resident.code} and takes ${dest.capacityL} L, so only ${room} L will fit — ${which} is ${fraction.volumeL} L.`;
      }
      return null; // resolved: it joins that wine, and it fits
    }
    return `${dest.code} already holds ${resident.code} (${resident.volumeL} L). Choose whether ${which} joins ${resident.code} and becomes part of that wine, or send it to an empty vessel.`;
  }
  // Free vessel: a merge target would be meaningless, and the core would reject it.
  if (fraction.mergeIntoLotId) {
    return `${dest.code} is empty, so ${which} can't be added into another lot. Clear the "add into" choice or pick the vessel that holds it.`;
  }
  return null;
}

export type PressCapacityVessel = { id: string; code: string; capacityL: number };
export type PressFractionCheck = { label?: string; destVesselId: string; volumeL: number };

/**
 * Client-side capacity guard for press/saignée fractions. Returns the first violation's message,
 * or null when every fraction fits.
 *
 * Deliberately checks against the destination's TOTAL capacity, not its headroom: the press form
 * does not load current vessel contents, and a cut larger than the whole vessel cannot fit whatever
 * it already holds. That makes this a strict SUBSET of the server's headroom check in
 * `src/lib/ledger/write.ts` — it can only flag things the ledger would also reject, so it can never
 * produce a false rejection. The server stays the authority; this just says it before the round-trip,
 * while the operator is still looking at the picker they need to change.
 */
export function oversizedFractionMessage(
  fractions: PressFractionCheck[],
  vessels: PressCapacityVessel[],
): string | null {
  for (const f of fractions) {
    if (!f.destVesselId || !(f.volumeL > 0)) continue;
    const vessel = vessels.find((v) => v.id === f.destVesselId);
    if (!vessel || !(vessel.capacityL > 0)) continue;
    if (f.volumeL > vessel.capacityL + 1e-6) {
      const which = f.label?.trim() ? `Fraction "${f.label.trim()}"` : "That fraction";
      return `${which} is ${f.volumeL} L, but ${vessel.code} only holds ${vessel.capacityL} L. Pick a bigger destination.`;
    }
  }
  return null;
}
