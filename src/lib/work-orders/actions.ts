"use server";

import { revalidatePath } from "next/cache";
import { action, safeAction, safeAdminAction } from "@/lib/actions";
import {
  createWorkOrderCore,
  issueWorkOrderCore,
  assignWorkOrderCore,
  scheduleWorkOrderCore,
  cancelWorkOrderCore,
  startTaskCore,
  type CreateWorkOrderInput,
} from "@/lib/work-orders/lifecycle";
import { completeTaskCore, completeTasksBatchCore, completeGroupRackBatchCore, type CompleteTaskInput, type GroupRackBatchInput } from "@/lib/work-orders/execute";
import {
  createWorkOrderFromTemplateCore,
  createTemplateCore,
  updateTemplateSpecCore,
  cloneTemplateCore,
  archiveTemplateCore,
  unarchiveTemplateCore,
} from "@/lib/work-orders/templates";
import type { TemplateSpec, TaskBuild } from "@/lib/work-orders/template-vocabulary";
import { instantiateTaskBuilds } from "@/lib/work-orders/template-vocabulary";
import { resolveTaskVocabulary } from "@/lib/work-orders/vocabulary-resolver";
import { normalizeWorkOrderPriority, normalizeDurationMin } from "@/lib/work-orders/planning";
import { attachTaskEquipmentCore, setTaskEquipmentCore } from "@/lib/equipment/equipment";
import { updateWorkOrderCore, type UpdateTaskSlot } from "@/lib/work-orders/update-core";
import { draftNlWorkOrderForBuilder } from "@/lib/work-orders/nl-resolve";
import { requireTenantId } from "@/lib/tenant/context";
import { approveTaskCore, rejectTaskCore, bulkApproveTasksCore, rejectGroupRackBatchCore, undoMaintenanceTaskCore } from "@/lib/work-orders/approval";
import { shouldAutoFinalize } from "@/lib/work-orders/authority";
import { gateWorkOrderReadinessForWrite } from "@/lib/work-orders/proposal-readiness";
import { firstBlockingPriorTask } from "@/lib/work-orders/group-gating";
import { assertPredecessorsDone, addWorkOrderDependencyCore, removeWorkOrderDependencyCore } from "@/lib/work-orders/wo-dependencies";
import { prisma } from "@/lib/prisma";
import { canManagerAccessVineyard, type AppUser } from "@/lib/access";
import { ActionError } from "@/lib/action-error";

// "use server" wrappers for the work-order lifecycle (Phase 9 Unit 4). Each wraps a script-safe core in
// action() (auth + tenant + actor injection) and revalidates the WO surfaces. Execution + approval
// actions are added in Units 6/7.

/** Revalidate every surface that renders work-order state. */
function revalidateWorkOrders(workOrderId?: string) {
  revalidatePath("/work-orders");
  revalidatePath("/work-orders/review");
  if (workOrderId) {
    revalidatePath(`/work-orders/${workOrderId}`);
    revalidatePath(`/work-orders/${workOrderId}/execute`);
  }
}

// ── Template authoring (plan 034). Admin-gated (council: cellar hands must not edit shared SOPs; the
// role model is admin-vs-manager, so authoring = admin). Issuing/running WOs stays open to all via
// action(). Revalidate the builder surfaces + the issue-from-template picker. ──
function revalidateTemplates(templateId?: string) {
  revalidatePath("/work-orders/templates");
  if (templateId) revalidatePath(`/work-orders/templates/${templateId}`);
  revalidatePath("/work-orders/new"); // the issue-from-template picker reads the template list
}

export const createTemplateAction = safeAdminAction(
  async ({ actor }, input: { name: string; description?: string; category?: string; spec: TemplateSpec }) => {
    const res = await createTemplateCore(actor, input);
    revalidateTemplates(res.templateId);
    return res;
  },
);

export const updateTemplateSpecAction = safeAdminAction(async ({ actor }, input: { templateId: string; spec: TemplateSpec }) => {
  const res = await updateTemplateSpecCore(actor, input);
  revalidateTemplates(res.templateId);
  return res;
});

export const cloneTemplateAction = safeAdminAction(async ({ actor }, input: { templateId: string; name?: string }) => {
  const res = await cloneTemplateCore(actor, input);
  revalidateTemplates(res.templateId);
  return res;
});

export const archiveTemplateAction = safeAdminAction(async ({ actor }, input: { templateId: string }) => {
  const res = await archiveTemplateCore(actor, input);
  revalidateTemplates(res.templateId);
  return res;
});

export const unarchiveTemplateAction = safeAdminAction(async ({ actor }, input: { templateId: string }) => {
  const res = await unarchiveTemplateCore(actor, input);
  revalidateTemplates(res.templateId);
  return res;
});

export const createWorkOrderAction = safeAction(async ({ actor }, input: CreateWorkOrderInput) => {
  const res = await createWorkOrderCore(actor, input);
  revalidateWorkOrders(res.workOrderId);
  return res;
});

export const issueWorkOrderAction = safeAction(async ({ actor }, input: { workOrderId: string; validUntil?: Date }) => {
  const res = await issueWorkOrderCore(actor, input);
  revalidateWorkOrders(res.workOrderId);
  return res;
});

/** Create a DRAFT work order from a template (snaps the current version), with per-task field overrides.
 * Phase 9.3: when the client sends explicit taskBuilds, re-run the shared readiness engine server-side
 * immediately before writing and refuse on a true blocker (or stale state) — the write path is the last
 * authority, not the form. */
export const createWorkOrderFromTemplateAction = safeAction(
  async (
    { actor },
    input: {
      templateId: string;
      title?: string;
      instructions?: string;
      assigneeId?: string | null;
      assigneeEmail?: string | null;
      dueAt?: Date | null;
      autoFinalize?: boolean;
      perTaskOverrides?: Record<string, unknown>[];
      taskBuilds?: { taskType: string; title?: string; values: Record<string, unknown> }[];
      readinessFingerprint?: string | null;
    },
  ) => {
    const { readinessFingerprint, ...coreInput } = input;
    if (coreInput.taskBuilds && coreInput.taskBuilds.length > 0) {
      await gateWorkOrderReadinessForWrite(
        coreInput.taskBuilds,
        { source: "manual", title: coreInput.title ?? "Work order", assigneeEmail: coreInput.assigneeEmail ?? null, dueDate: null },
        readinessFingerprint,
      );
    }
    const res = await createWorkOrderFromTemplateCore(actor, coreInput);
    revalidateWorkOrders(res.workOrderId);
    return res;
  },
);

/** Plan 053 D14: the AI accelerator behind the builder's "describe the job" box. Wraps the shared NL
 * proposal engine and returns already vocab-resolved taskBuilds for the builder to HYDRATE as an editable
 * draft. Read-only (no create/issue) — the builder submits through createWorkOrderFromBuildsAction after
 * the user edits groups/assignees. Uses the tenant-resolved vocabulary, so a named Custom Log resolves. */
export const draftWorkOrderFromTextAction = action(async (_ctx, input: { text: string }) => {
  const text = String(input.text ?? "").trim();
  if (!text) return { status: "empty" as const, taskBuilds: [] as TaskBuild[], title: "", unresolved: [], warnings: [] };
  // Resolve against the tenant vocabulary (named Custom Logs resolve too) and hand back the EDITABLE builds
  // even when not fully ready — the builder hydrates them, the user fixes anything, and the create action
  // re-runs the shared readiness gate server-side. This is a read-only draft (no create/issue here).
  const draft = await draftNlWorkOrderForBuilder({ sourceText: text }, { tenantId: requireTenantId() });
  return {
    status: draft.status,
    title: draft.title,
    taskBuilds: draft.taskBuilds,
    unresolved: draft.unresolved,
    warnings: draft.warnings,
  };
});

/** Plan 053 A6: create a DRAFT work order from the palette builder — a flat TaskBuild[] carrying groupSeq
 * (sequential groups) + per-task assigneeId, with no template lock. Re-runs the shared readiness gate
 * server-side, resolves the tenant vocabulary, instantiates, creates, then wires any WO->WO dependencies. */
export const createWorkOrderFromBuildsAction = safeAction(
  async (
    { actor },
    input: {
      title?: string;
      instructions?: string;
      assigneeId?: string | null;
      assigneeEmail?: string | null;
      dueAt?: Date | null;
      priority?: string | null;
      estimatedDurationMin?: number | null;
      scheduledStart?: Date | null;
      scheduledEnd?: Date | null;
      locationId?: string | null;
      autoFinalize?: boolean;
      taskBuilds: TaskBuild[];
      dependsOnWorkOrderIds?: string[];
      readinessFingerprint?: string | null;
    },
  ) => {
    const builds = Array.isArray(input.taskBuilds) ? input.taskBuilds : [];
    if (builds.length === 0) throw new ActionError("A work order needs at least one task.");
    // B8: validate the planning inputs server-side (never trust the form).
    const priority = normalizeWorkOrderPriority(input.priority);
    const estimatedDurationMin = normalizeDurationMin(input.estimatedDurationMin);
    await gateWorkOrderReadinessForWrite(
      builds,
      { source: "manual", title: input.title?.trim() || "Work order", assigneeEmail: input.assigneeEmail ?? null, dueDate: null },
      input.readinessFingerprint,
    );
    const tasks = instantiateTaskBuilds(builds, await resolveTaskVocabulary());
    const res = await createWorkOrderCore(actor, {
      title: input.title?.trim() || "Work order",
      instructions: input.instructions,
      assigneeId: input.assigneeId ?? null,
      assigneeEmail: input.assigneeEmail ?? null,
      dueAt: input.dueAt ?? null,
      priority,
      estimatedDurationMin,
      scheduledStart: input.scheduledStart ?? null,
      scheduledEnd: input.scheduledEnd ?? null,
      locationId: input.locationId ?? null,
      autoFinalize: input.autoFinalize,
      tasks,
    });
    for (const depId of input.dependsOnWorkOrderIds ?? []) {
      if (depId && depId !== res.workOrderId) {
        await addWorkOrderDependencyCore(actor, { workOrderId: res.workOrderId, dependsOnWorkOrderId: depId });
      }
    }
    // B10: attach advisory required-equipment to the created tasks (seq matches taskBuilds order). Never blocks.
    const needsEquipment = builds.some((b) => Array.isArray(b.equipmentIds) && b.equipmentIds.length > 0);
    if (needsEquipment) {
      const rows = await prisma.workOrderTask.findMany({ where: { workOrderId: res.workOrderId }, orderBy: { seq: "asc" }, select: { id: true, seq: true } });
      for (const t of rows) {
        const eq = builds[t.seq - 1]?.equipmentIds;
        if (Array.isArray(eq) && eq.length > 0) await attachTaskEquipmentCore(t.id, eq);
      }
    }
    revalidateWorkOrders(res.workOrderId);
    return res;
  },
);

/** Plan 071: edit an existing work order in place from the builder. `groups` is the full ordered layout —
 * each task is either LOCKED (executed; only repositioned) or editable (its taskType/values/assignee/
 * equipment). Only editable builds hit the readiness gate + get instantiated; the core refuses to touch a
 * locked/executed task, re-syncs reservations for changed pending tasks (issued WOs), and keeps the status. */
type EditTaskInput = {
  existingTaskId?: string;
  locked: boolean;
  taskType: string;
  title?: string;
  values?: Record<string, unknown>;
  assigneeId?: string | null;
  equipmentIds?: string[];
};
export const updateWorkOrderFromBuildsAction = action(
  async (
    { actor },
    input: {
      workOrderId: string;
      title?: string;
      instructions?: string;
      assigneeId?: string | null;
      assigneeEmail?: string | null;
      dueAt?: Date | null;
      priority?: string | null;
      locationId?: string | null;
      groups: EditTaskInput[][];
      dependsOnWorkOrderIds?: string[];
      readinessFingerprint?: string | null;
    },
  ) => {
    const groups = Array.isArray(input.groups) ? input.groups : [];
    const flat = groups.flatMap((g, gi) => (Array.isArray(g) ? g.map((t) => ({ ...t, groupSeq: gi })) : []));
    if (flat.length === 0) throw new ActionError("A work order needs at least one task.");
    const priority = normalizeWorkOrderPriority(input.priority);

    // Only the editable (non-locked) tasks are re-validated + instantiated; locked tasks keep their content.
    const editable = flat.filter((t) => !t.locked);
    const editableBuilds: TaskBuild[] = editable.map((t) => ({
      taskType: t.taskType,
      title: t.title,
      values: t.values ?? {},
      assigneeId: t.assigneeId ?? null,
      groupSeq: t.groupSeq,
    }));
    await gateWorkOrderReadinessForWrite(
      editableBuilds,
      { source: "manual", title: input.title?.trim() || "Work order", assigneeEmail: input.assigneeEmail ?? null, dueDate: null },
      input.readinessFingerprint,
    );
    const instantiated = instantiateTaskBuilds(editableBuilds, await resolveTaskVocabulary());

    let ei = 0;
    const slots: UpdateTaskSlot[] = flat.map((t, i) =>
      t.locked
        ? { existingTaskId: t.existingTaskId, locked: true, seq: i + 1, groupSeq: t.groupSeq }
        : { existingTaskId: t.existingTaskId ?? undefined, locked: false, seq: i + 1, groupSeq: t.groupSeq, input: instantiated[ei++] },
    );

    const res = await updateWorkOrderCore(actor, {
      workOrderId: input.workOrderId,
      title: input.title,
      instructions: input.instructions,
      assigneeId: input.assigneeId ?? null,
      assigneeEmail: input.assigneeEmail ?? null,
      dueAt: input.dueAt ?? null,
      priority,
      locationId: input.locationId ?? null,
      slots,
    });

    // Equipment: set the exact list per non-locked task (locked tasks untouched).
    for (let i = 0; i < flat.length; i++) {
      if (flat[i].locked) continue;
      await setTaskEquipmentCore(res.taskIds[i], Array.isArray(flat[i].equipmentIds) ? flat[i].equipmentIds! : []);
    }

    // Dependencies: diff current edges vs desired.
    const desired = new Set((input.dependsOnWorkOrderIds ?? []).filter((d) => d && d !== input.workOrderId));
    const current = await prisma.workOrderDependency.findMany({ where: { workOrderId: input.workOrderId }, select: { id: true, dependsOnWorkOrderId: true } });
    for (const edge of current) if (!desired.has(edge.dependsOnWorkOrderId)) await removeWorkOrderDependencyCore(actor, { id: edge.id });
    const currentDeps = new Set(current.map((e) => e.dependsOnWorkOrderId));
    for (const depId of desired) if (!currentDeps.has(depId)) await addWorkOrderDependencyCore(actor, { workOrderId: input.workOrderId, dependsOnWorkOrderId: depId });

    revalidateWorkOrders(input.workOrderId);
    return res;
  },
);

export const assignWorkOrderAction = safeAction(
  async ({ actor }, input: { workOrderId: string; assigneeId: string | null; assigneeEmail: string | null }) => {
    const res = await assignWorkOrderCore(actor, input);
    revalidateWorkOrders(res.workOrderId);
    return res;
  },
);

export const scheduleWorkOrderAction = safeAction(
  async ({ actor }, input: { workOrderId: string; dueAt?: Date | null; scheduledFor?: Date | null }) => {
    const res = await scheduleWorkOrderCore(actor, input);
    revalidateWorkOrders(res.workOrderId);
    return res;
  },
);

export const cancelWorkOrderAction = safeAction(async ({ actor }, input: { workOrderId: string; reason?: string }) => {
  const res = await cancelWorkOrderCore(actor, input);
  revalidateWorkOrders(res.workOrderId);
  return res;
});

// A5: cross-order dependencies. Open (like issue/assign/schedule); the completion gate does the enforcing.
export const addWorkOrderDependencyAction = safeAction(
  async ({ actor }, input: { workOrderId: string; dependsOnWorkOrderId: string }) => {
    const res = await addWorkOrderDependencyCore(actor, input);
    revalidateWorkOrders(input.workOrderId);
    return res;
  },
);

export const removeWorkOrderDependencyAction = safeAction(async ({ actor }, input: { id: string; workOrderId?: string }) => {
  const res = await removeWorkOrderDependencyCore(actor, { id: input.id });
  revalidateWorkOrders(input.workOrderId);
  return res;
});

export const startTaskAction = safeAction(async ({ actor }, input: { taskId: string }) => {
  const res = await startTaskCore(actor, input);
  revalidateWorkOrders();
  return res;
});

/** Per-task completion pre-flight (shared by single + batch completion): enforce the D9 vineyard-access
 * guard for a HARVEST_WEIGH_IN and compute autoFinalize server-side (never client-trusted). Returns the
 * input enriched with the resolved autoFinalize. */
/** Plan 053 A3: sequential-group gating. Tasks share a `groupSeq` (parallel within a group); a task may
 * complete only once EVERY task in a LOWER group is worker-completed. Positional (no taskKey/dependsOn
 * blob), so a rejected-and-reissued predecessor naturally holds its group open until it is redone. The
 * decision is the pure `firstBlockingPriorTask`; this wrapper just loads the sibling tasks. */
async function assertTaskDependenciesReady(taskId: string): Promise<void> {
  const task = await prisma.workOrderTask.findUnique({ where: { id: taskId }, select: { workOrderId: true, groupSeq: true } });
  if (!task || task.groupSeq <= 0) return;
  const siblings = await prisma.workOrderTask.findMany({
    where: { workOrderId: task.workOrderId, groupSeq: { lt: task.groupSeq } },
    select: { title: true, seq: true, status: true, groupSeq: true },
  });
  const blocking = firstBlockingPriorTask(task.groupSeq, siblings);
  if (blocking) {
    throw new ActionError(`"${blocking.title}" must be completed before this task can run — finish the earlier step first.`);
  }
}

async function prepareCompleteInput(user: AppUser, input: CompleteTaskInput): Promise<CompleteTaskInput> {
  await assertTaskDependenciesReady(input.taskId);
  const task = await prisma.workOrderTask.findUnique({
    where: { id: input.taskId },
    select: { workOrderId: true, observationType: true, blockId: true, workOrder: { select: { autoFinalize: true } } },
  });
  // A5: cross-order gate — a task can't complete until this WO's prerequisite work orders are done.
  if (task) await assertPredecessorsDone(task.workOrderId);
  // Plan 039: a fruit weigh-in writes a HarvestPick to a vineyard block. Enforce the same D9 vineyard
  // membership the harvest form (requireBlockAccess) + assistant tool (findScopedBlocks) require — the
  // block picker already scopes the UI, so this closes the crafted-payload gap on the server.
  if (task?.observationType === "HARVEST_WEIGH_IN") {
    const actualBlockId = typeof input.actualPayload?.blockId === "string" ? input.actualPayload.blockId : null;
    const blockId = actualBlockId ?? task.blockId;
    if (!blockId) throw new ActionError("This weigh-in has no vineyard block to record against.");
    const block = await prisma.vineyardBlock.findUnique({ where: { id: blockId }, select: { vineyardId: true } });
    if (!block) throw new ActionError("That vineyard block was not found.");
    if (!canManagerAccessVineyard(user, block.vineyardId)) {
      throw new ActionError("You can only weigh in fruit for your assigned vineyard.", "FORBIDDEN");
    }
  }
  const autoFinalize = task ? shouldAutoFinalize(user, { autoFinalize: task.workOrder.autoFinalize }) : false;
  return { ...input, autoFinalize };
}

/** Complete a task (the floor-first "check it off"). OPERATION → real ledger op + PENDING_APPROVAL
 * attempt; OBSERVATION → direct log + DONE. Idempotent on commandId (offline-drain safe). Auto-finalize
 * (decision 2) is computed server-side from the WO flag + the completer's role — never client-trusted. */
// safeAction (not action): a validation/conflict ActionError from the completion core (empty vessel,
// stale press source, WORKORDER-3, "already completed", …) is a USER-facing message. Thrown, Next.js
// would redact it in prod to an opaque "Server Components render" error (the reported WO-execute bug);
// settled, it rides back as { ok:false } and the client `unwrap`s it into a clean message.
export const completeTaskAction = safeAction(async ({ user, actor }, input: CompleteTaskInput) => {
  const res = await completeTaskCore(actor, await prepareCompleteInput(user, input));
  revalidateWorkOrders(res.taskId);
  return res;
});

/** Batch-complete N tasks at once (plan 043): punch down tanks 3, 4, 5 and mark them all done. Each item
 * carries its OWN commandId (idempotency is per-attempt). Per-item pre-flight + autoFinalize; a partial
 * failure never aborts the rest (per-item pass/fail in the result). Revalidates once at the end. */
const MAX_BATCH_COMPLETE = 100; // defense-in-depth: bound the per-request work (N sequential ledger txs)
export const completeTasksBatchAction = safeAction(async ({ user, actor }, input: { items: CompleteTaskInput[] }) => {
  if (!Array.isArray(input.items) || input.items.length === 0) throw new ActionError("No tasks to complete.");
  // Dedup by taskId: a task must be completed at most once per batch. Without this, a duplicated taskId
  // would complete on the first item then re-complete on the second (fresh commandId) — the completeTaskCore
  // guard now rejects that, but dropping the dup gives a clean result instead of a spurious per-item failure.
  const seen = new Set<string>();
  const unique = input.items.filter((i) => (i.taskId && !seen.has(i.taskId) ? (seen.add(i.taskId), true) : false));
  if (unique.length > MAX_BATCH_COMPLETE) throw new ActionError(`Too many tasks in one batch (max ${MAX_BATCH_COMPLETE}).`);
  const items = await Promise.all(unique.map((i) => prepareCompleteInput(user, i)));
  const res = await completeTasksBatchCore(actor, { items });
  revalidateWorkOrders();
  return res;
});

/** Approve (finalize) a task. Admin-only (canApprove); no op mutation. */
export const approveTaskAction = safeAction(async ({ user, actor }, input: { taskId: string }) => {
  const res = await approveTaskCore(user, actor, input);
  revalidateWorkOrders(res.taskId);
  return res;
});

/** Reject a task — reverses its ledger op (plan-024). Surfaces the LEDGER-11 "undo dependents first"
 * conflict. Admin-only. */
export const rejectTaskAction = safeAction(async ({ user, actor }, input: { taskId: string; reason?: string }) => {
  const res = await rejectTaskCore(user, actor, input);
  revalidateWorkOrders(res.taskId);
  return res;
});

/** Plan 054: complete a SUBSET of a group-rack task's members ("these 4 barrels now"). Runs the same
 * group/WO-dependency gating + server-side autoFinalize as a normal completion, then the batch core. */
export const completeGroupRackBatchAction = safeAction(async ({ user, actor }, input: GroupRackBatchInput) => {
  await assertTaskDependenciesReady(input.taskId);
  const task = await prisma.workOrderTask.findUnique({ where: { id: input.taskId }, select: { workOrderId: true, workOrder: { select: { autoFinalize: true } } } });
  if (task) await assertPredecessorsDone(task.workOrderId);
  const autoFinalize = task ? shouldAutoFinalize(user, { autoFinalize: task.workOrder.autoFinalize }) : false;
  const res = await completeGroupRackBatchCore(actor, { ...input, autoFinalize });
  revalidateWorkOrders(res.taskId);
  return res;
});

/** Plan 054: undo the latest batch of an in-progress group-rack task (LIFO). Admin-only (canApprove). */
export const rejectGroupRackBatchAction = safeAction(async ({ user, actor }, input: { taskId: string; reason?: string }) => {
  const res = await rejectGroupRackBatchCore(user, actor, input);
  revalidateWorkOrders(res.taskId);
  return res;
});

/** Plan 061: undo a completed maintenance task (single-vessel or a consolidated group) — reverses every
 * member's activity event and reopens the task. Self-undo (the recorder) or admin/developer. */
export const undoMaintenanceTaskAction = safeAction(async ({ user, actor }, input: { taskId: string }) => {
  const res = await undoMaintenanceTaskCore(user, actor, input);
  revalidateWorkOrders(res.taskId);
  return res;
});

/** Bulk approve exact-match tasks (D3). Returns per-item results; a partial failure doesn't abort. */
export const bulkApproveTasksAction = safeAction(async ({ user, actor }, input: { taskIds: string[] }) => {
  const res = await bulkApproveTasksCore(user, actor, input);
  revalidateWorkOrders();
  return res;
});
