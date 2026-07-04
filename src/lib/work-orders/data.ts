import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { runAsTenant } from "@/lib/tenant/context";
import { bucketWorkOrders, type BucketedItem } from "@/lib/work-orders/buckets";
import { computeDeviations, hasSignificantDeviation, type Deviation } from "@/lib/work-orders/deviation";
import { buildArchiveWhere, ARCHIVE_PAGE_SIZE, type ArchiveFilters } from "@/lib/work-orders/archive-filters";
import { computeDoseTotal, resolveDoseUnit, RATE_BASIS_LABELS, type RateBasis } from "@/lib/cellar/additions-math";

// Read-side view-models for work orders (Phase 9). K12-safe: every reader takes tenantId as an EXPLICIT
// argument and wraps its reads in runAsTenant — never reads the ALS tenant (so these stay correct even
// if wrapped in cache() later). Serializable shapes only (Dates → ISO, Decimals → numbers). The
// dashboard bucketing lives in dashboard.ts (Unit 13); this file holds the detail + count reads.

export type WorkOrderTaskView = {
  id: string;
  seq: number;
  kind: "OPERATION" | "OBSERVATION" | "MAINTENANCE" | "NOTE";
  status: string;
  title: string;
  opType: string | null;
  observationType: string | null;
  activityType: string | null;
  instructions: string | null;
  sourceVesselId: string | null;
  destVesselId: string | null;
  lotId: string | null;
  materialId: string | null;
  assigneeEmail: string | null;
  dueAt: string | null;
  plannedPayload: unknown;
  currentAttemptId: string | null;
  completionNote: string | null;
  deviationReason: string | null;
  startedByEmail: string | null;
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
  autoFinalize: boolean;
  issuedByEmail: string | null;
  issuedAt: string | null;
  startedByEmail: string | null;
  tasks: WorkOrderTaskView[];
};

function taskView(t: {
  id: string; seq: number; kind: string; status: string; title: string; opType: string | null;
  observationType: string | null; activityType: string | null; instructions: string | null; sourceVesselId: string | null;
  destVesselId: string | null; lotId: string | null; materialId: string | null; assigneeEmail: string | null;
  dueAt: Date | null; plannedPayload: unknown; currentAttemptId: string | null; completionNote: string | null;
  deviationReason: string | null; startedByEmail: string | null;
}): WorkOrderTaskView {
  return {
    id: t.id,
    seq: t.seq,
    kind: t.kind as "OPERATION" | "OBSERVATION" | "MAINTENANCE",
    status: t.status,
    title: t.title,
    opType: t.opType,
    observationType: t.observationType,
    activityType: t.activityType,
    instructions: t.instructions,
    sourceVesselId: t.sourceVesselId,
    destVesselId: t.destVesselId,
    lotId: t.lotId,
    materialId: t.materialId,
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
      include: { tasks: { orderBy: { seq: "asc" } } },
    });
    if (!wo) return null;
    return {
      id: wo.id,
      number: wo.number,
      title: wo.title,
      status: wo.status,
      instructions: wo.instructions,
      assigneeEmail: wo.assigneeEmail,
      dueAt: wo.dueAt ? wo.dueAt.toISOString() : null,
      scheduledFor: wo.scheduledFor ? wo.scheduledFor.toISOString() : null,
      autoFinalize: wo.autoFinalize,
      issuedByEmail: wo.issuedByEmail,
      issuedAt: wo.issuedAt ? wo.issuedAt.toISOString() : null,
      startedByEmail: wo.startedByEmail,
      tasks: wo.tasks.map(taskView),
    };
  });
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
    const wo = await prisma.workOrder.findUnique({ where: { id: workOrderId }, include: { tasks: { orderBy: { seq: "asc" } } } });
    if (!wo) return null;

    // Collect every referenced id (canonical columns + payload) so we can resolve them to human labels.
    const vIds = new Set<string>(); const lIds = new Set<string>(); const mIds = new Set<string>();
    const add = (set: Set<string>, v: unknown) => { if (typeof v === "string" && v) set.add(v); };
    for (const t of wo.tasks) {
      const p = (t.plannedPayload ?? {}) as Record<string, unknown>;
      [t.destVesselId, t.sourceVesselId, p.vesselId, p.fromVesselId, p.toVesselId].forEach((x) => add(vIds, x));
      [t.lotId, p.lotId].forEach((x) => add(lIds, x));
      [t.materialId, p.materialId].forEach((x) => add(mIds, x));
    }
    const [vessels, lots, materials, vols] = await Promise.all([
      prisma.vessel.findMany({ where: { id: { in: [...vIds] } }, select: { id: true, code: true, type: true, capacityL: true } }),
      prisma.lot.findMany({ where: { id: { in: [...lIds] } }, select: { id: true, code: true } }),
      prisma.cellarMaterial.findMany({ where: { id: { in: [...mIds] } }, select: { id: true, name: true } }),
      vIds.size ? prisma.vesselLot.groupBy({ by: ["vesselId"], where: { vesselId: { in: [...vIds] } }, _sum: { volumeL: true } }) : Promise.resolve([] as { vesselId: string; _sum: { volumeL: unknown } }[]),
    ]);
    const vMap = new Map(vessels.map((v) => [v.id, v]));
    const volMap = new Map(vols.map((g) => [g.vesselId, Number(g._sum.volumeL ?? 0)]));
    const lMap = new Map(lots.map((l) => [l.id, l.code]));
    const mMap = new Map(materials.map((m) => [m.id, m.name]));
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
): Promise<{ buckets: BucketedItem<WorkOrderSummary>; pendingApproval: WorkOrderSummary[]; counts: Record<string, number> }> {
  return runAsTenant(tenantId, async () => {
    const rows = await prisma.workOrder.findMany({
      where: { status: { in: ["ISSUED", "IN_PROGRESS", "PENDING_APPROVAL"] } },
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

export type PickerOption = { id: string; label: string; unit?: string | null; kind?: string | null; volumeL?: number | null; capacityL?: number | null };

/** Option lists for the new-WO field pickers (active vessels, stock materials, active lots). */
export async function getWorkOrderPickers(tenantId: string): Promise<{ vessels: PickerOption[]; materials: PickerOption[]; lots: PickerOption[] }> {
  return runAsTenant(tenantId, async () => {
    const [vessels, materials, lots, vol] = await Promise.all([
      prisma.vessel.findMany({ where: { isActive: true }, orderBy: [{ type: "asc" }, { code: "asc" }], select: { id: true, code: true, type: true, capacityL: true } }),
      prisma.cellarMaterial.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true, stockUnit: true } }),
      prisma.lot.findMany({ where: { status: "ACTIVE" }, orderBy: { code: "asc" }, take: 500, select: { id: true, code: true } }),
      // Current wine volume per vessel (the fold of the ledger, VesselLot) — drives the dose calculator.
      prisma.vesselLot.groupBy({ by: ["vesselId"], _sum: { volumeL: true } }),
    ]);
    const volByVessel = new Map(vol.map((g) => [g.vesselId, Number(g._sum.volumeL ?? 0)]));
    return {
      vessels: vessels.map((v) => ({ id: v.id, label: `${v.type === "BARREL" ? "Barrel" : "Tank"} ${v.code}`, kind: v.type, volumeL: volByVessel.get(v.id) ?? 0, capacityL: v.capacityL == null ? null : Number(v.capacityL) })),
      // unit = the material's stock unit (g/mL/…); the maintenance/addition "amount" is denominated in it.
      materials: materials.map((m) => ({ id: m.id, label: m.name, unit: m.stockUnit })),
      lots: lots.map((l) => ({ id: l.id, label: l.code })),
    };
  });
}
