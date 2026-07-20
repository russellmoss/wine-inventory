// Plan 084 Unit 1 — split a raw HTML page into anchor-delimited sections.
//
// Why RAW html and not the extracted markdown: Defuddle prunes empty inline elements, and every
// section anchor on these pages is an EMPTY <a name="3" id="3"></a>. Measured on EN-166: 12 anchors
// in the source, 0 survivors in the markdown. Post-extraction splitting is not possible, so this
// runs before extraction (see index-documents.ts).
//
// Pure: no I/O, no DOM library. A regex is the right tool here precisely because we are NOT parsing
// the document — we only need byte offsets to slice at, and the anchors are unambiguous.

export interface HtmlSection {
  /** The raw numeric anchor id: "1", "2a", "29bii". Preserves sub-section nesting for the caller. */
  anchor: string;
  /** Normalized visible heading text, tags stripped and whitespace collapsed. May be "". */
  headingText: string;
  /** The raw HTML slice for this section, starting at its enclosing block tag. */
  html: string;
}

export interface SplitHtmlResult {
  sections: HtmlSection[];
  /**
   * Everything before the first section: nav, masthead, table of contents. Discarded by the caller
   * for a split page. When `sections` is empty this is the WHOLE document — a T1-era (#1-40)
   * anchorless page, which the caller must fail open on rather than treat as empty.
   */
  preambleHtml: string;
}

// `\s+` is load-bearing: EN-50 is literally `<a\nname="1">`, which a line-based match misses.
// `[a-z]*` (not `?`) is load-bearing: EN-159 has `29bi` and `29bii`. With `?` the splitter finds
// 31 anchors instead of 33 and silently merges two subsections into their parent.
// Numeric-only is load-bearing: it ignores the T3 chrome anchors (skip-menu, MainContent,
// vtsearchform) without needing a denylist.
const SECTION_ANCHOR = /<a\s+name="([0-9]+[a-z]*)"[^>]*>/gi;

const BLOCK_OPEN = /<(?:p|li|h[1-6]|div|blockquote)\b[^>]*>/gi;
const BLOCK_CLOSE = /<\/(?:p|li|h[1-6]|div|blockquote)\s*>/i;

/** Terminators for a heading run. First one wins. */
const HEADING_END = /<\/(?:strong|b|p|h[1-6]|li|div)\s*>/i;

/** Raw bytes scanned for a heading before giving up (a page can omit the closing tag entirely). */
const HEADING_RAW_LIMIT = 600;
/** Final heading length cap, after tag stripping. */
const HEADING_TEXT_LIMIT = 300;

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
};

function decodeEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, body: string) => {
    if (body.startsWith("#")) {
      const cp = body[1]?.toLowerCase() === "x" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(cp) && cp > 0 ? String.fromCodePoint(cp) : whole;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? whole;
  });
}

/**
 * Back the slice start up from the anchor to its enclosing block tag.
 *
 * Slicing exactly at `<a name` lands INSIDE the `<p><strong>`, so the heading loses its bold in the
 * extracted markdown (`**1. Sustainable Winery Expansion**` degrades to plain text). Verified on 6
 * issues during the spike. Only backs up when no closing tag intervenes, so we never absorb the
 * previous section's tail.
 */
function blockStartFor(html: string, anchorIndex: number): number {
  const before = html.slice(0, anchorIndex);
  BLOCK_OPEN.lastIndex = 0;
  let lastOpen = -1;
  let m: RegExpExecArray | null;
  while ((m = BLOCK_OPEN.exec(before))) lastOpen = m.index;
  if (lastOpen < 0) return anchorIndex;
  // a closing tag between the block open and the anchor means the anchor is NOT inside that block
  if (BLOCK_CLOSE.test(before.slice(lastOpen))) return anchorIndex;
  return lastOpen;
}

function headingAfter(html: string, from: number): string {
  const raw = html.slice(from, from + HEADING_RAW_LIMIT);
  const end = raw.search(HEADING_END);
  const run = end >= 0 ? raw.slice(0, end) : raw;
  const text = decodeEntities(run.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
  return text.length > HEADING_TEXT_LIMIT ? text.slice(0, HEADING_TEXT_LIMIT).trimEnd() : text;
}

export function splitHtmlSections(html: string): SplitHtmlResult {
  if (!html) return { sections: [], preambleHtml: "" };

  const hits: { anchor: string; start: number; afterAnchor: number }[] = [];
  SECTION_ANCHOR.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = SECTION_ANCHOR.exec(html))) {
    hits.push({
      anchor: m[1],
      start: blockStartFor(html, m.index),
      afterAnchor: m.index + m[0].length,
    });
  }

  // T1 (#1-40, ~24% of the corpus) has no anchors at all. That is a valid page, not an empty one —
  // the caller fails open and ingests it whole.
  if (hits.length === 0) return { sections: [], preambleHtml: html };

  const sections: HtmlSection[] = hits.map((hit, i) => ({
    anchor: hit.anchor,
    headingText: headingAfter(html, hit.afterAnchor),
    html: html.slice(hit.start, hits[i + 1]?.start ?? html.length),
  }));

  return { sections, preambleHtml: html.slice(0, hits[0].start) };
}
