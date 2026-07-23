import { describe, it, expect } from "vitest";
import {
  applyLexicon,
  buildTermSource,
  compileLexicon,
  foldDiacritics,
  isPatternRule,
  isPhonemeRule,
  LEXICON,
  phonemeTag,
  type LexiconRule,
} from "@/lib/voice/lexicon";

// The machinery is tested against LOCAL rule tables so these stay meaningful no
// matter what the shipped LEXICON currently holds. The shipped table gets its own
// structural guards at the bottom.
const TERMS: LexiconRule[] = [
  { term: "Syrah", spoken: "see-rah" },
  { term: "Cabernet", spoken: "cab-er-nay" },
  { term: "Cabernet Sauvignon", spoken: "cab-er-nay so-vin-yon" },
  { term: "Gewürztraminer", spoken: "guh-voorts-trah-mee-ner" },
  { term: "Mourvèdre", spoken: "moor-ved-ruh" },
  { term: "Saccharomyces cerevisiae", spoken: "sack-uh-roh-my-seez sair-uh-vis-ee-eye" },
];

describe("foldDiacritics", () => {
  it("strips combining marks down to base letters", () => {
    expect(foldDiacritics("Mourvèdre")).toBe("Mourvedre");
    expect(foldDiacritics("Gewürztraminer")).toBe("Gewurztraminer");
    expect(foldDiacritics("bâtonnage")).toBe("batonnage");
  });

  it("leaves unaccented text alone", () => {
    expect(foldDiacritics("Syrah")).toBe("Syrah");
  });
});

describe("applyLexicon", () => {
  it("substitutes a single term", () => {
    expect(applyLexicon("We picked Syrah today.", TERMS)).toBe("We picked see-rah today.");
  });

  it("is case-insensitive", () => {
    expect(applyLexicon("SYRAH and syrah", TERMS)).toBe("see-rah and see-rah");
  });

  // The reason alternatives are sorted longest-first. Get this wrong and the two-word
  // varietal degrades into "cab-er-nay Sauvignon", which is worse than doing nothing.
  it("prefers the longest match", () => {
    expect(applyLexicon("A Cabernet Sauvignon block", TERMS)).toBe(
      "A cab-er-nay so-vin-yon block",
    );
  });

  it("still matches the short term when the long one is absent", () => {
    expect(applyLexicon("A Cabernet Franc block", TERMS)).toBe("A cab-er-nay Franc block");
  });

  it("matches an accented term written without its accents", () => {
    expect(applyLexicon("Some Gewurztraminer", TERMS)).toBe("Some guh-voorts-trah-mee-ner");
    expect(applyLexicon("Some Mourvedre", TERMS)).toBe("Some moor-ved-ruh");
  });

  it("matches an accented term written with its accents", () => {
    expect(applyLexicon("Some Gewürztraminer", TERMS)).toBe("Some guh-voorts-trah-mee-ner");
    expect(applyLexicon("Some Mourvèdre", TERMS)).toBe("Some moor-ved-ruh");
  });

  it("tolerates irregular whitespace inside a multi-word term", () => {
    expect(applyLexicon("Saccharomyces  cerevisiae", TERMS)).toBe(
      "sack-uh-roh-my-seez sair-uh-vis-ee-eye",
    );
  });

  it("does not match inside a longer word", () => {
    expect(applyLexicon("Syrahs and Syrahesque", TERMS)).toBe("Syrahs and Syrahesque");
    expect(applyLexicon("preCabernet", TERMS)).toBe("preCabernet");
  });

  it("does not match across a digit boundary", () => {
    expect(applyLexicon("Syrah2026", TERMS)).toBe("Syrah2026");
  });

  it("leaves text with no known terms untouched", () => {
    expect(applyLexicon("The tank is full.", TERMS)).toBe("The tank is full.");
  });

  it("is a no-op with an empty rule table", () => {
    expect(applyLexicon("Syrah stays put.", [])).toBe("Syrah stays put.");
  });

  it("replaces every occurrence, not just the first", () => {
    expect(applyLexicon("Syrah, then more Syrah.", TERMS)).toBe("see-rah, then more see-rah.");
  });
});

// toSpeakable runs TWICE on every spoken sentence — once on the client before the
// POST, once in the speak route as defense in depth. A rule that fires again on its
// own output garbles speech in production and never shows up in a single-pass test.
describe("idempotency", () => {
  const samples = [
    "We picked Syrah today.",
    "A Cabernet Sauvignon block next to the Cabernet.",
    "Gewürztraminer, Mourvèdre, and Saccharomyces cerevisiae.",
    "SYRAH syrah Syrah",
  ];

  it("applying twice equals applying once", () => {
    for (const sample of samples) {
      const once = applyLexicon(sample, TERMS);
      expect(applyLexicon(once, TERMS)).toBe(once);
    }
  });

  it("holds for a sentence containing every term at once", () => {
    const everything = TERMS.filter((r) => !isPatternRule(r))
      .map((r) => (r as { term: string }).term)
      .join(", ");
    const once = applyLexicon(everything, TERMS);
    expect(applyLexicon(once, TERMS)).toBe(once);
  });
});

// The structural invariant behind idempotency: no rule may produce text that another
// rule (or itself) would match. This is what keeps the table safe to extend later by
// someone who has not read the plan.
describe("no-cascade guard", () => {
  // Stated as "re-applying the lexicon to a rule's own output changes nothing", rather
  // than "the output matches no pattern". The stricter-sounding version is WRONG for
  // phoneme rules: a rendered tag necessarily contains the word it wraps, and it is the
  // tag guard, not the absence of a match, that stops it nesting. An earlier version of
  // this read `rule.spoken`, which is undefined on a phoneme rule, so it tested the
  // literal string "undefined" and passed without checking anything.
  function assertNoCascade(rules: LexiconRule[]) {
    if (!compileLexicon(rules)) return;
    for (const rule of rules) {
      if (isPatternRule(rule)) continue;
      const output = isPhonemeRule(rule) ? phonemeTag(rule) : rule.spoken;
      expect(
        applyLexicon(output, rules),
        `rule "${rule.term}" -> "${output}" is rewritten again on a second pass; it cascades`,
      ).toBe(output);
    }
  }

  it("holds for the test table", () => {
    assertNoCascade(TERMS);
  });

  it("holds for the SHIPPED table", () => {
    assertNoCascade(LEXICON);
  });

  it("catches a table that does cascade", () => {
    const bad: LexiconRule[] = [
      { term: "Syrah", spoken: "Shiraz" },
      { term: "Shiraz", spoken: "shee-raz" },
    ];
    expect(() => assertNoCascade(bad)).toThrow();
  });
});

describe("pattern rules", () => {
  const CODES: LexiconRule[] = [
    {
      pattern: "T(?:\\d{1,3})\\b",
      label: "test-vessel",
      example: "T7",
      spoken: (m) => `tank ${m.slice(1)}`,
    },
  ];

  it("applies a pattern rule using the matched text", () => {
    expect(applyLexicon("Move it to T7 now.", CODES)).toBe("Move it to tank 7 now.");
  });

  it("rejects a capturing group at compile time", () => {
    const bad: LexiconRule[] = [
      { pattern: "T(\\d+)", label: "bad", example: "T7", spoken: (m) => m },
    ];
    expect(() => compileLexicon(bad)).toThrow(/capturing group/);
  });

  it("accepts a non-capturing group", () => {
    expect(() => compileLexicon(CODES)).not.toThrow();
  });
});

describe("buildTermSource", () => {
  it("escapes regex metacharacters in a term", () => {
    const source = buildTermSource("A+B");
    expect(() => new RegExp(source, "u")).not.toThrow();
    expect(new RegExp(source, "iu").test("A+B")).toBe(true);
    expect(new RegExp(source, "iu").test("AAB")).toBe(false);
  });

  it("expands accentable letters into character classes", () => {
    expect(buildTermSource("cafe")).toContain("[eèéêë]");
  });
});

// These pin the SHIPPED table. Every phoneme entry first failed as a RESPELLING in the
// 2026-07-23 ear pass — respelling asks the model to guess, a phoneme tag tells it.
describe("shipped lexicon", () => {
  it("emits a phoneme tag for the terms named in ticket #464", () => {
    expect(applyLexicon("We inoculated the Syrah.")).toBe(
      'We inoculated the <phoneme alphabet="cmu-arpabet" ph="S IH0 R AA1">Syrah</phoneme>.',
    );
    expect(applyLexicon("Saccharomyces cerevisiae")).toBe(
      '<phoneme alphabet="cmu-arpabet" ph="S AE2 K ER0 OW0 M AY1 S IY2 Z">Saccharomyces</phoneme>' +
        ' <phoneme alphabet="cmu-arpabet" ph="S EH2 R AH0 V IH1 S IY0 AY2">cerevisiae</phoneme>',
    );
  });

  it("tags each half of a binomial separately", () => {
    const out = applyLexicon("Oenococcus oeni");
    expect(out).toContain('ph="IY2 N OW0 K AA1 K AH0 S">Oenococcus</phoneme>');
    expect(out).toContain('ph="IY1 N IY0">oeni</phoneme>');
  });

  it("keeps EC-1118 as a plain expansion, not a phoneme tag", () => {
    expect(applyLexicon("Pitch EC-1118 tomorrow.")).toBe("Pitch E C eleven eighteen tomorrow.");
  });

  it("tags Gewürztraminer whether or not the umlaut is present", () => {
    const withUmlaut = applyLexicon("Gewürztraminer");
    const without = applyLexicon("Gewurztraminer");
    expect(withUmlaut).toContain('ph="G AH0 V ER1 T S T R AH0 M IY2 N ER0"');
    expect(without).toContain('ph="G AH0 V ER1 T S T R AH0 M IY2 N ER0"');
  });

  // The ear pass said these are ALREADY correct. Their ABSENCE is the assertion.
  it("leaves alone the words the ear pass judged fine", () => {
    for (const ok of [
      "Viognier", "Mourvèdre", "Riesling", "veraison",
      "Merlot", "Brix", "potassium", "Lalvin", "Amorim",
    ]) {
      expect(applyLexicon(ok), `${ok} was judged fine and must not be rewritten`).toBe(ok);
    }
  });
});

// A rendered phoneme tag CONTAINS the word it wraps, so a naive second pass would match
// that inner text and nest a tag inside itself. toSpeakable runs twice on every spoken
// sentence, so this is not hypothetical.
describe("phoneme tags survive double application", () => {
  const samples = [
    "We inoculated the Syrah.",
    "Saccharomyces cerevisiae and Brettanomyces.",
    "Oenococcus oeni finished the malolactic.",
    "Add metabisulfite, then pitch EC-1118.",
    "Gewürztraminer, Sangiovese, Erbslöh.",
  ];

  it("applying twice equals applying once", () => {
    for (const s of samples) {
      const once = applyLexicon(s);
      expect(applyLexicon(once), `nested tag for: ${s}`).toBe(once);
    }
  });

  it("never nests a phoneme tag inside another", () => {
    for (const s of samples) {
      const twice = applyLexicon(applyLexicon(s));
      expect(twice).not.toMatch(/<phoneme[^>]*>[^<]*<phoneme/);
    }
  });

  it("leaves a hand-written phoneme tag untouched", () => {
    const already = '<phoneme alphabet="cmu-arpabet" ph="S IH0 R AA1">Syrah</phoneme>';
    expect(applyLexicon(already)).toBe(already);
  });
});

// Re-cuts after the v3 listen. Both exist because a phoneme rule can be RIGHT and still
// be WRONG for the audience.
describe("v3 re-cuts", () => {
  // The first Sangiovese was the correct Italian pronunciation. Correct, and wrong: an
  // American cellar says "san-gee-oh-vay-say". The IY0 makes the "gee"; the ending is an
  // S, not a Z.
  it("says Sangiovese the American way, not the Italian way", () => {
    const out = applyLexicon("Sangiovese");
    expect(out).toContain('ph="S AE2 N JH IY0 OW0 V EY1 S EY0"');
    expect(out).not.toContain("JH OW0 V EY1 Z EY0");
  });

  // bâtonnage had NO rule and was judged fine on eleven_flash_v2_5. Moving to flash_v2
  // for phoneme support re-rolled every word in the vocabulary, and this one regressed.
  it("tags bâtonnage, a regression caused by the model switch", () => {
    const out = applyLexicon("We began bâtonnage.");
    expect(out).toContain('ph="B AE2 T OW0 N AA1 ZH"');
  });

  it("matches bâtonnage with or without the circumflex", () => {
    expect(applyLexicon("batonnage")).toContain('ph="B AE2 T OW0 N AA1 ZH"');
    expect(applyLexicon("bâtonnage")).toContain('ph="B AE2 T OW0 N AA1 ZH"');
  });
});
