import "server-only";
import { prisma } from "@/lib/prisma";
import { runAsTenant } from "@/lib/tenant/context";

// Read-side view-models for work orders (Phase 9). K12-safe: every reader takes tenantId as an EXPLICIT
// argument and wraps its reads in runAsTenant — never reads the ALS tenant (so these stay correct even
// if wrapped in cache() later). Serializable shapes only (Dates → ISO, Decimals → numbers). The
// dashboard bucketing lives in dashboard.ts (Unit 13); this file holds the detail + count reads.

export type WorkOrderTaskView = {
  id: string;
  seq: number;
  kind: "OPERATION" | "OBSERVATION";
  status: string;
  title: string;
  opType: string | null;
  observationType: string | null;
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
  observationType: string | null; instructions: string | null; sourceVesselId: string | null;
  destVesselId: string | null; lotId: string | null; materialId: string | null; assigneeEmail: string | null;
  dueAt: Date | null; plannedPayload: unknown; currentAttemptId: string | null; completionNote: string | null;
  deviationReason: string | null; startedByEmail: string | null;
}): WorkOrderTaskView {
  return {
    id: t.id,
    seq: t.seq,
    kind: t.kind as "OPERATION" | "OBSERVATION",
    status: t.status,
    title: t.title,
    opType: t.opType,
    observationType: t.observationType,
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
