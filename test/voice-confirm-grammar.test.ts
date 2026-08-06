import { describe, it, expect } from "vitest";
import {
  CONFIRM_RE,
  classifyUtterance,
  announceArmedProposal,
} from "@/lib/voice/confirm-grammar";
import { admitProposal, releaseProposal } from "@/lib/assistant/card-lifecycle";

// Regression suite for feedback cmsgbjgov: seven writes applied while the reporter believed no
// confirmation card had rendered. These assert the two properties that made that possible are gone.

describe("confirm grammar — ordinary cellar speech must NOT commit a write", () => {
  // Every one of these committed a pending write before this change.
  const innocent = [
    "yes that tank is the one we racked",
    "yep",
    "go ahead and grab me the hose",
    "we apply the Fermaid on day two",
    "do it after lunch",
    "approve the PO when it comes in — I mean the purchase order",
  ];
  it.each(innocent)("does not commit on: %s", (t) => {
    // "approve" is still assent by design, so that last line is expected to confirm; it is here to
    // document the one survivor rather than to claim it is safe.
    const verdict = classifyUtterance(t);
    if (/\bapprove\b/i.test(t)) expect(verdict).toBe("confirm");
    else expect(verdict).not.toBe("confirm");
  });

  it("still commits on explicit assent", () => {
    expect(classifyUtterance("confirm")).toBe("confirm");
    expect(classifyUtterance("Confirm that.")).toBe("confirm");
    expect(classifyUtterance("approve")).toBe("confirm");
  });

  it("cancel beats confirm when both appear — the cheap mistake is preferred", () => {
    expect(classifyUtterance("confirm — no, wait")).toBe("cancel");
    expect(classifyUtterance("cancel")).toBe("cancel");
  });

  it("empty and non-string transcripts are inert", () => {
    expect(classifyUtterance("")).toBe("neither");
    expect(classifyUtterance("   ")).toBe("neither");
    expect(classifyUtterance(undefined as unknown as string)).toBe("neither");
  });

  it("the loosened words stay OUT of the pattern (guard against a well-meaning revert)", () => {
    for (const w of ["yes", "yep", "do it", "go ahead", "apply"]) {
      expect(CONFIRM_RE.test(w)).toBe(false);
    }
  });
});

describe("every armed write is announced, and names the word that commits it", () => {
  it("says what it is and how to commit", () => {
    const line = announceArmedProposal("Add 30 g/hL Fermaid O to Lot 24-CH-01");
    expect(line).toContain("Add 30 g/hL Fermaid O to Lot 24-CH-01");
    expect(line.toLowerCase()).toContain("say confirm");
  });

  it("tells the user another write is waiting, so two announcements aren't heard as one repeat", () => {
    expect(announceArmedProposal("Filter Tank T5", 1)).toContain("one more after it");
    expect(announceArmedProposal("Filter Tank T5", 3)).toContain("3 more after it");
  });

  it("survives markdown, multi-line and over-long previews", () => {
    expect(announceArmedProposal("- **Press** Tank T5\nsecond line")).toContain("Press Tank T5");
    expect(announceArmedProposal("x".repeat(300)).length).toBeLessThan(200);
    expect(announceArmedProposal("")).toContain("a change");
  });
});

describe("the queue still arms one card at a time — announcement is per card", () => {
  type P = { id: string; status: "pending" | "done" };
  it("each promoted card is a separate armed write, so each needs its own announcement", () => {
    let slot = { current: null as P | null, queued: [] as P[] };
    for (const id of ["a", "b", "c"]) slot = admitProposal(slot, { id, status: "pending" });
    expect(slot.current?.id).toBe("a");
    expect(slot.queued).toHaveLength(2);

    slot = { ...slot, current: { ...slot.current!, status: "done" } };
    slot = releaseProposal(slot);
    expect(slot.current).toEqual({ id: "b", status: "pending" });

    slot = { ...slot, current: { ...slot.current!, status: "done" } };
    slot = releaseProposal(slot);
    expect(slot.current).toEqual({ id: "c", status: "pending" });
  });
});
