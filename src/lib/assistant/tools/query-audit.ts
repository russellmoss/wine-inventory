import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { AssistantTool } from "../registry";

type QueryAuditInput = {
  search?: string;
  actor?: string;
  entityType?: string;
  limit?: number;
};

export const queryAuditTool: AssistantTool = {
  name: "query_audit",
  description:
    "Search the tenant-scoped audit log to answer 'who changed X, and when?'. Call this for questions about who made a change, edit history, or accountability. Filter by a free-text term (matched against the change description), an actor email, and/or an entity type. Inventory/stock changes are logged under entityType 'BottledInventory' or 'FinishedGoodInventory' (action STOCK_MOVEMENT) — NOT 'StockMovement'. When unsure of the entity type, prefer a free-text 'search' (e.g. 'inventory', a wine name) and leave entityType blank; if a filtered query returns nothing, this tool reports the entity types that actually exist so you can retry.",
  kind: "read",
  inputSchema: {
    type: "object",
    properties: {
      search: {
        type: "string",
        description: "Free-text term matched against the change description, e.g. 'Marp Reserve' or 'inventory'.",
      },
      actor: { type: "string", description: "Filter by who made the change (email, partial match)." },
      entityType: {
        type: "string",
        description:
          "Filter by exact entity type. Real values include 'BottledInventory' and 'FinishedGoodInventory' (inventory/stock changes), 'BrixLog', 'HarvestRecord', 'HarvestPick', 'WineSku', 'FinishedGood', 'Vessel', 'VineyardBlock', 'FieldNote', 'User'. There is no 'StockMovement' type — use 'BottledInventory'/'FinishedGoodInventory' for inventory. If unsure, leave blank and use 'search'.",
      },
      limit: { type: "integer", description: "Max rows to return (default 20, max 50)." },
    },
  },
  async run(_ctx, rawInput) {
    const input = (rawInput ?? {}) as QueryAuditInput;
    const and: Prisma.AuditLogWhereInput[] = [];
    if (input.search) and.push({ summary: { contains: input.search, mode: "insensitive" } });
    if (input.actor) and.push({ actorEmail: { contains: input.actor, mode: "insensitive" } });
    if (input.entityType) and.push({ entityType: input.entityType });
    const where: Prisma.AuditLogWhereInput = and.length ? { AND: and } : {};

    const limit = Math.min(Math.max(Number(input.limit) || 20, 1), 50);
    const rows = await prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      select: { createdAt: true, actorEmail: true, action: true, entityType: true, summary: true },
    });
    if (rows.length === 0) {
      // Discovery fallback: tell the model which entity types actually exist so it can
      // retry instead of guessing again. Respect the non-entityType filters when present.
      const facetAnd = and.filter((c) => !("entityType" in c));
      const facetWhere: Prisma.AuditLogWhereInput = facetAnd.length ? { AND: facetAnd } : {};
      const present = await prisma.auditLog.findMany({
        where: facetWhere,
        distinct: ["entityType"],
        select: { entityType: true },
        orderBy: { entityType: "asc" },
      });
      const types = present.map((p) => p.entityType);
      return {
        message:
          types.length === 0
            ? "No audit entries match those filters."
            : "No audit entries match those filters. Entity types present in the audit log: " +
              types.join(", ") +
              ". Inventory/stock changes are 'BottledInventory'/'FinishedGoodInventory'. Retry with a matching entityType, or drop the entityType filter and use a free-text 'search'.",
        availableEntityTypes: types,
      };
    }
    return {
      results: rows.map((r) => ({
        when: r.createdAt.toISOString(),
        who: r.actorEmail,
        action: r.action,
        entityType: r.entityType,
        summary: r.summary,
      })),
    };
  },
};
