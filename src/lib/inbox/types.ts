// Plan 068 — Inbox payload/DTO types. Client-safe (no prisma import), so client components can use them.

export type InboxCategory = "WORK_ORDER" | "TICKET" | "DIRECT_MESSAGE" | "SYSTEM";
export type InboxKind = "TICKET_REPLY" | "TICKET_STATUS" | "WO_ASSIGNED" | "WO_STATUS" | "DIRECT_MESSAGE";

/** Who acted (for self-suppression + provenance). Optional — system events have no actor. */
export type NotificationActor = { actorUserId?: string | null; actorEmail?: string | null };

/** The shape a hook hands to emitNotificationTx. */
export type EmitNotificationInput = {
  recipientUserId: string;
  recipientEmail: string;
  category: InboxCategory;
  kind: InboxKind;
  title: string;
  snippet: string;
  /** Polymorphic source (no FK): "work_order" | "feedback_ticket" | "dm_thread" | … */
  sourceType: string;
  sourceId: string;
  actor?: NotificationActor;
};

/** The reader-facing notification row. `href` is DERIVED (no stored column — amendment 5). */
export type InboxNotificationDTO = {
  id: string;
  category: InboxCategory;
  kind: InboxKind;
  title: string;
  snippet: string;
  sourceType: string;
  sourceId: string;
  href: string | null;
  actorEmail: string | null;
  read: boolean;
  createdAt: string; // ISO
};

export type ListNotificationsOpts = {
  category?: InboxCategory;
  unreadOnly?: boolean;
  limit?: number;
  /** notification id to page after (createdAt/id desc). */
  cursor?: string;
};

/** The maximum snippet length persisted on a notification (first N chars of an outcome note etc.). */
export const NOTIFICATION_SNIPPET_MAX = 140;

/** Truncate free text to a notification snippet (single line, capped). */
export function toSnippet(text: string | null | undefined, max = NOTIFICATION_SNIPPET_MAX): string {
  const flat = (text ?? "").replace(/\s+/g, " ").trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1).trimEnd()}…`;
}
