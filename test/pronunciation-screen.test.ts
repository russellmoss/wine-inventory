import { describe, it, expect } from "vitest";
import {
  carrierSentence,
  normalizeHeard,
  summarize,
  termSurvived,
} from "../scripts/screen-pronunciation-match";

describe("normalizeHeard", () => {
  it("folds accents, case and punctuation", () => {
    expect(normalizeHeard('The next word is "Mourvèdre," ok?')).toBe(
      "the next word is mourvedre ok",
    );
  });
});

describe("termSurvived", () => {
  it("accepts an exact hit", () => {
    expect(termSurvived("Syrah", "The next word is Syrah, followed by a pause.")).toBe(true);
  });

  it("accepts an accent-only difference", () => {
    expect(termSurvived("Mourvèdre", "the next word is Mourvedre")).toBe(true);
  });

  it("rejects a genuinely different word", () => {
    expect(termSurvived("veraison", "The next word is verizon, followed by a pause")).toBe(false);
    expect(termSurvived("Mourvèdre", "The next word is Morvedra.")).toBe(false);
  });

  it("accepts a multi-word term split across punctuation", () => {
    expect(termSurvived("Saccharomyces cerevisiae", "heard Saccharomyces, cerevisiae here")).toBe(
      true,
    );
  });

  it("tolerates a light suffix difference rather than crying mispronunciation", () => {
    expect(termSurvived("Brettanomyces", "we found Brettanomyce here")).toBe(true);
  });

  it("treats an empty term as survived rather than failing open into noise", () => {
    expect(termSurvived("", "anything")).toBe(true);
  });
});

describe("carrierSentence", () => {
  // The wine carrier hands Scribe the domain prior that repairs the very
  // mispronunciation the screen is trying to detect. Documented in the audit.
  it("wine carrier supplies domain context", () => {
    expect(carrierSentence("Syrah", "wine")).toContain("winemaker");
  });

  it("neutral carrier keeps sentence prosody without domain context", () => {
    const s = carrierSentence("Syrah", "neutral");
    expect(s).toContain("Syrah");
    expect(s).not.toContain("winemaker");
    expect(s).not.toContain("tasting");
  });

  it("bare carrier is the term alone", () => {
    expect(carrierSentence("Syrah", "bare")).toBe("Syrah");
  });
});

describe("summarize", () => {
  it("splits verdicts and computes a failure rate", () => {
    const s = summarize([
      { term: "a", transcript: "a", survived: true },
      { term: "b", transcript: "x", survived: false },
    ]);
    expect(s.failed).toHaveLength(1);
    expect(s.passed).toHaveLength(1);
    expect(s.failureRate).toBe(0.5);
  });

  it("reports a zero rate for an empty run rather than dividing by zero", () => {
    expect(summarize([]).failureRate).toBe(0);
  });
});
