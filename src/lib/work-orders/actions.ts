"use server";

import { revalidatePath } from "next/cache";
import { action, adminAction } from "@/lib/actions";
import {
  createWorkOrderCore,
  issueWorkOrderCore,
  assignWorkOrderCore,
  scheduleWorkOrderCore,
  cancelWorkOrderCore,
  startTaskCore,
  type CreateWorkOrderInput,
} from "@/lib/work-orders/lifecycle";
import { completeTaskCore, type CompleteTaskInput } from "@/lib/work-orders/execute";
import {
  createWorkOrderFromTemplateCore,
  createTemplateCore,
  updateTemplateSpecCore,
  cloneTemplateCore,
  archiveTemplateCore,
  unarchiveTemplateCore,
} from "@/lib/work-orders/templates";
import type { TemplateSpec } from "@/lib/work-orders/template-vocabulary";
import { approveTaskCore, rejectTaskCore, bulkApproveTasksCore } from "@/lib/work-orders/approval";
import { shouldAutoFinalize } from "@/lib/work-orders/authority";
import { prisma } from "@/lib/prisma";

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

export const createTemplateAction = adminAction(
  async ({ actor }, input: { name: string; description?: string; category?: string; spec: TemplateSpec }) => {
    const res = await createTemplateCore(actor, input);
    revalidateTemplates(res.templateId);
    return res;
  },
);

export const updateTemplateSpecAction = adminAction(async ({ actor }, input: { templateId: string; spec: TemplateSpec }) => {
  const res = await updateTemplateSpecCore(actor, input);
  revalidateTemplates(res.templateId);
  return res;
});

export const cloneTemplateAction = adminAction(async ({ actor }, input: { templateId: string; name?: string }) => {
  const res = await cloneTemplateCore(actor, input);
  revalidateTemplates(res.templateId);
  return res;
});

export const archiveTemplateAction = adminAction(async ({ actor }, input: { templateId: string }) => {
  const res = await archiveTemplateCore(actor, input);
  revalidateTemplates(res.templateId);
  return res;
});

export const unarchiveTemplateAction = adminAction(async ({ actor }, input: { templateId: string }) => {
  const res = await unarchiveTemplateCore(actor, input);
  revalidateTemplates(res.templateId);
  return res;
});

export const createWorkOrderAction = action(async ({ actor }, input: CreateWorkOrderInput) => {
  const res = await createWorkOrderCore(actor, input);
  revalidateWorkOrders(res.workOrderId);
  return res;
});

export const issueWorkOrderAction = action(async ({ actor }, input: { workOrderId: string; validUntil?: Date }) => {
  const res = await issueWorkOrderCore(actor, input);
  revalidateWorkOrders(res.workOrderId);
  return res;
});

/** Create a DRAFT work order from a template (snaps the current version), with per-task field overrides. */
export const createWorkOrderFromTemplateAction = action(
  async (
    { actor },
    input: {
      templateId: string;
      title?: string;
      instructions?: string;
      assigneeEmail?: string | null;
      dueAt?: Date | null;
      autoFinalize?: boolean;
      perTaskOverrides?: Record<string, unknown>[];
      taskBuilds?: { taskType: string; title?: string; values: Record<string, unknown> }[];
    },
  ) => {
    const res = await createWorkOrderFromTemplateCore(actor, input);
    revalidateWorkOrders(res.workOrderId);
    return res;
  },
);

export const assignWorkOrderAction = action(
  async ({ actor }, input: { workOrderId: string; assigneeId: string | null; assigneeEmail: string | null }) => {
    const res = await assignWorkOrderCore(actor, input);
    revalidateWorkOrders(res.workOrderId);
    return res;
  },
);

export const scheduleWorkOrderAction = action(
  async ({ actor }, input: { workOrderId: string; dueAt?: Date | null; scheduledFor?: Date | null }) => {
    const res = await scheduleWorkOrderCore(actor, input);
    revalidateWorkOrders(res.workOrderId);
    return res;
  },
);

export const cancelWorkOrderAction = action(async ({ actor }, input: { workOrderId: string; reason?: string }) => {
  const res = await cancelWorkOrderCore(actor, input);
  revalidateWorkOrders(res.workOrderId);
  return res;
});

export const startTaskAction = action(async ({ actor }, input: { taskId: string }) => {
  const res = await startTaskCore(actor, input);
  revalidateWorkOrders();
  return res;
});

/** Complete a task (the floor-first "check it off"). OPERATION → real ledger op + PENDING_APPROVAL
 * attempt; OBSERVATION → direct log + DONE. Idempotent on commandId (offline-drain safe). Auto-finalize
 * (decision 2) is computed server-side from the WO flag + the completer's role — never client-trusted. */
export const completeTaskAction = action(async ({ user, actor }, input: CompleteTaskInput) => {
  const task = await prisma.workOrderTask.findUnique({
    where: { id: input.taskId },
    select: { workOrder: { select: { autoFinalize: true } } },
  });
  const autoFinalize = task ? shouldAutoFinalize(user, { autoFinalize: task.workOrder.autoFinalize }) : false;
  const res = await completeTaskCore(actor, { ...input, autoFinalize });
  revalidateWorkOrders(res.taskId);
  return res;
});

/** Approve (finalize) a task. Admin-only (canApprove); no op mutation. */
export const approveTaskAction = action(async ({ user, actor }, input: { taskId: string }) => {
  const res = await approveTaskCore(user, actor, input);
  revalidateWorkOrders(res.taskId);
  return res;
});

/** Reject a task — reverses its ledger op (plan-024). Surfaces the LEDGER-11 "undo dependents first"
 * conflict. Admin-only. */
export const rejectTaskAction = action(async ({ user, actor }, input: { taskId: string; reason?: string }) => {
  const res = await rejectTaskCore(user, actor, input);
  revalidateWorkOrders(res.taskId);
  return res;
});

/** Bulk approve exact-match tasks (D3). Returns per-item results; a partial failure doesn't abort. */
export const bulkApproveTasksAction = action(async ({ user, actor }, input: { taskIds: string[] }) => {
  const res = await bulkApproveTasksCore(user, actor, input);
  revalidateWorkOrders();
  return res;
});
