import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { proposalGate } from "@/lib/assistant/proposal-card";

// Plan 105. The inline VOICE card had no draft gate at all: it always rendered "Confirm change"
// with an armed button, while useVoiceSession quietly refused to commit a tokenless Draft. So a
// cellar hand — gloves on, three feet from the screen — pressed a live-looking button and got
// nothing, with no explanation anywhere.
//
// The fix is NOT to unify the two cards. They are legitimately different: the text card renders a
// full tasks/warnings/cost/diff table, and this one lives in a ~620px panel that a tablet keyboard
// halves. What they must share is the DECISION about what is committable. This file pins that.
//
// No jsdom in this repo, so the component is asserted as source text — the same technique
// test/ui-primitives.test.ts uses.

const VOICE_CARD = fileURLToPath(
  new URL("../src/app/(app)/assistant/voice/VoiceInlinePanel.tsx", import.meta.url),
);
const TEXT_CARD = fileURLToPath(new URL("../src/app/(app)/assistant/AssistantChat.tsx", import.meta.url));

const voiceSrc = readFileSync(VOICE_CARD, "utf8");
const textSrc = readFileSync(TEXT_CARD, "utf8");

describe("the inline voice card is gated by the same decision as the text card", () => {
  it("both cards call proposalGate — neither re-implements committability", () => {
    expect(voiceSrc).toContain("proposalGate(");
    expect(textSrc).toContain("proposalGate(");
  });

  it("the voice card disables its primary action on the gate, not just on 'applying'", () => {
    expect(voiceSrc).toContain("disabled={!gate.canConfirm || status === \"applying\"}");
  });

  it("the voice card surfaces the gate's reason, so a refusal is never silent", () => {
    expect(voiceSrc).toContain("gate.reason");
  });

  it("the voice card labels a draft as a draft, in words and not only in colour", () => {
    // DESIGN.md: colour is never the only signal.
    expect(voiceSrc).toContain("Draft — blocked");
    expect(voiceSrc).toContain("Draft — needs input");
  });

  it("the voice card receives the draft state it needs to gate on", () => {
    for (const prop of ["token={session.proposal.token}", "draft={session.proposal.draft}", "details={session.proposal.details}"]) {
      expect(voiceSrc, `panel must pass ${prop}`).toContain(prop);
    }
  });

  it("uses border longhand, so a dashed draft edge cannot fight the shorthand", () => {
    // The text card threw a React warning for exactly this on every status change.
    expect(voiceSrc).toContain("borderStyle:");
    expect(voiceSrc).not.toMatch(/border:\s*`1px solid/);
  });

  it("does NOT drag the text card's details table onto a floor-sized panel", () => {
    // The divergence that is deliberate. If this ever fails, someone unified the two cards.
    expect(voiceSrc).not.toContain("WorkOrderProposalDetails");
  });
});

describe("proposalGate is what both cards are trusting", () => {
  it("a Draft with no token cannot be confirmed and says why", () => {
    const gate = proposalGate({ draft: true, details: { unresolved: [{ label: "Assignee", reason: "no email" }] } });
    expect(gate.canConfirm).toBe(false);
    expect(gate.reason).toMatch(/needs one detail/i);
  });

  it("a blocked Draft leads with the blocker, not the missing field", () => {
    const gate = proposalGate({
      draft: true,
      details: {
        unresolved: [{ label: "Assignee", reason: "no email" }],
        warnings: [{ severity: "blocking", code: "same_vessel", message: "source and destination must differ" }],
      },
    });
    expect(gate.canConfirm).toBe(false);
    expect(gate.reason).toMatch(/blocker/i);
  });

  it("a Ready proposal with a token confirms", () => {
    expect(proposalGate({ token: "signed" }).canConfirm).toBe(true);
  });

  it("a missing token is treated as a Draft even without the flag", () => {
    expect(proposalGate({}).canConfirm).toBe(false);
  });
});
