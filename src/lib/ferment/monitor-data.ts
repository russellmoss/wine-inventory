import { prisma } from "@/lib/prisma";
import { detectStuck } from "@/lib/ferment/stuck";
import type { AlcoholicFermState, MalolacticState, LotForm } from "@/lib/ledger/vocabulary";

// Phase 6 (vessel-first redesign): the fermentation-monitoring series for ONE lot — every
// non-voided Brix / pH / temp reading over time, grouped into per-observation points for the
// dual-Y chart (Brix + temp) and the pH companion line. Plus the lot's current AF/MLF/form and
// the DERIVED stuck signal. Script-safe (no server-only) so it can be reused/tested.

export type FermentPoint = {
  panelId: string | null; // the AnalysisPanel id (null for an optimistic, not-yet-synced point)
  observedAt: string; // ISO
  brix: number | null;
  ph: number | null;
  temp: number | null;
  vesselReadingGroupId?: string | null; // plan 060: set when this point is part of a whole-tank reading
};

export type FermentAddition = {
  id: string;
  at: string; // ISO
  kind: string; // ADDITION | FINING (op family); the material's kind carries YEAST/MLF/TANNIN/…
  material: string | null;
  total: number | null; // computed grams/mL
  unit: string | null;
  note: string | null;
};

export type FermentSeries = {
  lotId: string;
  lotCode: string;
  form: LotForm;
  afState: AlcoholicFermState;
  mlfState: MalolacticState;
  points: FermentPoint[];
  stuck: { stuck: boolean; reason: string; latestBrix: number | null };
  additions: FermentAddition[]; // recent non-voided ADDITION/FINING treatments on this lot
};

export async function loadFermentSeries(lotId: string): Promise<FermentSeries | null> {
  const lot = await prisma.lot.findUnique({
    where: { id: lotId },
    select: { id: true, code: true, form: true, afState: true, mlfState: true },
  });
  if (!lot) return null;

  const readings = await prisma.analysisReading.findMany({
    where: { analyte: { in: ["BRIX", "PH", "TEMP"] }, panel: { lotId, voidedAt: null } },
    select: { analyte: true, value: true, panel: { select: { id: true, observedAt: true, vesselReadingGroupId: true } } },
    orderBy: { panel: { observedAt: "asc" } },
  });

  // Group readings of the same panel (one observation) into a single point.
  const byPanel = new Map<string, FermentPoint>();
  for (const r of readings) {
    const key = r.panel.id;
    const pt = byPanel.get(key) ?? { panelId: r.panel.id, observedAt: r.panel.observedAt.toISOString(), brix: null, ph: null, temp: null, vesselReadingGroupId: r.panel.vesselReadingGroupId };
    if (r.analyte === "BRIX") pt.brix = Number(r.value);
    else if (r.analyte === "PH") pt.ph = Number(r.value);
    else if (r.analyte === "TEMP") pt.temp = Number(r.value);
    byPanel.set(key, pt);
  }
  const points = [...byPanel.values()].sort((a, b) => a.observedAt.localeCompare(b.observedAt));

  const stuckRes = detectStuck(
    points.filter((p) => p.brix != null).map((p) => ({ observedAt: p.observedAt, brix: p.brix as number })),
    { afState: lot.afState as AlcoholicFermState },
  );

  // Recent non-voided additions/fining on this lot (yeast, MLF culture, bentonite, tannin, …).
  const treatments = await prisma.lotTreatment.findMany({
    where: { lotId, kind: { in: ["ADDITION", "FINING"] }, voidedByOperationId: null },
    select: { id: true, kind: true, materialName: true, computedTotal: true, computedUnit: true, note: true, createdAt: true, operation: { select: { observedAt: true } } },
    orderBy: { createdAt: "desc" },
    take: 15,
  });

  return {
    lotId: lot.id,
    lotCode: lot.code,
    form: lot.form as LotForm,
    afState: lot.afState as AlcoholicFermState,
    mlfState: lot.mlfState as MalolacticState,
    points,
    stuck: { stuck: stuckRes.stuck, reason: stuckRes.reason, latestBrix: stuckRes.latestBrix },
    additions: treatments.map((t) => ({
      id: t.id,
      at: t.operation.observedAt.toISOString(),
      kind: t.kind,
      material: t.materialName,
      total: t.computedTotal != null ? Number(t.computedTotal) : null,
      unit: t.computedUnit,
      note: t.note,
    })),
  };
}
