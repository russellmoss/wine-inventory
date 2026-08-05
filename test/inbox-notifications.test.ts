import { describe, it, expect } from "vitest";
import {
  shouldSuppressSelfNotification,
  shouldEmitNotification,
  buildTicketNotificationPayload,
  buildWorkOrderNotificationPayload,
  toNotificationDTO,
  type NotificationRow,
} from "@/lib/inbox/payloads";
import { toSnippet, NOTIFICATION_SNIPPET_MAX } from "@/lib/inbox/types";
import { deriveNotificationHref, parseBucket, inboxHref } from "@/lib/inbox/routes";

describe("shouldSuppressSelfNotification", () => {
  it("suppresses when the recipient is the actor", () => {
    expect(shouldSuppressSelfNotification("u1", "u1")).toBe(true);
  });
  it("does not suppress a different actor", () => {
    expect(shouldSuppressSelfNotification("u1", "u2")).toBe(false);
  });
  it("does not suppress when there is no actor (system event)", () => {
    expect(shouldSuppressSelfNotification("u1", null)).toBe(false);
    expect(shouldSuppressSelfNotification("u1", undefined)).toBe(false);
  });
});

describe("shouldEmitNotification", () => {
  it("suppresses a self-action by default (allowSelf off)", () => {
    expect(shouldEmitNotification("u1", "u1")).toBe(false);
  });
  it("emits a self-action when allowSelf is on (self-assigned WO → my inbox)", () => {
    expect(shouldEmitNotification("u1", "u1", true)).toBe(true);
  });
  it("always emits to a different recipient, regardless of allowSelf", () => {
    expect(shouldEmitNotification("u1", "u2")).toBe(true);
    expect(shouldEmitNotification("u1", "u2", true)).toBe(true);
  });
  it("emits a system event (no actor)", () => {
    expect(shouldEmitNotification("u1", null)).toBe(true);
    expect(shouldEmitNotification("u1", undefined)).toBe(true);
  });
});

describe("toSnippet", () => {
  it("collapses whitespace and trims", () => {
    expect(toSnippet("  hello   world \n next ")).toBe("hello world next");
  });
  it("truncates with an ellipsis past the cap", () => {
    const long = "x".repeat(NOTIFICATION_SNIPPET_MAX + 50);
    const s = toSnippet(long);
    expect(s.length).toBe(NOTIFICATION_SNIPPET_MAX);
    expect(s.endsWith("…")).toBe(true);
  });
  it("handles null/undefined", () => {
    expect(toSnippet(null)).toBe("");
    expect(toSnippet(undefined)).toBe("");
  });
});

describe("buildTicketNotificationPayload", () => {
  it("uses TICKET_REPLY + the outcome note when there is a reply", () => {
    const p = buildTicketNotificationPayload({
      ticketId: "t1",
      hasReply: true,
      outcomeNote: "We shipped a fix in PR #123.",
    });
    expect(p.kind).toBe("TICKET_REPLY");
    expect(p.category).toBe("TICKET");
    expect(p.snippet).toBe("We shipped a fix in PR #123.");
    expect(p.sourceType).toBe("feedback_ticket");
    expect(p.sourceId).toBe("t1");
    expect(p.title).toMatch(/reply/i);
  });
  it("uses TICKET_STATUS + status label when there is no reply", () => {
    const p = buildTicketNotificationPayload({ ticketId: "t2", hasReply: false, statusLabel: "resolved" });
    expect(p.kind).toBe("TICKET_STATUS");
    expect(p.title).toBe("Your ticket is now resolved");
    expect(p.snippet).toBe("Status: resolved");
  });
  it("a close (reply + status) titles by status but keeps the outcome as a TICKET_REPLY snippet", () => {
    const p = buildTicketNotificationPayload({
      ticketId: "t3",
      hasReply: true,
      statusLabel: "resolved",
      outcomeNote: "Shipped the fix.",
    });
    expect(p.kind).toBe("TICKET_REPLY");
    expect(p.title).toBe("Your ticket is now resolved");
    expect(p.snippet).toBe("Shipped the fix.");
  });
});

describe("buildWorkOrderNotificationPayload", () => {
  it("assigned → WO_ASSIGNED with the number in the title", () => {
    const p = buildWorkOrderNotificationPayload({ workOrderId: "w1", workOrderNumber: 42, event: "assigned" });
    expect(p.kind).toBe("WO_ASSIGNED");
    expect(p.category).toBe("WORK_ORDER");
    expect(p.title).toBe("Work order #42 assigned to you");
    expect(p.sourceType).toBe("work_order");
    expect(p.sourceId).toBe("w1");
  });
  it("status → WO_STATUS with the status label", () => {
    const p = buildWorkOrderNotificationPayload({
      workOrderId: "w2",
      workOrderNumber: 7,
      event: "status",
      statusLabel: "completed",
    });
    expect(p.kind).toBe("WO_STATUS");
    expect(p.title).toBe("Work order #7 completed");
    expect(p.snippet).toBe("Work order #7 is now completed.");
  });
});

describe("deriveNotificationHref", () => {
  // A notification's deep link must reach the ITEM'S DETAILS, not merely a bucket list. The `wo=` /
  // `ticket=` sub-keys used to be dead (nothing consumed them), so "Open" on a work-order notification
  // stranded the user on the WO bucket list — and for a COMPLETED order, not even in it (default filter
  // is "open"), seeing just the row name. Work orders have a real standalone detail page; link there.
  it("links a work order straight to its standalone detail page (NOT a bucket list)", () => {
    const href = deriveNotificationHref("work_order", "w1");
    expect(href).toBe("/work-orders/w1");
    // Regression guard: must not dead-end on the wo bucket with an unconsumed sub-key.
    expect(href).not.toContain("bucket=wo");
    expect(href).not.toContain("wo=");
  });
  it("links a ticket to the tickets bucket carrying the ticket sub-key (InboxClient preselects it)", () => {
    expect(deriveNotificationHref("feedback_ticket", "t1")).toBe("/inbox?bucket=tickets&ticket=t1");
  });
  it("links a dm thread to the dm bucket carrying the thread sub-key", () => {
    expect(deriveNotificationHref("dm_thread", "th1")).toBe("/inbox?bucket=dm&thread=th1");
  });
  it("returns null for an unknown source (reader tombstones it)", () => {
    expect(deriveNotificationHref("mystery", "x")).toBeNull();
  });
  it("URL-encodes ids with special characters", () => {
    expect(deriveNotificationHref("dm_thread", "a b&c")).toBe("/inbox?bucket=dm&thread=a%20b%26c");
    expect(deriveNotificationHref("work_order", "id/with?chars")).toBe("/work-orders/id%2Fwith%3Fchars");
  });
});

describe("parseBucket / inboxHref", () => {
  it("coerces unknown buckets to all", () => {
    expect(parseBucket("wo")).toBe("wo");
    expect(parseBucket("garbage")).toBe("all");
    expect(parseBucket(null)).toBe("all");
  });
  it("builds bucket URLs with optional filter", () => {
    expect(inboxHref("tickets")).toBe("/inbox?bucket=tickets");
    expect(inboxHref("wo", "in-progress")).toBe("/inbox?bucket=wo&filter=in-progress");
  });
});

describe("toNotificationDTO", () => {
  const base: NotificationRow = {
    id: "n1",
    category: "WORK_ORDER",
    kind: "WO_STATUS",
    title: "Work order #3 completed",
    snippet: "…",
    sourceType: "work_order",
    sourceId: "w3",
    actorEmail: "boss@demo.test",
    readAt: null,
    createdAt: new Date("2026-07-15T12:00:00.000Z"),
  };
  it("derives the work-order DETAIL href (not a bucket list), read flag, ISO date", () => {
    const dto = toNotificationDTO(base);
    expect(dto.href).toBe("/work-orders/w3");
    expect(dto.read).toBe(false);
    expect(dto.createdAt).toBe("2026-07-15T12:00:00.000Z");
  });
  it("read is true once readAt is set", () => {
    expect(toNotificationDTO({ ...base, readAt: new Date() }).read).toBe(true);
  });
});
