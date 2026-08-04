import "server-only";
import type { AssistantTool } from "../registry";
import { getEntity, findableEntityNames } from "../entities";

type DbFindInput = { entity?: string; query?: string };

export const dbFindTool: AssistantTool = {
  name: "db_find",
  description:
    "Find records of a given entity by a natural-language query, to pin down exact targets before editing or deleting. Use this to look up which row(s) match. The set of entities is limited; if the entity is unknown or protected this returns the allowed list.",
  kind: "read",
  inputSchema: {
    type: "object",
    properties: {
      // Plan 107 Unit 4: enumerate rather than describe. A bare string made a wrong entity a
      // recoverable-after-failure round-trip; the enum makes it unreachable. The runtime guard below
      // STAYS — a model can still emit an out-of-enum value, and its error message is the backstop.
      entity: { type: "string", enum: findableEntityNames(), description: "Entity type." },
      query: { type: "string", description: "Search text, e.g. 'Block 2 Bajo' or 'Grenache'." },
    },
    required: ["entity"],
  },
  async run(ctx, rawInput) {
    const input = (rawInput ?? {}) as DbFindInput;
    const entity = getEntity(input.entity ?? "");
    if (!entity) {
      return {
        message: `Unknown or protected entity "${input.entity ?? ""}". Allowed: ${findableEntityNames().join(", ")}.`,
      };
    }
    const rows = await entity.find(ctx.user, input.query ?? "");
    if (rows.length === 0) {
      return { message: `No ${entity.displayName} matches "${input.query ?? ""}".` };
    }
    return { entity: entity.name, results: rows.map((r) => ({ id: r.id, label: r.label })) };
  },
};
