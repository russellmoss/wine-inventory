// Plan 090 Units 4+5 — recover heading structure from a PDF's text items.
//
// THE BUG THIS FIXES. chunk.ts builds every chunk's section breadcrumb from a markdown heading stack
// (chunk.ts:36-90) and prepends it into `text` (chunk.ts:130) — the field that is embedded AND backs the
// GENERATED `search_vector`. extractPdf fed it unpdf's LINEARIZED text, which has no markdown headings
// at all, so the stack never pushed: every segment's breadcrumb collapsed to `rootTitle`, and when the
// PDF carried no metadata Title that was `firstNonEmptyLine()` — the first 200 characters of page one.
//
// Measured across the live corpus: 893 PDF documents / 11,051 chunks (42% of the whole corpus) carry
// exactly ONE distinct sectionPath, averaging 192 characters. A query matching that slab matches every
// chunk of the document equally, on the prefix alone, regardless of what the chunk is about. That is why
// a 2015 newsletter masthead won rank 1 for "best nutrients to add to Pinot noir fermentation".
//
// THE FIX. unpdf's `extractTextItems` exposes a first-class `fontSize` per item (verified on
// unpdf@1.6.2: items carry str/x/y/width/height/fontSize/fontFamily/dir/hasEOL). Lines set noticeably
// larger than the document's body-text size are headings. Emit them as markdown `#`/`##`/`###` and the
// EXISTING chunk.ts pipeline consumes them unchanged — the breadcrumb machinery was never broken, it was
// starved of input.
//
// ORDERING IS DELIBERATELY NOT TOUCHED. Items are consumed in the order pdf.js returns them, which is
// its reading order and demonstrably coherent today (the stored newsletter chunk reads as fluent
// English). Re-sorting by (y, x) to rebuild lines would interleave columns on multi-column layouts and
// make the body text WORSE while fixing the headings. Line breaks come from `hasEOL` / y-changes only.
//
// Pure and unit-testable: everything here operates on a plain array of items, no PDF needed.

export interface PdfTextItem {
  str: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  fontSize?: number;
  fontFamily?: string;
  hasEOL?: boolean;
}

export interface PdfLine {
  text: string;
  /** The size that covers the most characters on the line — resistant to a stray large glyph. */
  fontSize: number;
  page: number;
}

/**
 * Plan 090 Unit 7 — repair ligature mojibake from PDF text extraction.
 *
 * Two distinct problems, handled differently on purpose.
 *
 * 1. TRUE Unicode presentation forms (U+FB00-FB06). Unambiguous by definition — they exist only as
 *    typographic renderings of the letter pairs, so replacing them is always correct.
 *
 * 2. FONT-ENCODING mojibake. Some producers map their "tt"/"ti" ligature glyphs onto codepoints that
 *    are real letters elsewhere. Verified against the live corpus, with examples, not guessed:
 *      Ɵ  U+019F  "ViƟculture"  -> Viticulture  -> "ti"   (110 chunks)
 *      Ʃ  U+01A9  "NewsleƩer"   -> Newsletter   -> "tt"   (110 chunks)
 *    ⚠️ These are NOT ligature characters. U+019F and U+01A9 are LATIN CAPITAL LETTER O WITH MIDDLE
 *    TILDE and LATIN CAPITAL LETTER ESH, both used in African language orthographies. A blanket
 *    replacement would silently corrupt genuine text. They are therefore replaced ONLY when flanked by
 *    lowercase Latin letters, which is the mojibake signature (mid-word) and not how either letter is
 *    used legitimately.
 *
 * Deliberately NOT Unicode NFKC, which would also rewrite superscripts, the degree sign and micro sign
 * — characters that carry meaning in chemistry and units throughout this corpus (mg/L, °C, µ).
 */
const UNICODE_LIGATURES: [RegExp, string][] = [
  [/ﬀ/g, "ff"],
  [/ﬁ/g, "fi"],
  [/ﬂ/g, "fl"],
  [/ﬃ/g, "ffi"],
  [/ﬄ/g, "ffl"],
  [/ﬅ/g, "st"],
  [/ﬆ/g, "st"],
];

/**
 * Replaced whenever ATTACHED TO A WORD — a Latin letter on either side. Only a fully standalone
 * glyph (whitespace or punctuation on both sides) is left alone, which is the one shape a legitimate
 * U+019F / U+01A9 takes in running text.
 *
 * This scope was tightened twice, both times by running the real extractor over the real PDF rather
 * than by unit tests:
 *   1. lowercase-on-both-sides left ALL-CAPS headings broken ("VIƟCULTURE").
 *   2. any-letter-on-BOTH-sides still left 24 occurrences in one newsletter, because the mojibake is
 *      frequently WORD-INITIAL: "Ɵme" (time), "Ɵssue" (tissue), "Ɵming" (timing). Those are ordinary
 *      winemaking vocabulary, and leaving them broken defeats the lexical arm for exactly the words a
 *      grower would search.
 *
 * Residual risk is a genuine African-language word carrying either codepoint. This corpus is
 * English/French/Spanish/German/Catalan, and the measured damage was 110 chunks, so this is the right
 * trade — recorded here so a future multilingual expansion knows to revisit it.
 */
const ENCODING_MOJIBAKE: [RegExp, string][] = [
  [/(\p{L}?)Ɵ(\p{L}?)/gu, "ti"],
  [/(\p{L}?)Ʃ(\p{L}?)/gu, "tt"],
];

/**
 * Case-match the replacement to its surroundings. Splicing lowercase "ti" into an all-caps heading
 * yields "VItiCULTURE" — still retrievable (the lexical arm lowercases) but it is rendered to users in
 * citations, so it should read as "VITICULTURE".
 */
function matchCase(replacement: string, before: string, after: string): string {
  const upper = (c: string) => c !== "" && /\p{Lu}/u.test(c);
  const lower = (c: string) => c !== "" && /\p{Ll}/u.test(c);
  // Uppercase only when the evidence says so: an adjacent capital and no adjacent lowercase. That keeps
  // "NEWSLEƩER" -> NEWSLETTER while "InformaƟon" and word-initial "Ɵme" stay lowercase.
  return upper(before) || upper(after) ? (lower(before) || lower(after) ? replacement : replacement.toUpperCase()) : replacement;
}

export function normalizeLigatures(text: string): string {
  let out = text;
  for (const [re, rep] of UNICODE_LIGATURES) out = out.replace(re, rep);
  for (const [re, rep] of ENCODING_MOJIBAKE) {
    // Run to a fixed point: the pattern consumes its flanking letters, so adjacent occurrences
    // ("consƟtuƟon") would leave the second behind after a single pass.
    let prev: string;
    do {
      prev = out;
      out = out.replace(re, (m: string, b: string, a: string) =>
        // Both neighbours absent => a standalone glyph, which is legitimate text. Leave it exactly as is.
        b === "" && a === "" ? m : `${b}${matchCase(rep, b, a)}${a}`,
      );
    } while (out !== prev);
  }
  return out;
}

/** Sizes are bucketed to 0.5pt: PDF font sizes carry float noise (13.98 is a 14pt title). */
function bucket(size: number): number {
  return Math.round(size * 2) / 2;
}

/**
 * The document's body-text size, as the CHARACTER-weighted mode.
 *
 * Character-weighted, not item-weighted, because pdf.js emits word fragments and standalone spaces as
 * separate items — "Our", " ", "current" are three items. Counting items would let a run of tiny
 * whitespace items outvote the actual prose.
 */
export function bodyFontSize(lines: { text: string; fontSize: number }[]): number {
  const weight = new Map<number, number>();
  for (const l of lines) {
    const chars = l.text.trim().length;
    if (!chars || !(l.fontSize > 0)) continue;
    const b = bucket(l.fontSize);
    weight.set(b, (weight.get(b) ?? 0) + chars);
  }
  if (weight.size === 0) return 0;
  // Ties break toward the SMALLER size: body text is smaller than headings, so when two sizes cover
  // equal text the smaller one is the safer guess for "normal prose".
  return [...weight.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
}

/**
 * Group items into lines, preserving pdf.js's item order (see the header note on why we never re-sort).
 * A line ends on an explicit `hasEOL`, or when the vertical position moves by more than half the
 * prevailing font size (which catches producers that omit hasEOL).
 */
export function groupLines(pages: PdfTextItem[][]): PdfLine[] {
  const out: PdfLine[] = [];
  pages.forEach((items, pageIdx) => {
    let buf: PdfTextItem[] = [];
    const flush = () => {
      if (!buf.length) return;
      const text = buf.map((i) => i.str ?? "").join("").replace(/\s+/g, " ").trim();
      if (text) {
        // Character-weighted dominant size within the line, so one oversized drop-cap or footnote
        // marker cannot promote an ordinary sentence to a heading.
        const w = new Map<number, number>();
        for (const i of buf) {
          const chars = (i.str ?? "").trim().length;
          const fs = i.fontSize ?? i.height ?? 0;
          if (chars && fs > 0) w.set(bucket(fs), (w.get(bucket(fs)) ?? 0) + chars);
        }
        const dominant = w.size ? [...w.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0] : 0;
        out.push({ text, fontSize: dominant, page: pageIdx });
      }
      buf = [];
    };

    for (const it of items) {
      const prev = buf[buf.length - 1];
      const prevSize = prev?.fontSize ?? prev?.height ?? 0;
      const movedLine =
        prev !== undefined &&
        typeof it.y === "number" &&
        typeof prev.y === "number" &&
        Math.abs(it.y - prev.y) > Math.max(prevSize * 0.5, 1);
      if (movedLine) flush();
      buf.push(it);
      if (it.hasEOL) flush();
    }
    flush();
  });
  return out;
}

/** A line long enough to be prose is not a heading, however it is set. */
const MAX_HEADING_CHARS = 120;
/** How much larger than body text a line must be set to count as a heading. */
const HEADING_SIZE_RATIO = 1.15;

export function isHeadingLine(line: PdfLine, bodySize: number): boolean {
  if (bodySize <= 0 || line.fontSize <= 0) return false;
  if (line.fontSize < bodySize * HEADING_SIZE_RATIO) return false;
  const t = line.text.trim();
  if (t.length === 0 || t.length > MAX_HEADING_CHARS) return false;
  // Must contain a letter: page numbers, rules and figure captions set in a display face are not
  // structure, and promoting them would create breadcrumbs like "12 > 13".
  if (!/\p{L}/u.test(t)) return false;
  return true;
}

/**
 * Map each distinct heading size to a markdown level, largest size = `#`. Capped at 3 levels: chunk.ts
 * accepts `#{1,6}` but a breadcrumb assembled from six tiers is not a useful citation string, and PDF
 * size variation past three tiers is usually typography rather than hierarchy.
 */
export function assignHeadingLevels(headingSizes: number[]): Map<number, number> {
  const distinct = [...new Set(headingSizes.map(bucket))].sort((a, b) => b - a);
  const levels = new Map<number, number>();
  distinct.forEach((size, i) => levels.set(size, Math.min(i + 1, 3)));
  return levels;
}

export interface StructuredPdf {
  markdown: string;
  headingCount: number;
  bodySize: number;
}

/**
 * Render lines to markdown with `#` headings and blank-line-separated paragraphs.
 *
 * Consecutive body lines are joined into one paragraph, because chunk.ts treats a blank line as a
 * paragraph boundary and packs paragraphs into ~512-token chunks. Emitting every visual line as its own
 * paragraph would hand the chunker hundreds of one-line blocks and defeat its packing.
 */
export function linesToMarkdown(lines: PdfLine[]): StructuredPdf {
  const bodySize = bodyFontSize(lines);
  const headingSizes = lines.filter((l) => isHeadingLine(l, bodySize)).map((l) => l.fontSize);
  const levels = assignHeadingLevels(headingSizes);

  const out: string[] = [];
  let para: string[] = [];
  const flushPara = () => {
    if (para.length) out.push(para.join(" "));
    para = [];
  };

  for (const line of lines) {
    if (isHeadingLine(line, bodySize)) {
      flushPara();
      out.push(`${"#".repeat(levels.get(bucket(line.fontSize)) ?? 1)} ${line.text}`);
    } else {
      para.push(line.text);
    }
  }
  flushPara();

  return { markdown: out.join("\n\n"), headingCount: headingSizes.length, bodySize };
}

/** Length beyond which a candidate title is prose, not a title. Well under the old 200-char slab. */
const MAX_TITLE_CHARS = 110;

/**
 * Infer a document title from the first page's typography — Unit 4.
 *
 * The old behaviour (`firstNonEmptyLine`, 200 chars) is what put a whole welcome paragraph into every
 * chunk of the OWRI newsletter. This picks the largest-set line on page one instead, and REFUSES rather
 * than guesses: a null return lets the caller fall back, which is better than laundering a paragraph
 * into a title field that citation.ts renders to the user.
 */
export function inferTitle(lines: PdfLine[]): string | null {
  const firstPage = lines.filter((l) => l.page === 0 && l.text.trim());
  if (firstPage.length === 0) return null;

  // The guard is "does page one carry ANY typographic signal", tested directly as the number of
  // distinct bucketed sizes ON PAGE ONE.
  //
  // It deliberately does NOT compare against bodyFontSize(). Two ways that goes wrong, both caught by
  // fixtures: in a short document the title's own characters can outweigh the body, making the body
  // size equal to the title size so nothing ever clears the ratio; and a large banner on a LATER page
  // can dominate the whole-document mode, suppressing a perfectly good page-one title. Bucketing to
  // 0.5pt already absorbs float noise, so "more than one distinct size" means real variation.
  const sizesOnPage1 = new Set(firstPage.map((l) => bucket(l.fontSize)).filter((s) => s > 0));
  if (sizesOnPage1.size < 2) return null;

  const maxSize = Math.max(...firstPage.map((l) => l.fontSize));
  const candidates = firstPage.filter((l) => bucket(l.fontSize) === bucket(maxSize));
  // Multi-line titles are normal ("Manipulating Soil Moisture and Nitrogen Availability / Part II:
  // Effects on Pinot noir Must and Wine Composition"), so join runs set at the title size.
  const joined = candidates.map((l) => l.text.trim()).filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  if (!joined || !/\p{L}/u.test(joined)) return null;
  if (joined.length > MAX_TITLE_CHARS) {
    // Prefer the first line alone over truncating mid-word, but only if IT is a plausible title.
    const first = candidates[0]?.text.trim() ?? "";
    return first && first.length <= MAX_TITLE_CHARS && /\p{L}/u.test(first) ? first : null;
  }
  return joined;
}
