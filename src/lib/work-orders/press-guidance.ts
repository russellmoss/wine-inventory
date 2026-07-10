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

export function initialPressFractionDestination(vessels: PressGuidanceVessel[], plannedDestVesselId: string | null): string {
  if (plannedDestVesselId && vessels.some((v) => v.id === plannedDestVesselId)) return plannedDestVesselId;
  return vessels[0]?.id ?? "";
}
