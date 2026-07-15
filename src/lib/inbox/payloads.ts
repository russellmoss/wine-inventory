// Plan 068 — PURE notification payload builders + DTO mapping (no server-only, no prisma), so the
// inbox core's logic is unit-testable without loading the DB client. notifications.ts re-exports these.

import { deriveNotificationHref } from "@/lib/inbox/routes";
import { type EmitNotificationInput, type InboxCategory, type InboxNotificationDTO, toSnippet } from "@/lib/inbox/types";

/** "I acted on my own thing" is noise, not news — suppress when the recipient IS the actor. */
export function shouldSuppressSelfNotification(recipientUserId: string, actorUserId?: string | null): boolean {
  return !!actorUserId && recipientUserId === actorUserId;
}

export type BuiltPayload = Pick<
  EmitNotificationInput,
  "category" | "kind" | "title" | "snippet" | "sourceType" | "sourceId"
>;

/** Ticket reply/status → payload. `hasReply` (outcome note text changed) picks TICKET_REPLY over
 *  a plain TICKET_STATUS transition. */
export function buildTicketNotificationPayload(input: {
  ticketId: string;
  hasReply: boolean;
  statusLabel?: string | null;
  outcomeNote?: string | null;
}): BuiltPayload {
  const { ticketId, hasReply, statusLabel, outcomeNote } = input;
  // A status transition (e.g. a close) titles by the new status; a pure reply with no status change
  // titles as a reply. The outcome note (when present) is the snippet, else a status line.
  const title = statusLabel
    ? `Your ticket is now ${statusLabel}`
    : hasReply
      ? "New reply on your ticket"
      : "Your ticket was updated";
  return {
    category: "TICKET",
    kind: hasReply ? "TICKET_REPLY" : "TICKET_STATUS",
    title,
    snippet: hasReply
      ? toSnippet(outcomeNote)
      : toSnippet(statusLabel ? `Status: ${statusLabel}` : "Your ticket was updated."),
    sourceType: "feedback_ticket",
    sourceId: ticketId,
  };
}

/** WO assignment/status → payload. */
export function buildWorkOrderNotificationPayload(input: {
  workOrderId: string;
  workOrderNumber: number;
  event: "assigned" | "status";
  statusLabel?: string | null;
}): BuiltPayload {
  const { workOrderId, workOrderNumber, event, statusLabel } = input;
  const n = `#${workOrderNumber}`;
  return event === "assigned"
    ? {
        category: "WORK_ORDER",
        kind: "WO_ASSIGNED",
        title: `Work order ${n} assigned to you`,
        snippet: toSnippet(`You were assigned work order ${n}.`),
        sourceType: "work_order",
        sourceId: workOrderId,
      }
    : {
        category: "WORK_ORDER",
        kind: "WO_STATUS",
        title: `Work order ${n} ${statusLabel ?? "updated"}`,
        snippet: toSnippet(`Work order ${n} is now ${statusLabel ?? "updated"}.`),
        sourceType: "work_order",
        sourceId: workOrderId,
      };
}

export type NotificationRow = {
  id: string;
  category: InboxCategory;
  kind: InboxNotificationDTO["kind"];
  title: string;
  snippet: string;
  sourceType: string;
  sourceId: string;
  actorEmail: string | null;
  readAt: Date | null;
  createdAt: Date;
};

/** Map a persisted row to the reader DTO (href derived, read = readAt set). */
export function toNotificationDTO(row: NotificationRow): InboxNotificationDTO {
  return {
    id: row.id,
    category: row.category,
    kind: row.kind,
    title: row.title,
    snippet: row.snippet,
    sourceType: row.sourceType,
    sourceId: row.sourceId,
    href: deriveNotificationHref(row.sourceType, row.sourceId),
    actorEmail: row.actorEmail,
    read: row.readAt != null,
    createdAt: row.createdAt.toISOString(),
  };
}
