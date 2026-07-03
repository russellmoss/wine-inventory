"use server";

import { revalidatePath } from "next/cache";
import { action } from "@/lib/actions";
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
