import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { AppUser } from "@/lib/access";
import { verifyProposal } from "./confirm";

/**
 * A committer applies a confirmed write proposal by calling the REAL server
 * action (which re-runs auth, scoping, validation, and writeAudit). Write tools
 * register their committer here in Unit 4. The args are the resolved values that
 * were signed into the proposal token.
 */
export type CommitResult = {
  message: string;
  // Optional deep link to the record the write just created/touched, surfaced
  // as a "View X →" affordance in the UI (plan 042). Built from the freshly
  // created id, which only exists post-commit.
  navigate?: { path: string; label: string };
};

export type Committer = (user: AppUser, args: Record<string, unknown>) => Promise<CommitResult>;

import { commitLogBrix } from "./tools/log-brix";
import { commitDeleteBrix } from "./tools/delete-brix";
import { commitSetYieldEstimate } from "./tools/set-yield-estimate";
import { commitLogHarvestPick } from "./tools/log-harvest-pick";
import { commitDeleteHarvestPick } from "./tools/delete-harvest-pick";
import { commitAdjustInventory } from "./tools/adjust-inventory";
import { commitRackWine } from "./tools/rack-wine";
import { commitAddAddition } from "./tools/add-addition";
import { commitRecordMeasurement } from "./tools/record-measurement";
import { commitRecordTastingNote } from "./tools/record-tasting-note";
import { commitCreateWorkOrder } from "./tools/create-work-order";
import { commitCompleteTask } from "./tools/complete-task";
import { commitReviewTask } from "./tools/review-task";
import { commitManageWorkOrder } from "./tools/manage-work-order";
import { commitGroupRackBatch } from "./tools/group-rack-batch";
import { commitTopUp } from "./tools/top-up";
import { commitFilterVessel } from "./tools/filter-vessel";
import { commitLogCapManagement } from "./tools/log-cap-management";
import { commitBlendLots } from "./tools/blend-lots";
import { commitTransitionLotState } from "./tools/transition-lot-state";
import { commitUndoOperation } from "./tools/undo-operation";
import { commitRevertTransfer } from "./tools/revert-transfer";
import { commitDbCreate } from "./tools/db-create";
import { commitDbUpdate } from "./tools/db-update";
import { commitDbDelete } from "./tools/db-delete";
import { commitSaveFieldReport } from "./tools/save-field-report";
import { commitCreateTemplate, commitUpdateTemplateSpec, commitCloneTemplate, commitArchiveTemplate } from "./tools/templates-write";
import { commitIssueCapManagementWo } from "./tools/work-orders-write";
import { commitIssueOperationWo } from "./tools/issue-operation-wo";
import { commitProposeWorkOrder } from "./tools/propose-work-order";
import { commitCreateMaterial } from "./tools/create-material";
import { commitReceiveSupply } from "./tools/receive-supply";
import { commitSetMaterialActive } from "./tools/set-material-active";
import { commitPullSample } from "./tools/pull-sample";
import { commitRecordSampleResults } from "./tools/record-sample-results";
import { commitManageSample } from "./tools/manage-sample";
import { commitRemoveBulkWine } from "./tools/remove-bulk-wine";
import { commitRemoveBottledWine } from "./tools/remove-bottled-wine";
import { commitSparklingTirage } from "./tools/sparkling-tirage";
import { commitLogRiddling } from "./tools/log-riddling";
import { commitSparklingDisgorge } from "./tools/sparkling-disgorge";
import { commitRecordBulkWineCost } from "./tools/record-bulk-wine-cost";
import { commitFileFeedback } from "./tools/file-feedback";
import { commitCreateVendor } from "./tools/create-vendor";
import { commitCreateCustomUnit } from "./tools/create-custom-unit";
import { commitIngestDocuments } from "./tools/ingest-documents";
import { commitReverseIntake } from "./tools/reverse-intake";
import { commitMergeVendors } from "./tools/merge-vendors";
// Plan 080 U12
import { commitReceiveConsumable } from "./tools/receive-consumable";
import { commitAdjustConsumable } from "./tools/adjust-consumable";
import { commitTransferConsumable } from "./tools/transfer-consumable";
import { commitAddEquipment } from "./tools/add-equipment";
import { commitAddInvoice } from "./tools/add-invoice";
import { commitReceiveFinishedGood } from "./tools/receive-finished-good";

// Static map of tool name -> committer. No side-effect registration, no import
// cycle: commit.ts imports the tool modules; the tool modules never import commit.ts.
const COMMITTERS: Record<string, Committer> = {
  log_brix: commitLogBrix,
  delete_brix: commitDeleteBrix,
  set_yield_estimate: commitSetYieldEstimate,
  log_harvest_pick: commitLogHarvestPick,
  delete_harvest_pick: commitDeleteHarvestPick,
  adjust_inventory: commitAdjustInventory,
  receive_consumable: commitReceiveConsumable,
  adjust_consumable: commitAdjustConsumable,
  transfer_consumable: commitTransferConsumable,
  add_equipment: commitAddEquipment,
  add_invoice: commitAddInvoice,
  receive_finished_good: commitReceiveFinishedGood,
  rack_wine: commitRackWine,
  add_addition: commitAddAddition,
  record_measurement: commitRecordMeasurement,
  record_tasting_note: commitRecordTastingNote,
  create_work_order: commitCreateWorkOrder,
  complete_task: commitCompleteTask,
  review_task: commitReviewTask,
  manage_work_order: commitManageWorkOrder,
  group_rack_batch: commitGroupRackBatch,
  top_up: commitTopUp,
  filter_vessel: commitFilterVessel,
  log_cap_management: commitLogCapManagement,
  blend_lots: commitBlendLots,
  transition_lot_state: commitTransitionLotState,
  undo_operation: commitUndoOperation,
  revert_transfer: commitRevertTransfer,
  db_create: commitDbCreate,
  db_update: commitDbUpdate,
  db_delete: commitDbDelete,
  save_field_report: commitSaveFieldReport,
  create_template: commitCreateTemplate,
  update_template_spec: commitUpdateTemplateSpec,
  clone_template: commitCloneTemplate,
  archive_template: commitArchiveTemplate,
  issue_cap_management_wo: commitIssueCapManagementWo,
  issue_operation_wo: commitIssueOperationWo,
  propose_work_order: commitProposeWorkOrder,
  create_material: commitCreateMaterial,
  receive_supply: commitReceiveSupply,
  set_material_active: commitSetMaterialActive,
  pull_sample: commitPullSample,
  record_sample_results: commitRecordSampleResults,
  manage_sample: commitManageSample,
  remove_bulk_wine: commitRemoveBulkWine,
  remove_bottled_wine: commitRemoveBottledWine,
  sparkling_tirage: commitSparklingTirage,
  log_riddling: commitLogRiddling,
  sparkling_disgorge: commitSparklingDisgorge,
  record_bulk_wine_cost: commitRecordBulkWineCost,
  file_feedback: commitFileFeedback,
  create_vendor: commitCreateVendor,
  create_custom_unit: commitCreateCustomUnit,
  ingest_documents: commitIngestDocuments,
  reverse_intake: commitReverseIntake,
  merge_vendors: commitMergeVendors,
};

/**
 * The tool names that have a registered committer. Exported ONLY so the eval harness can assert that every
 * `kind:"write"` tool in the registry is actually commit-able — a write tool registered without a committer
 * looks fine until a user confirms it and hits "That action can no longer be applied."
 */
export function committerToolNames(): string[] {
  return Object.keys(COMMITTERS);
}

/**
 * Verify a confirmation token, burn its nonce (single-use, BEFORE committing so a
 * replay/double-submit can't double-apply), then run the tool's committer.
 */
export async function commitProposal(user: AppUser, token: string): Promise<CommitResult> {
  const payload = verifyProposal(token);
  if (payload.kind === "resume") throw new Error("That's a selection token, not a confirmation.");
  const committer = COMMITTERS[payload.tool];
  if (!committer) throw new Error("That action can no longer be applied.");

  try {
    await prisma.assistantConfirmation.create({
      data: { nonce: payload.nonce, tool: payload.tool, actorEmail: user.email },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new Error("This change was already confirmed.");
    }
    throw e;
  }

  return committer(user, payload.args);
}
