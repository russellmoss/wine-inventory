import "server-only";
import { prisma } from "@/lib/prisma";
import {
  buildTimeline,
  mergeTimeline,
  describeMeasurementPanel,
  describeVesselActivity,
  describeWorkOrder,
  type RawOperation,
  type RawLine,
  type TimelineItem,
  type NonOpItem,
  type VesselKind,
} from "@/lib/lot/timeline";
import { statusTone, statusLabel } from "@/lib/work-orders/status-badge";
import { reversibilityOf } from "@/lib/ledger/reverse";
import { currentOccupancyWindow } from "@/lib/vessel/occupancy";

// ───────────────────────── Vessel History timeline loader (plan 045) ─────────────────────────
// The per-VESSEL analogue of getLotDetail (src/lib/lot/data.ts). A vessel's "History" is a composed
// view over every lot that passes through it, SCOPED to the current occupancy window (everything since
// the vessel was last empty — see currentOccupancyWindow). The immutable ledger is never deleted; this
// is a read-time scope. Reuses the pure timeline engine (buildTimeline/mergeTimeline) verbatim.
//
// Sourcing rule (learning `bulk-reads-vessel-component-not-ledger`): source from the LEDGER by vesselId
// (lot_operation_line + lot_treatment), NOT the vessel_lot projection, or blend activity vanishes.

export type VesselTimeline = {
  vesselId: string;
  vesselCode: string;
  vesselType: VesselKind;
  windowStartAt: string | null; // ISO; null = vessel currently empty (no activity to show)
  items: TimelineItem[];
};

// CLEAN/SANITIZE/STEAM only happen on an emptied vessel → they force a fresh occupancy window
// (Gemini G1 "dirty empty": a rack that leaves a lees heel never crosses FUNCTIONAL_ZERO_L).
const RESET_KINDS = ["CLEAN", "SANITIZE", "STEAM"] as const;
// A work order still shows on the vessel even if it was issued before the current fill (Gemini G2:
// the "clean & fill" WO that STARTED the fill), as long as it is still active.
const ACTIVE_WO_STATUS = new Set(["ISSUED", "IN_PROGRESS", "PENDING_APPROVAL"]);

export async function getVesselTimeline(vesselId: string): Promise<VesselTimeline | null> {
  const vessel = await prisma.vessel.findUnique({
    where: { id: vesselId },
    select: { id: true, code: true, type: true },
  });
  if (!vessel) return null;
  const vesselType = vessel.type as VesselKind;
  const empty: VesselTimeline = { vesselId, vesselCode: vessel.code, vesselType, windowStartAt: null, items: [] };

  // 1) OCCUPANCY WINDOW — fold this vessel's signed deltas by op id.
  // NOTE (Gemini G3): loads this vessel's lines via Prisma findMany (RLS applied by the tenant
  // extension). For a very-long-lived vessel this can be bounded by backward cursor paging with an
  // early stop at the zero-crossing; realistic vessels carry far too few lines to matter. Left simple.
  const vesselLines = await prisma.lotOperationLine.findMany({
    where: { vesselId },
    select: { operationId: true, deltaL: true, operation: { select: { observedAt: true } } },
  });
  const aggByOp = new Map<number, { opId: number; observedAt: Date; deltaL: number }>();
  for (const l of vesselLines) {
    const cur = aggByOp.get(l.operationId);
    if (cur) cur.deltaL += Number(l.deltaL);
    else aggByOp.set(l.operationId, { opId: l.operationId, observedAt: l.operation.observedAt, deltaL: Number(l.deltaL) });
  }

  const resetRows = await prisma.vesselActivityEvent.findMany({
    where: { vesselId, voidedAt: null, kind: { in: RESET_KINDS as unknown as never } },
    select: { observedAt: true },
  });
  const window = currentOccupancyWindow([...aggByOp.values()], {
    resetEvents: resetRows.map((r) => ({ at: r.observedAt })),
  });
  if (!window) return empty; // vessel currently empty → fresh slate, nothing to show

  const startMs = new Date(window.startAt).getTime();
  const afterStart = (d: Date | string) => new Date(d).getTime() >= startMs;
  // Ledger ops: use op id when a fill governs the window; fall back to time when a CLEAN/SANITIZE
  // reset governs (startOpId null). Non-ledger events always filter by observedAt (single domain).
  const opInWindow = (opId: number, observedAt: Date) =>
    window.startOpId != null ? opId >= window.startOpId : afterStart(observedAt);

  // 2) CANDIDATE OPS touching this vessel within the window — lines UNION treatments (the UNION is
  // what surfaces volume-neutral ADDITION/FINING/CAP_MGMT ops; they have no lines).
  const treatmentRows = await prisma.lotTreatment.findMany({
    where: { vesselId },
    include: { operation: { select: { id: true, observedAt: true } } },
  });
  const candidateOpIds = new Set<number>();
  for (const [opId, agg] of aggByOp) if (opInWindow(opId, agg.observedAt)) candidateOpIds.add(opId);
  for (const t of treatmentRows) if (opInWindow(t.operation.id, t.operation.observedAt)) candidateOpIds.add(t.operation.id);
  const opIds = [...candidateOpIds];

  // 3) Seed op groups from real headers (one query for all candidate ops — includes treatment-only
  // ADDITION/FINING/CAP_MGMT ops that have no lines), then attach the FULL leg set (all vessels' lines,
  // so summaries read "Racked X L from Tank 1 to Tank 3") and the treatments filtered to THIS vessel.
  const [headers, fullLines] = await Promise.all([
    opIds.length ? prisma.lotOperation.findMany({ where: { id: { in: opIds } } }) : Promise.resolve([]),
    opIds.length ? prisma.lotOperationLine.findMany({ where: { operationId: { in: opIds } } }) : Promise.resolve([]),
  ]);
  const vesselIdsForType = [...new Set(fullLines.map((l) => l.vesselId).filter((x): x is string => !!x))];
  const typeRows = vesselIdsForType.length
    ? await prisma.vessel.findMany({ where: { id: { in: vesselIdsForType } }, select: { id: true, type: true } })
    : [];
  const typeById = new Map(typeRows.map((v) => [v.id, v.type as VesselKind]));

  const byOp = new Map<number, { op: RawOperation; lines: RawLine[] }>();
  for (const h of headers) {
    byOp.set(h.id, {
      op: { id: h.id, type: h.type, observedAt: h.observedAt, enteredBy: h.enteredBy, captureMethod: h.captureMethod, note: h.note, correctsOperationId: h.correctsOperationId, treatments: [] },
      lines: [],
    });
  }
  for (const l of fullLines) {
    const g = byOp.get(l.operationId);
    if (!g) continue;
    g.lines.push({
      vesselId: l.vesselId,
      vesselCode: l.vesselCode,
      vesselType: l.vesselId ? typeById.get(l.vesselId) ?? null : null,
      deltaL: Number(l.deltaL),
      reason: l.reason,
      bucket: l.bucket,
      bottleDelta: l.bottleDelta,
    });
  }
  for (const t of treatmentRows) {
    const g = byOp.get(t.operation.id);
    if (!g) continue; // out of window
    g.op.treatments!.push({
      kind: t.kind,
      materialName: t.materialName,
      rateValue: t.rateValue == null ? null : Number(t.rateValue),
      rateBasis: t.rateBasis,
      computedTotal: t.computedTotal == null ? null : Number(t.computedTotal),
      computedUnit: t.computedUnit,
      durationMin: t.durationMin,
      medium: t.medium,
      micron: t.micron == null ? null : Number(t.micron),
    });
  }

  // Corrected-op flags (024a) — any op reversed by a later CORRECTION shows a badge, not an Undo.
  const corrections = opIds.length
    ? await prisma.lotOperation.findMany({ where: { correctsOperationId: { in: opIds } }, select: { correctsOperationId: true } })
    : [];
  const correctedIds = new Set(corrections.map((c) => c.correctsOperationId as number));

  const rawOps = [...byOp.values()].sort((a, b) => b.op.id - a.op.id);
  const opEvents = buildTimeline(rawOps, { correctedIds });

  // 4) Reversibility verdict per op (Gemini G5) — the detail modal disables Edit/Undo up-front.
  for (const ev of opEvents) {
    if (ev.corrected || ev.isCorrection) continue;
    const verdict = reversibilityOf(ev.type);
    if (verdict.reversible) ev.reversible = true;
    else ev.reversalReason = verdict.reason;
  }

  // 5) WO provenance on WO-sourced op entries — back-link attempt.operationId → task → work order.
  if (opIds.length) {
    const attempts = await prisma.workOrderTaskAttempt.findMany({
      where: { operationId: { in: opIds } },
      include: { task: { include: { workOrder: true } } },
    });
    const provByOp = new Map<number, (typeof attempts)[number]>();
    for (const a of attempts) if (a.operationId != null && !provByOp.has(a.operationId)) provByOp.set(a.operationId, a);
    for (const ev of opEvents) {
      const a = provByOp.get(ev.id);
      if (!a) continue;
      const wo = a.task.workOrder;
      const statusForBadge = a.task.status || wo.status;
      ev.workOrder = {
        workOrderId: wo.id,
        number: wo.number,
        title: wo.title,
        taskStatus: a.task.status,
        woStatus: wo.status,
        tone: statusTone(statusForBadge),
        statusLabel: statusLabel(statusForBadge),
        issuedByEmail: wo.issuedByEmail,
        issuedAt: wo.issuedAt ? wo.issuedAt.toISOString() : null,
        completedByEmail: a.completedByEmail,
        completedAt: a.completedAt ? a.completedAt.toISOString() : null,
        assigneeEmail: a.task.assigneeEmail ?? wo.assigneeEmail,
      };
    }
  }

  // 6) Non-ledger items (all filtered to the window by observedAt): vessel-maintenance events,
  // analysis panels, and work orders issued against the vessel.
  const [activityRows, panels, woTasks] = await Promise.all([
    prisma.vesselActivityEvent.findMany({ where: { vesselId, voidedAt: null } }),
    prisma.analysisPanel.findMany({ where: { vesselId, voidedAt: null }, include: { readings: { orderBy: { createdAt: "asc" } } } }),
    prisma.workOrderTask.findMany({
      where: { OR: [{ sourceVesselId: vesselId }, { destVesselId: vesselId }] },
      include: { workOrder: true, attempts: { select: { operationId: true, completedAt: true } } },
    }),
  ]);

  const activityItems: NonOpItem[] = activityRows
    .filter((a) => afterStart(a.observedAt))
    .map((a) =>
      describeVesselActivity({
        id: a.id,
        kind: a.kind,
        observedAt: a.observedAt,
        enteredByEmail: a.enteredByEmail,
        captureMethod: "MANUAL",
        note: a.note,
        createdAt: a.createdAt,
        targetValue: a.targetValue == null ? null : Number(a.targetValue),
        targetUnit: a.targetUnit,
      }),
    );

  const panelItems: NonOpItem[] = panels
    .filter((p) => afterStart(p.observedAt))
    .map((p) =>
      describeMeasurementPanel({
        id: p.id,
        observedAt: p.observedAt,
        enteredByEmail: p.enteredByEmail,
        captureMethod: p.captureMethod,
        note: p.note,
        sampleId: p.sampleId,
        createdAt: p.createdAt,
        readings: p.readings.map((r) => ({ analyte: r.analyte, value: Number(r.value), unit: r.unit })),
      }),
    );

  // One WO item per work order (dedup if two tasks target this vessel — keep the first by seq). Include
  // a WO if issued in-window OR still active OR it has an attempt whose op is in-window (Gemini G2).
  const woItemByWo = new Map<string, NonOpItem>();
  for (const task of woTasks.sort((a, b) => a.seq - b.seq)) {
    const wo = task.workOrder;
    if (woItemByWo.has(wo.id)) continue;
    const issuedInWindow = wo.issuedAt != null && afterStart(wo.issuedAt);
    const active = ACTIVE_WO_STATUS.has(wo.status);
    const attemptInWindow = task.attempts.some((at) => at.operationId != null && candidateOpIds.has(at.operationId));
    if (!issuedInWindow && !active && !attemptInWindow) continue;
    woItemByWo.set(
      wo.id,
      describeWorkOrder({
        workOrderId: wo.id,
        number: wo.number,
        title: wo.title,
        taskStatus: task.status,
        woStatus: wo.status,
        issuedByEmail: wo.issuedByEmail,
        issuedAt: wo.issuedAt,
        createdAt: wo.createdAt,
        enteredByEmail: wo.issuedByEmail ?? "system",
        captureMethod: "MANUAL",
        note: null,
      }),
    );
  }

  const items = mergeTimeline(opEvents, [...activityItems, ...panelItems, ...woItemByWo.values()]);
  return { vesselId, vesselCode: vessel.code, vesselType, windowStartAt: window.startAt, items };
}
