import { describe, it, expect } from "vitest";
import {
  escapeHtml,
  renderTombstoneHtml,
  buildTombstoneExcerpt,
  TOMBSTONE_EXCERPT_CHARS,
} from "@/lib/knowledge/citation";

describe("citation tombstone rendering", () => {
  it("escapes untrusted crawled text (no HTML/script injection)", () => {
    const html = renderTombstoneHtml({
      kind: "tombstone",
      title: "Brett <script>alert(1)</script>",
      publisher: "AWRI",
      withdrawnAt: new Date("2026-01-15T00:00:00Z"),
      excerpt: "Sanitize at 85C </blockquote><script>evil()</script>",
      truncated: false,
      canonicalUrl: "https://awri.com.au/x",
    });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).not.toContain("<script>evil()</script>");
    expect(html).not.toContain("</blockquote><script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("2026-01-15");
    expect(html).toContain("withdrawn by the publisher");
  });

  it("escapeHtml handles the five entities", () => {
    expect(escapeHtml(`<>&"'`)).toBe("&lt;&gt;&amp;&quot;&#39;");
  });

  it("warns that a withdrawal may be a retraction", () => {
    const html = renderTombstoneHtml({
      kind: "tombstone",
      title: "Doc",
      publisher: "AWRI",
      withdrawnAt: null,
      excerpt: "Some text.",
      truncated: true,
      canonicalUrl: "https://awri.com.au/x",
    });
    expect(html).toContain("retracted");
    // the page must not invite search engines to re-host what the publisher pulled
    expect(html).toContain('content="noindex, noarchive"');
    // truncation is disclosed, so the reader never mistakes the excerpt for the document
    expect(html).toContain("the full document is not reproduced here");
  });

  it("handles a document with no chunks without rendering an empty quote block", () => {
    const html = renderTombstoneHtml({
      kind: "tombstone",
      title: "Doc",
      publisher: "AWRI",
      withdrawnAt: null,
      excerpt: "",
      truncated: false,
      canonicalUrl: "https://awri.com.au/x",
    });
    expect(html).toContain("No excerpt of this document is available.");
    expect(html).not.toContain("<blockquote>");
  });
});

describe("buildTombstoneExcerpt", () => {
  it("strips the breadcrumb prefix so the excerpt reads as prose", () => {
    const { excerpt, truncated } = buildTombstoneExcerpt([
      { sectionPath: "Winemaking > Brett", text: "Winemaking > Brett Sanitation begins at the press." },
    ]);
    expect(excerpt).toBe("Sanitation begins at the press.");
    expect(truncated).toBe(false);
  });

  it("joins short chunks in order when they fit under the cap", () => {
    const { excerpt } = buildTombstoneExcerpt([
      { sectionPath: "A", text: "first" },
      { sectionPath: "A", text: "second" },
    ]);
    expect(excerpt).toBe("first\n\nsecond");
  });

  // THE control: the excerpt cap is what keeps a withdrawn document from being re-served in full.
  it("never exceeds the cap, and flags truncation", () => {
    const long = "word ".repeat(2000);
    const { excerpt, truncated } = buildTombstoneExcerpt([{ sectionPath: "A", text: long }]);
    expect(truncated).toBe(true);
    expect(excerpt.length).toBeLessThanOrEqual(TOMBSTONE_EXCERPT_CHARS + 1); // +1 for the ellipsis
    expect(excerpt.endsWith("…")).toBe(true);
    expect(excerpt).not.toContain("  ");
  });

  it("cuts at a word boundary rather than mid-word", () => {
    const { excerpt } = buildTombstoneExcerpt(
      [{ sectionPath: "A", text: "alpha bravo charlie delta echo foxtrot" }],
      20,
    );
    expect(excerpt).toBe("alpha bravo charlie…");
  });

  it("falls back to a hard cut when there is no nearby word boundary", () => {
    // a 600-char unbroken run (a URL, a mangled PDF table) must not collapse the excerpt to nothing
    const { excerpt, truncated } = buildTombstoneExcerpt([{ sectionPath: "A", text: "x".repeat(1000) }], 20);
    expect(truncated).toBe(true);
    expect(excerpt).toBe(`${"x".repeat(20)}…`);
  });

  it("returns empty (not truncated) for a document with no chunks", () => {
    expect(buildTombstoneExcerpt([])).toEqual({ excerpt: "", truncated: false });
  });
});
