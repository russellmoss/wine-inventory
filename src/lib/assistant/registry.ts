import "server-only";
import type { AppUser } from "@/lib/access";

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

export type ToolContext = { user: AppUser };

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
import { revertTransferTool } from "./tools/revert-transfer";
import { dbFindTool } from "./tools/db-find";
import { dbCreateTool } from "./tools/db-create";
import { dbUpdateTool } from "./tools/db-update";
import { dbDeleteTool } from "./tools/db-delete";
import { reportAnomaliesTool } from "./tools/report-anomalies";
import { listTemplatesTool, getTemplateTool } from "./tools/templates-read";
import { createTemplateTool, updateTemplateSpecTool, cloneTemplateTool, archiveTemplateTool } from "./tools/templates-write";

const ALL_TOOLS: AssistantTool[] = [
  queryBrixTool,
  queryYieldTool,
  queryRecentHarvestsTool,
  queryTransfersTool,
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
  revertTransferTool,
  dbFindTool,
  dbCreateTool,
  dbUpdateTool,
  dbDeleteTool,
  reportAnomaliesTool,
  listTemplatesTool,
  getTemplateTool,
  createTemplateTool,
  updateTemplateSpecTool,
  cloneTemplateTool,
  archiveTemplateTool,
];

/** Tools this user is allowed to see, after role filtering. */
export function getToolsFor(user: AppUser): AssistantTool[] {
  const isAdmin = user.role === "admin";
  return ALL_TOOLS.filter((t) => !t.adminOnly || isAdmin);
}
