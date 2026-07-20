import "server-only";
import type { AssistantTool, ToolContext } from "../registry";
import type { Committer } from "../commit";
import { signProposal } from "../confirm";
import { entityPath } from "../routes";
import { resolveTemplateRef } from "./templates-read";
import { resolveSpecMaterials, previewSpec } from "../template-context";
import { validateTemplateSpec, type TemplateSpec } from "@/lib/work-orders/template-vocabulary";
import { resolveTaskVocabulary } from "@/lib/work-orders/vocabulary-resolver";
import { listMaterials } from "@/lib/cellar/materials";
import { runAsTenant } from "@/lib/tenant/context";
import {
  createTemplateAction,
  updateTemplateSpecAction,
  cloneTemplateAction,
  archiveTemplateAction,
} from "@/lib/work-orders/actions";
import { unwrap } from "@/lib/action-result";

// Phase 038: assistant WRITE tools for work-order template authoring. All admin-only (parity with the
// template server actions) and all draft→confirm (D10): run() resolves + validates + previews and returns
// a signed proposal; the committer calls the existing admin-gated action (auth + tenant + audit + versioning).
// Material names in a spec resolve to real ids scoped per task (WORKORDER-3); unresolved/invalid → refused.

function tenantOf(ctx: ToolContext): string {
  const t = ctx.user.activeOrganizationId;
  if (!t) throw new Error("Your account isn't attached to a winery.");
  return t;
}

const SPEC_SCHEMA = {
  type: "object",
  description:
    "The template's blocks. Use list/get_template + the block reference in this tool's guidance. For a dose block (ADDITION/FINING/CLEAN/SANITIZE/GAS) put the material's PLAIN NAME under defaults.material — never a made-up id; I resolve it to the winery's catalog and refuse anything that isn't stocked or is out of scope.",
  properties: {
    tasks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          taskType: { type: "string", description: "A block type, e.g. RACK, ADDITION, FINING, TOPPING, FILTRATION, CRUSH, PRESS, BRIX, PANEL, TEMP_SETPOINT, CLEAN, SANITIZE, STEAM, GAS, NOTE." },
          title: { type: "string", description: "The block's label / checklist line." },
          instructions: { type: "string", description: "Optional instructions for the crew." },
          defaults: { type: "object", description: "Optional default field values for this block (subset of the block's fields). Material goes under `material` as a plain name." },
        },
        required: ["taskType", "title"],
      },
    },
  },
  required: ["tasks"],
} as const;

/** Coerce the model's spec input into a TemplateSpec shape (structure only; content validated downstream).
 * Rejects a null/non-object task element or a non-string taskType/title up front — otherwise the downstream
 * resolver/validator would throw an unhandled TypeError instead of this friendly refusal. */
function asSpec(raw: unknown): TemplateSpec {
  const spec = raw as { tasks?: unknown };
  if (!spec || !Array.isArray(spec.tasks) || spec.tasks.length === 0) {
    throw new Error("A template needs at least one block. Describe the steps.");
  }
  for (const t of spec.tasks) {
    const rec = t as { taskType?: unknown; title?: unknown } | null;
    if (!rec || typeof rec !== "object" || typeof rec.taskType !== "string" || typeof rec.title !== "string") {
      throw new Error("Each block needs a type and a title — describe the steps in plain language.");
    }
  }
  return spec as TemplateSpec;
}

/** Resolve materials + validate a spec, or throw a plain-language error the model relays to the user. */
async function prepareSpec(tenantId: string, raw: unknown): Promise<{ spec: TemplateSpec; preview: string }> {
  const parsed = asSpec(raw);
  const materials = await runAsTenant(tenantId, () => listMaterials());
  const { spec, unresolved } = resolveSpecMaterials(parsed, materials);
  if (unresolved.length > 0) {
    const list = unresolved.map((u) => `"${u.ref}" (block ${u.taskIndex + 1}, ${u.taskType})`).join(", ");
    throw new Error(`I couldn't match these materials in your catalog (or they can't be dosed in that block): ${list}. Add them under Consumables first, or use one that's stocked.`);
  }
  const v = validateTemplateSpec(spec, await runAsTenant(tenantId, () => resolveTaskVocabulary()));
  if (!v.ok) throw new Error(`That template isn't valid: ${v.errors.join(" ")}`);
  return { spec, preview: previewSpec(spec, materials) };
}

export const createTemplateTool: AssistantTool = {
  name: "create_template",
  description:
    "Create a NEW work-order template from a set of blocks. Use when the user wants a new reusable template/SOP. Blocks are typed; put a material's plain name under defaults.material for dose blocks. This does NOT save immediately — it returns a preview to confirm.",
  kind: "write",
  adminOnly: true,
  inputSchema: {
    type: "object",
    properties: {
      name: { type: "string", description: "The template's name, e.g. 'Weekly barrel care'." },
      description: { type: "string", description: "Optional short description." },
      category: { type: "string", description: "Optional category label." },
      spec: SPEC_SCHEMA,
    },
    required: ["name", "spec"],
  },
  async run(ctx, rawInput) {
    const input = (rawInput ?? {}) as { name?: string; description?: string; category?: string; spec?: unknown };
    const name = String(input.name ?? "").trim();
    if (!name) throw new Error("What should the template be called?");
    const { spec, preview } = await prepareSpec(tenantOf(ctx), input.spec);
    const token = signProposal("create_template", {
      name,
      ...(input.description ? { description: String(input.description) } : {}),
      ...(input.category ? { category: String(input.category) } : {}),
      spec: spec as unknown as Record<string, unknown>,
    });
    return { needsConfirmation: true, preview: `Create template "${name}": ${preview}.`, token };
  },
};

export const commitCreateTemplate: Committer = async (_user, args) => {
  const res = unwrap(await createTemplateAction({
    name: String(args.name),
    description: args.description == null ? undefined : String(args.description),
    category: args.category == null ? undefined : String(args.category),
    spec: args.spec as unknown as TemplateSpec,
  }));
  const name = String(args.name);
  return {
    message: `Created template "${name}" (version ${res.version}).`,
    navigate: { path: entityPath("template", res.templateId), label: name },
  };
};

export const updateTemplateSpecTool: AssistantTool = {
  name: "update_template_spec",
  description:
    "Replace a template's blocks with a new version (edits create a new immutable version). Use to change what's in an existing custom template. Provide the FULL new block list, not just a delta. System templates can't be edited — clone one first. Returns a preview to confirm.",
  kind: "write",
  adminOnly: true,
  inputSchema: {
    type: "object",
    properties: {
      template: { type: "string", description: "The template to edit, by name." },
      spec: SPEC_SCHEMA,
    },
    required: ["template", "spec"],
  },
  async run(ctx, rawInput) {
    const input = (rawInput ?? {}) as { template?: string; spec?: unknown };
    const tenantId = tenantOf(ctx);
    const row = await resolveTemplateRef(tenantId, String(input.template ?? ""));
    if (row.isSystem) throw new Error(`"${row.name}" is a locked system template — clone it first, then edit the copy.`);
    const { spec, preview } = await prepareSpec(tenantId, input.spec);
    const token = signProposal("update_template_spec", { templateId: row.id, name: row.name, spec: spec as unknown as Record<string, unknown> });
    // Coarse edit = full replace. Make the block-count change unmissable in the confirm card so a user can't
    // rubber-stamp away blocks the model dropped from the new list.
    return { needsConfirmation: true, preview: `Replace all ${row.blockCount} block(s) in "${row.name}" with these ${spec.tasks.length}: ${preview}.`, token };
  },
};

export const commitUpdateTemplateSpec: Committer = async (_user, args) => {
  const res = unwrap(await updateTemplateSpecAction({ templateId: String(args.templateId), spec: args.spec as unknown as TemplateSpec }));
  return { message: `Updated "${String(args.name)}" to version ${res.version}.` };
};

export const cloneTemplateTool: AssistantTool = {
  name: "clone_template",
  description:
    "Clone a template (system or custom) into a new editable copy for this winery. Use before customizing a locked system template. Returns a preview to confirm.",
  kind: "write",
  adminOnly: true,
  inputSchema: {
    type: "object",
    properties: {
      template: { type: "string", description: "The template to clone, by name." },
      name: { type: "string", description: "Optional name for the new copy (defaults to '<source> (copy)')." },
    },
    required: ["template"],
  },
  async run(ctx, rawInput) {
    const input = (rawInput ?? {}) as { template?: string; name?: string };
    const row = await resolveTemplateRef(tenantOf(ctx), String(input.template ?? ""));
    const newName = String(input.name ?? "").trim();
    const token = signProposal("clone_template", { templateId: row.id, sourceName: row.name, ...(newName ? { name: newName } : {}) });
    return { needsConfirmation: true, preview: `Clone "${row.name}"${newName ? ` as "${newName}"` : ""} into an editable copy.`, token };
  },
};

export const commitCloneTemplate: Committer = async (_user, args) => {
  const res = unwrap(await cloneTemplateAction({ templateId: String(args.templateId), name: args.name == null ? undefined : String(args.name) }));
  const label = args.name == null ? `${String(args.sourceName)} (copy)` : String(args.name);
  return {
    message: `Cloned "${String(args.sourceName)}" into an editable copy.`,
    navigate: { path: entityPath("template", res.templateId), label },
  };
};

export const archiveTemplateTool: AssistantTool = {
  name: "archive_template",
  description:
    "Archive a custom template so it drops out of the pickers and list. System templates can't be archived. Returns a preview to confirm.",
  kind: "write",
  adminOnly: true,
  inputSchema: {
    type: "object",
    properties: {
      template: { type: "string", description: "The template to archive, by name." },
    },
    required: ["template"],
  },
  async run(ctx, rawInput) {
    const input = (rawInput ?? {}) as { template?: string };
    const row = await resolveTemplateRef(tenantOf(ctx), String(input.template ?? ""));
    if (row.isSystem) throw new Error(`"${row.name}" is a system template — it ships with the app and can't be archived.`);
    const token = signProposal("archive_template", { templateId: row.id, name: row.name });
    return { needsConfirmation: true, preview: `Archive template "${row.name}".`, token };
  },
};

export const commitArchiveTemplate: Committer = async (_user, args) => {
  unwrap(await archiveTemplateAction({ templateId: String(args.templateId) }));
  return { message: `Archived "${String(args.name)}".` };
};
