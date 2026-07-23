import { describe, it, expect } from "vitest";
import {
  applyLexicon,
  buildTermSource,
  compileLexicon,
  foldDiacritics,
  isPatternRule,
  LEXICON,
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
  function assertNoCascade(rules: LexiconRule[]) {
    const compiled = compileLexicon(rules);
    if (!compiled) return;
    for (const rule of rules) {
      if (isPatternRule(rule)) continue;
      const output = rule.spoken;
      const fresh = new RegExp(compiled.regex.source, "giu");
      expect(
        fresh.test(output),
        `rule "${rule.term}" -> "${output}" matches another rule; it will cascade`,
      ).toBe(false);
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

// These pin the SHIPPED table's content, not the machinery. Every entry got here by
// failing Russell's listening pass on 2026-07-23 — see the audit doc.
describe("shipped lexicon", () => {
  it("covers both terms named in ticket #464", () => {
    expect(applyLexicon("We inoculated the Syrah.")).toBe("We inoculated the see-rah.");
    expect(applyLexicon("It is Saccharomyces cerevisiae.")).toBe(
      "It is sack-a-roh-my-seez sair-uh-vizz-ee-eye.",
    );
  });

  it("prefers the binomial over the bare genus", () => {
    expect(applyLexicon("Saccharomyces cerevisiae")).toBe("sack-a-roh-my-seez sair-uh-vizz-ee-eye");
    expect(applyLexicon("Saccharomyces")).toBe("sack-a-roh-my-seez");
    expect(applyLexicon("Oenococcus oeni")).toBe("ee-noh-kok-us ee-nee");
    expect(applyLexicon("Oenococcus")).toBe("ee-noh-kok-us");
  });

  it("says EC-1118 the way the industry says it", () => {
    expect(applyLexicon("Pitch EC-1118 tomorrow.")).toBe("Pitch E C eleven eighteen tomorrow.");
  });

  it("matches Gewürztraminer with or without the umlaut", () => {
    expect(applyLexicon("Gewürztraminer")).toBe("guh-verts-trah-mee-ner");
    expect(applyLexicon("Gewurztraminer")).toBe("guh-verts-trah-mee-ner");
  });

  it("prefers the two-word additive over the bare one", () => {
    expect(applyLexicon("Add potassium metabisulfite.")).toBe(
      "Add puh-tass-ee-um met-a-by-sul-fite.",
    );
    expect(applyLexicon("Add metabisulfite.")).toBe("Add met-a-by-sul-fite.");
  });

  // The ear pass said these are ALREADY correct. A rule on a word that is already right
  // can only move it in one direction, so their ABSENCE is the assertion.
  it("leaves alone the words the ear pass judged fine", () => {
    for (const ok of ["Viognier", "Mourvèdre", "Riesling", "veraison", "bâtonnage", "Merlot", "Brix"]) {
      expect(applyLexicon(ok), `${ok} was judged fine and must not be rewritten`).toBe(ok);
    }
  });
});
