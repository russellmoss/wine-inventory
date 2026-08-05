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

export function stalePinnedPressSource(task: PressGuidanceTask, positions: PressGuidancePosition[]): {
  stale: boolean;
  expected: string;
  current: string[];
} {
  if (!task.lotId || !task.sourceVesselId) return { stale: false, expected: "", current: [] };
  const found = positions.some((p) => p.lotId === task.lotId && p.vesselId === task.sourceVesselId);
  if (found) return { stale: false, expected: "", current: [] };
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
