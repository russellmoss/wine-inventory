"use server";

import { action } from "@/lib/actions";
import { listTemplatesWithSpec, getWorkOrderPickers, type PickerOption } from "@/lib/work-orders/data";
import { createWorkOrderFromTemplateCore } from "@/lib/work-orders/templates";
import { issueWorkOrderCore } from "@/lib/work-orders/lifecycle";
import { gateWorkOrderReadinessForWrite } from "@/lib/work-orders/proposal-readiness";
import { revalidatePath } from "next/cache";

// Plan 045, Unit 9 — the "issue a work order against THIS vessel" composer. Two thin server wrappers over
// the EXISTING work-order creation flow; no new WO engine. `getVesselWorkOrderComposerData` feeds the
// embedded `NewWorkOrderClient` (in lockedVessel mode); `createAndIssueWorkOrderAction` does the two-step
// create-from-template → issue that the standalone page splits across a page navigation.

export type VesselWorkOrderComposerData = {
  templates: { id: string; name: string; isSystem: boolean; spec: unknown }[];
  pickers: { vessels: PickerOption[]; materials: PickerOption[]; lots: PickerOption[] };
};

/** Composer data for the in-modal WO issuer: the same templates + pickers the standalone /work-orders/new
 * page loads. The FULL vessels list is kept (transform destinations still need every vessel); the primary
 * vessel is locked in the UI, not here. The `vesselId` arg identifies the vessel being composed against;
 * the tenant is taken from the verified session (K9), never the client. Read-only. */
export const getVesselWorkOrderComposerData = action(
  async ({ actor }, _vesselId: string): Promise<VesselWorkOrderComposerData> => {
    const [templates, pickers] = await Promise.all([
      listTemplatesWithSpec(actor.tenantId),
      getWorkOrderPickers(actor.tenantId),
    ]);
    return { templates, pickers };
  },
);

/** Mirror of createWorkOrderFromTemplateAction's input (the client assembles the same taskBuilds). */
export type CreateAndIssueInput = {
  templateId: string;
  title?: string;
  instructions?: string;
  assigneeEmail?: string | null;
  dueAt?: Date | null;
  autoFinalize?: boolean;
  perTaskOverrides?: Record<string, unknown>[];
  taskBuilds?: { taskType: string; title?: string; values: Record<string, unknown> }[];
  readinessFingerprint?: string | null;
};

export type CreateAndIssueResult = {
  workOrderId: string;
  number: number;
  status: string;
  reservationWarnings: string[];
};

/** Create a DRAFT from a template then immediately issue it (→ ISSUED), returning the number + any
 * reservation warnings from issuance. Composes the same two cores the standalone flow uses across two
 * steps — no new lifecycle logic. Revalidates the WO surfaces. */
export const createAndIssueWorkOrderAction = action(
  async ({ actor }, input: CreateAndIssueInput): Promise<CreateAndIssueResult> => {
    const { readinessFingerprint, ...coreInput } = input;
    if (coreInput.taskBuilds && coreInput.taskBuilds.length > 0) {
      await gateWorkOrderReadinessForWrite(
        coreInput.taskBuilds,
        { source: "vessel_modal", title: coreInput.title ?? "Work order", assigneeEmail: coreInput.assigneeEmail ?? null, dueDate: null },
        readinessFingerprint,
      );
    }
    const created = await createWorkOrderFromTemplateCore(actor, coreInput);
    const issued = await issueWorkOrderCore(actor, { workOrderId: created.workOrderId });
    revalidatePath("/work-orders");
    revalidatePath(`/work-orders/${issued.workOrderId}`);
    return {
      workOrderId: issued.workOrderId,
      number: issued.number,
      status: issued.status,
      reservationWarnings: issued.reservationWarnings,
    };
  },
);
