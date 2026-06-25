import "server-only";
import type { AssistantTool } from "../registry";
import { getEntity, allowedEntityNames } from "../entities";

type DbFindInput = { entity?: string; query?: string };

export const dbFindTool: AssistantTool = {
  name: "db_find",
  description:
    "Find records of a given entity by a natural-language query, to pin down exact targets before editing or deleting. Use this to look up which row(s) match. The set of entities is limited; if the entity is unknown or protected this returns the allowed list.",
  kind: "read",
  inputSchema: {
    type: "object",
    properties: {
      entity: { type: "string", description: "Entity type, e.g. 'VineyardBlock'." },
      query: { type: "string", description: "Search text, e.g. 'Block 2 Bajo' or 'Grenache'." },
    },
    required: ["entity"],
  },
  async run(ctx, rawInput) {
    const input = (rawInput ?? {}) as DbFindInput;
    const entity = getEntity(input.entity ?? "");
    if (!entity) {
      return {
        message: `Unknown or protected entity "${input.entity ?? ""}". Allowed: ${allowedEntityNames().join(", ")}.`,
      };
    }
    const rows = await entity.find(ctx.user, input.query ?? "");
    if (rows.length === 0) {
      return { message: `No ${entity.displayName} matches "${input.query ?? ""}".` };
    }
    return { entity: entity.name, results: rows.map((r) => ({ id: r.id, label: r.label })) };
  },
};
