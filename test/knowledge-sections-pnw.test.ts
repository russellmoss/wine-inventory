// Plan 100 Unit 7 — the PNW section filter.
//
// The point of this strategy is a cut that section-level filtering could not make. `Chemical
// control` holds BOTH the fungicide resistance-management prose (tier B, and the single most useful
// paragraph on the page) and ~30 product bullets with rates, PHI and REI (tier C, and barred from
// the corpus by invariant KB-1). Dropping the section by its heading would lose both, so the cut is
// at block level: keep the <p>, drop the <ul>/<ol>/<table>.
//
// Fixtures are real pages, saved 2026-07-26.

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  splitPnwSections,
  isProductSection,
  stripProductBlocks,
  applySectionFilter,
  resolveSectionFilter,
  deriveIndexHash,
  PNW_FILTER_VERSION,
  SECTION_FILTER_VERSION,
} from "@/lib/knowledge/sections";
import { extractHtml } from "@/lib/knowledge/extract/html";

const DIR = path.join(process.cwd(), "test", "fixtures", "knowledge", "pnw");
const fixture = (n: string) => fs.readFileSync(path.join(DIR, `${n}.html`), "utf8");

describe("splitPnwSections — both templates, and only real section labels", () => {
  it("finds the disease template's bold paragraph lead-ins", () => {
    const { sections } = splitPnwSections(fixture("disease-powdery-mildew"));
    expect(sections.map((s) => s.label)).toEqual([
      "Cause",
      "Symptoms",
      "Cultural control",
      "Chemical control",
      "Combination Fungicides",
      "Note",
      "Forecasting",
      "Biological control",
      "References",
    ]);
  });

  it("does NOT mistake mid-sentence bold emphasis for a section", () => {
    // The page bolds "should" and "not be used on apples" inside a product bullet. Treating those
    // as labels would shatter Chemical control into fragments and strand content unclassified.
    const { sections } = splitPnwSections(fixture("disease-powdery-mildew"));
    const labels = sections.map((s) => s.label);
    expect(labels).not.toContain("should");
    expect(labels).not.toContain("not be used on apples");
    expect(labels).not.toContain("Oregon and Washington only");
  });

  it("finds the insect template's mgmt-head paragraphs", () => {
    const { sections } = splitPnwSections(fixture("insect-mealybug"));
    const labels = sections.map((s) => s.label);
    expect(labels).toContain("Pest description and crop damage");
    expect(labels).toContain("Biology and life history");
    expect(labels).toContain("Management-cultural control");
    expect(labels).toContain("Management-chemical control: HOME USE");
    expect(labels).toContain("Management-chemical control: COMMERCIAL USE");
  });

  it("returns zero sections (fail-open) on a template with no labels", () => {
    // The pesticide-safety template carries a single EMPTY bold span, which must not register.
    const { sections } = splitPnwSections(fixture("safety-wps"));
    expect(sections).toEqual([]);
  });

  it("covers the whole document body — no section's html is dropped between labels", () => {
    const html = fixture("disease-powdery-mildew");
    const { sections, preambleHtml } = splitPnwSections(html);
    const rejoined = preambleHtml + sections.map((s) => s.html).join("");
    expect(rejoined).toBe(html);
  });
});

describe("isProductSection — the tier-C boundary, by label", () => {
  it("matches the chemical and biological control headings in both templates", () => {
    for (const label of [
      "Chemical control",
      "Biological control",
      "Combination Fungicides",
      "Management-chemical control: HOME USE",
      "Management-chemical control: COMMERCIAL USE",
      "Management-biological control",
    ]) {
      expect(isProductSection(label), label).toBe(true);
    }
  });

  it("does NOT match the biology sections, cultural control included", () => {
    // Cultural control's bullets are vineyard PRACTICES — canopy work, sucker control, sanitation.
    // That is exactly the tier-A agronomy the corpus exists to hold, so it keeps its lists.
    for (const label of [
      "Cause",
      "Symptoms",
      "Cultural control",
      "Management-cultural control",
      "Pest description and crop damage",
      "Biology and life history",
      "Sampling and thresholds",
      "Forecasting",
      "References",
    ]) {
      expect(isProductSection(label), label).toBe(false);
    }
  });
});

describe("stripProductBlocks", () => {
  it("removes lists and tables but keeps paragraphs", () => {
    const html = `<p>Keep me.</p><ul><li>Drop me</li></ul><p>Me too.</p><table><tr><td>x</td></tr></table>`;
    const out = stripProductBlocks(html);
    expect(out).toContain("Keep me.");
    expect(out).toContain("Me too.");
    expect(out).not.toContain("Drop me");
    expect(out).not.toContain("<table");
  });
});

describe("applySectionFilter('pnw-label') — end to end through extraction", () => {
  it("keeps the resistance-management prose and drops the product bullets", async () => {
    const res = applySectionFilter(fixture("disease-powdery-mildew"), "pnw-label");
    expect(res.failedOpen).toBe(false);
    const md = (await extractHtml(res.html!, "https://pnwhandbooks.org/x")).markdown;

    // TIER B — the reason this source is worth having at all.
    expect(md).toContain("Resistance to FRAC 3 and 11 fungicides has been documented");
    expect(md).toContain("alternate or tank-mix materials from different groups");
    // TIER A — biology survives untouched.
    expect(md).toContain("Erysiphe necator");
    expect(md).toContain("whitish or grayish patches");
    // Cultural control keeps its practice bullets.
    expect(md).toContain("Practice timely sucker control");

    // TIER C — every product bullet with a rate is gone.
    expect(md).not.toContain("Abound at 10 to 15.5 fl oz/A");
    expect(md).not.toContain("Aprovia at 8.6 to 10.5 fl oz/A");
    expect(md).not.toContain("4-hr reentry");
    expect(md).not.toMatch(/fl oz\/A/);
  }, 20_000);

  it("drops the insect page's product lists in both HOME and COMMERCIAL sections", async () => {
    const res = applySectionFilter(fixture("insect-mealybug"), "pnw-label");
    const md = (await extractHtml(res.html!, "https://pnwhandbooks.org/x")).markdown;

    expect(md).toContain("Grape mealybugs are found in all three PNW states");
    expect(md).toContain("overwinter under loose bark");
    // The commercial section's prose about mating disruption is advisory, not a rate table.
    expect(md).toContain("Mating disruption");

    expect(md).not.toContain("buprofezin (Applaud) at 0.40 to 0.53 lb ai/A");
    expect(md).not.toContain("zeta-cypermethrin");
    expect(md).not.toMatch(/lb ai\/A/);
  }, 20_000);

  it("fails OPEN on the pesticide-safety template rather than emptying it", async () => {
    // Measured 0% product-signal density, so it needs no filtering — but the important property is
    // that an unrecognized template degrades to "unfiltered", never to "empty". The empty path
    // clears chunks, which would silently delete a working document.
    const res = applySectionFilter(fixture("safety-wps"), "pnw-label");
    expect(res.failedOpen).toBe(true);
    expect(res.html).not.toBeNull();
    const md = (await extractHtml(res.html!, "https://pnwhandbooks.org/x")).markdown;
    expect(md).toContain("Worker Protection Standard");
  }, 20_000);

  it("records the strip so a silently-stopped splitter is visible", () => {
    const res = applySectionFilter(fixture("disease-powdery-mildew"), "pnw-label");
    expect(res.dropped.length).toBeGreaterThan(0);
    expect(res.dropped.map((d) => d.heading)).toContain("Chemical control");
    expect(res.dropped[0].reason).toMatch(/product blocks stripped/);
  });

  it("leaves the anchor-heading strategy byte-identical (VT regression guard)", () => {
    const vt = fs.readFileSync(
      path.join(process.cwd(), "test", "fixtures", "knowledge", "vt", "EN-166.html"),
      "utf8",
    );
    expect(applySectionFilter(vt, "anchor-heading")).toEqual(applySectionFilter(vt));
  });
});

describe("strategy resolution and hashing", () => {
  it("resolves pnw-handbooks to the pnw-label strategy and its own version", () => {
    expect(resolveSectionFilter("html", "pnw-handbooks")).toEqual({
      strategy: "pnw-label",
      version: PNW_FILTER_VERSION,
    });
  });

  it("versions the two strategies independently", () => {
    // A single shared version would mean bumping one strategy re-indexes every document filtered by
    // the other, and — worse — two strategies at the same number would collide.
    expect(PNW_FILTER_VERSION).not.toBe(`${SECTION_FILTER_VERSION}-shared`);
    const RAW = "a".repeat(64);
    const a = deriveIndexHash({ rawContentHash: RAW, filter: { strategy: "anchor-heading", version: "1" } });
    const b = deriveIndexHash({ rawContentHash: RAW, filter: { strategy: "pnw-label", version: "1" } });
    expect(a).not.toBe(b);
  });
});
