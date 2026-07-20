import { describe, it, expect } from "vitest";
import { mentionsOffTopic } from "../scripts/kb-eval-match";

// Plan 084. The knowledge-base eval gate asserts that a beer or coffee question surfaces nothing
// on-topic. That check used a raw substring match, which is not evidence of what it claims and gets
// worse as the corpus grows. Adding Cornell made it concrete: 4 of 8 sampled Cornell grape PDFs
// "contain ipa" via principally / anticipated / riparia. Every real example below is from that corpus.
describe("off-topic matching for KB rejection cases", () => {
  const BEER = ["ipa", "hops", "dry hop"];
  const COFFEE = ["espresso", "grind", "coffee"];

  it("matches a genuine off-topic mention", () => {
    expect(mentionsOffTopic("Dry hop the IPA after primary fermentation.", BEER)).toBe("ipa");
    expect(mentionsOffTopic("Use a finer espresso grind.", COFFEE)).toBe("espresso");
  });

  it("does NOT match ipa inside ordinary words", () => {
    for (const s of [
      "Powdery mildew is principally a problem in warm seasons.",
      "Growers anticipated an early bud break.",
      "The principal cultivars in the region are hybrids.",
      "Vitis riparia is a native American grape species.",
    ]) {
      expect(mentionsOffTopic(s, BEER), s).toBeNull();
    }
  });

  it("does NOT match hops inside workshops", () => {
    expect(mentionsOffTopic("Extension workshops will be held in March.", BEER)).toBeNull();
  });

  it("does NOT match grind inside grinding or regrind", () => {
    expect(mentionsOffTopic("Grinding the pruned canes returns organic matter to the soil.", COFFEE)).toBeNull();
  });

  it("still matches the real word when it appears alongside near-misses", () => {
    expect(
      mentionsOffTopic("Growers anticipated the workshop, then brewed an IPA.", BEER),
    ).toBe("ipa");
  });

  it("is case-insensitive and handles multi-word terms", () => {
    expect(mentionsOffTopic("We DRY HOP for aroma.", BEER)).toBe("dry hop");
    expect(mentionsOffTopic("Hops were added at the boil.", BEER)).toBe("hops");
  });

  it("returns null for empty input and empty term lists", () => {
    expect(mentionsOffTopic("", BEER)).toBeNull();
    expect(mentionsOffTopic("anything at all", [])).toBeNull();
  });

  it("does not blow up on regex metacharacters in a term", () => {
    // Terms are escaped, so metacharacters are treated literally and cannot corrupt the pattern.
    expect(() => mentionsOffTopic("some text", ["c++", "a.b", "(x)"])).not.toThrow();
    // A dot is a word-internal character, so a term like "a.b" still boundary-matches normally.
    expect(mentionsOffTopic("the a.b value", ["a.b"])).toBe("a.b");
    // Documented limitation: a term ENDING in a non-word character (c++) can never satisfy a trailing
    // \b, so it silently never matches. No off-topic term has that shape, and the failure direction is
    // safe (a missed rejection term makes the gate stricter to satisfy, not looser). Asserted so the
    // behavior is a known choice rather than a surprise if someone adds such a term later.
    expect(mentionsOffTopic("we use c++ here", ["c++"])).toBeNull();
  });
});
