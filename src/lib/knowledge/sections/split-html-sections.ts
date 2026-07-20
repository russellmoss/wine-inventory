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
const BLOCK_CLOSE = /<\/(?:p|li|h[1-6]|div|blockquote)\s*>/gi;

/** Comments and script/style bodies, whose contents must never be mistaken for a section anchor. */
const MASKABLE = /<!--[\s\S]*?-->|<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;

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
 * Mask comments and script/style BODIES with spaces, preserving byte offsets exactly.
 *
 * Slicing always reads the ORIGINAL html; only the *searching* runs against the mask. Without this,
 * `<!-- <a name="1"></a> -->` becomes a section, which both invents junk sections and defeats the
 * "0 sections found on a non-T1 issue = unknown template" tripwire in verify-vt-enology.ts by making
 * the count non-zero on a page whose real anchors were never seen.
 */
function maskNonContent(html: string): string {
  MASKABLE.lastIndex = 0;
  return html.replace(MASKABLE, (match) => " ".repeat(match.length));
}

/** Ascending match offsets for a sticky-global regex. Scanned ONCE per document, not per anchor. */
function offsetsOf(re: RegExp, haystack: string): number[] {
  re.lastIndex = 0;
  const out: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(haystack))) {
    out.push(m.index);
    if (m.index === re.lastIndex) re.lastIndex++; // zero-width guard
  }
  return out;
}

/** Largest value in the ascending array that is strictly less than `limit`, or -1. */
function lastBefore(sorted: number[], limit: number): number {
  let lo = 0;
  let hi = sorted.length - 1;
  let best = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] < limit) {
      best = sorted[mid];
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best;
}

/** True if any value lies strictly between `lo` and `hi`. */
function anyBetween(sorted: number[], lo: number, hi: number): boolean {
  const c = lastBefore(sorted, hi);
  return c > lo;
}

/**
 * Back the slice start up from the anchor to its enclosing block tag.
 *
 * Slicing exactly at `<a name` lands INSIDE the `<p><strong>`, so the heading loses its bold in the
 * extracted markdown (`**1. Sustainable Winery Expansion**` degrades to plain text). Verified on 6
 * issues during the spike. Only backs up when no closing tag intervenes, so we never absorb the
 * previous section's tail.
 *
 * Takes PRE-SCANNED offset arrays rather than rescanning. The original implementation re-sliced the
 * document from index 0 and re-ran the block scan for every anchor — O(anchors x pageSize). Measured
 * on real input: 5 MB / 1000 anchors took 2.7s, and a dense-anchor page took 14s at 1 MB, which
 * extrapolates to roughly an hour at the 15 MB fetch cap. A hung monthly crawl, from a page shape
 * nobody would think to test.
 */
function blockStartFor(opens: number[], closes: number[], anchorIndex: number): number {
  const lastOpen = lastBefore(opens, anchorIndex);
  if (lastOpen < 0) return anchorIndex;
  // a closing tag between the block open and the anchor means the anchor is NOT inside that block
  if (anyBetween(closes, lastOpen, anchorIndex)) return anchorIndex;
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

  // Search the masked copy, slice the original. Offsets are identical by construction.
  const searchable = maskNonContent(html);
  const opens = offsetsOf(BLOCK_OPEN, searchable);
  const closes = offsetsOf(BLOCK_CLOSE, searchable);

  const hits: { anchor: string; start: number; afterAnchor: number }[] = [];
  SECTION_ANCHOR.lastIndex = 0;
  let m: RegExpExecArray | null;
  let prevStart = -1;
  while ((m = SECTION_ANCHOR.exec(searchable))) {
    let start = blockStartFor(opens, closes, m.index);
    // Starts MUST strictly increase, or a section gets a zero-length slice and its content is
    // silently folded into the NEXT section. When the next section is then dropped as an
    // announcement, the kept technical content disappears while the filter still reports it as
    // kept — silent data loss in exactly the case this feature exists to prevent.
    //
    // Happens whenever two anchors share one enclosing block, e.g.
    //   <p><a name="1"></a><strong>Rot Chemistry</strong> ... <a name="2"></a><strong>Tour</strong></p>
    // which is unremarkable in hand-written 1990s HTML (an omitted </p> is enough).
    // m.index always exceeds the previous start, so falling back to it restores monotonicity.
    if (start <= prevStart) start = m.index;
    prevStart = start;
    hits.push({ anchor: m[1], start, afterAnchor: m.index + m[0].length });
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
