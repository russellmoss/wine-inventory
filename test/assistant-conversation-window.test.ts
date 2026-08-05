import { describe, it, expect, vi } from "vitest";

/**
 * P0, live for 16 days: the assistant returned a 400 on EVERY turn of a long conversation.
 *
 *   400 invalid_request_error — "This model does not support assistant message prefill.
 *                                The conversation must end with a user message."
 *
 * Both message reads bounded themselves with `orderBy: { createdAt: "asc" }` + `take: N`, which
 * returns the OLDEST N rows, not the newest. Past N messages:
 *
 *  - `listMessagesForReplay` no longer contained the user turn the route had just appended, so the
 *    rebuilt array ended on an ASSISTANT turn and the API refused the request. Permanent for that
 *    conversation — the same rows rebuild the same broken shape every time. Reproduced against the
 *    real 246-message thread behind tickets cmsdem5xo / cmsdy4uom / cmsevmt6v / cmsg2dir6.
 *  - `getConversation` served the UI the oldest N turns, so reopening the thread showed a
 *    transcript frozen weeks back with the user's own recent messages missing.
 *
 * These tests drive the REAL functions through a Prisma double that honours orderBy + take, so
 * they fail if either query ever goes back to a bare ascending bound.
 */

/**
 * A conversation longer than either limit, alternating user/assistant, oldest first. The count is
 * ODD so the final row is the `user` turn the route persists immediately before replaying — the
 * row whose absence from the window caused the 400.
 */
const ROWS = Array.from({ length: 247 }, (_, i) => ({
  id: `m${String(i).padStart(3, "0")}`,
  role: i % 2 === 0 ? "user" : "assistant",
  content: `turn ${i}`,
  metadata: null,
  createdAt: new Date(Date.UTC(2026, 6, 18, 0, 0, i)),
}));

/** Apply the orderBy/take a query asked for, exactly as Postgres would. */
function applyQuery(args: { orderBy?: unknown; take?: number }) {
  const orderBy = Array.isArray(args.orderBy) ? args.orderBy[0] : args.orderBy;
  const desc = (orderBy as { createdAt?: string } | undefined)?.createdAt === "desc";
  const sorted = desc ? [...ROWS].reverse() : [...ROWS];
  return typeof args.take === "number" ? sorted.slice(0, args.take) : sorted;
}

vi.mock("@/lib/prisma", () => ({
  prisma: {
    assistantMessage: {
      findMany: async (args: { orderBy?: unknown; take?: number }) => applyQuery(args),
    },
    assistantConversation: {
      findFirst: async (args: { select?: { messages?: { orderBy?: unknown; take?: number } } }) => ({
        id: "conv1",
        title: "Big Red Inventory Check",
        messages: applyQuery(args.select?.messages ?? {}),
      }),
    },
  },
  prismaBase: {},
}));

describe("listMessagesForReplay — the replay window holds the NEWEST turns", () => {
  it("ends on the just-appended user turn, not on a months-old assistant turn", async () => {
    const { listMessagesForReplay } = await import("@/lib/assistant/conversations");
    const rows = await listMessagesForReplay("conv1");

    const last = rows[rows.length - 1];
    // The whole 400 in one assertion: replay.ts rebuilds these in order, so a trailing assistant
    // row is a trailing assistant message, which the model rejects as a prefill.
    expect(last.role).toBe("user");
    expect(last.content).toBe(ROWS[ROWS.length - 1].content);
  });

  it("returns rows oldest-first — reversing the bound must not reverse the transcript", async () => {
    const { listMessagesForReplay } = await import("@/lib/assistant/conversations");
    const rows = await listMessagesForReplay("conv1");

    const times = rows.map((r) => (r as unknown as { createdAt?: Date }).createdAt);
    expect(rows.length).toBeGreaterThan(1);
    expect(rows[0].content).toBe(ROWS[ROWS.length - rows.length].content);
    for (let i = 1; i < times.length; i++) {
      if (!times[i] || !times[i - 1]) continue;
      expect(times[i]!.getTime()).toBeGreaterThanOrEqual(times[i - 1]!.getTime());
    }
  });
});

describe("getConversation — the UI transcript holds the NEWEST turns", () => {
  it("shows the most recent messages, in chronological order", async () => {
    const { getConversation } = await import("@/lib/assistant/conversations");
    const convo = await getConversation({ id: "conv1", ownerUserId: "u1" });

    expect(convo).not.toBeNull();
    const msgs = convo!.messages;
    expect(msgs[msgs.length - 1].content).toBe(ROWS[ROWS.length - 1].content);
    for (let i = 1; i < msgs.length; i++) {
      expect(msgs[i].createdAt.getTime()).toBeGreaterThanOrEqual(msgs[i - 1].createdAt.getTime());
    }
  });
});
