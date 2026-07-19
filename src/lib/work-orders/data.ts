import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { runAsTenant } from "@/lib/tenant/context";
import { materialDisplayName } from "@/lib/cellar/materials-shared";
import { bucketWorkOrders, type BucketedItem } from "@/lib/work-orders/buckets";
import { computeDeviations, hasSignificantDeviation, type Deviation } from "@/lib/work-orders/deviation";
import { buildArchiveWhere, buildOpenWhere, ARCHIVE_PAGE_SIZE, type ArchiveFilters, type WorkOrderFilters } from "@/lib/work-orders/archive-filters";
import { computeDoseTotal, resolveDoseUnit, RATE_BASIS_LABELS, type RateBasis } from "@/lib/cellar/additions-math";
import { deriveGroupRackProgress, type BatchAttemptLite, type PlannedGroupRack } from "@/lib/work-orders/group-rack-progress";
import { parseGroupActivityPayload } from "@/lib/work-orders/group-activity";
import type { LotsByVessel } from "@/lib/work-orders/vessel-lot-resolve";

// Read-side view-models for work orders (Phase 9). K12-safe: every reader takes tenantId as an EXPLICIT
// argument and wraps its reads in runAsTenant — never reads the ALS tenant (so these stay correct even
// if wrapped in cache() later). Serializable shapes only (Dates → ISO, Decimals → numbers). The
// dashboard bucketing lives in dashboard.ts (Unit 13); this file holds the detail + count reads.

// Plan 054 (Phase 9.4b): per-member progress for a group barrel-down / rack-to-tank task, so the execute
// screen can show done vs. pending members + headroom, and the detail page can show progress.
export type GroupRackMemberView = {
  vesselId: string;
  code: string | null;
  done: boolean;
  currentL: number | null;
  capacityL: number | null;
  headroomL: number | null;
};
export type GroupRackTaskView = {
  direction: "BARREL_DOWN" | "RACK_TO_TANK";
  sideVesselId: string | null; // the source (barrel-down) or destination (rack-to-tank) vessel
  members: GroupRackMemberView[];
  doneCount: number;
  pendingCount: number;
  allMembersDone: boolean;
};

// Plan 061: a consolidated group MAINTENANCE task's member set, for the execute sub-form. All-at-once —
// no per-member progress (the whole range completes together), just the members + count. Codes ride in
// the payload (stored at authoring), so this is a pure read with no extra DB hit.
export type GroupActivityTaskView = {
  activityType: string;
  members: { vesselId: string; code: string }[];
  count: number;
};

export type WorkOrderTaskView = {
  id: string;
  seq: number;
  groupSeq: number; // plan 053: sequential-group index (tasks in a group run in parallel)
  kind: "OPERATION" | "OBSERVATION" | "MAINTENANCE" | "NOTE";
  status: string;
  title: string;
  assigneeId: string | null;
  assigneeName: string | null; // resolved from assigneeId for display
  equipment: string[]; // plan 053 B10: advisory required-equipment names
  opType: string | null;
  observationType: string | null;
  activityType: string | null;
  instructions: string | null;
  sourceVesselId: string | null;
  destVesselId: string | null;
  lotId: string | null;
  materialId: string | null;
  blockId: string | null;
  assigneeEmail: string | null;
  dueAt: string | null;
  plannedPayload: unknown;
  currentAttemptId: string | null;
  completionNote: string | null;
  deviationReason: string | null;
  startedByEmail: string | null;
  groupRack: GroupRackTaskView | null; // plan 054: set only for group barrel-down / rack-to-tank tasks
  groupActivity: GroupActivityTaskView | null; // plan 061: set only for consolidated group maintenance tasks
};

export type WorkOrderDetail = {
  id: string;
  number: number;
  title: string;
  status: string;
  instructions: string | null;
  assigneeEmail: string | null;
  dueAt: string | null;
  scheduledFor: string | null;
  priority: string | null; // plan 053 B8
  locationName: string | null; // plan 053 B9
  autoFinalize: boolean;
  issuedByEmail: string | null;
  issuedAt: string | null;
  startedByEmail: string | null;
  tasks: WorkOrderTaskView[];
  // Plan 053 A5: cross-order prerequisites — this WO's tasks can't complete until these are done.
  dependsOn: { id: string; number: number; title: string; status: string }[];
};

function taskView(t: {
  id: string; seq: number; groupSeq: number; kind: string; status: string; title: string; opType: string | null;
  observationType: string | null; activityType: string | null; instructions: string | null; sourceVesselId: string | null;
  destVesselId: string | null; lotId: string | null; materialId: string | null; blockId: string | null;
  assigneeId: string | null; assigneeEmail: string | null;
  dueAt: Date | null; plannedPayload: unknown; currentAttemptId: string | null; completionNote: string | null;
  deviationReason: string | null; startedByEmail: string | null;
}, assigneeName: string | null, equipment: string[], groupRack: GroupRackTaskView | null = null): WorkOrderTaskView {
  // Plan 061: a consolidated group maintenance task carries its members (+ codes) in plannedPayload — pure read.
  const ga = parseGroupActivityPayload(t.plannedPayload);
  const groupActivity: GroupActivityTaskView | null = ga
    ? { activityType: ga.activityType, count: ga.memberVesselIds.length, members: ga.memberVesselIds.map((id, i) => ({ vesselId: id, code: ga.memberCodes[i] ?? id.slice(0, 6) })) }
    : null;
  return {
    id: t.id,
    seq: t.seq,
    groupSeq: t.groupSeq,
    equipment,
    groupRack,
    groupActivity,
    kind: t.kind as "OPERATION" | "OBSERVATION" | "MAINTENANCE" | "NOTE",
    status: t.status,
    title: t.title,
    assigneeId: t.assigneeId,
    assigneeName,
    opType: t.opType,
    observationType: t.observationType,
    activityType: t.activityType,
    instructions: t.instructions,
    sourceVesselId: t.sourceVesselId,
    destVesselId: t.destVesselId,
    lotId: t.lotId,
    materialId: t.materialId,
    blockId: t.blockId,
    assigneeEmail: t.assigneeEmail,
    dueAt: t.dueAt ? t.dueAt.toISOString() : null,
    plannedPayload: t.plannedPayload,
    currentAttemptId: t.currentAttemptId,
    completionNote: t.completionNote,
    deviationReason: t.deviationReason,
    startedByEmail: t.startedByEmail,
  };
}

/** One work order with its tasks (ordered by seq). Null if not found in this tenant. */
export async function getWorkOrderDetail(tenantId: string, workOrderId: string): Promise<WorkOrderDetail | null> {
  return runAsTenant(tenantId, async () => {
    const wo = await prisma.workOrder.findUnique({
      where: { id: workOrderId },
      include: { tasks: { orderBy: [{ groupSeq: "asc" }, { seq: "asc" }] } },
    });
    if (!wo) return null;
    // Resolve per-task assignee ids → names for display (User is a global table).
    const assigneeIds = [...new Set(wo.tasks.map((t) => t.assigneeId).filter((x): x is string => !!x))];
    const users = assigneeIds.length ? await prisma.user.findMany({ where: { id: { in: assigneeIds } }, select: { id: true, name: true, email: true } }) : [];
    const nameOf = new Map(users.map((u) => [u.id, u.name?.trim() || u.email || "Member"]));
    // Plan 053 A5: this WO's cross-order prerequisites.
    const depEdges = await prisma.workOrderDependency.findMany({ where: { workOrderId: wo.id }, select: { dependsOnWorkOrderId: true } });
    const depWos = depEdges.length
      ? await prisma.workOrder.findMany({ where: { id: { in: depEdges.map((d) => d.dependsOnWorkOrderId) } }, select: { id: true, number: true, title: true, status: true } })
      : [];
    // Plan 053 B9: resolve the WO's location id → name for display.
    const loc = wo.locationId ? await prisma.location.findUnique({ where: { id: wo.locationId }, select: { name: true } }) : null;
    // Plan 053 B10: advisory required-equipment names per task.
    const taskIds = wo.tasks.map((t) => t.id);
    const eqLinks = taskIds.length ? await prisma.workOrderTaskEquipment.findMany({ where: { taskId: { in: taskIds } }, select: { taskId: true, equipmentId: true } }) : [];
    const eqIds = [...new Set(eqLinks.map((l) => l.equipmentId))];
    const eqAssets = eqIds.length ? await prisma.equipmentAsset.findMany({ where: { id: { in: eqIds } }, select: { id: true, name: true } }) : [];
    const eqNameOf = new Map(eqAssets.map((e) => [e.id, e.name]));
    const eqByTask = new Map<string, string[]>();
    for (const l of eqLinks) {
      const name = eqNameOf.get(l.equipmentId);
      if (name) eqByTask.set(l.taskId, [...(eqByTask.get(l.taskId) ?? []), name]);
    }
    // Plan 054: enrich group barrel-down / rack-to-tank tasks with per-member progress + headroom.
    const grByTask = await buildGroupRackViews(wo.tasks);
    return {
      id: wo.id,
      number: wo.number,
      title: wo.title,
      status: wo.status,
      instructions: wo.instructions,
      assigneeEmail: wo.assigneeEmail,
      dueAt: wo.dueAt ? wo.dueAt.toISOString() : null,
      scheduledFor: wo.scheduledFor ? wo.scheduledFor.toISOString() : null,
      priority: wo.priority,
      locationName: loc?.name ?? null,
      autoFinalize: wo.autoFinalize,
      issuedByEmail: wo.issuedByEmail,
      issuedAt: wo.issuedAt ? wo.issuedAt.toISOString() : null,
      startedByEmail: wo.startedByEmail,
      tasks: wo.tasks.map((t) => taskView(t, t.assigneeId ? nameOf.get(t.assigneeId) ?? null : null, eqByTask.get(t.id) ?? [], grByTask.get(t.id) ?? null)),
      dependsOn: depWos.map((d) => ({ id: d.id, number: d.number, title: d.title, status: d.status })),
    };
  });
}

/** Plan 054: for every group-rack task, derive per-member done/pending (from its attempts) + current
 * volume/headroom (from the member vessels). Runs in the caller's tenant context. */
async function buildGroupRackViews(tasks: { id: string; kind: string; opType: string | null; plannedPayload: unknown }[]): Promise<Map<string, GroupRackTaskView>> {
  const out = new Map<string, GroupRackTaskView>();
  const grTasks = tasks.filter((t) => {
    if (t.kind !== "OPERATION" || t.opType !== "RACK") return false;
    const p = (t.plannedPayload ?? {}) as Record<string, unknown>;
    const gr = p.groupRack;
    return !!(gr && typeof gr === "object" && !Array.isArray(gr));
  });
  if (grTasks.length === 0) return out;

  const attemptRows = await prisma.workOrderTaskAttempt.findMany({
    where: { taskId: { in: grTasks.map((t) => t.id) } },
    select: { id: true, taskId: true, seq: true, status: true, operationId: true, actualPayload: true },
  });
  const attemptsByTask = new Map<string, BatchAttemptLite[]>();
  for (const a of attemptRows) {
    const p = (a.actualPayload ?? {}) as Record<string, unknown>;
    const grb = p.groupRackBatch;
    const lite: BatchAttemptLite = { id: a.id, seq: a.seq, status: a.status, operationId: a.operationId, groupRackBatch: grb && typeof grb === "object" ? (grb as BatchAttemptLite["groupRackBatch"]) : null };
    attemptsByTask.set(a.taskId, [...(attemptsByTask.get(a.taskId) ?? []), lite]);
  }

  // Load every member + side vessel once for volume/headroom.
  const allVesselIds = new Set<string>();
  for (const t of grTasks) {
    const gr = ((t.plannedPayload ?? {}) as Record<string, unknown>).groupRack as PlannedGroupRack;
    for (const id of gr.destVesselIds ?? []) allVesselIds.add(id);
    for (const id of gr.sourceVesselIds ?? []) allVesselIds.add(id);
  }
  const vessels = allVesselIds.size
    ? await prisma.vessel.findMany({ where: { id: { in: [...allVesselIds] } }, select: { id: true, capacityL: true, vesselLots: { select: { volumeL: true } } } })
    : [];
  const fillOf = new Map(vessels.map((v) => {
    const current = Math.round(v.vesselLots.reduce((a, l) => a + Number(l.volumeL), 0) * 100) / 100;
    const capacity = Number(v.capacityL);
    return [v.id, { currentL: current, capacityL: capacity, headroomL: Math.max(0, Math.round((capacity - current) * 100) / 100) }];
  }));

  for (const t of grTasks) {
    const planned = ((t.plannedPayload ?? {}) as Record<string, unknown>).groupRack as PlannedGroupRack;
    let progress;
    try {
      progress = deriveGroupRackProgress(planned, attemptsByTask.get(t.id) ?? []);
    } catch {
      continue; // a malformed group-rack payload just gets no progress block (renders as before)
    }
    const members: GroupRackMemberView[] = progress.members.map((m) => {
      const fill = fillOf.get(m.vesselId);
      return { vesselId: m.vesselId, code: m.code, done: m.done, currentL: fill?.currentL ?? null, capacityL: fill?.capacityL ?? null, headroomL: fill?.headroomL ?? null };
    });
    out.set(t.id, {
      direction: progress.direction,
      sideVesselId: (planned.sourceVesselId as string) ?? (planned.destVesselId as string) ?? null,
      members,
      doneCount: progress.completedVesselIds.length,
      pendingCount: progress.pendingVesselIds.length,
      allMembersDone: progress.allMembersDone,
    });
  }
  return out;
}

// ── Printable work order (Unit 6 fix): resolve the raw IDs in a task's payload to the human names/codes a
// cellar hand actually reads — vessel code, lot code, material name — and build a plain dose line + total. ──
export type PrintRow = { label: string; value: string };
export type WorkOrderPrintTask = {
  id: string; seq: number; title: string; typeLabel: string;
  rows: PrintRow[]; instructions: string | null; completionNote: string | null; deviationReason: string | null;
};
export type WorkOrderPrintView = {
  number: number; title: string; status: string;
  issuedByEmail: string | null; assigneeEmail: string | null; issuedAt: string | null; dueAt: string | null; instructions: string | null;
  tasks: WorkOrderPrintTask[];
};

export async function getWorkOrderPrintView(tenantId: string, workOrderId: string): Promise<WorkOrderPrintView | null> {
  return runAsTenant(tenantId, async () => {
    const wo = await prisma.workOrder.findUnique({
      where: { id: workOrderId },
      // Plan 035: a de-stem/crush or press task's run-time inputs (picks, output, fractions) live on the
      // completing ATTEMPT's actualPayload, not the planned payload — pull the latest attempt to render them.
      include: { tasks: { orderBy: { seq: "asc" }, include: { attempts: { orderBy: { seq: "desc" }, take: 1, select: { actualPayload: true } } } } },
    });
    if (!wo) return null;
    const actualOf = (t: (typeof wo.tasks)[number]) => (t.attempts[0]?.actualPayload ?? {}) as Record<string, unknown>;

    // Collect every referenced id (canonical columns + payload) so we can resolve them to human labels.
    const vIds = new Set<string>(); const lIds = new Set<string>(); const mIds = new Set<string>(); const bIds = new Set<string>();
    const add = (set: Set<string>, v: unknown) => { if (typeof v === "string" && v) set.add(v); };
    for (const t of wo.tasks) {
      const p = (t.plannedPayload ?? {}) as Record<string, unknown>;
      [t.destVesselId, t.sourceVesselId, p.vesselId, p.fromVesselId, p.toVesselId].forEach((x) => add(vIds, x));
      [t.lotId, p.lotId].forEach((x) => add(lIds, x));
      [t.materialId, p.materialId].forEach((x) => add(mIds, x));
      // Plan 039: a fruit weigh-in targets a vineyard block; the chosen block is a run-time (attempt) value.
      [t.blockId, p.blockId, actualOf(t).blockId].forEach((x) => add(bIds, x));
      // Transform run-time ids (dest/source vessels, parent/add lots, fraction vessels) come off the attempt.
      if (t.opType === "CRUSH" || t.opType === "PRESS") {
        const a = actualOf(t);
        [a.destVesselId, a.sourceVesselId].forEach((x) => add(vIds, x));
        [a.parentLotId, a.addLotId, a.lotId].forEach((x) => add(lIds, x));
        if (Array.isArray(a.fractions)) for (const f of a.fractions as Record<string, unknown>[]) add(vIds, f?.destVesselId);
      }
    }
    const [vessels, lots, materials, blocks, vols] = await Promise.all([
      prisma.vessel.findMany({ where: { id: { in: [...vIds] } }, select: { id: true, code: true, type: true, capacityL: true } }),
      prisma.lot.findMany({ where: { id: { in: [...lIds] } }, select: { id: true, code: true } }),
      prisma.cellarMaterial.findMany({ where: { id: { in: [...mIds] } }, select: { id: true, name: true } }),
      bIds.size ? prisma.vineyardBlock.findMany({ where: { id: { in: [...bIds] } }, select: { id: true, blockLabel: true, code: true, vineyard: { select: { name: true } } } }) : Promise.resolve([] as { id: string; blockLabel: string | null; code: string | null; vineyard: { name: string } }[]),
      vIds.size ? prisma.vesselLot.groupBy({ by: ["vesselId"], where: { vesselId: { in: [...vIds] } }, _sum: { volumeL: true } }) : Promise.resolve([] as { vesselId: string; _sum: { volumeL: unknown } }[]),
    ]);
    const vMap = new Map(vessels.map((v) => [v.id, v]));
    const volMap = new Map(vols.map((g) => [g.vesselId, Number(g._sum.volumeL ?? 0)]));
    const lMap = new Map(lots.map((l) => [l.id, l.code]));
    const mMap = new Map(materials.map((m) => [m.id, m.name]));
    const bMap = new Map(blocks.map((b) => [b.id, `${b.vineyard.name} · ${b.blockLabel ?? b.code ?? "block"}`]));
    const vLabel = (id?: string | null) => { const v = id ? vMap.get(id) : null; return v ? `${v.type === "BARREL" ? "Barrel" : "Tank"} ${v.code}` : null; };
    const vVolume = (id?: string | null) => { const v = id ? vMap.get(id) : null; if (!v) return 0; return v.type === "BARREL" ? Number(v.capacityL ?? volMap.get(id!) ?? 0) : Number(volMap.get(id!) ?? 0); };
    const isBarrel = (id?: string | null) => (id ? vMap.get(id)?.type === "BARREL" : false);
    const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() && Number.isFinite(Number(v)) ? Number(v) : null);
    const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

    const tasks: WorkOrderPrintTask[] = wo.tasks.map((t) => {
      const p = (t.plannedPayload ?? {}) as Record<string, unknown>;
      const rows: PrintRow[] = [];
      const typeLabel = t.kind === "OPERATION" ? `Operation · ${t.opType ?? ""}`
        : t.kind === "MAINTENANCE" ? `Maintenance · ${(t.activityType ?? "").replace(/_/g, " ").toLowerCase()}`
        : t.kind === "NOTE" ? "Checklist"
        : t.observationType === "HARVEST_WEIGH_IN" ? "Fruit intake / weigh-in"
        : `Observation · ${t.observationType ?? ""}`;

      // Vessel(s): rack/top read from→to; everything else a single vessel.
      const fromV = vLabel(str(p.fromVesselId) ?? t.sourceVesselId);
      const toV = vLabel(str(p.toVesselId) ?? t.destVesselId);
      const singleV = vLabel(str(p.vesselId) ?? t.destVesselId ?? t.sourceVesselId);
      if (fromV && toV) { rows.push({ label: "From", value: fromV }); rows.push({ label: "To", value: toV }); }
      else if (singleV) rows.push({ label: "Vessel", value: singleV });
      const lotCode = lMap.get(str(p.lotId) ?? t.lotId ?? "");
      if (lotCode) rows.push({ label: "Lot", value: lotCode });
      const matName = mMap.get(str(p.materialId) ?? t.materialId ?? "");
      if (matName) rows.push({ label: "Material", value: matName });

      // Dose (ADDITION/FINING): amount + doseUnit (or legacy rate) → a plain line + the computed total.
      if (t.opType === "ADDITION" || t.opType === "FINING") {
        const amount = num(p.amount); const doseUnit = str(p.doseUnit);
        const rv = num(p.rateValue); const rb = str(p.rateBasis);
        const vid = str(p.vesselId) ?? t.destVesselId ?? t.sourceVesselId;
        const vol = vVolume(vid);
        if (amount != null && doseUnit) {
          rows.push({ label: "Dose", value: `${amount} ${doseUnit}` });
          const est = computeDoseTotal(amount, doseUnit, vol);
          if (est) rows.push({ label: "Total to weigh out", value: `≈ ${est.total.toLocaleString()} ${est.unit}${isBarrel(vid) ? " (barrel full)" : vol > 0 ? ` (at ${vol.toLocaleString()} L)` : ""}` });
        } else if (rv != null && rb && RATE_BASIS_LABELS[rb as RateBasis]) {
          rows.push({ label: "Rate", value: `${rv} ${RATE_BASIS_LABELS[rb as RateBasis]}` });
          const est = resolveDoseUnit(RATE_BASIS_LABELS[rb as RateBasis]) ? computeDoseTotal(rv, RATE_BASIS_LABELS[rb as RateBasis], vol) : null;
          if (est) rows.push({ label: "Total to weigh out", value: `≈ ${est.total.toLocaleString()} ${est.unit}${vol > 0 ? ` (at ${vol.toLocaleString()} L)` : ""}` });
        } else if (amount != null) {
          // Bare amount (legacy WO path, no unit chosen) — in the material's stock unit.
          rows.push({ label: "Dose", value: String(amount) });
        }
      } else if (t.opType === "CRUSH") {
        // Plan 035: picks + measured output are run-time (attempt) values; merge planned "what" ⊕ actual.
        const m = { ...p, ...actualOf(t) };
        const picks = Array.isArray(m.picks) ? (m.picks as { consumedKg?: unknown }[]) : [];
        if (picks.length) {
          const totalKg = Math.round(picks.reduce((s, pk) => s + (num(pk?.consumedKg) ?? 0), 0) * 1000) / 1000;
          rows.push({ label: "Picks", value: `${picks.length} pick${picks.length === 1 ? "" : "s"} · ${totalKg} kg` });
        }
        const destV = vLabel(str(m.destVesselId));
        if (destV) rows.push({ label: "Destination", value: destV });
        const addLot = lMap.get(str(m.addLotId) ?? "");
        if (addLot) rows.push({ label: "Add into lot", value: addLot });
        const out = num(m.outputVolumeL);
        if (out != null) rows.push({ label: "Output", value: `${out} L` });
        if (m.crusherOn != null) rows.push({ label: "Crusher", value: m.crusherOn === true || m.crusherOn === "true" ? "on" : "off" });
        const pct = num(m.crushedPct); if (pct != null) rows.push({ label: "% crushed", value: String(pct) });
        const temp = num(m.mustTempC); if (temp != null) rows.push({ label: "Must temp", value: `${temp} °C` });
        const cycle = str(m.pressCycle); if (cycle) rows.push({ label: "Press cycle", value: cycle });
      } else if (t.observationType === "HARVEST_WEIGH_IN") {
        // Plan 039: block + weigh-in readings are run-time (attempt) values; merge planned ⊕ actual.
        const m = { ...p, ...actualOf(t) };
        const blockLabel = bMap.get(str(m.blockId) ?? t.blockId ?? "");
        if (blockLabel) rows.push({ label: "Block", value: blockLabel });
        const wkg = num(m.weightKg); if (wkg != null) rows.push({ label: "Weight", value: `${wkg} kg` });
        const bx = num(m.brixAtPick); if (bx != null) rows.push({ label: "Brix", value: `${bx} °Bx` });
        const ph = num(m.phAtPick); if (ph != null) rows.push({ label: "pH", value: String(ph) });
        const ta = num(m.taAtPick); if (ta != null) rows.push({ label: "TA", value: `${ta} g/L` });
      } else if (t.opType === "PRESS") {
        const m = { ...p, ...actualOf(t) };
        const opSel = str(m.op); if (opSel) rows.push({ label: "Operation", value: opSel === "SAIGNEE" ? "Saignée" : "Press" });
        const parent = lMap.get(str(m.parentLotId) ?? ""); if (parent) rows.push({ label: "Lot", value: parent });
        const src = vLabel(str(m.sourceVesselId)); if (src) rows.push({ label: "Source", value: src });
        const fractions = Array.isArray(m.fractions) ? (m.fractions as Record<string, unknown>[]) : [];
        fractions.forEach((f) => {
          const v = vLabel(str(f?.destVesselId)); const vol = num(f?.volumeL); const flabel = str(f?.label) ?? "fraction";
          rows.push({ label: `Fraction · ${flabel}`, value: `${v ?? "?"}${vol != null ? ` · ${vol} L` : ""}` });
        });
        const loss = num(m.lossL); if (loss != null && loss > 0) rows.push({ label: "Lees loss", value: `${loss} L` });
        const cycle = str(m.pressCycle); if (cycle) rows.push({ label: "Press cycle", value: cycle });
      } else {
        // Other typed fields, human-labelled (no raw ids).
        const push = (key: string, label: string, suffix = "") => { const v = num(p[key]) ?? str(p[key]); if (v != null) rows.push({ label, value: `${v}${suffix}` }); };
        push("amount", "Amount"); // maintenance amount (unit lives on the material)
        push("filterType", "Filter"); push("micron", "Micron", " µm"); push("actualOutputL", "Output", " L");
        const target = num(p.targetValue); const tu = str(p.targetUnit);
        if (target != null) rows.push({ label: "Target", value: tu ? `${target} ${tu}` : String(target) });
        push("achievedValue", "Achieved"); push("gasType", "Gas");
        push("drawL", "Draw", " L"); push("lossL", "Loss", " L"); push("volumeL", "Volume", " L");
        const rackType = str(p.rackType);
        if (rackType) rows.push({ label: "Rack type", value: rackType });
      }

      return { id: t.id, seq: t.seq, title: t.title, typeLabel, rows, instructions: t.instructions, completionNote: t.completionNote, deviationReason: t.deviationReason };
    });

    return {
      number: wo.number, title: wo.title, status: wo.status,
      issuedByEmail: wo.issuedByEmail, assigneeEmail: wo.assigneeEmail,
      issuedAt: wo.issuedAt ? wo.issuedAt.toISOString() : null, dueAt: wo.dueAt ? wo.dueAt.toISOString() : null,
      instructions: wo.instructions, tasks,
    };
  });
}

// Plan 071: everything the edit page needs to reopen a WO in the builder — the WO scalars (incl. the
// locationId the display read omits), the raw task rows for the reverse-mapper, its dependency edges, and
// each task's advisory equipment ids. One tenant-scoped read.
export type WorkOrderEditTaskRow = {
  id: string; seq: number; groupSeq: number; kind: string; status: string; title: string;
  opType: string | null; observationType: string | null; activityType: string | null;
  assigneeId: string | null; plannedPayload: unknown;
};
export type WorkOrderEditData = {
  id: string; number: number; status: string; title: string;
  assigneeEmail: string | null; dueAt: string | null; priority: string | null; locationId: string | null;
  dependsOn: string[];
  tasks: WorkOrderEditTaskRow[];
  equipmentByTask: Record<string, string[]>;
};

export async function getWorkOrderForEdit(tenantId: string, workOrderId: string): Promise<WorkOrderEditData | null> {
  return runAsTenant(tenantId, async () => {
    const wo = await prisma.workOrder.findUnique({
      where: { id: workOrderId },
      include: { tasks: { orderBy: [{ groupSeq: "asc" }, { seq: "asc" }] } },
    });
    if (!wo) return null;
    const taskIds = wo.tasks.map((t) => t.id);
    const [eqLinks, depEdges] = await Promise.all([
      taskIds.length ? prisma.workOrderTaskEquipment.findMany({ where: { taskId: { in: taskIds } }, select: { taskId: true, equipmentId: true } }) : Promise.resolve([] as { taskId: string; equipmentId: string }[]),
      prisma.workOrderDependency.findMany({ where: { workOrderId: wo.id }, select: { dependsOnWorkOrderId: true } }),
    ]);
    const equipmentByTask: Record<string, string[]> = {};
    for (const l of eqLinks) (equipmentByTask[l.taskId] ??= []).push(l.equipmentId);
    return {
      id: wo.id,
      number: wo.number,
      status: wo.status,
      title: wo.title,
      assigneeEmail: wo.assigneeEmail,
      dueAt: wo.dueAt ? wo.dueAt.toISOString() : null,
      priority: wo.priority,
      locationId: wo.locationId,
      dependsOn: depEdges.map((d) => d.dependsOnWorkOrderId),
      tasks: wo.tasks.map((t) => ({
        id: t.id, seq: t.seq, groupSeq: t.groupSeq, kind: t.kind, status: t.status, title: t.title,
        opType: t.opType, observationType: t.observationType, activityType: t.activityType,
        assigneeId: t.assigneeId, plannedPayload: t.plannedPayload,
      })),
      equipmentByTask,
    };
  });
}

/** Count of work orders awaiting review (PENDING_APPROVAL) — the nav badge source. */
export async function countPendingApprovalWorkOrders(tenantId: string): Promise<number> {
  return runAsTenant(tenantId, () => prisma.workOrder.count({ where: { status: "PENDING_APPROVAL" } }));
}

export type ArchiveRow = {
  id: string;
  number: number;
  title: string;
  status: string;
  finalizedAt: string | null; // approvedAt/cancelledAt/updatedAt, ISO
  assigneeEmail: string | null;
  taskCount: number;
  doneCount: number;
  noteSnippet: string | null; // D4: a completed note/deviation surfaced on the row
};

export type WorkOrderArchivePage = { rows: ArchiveRow[]; total: number; page: number; pageSize: number };

/**
 * The filterable archive of FINALIZED work orders (APPROVED/CANCELLED), newest-first, paginated (A10).
 * K12-safe (explicit tenantId, runAsTenant). Uses the E2 (tenantId, status, updatedAt) index. Surfaces a
 * completed-note/deviation snippet per row (D4) so the winemaker sees what was logged without drilling in.
 */
export async function getWorkOrderArchive(
  tenantId: string,
  filters: ArchiveFilters,
  page = 1,
): Promise<WorkOrderArchivePage> {
  return runAsTenant(tenantId, async () => {
    const where = buildArchiveWhere(filters) as Prisma.WorkOrderWhereInput;
    const pageSize = ARCHIVE_PAGE_SIZE;
    const safePage = Number.isInteger(page) && page > 0 ? page : 1;
    const [total, rows] = await Promise.all([
      prisma.workOrder.count({ where }),
      prisma.workOrder.findMany({
        where,
        orderBy: [{ updatedAt: "desc" }, { number: "desc" }],
        skip: (safePage - 1) * pageSize,
        take: pageSize,
        select: {
          id: true, number: true, title: true, status: true, updatedAt: true,
          approvedAt: true, cancelledAt: true, assigneeEmail: true,
          tasks: { select: { status: true, completionNote: true, deviationReason: true, seq: true }, orderBy: { seq: "asc" } },
        },
      }),
    ]);
    const list: ArchiveRow[] = rows.map((r) => {
      const noteTask = r.tasks.find((t) => (t.completionNote && t.completionNote.trim()) || (t.deviationReason && t.deviationReason.trim()));
      const note = noteTask ? (noteTask.deviationReason?.trim() || noteTask.completionNote?.trim() || null) : null;
      return {
        id: r.id,
        number: r.number,
        title: r.title,
        status: r.status,
        finalizedAt: (r.approvedAt ?? r.cancelledAt ?? r.updatedAt)?.toISOString() ?? null,
        assigneeEmail: r.assigneeEmail,
        taskCount: r.tasks.length,
        doneCount: r.tasks.filter((t) => t.status === "APPROVED" || t.status === "DONE").length,
        noteSnippet: note ? (note.length > 120 ? `${note.slice(0, 117)}…` : note) : null,
      };
    });
    return { rows: list, total, page: safePage, pageSize };
  });
}

export type WorkOrderListRow = {
  id: string;
  number: number;
  title: string;
  status: string;
  dueAt: Date | null; // kept as Date for bucketing; the client gets ISO via the summary shape below
  assigneeEmail: string | null;
  startedByEmail: string | null;
  taskCount: number;
  doneCount: number;
};

export type WorkOrderSummary = Omit<WorkOrderListRow, "dueAt"> & { dueAt: string | null };

const toSummary = (r: WorkOrderListRow): WorkOrderSummary => ({ ...r, dueAt: r.dueAt ? r.dueAt.toISOString() : null });

/** The manager dashboard: open WOs bucketed by due date (overdue/today/upcoming/unscheduled) + the
 * pending-approval lane + counts. K12-safe: tenantId is explicit, reads wrapped in runAsTenant. A8:
 * one query with a task-status aggregate — no N+1. */
export async function getWorkOrderDashboard(
  tenantId: string,
  now: Date,
  filters: WorkOrderFilters = {},
): Promise<{ buckets: BucketedItem<WorkOrderSummary>; pendingApproval: WorkOrderSummary[]; counts: Record<string, number> }> {
  return runAsTenant(tenantId, async () => {
    const rows = await prisma.workOrder.findMany({
      where: buildOpenWhere(filters) as Prisma.WorkOrderWhereInput,
      orderBy: [{ dueAt: "asc" }, { number: "asc" }],
      select: {
        id: true, number: true, title: true, status: true, dueAt: true, assigneeEmail: true, startedByEmail: true,
        tasks: { select: { status: true } },
      },
    });
    const list: WorkOrderListRow[] = rows.map((r) => ({
      id: r.id, number: r.number, title: r.title, status: r.status, dueAt: r.dueAt,
      assigneeEmail: r.assigneeEmail, startedByEmail: r.startedByEmail,
      taskCount: r.tasks.length,
      doneCount: r.tasks.filter((t) => t.status === "APPROVED" || t.status === "DONE").length,
    }));
    const open = list.filter((r) => r.status === "ISSUED" || r.status === "IN_PROGRESS");
    const pendingApproval = list.filter((r) => r.status === "PENDING_APPROVAL");
    const bucketedDates = bucketWorkOrders(open.map((r) => ({ ...r, dueAt: r.dueAt })), now);
    const buckets: BucketedItem<WorkOrderSummary> = {
      overdue: bucketedDates.overdue.map(toSummary),
      today: bucketedDates.today.map(toSummary),
      upcoming: bucketedDates.upcoming.map(toSummary),
      unscheduled: bucketedDates.unscheduled.map(toSummary),
    };
    return {
      buckets,
      pendingApproval: pendingApproval.map(toSummary),
      counts: {
        overdue: buckets.overdue.length,
        today: buckets.today.length,
        upcoming: buckets.upcoming.length,
        unscheduled: buckets.unscheduled.length,
        pendingApproval: pendingApproval.length,
      },
    };
  });
}

export type ReviewQueueItem = {
  taskId: string;
  workOrderId: string;
  workOrderNumber: number;
  workOrderTitle: string;
  taskTitle: string;
  opType: string | null;
  completedByEmail: string | null;
  attemptId: string | null;
  operationId: number | null;
  deviations: Deviation[];
  hasSignificantDeviation: boolean; // D3: gates bulk select-all to exact matches
  completionNote: string | null;
  deviationReason: string | null;
};

/** The review queue: every PENDING_APPROVAL task with its current attempt, the planned-vs-actual
 * deviation, and the significance flag (D3). A8: one query with the attempt included — no N+1. */
export async function getReviewQueue(tenantId: string): Promise<ReviewQueueItem[]> {
  return runAsTenant(tenantId, async () => {
    const tasks = await prisma.workOrderTask.findMany({
      where: { status: "PENDING_APPROVAL" },
      orderBy: [{ dueAt: "asc" }, { seq: "asc" }],
      include: {
        workOrder: { select: { number: true, title: true } },
        attempts: { orderBy: { seq: "desc" }, take: 1 },
      },
    });
    return tasks.map((t) => {
      const attempt = t.attempts[0] ?? null;
      const deviations = computeDeviations(
        (t.plannedPayload ?? {}) as Record<string, unknown>,
        (attempt?.actualPayload ?? {}) as Record<string, unknown>,
      );
      return {
        taskId: t.id,
        workOrderId: t.workOrderId,
        workOrderNumber: t.workOrder.number,
        workOrderTitle: t.workOrder.title,
        taskTitle: t.title,
        opType: t.opType,
        completedByEmail: attempt?.completedByEmail ?? null,
        attemptId: attempt?.id ?? null,
        operationId: attempt?.operationId ?? null,
        deviations,
        hasSignificantDeviation: hasSignificantDeviation(deviations),
        completionNote: t.completionNote,
        deviationReason: t.deviationReason,
      };
    });
  });
}

/** The manager's template picker (issue-from-template). */
export async function listWorkOrderTemplates(tenantId: string): Promise<{ id: string; code: string; name: string; category: string | null; isSystem: boolean }[]> {
  return runAsTenant(tenantId, () =>
    prisma.workOrderTemplate.findMany({
      where: { archivedAt: null },
      orderBy: [{ isSystem: "desc" }, { name: "asc" }],
      select: { id: true, code: true, name: true, category: true, isSystem: true },
    }),
  );
}

export type TemplateWithSpec = { id: string; name: string; currentVersion: number; spec: unknown };

/** A template + its current spec (the new-WO form renders one field group per spec task). */
export async function getTemplateWithCurrentSpec(tenantId: string, templateId: string): Promise<TemplateWithSpec | null> {
  return runAsTenant(tenantId, async () => {
    const tpl = await prisma.workOrderTemplate.findUnique({ where: { id: templateId }, select: { id: true, name: true, currentVersion: true } });
    if (!tpl) return null;
    const version = await prisma.workOrderTemplateVersion.findFirst({ where: { templateId: tpl.id, version: tpl.currentVersion }, select: { spec: true } });
    return { id: tpl.id, name: tpl.name, currentVersion: tpl.currentVersion, spec: version?.spec ?? { tasks: [] } };
  });
}

/** Every non-archived template with its current spec — the new-WO form renders field groups from these. */
export async function listTemplatesWithSpec(tenantId: string): Promise<{ id: string; name: string; isSystem: boolean; spec: unknown }[]> {
  return runAsTenant(tenantId, async () => {
    const tpls = await prisma.workOrderTemplate.findMany({
      where: { archivedAt: null },
      orderBy: [{ isSystem: "desc" }, { name: "asc" }],
      select: { id: true, name: true, isSystem: true, currentVersion: true, versions: { select: { version: true, spec: true } } },
    });
    return tpls.map((t) => ({ id: t.id, name: t.name, isSystem: t.isSystem, spec: t.versions.find((v) => v.version === t.currentVersion)?.spec ?? { tasks: [] } }));
  });
}

/** Plan 053 A6: org members for the per-task assignee picker. `member` is a GLOBAL (non-tenant) table
 * keyed by organizationId, so it is queried directly (not through the tenant RLS extension). */
export type OrgMemberRow = { userId: string; name: string; email: string };
export async function listOrgMembers(tenantId: string): Promise<OrgMemberRow[]> {
  const members = await prisma.member.findMany({
    where: { organizationId: tenantId },
    select: { userId: true, user: { select: { name: true, email: true } } },
    orderBy: { id: "asc" },
  });
  return members.map((m) => ({ userId: m.userId, name: m.user?.name?.trim() || m.user?.email || "Member", email: m.user?.email ?? "" }));
}

/** Plan 053 A6: candidate predecessor work orders for the "runs after" cross-order dependency picker —
 * the tenant's non-terminal WOs (a finished/cancelled order isn't a useful prerequisite to add). */
export type DependableWorkOrderRow = { id: string; number: number; title: string; status: string };
export async function listDependableWorkOrders(tenantId: string): Promise<DependableWorkOrderRow[]> {
  return runAsTenant(tenantId, async () => {
    const wos = await prisma.workOrder.findMany({
      where: { status: { in: ["DRAFT", "ISSUED", "IN_PROGRESS", "PENDING_APPROVAL"] } },
      orderBy: { updatedAt: "desc" },
      take: 100,
      select: { id: true, number: true, title: true, status: true },
    });
    return wos.map((w) => ({ id: w.id, number: w.number, title: w.title, status: w.status }));
  });
}

/** Plan 053 B9: active locations for the builder's location picker (+ their classification). */
export type LocationRow = { id: string; name: string; kind: string | null };
export async function listLocations(tenantId: string): Promise<LocationRow[]> {
  return runAsTenant(tenantId, async () => {
    const rows = await prisma.location.findMany({
      where: { isActive: true },
      orderBy: [{ isSystem: "desc" }, { name: "asc" }],
      select: { id: true, name: true, kind: true },
    });
    return rows.map((r) => ({ id: r.id, name: r.name, kind: r.kind }));
  });
}

export type TemplateListRow = { id: string; code: string; name: string; category: string | null; isSystem: boolean; archivedAt: string | null; blockCount: number };

/** The builder's template list (plan 034). System + custom, block count derived from the current
 * version's spec. `view` toggles active vs archived (Open|Archive). tenantId is explicit (K12). */
export async function listTemplatesForBuilder(tenantId: string, opts?: { archived?: boolean }): Promise<TemplateListRow[]> {
  return runAsTenant(tenantId, async () => {
    const tpls = await prisma.workOrderTemplate.findMany({
      where: { tenantId, archivedAt: opts?.archived ? { not: null } : null },
      orderBy: [{ isSystem: "desc" }, { name: "asc" }],
      select: { id: true, code: true, name: true, category: true, isSystem: true, archivedAt: true, currentVersion: true, versions: { select: { version: true, spec: true } } },
    });
    return tpls.map((t) => {
      const spec = t.versions.find((v) => v.version === t.currentVersion)?.spec as { tasks?: unknown[] } | undefined;
      return { id: t.id, code: t.code, name: t.name, category: t.category, isSystem: t.isSystem, archivedAt: t.archivedAt ? t.archivedAt.toISOString() : null, blockCount: Array.isArray(spec?.tasks) ? spec!.tasks.length : 0 };
    });
  });
}

export type TemplateVersionRow = { version: number; spec: unknown; createdAt: string; createdByEmail: string | null };
export type TemplateDetail = {
  id: string; code: string; name: string; description: string | null; category: string | null;
  isSystem: boolean; clonedFromId: string | null; recurringCadence: string | null;
  currentVersion: number; archivedAt: string | null; spec: unknown; versions: TemplateVersionRow[];
};

/** A template with its current spec + full version lineage — the builder's detail + editor read (plan
 * 034). Composes on the same shape as getTemplateWithCurrentSpec (eng review: don't duplicate). K12:
 * tenantId is explicit in the where. */
export async function getTemplateDetail(tenantId: string, templateId: string): Promise<TemplateDetail | null> {
  return runAsTenant(tenantId, async () => {
    const tpl = await prisma.workOrderTemplate.findFirst({
      where: { id: templateId, tenantId },
      select: {
        id: true, code: true, name: true, description: true, category: true, isSystem: true,
        clonedFromId: true, recurringCadence: true, currentVersion: true, archivedAt: true,
        versions: { orderBy: { version: "desc" }, select: { version: true, spec: true, createdAt: true, createdByEmail: true } },
      },
    });
    if (!tpl) return null;
    const current = tpl.versions.find((v) => v.version === tpl.currentVersion);
    return {
      id: tpl.id, code: tpl.code, name: tpl.name, description: tpl.description, category: tpl.category,
      isSystem: tpl.isSystem, clonedFromId: tpl.clonedFromId, recurringCadence: tpl.recurringCadence,
      currentVersion: tpl.currentVersion, archivedAt: tpl.archivedAt ? tpl.archivedAt.toISOString() : null,
      spec: current?.spec ?? { tasks: [] },
      versions: tpl.versions.map((v) => ({ version: v.version, spec: v.spec, createdAt: v.createdAt.toISOString(), createdByEmail: v.createdByEmail })),
    };
  });
}

export type PickerOption = { id: string; label: string; unit?: string | null; kind?: string | null; category?: string | null; subcategory?: string | null; onHand?: number | null; volumeL?: number | null; capacityL?: number | null };

/**
 * Option lists for the new-WO field pickers (active vessels, stock materials, active lots), plus
 * `lotsByVessel` — which lots each vessel currently holds, read from the authoritative `vesselLot`
 * projection. The builder uses it so naming a tank resolves its occupying lot instead of asking the
 * winemaker to find it in a list of every lot in the winery (see vessel-lot-resolve.ts). Same query
 * count as before: the per-vessel volume sum is now folded from the same rows.
 */
export async function getWorkOrderPickers(tenantId: string): Promise<{ vessels: PickerOption[]; materials: PickerOption[]; lots: PickerOption[]; lotsByVessel: LotsByVessel }> {
  return runAsTenant(tenantId, async () => {
    const [vessels, materials, lots, residents, onHand] = await Promise.all([
      prisma.vessel.findMany({ where: { isActive: true }, orderBy: [{ type: "asc" }, { code: "asc" }], select: { id: true, code: true, type: true, capacityL: true } }),
      // Phase 034/036: kind is the family (picker chips); category scopes the picker (cost-safety); brand/generic drive the label.
      prisma.cellarMaterial.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true, stockUnit: true, kind: true, category: true, subcategory: true, isStockTracked: true, genericName: true, brandName: true, preferGeneric: true } }),
      prisma.lot.findMany({ where: { status: "ACTIVE" }, orderBy: { code: "asc" }, take: 500, select: { id: true, code: true } }),
      // Current occupancy (the fold of the ledger, VesselLot): drives BOTH the dose calculator's per-vessel
      // volume and the vessel→lot narrowing. Lot codes come from here, so a resident lot is always
      // selectable even if it falls outside the 500-lot list above.
      prisma.vesselLot.findMany({ select: { vesselId: true, volumeL: true, lot: { select: { id: true, code: true } } }, orderBy: { lot: { code: "asc" } } }),
      // Per-material on-hand (summed open SupplyLots) — surfaced next to each option in the picker.
      prisma.supplyLot.groupBy({ by: ["materialId"], where: { qtyRemaining: { gt: 0 } }, _sum: { qtyRemaining: true } }),
    ]);
    const volByVessel = new Map<string, number>();
    const lotsByVessel: LotsByVessel = {};
    for (const r of residents) {
      volByVessel.set(r.vesselId, (volByVessel.get(r.vesselId) ?? 0) + Number(r.volumeL ?? 0));
      (lotsByVessel[r.vesselId] ??= []).push({ id: r.lot.id, label: r.lot.code });
    }
    const onHandByMaterial = new Map(onHand.map((g) => [g.materialId, Number(g._sum.qtyRemaining ?? 0)]));
    return {
      vessels: vessels.map((v) => ({ id: v.id, label: `${v.type === "BARREL" ? "Barrel" : "Tank"} ${v.code}`, kind: v.type, volumeL: volByVessel.get(v.id) ?? 0, capacityL: v.capacityL == null ? null : Number(v.capacityL) })),
      // label = the display name (brand/generic per preference); unit = the material's stock unit.
      materials: materials.map((m) => ({ id: m.id, label: materialDisplayName(m), unit: m.stockUnit, kind: m.kind, category: m.category, subcategory: m.subcategory, onHand: m.isStockTracked ? (onHandByMaterial.get(m.id) ?? 0) : null })),
      lots: lots.map((l) => ({ id: l.id, label: l.code })),
      lotsByVessel,
    };
  });
}
