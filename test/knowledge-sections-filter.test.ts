import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  applySectionFilter,
  deriveIndexHash,
  resolveSectionFilter,
  shouldApplySectionFilter,
  SECTION_FILTER_VERSION,
} from "@/lib/knowledge/sections";
import { CHUNKER_VERSION } from "@/lib/knowledge/chunk";
import { PDF_EXTRACT_VERSION } from "@/lib/knowledge/extract/pdf-structure";
import { extractHtml } from "@/lib/knowledge/extract/html";

const FIXTURES = path.join(process.cwd(), "test", "fixtures", "knowledge", "vt");
const fixture = (n: number) => fs.readFileSync(path.join(FIXTURES, `EN-${n}.html`), "utf8");

describe("applySectionFilter — EN-166 (the user's named page)", () => {
  const res = applySectionFilter(fixture(166));

  it("drops exactly the announcement sections and keeps the chemistry", () => {
    expect(res.keptAnchors).toEqual(["1", "2", "2a", "2b"]);
    expect(res.dropped.map((d) => d.anchor)).toEqual(["3", "4", "5"]);
  });

  it("removes the two sections the user named on this page (#3 and #5)", () => {
    const byAnchor = Object.fromEntries(res.dropped.map((d) => [d.anchor, d]));
    expect(byAnchor["3"].heading).toContain("Technical Study Tour");
    expect(byAnchor["3"].reason).toMatch(/event/i);
    expect(byAnchor["5"].heading).toContain("Our New Research Enologist");
    expect(byAnchor["5"].reason).toMatch(/personnel/i);
  });

  it("keeps the rot-metabolite chemistry that shares the page with them", () => {
    expect(res.html).toContain("Production Considerations");
    expect(res.html).toContain("Polysaccharides");
    expect(res.html).not.toContain("Amanda Stewart"); // the staff hire
    expect(res.html).not.toContain("9 day technical study tour");
  });

  it("does not fail open on a page that has anchors", () => {
    expect(res.failedOpen).toBe(false);
  });
});

describe("applySectionFilter — T1 fail-open (EN-5, 2000)", () => {
  const res = applySectionFilter(fixture(5));

  it("passes an anchorless page through WHOLE rather than reporting it empty", () => {
    // ~24% of the VT corpus is T1. Returning null here would silently drop ~40 issues while the
    // crawl still reported success -- the failure mode is invisible.
    expect(res.failedOpen).toBe(true);
    expect(res.html).not.toBeNull();
    expect(res.html).toContain("Lab policy");
  });
});

describe("applySectionFilter — all-dropped page", () => {
  it("returns null when sections exist but none survive", () => {
    const html =
      `<p><strong><a name="1"></a>1. Wine Filtration Workshop, February 10</strong></p><p>Register now.</p>` +
      `<p><strong><a name="2"></a>2. In Remembrance</strong></p><p>He will be missed.</p>`;
    const res = applySectionFilter(html);
    expect(res.html).toBeNull();
    expect(res.failedOpen).toBe(false);
    expect(res.dropped).toHaveLength(2);
  });
});

describe("Defuddle survives the synthesized body (spike risk R3)", () => {
  it("extracts the kept prose from EN-166 verbatim and does not trip lowConfidence", async () => {
    const res = applySectionFilter(fixture(166));
    const extracted = await extractHtml(res.html!, "https://enology.fst.vt.edu/EN/166.html");

    // lowConfidence for HTML is `markdown.length < 80` in extract/index.ts
    expect(extracted.markdown.length).toBeGreaterThan(80);
    // real prose from a KEPT section survives
    expect(extracted.markdown).toContain("Summer rains are the norm for the mid-Atlantic region");
    // and the DROPPED sections are genuinely gone from what gets embedded
    expect(extracted.markdown).not.toContain("Amanda Stewart");
    expect(extracted.markdown).not.toContain("non-refundable deposit");
  }, 20_000);

  it("keeps the heading's bold through extraction (proves the block-tag slice start)", async () => {
    const res = applySectionFilter(fixture(166));
    const extracted = await extractHtml(res.html!, "https://enology.fst.vt.edu/EN/166.html");
    expect(extracted.markdown).toMatch(/\*\*1\\?\.\s*Production Considerations/);
  }, 20_000);

  it("strips the T2 left-nav soup that Defuddle fails to remove on its own", async () => {
    // Free win: EN-112 leaks ~2KB of nav links through Defuddle. The nav lives in the preamble,
    // so anchor slicing removes it before extraction ever runs.
    const raw = await extractHtml(fixture(112), "https://enology.fst.vt.edu/EN/112.html");
    const filtered = applySectionFilter(fixture(112));
    const clean = await extractHtml(filtered.html!, "https://enology.fst.vt.edu/EN/112.html");

    expect(raw.markdown).toContain("Skip menu");
    expect(clean.markdown).not.toContain("Skip menu");
    expect(clean.markdown).toContain("Sauvignon blanc");
  }, 20_000);
});

describe("shouldApplySectionFilter — the gate", () => {
  it("applies only to HTML from a source that declares the filter", () => {
    expect(shouldApplySectionFilter("html", "vt-enology-notes")).toBe(true);
  });

  it("never applies to a PDF, even from the filtered source", () => {
    // VT seeds 7 PDF-only notes (#167-170); they carry no anchors, so filtering them would find
    // nothing and fail open -- masking the mistake instead of surfacing it.
    expect(shouldApplySectionFilter("pdf", "vt-enology-notes")).toBe(false);
  });

  it("leaves every pre-084 source untouched", () => {
    expect(shouldApplySectionFilter("html", "awri")).toBe(false);
    expect(shouldApplySectionFilter("html", "wsu")).toBe(false);
    expect(shouldApplySectionFilter("html", undefined)).toBe(false);
  });

  it("falls back to no-filter for a source row with no config entry", () => {
    expect(shouldApplySectionFilter("html", "ghost-source-not-in-config")).toBe(false);
  });
});

describe("applySectionFilter — null is reserved for all-dropped", () => {
  it("fails open (html NOT null) on empty or tagless input", () => {
    // index-documents.ts branches on `filtered.html === null` to return skipped:"empty".
    // A later refactor to a falsy check would silently invert this for the empty-string case.
    for (const input of ["", "   ", "just plain text, no tags at all"]) {
      const res = applySectionFilter(input);
      expect(res.html).not.toBeNull();
      expect(res.failedOpen).toBe(true);
      expect(res.dropped).toEqual([]);
    }
  });
});

describe("deriveIndexHash — R1, the silent no-op guard", () => {
  const RAW = "a".repeat(64);
  const ANCHOR = { strategy: "anchor-heading", version: SECTION_FILTER_VERSION } as const;

  // Plan 099 Unit 1b — the signature moved from positional flags to a payload object, and the
  // chunker version is now folded in UNCONDITIONALLY. That is a deliberate behaviour change: the
  // old "no version component => bare content hash" shortcut meant a chunker fix could never reach
  // an already-indexed HTML document with unchanged bytes, which is exactly how the v1 text-loss
  // bug would have survived its own fix.
  it("no longer passes the raw hash through, because every document is chunked", () => {
    expect(deriveIndexHash({ rawContentHash: RAW })).not.toBe(RAW);
  });

  it("is deterministic for a given set of versions", () => {
    expect(deriveIndexHash({ rawContentHash: RAW })).toBe(deriveIndexHash({ rawContentHash: RAW }));
  });

  it("moves when CHUNKER_VERSION moves, forcing a genuine re-index of every document", () => {
    const current = deriveIndexHash({ rawContentHash: RAW });
    const asIfBumped = deriveIndexHash({ rawContentHash: RAW, chunkerVersion: "999" });
    expect(asIfBumped).not.toBe(current);
  });

  describe("PDF extractor version", () => {
    it("keeps the PDF component independent of the section-filter component", () => {
      // HTML documents must not be dragged into a needless re-index by a PDF-only change.
      expect(deriveIndexHash({ rawContentHash: RAW, isPdf: true })).not.toBe(
        deriveIndexHash({ rawContentHash: RAW, isPdf: false }),
      );
      expect(deriveIndexHash({ rawContentHash: RAW, filter: ANCHOR, isPdf: false })).toBe(
        deriveIndexHash({ rawContentHash: RAW, filter: ANCHOR }),
      );
    });

    it("is deterministic, and distinct from the section-filter-only hash", () => {
      expect(deriveIndexHash({ rawContentHash: RAW, isPdf: true })).toBe(
        deriveIndexHash({ rawContentHash: RAW, isPdf: true }),
      );
      expect(deriveIndexHash({ rawContentHash: RAW, isPdf: true })).not.toBe(
        deriveIndexHash({ rawContentHash: RAW, filter: ANCHOR }),
      );
    });

    it("moves when PDF_EXTRACT_VERSION moves", () => {
      const current = deriveIndexHash({ rawContentHash: RAW, isPdf: true });
      const asIfBumped = crypto
        .createHash("sha256")
        .update(`${RAW}|pdf:${Number(PDF_EXTRACT_VERSION) + 1}|ck:${CHUNKER_VERSION}`)
        .digest("hex");
      expect(asIfBumped).not.toBe(current);
    });
  });

  it("changes the stored hash when a filter IS applied", () => {
    expect(deriveIndexHash({ rawContentHash: RAW, filter: ANCHOR })).not.toBe(
      deriveIndexHash({ rawContentHash: RAW }),
    );
  });

  it("moves when SECTION_FILTER_VERSION moves, forcing a genuine re-index", () => {
    // Without this, tuning a drop pattern is a silent no-op: the raw bytes are unchanged, so
    // indexDocument short-circuits to skipped:"unchanged" forever.
    const current = deriveIndexHash({ rawContentHash: RAW, filter: ANCHOR });
    const asIfBumped = deriveIndexHash({
      rawContentHash: RAW,
      filter: { strategy: "anchor-heading", version: String(Number(SECTION_FILTER_VERSION) + 1) },
    });
    expect(asIfBumped).not.toBe(current);
  });

  // Council SHOULD-FIX 2/3 — a boolean could not express WHICH strategy applied, so two strategies
  // at the same version number would collide and a source switching between them would short-circuit
  // as "unchanged", keeping the old strategy's chunks live forever.
  it("distinguishes two strategies that share a version number", () => {
    const a = deriveIndexHash({ rawContentHash: RAW, filter: { strategy: "anchor-heading", version: "1" } });
    const b = deriveIndexHash({
      rawContentHash: RAW,
      // Cast: "body-heading" joins the union in PR C. Pinning the guarantee now is the point of
      // settling the payload shape in PR A — PR C must only add a member, never reshape the hash.
      filter: { strategy: "body-heading" as unknown as "anchor-heading", version: "1" },
    });
    expect(a).not.toBe(b);
  });

  it("leaves an unfiltered document unaffected by a filter-version bump", () => {
    const unfiltered = deriveIndexHash({ rawContentHash: RAW });
    const unfilteredAgain = deriveIndexHash({ rawContentHash: RAW, filter: null });
    expect(unfiltered).toBe(unfilteredAgain);
  });
});

describe("resolveSectionFilter — which strategy, not merely whether", () => {
  it("resolves the configured strategy with its version", () => {
    expect(resolveSectionFilter("html", "vt-enology-notes")).toEqual({
      strategy: "anchor-heading",
      version: SECTION_FILTER_VERSION,
    });
  });

  it("returns null for PDFs, unconfigured sources, and unknown keys", () => {
    expect(resolveSectionFilter("pdf", "vt-enology-notes")).toBeNull();
    expect(resolveSectionFilter("html", "awri")).toBeNull();
    expect(resolveSectionFilter("html", undefined)).toBeNull();
    expect(resolveSectionFilter("html", "ghost-source-not-in-config")).toBeNull();
  });
});
