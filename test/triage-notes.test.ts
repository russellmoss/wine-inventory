import { describe, it, expect } from "vitest";
import { parseTriageNotes } from "@/lib/developer/triage-notes";

describe("parseTriageNotes", () => {
  it("returns [] for null / undefined / empty / whitespace", () => {
    expect(parseTriageNotes(null)).toEqual([]);
    expect(parseTriageNotes(undefined)).toEqual([]);
    expect(parseTriageNotes("")).toEqual([]);
    expect(parseTriageNotes("   \n  ")).toEqual([]);
  });

  it("parses a single machine outcome entry (stamp + type + text)", () => {
    const notes = "[bug-triage 2026-07-14T12:34:56.789Z] [defect] Fixed — off-by-one in the picker; merged PR #123.";
    const [entry] = parseTriageNotes(notes);
    expect(entry).toEqual({
      stamp: "2026-07-14T12:34:56.789Z",
      source: "bug-triage",
      type: "defect",
      text: "Fixed — off-by-one in the picker; merged PR #123.",
    });
  });

  it("captures a hyphenated disposition type", () => {
    const notes = "[bug-triage 2026-07-14T00:00:00.000Z] [model-behavior] Mitigation only — added an eval golden.";
    const [entry] = parseTriageNotes(notes);
    expect(entry.type).toBe("model-behavior");
    expect(entry.text).toBe("Mitigation only — added an eval golden.");
  });

  it("splits multiple entries newest-first and tags source", () => {
    const notes = [
      "[bug-triage 2026-07-14T10:00:00.000Z] [product-gap] Not auto-fixed — no lot-level Brix field; routed to /plan.",
      "[bug-triage 2026-07-13T09:00:00.000Z] [defect] Fix dispatched — bad handler; fix agent running.",
      "Looked at this on the floor, seems related to tank 7.",
    ].join("\n\n---\n");
    const entries = parseTriageNotes(notes);
    expect(entries).toHaveLength(3);
    expect(entries[0].source).toBe("bug-triage");
    expect(entries[0].type).toBe("product-gap");
    expect(entries[1].type).toBe("defect");
    // The human free-text entry has no stamp and no type.
    expect(entries[2]).toEqual({
      stamp: null,
      source: "human",
      type: null,
      text: "Looked at this on the floor, seems related to tank 7.",
    });
  });

  it("does not throw and best-effort parses a truncated trailing entry", () => {
    // Loader caps at 4000 chars; newest-first means the OLDEST (last) entry is cut mid-string.
    const notes = [
      "[bug-triage 2026-07-14T10:00:00.000Z] [defect] Fixed — merged PR #200.",
      "[bug-triage 2026-07-01T10:00:00.000Z] [unclear] Handed to a human — needs /investi", // cut off
    ].join("\n\n---\n");
    const entries = parseTriageNotes(notes);
    expect(entries).toHaveLength(2);
    expect(entries[1].type).toBe("unclear");
    expect(entries[1].text).toBe("Handed to a human — needs /investi");
  });

  it("treats a stampless, typeless blob as one human entry", () => {
    const entries = parseTriageNotes("just a plain note from a developer");
    expect(entries).toEqual([
      { stamp: null, source: "human", type: null, text: "just a plain note from a developer" },
    ]);
  });
});
