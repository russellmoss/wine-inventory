import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { splitHtmlSections } from "@/lib/knowledge/sections/split-html-sections";

const FIXTURES = path.join(process.cwd(), "test", "fixtures", "knowledge", "vt");
const fixture = (n: number) => fs.readFileSync(path.join(FIXTURES, `EN-${n}.html`), "utf8");

// Plan 084 Unit 1. Every assertion here traces to a measured fact from the 2026-07-20 spike
// (22 live issues, 2000-2013). The three fixtures are the three real site templates:
//   T1 (#1-40)   EN-5.html   — NO anchors at all (~24% of the corpus)
//   T2 (#41-145) EN-112.html — <a name="1"> with NO id=, Roman headings inline with body
//   T3 (#150+)   EN-166.html — <a name="1" id="1"> twins, arabic headings on their own line

describe("splitHtmlSections — T3 (EN-166, 2013)", () => {
  const { sections, preambleHtml } = splitHtmlSections(fixture(166));

  it("finds all 7 numeric anchors including the multi-letter sub-anchors", () => {
    expect(sections.map((s) => s.anchor)).toEqual(["1", "2", "2a", "2b", "3", "4", "5"]);
  });

  it("extracts headings across all three anchor nestings on this one page", () => {
    const byAnchor = Object.fromEntries(sections.map((s) => [s.anchor, s.headingText]));
    // anchor INSIDE <strong>
    expect(byAnchor["1"]).toBe("1. Production Considerations for Rot- Fruit");
    // anchor OUTSIDE <strong> — the heading lives in the FOLLOWING <strong>
    expect(byAnchor["2"]).toBe("2. A Review of Rot Metabolites");
    // anchor inside <strong>, separated by newlines, unnumbered sub-heading
    expect(byAnchor["2a"]).toBe("Polysaccharides and instability");
    expect(byAnchor["3"]).toBe("3. The Technical Study Tour: Alsace, Burgundy and Champagne.");
    expect(byAnchor["5"]).toBe("5. Our New Research Enologist.");
  });

  it("keeps the heading's <strong> inside the slice (slice starts at the block tag)", () => {
    // Slicing exactly at `<a name` starts INSIDE the <p><strong>, which strips the heading's bold
    // from the extracted markdown. Backing up to the enclosing block tag preserves it.
    const s3 = sections.find((s) => s.anchor === "3")!;
    expect(s3.html.startsWith("<p>")).toBe(true);
    expect(s3.html).toContain("<strong>");
  });

  it("carries each section's own body prose and not the next section's", () => {
    const s3 = sections.find((s) => s.anchor === "3")!;
    expect(s3.html).toContain("A 9 day technical study tour");
    expect(s3.html).not.toContain("Amanda Stewart"); // that belongs to section 5
  });

  it("discards a preamble that holds the nav and the table of contents", () => {
    expect(preambleHtml).toContain("Our New Research Enologist"); // the TOC link
    expect(sections[0].html).not.toContain("<ol");
  });
});

describe("splitHtmlSections — T2 (EN-112, 2006)", () => {
  const { sections } = splitHtmlSections(fixture(112));

  it("finds anchors that carry no id= attribute", () => {
    expect(sections.map((s) => s.anchor)).toEqual(["1", "2"]);
  });

  it("extracts Roman-numeral headings that run inline with the body text", () => {
    expect(sections[0].headingText).toBe("I. Sauvignon blanc aroma/flavor.");
    // this one spans a newline plus indentation in the raw HTML — whitespace must normalize
    expect(sections[1].headingText).toBe("II. Virginia Tech Enology Service Lab.");
  });

  it("excludes the left-nav soup that Defuddle fails to strip on this template", () => {
    // Free win: the nav lives in the preamble, so slicing removes it before extraction.
    for (const s of sections) expect(s.html).not.toContain("Skip menu");
  });
});

describe("splitHtmlSections — T1 (EN-5, 2000): anchorless", () => {
  it("returns zero sections without throwing", () => {
    const { sections } = splitHtmlSections(fixture(5));
    expect(sections).toEqual([]);
  });

  it("returns the whole document as preamble so the caller can fail open", () => {
    // ~24% of the corpus is T1. Treating this as an empty page silently drops 40 issues.
    const { preambleHtml } = splitHtmlSections(fixture(5));
    expect(preambleHtml).toContain("Lab policy");
  });
});

describe("splitHtmlSections — spike-found edge cases", () => {
  it("matches an anchor tag that spans a newline (real: EN-50)", () => {
    const html = `<p><strong><a\nname="1"></a>1. Cold Stabilization</strong></p><p>Body.</p>`;
    const { sections } = splitHtmlSections(html);
    expect(sections.map((s) => s.anchor)).toEqual(["1"]);
    expect(sections[0].headingText).toBe("1. Cold Stabilization");
  });

  it("matches multi-letter sub-anchors (real: EN-159 has 29bi and 29bii)", () => {
    const html =
      `<p><strong><a name="29b"></a>29b. Biofilms</strong></p><p>A.</p>` +
      `<p><strong><a name="29bi"></a>29bi. Surface Sanitation</strong></p><p>B.</p>` +
      `<p><strong><a name="29bii"></a>29bii. Rinse Protocol</strong></p><p>C.</p>`;
    const { sections } = splitHtmlSections(html);
    expect(sections.map((s) => s.anchor)).toEqual(["29b", "29bi", "29bii"]);
  });

  it("handles an issue whose first anchor is a sub-anchor (real: EN-155 starts at 1a)", () => {
    const html = `<p><strong><a name="1a"></a>1a. Yeast Rehydration</strong></p><p>Body.</p>`;
    const { sections } = splitHtmlSections(html);
    expect(sections.map((s) => s.anchor)).toEqual(["1a"]);
  });

  it("ignores non-numeric chrome anchors (real: skip-menu, MainContent, vtsearchform)", () => {
    const html =
      `<a name="skip-menu"></a><a name="MainContent"></a>` +
      `<p><strong><a name="1"></a>1. Real Section</strong></p><p>Body.</p>`;
    const { sections } = splitHtmlSections(html);
    expect(sections.map((s) => s.anchor)).toEqual(["1"]);
  });

  it("accepts name= on a non-anchor element without treating it as a section (real: EN-155)", () => {
    // <p id="1a" name="1a"> appears on EN-155; only <a name=...> delimits a section.
    const html = `<p id="2a" name="2a">Not a section.</p><p><strong><a name="1"></a>1. Real</strong></p>`;
    const { sections } = splitHtmlSections(html);
    expect(sections.map((s) => s.anchor)).toEqual(["1"]);
  });

  it("does not swallow the body when the heading's closing tag is missing", () => {
    const html = `<p><a name="1"></a>1. Unclosed heading<p>${"x".repeat(2000)}`;
    const { sections } = splitHtmlSections(html);
    expect(sections[0].headingText.length).toBeLessThan(400);
  });

  it("returns no sections for empty or junk input rather than throwing", () => {
    expect(splitHtmlSections("").sections).toEqual([]);
    expect(splitHtmlSections("<html><body><p>nothing</p></body></html>").sections).toEqual([]);
  });
});

describe("splitHtmlSections — review regressions (2026-07-20)", () => {
  it("never emits a zero-length slice when two anchors share one block", () => {
    // THE BUG: both anchors resolved to the same enclosing <p>, so section 1 got a zero-length
    // slice and its content folded into section 2. Section 2 is an announcement, so the filter
    // dropped it -- deleting section 1's technical content while still REPORTING it as kept.
    // Measured before the fix: applySectionFilter emitted "<article></article>". Empty.
    const html =
      `<p><a name="1"></a><strong>Rot Chemistry</strong> KEEPME_TECHNICAL ` +
      `<a name="2"></a><strong>Study Tour, June 10</strong> ad text</p>`;
    const { sections } = splitHtmlSections(html);

    expect(sections.map((s) => s.anchor)).toEqual(["1", "2"]);
    for (const s of sections) expect(s.html.length).toBeGreaterThan(0);
    expect(sections[0].html).toContain("KEEPME_TECHNICAL");
    expect(sections[1].html).not.toContain("KEEPME_TECHNICAL");
  });

  it("keeps slice starts strictly increasing for any anchor arrangement", () => {
    const html =
      `<div><a name="1"></a>A<a name="2"></a>B<a name="3"></a>C</div>` +
      `<p><a name="4"></a>D</p><a name="5"></a>E`;
    const { sections } = splitHtmlSections(html);
    expect(sections).toHaveLength(5);
    for (const s of sections) expect(s.html.length).toBeGreaterThan(0);
    // reassembling the sections must reproduce every section's content exactly once
    const joined = sections.map((s) => s.html).join("");
    for (const letter of ["A", "B", "C", "D", "E"]) {
      expect(joined.split(letter).length - 1).toBe(1);
    }
  });

  it("ignores anchors inside HTML comments", () => {
    const html = `<!-- <a name="1"></a>commented out --><p><a name="2"></a>Real</p>`;
    const { sections } = splitHtmlSections(html);
    expect(sections.map((s) => s.anchor)).toEqual(["2"]);
  });

  it("ignores anchors inside script and style bodies", () => {
    const html =
      `<script>var s = '<a name="7"></a>';</script>` +
      `<style>/* <a name="8"></a> */</style>` +
      `<p><a name="1"></a>Real</p>`;
    const { sections } = splitHtmlSections(html);
    expect(sections.map((s) => s.anchor)).toEqual(["1"]);
  });

  it("still finds the real anchors on all three fixtures after masking", () => {
    // masking must not perturb the offsets that slicing depends on
    expect(splitHtmlSections(fixture(166)).sections.map((s) => s.anchor)).toEqual([
      "1", "2", "2a", "2b", "3", "4", "5",
    ]);
    expect(splitHtmlSections(fixture(112)).sections).toHaveLength(2);
    expect(splitHtmlSections(fixture(5)).sections).toHaveLength(0);
  });

  it(
    "splits a large dense-anchor page without stalling",
    () => {
      // The old blockStartFor re-sliced from index 0 and re-scanned the whole prefix for EVERY
      // anchor -- O(anchors x pageSize). Measured before the fix: 14s on a 1MB dense-anchor page,
      // extrapolating to ~1h at the 15MB fetch cap. A crawl that looks hung, not slow.
      //
      // The bound is deliberately loose. This suite is already load-sensitive (see the memoization
      // note in extract/html.ts), and the fixed implementation runs this in well under 100ms, so
      // 10s is a ~100x margin against flake while the quadratic version takes MINUTES on this
      // input and fails unambiguously.
      const html = `<p><a name="1"></a>x${"y".repeat(400)}</p>`.repeat(4000);
      const t0 = Date.now();
      const { sections } = splitHtmlSections(html);
      const elapsed = Date.now() - t0;
      expect(sections).toHaveLength(4000);
      expect(elapsed).toBeLessThan(10_000);
    },
    30_000,
  );
});
