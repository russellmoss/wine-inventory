// Plan 100 PR A — the chunker must never silently delete text.
//
// The bug this file exists to prevent: `splitBySentences` and `tailForOverlap` both scanned with
// `text.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g)`. Neither alternative can match a `.` that is NOT
// followed by whitespace, and `String.prototype.match(/…/g)` SKIPS spans it cannot match rather
// than failing. So a decimal sitting after the last sentence boundary fell into a dead zone:
//
//     "abc. 0.5 def".match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g)  ->  ["abc. ", "5 def"]
//
// The "0." is gone, with no error and no marker. In the live corpus that turned "0.5-1 lb ai" into
// "5-1 lb ai" in an OSU pesticide guide — a tenfold dose error, carrying a citation that made it
// look authoritative.
//
// The invariant is TOTAL COVERAGE, which is a property rather than a pattern, so it is asserted as
// one: the parts must rejoin to exactly the input.

import { describe, it, expect } from "vitest";
import {
  splitIntoSentences,
  splitBySentences,
  tailForOverlap,
  findDroppedNumericTokens,
  chunkMarkdown,
} from "@/lib/knowledge/chunk";

/** The exact regex the broken implementation used. Kept here to drive the conditional-parity test. */
const LEGACY_RE = /[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g;
function legacySplit(text: string): string[] {
  return text.match(LEGACY_RE) ?? [text];
}
/** Was the OLD scan lossless for this input? Parity is only required where it was. */
function legacyWasLossless(text: string): boolean {
  return legacySplit(text).join("") === text;
}

const stripWs = (s: string) => s.replace(/\s+/g, "");

// Inputs chosen to cover the shapes this corpus actually carries: agricultural rates, growth-stage
// codes, taxonomic abbreviations, product names with embedded decimals, European decimal commas
// (the French/German/Spanish/Catalan sources), URLs, and non-Latin scripts.
const CORPUS: string[] = [
  "",
  " ",
  "   \t\n  ",
  ".",
  "...",
  "?!",
  "abc. 0.5 def",
  "before text 0.5 inch of water after",
  "Apply at 0.5-1 lb ai/A before bud break.",
  "Gallery 0.5 TG plus Surflan A.S. at 2 qt/A.",
  "buprofezin (Applaud) at 0.40 to 0.53 lb ai/A. PHI 7 days.",
  "Soil application at 0.25 to 0.5 lb ai/A. Do not apply more than 0.5 lb ai/A per year.",
  "Abound at 10 to 15.5 fl oz/A. Group 11 fungicide. 4-hr reentry.",
  "Ph-D WDG at 6.2 oz/A plus an adjuvant.",
  "M-Pede at 1 to 2 gal/100 gal water.",
  "JMS Stylet Oil at 1 to 2 gal/100 gal water.",
  "Brix approx. 24.5 at harvest.",
  "Erysiphe necator (formerly Uncinula necator) and Vitis spp. hybrids.",
  "Bud break at BBCH 12. Bloom at BBCH 61 to 65.",
  "pH 3.45 and TA 6.2 g/L with 45 mg/L free SO2.",
  "Rendement 1.500,00 kg/ha selon l'IFV.",
  "See https://example.org/a.b/c.d for details.",
  "One. Two. Three",
  "One.Two.Three",
  "End.",
  "Ends with no punctuation",
  "Multiple!! Terminators?? Here.",
  "Line one.\r\nLine two.\r\n",
  "Tabs\tand nbsp. Next 0.5 here.",
  "葡萄のうどんこ病。0.5 kg/ha を散布。",
  "Emoji 🍇 then 0.5 kg then 🍷 end",
  "a.b.c.d.e",
  "0.5",
  ". leading terminator",
  "trailing terminator .",
];

describe("splitIntoSentences — total coverage", () => {
  it("rejoins to exactly the input for every corpus fixture", () => {
    for (const input of CORPUS) {
      expect(splitIntoSentences(input).join(""), `input: ${JSON.stringify(input)}`).toBe(input);
    }
  });

  it("rejoins to exactly the input for generated permutations", () => {
    const atoms = ["abc", ". ", ".", "0.5", " ", "!! ", "?", "\n", "x.y", "spp. ", "1,5", " "];
    // Deterministic pseudo-random walk — no Math.random, so a failure is reproducible.
    let seed = 1;
    const next = () => (seed = (seed * 1103515245 + 12345) % 2147483648);
    for (let n = 0; n < 2000; n++) {
      let s = "";
      const len = 1 + (next() % 8);
      for (let k = 0; k < len; k++) s += atoms[next() % atoms.length];
      expect(splitIntoSentences(s).join(""), `input: ${JSON.stringify(s)}`).toBe(s);
    }
  });

  it("never emits an empty part for a non-empty input", () => {
    for (const input of CORPUS) {
      if (input === "") continue;
      const parts = splitIntoSentences(input);
      expect(parts.length).toBeGreaterThan(0);
      for (const p of parts) expect(p).not.toBe("");
    }
  });

  it("returns no parts for the empty string", () => {
    expect(splitIntoSentences("")).toEqual([]);
  });
});

describe("splitIntoSentences — conditional parity with the legacy scan", () => {
  // Council C2: parity and total coverage are in direct tension. You CANNOT reproduce the legacy
  // output for "abc. 0.5 def", because the legacy output omits bytes. So parity is required only
  // where the legacy scan was itself lossless; everywhere else coverage wins and parity is waived.
  it("is byte-identical to the legacy scan wherever the legacy scan was lossless", () => {
    for (const input of CORPUS) {
      if (input === "" || !legacyWasLossless(input)) continue;
      expect(splitIntoSentences(input), `input: ${JSON.stringify(input)}`).toEqual(legacySplit(input));
    }
  });

  it("covers the inputs the legacy scan silently truncated", () => {
    const lossy = CORPUS.filter((s) => s !== "" && !legacyWasLossless(s));
    // Guard the guard: if this list ever empties, the parity test above becomes vacuous.
    expect(lossy.length).toBeGreaterThan(0);
    for (const input of lossy) {
      expect(splitIntoSentences(input).join("")).toBe(input);
    }
  });

  it("keeps a decimal intact where the legacy scan ate the leading zero", () => {
    expect(legacySplit("abc. 0.5 def")).toEqual(["abc. ", "5 def"]); // the bug, pinned
    expect(splitIntoSentences("abc. 0.5 def")).toEqual(["abc. ", "0.5 def"]);
  });
});

describe("splitBySentences — packing loses no visible character", () => {
  it("preserves every non-whitespace character across the packed pieces", () => {
    for (const input of CORPUS) {
      const packed = splitBySentences(input, 8).join("");
      expect(stripWs(packed), `input: ${JSON.stringify(input)}`).toBe(stripWs(input));
    }
  });

  it("preserves rate strings when a long block is force-split", () => {
    const filler = "Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod. ".repeat(60);
    const rates = [
      "0.5-1 lb ai",
      "0.25 to 0.5 lb ai (1-2 pts product)",
      "0.5 inch of water",
      "Gallery 0.5 TG",
      "0.40 to 0.53 lb ai/A",
    ];
    for (const rate of rates) {
      const block = `${filler}Apply ${rate} per acre before bud break.`;
      const packed = splitBySentences(block, 512).join("");
      expect(stripWs(packed), `rate: ${rate}`).toContain(stripWs(rate));
    }
  });
});

describe("tailForOverlap — the tail is a real suffix", () => {
  it("returns a suffix of the body, never invented or truncated text", () => {
    for (const input of CORPUS) {
      const tail = tailForOverlap(input);
      if (tail === "") continue;
      expect(stripWs(input).endsWith(stripWs(tail)), `input: ${JSON.stringify(input)}`).toBe(true);
    }
  });

  it("does not eat a decimal at the start of the tail", () => {
    const body = "Filler sentence one. Apply 0.5 lb ai per acre.";
    const tail = tailForOverlap(body);
    if (tail.includes("lb ai")) expect(tail).toContain("0.5");
  });
});

describe("findDroppedNumericTokens — the standing ingest-time invariant", () => {
  // Council C9: fixing one regex retrospectively leaves the pipeline blind to the next bug, and a
  // corrupted rate is often agronomically PLAUSIBLE (5 lb/A of sulfur is normal; 5 lb/A of a Group 3
  // DMI is catastrophic and illegal), so nobody catches it downstream.
  it("reports nothing when every decimal token survives", () => {
    const src = "Apply 0.5 lb ai/A. Then 1.25 gal/100 gal. pH 3.45.";
    expect(findDroppedNumericTokens(src, [src])).toEqual([]);
  });

  it("names the token that vanished", () => {
    const src = "Apply 0.5 lb ai/A and 1.25 gal.";
    const damaged = ["Apply 5 lb ai/A and 1.25 gal."]; // the exact real-world corruption
    expect(findDroppedNumericTokens(src, damaged)).toEqual(["0.5"]);
  });

  it("accepts a token duplicated by chunk overlap", () => {
    const src = "Apply 0.5 lb ai/A.";
    expect(findDroppedNumericTokens(src, ["Apply 0.5 lb", "0.5 lb ai/A."])).toEqual([]);
  });

  it("accepts European decimal commas", () => {
    const src = "Rendement 1,50 kg/ha.";
    expect(findDroppedNumericTokens(src, [src])).toEqual([]);
    expect(findDroppedNumericTokens(src, ["Rendement 50 kg/ha."])).toEqual(["1,50"]);
  });

  it("does not care about tokens split across two chunks by overlap boundaries", () => {
    // A token present in ANY chunk counts as surviving; the invariant is presence, not position.
    const src = "First 2.5 then 3.5 then 4.5.";
    expect(findDroppedNumericTokens(src, ["First 2.5", "then 3.5", "then 4.5."])).toEqual([]);
  });
});

describe("chunkMarkdown — end-to-end integrity on a force-split document", () => {
  const LONG_DOC = `# Grape (Vitis spp.)-Powdery Mildew

## Chemical control
${"Begin applications at 6 inches shoot growth and continue at regular intervals. ".repeat(40)}Abound at 10 to 15.5 fl oz/A. Aprovia at 8.6 to 10.5 fl oz/A plus an adjuvant. Cevya at 4 to 5 fl oz/A. Gatten at 6.4 fl oz/A. Ph-D WDG at 6.2 oz/A. Apply 0.5 inch of water afterward.`;

  it("forces the split path (guarding the guard)", () => {
    const chunks = chunkMarkdown(LONG_DOC, "PNW");
    expect(chunks.length).toBeGreaterThan(1);
  });

  it("loses no decimal rate anywhere in the document", () => {
    const chunks = chunkMarkdown(LONG_DOC, "PNW");
    expect(findDroppedNumericTokens(LONG_DOC, chunks.map((c) => c.text))).toEqual([]);
  });

  it("keeps every named rate readable in some chunk", () => {
    const chunks = chunkMarkdown(LONG_DOC, "PNW");
    const all = chunks.map((c) => c.text).join("\n");
    for (const rate of ["15.5 fl oz/A", "8.6 to 10.5 fl oz/A", "6.4 fl oz/A", "6.2 oz/A", "0.5 inch"]) {
      expect(all, `rate: ${rate}`).toContain(rate);
    }
  });
});
