import { describe, expect, it } from "vitest";
import { claimsNoKbCoverage } from "@/lib/assistant/retrieval-overclaim-guard";

describe("claimsNoKbCoverage (Gironde repro 2026-07-28 — denied a source it was just handed)", () => {
  it("catches the exact reported false claims, verbatim", () => {
    expect(
      claimsNoKbCoverage(
        "I don't have anything from the Gironde Chamber of Agriculture (or any Bordeaux/French " +
          "regional source). That's outside what Cellarhand holds.",
      ),
    ).toBe(true);
    expect(
      claimsNoKbCoverage(
        "No — I don't have any information from the Chambre d'Agriculture de la Gironde. That source " +
          "isn't in Cellarhand, and I can't retrieve it.",
      ),
    ).toBe(true);
    expect(
      claimsNoKbCoverage(
        "That one I don't have a sourced answer for. I searched around rootstock/canopy topics and " +
          "nothing in it addresses self-trellising management.",
      ),
    ).toBe(true);
  });

  it("catches each denial shape individually", () => {
    expect(claimsNoKbCoverage("I don't have anything from that publisher.")).toBe(true);
    expect(claimsNoKbCoverage("I don't have any information on that.")).toBe(true);
    expect(claimsNoKbCoverage("I don't have a sourced answer for this.")).toBe(true);
    expect(claimsNoKbCoverage("That source isn't in Cellarhand.")).toBe(true);
    expect(claimsNoKbCoverage("That's outside what Cellarhand holds.")).toBe(true);
    expect(claimsNoKbCoverage("Nothing in it addresses that topic.")).toBe(true);
    expect(claimsNoKbCoverage("Nothing addresses that specific pest.")).toBe(true);
    expect(claimsNoKbCoverage("My knowledge base doesn't cover regional soil chemistry.")).toBe(true);
    expect(claimsNoKbCoverage("I can't give you a sourced recommendation for that region.")).toBe(true);
  });

  it("does NOT fire on the tool's own genuine-gap wording used correctly (no results, honest)", () => {
    // This is rule 6's correct behaviour, and it must remain distinguishable from the bug — the guard
    // is only ever consulted by run.ts when `search_knowledge_base` DID return results this turn, so
    // this sentence alone must not be treated as inherently suspicious.
    expect(
      claimsNoKbCoverage("Nothing in this winery's enabled knowledge sources matches that question."),
    ).toBe(false);
  });

  it("does NOT fire on ordinary answers that cite sources normally", () => {
    expect(
      claimsNoKbCoverage(
        "AWRI (tier 1, 2022) recommends racking off gross lees within two weeks. " +
          "[AWRI: Racking guidance](/kb/source/abc123)",
      ),
    ).toBe(false);
  });

  it("does NOT fire on a legitimate legality refusal (a different, correct kind of decline)", () => {
    expect(
      claimsNoKbCoverage(
        "I cannot confirm what is legally permitted here — check the current product label and your " +
          "registration records. Multi-site protectants like captan provide additional coverage for " +
          "black rot.",
      ),
    ).toBe(false);
  });

  it("does NOT fire when the passage genuinely doesn't answer a NARROWER, hedged question", () => {
    // Hedged uncertainty ("didn't find anything SPECIFICALLY about X") is not the same claim as an
    // absolute denial, and must not trip the guard — that would punish an honest, nuanced answer.
    expect(
      claimsNoKbCoverage(
        "I didn't find anything specifically about that exact technique, though related canopy " +
          "management principles may still apply.",
      ),
    ).toBe(false);
  });

  it("scopes per sentence — an unrelated hedge elsewhere does not immunize a real denial", () => {
    expect(
      claimsNoKbCoverage(
        "I can't verify the exact vintage from here. I don't have anything from that publisher on this topic.",
      ),
    ).toBe(true);
  });
});
