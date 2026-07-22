import { describe, it, expect } from "vitest";
import {
  RESOLVED_CARD_LINGER_MS,
  admitProposal,
  collapsesAfterLinger,
  isActionableCard,
  nextActionableCardIndex,
  releaseProposal,
  type CardStatus,
} from "@/lib/assistant/card-lifecycle";

// Feedback cmrwiky4p: the assistant proposed two nutrient work orders in one turn
// ("Day 1 — Fermaid-O", "Day 2 — DAP"). Confirming the first left it on screen at full
// height forever and the second never surfaced, so the flow read as stuck.

const card = (status: CardStatus, collapsed = false) => ({ kind: "proposal", status, collapsed });
const text = () => ({ kind: "text" });

describe("isActionableCard", () => {
  it("counts a card still awaiting the user", () => {
    expect(isActionableCard(card("pending"))).toBe(true);
    expect(isActionableCard(card("applying"))).toBe(true);
  });

  it("does not count a resolved card", () => {
    expect(isActionableCard(card("done"))).toBe(false);
    expect(isActionableCard(card("error"))).toBe(false);
  });

  it("does not count a non-proposal item", () => {
    expect(isActionableCard(text())).toBe(false);
    expect(isActionableCard({ kind: "choice" })).toBe(false);
  });
});

describe("nextActionableCardIndex", () => {
  it("finds the card still waiting behind a confirmed one — the reported bug", () => {
    const transcript = [text(), card("done"), text(), card("pending")];
    expect(nextActionableCardIndex(transcript)).toBe(3);
  });

  it("works the queue in proposal order, not newest-first", () => {
    // Day 1 must be confirmed before Day 2; jumping to the newest would skip a write.
    const transcript = [card("pending"), card("pending")];
    expect(nextActionableCardIndex(transcript)).toBe(0);
  });

  it("returns null when every card is resolved", () => {
    expect(nextActionableCardIndex([card("done"), card("error"), text()])).toBeNull();
  });

  it("returns null for an empty or non-array transcript", () => {
    expect(nextActionableCardIndex([])).toBeNull();
    expect(nextActionableCardIndex(undefined as never)).toBeNull();
  });
});

describe("collapsesAfterLinger", () => {
  it("folds a successful card away", () => {
    expect(collapsesAfterLinger("done")).toBe(true);
  });

  it("leaves a failed card standing — the user has to read why it failed", () => {
    expect(collapsesAfterLinger("error")).toBe(false);
  });

  it("never touches a card the user can still act on", () => {
    expect(collapsesAfterLinger("pending")).toBe(false);
    expect(collapsesAfterLinger("applying")).toBe(false);
  });

  it("lingers long enough to read, short enough not to gate the next card", () => {
    expect(RESOLVED_CARD_LINGER_MS).toBeGreaterThanOrEqual(1000);
    expect(RESOLVED_CARD_LINGER_MS).toBeLessThanOrEqual(4000);
  });
});

describe("voice proposal slot", () => {
  const day1 = { status: "pending" as CardStatus, preview: "Day 1 — Fermaid-O" };
  const day2 = { status: "pending" as CardStatus, preview: "Day 2 — DAP" };

  it("takes the slot when it is empty", () => {
    const slot = admitProposal({ current: null, queued: [] }, day1);
    expect(slot.current).toBe(day1);
    expect(slot.queued).toEqual([]);
  });

  it("QUEUES behind a card the user still has to act on, never clobbers it", () => {
    // The regression this guards: a second proposal used to overwrite the first, so a
    // write the assistant had already announced became permanently unconfirmable.
    const slot = admitProposal({ current: day1, queued: [] }, day2);
    expect(slot.current).toBe(day1);
    expect(slot.queued).toEqual([day2]);
  });

  it("takes the slot from a resolved card — live work outranks a receipt", () => {
    const resolved = { ...day1, status: "done" as CardStatus };
    const slot = admitProposal({ current: resolved, queued: [] }, day2);
    expect(slot.current).toBe(day2);
  });

  it("promotes the queued card when the visible one is retired", () => {
    const full = admitProposal({ current: day1, queued: [] }, day2);
    const after = releaseProposal(full);
    expect(after.current).toBe(day2);
    expect(after.queued).toEqual([]);
  });

  it("empties the slot when nothing is waiting", () => {
    const after = releaseProposal({ current: day1, queued: [] });
    expect(after.current).toBeNull();
    expect(after.queued).toEqual([]);
  });

  it("drains a three-card queue in order", () => {
    const day3 = { status: "pending" as CardStatus, preview: "Day 3 — Fermaid-K" };
    let slot = admitProposal({ current: null, queued: [] as typeof day1[] }, day1);
    slot = admitProposal(slot, day2);
    slot = admitProposal(slot, day3);
    expect(slot.current).toBe(day1);
    slot = releaseProposal(slot);
    expect(slot.current).toBe(day2);
    slot = releaseProposal(slot);
    expect(slot.current).toBe(day3);
    slot = releaseProposal(slot);
    expect(slot.current).toBeNull();
  });
});
