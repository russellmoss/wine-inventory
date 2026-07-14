// Plan 065 — the read-only "do X to Y with Z" story a cellar hand sees on the execute screen
// BEFORE they click Edit. Pure + isomorphic (no server/DB), so it unit-tests and runs in the
// client component. Mirrors the row conventions of getWorkOrderPrintView (data.ts) but is scoped
// to the execute view's picker data (client-side), and adds the SO₂-as-KMBS-solution computation
// (resolveSo2Dose) that the print view does not have.

import { computeDoseTotal } from "@/lib/cellar/additions-math";
import { resolveSo2Dose } from "@/lib/cellar/so2-dose";

export type TaskSummaryRow = { label: string; value: string; emphasis?: boolean };
export type TaskSummary = { headline: string; rows: TaskSummaryRow[] };

export type SummaryVessel = { id: string; label: string; kind?: string | null; volumeL?: number | null; capacityL?: number | null };
export type SummaryMaterial = { id: string; label: string; unit?: string | null; kind?: string | null };
export type SummaryLot = { id: string; label: string };
export type TaskSummaryPickers = { vessels: SummaryVessel[]; materials: SummaryMaterial[]; lots: SummaryLot[] };

export type TaskSummaryInput = {
  kind: string; // OPERATION | MAINTENANCE | NOTE | OBSERVATION
  opType?: string | null;
  activityType?: string | null;
  observationType?: string | null;
  title: string;
  plannedPayload?: unknown;
  sourceVesselId?: string | null;
  destVesselId?: string | null;
  lotId?: string | null;
  materialId?: string | null;
};

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() && Number.isFinite(Number(v)) ? Number(v) : null;

/** Litres to a friendly string: L for ≥1 L, otherwise mL. */
function fmtVolumeMl(ml: number): string {
  return ml >= 1000 ? `${(ml / 1000).toFixed(2)} L` : `${Math.round(ml)} mL`;
}

const SO2_RATE_UNITS = new Set(["ppm", "mg/L"]);

export function buildTaskSummary(task: TaskSummaryInput, pickers: TaskSummaryPickers): TaskSummary {
  const p = (task.plannedPayload ?? {}) as Record<string, unknown>;
  const vById = new Map(pickers.vessels.map((v) => [v.id, v]));
  const mById = new Map(pickers.materials.map((m) => [m.id, m]));
  const lById = new Map(pickers.lots.map((l) => [l.id, l]));

  const vLabel = (id?: string | null) => (id ? vById.get(id)?.label ?? null : null);
  // Barrels dose full (capacity); tanks use their current wine volume.
  const vVolume = (id?: string | null): number => {
    const v = id ? vById.get(id) : null;
    if (!v) return 0;
    return v.kind === "BARREL" ? Number(v.capacityL ?? v.volumeL ?? 0) : Number(v.volumeL ?? 0);
  };

  const rows: TaskSummaryRow[] = [];

  const fromV = vLabel(str(p.fromVesselId) ?? task.sourceVesselId);
  const toV = vLabel(str(p.toVesselId) ?? task.destVesselId);
  const singleVId = str(p.vesselId) ?? task.destVesselId ?? task.sourceVesselId;
  const singleV = vLabel(singleVId);
  if (fromV && toV) {
    rows.push({ label: "From", value: fromV });
    rows.push({ label: "To", value: toV });
  } else if (singleV) {
    rows.push({ label: "Vessel", value: singleV });
  }

  const lotLabel = lById.get(str(p.lotId) ?? task.lotId ?? "")?.label ?? null;
  if (lotLabel) rows.push({ label: "Lot", value: lotLabel });

  const material = mById.get(str(p.materialId) ?? task.materialId ?? "") ?? null;
  if (material) rows.push({ label: "Material", value: material.label });

  const isAddition = task.opType === "ADDITION" || task.opType === "FINING";
  const amount = num(p.amount);
  const doseUnit = str(p.doseUnit);
  const vol = vVolume(singleVId);

  if (isAddition && amount != null && doseUnit) {
    rows.push({ label: "Dose", value: `${amount} ${doseUnit === "mg/L" ? "ppm (mg/L)" : doseUnit}` });

    const solutionPct = num(p.solutionPercentKmbs);
    const isSo2Solution = material?.kind === "SO2" && SO2_RATE_UNITS.has(doseUnit) && solutionPct != null && solutionPct > 0;

    if (isSo2Solution && vol > 0) {
      const dose = resolveSo2Dose({ ppm: amount, volumeL: vol, solutionPercentKmbs: solutionPct });
      if (dose.solutionMl != null) {
        rows.push({ label: "Add", value: `≈ ${fmtVolumeMl(dose.solutionMl)} of ${solutionPct}% KMBS solution`, emphasis: true });
      }
      rows.push({ label: "SO₂ delivered", value: `≈ ${dose.so2Grams.toLocaleString()} g (at ${vol.toLocaleString()} L)` });
      rows.push({ label: "or as powder", value: `≈ ${dose.kmbsGrams.toLocaleString()} g KMBS` });
    } else {
      // Generic addition total (weigh-out), matching the print view.
      const est = vol > 0 ? computeDoseTotal(amount, doseUnit, vol) : null;
      if (est) rows.push({ label: "Total to weigh out", value: `≈ ${est.total.toLocaleString()} ${est.unit} (at ${vol.toLocaleString()} L)`, emphasis: true });
    }
  } else if (isAddition && amount != null) {
    rows.push({ label: "Dose", value: String(amount) });
  }

  const note = str(p.note);
  if (note) rows.push({ label: "Note", value: note });

  // Headline: a plain-English instruction line.
  let headline = task.title;
  if (isAddition && material) {
    const verb = task.opType === "FINING" ? "Fine with" : "Add";
    const dose = amount != null && doseUnit ? `${amount} ${doseUnit === "mg/L" ? "ppm" : doseUnit} ` : "";
    headline = `${verb} ${dose}${material.label}${singleV ? ` to ${singleV}` : ""}`;
  } else if (fromV && toV) {
    headline = `${task.opType === "TOPPING" ? "Top" : "Rack"} ${fromV} → ${toV}`;
  }

  return { headline, rows };
}
