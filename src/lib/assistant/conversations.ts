import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { runInTenantRawTx } from "@/lib/tenant/tx";

const LIST_LIMIT = 50;
const MESSAGES_LIMIT = 200;
const SEARCH_LIMIT = 30;
const MAX_QUERY_LEN = 200;

export type ConversationListItem = {
  id: string;
  title: string;
  updatedAt: Date;
  messageCount: number;
};

export type ConversationDetail = {
  id: string;
  title: string;
  messages: { id: string; role: string; content: string; metadata: Prisma.JsonValue | null; createdAt: Date }[];
};

export type SearchHit = {
  id: string;
  title: string;
  updatedAt: Date;
  snippet: string;
};

/** Return the conversation id iff it exists AND belongs to the user, else null. */
export async function findOwnedConversationId(args: {
  id: string;
  ownerUserId: string;
}): Promise<string | null> {
  const row = await prisma.assistantConversation.findFirst({
    where: { id: args.id, ownerUserId: args.ownerUserId },
    select: { id: true },
  });
  return row?.id ?? null;
}

export async function createConversation(args: {
  ownerUserId: string;
  title: string;
}): Promise<string> {
  const row = await prisma.assistantConversation.create({
    data: { ownerUserId: args.ownerUserId, title: args.title },
    select: { id: true },
  });
  return row.id;
}

export async function appendMessage(args: {
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  metadata?: Prisma.InputJsonValue;
}): Promise<string> {
  const row = await prisma.assistantMessage.create({
    data: {
      conversationId: args.conversationId,
      role: args.role,
      content: args.content,
      ...(args.metadata !== undefined ? { metadata: args.metadata } : {}),
    },
    select: { id: true },
  });
  return row.id;
}

/** Bump updatedAt so the conversation floats to the top of the list. */
export async function touchConversation(id: string): Promise<void> {
  await prisma.assistantConversation.update({
    where: { id },
    data: { updatedAt: new Date() },
    select: { id: true },
  });
}

export async function listConversations(
  ownerUserId: string,
): Promise<ConversationListItem[]> {
  const rows = await prisma.assistantConversation.findMany({
    where: { ownerUserId },
    orderBy: { updatedAt: "desc" },
    take: LIST_LIMIT,
    select: {
      id: true,
      title: true,
      updatedAt: true,
      _count: { select: { messages: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    updatedAt: r.updatedAt,
    messageCount: r._count.messages,
  }));
}

/** Load a conversation's messages, ownership-checked. Null if not found/owned. */
export async function getConversation(args: {
  id: string;
  ownerUserId: string;
}): Promise<ConversationDetail | null> {
  const convo = await prisma.assistantConversation.findFirst({
    where: { id: args.id, ownerUserId: args.ownerUserId },
    select: {
      id: true,
      title: true,
      messages: {
        orderBy: { createdAt: "asc" },
        take: MESSAGES_LIMIT,
        select: { id: true, role: true, content: true, metadata: true, createdAt: true },
      },
    },
  });
  return convo;
}

export async function renameConversation(args: {
  id: string;
  ownerUserId: string;
  title: string;
}): Promise<boolean> {
  const res = await prisma.assistantConversation.updateMany({
    where: { id: args.id, ownerUserId: args.ownerUserId },
    data: { title: args.title },
  });
  return res.count > 0;
}

export async function deleteConversation(args: {
  id: string;
  ownerUserId: string;
}): Promise<boolean> {
  // Messages cascade-delete via the FK (onDelete: Cascade).
  const res = await prisma.assistantConversation.deleteMany({
    where: { id: args.id, ownerUserId: args.ownerUserId },
  });
  return res.count > 0;
}

/**
 * Normalize a raw search box value: collapse whitespace, strip control chars,
 * cap length. Returns "" for empty/whitespace-only input. Pure - unit tested.
 * The actual tsquery parsing is delegated to Postgres' forgiving
 * websearch_to_tsquery, so we don't need to sanitize operator syntax here.
 */
export function sanitizeSearchQuery(raw: string): string {
  if (typeof raw !== "string") return "";
  const stripped = raw.replace(/\p{Cc}/gu, " ");
  return stripped.replace(/\s+/g, " ").trim().slice(0, MAX_QUERY_LEN);
}

/**
 * Full-text search across the user's conversations. Matches message bodies via
 * the generated tsvector (GIN-indexed) and titles via ILIKE, returns distinct
 * conversations ranked by best message match, with a highlighted snippet.
 * Highlights are wrapped in <mark>...</mark> for the UI to style (no raw HTML
 * injection - the UI splits on the markers, it does not set innerHTML).
 */
export async function searchConversations(args: {
  ownerUserId: string;
  query: string;
}): Promise<SearchHit[]> {
  const q = sanitizeSearchQuery(args.query);
  if (!q) return [];
  const likeTerm = `%${q.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;

  // Raw read: the tenant extension does not intercept $queryRaw, so run it inside runInTenantRawTx
  // (sets app.tenant_id for RLS) with an explicit tenantId predicate as a backstop. See plan 029.
  const rows = await runInTenantRawTx((tx, tenantId) =>
    tx.$queryRaw<
      { id: string; title: string; updatedAt: Date; snippet: string | null; rank: number | null }[]
    >(Prisma.sql`
    SELECT
      c."id",
      c."title",
      c."updatedAt" AS "updatedAt",
      sub."snippet" AS "snippet",
      sub."rank" AS "rank"
    FROM "assistant_conversation" c
    LEFT JOIN LATERAL (
      SELECT
        ts_headline(
          'english', m."content",
          websearch_to_tsquery('english', ${q}),
          'StartSel=<mark>,StopSel=</mark>,MaxFragments=1,MaxWords=24,MinWords=8'
        ) AS "snippet",
        ts_rank(m."search_vector", websearch_to_tsquery('english', ${q})) AS "rank"
      FROM "assistant_message" m
      WHERE m."conversationId" = c."id"
        AND m."search_vector" @@ websearch_to_tsquery('english', ${q})
      ORDER BY "rank" DESC
      LIMIT 1
    ) sub ON true
    WHERE c."ownerUserId" = ${args.ownerUserId}
      AND c."tenantId" = ${tenantId}
      AND (sub."rank" IS NOT NULL OR c."title" ILIKE ${likeTerm})
    ORDER BY COALESCE(sub."rank", 0) DESC, c."updatedAt" DESC
    LIMIT ${SEARCH_LIMIT}
  `),
  );

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    updatedAt: r.updatedAt,
    snippet: (r.snippet ?? "").trim(),
  }));
}
