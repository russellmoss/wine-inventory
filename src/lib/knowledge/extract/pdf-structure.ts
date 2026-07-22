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
  // Must START like a heading, not like the middle of a sentence.
  //
  // Found by running the real extractor over the AWRI fact sheets: size alone promoted body-text
  // fragments to headings, producing breadcrumbs such as "Fact Sheet > me know." and "… > come about?"
  // and "… > ask the". Every one of them starts lowercase because it is the tail of a wrapped sentence
  // that happened to be set a little larger. Real headings begin with a capital or a number.
  if (!/^[\p{Lu}\p{N}]/u.test(t)) return false;
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

/**
 * Plan 090 Unit 6 (a) — drop RUNNING HEADERS AND FOOTERS.
 *
 * Found by running the real extractor, not by reasoning: the OWRI newsletter repeats "Viticulture &
 * Enology" / "Technical Newsletter" at the top of all 13 pages, and because they are set larger than
 * body text every one of them became a heading. The result was breadcrumbs reading
 * "Viticulture & Enology > Viticulture & Enology > Technical Newsletter > Requirements for…" — the page
 * furniture crowding out the actual section name in the citation.
 *
 * A short line appearing on at least half the pages of a multi-page document is furniture by
 * construction; real prose does not repeat verbatim across a document. Guarded three ways: a minimum
 * page count (nothing to generalize from in a 2-page leaflet), a minimum absolute repeat count, and a
 * length ceiling so a genuinely repeated sentence of content is never eligible.
 */
export function dropRunningHeaders(lines: PdfLine[]): PdfLine[] {
  const pages = new Set(lines.map((l) => l.page));
  if (pages.size < 4) return lines;

  const seenOnPages = new Map<string, Set<number>>();
  for (const l of lines) {
    const key = l.text.trim();
    if (!key || key.length > 80) continue;
    if (!seenOnPages.has(key)) seenOnPages.set(key, new Set());
    seenOnPages.get(key)!.add(l.page);
  }
  const threshold = Math.max(3, Math.ceil(pages.size * 0.5));
  const furniture = new Set(
    [...seenOnPages.entries()].filter(([, p]) => p.size >= threshold).map(([t]) => t),
  );
  return furniture.size === 0 ? lines : lines.filter((l) => !furniture.has(l.text.trim()));
}

/**
 * Plan 090 Unit 6 (b) — structural boilerplate whose heading is unambiguous on its own.
 *
 * These are furniture in every document that has them, in every language in this corpus
 * (EN / FR / ES / DE / CA). Matching is WHOLE-HEADING after normalization, never substring, so
 * "Reference method for volatile acidity" and "Contents of the must" are untouched.
 */
const ALWAYS_DROP_HEADINGS =
  /^(?:acknowledge?ments?|acknowledgements?|remerciements|agradecimientos|agra[ïi]ments|danksagung|copyright(?:\s+notice)?|all\s+rights\s+reserved|table\s+of\s+contents|contents|in\s+this\s+issue|impressum)$/i;

/**
 * Bibliography-type headings. These drop ONLY when the section body actually looks like a
 * bibliography — see isBoilerplateSection. A "Further reading" section that contains real dosing
 * guidance must survive, which is exactly the false positive a heading-only rule would create.
 */
const BIBLIOGRAPHY_HEADINGS =
  /^(?:references?(?:\s+and\s+further\s+reading)?|further\s+reading|bibliograph(?:y|ie|ía|ia)|literature\s+cited|works\s+cited|r[ée]f[ée]rences|referencias|referencies|literatur(?:verzeichnis)?)$/i;

/** A line that reads like a citation: a bare year in parens, an "et al.", or a volume(issue):pages run. */
function looksLikeCitation(line: string): boolean {
  return (
    /\(\s*(?:19|20)\d{2}[a-z]?\s*\)/.test(line) ||
    /\bet\s+al\.?/i.test(line) ||
    /\b\d+\s*\(\s*\d+\s*\)\s*[:,]\s*\d+/.test(line) ||
    /\bpp?\.\s*\d+\s*[-–]\s*\d+/.test(line) ||
    /\bdoi:\s*10\./i.test(line)
  );
}

/**
 * Decide whether a section is boilerplate. Returns a reason (for logging) or null to keep.
 *
 * Fails OPEN like the plan-084 classifier: anything unrecognized is kept. Dropping a bibliography is a
 * small win; dropping a section of real winemaking guidance is a real loss, so the bibliography branch
 * demands corroborating evidence from the body rather than trusting the heading alone.
 */
export function isBoilerplateSection(heading: string, bodyLines: string[]): string | null {
  const h = heading.replace(/^#+\s*/, "").replace(/[:.]$/, "").replace(/\s+/g, " ").trim();
  if (!h) return null;
  if (ALWAYS_DROP_HEADINGS.test(h)) return `boilerplate heading: ${h}`;
  if (BIBLIOGRAPHY_HEADINGS.test(h)) {
    const meaningful = bodyLines.map((l) => l.trim()).filter((l) => l.length > 20);
    if (meaningful.length === 0) return `empty ${h} section`;
    const cited = meaningful.filter(looksLikeCitation).length;
    // Majority rule. A reference list is overwhelmingly citations; a "Further reading" section that is
    // really guidance will not clear this bar and is kept.
    if (cited / meaningful.length >= 0.5) return `bibliography: ${h} (${cited}/${meaningful.length} citation-shaped)`;
    return null;
  }
  return null;
}

export interface StructuredPdf {
  markdown: string;
  headingCount: number;
  bodySize: number;
  /** Reasons for each dropped section, for operator visibility. */
  dropped: string[];
  /**
   * Whether font size actually tracked document structure here. See `isConfident` — extractPdf only
   * uses the restructured markdown when this is true, otherwise it keeps today's linearized text.
   */
  confident: boolean;
  /** Why not, when `confident` is false. Empty when confident. */
  lowConfidenceReason: string;
}

/**
 * Does the inferred structure look like real structure?
 *
 * WHY THIS GATE EXISTS. Font size tracks structure beautifully in typeset reports and newsletters and
 * not at all in marketing-styled fact sheets, where body text is set at several sizes for emphasis. On
 * the AWRI fact sheets the size signal produced headings like "24/12, please let" and "T&C form. If" —
 * sentence fragments that merely happened to be set larger. Filtering those individually is
 * whack-a-mole and overfits to whichever document is in front of you.
 *
 * So instead of trusting per-line heuristics, judge the RESULT in aggregate and fall back wholesale
 * when it does not look like a table of contents. A document that resists structure then ends up
 * exactly where it is today rather than with a corpus of junk breadcrumbs. Failing soft is the whole
 * safety property of this change.
 *
 * Both thresholds are shape-based, not tuned to a specific document:
 *   - headings must be a MINORITY of lines. When a fifth of all lines are "headings", size is tracking
 *     emphasis, not hierarchy.
 *   - most headings must actually INTRODUCE something. A heading with no body under it is a fragment.
 */
const MAX_HEADING_RATIO = 0.2;
const MAX_ORPHAN_RATIO = 0.5;
const MIN_BODY_LINES_PER_HEADING = 2;

export function isConfident(
  headings: number,
  totalLines: number,
  orphanHeadings: number,
): { confident: boolean; reason: string } {
  if (headings < 2) return { confident: false, reason: `only ${headings} heading(s) found` };
  const headingRatio = headings / Math.max(totalLines, 1);
  if (headingRatio > MAX_HEADING_RATIO) {
    return { confident: false, reason: `${Math.round(headingRatio * 100)}% of lines look like headings (max ${MAX_HEADING_RATIO * 100}%)` };
  }
  const orphanRatio = orphanHeadings / headings;
  if (orphanRatio > MAX_ORPHAN_RATIO) {
    return { confident: false, reason: `${orphanHeadings}/${headings} headings introduce no content` };
  }
  return { confident: true, reason: "" };
}

/**
 * Render lines to markdown with `#` headings and blank-line-separated paragraphs.
 *
 * Consecutive body lines are joined into one paragraph, because chunk.ts treats a blank line as a
 * paragraph boundary and packs paragraphs into ~512-token chunks. Emitting every visual line as its own
 * paragraph would hand the chunker hundreds of one-line blocks and defeat its packing.
 */
export function linesToMarkdown(input: PdfLine[]): StructuredPdf {
  // Page furniture first: it is set larger than body text, so leaving it in would let every repeated
  // header become a heading and dominate the breadcrumbs (Unit 6a).
  const lines = dropRunningHeaders(input);

  const bodySize = bodyFontSize(lines);
  const headingSizes = lines.filter((l) => isHeadingLine(l, bodySize)).map((l) => l.fontSize);
  const levels = assignHeadingLevels(headingSizes);

  // Split into sections so a boilerplate heading takes its BODY with it. Dropping the heading alone
  // would orphan a reference list under whatever section preceded it, which is worse than leaving it.
  interface Section {
    heading: PdfLine | null;
    body: PdfLine[];
  }
  const sections: Section[] = [{ heading: null, body: [] }];
  for (const line of lines) {
    if (isHeadingLine(line, bodySize)) {
      const last = sections[sections.length - 1];
      // MERGE consecutive heading lines set at the same size into ONE heading. A title that wraps onto
      // a second line is two items in the stream but one heading, and treating them separately produced
      // breadcrumbs like "Strobilurin resistance to powdery mildew in a vineyard > mildew in a vineyard".
      // Only merge when nothing has intervened (the previous section has no body yet), so two genuinely
      // adjacent sibling headings with content between them are unaffected.
      if (last.heading && last.body.length === 0 && bucket(last.heading.fontSize) === bucket(line.fontSize)) {
        last.heading = { ...last.heading, text: `${last.heading.text} ${line.text}`.replace(/\s+/g, " ").trim() };
        continue;
      }
      sections.push({ heading: line, body: [] });
    } else {
      sections[sections.length - 1].body.push(line);
    }
  }

  const dropped: string[] = [];
  const out: string[] = [];
  let kept = 0;
  let orphans = 0;
  for (const s of sections) {
    if (s.heading) {
      const reason = isBoilerplateSection(s.heading.text, s.body.map((b) => b.text));
      if (reason) {
        dropped.push(reason);
        continue;
      }
      out.push(`${"#".repeat(levels.get(bucket(s.heading.fontSize)) ?? 1)} ${s.heading.text}`);
      kept++;
      if (s.body.length < MIN_BODY_LINES_PER_HEADING) orphans++;
    }
    // Consecutive body lines become ONE paragraph: chunk.ts packs paragraphs into ~512-token chunks,
    // so one-line-per-paragraph would hand it hundreds of tiny blocks and defeat the packing.
    if (s.body.length) out.push(s.body.map((b) => b.text).join(" "));
  }

  const { confident, reason } = isConfident(kept, lines.length, orphans);
  return {
    markdown: out.join("\n\n"),
    headingCount: kept,
    bodySize,
    dropped,
    confident,
    lowConfidenceReason: reason,
  };
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
