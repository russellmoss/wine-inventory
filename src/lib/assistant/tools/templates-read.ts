import "server-only";
import type { AssistantTool, ToolContext } from "../registry";
import { listTemplatesForBuilder, getTemplateDetail, type TemplateListRow } from "@/lib/work-orders/data";
import { rankMaterials } from "@/lib/inventory/material-search";

// Phase 038: read tools so the assistant can see existing work-order templates before it clones or edits
// one. Both reuse the Phase-1 data helpers (which self-scope via runAsTenant). No writes, no confirm.

function tenantOf(ctx: ToolContext): string {
  const t = ctx.user.activeOrganizationId;
  if (!t) throw new Error("Your account isn't attached to a winery.");
  return t;
}

/** Resolve a template the user named (by id, code, or fuzzy name) to a single builder row. Shared with the
 * write tools. Searches active templates (system + custom). Throws a helpful message on none/ambiguous. */
export async function resolveTemplateRef(tenantId: string, ref: string): Promise<TemplateListRow> {
  const q = (ref ?? "").trim();
  if (!q) throw new Error("Which template? Give its name.");
  const rows = await listTemplatesForBuilder(tenantId, {});
  const exact = rows.find((r) => r.id === q) ?? rows.find((r) => r.code.toLowerCase() === q.toLowerCase());
  if (exact) return exact;
  const ranked = rankMaterials(q, rows, (r) => r.name);
  if (ranked.length === 0) throw new Error(`No template matches "${q}". Ask me to list templates to see the options.`);
  return ranked[0];
}

export const listTemplatesTool: AssistantTool = {
  name: "list_templates",
  description:
    "List the winery's work-order templates (system defaults + the winery's own). Use before cloning or editing a template, or when the user asks what templates exist. Returns each template's name, category, block count, and whether it's a locked system template.",
  kind: "read",
  inputSchema: {
    type: "object",
    properties: {
      includeArchived: { type: "boolean", description: "Include archived templates too (default false)." },
    },
  },
  async run(ctx, rawInput) {
    const input = (rawInput ?? {}) as { includeArchived?: boolean };
    const rows = await listTemplatesForBuilder(tenantOf(ctx), input.includeArchived ? { archived: true } : {});
    return {
      templates: rows.map((r) => ({ id: r.id, name: r.name, category: r.category, blocks: r.blockCount, system: r.isSystem })),
    };
  },
};

export const getTemplateTool: AssistantTool = {
  name: "get_template",
  description:
    "Get one work-order template's full detail: its blocks (tasks) with their defaults, whether it's a locked system template, and its current version. Use to read a template before editing or cloning it. Refer to the template by name.",
  kind: "read",
  inputSchema: {
    type: "object",
    properties: {
      template: { type: "string", description: "The template's name (or code/id), e.g. 'weekly barrel care'." },
    },
    required: ["template"],
  },
  async run(ctx, rawInput) {
    const input = (rawInput ?? {}) as { template?: string };
    const tenantId = tenantOf(ctx);
    const row = await resolveTemplateRef(tenantId, String(input.template ?? ""));
    const detail = await getTemplateDetail(tenantId, row.id);
    if (!detail) throw new Error("That template no longer exists.");
    return {
      id: detail.id,
      name: detail.name,
      description: detail.description,
      category: detail.category,
      system: detail.isSystem,
      currentVersion: detail.currentVersion,
      spec: detail.spec,
    };
  },
};
