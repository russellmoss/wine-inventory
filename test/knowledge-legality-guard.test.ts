import { describe, it, expect } from "vitest";
import { classifyLegalityQuery, LEGALITY_NON_CERTIFICATION } from "@/lib/assistant/tools/search-knowledge-base";

/**
 * SKB Unit 3 — the deterministic half of the legality refusal.
 *
 * The prompt half is measured by the golden eval; this measures the layer that survives a future
 * prompt edit. Two properties, and the NEGATIVE set is the one that keeps the guard useful: a caveat
 * that fires on every question trains the user to scroll past it, which is the same failure the
 * currency-warning eval's negative control exists to prevent.
 */

/** Questions that ask whether a product MAY BE APPLIED. Every one of these must draw the refusal. */
const LEGALITY_SHAPED: [string, string][] = [
  ["the tier-B trap from SKB §2 — names no rate, no interval, no regulation", "Can I spray Captan to knock down this black rot?"],
  ["plain permission", "Can I use Abound on my Chardonnay block?"],
  ["first person plural", "Are we allowed to apply mancozeb this close to harvest?"],
  ["explicit legality", "Is it legal to spray Rally in Virginia?"],
  ["registration status", "Is Quintec registered for use on wine grapes?"],
  ["approval, passive phrasing", "Is captan approved for grapes in Pennsylvania?"],
  ["REI", "What is the REI for Abound?"],
  ["restricted entry, spelled out", "What's the restricted-entry interval on Ridomil Gold?"],
  ["PHI", "What is the PHI for mancozeb on grapes?"],
  ["preharvest interval, spelled out", "What is the pre-harvest interval for Vangard?"],
  ["days to harvest", "How many days to harvest after a Captan application?"],
  ["worker re-entry, colloquial", "When can workers go back into the block after spraying?"],
  ["label data", "What is the label rate for Intrepid on grapes?"],
  ["maximum seasonal use", "Have I hit the maximum seasonal use for this product?"],
  ["rotation clearance", "Is my FRAC group 11 rotation still compliant this season?"],
  ["rotation, already used", "Have I already used group 3 too many times this year?"],
  ["a second application of a group", "Can I apply another group 11 spray this month?"],
];

/**
 * Questions the guard must stay OUT OF. These are the corpus's actual job — biology, epidemiology,
 * scouting, cellar chemistry. A caveat here is not harmless; it is caveat fatigue, and it is how the
 * refusal stops being read on the questions that need it.
 */
const NOT_LEGALITY_SHAPED: [string, string][] = [
  ["the phase's headline question", "Why is downy mildew pressure high this week in Virginia?"],
  ["disease cycle", "What is the disease cycle of black rot?"],
  ["scouting method", "How do I scout for powdery mildew early in the season?"],
  ["epidemiology", "What conditions favour Phomopsis infection?"],
  ["cultural practice", "How does canopy management reduce Botrytis?"],
  ["mode of action, explanatory", "What does FRAC group 11 mean for resistance management?"],
  ["cellar chemistry — must NOT draw a pesticide caveat", "How much SO2 should I add to hit 0.8 ppm molecular?"],
  ["a dosing question with a rate word", "What rate of DAP do I need for a stuck ferment?"],
  ["target/threshold", "What is the target YAN for a white must?"],
  ["spoilage", "What is the most effective way to remove Brett aromas?"],
  ["timing, not permission", "When should I start my downy mildew program?"],
  ["a bare product mention", "What is Abound used for?"],
];

describe("legality classifier — the refusal fires on a permission question", () => {
  it.each(LEGALITY_SHAPED)("%s: %s", (_why, q) => {
    const r = classifyLegalityQuery(q);
    expect(r.legalityShaped, `expected a refusal for: ${q}`).toBe(true);
    expect(r.signals.length).toBeGreaterThan(0);
  });
});

describe("legality classifier — it stays out of the corpus's actual job", () => {
  it.each(NOT_LEGALITY_SHAPED)("%s: %s", (_why, q) => {
    const r = classifyLegalityQuery(q);
    expect(r.legalityShaped, `spurious refusal for: ${q}`).toBe(false);
    expect(r.signals).toEqual([]);
  });
});

describe("legality classifier — shape and robustness", () => {
  it("is case- and punctuation-insensitive", () => {
    expect(classifyLegalityQuery("CAN I SPRAY CAPTAN FOR BLACK ROT").legalityShaped).toBe(true);
    expect(classifyLegalityQuery("can i spray captan for black rot?").legalityShaped).toBe(true);
  });

  it("does not throw on degenerate input", () => {
    for (const q of ["", "   ", "?", "a".repeat(20_000)]) {
      expect(() => classifyLegalityQuery(q)).not.toThrow();
    }
    expect(classifyLegalityQuery("").legalityShaped).toBe(false);
  });

  it("names which arm fired, so a run log says WHY it refused", () => {
    expect(classifyLegalityQuery("What is the REI for Abound?").signals).toContain("interval-rei-phi");
    expect(classifyLegalityQuery("Can I spray Captan for black rot?").signals).toContain("permission-to-apply");
  });

  it("the preamble refuses the VERDICT and explicitly preserves the INFORMATION", () => {
    // The whole reframing lives in this string. If someone softens it into a plain refusal, the
    // grower gets silence mid-season and goes to Google or sprays from memory — which is worse than
    // the status quo this unit replaces.
    expect(LEGALITY_NON_CERTIFICATION).toMatch(/DO NOT CERTIFY/);
    expect(LEGALITY_NON_CERTIFICATION).toMatch(/STILL give the agronomic context/);
    expect(LEGALITY_NON_CERTIFICATION).toMatch(/Withhold the VERDICT, not the information/);
    expect(LEGALITY_NON_CERTIFICATION).toMatch(/current product label/i);
  });
});
