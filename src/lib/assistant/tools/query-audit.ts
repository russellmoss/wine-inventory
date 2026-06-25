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
    "Search the audit log to answer 'who changed X, and when?'. Call this for questions about who made a change, edit history, or accountability. Filter by a free-text term (matched against the change description), an actor email, and/or an entity type. Admin only.",
  kind: "read",
  adminOnly: true,
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
        description: "Filter by entity type, e.g. 'WineSku', 'BrixLog', 'StockMovement', 'HarvestRecord'.",
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
      return { message: "No matching audit entries." };
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
