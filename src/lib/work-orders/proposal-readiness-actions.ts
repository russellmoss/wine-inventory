"use server";

import { action } from "@/lib/actions";
import {
  buildWorkOrderReadiness,
  type WorkOrderReadinessProposal,
  type WorkOrderReadinessSource,
} from "@/lib/work-orders/proposal-readiness";
import { NL_WORK_ORDER_MAX_TASKS } from "@/lib/work-orders/nl-proposal";
import type { TaskBuild } from "@/lib/work-orders/template-vocabulary";

// Phase 9.3 Unit 2 — the manual/physical WO builder (and the embedded vessel issuer, which reuses it in
// locked-vessel mode) call this to preview the SHARED readiness proposal before create/issue. Read-only.

const SOURCES: WorkOrderReadinessSource[] = ["manual", "template", "vessel_modal", "assistant", "voice", "recurring"];

export type PreviewReadinessInput = {
  source: string;
  title: string;
  assigneeEmail: string | null;
  dueDate: string | null;
  taskBuilds: TaskBuild[];
};

/** Coerce untrusted client input to the readiness core's shape (bound task count, known source). */
function sanitize(input: PreviewReadinessInput) {
  const source = (SOURCES as string[]).includes(input.source) ? (input.source as WorkOrderReadinessSource) : "manual";
  const taskBuilds = Array.isArray(input.taskBuilds) ? input.taskBuilds.slice(0, NL_WORK_ORDER_MAX_TASKS) : [];
  return {
    source,
    title: typeof input.title === "string" && input.title.trim() ? input.title.trim() : "Work order",
    assigneeEmail: typeof input.assigneeEmail === "string" && input.assigneeEmail.trim() ? input.assigneeEmail.trim() : null,
    dueDate: typeof input.dueDate === "string" && input.dueDate.trim() ? input.dueDate.trim() : null,
    taskBuilds: taskBuilds
      .filter((t) => t && typeof t.taskType === "string" && t.values && typeof t.values === "object")
      .map((t) => ({ taskType: t.taskType, ...(t.title ? { title: String(t.title) } : {}), values: t.values as Record<string, unknown> })),
  };
}

/** Read-only readiness preview for the manual builder / vessel modal. The engine performs no writes. */
export const previewWorkOrderReadinessAction = action(
  async (_ctx, input: PreviewReadinessInput): Promise<WorkOrderReadinessProposal> => {
    return buildWorkOrderReadiness(sanitize(input));
  },
);
