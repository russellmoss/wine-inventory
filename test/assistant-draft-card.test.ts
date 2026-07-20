import { describe, it, expect } from "vitest";
import { proposalGate, readDraftGaps } from "@/lib/assistant/proposal-card";

// Plan 081 U7 — Confirm gating for the Draft card.
//
// Council was emphatic on this: cards that always appear make Confirm a reflex, so a physically
// invalid operation must not be one click from issued. The gate is a consequence of the contract (a
// Draft has no token, so there is nothing to POST) — these tests pin the user-visible half.

describe("proposalGate — Ready", () => {
  it("allows Confirm on a proposal with a token", () => {
    const gate = proposalGate({ token: "tok-1" });
    expect(gate.canConfirm).toBe(true);
    expect(gate.reason).toBeNull();
  });

  it("still allows Confirm when a READY proposal carries non-blocking warnings", () => {
    // "confirmable" and "completion_check" are advisory by design — they inform, they do not gate.
    const gate = proposalGate({
      token: "tok-1",
      details: {
        warnings: [
          { severity: "confirmable", code: "unknown_cost", message: "Cost unknown." },
          { severity: "completion_check", code: "dose_after_planned_rack", message: "Recomputed at completion." },
        ],
      },
    });
    expect(gate.canConfirm).toBe(true);
  });
});

describe("proposalGate — Draft", () => {
  it("blocks Confirm on an explicit draft", () => {
    expect(proposalGate({ draft: true }).canConfirm).toBe(false);
  });

  it("blocks Confirm on any tokenless proposal, draft flag or not", () => {
    // Defence in depth: if a future emitter forgets the marker, absence of a token still gates.
    expect(proposalGate({}).canConfirm).toBe(false);
    expect(proposalGate({ token: "" }).canConfirm).toBe(false);
  });

  it("names how many details are missing", () => {
    const gate = proposalGate({
      draft: true,
      details: {
        unresolved: [
          { label: "Assignee", reason: "No email given." },
          { label: "Filter media", reason: "Task #2 needs a filter medium." },
        ],
      },
    });
    expect(gate.canConfirm).toBe(false);
    expect(gate.unresolvedCount).toBe(2);
    expect(gate.reason).toContain("2 details");
  });

  it("uses the singular for one missing detail", () => {
    const gate = proposalGate({ draft: true, details: { unresolved: [{ label: "Assignee", reason: "x" }] } });
    expect(gate.reason).toContain("one detail");
  });

  it("reports a BLOCKING warning ahead of missing fields", () => {
    // A physically refused operation is not fixed by filling in a field; telling the user to supply an
    // assignee when the rack itself is impossible sends them down the wrong path.
    const gate = proposalGate({
      draft: true,
      details: {
        unresolved: [{ label: "Assignee", reason: "No email given." }],
        warnings: [{ severity: "blocking", code: "same_vessel", message: "Source and destination must differ." }],
      },
    });
    expect(gate.canConfirm).toBe(false);
    expect(gate.blockingCount).toBe(1);
    expect(gate.reason).toContain("can't be issued as written");
    expect(gate.reason).not.toContain("still needs");
  });

  it("falls back to a generic reason when a draft carries no details at all", () => {
    const gate = proposalGate({ draft: true, details: undefined });
    expect(gate.canConfirm).toBe(false);
    expect(gate.reason).toBeTruthy();
  });
});

// Plan 081 U8 — voice mode's DEFINED behavior for a Draft: speak the gaps, defer to the visual card.
// It never attempts in-voice field resolution (dictating an email/lot code is where a wrong value
// gets committed) and it never confirms a draft (there is no token to confirm).
describe("readDraftGaps — what voice says about a draft", () => {
  it("reports missing-field labels, lower-cased for speech", () => {
    const gaps = readDraftGaps({ unresolved: [{ label: "Assignee" }, { label: "Filter media" }] });
    expect(gaps.unresolved).toBe(2);
    expect(gaps.labels).toEqual(["assignee", "filter media"]);
  });

  it("caps the spoken list at three so it stays one sentence", () => {
    const gaps = readDraftGaps({ unresolved: [1, 2, 3, 4, 5].map((n) => ({ label: `Field ${n}` })) });
    expect(gaps.unresolved).toBe(5);
    expect(gaps.labels).toHaveLength(3);
  });

  it("counts only blocking warnings", () => {
    const gaps = readDraftGaps({
      warnings: [
        { severity: "blocking", message: "a" },
        { severity: "confirmable", message: "b" },
        { severity: "completion_check", message: "c" },
      ],
    });
    expect(gaps.blocking).toBe(1);
  });

  it("survives junk off the wire without throwing", () => {
    for (const junk of [undefined, null, "string", 42, {}, { unresolved: "no" }, { unresolved: [null, 7, {}] }]) {
      expect(() => readDraftGaps(junk)).not.toThrow();
    }
    expect(readDraftGaps({ unresolved: [null, 7, {}] }).labels).toEqual([]);
  });
});
