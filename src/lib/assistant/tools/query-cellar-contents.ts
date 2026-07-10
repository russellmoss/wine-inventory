import "server-only";
import type { AssistantTool } from "../registry";
import { queryCellarContents, type CellarContentsQuery } from "@/lib/cellar/contents-query";

type Input = CellarContentsQuery & {
  emptyOnly?: boolean;
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
    onlyNonEmpty: emptyOnly ? false : bool(r.onlyNonEmpty),
    onlyPressable: bool(r.onlyPressable),
    limit: num(r.limit),
    emptyOnly,
  };
}

export const queryCellarContentsTool: AssistantTool = {
  name: "query_cellar_contents",
  description:
    "Read current cellar vessel contents. Use for questions like 'what is in tank 5', 'which tanks have Riesling', 'what vessel has Demo Vineyard fruit', 'show pressable must lots', or 'which barrels are empty'. Returns observed current contents only; planned work is not merged into these results.",
  kind: "read",
  inputSchema: {
    type: "object",
    properties: {
      vessel: { type: "string", description: "Optional tank/barrel reference, e.g. 'tank 5', 'T12', or 'barrel 3'." },
      variety: { type: "string", description: "Optional grape variety name to reverse-search current lots." },
      vineyard: { type: "string", description: "Optional vineyard/source name. Uses current lot source-vineyard membership, not block/pick granularity." },
      lot: { type: "string", description: "Optional lot code or display-name text." },
      vintage: { type: "number", description: "Optional vintage year." },
      form: {
        type: "string",
        enum: ["FRUIT", "MUST", "JUICE", "WINE", "BOTTLED_IN_PROCESS", "FINISHED", "BULK", "BOTTLED"],
        description: "Optional current lot form/stage filter. BULK aliases to WINE; BOTTLED aliases to FINISHED.",
      },
      vesselType: { type: "string", enum: ["TANK", "BARREL"], description: "Optional vessel type filter." },
      onlyNonEmpty: { type: "boolean", description: "Defaults true except exact vessel lookups." },
      onlyPressable: { type: "boolean", description: "When true, returns only active MUST positions that can be pressed." },
      emptyOnly: { type: "boolean", description: "When true, returns matching empty vessels as the main result." },
      limit: { type: "number", description: "Maximum vessels to return, capped server-side." },
    },
  },
  async run(_ctx, rawInput) {
    const input = normalize(rawInput);
    const result = await queryCellarContents(input);
    if (!input.emptyOnly) return result;
    return {
      ...result,
      vessels: result.vessels.filter((v) => v.lots.length === 0),
      emptyMatches: result.vessels.filter((v) => v.lots.length === 0).length,
    };
  },
};
