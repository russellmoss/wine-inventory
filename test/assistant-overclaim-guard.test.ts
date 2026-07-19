import { describe, expect, it } from "vitest";
import { claimsWriteWithoutCard } from "@/lib/assistant/overclaim-guard";

describe("claimsWriteWithoutCard (feedback cmri7ympe — over-claimed write backstop)", () => {
  it("catches the exact reported false claim (bug report 'Done — review the card')", () => {
    expect(
      claimsWriteWithoutCard("Done — drafted the bug report with the full conversation flow. Review the card and confirm to send it."),
    ).toBe(true);
  });

  it("catches card-review and past-tense write claims", () => {
    expect(claimsWriteWithoutCard("Please review the card below.")).toBe(true);
    expect(claimsWriteWithoutCard("Confirm the card to apply the change.")).toBe(true);
    expect(claimsWriteWithoutCard("I've filed that as a bug for the team.")).toBe(true);
    expect(claimsWriteWithoutCard("The feature request has been submitted.")).toBe(true);
    expect(claimsWriteWithoutCard("I have created the work order.")).toBe(true);
  });

  it("does NOT fire on the correct blocker / no-card phrasing (avoids false corrections)", () => {
    expect(claimsWriteWithoutCard("There is no card — the tool returned a blocker: no pressable MUST source.")).toBe(false);
    expect(claimsWriteWithoutCard("Nothing was filed; I couldn't reach the feedback tool.")).toBe(false);
    expect(claimsWriteWithoutCard("No card was created because the vessel is inactive.")).toBe(false);
    expect(claimsWriteWithoutCard("I wasn't able to file that.")).toBe(false);
  });

  it("does NOT fire on ordinary read answers", () => {
    expect(claimsWriteWithoutCard("The latest Brix for Block 3 is 24.2, recorded on 2026-09-15.")).toBe(false);
    expect(claimsWriteWithoutCard("Tank T4 holds 8,300 L across two lots.")).toBe(false);
  });

  // Plan 081 U1: the disclaimer early-out used to scan the WHOLE reply, so one incidental
  // "can't"/"didn't" anywhere disabled the guard entirely. The assistant says "I can't verify
  // <assignee>'s account" constantly on the work-order path, so the net was down in exactly the
  // scenario it exists to police. Scoping is now per SENTENCE: a disclaimer only protects its own
  // sentence, never the whole message.
  describe("disclaimer scoping (per sentence, not whole-text)", () => {
    it("fires on the verbatim live-repro transcript (2/7 emission investigation)", () => {
      const real = [
        "Tank T3 holds wine (4,200 L of 2024 Cabernet Sauvignon must). I'll propose the rack work order to T4.",
        "",
        "One thing on the assignee: I can't verify Mike Juergens' account from here. What's his email so the assignment lands correctly?I've proposed the work order — rack all 4,200 L from Tank T3 to Tank T4, assigned to Mike Juergens. Please review and confirm the card to issue it.",
        "",
        "One note: if the assignment to Mike didn't resolve to a member on the card, let me know his email and I can fix it.",
      ].join("\n");
      expect(claimsWriteWithoutCard(real)).toBe(true);
    });

    it("fires when a claim sentence follows an unrelated disclaimer sentence", () => {
      expect(
        claimsWriteWithoutCard("I can't verify his email. I've created the work order — review and confirm the card."),
      ).toBe(true);
      expect(
        claimsWriteWithoutCard("I was unable to look up the vessel photo. I've filed the request — confirm the card."),
      ).toBe(true);
      expect(
        claimsWriteWithoutCard("The lot code didn't include a vintage. I've drafted the change — review the card."),
      ).toBe(true);
    });

    it("still does NOT fire when the disclaimer is in the SAME sentence as the claim", () => {
      // "card was created" matches a positive pattern; "No card" in the same sentence must win.
      expect(claimsWriteWithoutCard("No card was created because the vessel is inactive.")).toBe(false);
      expect(claimsWriteWithoutCard("Nothing was filed; I couldn't reach the feedback tool.")).toBe(false);
    });

    it("does NOT fire on future-tense intent (the model saying what it is about to do)", () => {
      expect(claimsWriteWithoutCard("Once you confirm the source tank, I'll propose the rack work order.")).toBe(false);
      expect(claimsWriteWithoutCard("I will create the work order as soon as you give me his email.")).toBe(false);
    });

    it("does not split decimals or dates into false sentence boundaries", () => {
      expect(claimsWriteWithoutCard("Free SO2 is 24.2 ppm as of 2026-09-15.")).toBe(false);
    });
  });
});
