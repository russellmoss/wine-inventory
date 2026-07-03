import type { WorkOrderStatus, WorkOrderTaskStatus } from "@prisma/client";
import { ActionError } from "@/lib/action-error";

// Guarded status machines for the work-order shell and its tasks (Phase 9). Mirrors the Sample
// lifecycle pattern (src/lib/chemistry/samples.ts): a TRANSITIONS map + assertTransition that rejects
// illegal moves. The status enum is the single source of truth for approval state (A5) — there is no
// separate approvalStatus column; timestamps + *ById carry provenance.

// ── Work order shell ──
// DRAFT is editable pre-issue. ISSUED = assigned/scheduled/reserved. IN_PROGRESS = a crew tapped Start
// (D5). PENDING_APPROVAL = all tasks done, ≥1 awaiting review. APPROVED + CANCELLED are terminal. Most
// WO transitions are DRIVEN by the task rollup (see rollUpWorkOrderStatus) but each move is still
// guarded so a bad rollup can't wedge an illegal state.
const WO_TRANSITIONS: Record<WorkOrderStatus, WorkOrderStatus[]> = {
  DRAFT: ["ISSUED", "CANCELLED"],
  ISSUED: ["IN_PROGRESS", "PENDING_APPROVAL", "APPROVED", "CANCELLED"],
  IN_PROGRESS: ["PENDING_APPROVAL", "APPROVED", "ISSUED", "CANCELLED"],
  PENDING_APPROVAL: ["APPROVED", "IN_PROGRESS", "CANCELLED"],
  APPROVED: [],
  CANCELLED: [],
};

// ── Task ──
// PENDING → IN_PROGRESS (claim, D5) → PENDING_APPROVAL (OPERATION completed; a real op exists) →
// APPROVED (finalized) | REJECTED (op reversed; resubmit → back to PENDING per decision 1). DONE is the
// OBSERVATION terminal (no approval gate). SKIPPED = intentionally not done (un-skippable back to PENDING).
const TASK_TRANSITIONS: Record<WorkOrderTaskStatus, WorkOrderTaskStatus[]> = {
  PENDING: ["IN_PROGRESS", "PENDING_APPROVAL", "DONE", "SKIPPED"],
  IN_PROGRESS: ["PENDING_APPROVAL", "DONE", "PENDING", "SKIPPED"],
  PENDING_APPROVAL: ["APPROVED", "REJECTED"],
  REJECTED: ["PENDING", "PENDING_APPROVAL"],
  APPROVED: [],
  DONE: [],
  SKIPPED: ["PENDING"],
};

function humanize(s: string) {
  return s.toLowerCase().replace(/_/g, " ");
}

export function isLegalWorkOrderTransition(from: WorkOrderStatus, to: WorkOrderStatus): boolean {
  return from === to || WO_TRANSITIONS[from].includes(to);
}

export function assertWorkOrderTransition(from: WorkOrderStatus, to: WorkOrderStatus) {
  if (!isLegalWorkOrderTransition(from, to)) {
    throw new ActionError(`A ${humanize(from)} work order can't move to ${humanize(to)}.`, "CONFLICT");
  }
}

export function isLegalTaskTransition(from: WorkOrderTaskStatus, to: WorkOrderTaskStatus): boolean {
  return from === to || TASK_TRANSITIONS[from].includes(to);
}

export function assertTaskTransition(from: WorkOrderTaskStatus, to: WorkOrderTaskStatus) {
  if (!isLegalTaskTransition(from, to)) {
    throw new ActionError(`A ${humanize(from)} task can't move to ${humanize(to)}.`, "CONFLICT");
  }
}

/**
 * Derive the work-order status from its tasks' statuses (pure). The shell status is a rollup of the
 * floor reality, computed after every task move:
 *   - no tasks touched yet                       → keep the issued/in-progress status as-is
 *   - any task IN_PROGRESS/PENDING_APPROVAL/…     → IN_PROGRESS while work is open
 *   - all tasks terminal AND ≥1 PENDING_APPROVAL  → PENDING_APPROVAL (awaiting review)
 *   - all tasks terminal AND none pending review  → APPROVED (everything finalized/observed/skipped)
 * A DRAFT or CANCELLED WO is never rolled up here (its status is set explicitly by issue/cancel).
 */
export function rollUpWorkOrderStatus(
  current: WorkOrderStatus,
  taskStatuses: WorkOrderTaskStatus[],
): WorkOrderStatus {
  if (current === "DRAFT" || current === "CANCELLED" || current === "APPROVED") return current;
  if (taskStatuses.length === 0) return current;

  const anyPendingApproval = taskStatuses.some((s) => s === "PENDING_APPROVAL");
  const allSettled = taskStatuses.every((s) => s === "APPROVED" || s === "DONE" || s === "SKIPPED" || s === "PENDING_APPROVAL");
  const anyStarted = taskStatuses.some((s) => s !== "PENDING");

  if (allSettled && anyPendingApproval) return "PENDING_APPROVAL";
  if (allSettled) return "APPROVED"; // every task finalized/observed/skipped, nothing to review
  if (anyStarted) return "IN_PROGRESS";
  return current;
}
