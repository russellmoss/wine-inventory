import "server-only";
import { isTenantAdminLike, type AppUser } from "@/lib/access";

/**
 * The assistant's tool registry — the single source of truth for what the
 * in-app chat (and, later, the MCP server) can do. Each tool wraps an existing
 * server action or scoped read; the tool layer never touches Prisma for writes.
 *
 * `kind: "read"` tools execute immediately. `kind: "write"` tools NEVER mutate on
 * first call — they return a confirmation proposal and only commit once the user
 * confirms (see Unit 3/4). `adminOnly` tools are filtered out for managers.
 */
export type ToolKind = "read" | "write";

export type ToolContext = {
  user: AppUser;
  /**
   * The user's most recent message text. The navigate tool uses this to decide
   * (server-side, not on the model's say-so) whether a navigation was an
   * EXPLICIT "take me there" (auto-navigate) vs incidental (render a link).
   */
  lastUserMessage?: string;
};

export type AssistantTool = {
  name: string;
  description: string;
  kind: ToolKind;
  adminOnly?: boolean;
  /** JSON Schema for the tool input (passed verbatim as Anthropic `input_schema`). */
  inputSchema: Record<string, unknown>;
  run: (ctx: ToolContext, input: unknown) => Promise<unknown>;
};

import { queryBrixTool } from "./tools/query-brix";
import { queryYieldTool } from "./tools/query-yield";
import { queryRecentHarvestsTool } from "./tools/query-recent-harvests";
import { queryTransfersTool } from "./tools/query-transfers";
import { queryCellarContentsTool } from "./tools/query-cellar-contents";
import { estimatePackagingNeedsTool } from "./tools/estimate-packaging-needs";
import { queryVineyardStatusTool } from "./tools/query-vineyard-status";
import { queryFieldReportsTool } from "./tools/query-field-reports";
import { getFieldReportFormTool } from "./tools/get-field-report-form";
import { saveFieldReportTool } from "./tools/save-field-report";
import { queryAuditTool } from "./tools/query-audit";
import { logBrixTool } from "./tools/log-brix";
import { deleteBrixTool } from "./tools/delete-brix";
import { setYieldEstimateTool } from "./tools/set-yield-estimate";
import { logHarvestPickTool } from "./tools/log-harvest-pick";
import { adjustInventoryTool } from "./tools/adjust-inventory";
import { rackWineTool } from "./tools/rack-wine";
import { addAdditionTool } from "./tools/add-addition";
import { recordMeasurementTool } from "./tools/record-measurement";
import { recordTastingNoteTool } from "./tools/record-tasting-note";
import { createWorkOrderTool } from "./tools/create-work-order";
import { completeTaskTool } from "./tools/complete-task";
import { reviewTaskTool } from "./tools/review-task";
import { manageWorkOrderTool } from "./tools/manage-work-order";
import { groupRackBatchTool } from "./tools/group-rack-batch";
import { topUpTool } from "./tools/top-up";
import { filterVesselTool } from "./tools/filter-vessel";
import { logCapManagementTool } from "./tools/log-cap-management";
import { blendLotsTool } from "./tools/blend-lots";
import { transitionLotStateTool } from "./tools/transition-lot-state";
import { undoOperationTool } from "./tools/undo-operation";
import { revertTransferTool } from "./tools/revert-transfer";
import { dbFindTool } from "./tools/db-find";
import { dbCreateTool } from "./tools/db-create";
import { dbUpdateTool } from "./tools/db-update";
import { dbDeleteTool } from "./tools/db-delete";
import { reportAnomaliesTool } from "./tools/report-anomalies";
import { navigateTool } from "./tools/navigate";
import { listTemplatesTool, getTemplateTool } from "./tools/templates-read";
import { createTemplateTool, updateTemplateSpecTool, cloneTemplateTool, archiveTemplateTool } from "./tools/templates-write";
import { issueCapManagementWoTool } from "./tools/work-orders-write";
import { issueOperationWoTool } from "./tools/issue-operation-wo";
import { proposeWorkOrderTool } from "./tools/propose-work-order";
import { calcSo2Tool } from "./tools/calc-so2";
import { calcSugarTool } from "./tools/calc-sugar";
import { calcAdditionsTool } from "./tools/calc-additions";
import { calcBlendingTool } from "./tools/calc-blending";
import { calcFortificationTool } from "./tools/calc-fortification";
import { calcConvertTool } from "./tools/calc-convert";
import { queryCalculationHistoryTool } from "./tools/query-calculation-history";
import { createMaterialTool } from "./tools/create-material";
import { receiveSupplyTool } from "./tools/receive-supply";
import { setMaterialActiveTool } from "./tools/set-material-active";
import { pullSampleTool } from "./tools/pull-sample";
import { recordSampleResultsTool } from "./tools/record-sample-results";
import { manageSampleTool } from "./tools/manage-sample";
import { removeBulkWineTool } from "./tools/remove-bulk-wine";
import { removeBottledWineTool } from "./tools/remove-bottled-wine";
import { sparklingTirageTool } from "./tools/sparkling-tirage";
import { logRiddlingTool } from "./tools/log-riddling";
import { sparklingDisgorgeTool } from "./tools/sparkling-disgorge";
import { recordBulkWineCostTool } from "./tools/record-bulk-wine-cost";
import { fileFeedbackTool } from "./tools/file-feedback";
import { queryMaterialsTool } from "./tools/query-materials";
import { createVendorTool } from "./tools/create-vendor";
import { mergeVendorsTool } from "./tools/merge-vendors";
import { queryVendorsTool } from "./tools/query-vendors";
import { ingestDocumentsTool } from "./tools/ingest-documents";
import { queryRecentIntakesTool } from "./tools/query-recent-intakes";
import { reverseIntakeTool } from "./tools/reverse-intake";

const ALL_TOOLS: AssistantTool[] = [
  queryBrixTool,
  queryYieldTool,
  queryRecentHarvestsTool,
  queryTransfersTool,
  queryCellarContentsTool,
  queryMaterialsTool,
  queryVendorsTool,
  estimatePackagingNeedsTool,
  queryVineyardStatusTool,
  queryFieldReportsTool,
  getFieldReportFormTool,
  saveFieldReportTool,
  queryAuditTool,
  logBrixTool,
  deleteBrixTool,
  setYieldEstimateTool,
  logHarvestPickTool,
  adjustInventoryTool,
  rackWineTool,
  addAdditionTool,
  recordMeasurementTool,
  recordTastingNoteTool,
  createWorkOrderTool,
  completeTaskTool,
  reviewTaskTool,
  manageWorkOrderTool,
  groupRackBatchTool,
  topUpTool,
  filterVesselTool,
  logCapManagementTool,
  blendLotsTool,
  transitionLotStateTool,
  undoOperationTool,
  revertTransferTool,
  dbFindTool,
  dbCreateTool,
  dbUpdateTool,
  dbDeleteTool,
  reportAnomaliesTool,
  navigateTool,
  listTemplatesTool,
  getTemplateTool,
  createTemplateTool,
  updateTemplateSpecTool,
  cloneTemplateTool,
  archiveTemplateTool,
  issueCapManagementWoTool,
  issueOperationWoTool,
  proposeWorkOrderTool,
  calcSo2Tool,
  calcSugarTool,
  calcAdditionsTool,
  calcBlendingTool,
  calcFortificationTool,
  calcConvertTool,
  queryCalculationHistoryTool,
  createMaterialTool,
  createVendorTool,
  mergeVendorsTool,
  ingestDocumentsTool,
  queryRecentIntakesTool,
  reverseIntakeTool,
  receiveSupplyTool,
  setMaterialActiveTool,
  pullSampleTool,
  recordSampleResultsTool,
  manageSampleTool,
  removeBulkWineTool,
  removeBottledWineTool,
  sparklingTirageTool,
  logRiddlingTool,
  sparklingDisgorgeTool,
  recordBulkWineCostTool,
  fileFeedbackTool,
];

/** Tools this user is allowed to see, after role filtering. */
export function getToolsFor(user: AppUser): AssistantTool[] {
  const isAdmin = isTenantAdminLike(user);
  return ALL_TOOLS.filter((t) => !t.adminOnly || isAdmin);
}
