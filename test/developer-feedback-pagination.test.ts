import { describe, expect, it } from "vitest";
import {
  decodeDeveloperFeedbackCursor,
  DeveloperFeedbackCursorError,
  encodeDeveloperFeedbackCursor,
  mergeDeveloperFeedbackPage,
} from "@/lib/developer/feedback-pagination";

const row = (
  sourceType: "ASSISTANT_FEEDBACK" | "FEEDBACK_TICKET",
  id: string,
  createdAt: string,
) => ({ sourceType, id, createdAt });

describe("developer feedback cursors", () => {
  it("round-trips a canonical opaque cursor", () => {
    const cursor = { createdAt: "2026-07-14T12:34:56.789Z", id: "feedback_123" };
    expect(decodeDeveloperFeedbackCursor(encodeDeveloperFeedbackCursor(cursor))).toEqual(cursor);
  });

  it.each([
    "not base64!",
    Buffer.from("{}", "utf8").toString("base64url"),
    Buffer.from(
      JSON.stringify({ v: 1, createdAt: "not-a-date", id: "row_1" }),
      "utf8",
    ).toString("base64url"),
    Buffer.from(
      JSON.stringify({ v: 1, createdAt: "2026-07-14T12:00:00.000Z", id: "row_1", extra: true }),
      "utf8",
    ).toString("base64url"),
    Buffer.from(
      JSON.stringify({ v: 2, createdAt: "2026-07-14T12:00:00.000Z", id: "row_1" }),
      "utf8",
    ).toString("base64url"),
  ])("rejects malformed or non-canonical cursor %s", (value) => {
    expect(() => decodeDeveloperFeedbackCursor(value)).toThrow(DeveloperFeedbackCursorError);
  });
});

describe("dual-source developer feedback paging", () => {
  it("merges by createdAt, id, and source type without duplicates", () => {
    const page = mergeDeveloperFeedbackPage({
      assistantRows: [
        row("ASSISTANT_FEEDBACK", "same", "2026-07-14T12:00:00.000Z"),
        row("ASSISTANT_FEEDBACK", "a1", "2026-07-14T10:00:00.000Z"),
        row("ASSISTANT_FEEDBACK", "a1", "2026-07-14T10:00:00.000Z"),
      ],
      ticketRows: [
        row("FEEDBACK_TICKET", "same", "2026-07-14T12:00:00.000Z"),
        row("FEEDBACK_TICKET", "t1", "2026-07-14T11:00:00.000Z"),
      ],
      pageSize: 5,
    });

    expect(page.items.map((item) => `${item.sourceType}:${item.id}`)).toEqual([
      "ASSISTANT_FEEDBACK:same",
      "FEEDBACK_TICKET:same",
      "FEEDBACK_TICKET:t1",
      "ASSISTANT_FEEDBACK:a1",
    ]);
    expect(page.hasMore).toBe(true); // the duplicate fetched row was not emitted
  });

  it("advances only a source that emitted a row and retains the other cursor", () => {
    const priorTicketCursor = encodeDeveloperFeedbackCursor({
      createdAt: "2026-07-13T00:00:00.000Z",
      id: "ticket_prior",
    });
    const page = mergeDeveloperFeedbackPage({
      assistantRows: [
        row("ASSISTANT_FEEDBACK", "a3", "2026-07-14T13:00:00.000Z"),
        row("ASSISTANT_FEEDBACK", "a2", "2026-07-14T12:00:00.000Z"),
      ],
      ticketRows: [row("FEEDBACK_TICKET", "t1", "2026-07-14T11:00:00.000Z")],
      pageSize: 2,
      ticketCursor: priorTicketCursor,
    });

    expect(page.items.map((item) => item.id)).toEqual(["a3", "a2"]);
    expect(page.nextAssistantCursor).toBe(
      encodeDeveloperFeedbackCursor({
        createdAt: "2026-07-14T12:00:00.000Z",
        id: "a2",
      }),
    );
    expect(page.nextTicketCursor).toBe(priorTicketCursor);
    expect(page.hasMore).toBe(true);
  });

  it("preserves stable traversal when one source dominates the first page", () => {
    const first = mergeDeveloperFeedbackPage({
      assistantRows: [
        row("ASSISTANT_FEEDBACK", "a3", "2026-07-14T13:00:00.000Z"),
        row("ASSISTANT_FEEDBACK", "a2", "2026-07-14T12:00:00.000Z"),
        row("ASSISTANT_FEEDBACK", "a1", "2026-07-14T10:00:00.000Z"),
      ],
      ticketRows: [
        row("FEEDBACK_TICKET", "t2", "2026-07-14T11:00:00.000Z"),
        row("FEEDBACK_TICKET", "t1", "2026-07-14T09:00:00.000Z"),
      ],
      pageSize: 2,
    });
    const second = mergeDeveloperFeedbackPage({
      assistantRows: [row("ASSISTANT_FEEDBACK", "a1", "2026-07-14T10:00:00.000Z")],
      ticketRows: [
        row("FEEDBACK_TICKET", "t2", "2026-07-14T11:00:00.000Z"),
        row("FEEDBACK_TICKET", "t1", "2026-07-14T09:00:00.000Z"),
      ],
      pageSize: 2,
      assistantCursor: first.nextAssistantCursor,
      ticketCursor: first.nextTicketCursor,
    });

    expect(first.items.map((item) => item.id)).toEqual(["a3", "a2"]);
    expect(second.items.map((item) => item.id)).toEqual(["t2", "a1"]);
    expect(
      new Set([...first.items, ...second.items].map((item) => `${item.sourceType}:${item.id}`)).size,
    ).toBe(4);
  });
});
