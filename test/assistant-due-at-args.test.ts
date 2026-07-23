import { describe, expect, it } from "vitest";
import { dueClause, dueFromCommitArgs, dueProposalArgs, resolveDueAt } from "@/lib/assistant/tools/due-at-args";

const LA = "America/Los_Angeles";

describe("resolveDueAt", () => {
  it("resolves a date + time against the VIEWER's zone, not the server's UTC", () => {
    const due = resolveDueAt("2026-07-23", "09:00", LA);
    expect(due?.dueAtIso).toBe("2026-07-23T16:00:00.000Z");
    expect(due?.dueAtHasTime).toBe(true);
    expect(due?.text).toBe("2026-07-23 at 9:00 AM");
  });

  it("stays date-only when no time was given", () => {
    const due = resolveDueAt("2026-07-23", undefined, LA);
    expect(due?.dueAtHasTime).toBe(false);
    expect(due?.text).toBe("2026-07-23");
  });

  it("accepts the 12-hour forms a model actually emits", () => {
    expect(resolveDueAt("2026-07-23", "9am", LA)?.dueAtIso).toBe("2026-07-23T16:00:00.000Z");
    expect(resolveDueAt("2026-07-23", "5:30 PM", LA)?.dueAtIso).toBe("2026-07-24T00:30:00.000Z");
  });

  it("keeps the date when the time is unreadable rather than dropping both", () => {
    const due = resolveDueAt("2026-07-23", "sometime in the morning", LA);
    expect(due?.dueAtHasTime).toBe(false);
    expect(due?.text).toBe("2026-07-23");
  });

  it("falls back to UTC when the client sent no (or a bogus) timezone", () => {
    expect(resolveDueAt("2026-07-23", "09:00", undefined)?.dueAtIso).toBe("2026-07-23T09:00:00.000Z");
    expect(resolveDueAt("2026-07-23", "09:00", "Mars/Olympus_Mons")?.dueAtIso).toBe("2026-07-23T09:00:00.000Z");
  });

  it("is null when there is no usable due date — the work order is simply unscheduled", () => {
    expect(resolveDueAt(undefined, "09:00", LA)).toBeNull();
    expect(resolveDueAt("next tuesday", null, LA)).toBeNull();
    expect(resolveDueAt(42, "09:00", LA)).toBeNull();
  });
});

describe("dueClause", () => {
  it("words the preview, and says nothing when unscheduled", () => {
    expect(dueClause(resolveDueAt("2026-07-23", "09:00", LA))).toBe(", due 2026-07-23 at 9:00 AM");
    expect(dueClause(null)).toBe("");
  });
});

describe("proposal token round-trip", () => {
  it("carries the instant + precision from propose through to commit", () => {
    const due = resolveDueAt("2026-07-23", "09:00", LA);
    const signed = dueProposalArgs(due) as Record<string, unknown>;
    const { dueAt, dueAtHasTime } = dueFromCommitArgs(signed);
    expect(dueAt?.toISOString()).toBe("2026-07-23T16:00:00.000Z");
    expect(dueAtHasTime).toBe(true);
  });

  it("signs nothing when unscheduled, and commits as unscheduled", () => {
    expect(dueProposalArgs(null)).toEqual({});
    expect(dueFromCommitArgs({})).toEqual({ dueAt: null, dueAtHasTime: false });
  });

  it("still commits a card minted under the OLD date-only token shape", () => {
    // A confirmation card can outlive the deploy that changed the shape; it must not error on the user.
    const { dueAt, dueAtHasTime } = dueFromCommitArgs({ dueDate: "2026-07-23" });
    expect(dueAt?.toISOString()).toBe("2026-07-23T00:00:00.000Z");
    expect(dueAtHasTime).toBe(false);
  });

  it("ignores a corrupt instant rather than committing a bogus due date", () => {
    expect(dueFromCommitArgs({ dueAtIso: "not-a-date" })).toEqual({ dueAt: null, dueAtHasTime: false });
  });
});
