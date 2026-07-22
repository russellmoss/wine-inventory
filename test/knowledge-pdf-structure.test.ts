import { describe, it, expect } from "vitest";
import {
  normalizeLigatures,
  bodyFontSize,
  groupLines,
  isHeadingLine,
  assignHeadingLevels,
  linesToMarkdown,
  dropRunningHeaders,
  isBoilerplateSection,
  inferTitle,
  type PdfTextItem,
  type PdfLine,
} from "@/lib/knowledge/extract/pdf-structure";

// Plan 090 Units 4+5. Fixtures below are modelled on REAL measurements taken from the live corpus with
// unpdf@1.6.2, not invented: the 2015 OWRI newsletter (ir.library.oregonstate.edu/downloads/rr172584r)
// reports a character-weighted body size of 11 with heading sizes 14 / 22 / 28 / 32 present, and the
// 1990s research progress report (08612p99f) sets its title at 14 over 11pt body.

const line = (text: string, fontSize: number, page = 0): PdfLine => ({ text, fontSize, page });

// Plan 090 Unit 7. Every mapping below was verified against the LIVE corpus with a real example, not
// inferred from a Unicode table.
describe("normalizeLigatures", () => {
  it("repairs the exact mojibake observed in the OWRI corpus", () => {
    expect(normalizeLigatures("NewsleƩer")).toBe("Newsletter");
    expect(normalizeLigatures("ViƟculture")).toBe("Viticulture");
    expect(normalizeLigatures("informaƟon")).toBe("information");
  });

  it("repairs true Unicode presentation forms", () => {
    expect(normalizeLigatures("viniﬁcations")).toBe("vinifications");
    expect(normalizeLigatures("eﬀect")).toBe("effect");
    expect(normalizeLigatures("overﬂow")).toBe("overflow");
  });

  it("repairs mojibake inside ALL-CAPS text too", () => {
    // Regression: the first cut required LOWERCASE on both sides, so the OWRI newsletter's all-caps
    // section headings stayed broken while its prose was repaired. Found by running the real extractor
    // over the real PDF, not by these unit tests — which is why this case now exists.
    // Case is matched to the surroundings so a citation renders "VITICULTURE", not "VItiCULTURE".
    expect(normalizeLigatures("VIƟCULTURE & ENOLOGY")).toBe("VITICULTURE & ENOLOGY");
    expect(normalizeLigatures("NEWSLEƩER")).toBe("NEWSLETTER");
    // Mixed case falls back to lowercase, which is what ordinary prose wants.
    expect(normalizeLigatures("InformaƟon")).toBe("Information");
  });

  it("repairs several occurrences in one word, including adjacent ones", () => {
    // The regex consumes the flanking letters, so overlapping matches need a fixed-point pass:
    // "consƟtuƟon" has two, and a single pass would leave the second behind.
    expect(normalizeLigatures("consƟtuƟon")).toBe("constitution");
    expect(normalizeLigatures("ViƟculture and fermentaƟon praqƟce".replace("q", "c"))).toContain("Viticulture");
    expect(normalizeLigatures("ViƟculture and fermentaƟon")).toBe("Viticulture and fermentation");
  });

  it("repairs WORD-INITIAL mojibake, which is most of the real damage", () => {
    // Found only by running the real extractor over the real newsletter: 24 occurrences survived a
    // rule that required letters on BOTH sides, because the glyph frequently starts a word. These are
    // ordinary winemaking vocabulary, so leaving them broken defeats the lexical arm for exactly the
    // words a grower searches for.
    expect(normalizeLigatures("the first Ɵme")).toBe("the first time");
    expect(normalizeLigatures("surrounding Ɵssues")).toBe("surrounding tissues");
    expect(normalizeLigatures("the Ɵming of ripening")).toBe("the timing of ripening");
  });

  it("does NOT touch a STANDALONE Ɵ or Ʃ", () => {
    // U+019F and U+01A9 are real Latin letters (O WITH MIDDLE TILDE, ESH) used in African
    // orthographies. Attached to a word is the mojibake signature; a standalone glyph is legitimate
    // text and is the one shape left untouched.
    expect(normalizeLigatures("Ɵ")).toBe("Ɵ");
    expect(normalizeLigatures("the letter Ʃ appears here")).toBe("the letter Ʃ appears here");
    expect(normalizeLigatures("( Ɵ )")).toBe("( Ɵ )");
  });

  it("leaves chemistry and unit characters alone", () => {
    // The reason this is an explicit map and not Unicode NFKC: NFKC rewrites superscripts, the degree
    // sign and the micro sign, all of which carry meaning across this corpus.
    const s = "Free SO₂ at 20 °C, 5 µg/L, 10⁻³ mol, mg/L and g/L";
    expect(normalizeLigatures(s)).toBe(s);
  });

  it("is a no-op on clean text and empty input", () => {
    expect(normalizeLigatures("ordinary winemaking text")).toBe("ordinary winemaking text");
    expect(normalizeLigatures("")).toBe("");
  });
});

describe("bodyFontSize", () => {
  it("returns the character-weighted mode, not the item-count mode", () => {
    // pdf.js emits word fragments and standalone spaces as separate items, so many SHORT lines set in a
    // display face must not outvote the actual prose. Ten 3-char headings vs two long body lines.
    const lines = [
      ...Array.from({ length: 10 }, () => line("Hdg", 28)),
      line("A".repeat(400), 11),
      line("B".repeat(400), 11),
    ];
    expect(bodyFontSize(lines)).toBe(11);
  });

  it("buckets float noise to half points (13.98 is a 14pt title)", () => {
    expect(bodyFontSize([line("x".repeat(50), 13.98), line("y".repeat(50), 14.02)])).toBe(14);
  });

  it("breaks ties toward the smaller size", () => {
    // Equal text at two sizes: body text is the smaller one, and guessing the larger would classify
    // real prose as headings.
    expect(bodyFontSize([line("A".repeat(100), 11), line("B".repeat(100), 14)])).toBe(11);
  });

  it("ignores whitespace-only and zero-size lines", () => {
    expect(bodyFontSize([line("   ", 99), line("real text here", 11)])).toBe(11);
    expect(bodyFontSize([])).toBe(0);
  });
});

describe("groupLines", () => {
  const item = (str: string, over: Partial<PdfTextItem> = {}): PdfTextItem => ({
    str, y: 700, fontSize: 11, ...over,
  });

  it("joins fragments and standalone spaces into one line", () => {
    // Exactly the shape observed: "Our" / " " / "current" as three separate items.
    const lines = groupLines([[item("Our"), item(" ", { fontSize: 0 }), item("current"), item(" issue", { hasEOL: true })]]);
    expect(lines).toHaveLength(1);
    expect(lines[0].text).toBe("Our current issue");
  });

  it("breaks a line on hasEOL", () => {
    const lines = groupLines([[item("first", { hasEOL: true }), item("second", { hasEOL: true })]]);
    expect(lines.map((l) => l.text)).toEqual(["first", "second"]);
  });

  it("breaks a line on a y-change even when hasEOL is absent", () => {
    // Some producers never set hasEOL. Without the y fallback the whole page collapses to one line.
    const lines = groupLines([[item("top", { y: 700 }), item("below", { y: 680 })]]);
    expect(lines.map((l) => l.text)).toEqual(["top", "below"]);
  });

  it("does NOT break on sub-line y jitter", () => {
    // Superscripts and baseline noise shift y slightly; treating those as line breaks would shred prose.
    const lines = groupLines([[item("stable at 20", { y: 700 }), item(" C", { y: 700.4 })]]);
    expect(lines).toHaveLength(1);
  });

  it("takes the character-dominant size so one big glyph cannot promote a sentence", () => {
    // A drop-cap: one 32pt letter followed by ordinary 11pt prose. The line must stay body text.
    const lines = groupLines([[
      item("T", { fontSize: 32 }),
      item("he rest of this sentence is ordinary body text", { fontSize: 11, hasEOL: true }),
    ]]);
    expect(lines[0].fontSize).toBe(11);
  });

  it("preserves pdf.js item order and never re-sorts", () => {
    // Re-sorting by (y,x) to rebuild lines would interleave columns on a multi-column layout and make
    // the BODY text worse while fixing headings. Order in == order out.
    const lines = groupLines([[
      item("second visually higher", { y: 900, hasEOL: true }),
      item("first in reading order", { y: 100, hasEOL: true }),
    ]]);
    expect(lines.map((l) => l.text)).toEqual(["second visually higher", "first in reading order"]);
  });

  it("tracks the page index", () => {
    const lines = groupLines([[item("p1", { hasEOL: true })], [item("p2", { hasEOL: true })]]);
    expect(lines.map((l) => l.page)).toEqual([0, 1]);
  });
});

describe("isHeadingLine", () => {
  const BODY = 11;

  it("accepts a line set clearly larger than body text", () => {
    expect(isHeadingLine(line("Nitrogen Compounds in Oregon Musts", 14), BODY)).toBe(true);
  });

  it("rejects a line at or near body size", () => {
    expect(isHeadingLine(line("ordinary prose", 11), BODY)).toBe(false);
    expect(isHeadingLine(line("barely bigger", 12), BODY)).toBe(false); // 12 < 11 * 1.15
  });

  it("rejects a long line however it is set", () => {
    // The exact failure mode being fixed: a 192-char welcome paragraph must never become a heading and
    // thus a breadcrumb.
    const slab =
      "Welcome to the Summer 2015 Newsletter Our current issue of the OWRI Technical Newsletter is packed with Extension information, research results, and program updates from across the institute";
    expect(slab.length).toBeGreaterThan(120);
    expect(isHeadingLine(line(slab, 32), BODY)).toBe(false);
  });

  it("rejects a sentence fragment that merely happens to be set larger", () => {
    // Found by running the real extractor over the AWRI fact sheets. Size alone promoted wrapped body
    // text to headings, giving breadcrumbs like "Fact Sheet > me know." and "… > come about?". Every
    // such fragment starts lowercase because it is the tail of a sentence.
    for (const frag of ["me know.", "come about?", "ask the", "point?", "become resistant?"]) {
      expect(isHeadingLine(line(frag, 14), BODY), frag).toBe(false);
    }
  });

  it("still accepts real headings that start with a capital or a number", () => {
    expect(isHeadingLine(line("Where to from here?", 14), BODY)).toBe(true);
    expect(isHeadingLine(line("Requirements for Pinot noir?", 14), BODY)).toBe(true);
    expect(isHeadingLine(line("3. Tissue Interpretation", 14), BODY)).toBe(true);
  });

  it("rejects lines with no letters", () => {
    // Page numbers and rules set in a display face would otherwise produce breadcrumbs like "12 > 13".
    expect(isHeadingLine(line("12", 28), BODY)).toBe(false);
    expect(isHeadingLine(line("— — —", 28), BODY)).toBe(false);
  });

  it("rejects everything when there is no usable body size", () => {
    expect(isHeadingLine(line("Anything", 28), 0)).toBe(false);
  });
});

describe("assignHeadingLevels", () => {
  it("maps largest size to level 1, descending", () => {
    const levels = assignHeadingLevels([14, 32, 22]);
    expect(levels.get(32)).toBe(1);
    expect(levels.get(22)).toBe(2);
    expect(levels.get(14)).toBe(3);
  });

  it("caps at 3 levels", () => {
    // chunk.ts accepts #{1,6}, but a six-tier breadcrumb is not a useful citation string and PDF size
    // variation past three tiers is typography, not hierarchy.
    const levels = assignHeadingLevels([32, 28, 22, 18, 14]);
    expect(levels.get(18)).toBe(3);
    expect(levels.get(14)).toBe(3);
  });

  it("treats float-noise sizes as one tier", () => {
    const levels = assignHeadingLevels([13.98, 14.02]);
    expect(new Set(levels.values()).size).toBe(1);
  });
});

describe("linesToMarkdown", () => {
  it("emits headings chunk.ts can parse and joins body lines into paragraphs", () => {
    const { markdown, headingCount } = linesToMarkdown([
      line("Nitrogen Compounds in Oregon Musts", 14),
      line("Barney Watson and Hsiao Ping Chen studied", 11),
      line("nitrogen availability across three sites.", 11),
      line("Results", 14),
      line("YAN averaged 180 mg/L across the trial.", 11),
    ]);
    expect(headingCount).toBe(2);
    // Consecutive body lines become ONE paragraph: chunk.ts packs paragraphs into ~512-token chunks, so
    // one-line-per-paragraph would hand it hundreds of tiny blocks and defeat the packing.
    expect(markdown).toBe(
      "# Nitrogen Compounds in Oregon Musts\n\n" +
        "Barney Watson and Hsiao Ping Chen studied nitrogen availability across three sites.\n\n" +
        "# Results\n\n" +
        "YAN averaged 180 mg/L across the trial.",
    );
  });

  it("reports zero headings for a document set entirely in one size", () => {
    // The fail-soft signal: extractPdf falls back to today's linearized text rather than emitting a
    // structureless markdown that would chunk no better and might chunk worse.
    const { headingCount } = linesToMarkdown([line("all", 11), line("one", 11), line("size", 11)]);
    expect(headingCount).toBe(0);
  });

  it("produces markdown whose headings survive a round trip through the real chunker", async () => {
    // The integration that actually matters. This is the exact contract that was broken: chunk.ts builds
    // breadcrumbs from a heading stack, and a headingless PDF left that stack empty forever.
    const { chunkMarkdown } = await import("@/lib/knowledge/chunk");
    const { markdown } = linesToMarkdown([
      line("Vineyard Nutrition", 22),
      line("Petiole Sampling", 14),
      line("Sample 60 to 100 petioles at bloom from the leaf opposite the basal cluster.", 11),
      line("Tissue Interpretation", 14),
      line("Nitrogen below 0.8 percent at bloom indicates deficiency.", 11),
    ]);
    const chunks = chunkMarkdown(markdown, "OWRI Technical Newsletter");
    const paths = [...new Set(chunks.map((c) => c.sectionPath))];
    expect(paths.length).toBeGreaterThan(1); // the collapse-to-one-breadcrumb bug, asserted directly
    expect(paths.some((p) => p.includes("Petiole Sampling"))).toBe(true);
    expect(paths.some((p) => p.includes("Tissue Interpretation"))).toBe(true);
    // Nesting is preserved: the 14pt subheads sit under the 22pt section.
    expect(paths.some((p) => p.includes("Vineyard Nutrition > Petiole Sampling"))).toBe(true);
    // And every breadcrumb stays short enough to be a citation string, unlike the 192-char slab.
    for (const p of paths) expect(p.length).toBeLessThan(120);
  });
});

// Plan 090 Unit 6.
describe("dropRunningHeaders", () => {
  const onPages = (text: string, fontSize: number, pages: number[]) =>
    pages.map((p) => line(text, fontSize, p));

  it("drops a header repeated across most pages", () => {
    // The real case: the OWRI newsletter repeats "Viticulture & Enology" atop all 13 pages, set larger
    // than body text, so every one became a heading and the breadcrumbs read
    // "Viticulture & Enology > Viticulture & Enology > Technical Newsletter > ...".
    const lines = [
      ...onPages("Viticulture & Enology", 14, [0, 1, 2, 3, 4, 5]),
      ...[0, 1, 2, 3, 4, 5].map((p) => line(`unique body text for page ${p}`, 11, p)),
    ];
    const kept = dropRunningHeaders(lines);
    expect(kept.some((l) => l.text === "Viticulture & Enology")).toBe(false);
    expect(kept).toHaveLength(6);
  });

  it("keeps a line that appears on only a few pages", () => {
    const lines = [
      ...onPages("Occasional Subhead", 14, [0, 1]),
      ...[0, 1, 2, 3, 4, 5].map((p) => line(`body ${p}`, 11, p)),
    ];
    expect(dropRunningHeaders(lines).some((l) => l.text === "Occasional Subhead")).toBe(true);
  });

  it("does nothing on a short document", () => {
    // Two pages give nothing to generalize from; a repeated line there may just be a real repeat.
    const lines = [...onPages("Repeated", 14, [0, 1]), line("body", 11, 0)];
    expect(dropRunningHeaders(lines)).toHaveLength(3);
  });

  it("never drops a long line even if it repeats", () => {
    // A length ceiling keeps genuine repeated CONTENT out of scope. Furniture is short.
    const long = "This is a long sentence of actual content that happens to be repeated across pages verbatim.";
    const lines = [...onPages(long, 11, [0, 1, 2, 3, 4, 5]), line("other", 11, 0)];
    expect(dropRunningHeaders(lines).filter((l) => l.text === long)).toHaveLength(6);
  });
});

describe("isBoilerplateSection", () => {
  it("drops unambiguous structural furniture on the heading alone", () => {
    expect(isBoilerplateSection("Acknowledgements", ["We thank the OWRI staff."])).toMatch(/boilerplate/);
    expect(isBoilerplateSection("Copyright", ["© 2019 The Australian Wine Research Institute"])).toMatch(/boilerplate/);
    expect(isBoilerplateSection("IN THIS ISSUE", ["Cluster ripening", "Nitrogen"])).toMatch(/boilerplate/);
  });

  it("drops a reference list that really is citations", () => {
    const body = [
      "Amerine, M.A.; Ough, C.S. (1980) Methods for analysis of musts and wines. New York Wiley.",
      "Bokulich, N.A. et al. (2015) Sulfur dioxide treatment alters wine microbial diversity.",
      "Schreiner, R.P. (2016) Nutrient uptake in Pinot noir. Am J Enol Vitic 67(2): 234-241.",
    ];
    expect(isBoilerplateSection("References", body)).toMatch(/bibliography/);
    expect(isBoilerplateSection("Literature Cited", body)).toMatch(/bibliography/);
  });

  it("KEEPS a 'Further reading' section that is actually guidance", () => {
    // The false positive a heading-only denylist would create, and the reason the bibliography branch
    // demands corroborating evidence from the body.
    const guidance = [
      "Add 25 mg/L of sulfur dioxide at crush to stabilise the microbial population before inoculation.",
      "Check free SO2 again after malolactic fermentation completes and top up to the target.",
    ];
    expect(isBoilerplateSection("Further reading", guidance)).toBeNull();
  });

  it("matches whole headings only, never substrings", () => {
    // "Reference method" and "Contents of the must" are real technical headings.
    expect(isBoilerplateSection("Reference method for volatile acidity", ["Steam distillation."])).toBeNull();
    expect(isBoilerplateSection("Contents of the must", ["Sugar and acid at harvest."])).toBeNull();
    expect(isBoilerplateSection("Acknowledgement of receipt procedures", ["Steps."])).toBeNull();
  });

  it("handles the corpus's other languages", () => {
    expect(isBoilerplateSection("Remerciements", ["Merci à l'équipe."])).toMatch(/boilerplate/);
    expect(isBoilerplateSection("Agradecimientos", ["Gracias al equipo."])).toMatch(/boilerplate/);
    expect(isBoilerplateSection("Danksagung", ["Wir danken dem Team."])).toMatch(/boilerplate/);
  });

  it("fails open on anything unrecognized", () => {
    expect(isBoilerplateSection("Petiole Sampling", ["Sample 60 petioles at bloom."])).toBeNull();
    expect(isBoilerplateSection("", ["orphan body"])).toBeNull();
  });
});

describe("linesToMarkdown boilerplate filtering", () => {
  it("removes a boilerplate section together with its body", () => {
    // Dropping the heading alone would orphan the reference list under the preceding section, which is
    // worse than leaving it in place.
    const { markdown, dropped } = linesToMarkdown([
      line("Petiole Sampling", 14),
      line("Sample 60 petioles at bloom from the leaf opposite the basal cluster.", 11),
      line("References", 14),
      line("Amerine, M.A.; Ough, C.S. (1980) Methods for analysis of musts and wines.", 11),
      line("Schreiner, R.P. et al. (2016) Nutrient uptake in Pinot noir.", 11),
    ]);
    expect(markdown).toContain("Petiole Sampling");
    expect(markdown).not.toContain("References");
    expect(markdown).not.toContain("Amerine");
    expect(dropped).toHaveLength(1);
  });

  it("merges a heading that wraps onto a second line", () => {
    // Real case: "Strobilurin resistance to powdery mildew in a vineyard" wraps, and treating the two
    // lines as separate headings produced "Strobilurin resistance … > mildew in a vineyard > …".
    const { markdown } = linesToMarkdown([
      line("Strobilurin resistance to powdery", 16),
      line("Mildew in a vineyard", 16),
      line("Resistance arises when a single-site fungicide is used repeatedly.", 11),
    ]);
    expect(markdown).toContain("# Strobilurin resistance to powdery Mildew in a vineyard");
    expect(markdown.match(/^#/gm) ?? []).toHaveLength(1);
  });

  it("does NOT merge sibling headings that have content between them", () => {
    const { markdown } = linesToMarkdown([
      line("First Section", 14),
      line("Some real body content sits here between the two headings.", 11),
      line("Second Section", 14),
      line("More body content follows the second heading.", 11),
    ]);
    expect(markdown.match(/^#/gm) ?? []).toHaveLength(2);
    expect(markdown).toContain("# First Section");
    expect(markdown).toContain("# Second Section");
  });

  it("counts only KEPT headings, so a fully boilerplate document fails soft", () => {
    // headingCount drives extractPdf's fallback. If every heading were boilerplate, the document has no
    // usable structure and should fall back to linearized text rather than emit a shell.
    const { headingCount } = linesToMarkdown([
      line("Acknowledgements", 14),
      line("We thank the staff.", 11),
    ]);
    expect(headingCount).toBe(0);
  });
});

describe("inferTitle", () => {
  it("takes the largest-set line on page one", () => {
    expect(
      inferTitle([
        line("Nitrogen Compounds in Oregon Musts and Wines", 14),
        line("Barney Watson and Hsiao Ping Chen", 11),
        line("Department of Food Science and Technology", 11),
      ]),
    ).toBe("Nitrogen Compounds in Oregon Musts and Wines");
  });

  it("joins a genuinely multi-line title", () => {
    // Observed on 08612p99f: the title wraps across two lines, both set at 14pt.
    expect(
      inferTitle([
        line("Manipulating Soil Moisture and Nitrogen Availability", 14),
        line("Part II: Effects on Pinot noir Must", 14),
        line("Barney Watson, Mee Godard, and Hsiao-Ping Chen", 11),
      ]),
    ).toBe("Manipulating Soil Moisture and Nitrogen Availability Part II: Effects on Pinot noir Must");
  });

  it("REFUSES rather than truncating when the largest text is a paragraph", () => {
    // This is the whole Unit 4 point. firstNonEmptyLine() took 200 chars of whatever came first, which
    // is how a welcome paragraph became the title AND every chunk's breadcrumb. Returning null lets the
    // caller fall back instead of laundering prose into a field citation.ts shows the user.
    const slab = "Welcome to the Summer 2015 Newsletter ".repeat(6);
    expect(inferTitle([line(slab, 32), line("body text here", 11)])).toBeNull();
  });

  it("returns null when page one carries no typographic signal", () => {
    expect(inferTitle([line("all one size", 11), line("nothing stands out", 11)])).toBeNull();
  });

  it("ignores later pages", () => {
    expect(
      inferTitle([line("Real Title", 20, 0), line("body", 11, 0), line("HUGE PAGE TWO BANNER", 40, 1)]),
    ).toBe("Real Title");
  });

  it("returns null for a largest line with no letters", () => {
    expect(inferTitle([line("2015", 32), line("body text", 11)])).toBeNull();
  });
});
