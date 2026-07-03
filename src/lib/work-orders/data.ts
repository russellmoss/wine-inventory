import "server-only";
import { prisma } from "@/lib/prisma";
import { runAsTenant } from "@/lib/tenant/context";
import { bucketWorkOrders, type BucketedItem } from "@/lib/work-orders/buckets";
import { computeDeviations, hasSignificantDeviation, type Deviation } from "@/lib/work-orders/deviation";

// Read-side view-models for work orders (Phase 9). K12-safe: every reader takes tenantId as an EXPLICIT
// argument and wraps its reads in runAsTenant — never reads the ALS tenant (so these stay correct even
// if wrapped in cache() later). Serializable shapes only (Dates → ISO, Decimals → numbers). The
// dashboard bucketing lives in dashboard.ts (Unit 13); this file holds the detail + count reads.

export type WorkOrderTaskView = {
  id: string;
  seq: number;
  kind: "OPERATION" | "OBSERVATION" | "MAINTENANCE";
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

/** Count of work orders awaiting review (PENDING_APPROVAL) — the nav badge source. */
export async function countPendingApprovalWorkOrders(tenantId: string): Promise<number> {
  return runAsTenant(tenantId, () => prisma.workOrder.count({ where: { status: "PENDING_APPROVAL" } }));
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

export type PickerOption = { id: string; label: string };

/** Option lists for the new-WO field pickers (active vessels, stock materials, active lots). */
export async function getWorkOrderPickers(tenantId: string): Promise<{ vessels: PickerOption[]; materials: PickerOption[]; lots: PickerOption[] }> {
  return runAsTenant(tenantId, async () => {
    const [vessels, materials, lots] = await Promise.all([
      prisma.vessel.findMany({ where: { isActive: true }, orderBy: [{ type: "asc" }, { code: "asc" }], select: { id: true, code: true, type: true } }),
      prisma.cellarMaterial.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
      prisma.lot.findMany({ where: { status: "ACTIVE" }, orderBy: { code: "asc" }, take: 500, select: { id: true, code: true } }),
    ]);
    return {
      vessels: vessels.map((v) => ({ id: v.id, label: `${v.type === "BARREL" ? "Barrel" : "Tank"} ${v.code}` })),
      materials: materials.map((m) => ({ id: m.id, label: m.name })),
      lots: lots.map((l) => ({ id: l.id, label: l.code })),
    };
  });
}
