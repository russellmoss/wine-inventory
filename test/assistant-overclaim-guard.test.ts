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
});
