import { describe, it, expect } from "vitest";
import {
  extractAccented,
  extractBinomials,
  extractFromChunk,
  extractProperNouns,
  extractScientificTokens,
  looksForeignLanguage,
  rankCandidates,
} from "../scripts/mine-pronunciation-terms";

describe("extractBinomials", () => {
  it("finds a Latin binomial with a scientific genus", () => {
    expect(extractBinomials("We inoculated with Saccharomyces cerevisiae today.")).toContain(
      "Saccharomyces cerevisiae",
    );
  });

  it("finds one via the species epithet when the genus is plain", () => {
    expect(extractBinomials("Rot from Botrytis cinerea was widespread.")).toContain(
      "Botrytis cinerea",
    );
    expect(extractBinomials("The rootstock is Vitis riparia here.")).toContain("Vitis riparia");
  });

  // Without the Latin-morphology requirement this pattern eats ordinary prose, which
  // is how a 12M-token corpus becomes noise instead of a candidate list.
  it("does NOT match ordinary capitalized-word-plus-word prose", () => {
    expect(extractBinomials("The Winery reported good results.")).toHaveLength(0);
    expect(extractBinomials("Before harvest begins")).toHaveLength(0);
  });

  it("rejects a pair whose halves are common words", () => {
    expect(extractBinomials("Their Analysis showed nothing.")).toHaveLength(0);
  });
});

describe("extractAccented", () => {
  it("finds French and German cellar vocabulary", () => {
    expect(extractAccented("We began bâtonnage last week.")).toContain("bâtonnage");
    expect(extractAccented("A Gewürztraminer block.")).toContain("Gewürztraminer");
    expect(extractAccented("Cool-climate Mourvèdre.")).toContain("Mourvèdre");
  });

  it("ignores plain ASCII words", () => {
    expect(extractAccented("The tank is full of Syrah.")).toHaveLength(0);
  });

  it("ignores short accented fragments", () => {
    expect(extractAccented("à la")).toHaveLength(0);
  });
});

describe("extractScientificTokens", () => {
  it("finds -myces, -coccus and -aceae tokens", () => {
    expect(extractScientificTokens("Brettanomyces is a problem.")).toContain("Brettanomyces");
    expect(extractScientificTokens("Oenococcus dominates MLF.")).toContain("Oenococcus");
  });

  it("does not fire on common words that merely end in -ose or -ase", () => {
    const found = extractScientificTokens("Please close the database and choose a purpose.");
    expect(found).toHaveLength(0);
  });
});

describe("extractProperNouns", () => {
  it("finds a mid-sentence capitalized word", () => {
    expect(extractProperNouns("a block of Viognier planted")).toContain("Viognier");
  });

  it("skips the sentence-initial word", () => {
    expect(extractProperNouns("Viognier is planted here.")).not.toContain("Viognier");
  });
});

describe("extractFromChunk", () => {
  it("records every heuristic that fired for a term", () => {
    const found = extractFromChunk("We used Saccharomyces cerevisiae in the Gewürztraminer.");
    expect([...found.keys()]).toContain("Saccharomyces cerevisiae");
    expect(found.get("Gewürztraminer")).toContain("accented");
  });

  it("returns an empty map for prose with no domain vocabulary", () => {
    expect(extractFromChunk("the tank is full").size).toBe(0);
  });
});

describe("rankCandidates", () => {
  // Document frequency, not raw count. An author name repeated forty times inside one
  // paper must not outrank a term used once in each of thirty papers.
  it("ranks by document frequency ahead of raw occurrences", () => {
    const tally = new Map([
      ["Repeated", { docs: new Set(["d1"]), occurrences: 40, reasons: new Set(["proper-noun"]) }],
      ["Widespread", { docs: new Set(["d1", "d2", "d3"]), occurrences: 3, reasons: new Set(["proper-noun"]) }],
    ]);
    const ranked = rankCandidates(tally);
    expect(ranked[0].term).toBe("Widespread");
    expect(ranked[0].docFrequency).toBe(3);
    expect(ranked[1].term).toBe("Repeated");
  });

  it("breaks ties on occurrences, then alphabetically", () => {
    const tally = new Map([
      ["Beta", { docs: new Set(["d1"]), occurrences: 1, reasons: new Set(["a"]) }],
      ["Alpha", { docs: new Set(["d1"]), occurrences: 1, reasons: new Set(["a"]) }],
      ["Gamma", { docs: new Set(["d1"]), occurrences: 5, reasons: new Set(["a"]) }],
    ]);
    const ranked = rankCandidates(tally);
    expect(ranked.map((c) => c.term)).toEqual(["Gamma", "Alpha", "Beta"]);
  });
});

describe("looksForeignLanguage", () => {
  it("flags French prose", () => {
    expect(
      looksForeignLanguage(
        "Le vin de la région est produit dans une aire délimitée, avec des cépages qui sont " +
          "sélectionnés pour la qualité et pour le terroir.",
      ),
    ).toBe(true);
  });

  it("flags German prose", () => {
    expect(
      looksForeignLanguage(
        "Der Wein aus der Region wird mit den Trauben von den Rebflächen erzeugt und ist " +
          "für die Qualität nicht unwichtig, auch werden eine Analyse und das Mostgewicht geprüft.",
      ),
    ).toBe(true);
  });

  // The whole point: English prose containing borrowed cellar terms must NOT be
  // treated as foreign, or the accented heuristic loses the terms it exists to find.
  it("does NOT flag English prose that borrows accented cellar terms", () => {
    expect(
      looksForeignLanguage(
        "We began batonnage on the Gewürztraminer lot after veraison, and the Mourvèdre " +
          "stayed on its lees for another month before racking to barrel.",
      ),
    ).toBe(false);
  });

  it("ignores very short passages rather than guessing", () => {
    expect(looksForeignLanguage("le vin est")).toBe(false);
  });
});

describe("extractFromChunk language gating", () => {
  it("skips accented and proper-noun heuristics inside foreign-language text", () => {
    const french =
      "Le vin de la région est produit dans une aire délimitée, avec des cépages qui sont " +
      "sélectionnés pour la qualité et pour le terroir.";
    const found = extractFromChunk(french);
    expect([...found.keys()]).not.toContain("région");
    expect([...found.keys()]).not.toContain("cépage");
  });

  it("still extracts Latin binomials from foreign-language text", () => {
    const french =
      "Le vin de la région est produit dans une aire délimitée avec des cépages qui sont " +
      "atteints par Botrytis cinerea et pour la qualité on surveille aussi les levures.";
    expect([...extractFromChunk(french).keys()]).toContain("Botrytis cinerea");
  });
});
