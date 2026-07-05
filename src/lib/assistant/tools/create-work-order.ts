import "server-only";
import type { AssistantTool } from "../registry";
import type { Committer } from "../commit";
import { signProposal } from "../confirm";
import { resolveExactlyOne } from "./resolve";
import { listWorkOrderTemplates } from "@/lib/work-orders/data";
import { createWorkOrderFromTemplateAction, issueWorkOrderAction } from "@/lib/work-orders/actions";

// Assistant-coverage Wave 1 #3a — create AND issue a work order from a template by chat. Wraps the
// existing template + lifecycle cores (createWorkOrderFromTemplateAction → issueWorkOrderAction); no db_*.
// Decision (interview 2026-07-05): one step → a live, assignable WO (create + issue), not a draft.

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

type CreateWoRawInput = { template?: string; dueDate?: string; assigneeEmail?: string; title?: string };

export const createWorkOrderTool: AssistantTool = {
  name: "create_work_order",
  description:
    "Create and ISSUE a work order from a template — a live, assignable order the crew can execute. Use when the user says to create / issue / start a work order from a named template (e.g. 'issue the weekly barrel-care order for tomorrow'). Give the template by name; optionally a due date, assignee email, and a title. Does NOT save immediately — returns a preview to confirm.",
  kind: "write",
  inputSchema: {
    type: "object",
    properties: {
      template: { type: "string", description: "Template name, e.g. 'Weekly barrel care'." },
      dueDate: { type: "string", description: "Due date as YYYY-MM-DD (resolve relative dates like 'tomorrow' to a date). Optional." },
      assigneeEmail: { type: "string", description: "Assignee email (optional)." },
      title: { type: "string", description: "Override title for this work order (optional; defaults to the template name)." },
    },
    required: ["template"],
  },
  async run(ctx, rawInput) {
    const input = (rawInput ?? {}) as CreateWoRawInput;
    if (!input.template || typeof input.template !== "string") throw new Error("Which template should the work order come from?");
    const tenantId = ctx.user.activeOrganizationId;
    if (!tenantId) throw new Error("No active winery in context.");

    const templates = await listWorkOrderTemplates(tenantId);
    const needle = norm(input.template);
    const matches = templates.filter((t) => {
      const hay = [norm(t.name), norm(t.code)];
      return hay.some((h) => h !== "" && (h === needle || h.includes(needle) || needle.includes(h)));
    });
    const tpl = resolveExactlyOne(matches, {
      describe: (t) => t.name,
      noneMsg: `No template matches "${input.template}". Check the name, or list templates first.`,
      manyMsg: `Several templates match "${input.template}"`,
    });

    const dueDate = input.dueDate ? String(input.dueDate) : null;
    const dueClause = dueDate ? `, due ${dueDate}` : "";
    const asgClause = input.assigneeEmail ? `, assigned to ${input.assigneeEmail}` : "";
    const preview = `Create and issue a work order from "${tpl.name}"${dueClause}${asgClause}.`;
    const token = signProposal("create_work_order", {
      templateId: tpl.id,
      templateName: tpl.name,
      ...(dueDate ? { dueDate } : {}),
      ...(input.assigneeEmail ? { assigneeEmail: input.assigneeEmail } : {}),
      ...(input.title ? { title: input.title } : {}),
    });
    return { needsConfirmation: true, preview, token };
  },
};

export const commitCreateWorkOrder: Committer = async (_user, args) => {
  const created = await createWorkOrderFromTemplateAction({
    templateId: String(args.templateId),
    title: args.title == null ? undefined : String(args.title),
    assigneeEmail: args.assigneeEmail == null ? null : String(args.assigneeEmail),
    dueAt: args.dueDate ? new Date(String(args.dueDate)) : null,
  });
  await issueWorkOrderAction({ workOrderId: created.workOrderId });
  return {
    message: `Created and issued work order #${created.number} from "${String(args.templateName ?? "template")}".`,
    navigate: { path: `/work-orders/${created.workOrderId}`, label: `View WO #${created.number}` },
  };
};
