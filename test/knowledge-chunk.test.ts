import { describe, it, expect } from "vitest";
import {
  chunkMarkdown,
  estimateTokens,
  capBreadcrumb,
  capBreadcrumbSegments,
} from "@/lib/knowledge/chunk";

const DOC = `# Barrel sanitation
Hot water is the most effective and practical sanitation method for controlling Brett in oak.

## Hot-water regimes
Two hot-water regimes are effective for barrel sanitation:

| Water temperature | Minimum hold time |
| --- | --- |
| 70 degrees C | 30 minutes |
| 85 degrees C | 15 minutes |

Reverse osmosis is the most effective way to remove Brett aromas once a wine is affected.`;

describe("chunkMarkdown", () => {
  it("keeps a markdown table whole in a single chunk (dose-table safety)", () => {
    const chunks = chunkMarkdown(DOC, "Brett");
    const tableChunk = chunks.find((c) => c.text.includes("70 degrees C"));
    expect(tableChunk).toBeTruthy();
    // every table cell must be in the SAME chunk — the table was not split
    for (const cell of ["70 degrees C", "30 minutes", "85 degrees C", "15 minutes"]) {
      expect(tableChunk!.text).toContain(cell);
    }
  });

  it("prepends the section breadcrumb to each chunk", () => {
    const chunks = chunkMarkdown(DOC, "Brett");
    for (const c of chunks) {
      expect(c.sectionPath).toContain("Brett");
      expect(c.text.startsWith(c.sectionPath)).toBe(true);
    }
    // the regimes section carries the nested breadcrumb
    expect(chunks.some((c) => c.sectionPath.includes("Hot-water regimes"))).toBe(true);
  });

  it("assigns sequential ordinals from 0", () => {
    const chunks = chunkMarkdown(DOC, "Brett");
    expect(chunks.map((c) => c.ordinal)).toEqual(chunks.map((_, i) => i));
  });

  it("force-splits a very long paragraph into multiple chunks", () => {
    const sentence = "This is a long fact sheet sentence about fermentation nitrogen and yeast health. ";
    const longPara = sentence.repeat(80); // ~6400 chars ~ 1600 tokens, well over MAX
    const chunks = chunkMarkdown(`# Nutrition\n${longPara}`, "YAN");
    expect(chunks.length).toBeGreaterThan(1);
    // no chunk is absurdly large
    for (const c of chunks) expect(c.tokenCount).toBeLessThan(1100);
  });

  it("is deterministic", () => {
    expect(chunkMarkdown(DOC, "Brett").map((c) => c.text)).toEqual(
      chunkMarkdown(DOC, "Brett").map((c) => c.text),
    );
  });

  it("estimateTokens is chars/4", () => {
    expect(estimateTokens("a".repeat(400))).toBe(100);
  });
});

// Plan 099. The Grape Guide extracted cleanly (56 headings, confidence gate passed) and STILL collapsed
// to 11 distinct breadcrumbs across 77 chunks, 75 of them truncated, because the root title and the
// PDF's cover-title H1 said the same thing twice and the cap then ate the tail.
describe("breadcrumb de-duplication and capping", () => {
  const GUIDE_ROOT = "2025 New York and Pennsylvania Pest Management Guidelines for Grapes";
  const GUIDE_H1 = "New York and Pennsylvania Pest Management Guidelines for Grapes";

  it("drops a heading that restates the root title, differing only by a leading year", () => {
    const md = `# ${GUIDE_H1}\n\n## 3 Vineyard Disease Management\n\n### 3.2 Fungicide Information\n\nSterol inhibitors remain effective against powdery mildew where resistance has not developed.`;
    const chunks = chunkMarkdown(md, GUIDE_ROOT);
    for (const c of chunks) {
      expect(c.sectionPath).not.toContain(`${GUIDE_ROOT} > ${GUIDE_H1}`);
    }
    expect(chunks.some((c) => c.sectionPath.endsWith("3.2 Fungicide Information"))).toBe(true);
  });

  it("keeps a heading that merely shares a word with the root", () => {
    const chunks = chunkMarkdown(
      `# Pest\n\nSome body text about a specific pest of grapevines in the region.`,
      "2025 Pest Management Guidelines for Grapes",
    );
    expect(chunks.some((c) => c.sectionPath.endsWith("Pest"))).toBe(true);
  });

  // Regression: containment must be ONE-directional. A heading that EXTENDS the title is more
  // specific than it, and dropping it merges siblings onto one breadcrumb — the very collapse this
  // suite exists to prevent. Both breadcrumbs here are well under the cap, so nothing forces a drop.
  it("keeps sibling headings that each extend the root title", () => {
    const root = "Pest Management Guidelines for Grapes";
    const md = [
      "## Pest Management Guidelines for Grapes in the Finger Lakes",
      "Downy mildew pressure in the Finger Lakes is driven by persistent summer leaf wetness.",
      "## Pest Management Guidelines for Grapes on Long Island",
      "Long Island's maritime climate extends the botrytis risk window well past veraison.",
    ].join("\n\n");
    const paths = new Set(chunkMarkdown(md, root).map((c) => c.sectionPath));
    expect(paths.size).toBe(2);
    expect([...paths].some((p) => p.endsWith("Finger Lakes"))).toBe(true);
    expect([...paths].some((p) => p.endsWith("Long Island"))).toBe(true);
  });

  it("keeps a section whose edition year is the only thing distinguishing it", () => {
    // Only a LEADING year is identity-neutral; stripping every year collided these two.
    const chunks = chunkMarkdown(
      `# Pest Management Guidelines for Grapes 2024\n\nThe 2024 edition's spray thresholds differed.`,
      "Pest Management Guidelines for Grapes 2025",
    );
    expect(chunks.some((c) => c.sectionPath.includes("2024"))).toBe(true);
  });

  it("keeps the leaf whole and elides the middle when a deep stack exceeds the cap", () => {
    const root = "A Fairly Long Publication Title About Vineyard Pest Management Practices";
    const crumb = capBreadcrumbSegments([
      root,
      "Chapter Five Pest Management Schedules For Diseases",
      "Section Two Major Insects Of The Growing Season",
      "5.2.9 First Postbloom Spray",
    ]);
    expect(crumb.length).toBeLessThanOrEqual(140);
    expect(crumb.endsWith("5.2.9 First Postbloom Spray")).toBe(true); // leaf intact
    expect(crumb.startsWith(root)).toBe(true); // publication still named
    expect(crumb).toContain("…"); // and it reads as elided
  });

  it("drops the root before it will drop the leaf", () => {
    const root = "X".repeat(130);
    const leaf = "5.2.9 First Postbloom Spray";
    const crumb = capBreadcrumbSegments([root, leaf]);
    expect(crumb.length).toBeLessThanOrEqual(140);
    expect(crumb).toBe(`… > ${leaf}`);
  });

  it("tail-truncates when the leaf alone exceeds the cap", () => {
    const leaf = "Long ".repeat(60).trim();
    const crumb = capBreadcrumbSegments(["Root", leaf]);
    expect(crumb.length).toBeLessThanOrEqual(140);
    expect(crumb.endsWith("…")).toBe(true);
  });

  // The ellipsis has to come OUT of the budget. A segment with no late word boundary — a glued token
  // from PDF extraction, or a German compound — used to return 141 characters.
  it("stays within the cap when the over-long leaf has no usable word boundary", () => {
    for (const leaf of ["Z".repeat(200), `Ch ${"a".repeat(200)}`, "Rebstockkrankheiten".repeat(20)]) {
      expect(capBreadcrumbSegments([leaf]).length).toBeLessThanOrEqual(140);
      expect(capBreadcrumbSegments(["Root", leaf]).length).toBeLessThanOrEqual(140);
      expect(capBreadcrumb(`Root > ${leaf}`).length).toBeLessThanOrEqual(140);
    }
  });

  it("handles empty and whitespace-only input without throwing", () => {
    expect(capBreadcrumbSegments([])).toBe("");
    expect(capBreadcrumbSegments(["   ", ""])).toBe("");
    expect(capBreadcrumbSegments(["  Root  ", "   ", "Leaf"])).toBe("Root > Leaf");
  });

  it("returns an under-cap breadcrumb byte-identical (no regression for HTML sources)", () => {
    const crumb = "Brett > Hot-water regimes > Barrel sanitation";
    expect(capBreadcrumb(crumb)).toBe(crumb);
    expect(capBreadcrumbSegments(["Brett", "Hot-water regimes"])).toBe("Brett > Hot-water regimes");
  });

  it("never emits a breadcrumb over the cap, across the Grape Guide heading shape", () => {
    // mirrors the real document: cover title as H1, then numbered chapters and sub-sections
    const md = [
      `# ${GUIDE_H1}`,
      "## 1 Pesticide Information",
      "### 1.1 Pesticide Classification and Certification",
      "Restricted use pesticides can only be purchased by a certified applicator in New York State.",
      "### 1.1.1 Certification in New York State",
      "Private applicators use or supervise the use of pesticides to produce agricultural commodities.",
      "## 3 Vineyard Disease Management",
      "### 3.2 Fungicide Information",
      "Fungicide resistance management requires alternating FRAC groups across the season.",
      "## 7 Sprayer Technology",
      "### 7.3.2 Airblast Sprayer Calibration",
      "Calibrate the airblast sprayer at the travel speed you will actually use in the vineyard.",
    ].join("\n\n");
    const chunks = chunkMarkdown(md, GUIDE_ROOT);
    for (const c of chunks) expect(c.sectionPath.length).toBeLessThanOrEqual(140);
    // the whole point: distinct, specific breadcrumbs rather than one truncated slab
    const distinct = new Set(chunks.map((c) => c.sectionPath));
    expect(distinct.size).toBeGreaterThan(3);
    expect(chunks.some((c) => c.sectionPath.includes("1.1.1 Certification in New York State"))).toBe(true);
    expect(chunks.some((c) => c.sectionPath.includes("7.3.2 Airblast Sprayer Calibration"))).toBe(true);
  });
});
