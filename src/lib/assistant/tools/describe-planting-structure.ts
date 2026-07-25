import type { AssistantTool } from "../registry";
import { resolveVineyards } from "../scope";
import { describePlantingStructureCore } from "@/lib/plantingArea/planting-area-core";

/**
 * Read-only assistant tool for Vineyard Intelligence P1: planting-area / block structure Q&A.
 *
 * This is the assistant edge that makes the planting-area cores reachable in verify:ai-native's import
 * graph. Domain-composite (one tool answers structure questions), not one tool per micro-core (runbook §2.5).
 */
export const describePlantingStructureTool: AssistantTool = {
  name: "describe_planting_structure",
  description:
    "Read a vineyard's PLANTING-AREA and block structure. Use for questions like 'what planting areas does " +
    "Russian River Ranch have', 'which blocks are in the North Planting', 'are any blocks unassigned', 'is any " +
    "block outside its planting area', or 'has this vineyard been migrated to planting areas yet'. Returns each " +
    "planting area with its block count, review status, source (drawn/imported/derived), geometry version, and " +
    "any open topology findings (overlaps, gaps, blocks outside their parent), plus the list of blocks not yet " +
    "assigned to any planting area. Read-only — it never draws, splits, or migrates anything.",
  kind: "read",
  inputSchema: {
    type: "object",
    properties: {
      vineyard: {
        type: "string",
        description: "Vineyard name (or part of it), e.g. 'Russian River Ranch'. Omit to list the caller's vineyards to choose from.",
      },
    },
  },
  async run(ctx, rawInput) {
    const input = (rawInput ?? {}) as { vineyard?: string };
    const name = typeof input.vineyard === "string" ? input.vineyard.trim() : undefined;
    const matches = await resolveVineyards(ctx.user, name || undefined);

    if (matches.length === 0) {
      return { error: name ? `No vineyard matching "${name}".` : "No vineyards available." };
    }
    if (matches.length > 1) {
      return {
        needsChoice: true,
        message: "More than one vineyard matched — which one?",
        choices: matches.map((v) => ({ id: v.id, name: v.name })),
      };
    }
    const structure = await describePlantingStructureCore(matches[0].id);
    return { vineyard: matches[0].name, ...structure };
  },
};
