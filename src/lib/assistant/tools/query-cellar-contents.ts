import "server-only";
import type { AssistantTool } from "../registry";
import {
  queryCellarContents,
  queryBottledInventory,
  isBottledInventoryForm,
  type CellarContentsQuery,
} from "@/lib/cellar/contents-query";
import { findGroupByNameCore, getGroupRollupsCore, getGroupToppingStatusCore } from "@/lib/vessels/group-core";

type Input = CellarContentsQuery & {
  emptyOnly?: boolean;
  /** Cellarhand v2 Phase 7: narrow to a saved barrel group's members, by name. */
  barrelGroup?: string;
  /** Within a barrel group, return only members that have never been topped or are the oldest. */
  neverToppedOnly?: boolean;
};

function bool(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function num(value: unknown): number | undefined {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isFinite(n) ? n : undefined;
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalize(raw: unknown): Input {
  const r = (raw ?? {}) as Record<string, unknown>;
  const emptyOnly = bool(r.emptyOnly) === true;
  return {
    vessel: str(r.vessel),
    variety: str(r.variety),
    vineyard: str(r.vineyard),
    lot: str(r.lot),
    vintage: num(r.vintage),
    form: str(r.form),
    vesselType: str(r.vesselType) as Input["vesselType"],
    location: str(r.location),
    onlyNonEmpty: emptyOnly ? false : bool(r.onlyNonEmpty),
    onlyPressable: bool(r.onlyPressable),
    limit: num(r.limit),
    emptyOnly,
    barrelGroup: str(r.barrelGroup),
    neverToppedOnly: bool(r.neverToppedOnly) === true,
  };
}

export const queryCellarContentsTool: AssistantTool = {
  name: "query_cellar_contents",
  description:
    "Read current cellar vessel contents AND on-hand packaged inventory. Use for questions like 'what is in tank 5', 'which tanks have Riesling', 'what vessel has Demo Vineyard fruit', 'show pressable must lots', or 'which barrels are empty'. Pass `barrelGroup` to answer questions about a SAVED BARREL GROUP — 'what's in rack 14', 'what's due on rack 14', 'which barrels in the new French oak haven't been topped' — and the result gains the group's rollups plus a per-barrel last-topped date. NOTE: the word 'group' here always means a BARREL GROUP (a named set of vessels); it never means a work-order task group. Every vessel comes back with a `composition` — what the wine is MADE OF (`summary` like '91% Syrah · 9% Cabernet Sauvignon', `isBlend`, and `parts` per variety/vineyard/vintage). USE `composition` to answer what a tank is made of, whether it is a blend, or which vessels contain a given variety — NOT `lots[].varietyName`, which is only the surviving lot's ORIGIN and will report a blended tank as a single variety. Also answers packaged/finished-goods on-hand questions — 'how many cases of Big Mike Big Red are in the tasting room', 'how much bottled Estate Cab do we have', 'what's on hand at the warehouse' — pass form 'BOTTLED' (or 'FINISHED'), the item name via lot/variety text, and/or a location. Returns observed current contents only; planned work is not merged into these results.",
  kind: "read",
  inputSchema: {
    type: "object",
    properties: {
      vessel: { type: "string", description: "Optional tank/barrel reference, e.g. 'tank 5', 'T12', or 'barrel 3'." },
      variety: { type: "string", description: "Optional grape variety name to reverse-search current lots." },
      vineyard: { type: "string", description: "Optional vineyard/source name. Uses current lot source-vineyard membership, not block/pick granularity." },
      lot: { type: "string", description: "Optional lot code or display-name text. For BOTTLED/FINISHED queries, pass the bottled-wine or finished-good name here (e.g. 'Big Mike Big Red')." },
      vintage: { type: "number", description: "Optional vintage year." },
      form: {
        type: "string",
        enum: ["FRUIT", "MUST", "JUICE", "WINE", "BOTTLED_IN_PROCESS", "FINISHED", "BULK", "BOTTLED"],
        description: "Optional current lot form/stage filter. BULK aliases to WINE. Pass BOTTLED or FINISHED to read on-hand packaged inventory (cases/bottles at a location) instead of vessel contents.",
      },
      vesselType: { type: "string", enum: ["TANK", "BARREL"], description: "Optional vessel type filter." },
      location: { type: "string", description: "Optional storage location name (e.g. 'tasting room', 'warehouse'). Used to filter on-hand packaged inventory for BOTTLED/FINISHED queries." },
      onlyNonEmpty: { type: "boolean", description: "Defaults true except exact vessel lookups." },
      onlyPressable: { type: "boolean", description: "When true, returns only active MUST positions that can be pressed." },
      emptyOnly: { type: "boolean", description: "When true, returns matching empty vessels as the main result." },
      barrelGroup: { type: "string", description: "Optional saved BARREL GROUP name (e.g. 'rack 14', 'new French oak'). Narrows the result to that group's member vessels and adds group rollups + per-barrel last-topped dates." },
      neverToppedOnly: { type: "boolean", description: "With barrelGroup: return only members that have NEVER been topped. Use for 'which barrels haven't been topped'." },
      limit: { type: "number", description: "Maximum vessels to return, capped server-side." },
    },
  },
  async run(_ctx, rawInput) {
    const input = normalize(rawInput);

    // Packaged / finished-goods on-hand inventory lives in the inventory tables
    // (cases/bottles at a location), not in a vessel. Route BOTTLED/FINISHED
    // form queries — and bare location lookups — there.
    if (isBottledInventoryForm(input.form) || (input.location && !input.vessel && !input.form)) {
      const result = await queryBottledInventory({
        item: input.lot ?? input.variety,
        vintage: input.vintage,
        location: input.location,
        limit: input.limit,
      });
      return { scope: "packaged-inventory", ...result };
    }

    // Barrel-group lens. Deliberately NOT a new tool: the registry already holds 96 against a ~40-tool
    // selection cliff, and RFC-000 §3 names naive decomposition as the thing to reject at review. A
    // group is a way of NARROWING a cellar-contents question, so it is a parameter.
    if (input.barrelGroup) {
      const group = await findGroupByNameCore(input.barrelGroup);
      if (!group) {
        return {
          scope: "barrel-group",
          found: false,
          message: `No single barrel group matches "${input.barrelGroup}". Name it exactly, or ask which barrel groups exist.`,
        };
      }
      const [rollups, topping] = await Promise.all([
        getGroupRollupsCore(group.id),
        getGroupToppingStatusCore(group.id),
      ]);
      const memberIds = new Set(group.members.map((m) => m.vesselId));
      const contents = await queryCellarContents({ ...input, vessel: undefined, onlyNonEmpty: false });
      const inGroup = contents.vessels.filter((v) => memberIds.has(v.vesselId));
      const toppingByVessel = new Map(topping.map((t) => [t.vesselId, t]));
      const members = (input.neverToppedOnly ? topping.filter((t) => t.lastToppedAt === null) : topping).map((t) => ({
        ...t,
        contents: inGroup.find((v) => v.vesselId === t.vesselId) ?? null,
      }));
      return {
        scope: "barrel-group",
        found: true,
        group: {
          id: group.id,
          name: group.name,
          type: group.type,
          status: group.status,
          location: [group.locationName, group.rackLabel].filter(Boolean).join(" · ") || null,
        },
        // Every rollup is COMPUTED, never stored. `volumeL` is a sum of DERIVED barrel volumes, so
        // say so here too — the assistant must not report it as a measurement.
        rollups: { ...rollups, volumeLBasis: "estimated — sum of derived barrel volumes" },
        neverToppedCount: topping.filter((t) => t.lastToppedAt === null).length,
        memberCount: group.members.length,
        members,
        note:
          rollups.distinctLotCount >= 2
            ? `This barrel group holds ${rollups.distinctLotCount} wines (${rollups.lotCodes.join(", ")}). That is legal — work orders fan out per wine.`
            : undefined,
      };
    }

    const result = await queryCellarContents(input);
    if (!input.emptyOnly) return result;
    return {
      ...result,
      vessels: result.vessels.filter((v) => v.lots.length === 0),
      emptyMatches: result.vessels.filter((v) => v.lots.length === 0).length,
    };
  },
};
