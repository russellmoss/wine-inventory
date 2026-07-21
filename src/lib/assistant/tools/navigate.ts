import "server-only";
import type { AssistantTool, ToolContext } from "../registry";
import { prisma } from "@/lib/prisma";
import { entityPath, sectionPath, SECTION_ROUTES, type RoutableEntity } from "../routes";
import { resolveVesselContents, resolveVineyards } from "../scope";
import { resolveTemplateRef } from "./templates-read";

// The navigate tool: the assistant asks to send the user to a place in the app;
// the SERVER resolves + validates the target (tenant-scoped) and returns either a
// navigate payload (run.ts turns it into a `navigate` stream event) or a structured
// {ok:false, reason} the model uses to answer in chat with links.
//
// SECURITY: a specific record's path is ALWAYS built from a server-resolved id
// (verified to exist for this tenant), never from a model-supplied free-text id.
// AUTO vs LINK is decided here from the user's actual last message, not the model.

type NavigateInput = {
  kind?: "section" | "entity" | "vessel";
  section?: string;
  entity?: RoutableEntity;
  id?: string;
  name?: string;
  vessel?: string;
};

// Explicit navigation verbs → auto-navigate. Anything else → render a link.
// Deliberately excludes bare "show me" (ambiguous: often just wants the info).
const EXPLICIT_NAV = /\b(take me|bring me|go to|open|navigate|jump to|pull up|send me)\b/i;

function isExplicit(ctx: ToolContext): boolean {
  return EXPLICIT_NAV.test(ctx.lastUserMessage ?? "");
}

function tenantOf(ctx: ToolContext): string {
  const t = ctx.user.activeOrganizationId;
  if (!t) throw new Error("Your account isn't attached to a winery.");
  return t;
}

export const navigateTool: AssistantTool = {
  name: "navigate",
  description:
    "Take the user to a page in the app, or produce a working in-app link. Call this ONLY when the user asks to be shown/taken somewhere, or when you want to offer a link to a specific record. For a specific record (lot, work order, template, vineyard) pass its id (get it first from db_find / list_templates / a read tool) — never guess an id. For a tank/barrel pass its reference in `vessel` (e.g. 'tank 11'). For a general area pass `section`. The app decides whether to jump there or just show a link based on how the user asked.",
  kind: "read",
  inputSchema: {
    type: "object",
    properties: {
      kind: { type: "string", enum: ["section", "entity", "vessel"], description: "What kind of target." },
      section: { type: "string", description: "For kind=section: the area, e.g. 'work orders', 'inventory', 'reports'." },
      entity: { type: "string", enum: ["lot", "workOrder", "template", "vineyard"], description: "For kind=entity: the record type." },
      id: { type: "string", description: "For kind=entity: the record's id from a prior read tool (preferred)." },
      name: { type: "string", description: "For kind=entity template/vineyard only: a name to resolve when you don't have the id." },
      vessel: { type: "string", description: "For kind=vessel: the tank/barrel reference, e.g. 'tank 11' or 'barrel 3'." },
    },
    required: ["kind"],
  },
  async run(ctx, rawInput) {
    const input = (rawInput ?? {}) as NavigateInput;
    const auto = isExplicit(ctx);

    // --- Section ---
    if (input.kind === "section") {
      const path = sectionPath(input.section ?? "");
      if (!path) {
        return {
          ok: false,
          reason: "unknown_section",
          message: `I don't have a page called "${input.section ?? ""}".`,
          allowed: Object.keys(SECTION_ROUTES),
        };
      }
      return { navigate: { path, label: input.section!.trim(), auto } };
    }

    // --- Vessel (tank/barrel) → its current contents ---
    if (input.kind === "vessel") {
      const contents = await resolveVesselContents(String(input.vessel ?? ""));
      if (contents.kind === "empty") {
        return {
          ok: false,
          reason: "empty_vessel",
          message: `${contents.vesselLabel} is empty right now.`,
          section: { label: "the tanks list", route: SECTION_ROUTES["tanks & barrels"] },
        };
      }
      // The vessel's wine is navigable (its /lots/[id] detail is the ledger history). There is no
      // "which of these lots did you mean" branch — a vessel holds one wine (LEDGER-12).
      return {
        navigate: {
          path: entityPath("lot", contents.lot.id),
          label: `${contents.lot.code} (in ${contents.vesselLabel})`,
          auto,
        },
      };
    }

    // --- Entity by id/name ---
    if (input.kind === "entity") {
      const { entity } = input;
      if (entity === "lot") {
        if (!input.id) return { ok: false, reason: "need_lookup", message: "Find the lot with db_find first, then navigate by its id." };
        const lot = await prisma.lot.findFirst({ where: { id: input.id }, select: { id: true, code: true } });
        if (!lot) return { ok: false, reason: "not_found", message: "That lot doesn't exist (or isn't visible to you)." };
        return { navigate: { path: entityPath("lot", lot.id), label: `Lot ${lot.code}`, auto } };
      }
      if (entity === "workOrder") {
        if (!input.id) return { ok: false, reason: "need_lookup", message: "Find the work order with db_find first, then navigate by its id." };
        const wo = await prisma.workOrder.findFirst({ where: { id: input.id }, select: { id: true, number: true, title: true } });
        if (!wo) return { ok: false, reason: "not_found", message: "That work order doesn't exist (or isn't visible to you)." };
        return { navigate: { path: entityPath("workOrder", wo.id), label: `WO #${wo.number} — ${wo.title}`, auto } };
      }
      if (entity === "template") {
        const ref = input.id ?? input.name;
        if (!ref) return { ok: false, reason: "need_lookup", message: "Which template? Give its id or name (or list_templates first)." };
        // resolveTemplateRef is tenant-scoped and throws a helpful message on none/ambiguous.
        const row = await resolveTemplateRef(tenantOf(ctx), String(ref));
        return { navigate: { path: entityPath("template", row.id), label: row.name, auto } };
      }
      if (entity === "vineyard") {
        const rows = await resolveVineyards(ctx.user, input.name);
        // If an id was given, keep only that one (and only if it's in the user's scope).
        const match = input.id ? rows.find((v) => v.id === input.id) : rows.length === 1 ? rows[0] : undefined;
        if (!match) {
          if (rows.length === 0) return { ok: false, reason: "not_found", message: "No vineyard matches, or it's outside your access." };
          return { ok: false, reason: "ambiguous", message: "Which vineyard?", options: rows.map((v) => v.name) };
        }
        return { navigate: { path: entityPath("vineyard", match.id), label: match.name, auto } };
      }
      return { ok: false, reason: "unknown_entity", message: "I can't link to that kind of record yet." };
    }

    return { ok: false, reason: "bad_input", message: "Tell me a section, a record, or a tank to open." };
  },
};
