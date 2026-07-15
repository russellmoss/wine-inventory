import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { runInTenantTx } from "@/lib/tenant/tx";
import { runAsTenant, requireTenantId } from "@/lib/tenant/context";
import { ActionError } from "@/lib/action-error";
import { writeAudit } from "@/lib/audit";
import type { LedgerActor } from "@/lib/vessels/rack-core";
import { emitNotificationTx } from "@/lib/inbox/notifications";
import {
  type DirectMessageThreadDetail,
  type DirectMessageThreadSummary,
  type RecipientOption,
  toSnippet,
} from "@/lib/inbox/types";

// Plan 068 Unit 3 — same-tenant 1:1 direct messages. Threads store the two participants directly
// (sorted pair userAId < userBId → idempotent resolve, enforced by a DB CHECK). Sending notifies the
// OTHER user via emitNotificationTx (the single choke point). Attachments are a follow-on upload keyed
// by the returned messageId (mirrors the feedback ticket→attachment flow) so the client never handles
// a blobUrl (council amendment 1). Reads are DB-enforced owner-only by per-user RLS (Unit 1b).

export const DM_RATE_PER_MINUTE = 20;
export const DM_RATE_PER_DAY = 500;
export const DM_BODY_MAX = 4000;

type Party = { id: string; email: string };

/** Order a user pair so userA.id < userB.id (the idempotency key + the DB sorted-pair CHECK). Pure. */
export function orderedPair(
  a: Party,
  b: Party,
): { userAId: string; userAEmail: string; userBId: string; userBEmail: string } {
  const [x, y] = a.id < b.id ? [a, b] : [b, a];
  return { userAId: x.id, userAEmail: x.email, userBId: y.id, userBEmail: y.email };
}

/** Find the existing 1:1 thread for the pair, else create it. Idempotent (sorted pair). In-tx. */
async function resolveOrCreateThreadTx(
  tx: Prisma.TransactionClient,
  tenantId: string,
  me: Party,
  other: Party,
): Promise<string> {
  const pair = orderedPair(me, other);
  const existing = await tx.directMessageThread.findFirst({
    where: { userAId: pair.userAId, userBId: pair.userBId },
    select: { id: true },
  });
  if (existing) return existing.id;
  // The creator is a participant, so the create's RETURNING passes the per-user thread policy.
  const created = await tx.directMessageThread.create({
    data: { tenantId, createdByUserId: me.id, ...pair, lastMessageAt: new Date() },
    select: { id: true },
  });
  return created.id;
}

/**
 * Send a DM to a same-tenant user. Validates recipient org membership (amendment 4), enforces a
 * lightweight per-user rate cap (T3), resolves/creates the thread, inserts the message, bumps
 * lastMessageAt, and notifies the recipient. Returns the thread + message ids so the caller can
 * upload attachments against the message. Atomic (one tx).
 */
export async function sendDirectMessageCore(
  actor: LedgerActor,
  input: { recipientUserId: string; body: string },
): Promise<{ threadId: string; messageId: string }> {
  const meId = actor.actorUserId;
  if (!meId) throw new ActionError("You must be signed in to send a message.");
  if (input.recipientUserId === meId) throw new ActionError("You can't message yourself.");
  const body = input.body?.trim();
  if (!body) throw new ActionError("Enter a message.");
  if (body.length > DM_BODY_MAX) throw new ActionError(`Message is too long (max ${DM_BODY_MAX} characters).`);

  return runInTenantTx(async (tx) => {
    const tenantId = requireTenantId();

    // Rate cap (no new infra — DB counts; upstash/redis is the proper follow-up, see ADR 0005).
    const now = Date.now();
    const [perMin, perDay] = await Promise.all([
      tx.directMessage.count({ where: { senderUserId: meId, createdAt: { gte: new Date(now - 60_000) } } }),
      tx.directMessage.count({ where: { senderUserId: meId, createdAt: { gte: new Date(now - 86_400_000) } } }),
    ]);
    if (perMin >= DM_RATE_PER_MINUTE || perDay >= DM_RATE_PER_DAY) {
      throw new ActionError("You're sending messages too quickly. Try again shortly.");
    }

    // Recipient MUST be a member of this tenant (RLS enforces tenant, not org membership). Member/User
    // are GLOBAL — scope by organizationId at the app layer (the users/scope.ts precedent).
    const member = await tx.member.findFirst({
      where: { organizationId: tenantId, userId: input.recipientUserId },
      select: { user: { select: { email: true } } },
    });
    if (!member?.user) throw new ActionError("That person isn't in your winery.", "FORBIDDEN");
    const recipientEmail = member.user.email;

    const threadId = await resolveOrCreateThreadTx(
      tx,
      tenantId,
      { id: meId, email: actor.actorEmail },
      { id: input.recipientUserId, email: recipientEmail },
    );

    const msg = await tx.directMessage.create({
      data: { tenantId, threadId, senderUserId: meId, senderEmail: actor.actorEmail, body },
      select: { id: true },
    });
    await tx.directMessageThread.update({ where: { id: threadId }, data: { lastMessageAt: new Date() } });

    await emitNotificationTx(tx, {
      recipientUserId: input.recipientUserId,
      recipientEmail,
      category: "DIRECT_MESSAGE",
      kind: "DIRECT_MESSAGE",
      title: `New message from ${actor.actorEmail}`,
      snippet: toSnippet(body),
      sourceType: "dm_thread",
      sourceId: threadId,
      actor: { actorUserId: meId, actorEmail: actor.actorEmail },
    });

    await writeAudit(tx, {
      actorUserId: meId,
      actorEmail: actor.actorEmail,
      action: "CREATE",
      entityType: "DirectMessage",
      entityId: msg.id,
      summary: "Sent a direct message",
    });

    return { threadId, messageId: msg.id };
  });
}

/** People in my winery I can message (excludes me). Member/User are GLOBAL → scope by org at app layer. */
export async function listTenantRecipients(tenantId: string, meUserId: string): Promise<RecipientOption[]> {
  const members = await prisma.member.findMany({
    where: { organizationId: tenantId, userId: { not: meUserId } },
    select: { userId: true, user: { select: { email: true, name: true } } },
    orderBy: { user: { email: "asc" } },
  });
  return members
    .filter((m) => m.user)
    .map((m) => ({ userId: m.userId, email: m.user!.email, name: m.user!.name ?? null }));
}

/** My DM threads, newest first, with the other participant + a last-message preview. */
export async function listThreads(tenantId: string, userId: string): Promise<DirectMessageThreadSummary[]> {
  return runAsTenant(
    tenantId,
    async () => {
      const threads = await prisma.directMessageThread.findMany({
        orderBy: { lastMessageAt: "desc" },
        select: {
          id: true,
          userAId: true,
          userAEmail: true,
          userBId: true,
          userBEmail: true,
          subject: true,
          lastMessageAt: true,
        },
      });
      if (threads.length === 0) return [];
      // Latest message per thread (Prisma distinct on threadId, newest first).
      const latest = await prisma.directMessage.findMany({
        where: { threadId: { in: threads.map((t) => t.id) } },
        orderBy: [{ threadId: "asc" }, { createdAt: "desc" }],
        distinct: ["threadId"],
        select: { threadId: true, body: true },
      });
      const previewByThread = new Map(latest.map((m) => [m.threadId, m.body]));
      return threads.map((t) => {
        const other = t.userAId === userId ? { id: t.userBId, email: t.userBEmail } : { id: t.userAId, email: t.userAEmail };
        return {
          threadId: t.id,
          otherUserId: other.id,
          otherEmail: other.email,
          subject: t.subject,
          lastMessageAt: t.lastMessageAt.toISOString(),
          preview: previewByThread.get(t.id) ? toSnippet(previewByThread.get(t.id)) : null,
        };
      });
    },
    { userId },
  );
}

/** A thread's messages (oldest→newest) with attachments. Returns null if the thread isn't mine (RLS). */
export async function getThread(
  tenantId: string,
  userId: string,
  threadId: string,
): Promise<DirectMessageThreadDetail | null> {
  return runAsTenant(
    tenantId,
    async () => {
      const thread = await prisma.directMessageThread.findFirst({
        where: { id: threadId },
        select: { id: true, userAId: true, userAEmail: true, userBId: true, userBEmail: true, subject: true },
      });
      if (!thread) return null; // per-user RLS already guarantees I'm a participant
      const messages = await prisma.directMessage.findMany({
        where: { threadId },
        orderBy: { createdAt: "asc" },
        select: { id: true, senderUserId: true, senderEmail: true, body: true, createdAt: true },
      });
      const attachments = messages.length
        ? await prisma.directMessageAttachment.findMany({
            where: { messageId: { in: messages.map((m) => m.id) } },
            select: { id: true, messageId: true, filename: true, contentType: true, byteSize: true, width: true, height: true },
          })
        : [];
      const byMessage = new Map<string, typeof attachments>();
      for (const a of attachments) {
        const list = byMessage.get(a.messageId) ?? [];
        list.push(a);
        byMessage.set(a.messageId, list);
      }
      const other = thread.userAId === userId ? { id: thread.userBId, email: thread.userBEmail } : { id: thread.userAId, email: thread.userAEmail };
      return {
        threadId: thread.id,
        otherUserId: other.id,
        otherEmail: other.email,
        subject: thread.subject,
        messages: messages.map((m) => ({
          id: m.id,
          senderUserId: m.senderUserId,
          senderEmail: m.senderEmail,
          body: m.body,
          createdAt: m.createdAt.toISOString(),
          mine: m.senderUserId === userId,
          attachments: (byMessage.get(m.id) ?? []).map((a) => ({
            id: a.id,
            filename: a.filename,
            contentType: a.contentType,
            byteSize: a.byteSize,
            width: a.width,
            height: a.height,
          })),
        })),
      };
    },
    { userId },
  );
}
