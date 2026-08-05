import { describe, expect, it } from "vitest";
import {
  claimsUnverifiedWriteFailure,
  UNVERIFIED_CLIENT_STATE_CAVEAT,
} from "@/lib/assistant/unverified-failure-guard";

// Feedback cmsgbjgov000fl704f36c47p7 (Demo Winery, 2026-08-05) — the assistant told the user
// "nothing got saved" while all SEVEN write proposals from that session had committed (work orders
// #80-#83, WineSku "Ojai 2026 Syrah", EquipmentAsset "Main Bottling Line", and the ticket itself),
// proven by the assistant_confirmation nonce burns. The mirror image of overclaim-guard.ts.

const NO_EVIDENCE = { cardShown: false, observedFailure: false };
const CARD_SHOWN = { cardShown: true, observedFailure: false };
const REAL_FAILURE = { cardShown: true, observedFailure: true };

describe("claimsUnverifiedWriteFailure (feedback cmsgbjgov — under-claimed write backstop)", () => {
  it("catches the exact reported false claim, verbatim", () => {
    const real =
      "That's a display problem on our end (the tool ran and returned the preview, but the card " +
      "isn't rendering for you), so nothing got saved.";
    expect(claimsUnverifiedWriteFailure(real, CARD_SHOWN)).toBe(true);
    // A card was in fact emitted that run, but the sentence is unfounded either way — the model
    // cannot see the client, so it must fire even with no proposal to contradict it.
    expect(claimsUnverifiedWriteFailure(real, NO_EVIDENCE)).toBe(true);
  });

  it("catches client-state claims with NO evidence tier at all — the model is never in the browser", () => {
    expect(claimsUnverifiedWriteFailure("That's a rendering issue.", NO_EVIDENCE)).toBe(true);
    expect(claimsUnverifiedWriteFailure("Sounds like a UI bug.", NO_EVIDENCE)).toBe(true);
    expect(claimsUnverifiedWriteFailure("It's a front-end glitch.", NO_EVIDENCE)).toBe(true);
    expect(claimsUnverifiedWriteFailure("The card isn't rendering for you.", NO_EVIDENCE)).toBe(true);
    expect(claimsUnverifiedWriteFailure("The preview never displayed.", NO_EVIDENCE)).toBe(true);
    expect(claimsUnverifiedWriteFailure("No confirmation card rendered.", NO_EVIDENCE)).toBe(true);
  });

  it("catches non-persistence claims ONLY when a card was actually shown (self-contradiction)", () => {
    const claims = [
      "Nothing got saved.",
      "Nothing was actually created.",
      "The work order didn't save.",
      "It never went through.",
      "The change wasn't persisted.",
      "You'll need to redo them all.",
      "You'll have to re-enter that.",
    ];
    for (const c of claims) {
      expect(claimsUnverifiedWriteFailure(c, CARD_SHOWN), c).toBe(true);
      // With no card emitted, "nothing was saved" is usually TRUE — and is what OVERCLAIM_CORRECTION
      // itself says. Flagging it there would make the two guards contradict each other.
      expect(claimsUnverifiedWriteFailure(c, NO_EVIDENCE), c).toBe(false);
    }
  });

  it("stands down entirely when the run observed a real failure", () => {
    // A tool returned is_error. Relaying that is the model doing its job, not fabricating.
    expect(
      claimsUnverifiedWriteFailure("Nothing got saved — the tool errored out.", REAL_FAILURE),
    ).toBe(false);
    expect(
      claimsUnverifiedWriteFailure("That's a rendering issue on our end.", REAL_FAILURE),
    ).toBe(false);
  });

  it("does NOT fire on the honest not-yet-attempted phrasing", () => {
    expect(claimsUnverifiedWriteFailure("I haven't saved anything yet.", CARD_SHOWN)).toBe(false);
    expect(
      claimsUnverifiedWriteFailure("Nothing has been saved yet — confirm the card.", CARD_SHOWN),
    ).toBe(false);
  });

  it("does NOT fire on the confirmation contract, which is literally true of a pending card", () => {
    expect(
      claimsUnverifiedWriteFailure("Nothing is saved until you confirm the card.", CARD_SHOWN),
    ).toBe(false);
    expect(
      claimsUnverifiedWriteFailure("It won't be written unless you tap Confirm.", CARD_SHOWN),
    ).toBe(false);
  });

  it("does NOT fire when the reply EXPLAINS the confirmation contract, even in another sentence", () => {
    // Found by the golden eval, not by hand. `cardShown` does not mean anything persisted — a card is
    // a proposal, and the commit is an out-of-band POST the run loop never sees — so "nothing was
    // saved" is TRUE of every pending card. The tier is only sound against a reply that asserts it
    // WITHOUT explaining why. Whole-text, because the claim and its justification are different
    // sentences and the per-sentence split separates them.
    const real =
      "I can't see your screen, so I can't tell whether the card rendered — but I can tell you nothing " +
      "was saved. A work-order card is only a preview; it doesn't create anything until you confirm it.";
    expect(claimsUnverifiedWriteFailure(real, CARD_SHOWN)).toBe(false);
    expect(
      claimsUnverifiedWriteFailure("Nothing was saved. It isn't written until you confirm.", CARD_SHOWN),
    ).toBe(false);
    // ...but the bare assertion, with no contract explained anywhere, still fires.
    expect(claimsUnverifiedWriteFailure("Nothing was saved.", CARD_SHOWN)).toBe(true);
  });

  it("keeps the client-state tier unsuppressible — no wording grants sight of the browser", () => {
    // The contract suppressor must NOT rescue a screen diagnosis. Explaining how confirmation works
    // says nothing about whether a card rendered, and that tier is the one the live ticket tripped.
    expect(
      claimsUnverifiedWriteFailure(
        "That's a display problem on our end. Nothing is written until you confirm anyway.",
        CARD_SHOWN,
      ),
    ).toBe(true);
  });

  it("does NOT fire on questions, conditionals, or offers to check", () => {
    expect(claimsUnverifiedWriteFailure("Did the card not appear?", CARD_SHOWN)).toBe(false);
    expect(
      claimsUnverifiedWriteFailure("If the card didn't appear, try reloading the page.", CARD_SHOWN),
    ).toBe(false);
    expect(
      claimsUnverifiedWriteFailure("Want me to check whether that work order exists?", CARD_SHOWN),
    ).toBe(false);
  });

  it("does NOT fire when the claim is ATTRIBUTED — that is the wording the prompt asks for", () => {
    // Relaying what the user observed is not a claim about what the model can see. Correcting it
    // would punish exactly the phrasing the system prompt and the file_feedback description request.
    expect(
      claimsUnverifiedWriteFailure("The user reports the card did not appear on their screen.", NO_EVIDENCE),
    ).toBe(false);
    expect(
      claimsUnverifiedWriteFailure("You said the confirmation card never displayed.", NO_EVIDENCE),
    ).toBe(false);
    expect(
      claimsUnverifiedWriteFailure("According to your message it's a display problem.", NO_EVIDENCE),
    ).toBe(false);
    // ...but the assistant's OWN diagnosis in the next sentence still gets caught.
    expect(
      claimsUnverifiedWriteFailure(
        "The user reports the card did not appear. That's a rendering issue.",
        NO_EVIDENCE,
      ),
    ).toBe(true);
  });

  it("does NOT fire on a tool-reported blocker, which is a legitimate thing to relay", () => {
    // "I couldn't create it" is deliberately absent from the claim set — a blocker on a draft card is
    // the correct outcome to report, and the draft card itself makes `cardShown` true.
    expect(
      claimsUnverifiedWriteFailure(
        "I couldn't create the work order — the draft card lists what it still needs.",
        CARD_SHOWN,
      ),
    ).toBe(false);
    expect(
      claimsUnverifiedWriteFailure("The vessel is inactive, so the card is blocked.", CARD_SHOWN),
    ).toBe(false);
  });

  it("does NOT fire on ordinary read answers", () => {
    expect(
      claimsUnverifiedWriteFailure("Tank T4 holds 8,300 L across two lots.", CARD_SHOWN),
    ).toBe(false);
    expect(
      claimsUnverifiedWriteFailure("The latest Brix for Block 3 is 24.2, recorded 2026-09-15.", CARD_SHOWN),
    ).toBe(false);
  });

  it("does NOT fire on the sibling guards' own corrections (they must never contradict each other)", async () => {
    const { OVERCLAIM_CORRECTION } = await import("@/lib/assistant/overclaim-guard");
    const { KB_DENIAL_CORRECTION } = await import("@/lib/assistant/retrieval-overclaim-guard");
    expect(claimsUnverifiedWriteFailure(OVERCLAIM_CORRECTION, NO_EVIDENCE)).toBe(false);
    expect(claimsUnverifiedWriteFailure(KB_DENIAL_CORRECTION, NO_EVIDENCE)).toBe(false);
    // ...and never on its own correction either, which would loop a run into apologising twice.
    const { UNVERIFIED_FAILURE_CORRECTION } = await import("@/lib/assistant/unverified-failure-guard");
    expect(claimsUnverifiedWriteFailure(UNVERIFIED_FAILURE_CORRECTION, CARD_SHOWN)).toBe(false);
  });

  it("scopes per sentence — an honest hedge elsewhere does not immunize a flat false diagnosis", () => {
    expect(
      claimsUnverifiedWriteFailure(
        "I can't confirm his email from here. That's a display problem on our end.",
        NO_EVIDENCE,
      ),
    ).toBe(true);
  });

  it("matches typographic apostrophes as well as straight ones", () => {
    expect(claimsUnverifiedWriteFailure("The card isn’t rendering.", NO_EVIDENCE)).toBe(true);
    expect(claimsUnverifiedWriteFailure("The record didn’t save.", CARD_SHOWN)).toBe(true);
  });
});

describe("UNVERIFIED_CLIENT_STATE_CAVEAT", () => {
  it("names the claim as unverified rather than contradicting it", () => {
    // Triage must be told to check first — not told the report is wrong (it might not be).
    expect(UNVERIFIED_CLIENT_STATE_CAVEAT).toMatch(/UNVERIFIED/);
    expect(UNVERIFIED_CLIENT_STATE_CAVEAT).toMatch(/cannot observe the user's screen/);
  });
});
