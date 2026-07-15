import { describe, expect, it } from "vitest";
import {
  parseDeveloperOutcome,
  prependDeveloperOutcomeNote,
} from "@/lib/developer/feedback-outcome";
import { parseTriageNotes } from "@/lib/developer/triage-notes";

describe("developer feedback outcome", () => {
  it("requires a meaningful trimmed outcome", () => {
    expect(parseDeveloperOutcome("  fixed it  ")).toEqual({
      ok: false,
      error: "Describe the outcome in at least 20 characters.",
    });
    expect(parseDeveloperOutcome(`  ${"x".repeat(20)}  `)).toEqual({
      ok: true,
      value: "x".repeat(20),
    });
  });

  it("bounds and sanitizes close-out text", () => {
    const parsed = parseDeveloperOutcome(`${"a".repeat(1_400)}\u0000TAIL`);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value).toHaveLength(1_200);
      expect(parsed.value).not.toContain("TAIL");
      expect(parsed.value).not.toContain("\u0000");
    }
  });

  it("prepends a stamped human outcome without losing existing history", () => {
    const notes = prependDeveloperOutcomeNote({
      existing: "[bug-triage 2026-07-14T10:00:00.000Z] [defect] Root cause isolated",
      at: new Date("2026-07-14T12:00:00.000Z"),
      actorEmail: "developer@demowinery.test",
      status: "RESOLVED",
      outcome: "Merged and verified the corrected queue behavior.",
    });
    expect(notes).toContain("[developer 2026-07-14T12:00:00.000Z] [resolved]");
    expect(notes).toContain("Root cause isolated");
    expect(parseTriageNotes(notes)).toEqual([
      {
        stamp: "2026-07-14T12:00:00.000Z",
        source: "developer",
        type: "resolved",
        text: "Merged and verified the corrected queue behavior. — developer@demowinery.test",
      },
      {
        stamp: "2026-07-14T10:00:00.000Z",
        source: "bug-triage",
        type: "defect",
        text: "Root cause isolated",
      },
    ]);
  });

  it("records dismissed outcomes distinctly and caps stored history", () => {
    const notes = prependDeveloperOutcomeNote({
      existing: "old".repeat(2_000),
      at: new Date("2026-07-14T12:00:00.000Z"),
      actorEmail: "developer@demowinery.test",
      status: "DISMISSED",
      outcome: "Confirmed expected behavior and documented the reason.",
    });
    expect(notes).toContain("[dismissed]");
    expect(notes.length).toBeLessThanOrEqual(5_000);
  });
});
