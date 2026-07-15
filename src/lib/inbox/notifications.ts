import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { runAsTenant, requireTenantId } from "@/lib/tenant/context";
import { type EmitNotificationInput, type InboxNotificationDTO, type ListNotificationsOpts } from "@/lib/inbox/types";
import { shouldSuppressSelfNotification, toNotificationDTO } from "@/lib/inbox/payloads";

// Plan 068 Unit 2 — the inbox notification core: emit / list / count-unread / read-state. Every write
// goes through emitNotificationTx (the single choke point) so a future email channel is a drop-in
// (see channels.ts, Unit 9). Reads are owner-scoped by an explicit recipientUserId predicate AND
// per-user RLS (Unit 1b) — defense in depth. The pure payload builders live in ./payloads.
export {
  shouldSuppressSelfNotification,
  buildTicketNotificationPayload,
  buildWorkOrderNotificationPayload,
  toNotificationDTO,
} from "@/lib/inbox/payloads";

const DEFAULT_LIST_LIMIT = 50;

// ── Emit (single choke point — piggybacks on the caller's tx) ────────────────

/**
 * Insert one notification inside the caller-provided tx. Self-notifications are suppressed. Uses
 * createMany (NOT create): create's INSERT…RETURNING is checked against the restrictive per-user
 * SELECT policy and would reject a row destined for another user (Unit 1b). Emit is fire-and-forget
 * (no id returned). tenantId is set explicitly (mirrors the equipment createMany precedent).
 */
export async function emitNotificationTx(tx: Prisma.TransactionClient, input: EmitNotificationInput): Promise<void> {
  if (shouldSuppressSelfNotification(input.recipientUserId, input.actor?.actorUserId)) return;
  const tenantId = requireTenantId();
  await tx.inboxNotification.createMany({
    data: [
      {
        tenantId,
        recipientUserId: input.recipientUserId,
        recipientEmail: input.recipientEmail,
        category: input.category,
        kind: input.kind,
        title: input.title,
        snippet: input.snippet,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        actorUserId: input.actor?.actorUserId ?? null,
        actorEmail: input.actor?.actorEmail ?? null,
      },
    ],
  });
  // Observability (CEO note): one structured line per emit — recipient, kind, source. No PII beyond ids.
  console.info(
    JSON.stringify({
      evt: "inbox.emit",
      tenantId,
      recipientUserId: input.recipientUserId,
      category: input.category,
      kind: input.kind,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
    }),
  );
}

// ── Reads (owner-scoped; wrapped with the acting userId so per-user RLS applies) ──

/** The unread badge count for one user in one tenant. Mirrors countPendingApprovalWorkOrders. */
export async function countUnreadInbox(tenantId: string, userId: string): Promise<number> {
  const start = Date.now();
  const count = await runAsTenant(
    tenantId,
    async () =>
      await prisma.inboxNotification.count({
        where: { recipientUserId: userId, readAt: null, archivedAt: null },
      }),
    { userId },
  );
  const ms = Date.now() - start;
  // Surface a slow badge query before users feel it (CEO observability note).
  if (ms > 200) console.info(JSON.stringify({ evt: "inbox.countUnread.slow", tenantId, userId, ms }));
  return count;
}

/** List a user's notifications, newest first. Category filter + unread-only + cursor pagination. */
export async function listNotifications(
  tenantId: string,
  userId: string,
  opts: ListNotificationsOpts = {},
): Promise<InboxNotificationDTO[]> {
  const limit = Math.min(Math.max(opts.limit ?? DEFAULT_LIST_LIMIT, 1), 100);
  return runAsTenant(
    tenantId,
    async () => {
      const rows = await prisma.inboxNotification.findMany({
        where: {
          recipientUserId: userId,
          archivedAt: null,
          ...(opts.category ? { category: opts.category } : {}),
          ...(opts.unreadOnly ? { readAt: null } : {}),
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: limit,
        ...(opts.cursor ? { skip: 1, cursor: { id: opts.cursor } } : {}),
        select: {
          id: true,
          category: true,
          kind: true,
          title: true,
          snippet: true,
          sourceType: true,
          sourceId: true,
          actorEmail: true,
          readAt: true,
          createdAt: true,
        },
      });
      return rows.map(toNotificationDTO);
    },
    { userId },
  );
}

// ── Read-state toggles (ambient context from the action; RLS scopes to owner) ──

/** Mark specific notifications read. The recipientUserId predicate + per-user RLS ensure a user can
 *  only touch their own rows. Read-toggles are intentionally NOT audited (avoid audit noise). */
export async function markReadCore(userId: string, ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const { count } = await prisma.inboxNotification.updateMany({
    where: { recipientUserId: userId, id: { in: ids } },
    data: { readAt: new Date() },
  });
  return count;
}

export async function markUnreadCore(userId: string, ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const { count } = await prisma.inboxNotification.updateMany({
    where: { recipientUserId: userId, id: { in: ids } },
    data: { readAt: null },
  });
  return count;
}

export async function markAllReadCore(userId: string): Promise<number> {
  const { count } = await prisma.inboxNotification.updateMany({
    where: { recipientUserId: userId, readAt: null, archivedAt: null },
    data: { readAt: new Date() },
  });
  return count;
}

/** Mark every notification whose source is this DM thread as read (council amendment 7 — opening a
 *  thread clears its notifications, since we dropped the participant read-cursor). */
export async function markThreadNotificationsReadCore(userId: string, threadId: string): Promise<number> {
  const { count } = await prisma.inboxNotification.updateMany({
    where: { recipientUserId: userId, sourceType: "dm_thread", sourceId: threadId, readAt: null },
    data: { readAt: new Date() },
  });
  return count;
}
