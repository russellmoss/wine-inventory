import { describe, it, expect } from "vitest";
import { proposalGate } from "@/lib/assistant/proposal-card";

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
