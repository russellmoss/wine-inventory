// Plan 100 Unit 7 — the PNW Pest Management Handbooks section splitter.
//
// WHY A SECOND STRATEGY. `split-html-sections.ts` keys on `<a name="N">` anchors, which VT Enology
// Notes has and PNW does not. PNW marks a section with a label at the START of a paragraph, in two
// different templates:
//
//   disease (/plantdisease/):  <p class="body-text"><span class="Text-bold">Chemical control </span>…
//   insect  (/insect/):        <p class="mgmt-head">Management-chemical control: HOME USE</p>
//
// The paragraph-START restriction is load-bearing on the disease template. `Text-bold` is also used
// for ordinary mid-sentence emphasis ("Sprayers used to apply Abound **should** **not be used on
// apples**"), and treating those as section labels would shatter one section into several and drop
// content that was never classified.
//
// WHY THE CUT IS BLOCK-LEVEL, NOT SECTION-LEVEL. Council C8 (Gemini) caught this and it changed the
// design. The `Chemical control` section opens with three paragraphs of application timing and
// fungicide RESISTANCE MANAGEMENT — "Resistance to FRAC 3 and 11 has been documented in Oregon and
// Washington… alternate or tank-mix materials from different groups… limit applications from any
// specific group to two or fewer sprays" — and only THEN gives ~30 product bullets. The prose is
// tier B and is arguably the best content on the page; the bullets are tier C. Dropping the whole
// section by its heading would have thrown away both.
//
// So a management section keeps its <p> and loses its <ul>/<ol>/<table>. A biology section keeps
// everything, bullets included — Cultural control's bullets are vineyard PRACTICES ("Practice timely
// sucker control"), not products.
//
// This is a filter, not a guarantee. KB-1's `assessProductTable` still runs over whatever survives.

export interface PnwSection {
  /** The section label as written, e.g. "Chemical control" or "Management-chemical control: HOME USE". */
  label: string;
  /** Raw HTML of the section, label paragraph included. */
  html: string;
  /** Where the label was found, for deterministic ordering + tests. */
  offset: number;
}

export interface SplitPnwResult {
  sections: PnwSection[];
  /** Everything before the first label. Nav soup and image captions — never emitted. */
  preambleHtml: string;
}

/** A label paragraph in either template. Captures the label text in group 1 or 2. */
const LABEL_RE =
  /<p[^>]*class="[^"]*\bmgmt-head\b[^"]*"[^>]*>([\s\S]{0,120}?)<\/p>|<p[^>]*>\s*<span[^>]*class="[^"]*\bText-bold\b[^"]*"[^>]*>([\s\S]{0,120}?)<\/span>/gi;

/** Comments and script/style bodies, masked to spaces so offsets stay exact. */
const MASKABLE = /<!--[\s\S]*?-->|<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>/gi;

function maskNonContent(html: string): string {
  MASKABLE.lastIndex = 0;
  return html.replace(MASKABLE, (m) => " ".repeat(m.length));
}

function textOf(fragment: string): string {
  return fragment
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Split a PNW page into label-led sections.
 *
 * Fails OPEN by returning zero sections when no label is found — the caller ingests the page whole
 * rather than dropping it. A page shape we have not seen must degrade to "unfiltered", never to
 * "empty", because the empty path clears chunks and would silently delete a working document.
 */
export function splitPnwSections(html: string): SplitPnwResult {
  const mask = maskNonContent(html);
  LABEL_RE.lastIndex = 0;

  const starts: { offset: number; label: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = LABEL_RE.exec(mask))) {
    const label = textOf(m[1] ?? m[2] ?? "");
    // An empty bold span is a styling artifact, not a section (the pesticide-safety template has one).
    if (label) starts.push({ offset: m.index, label });
    if (m.index === LABEL_RE.lastIndex) LABEL_RE.lastIndex++;
  }

  if (starts.length === 0) return { sections: [], preambleHtml: html };

  const sections: PnwSection[] = starts.map((s, i) => ({
    label: s.label,
    offset: s.offset,
    html: html.slice(s.offset, i + 1 < starts.length ? starts[i + 1].offset : undefined),
  }));

  return { sections, preambleHtml: html.slice(0, starts[0].offset) };
}

/**
 * Does this section label mark PRODUCT-DIRECTED management advice?
 *
 * Matches the chemical/biological control headings in both templates, including the insect
 * template's `Management-chemical control: COMMERCIAL USE` and the disease template's
 * `Combination Fungicides` sub-heading.
 *
 * `Cultural control` is deliberately NOT here. Its bullets are practices (canopy work, sucker
 * control, sanitation), which is exactly the tier-A agronomy the corpus exists to hold.
 */
export function isProductSection(label: string): boolean {
  return /chemical\s+control|biological\s+control|combination\s+fungicide|fungicide[s]?\s+for|insecticide[s]?\s+for/i.test(
    label,
  );
}

/**
 * Find every TOP-LEVEL block of the given tags, as [start, end) offsets.
 *
 * Written as a depth-tracking scan rather than a regex because PNW nests its lists — the product
 * bullets sit in `<ul><li>…<ul><li>…</ul></li></ul>`. A lazy `<ul\b[\s\S]*?<\/ul>` matches up to the
 * INNER `</ul>`, which leaves the outer list's remaining rows in the document. That is not a
 * cosmetic miss: on the mealybug fixture it left `phosmet (Imidan 70W) at 1.0 to 1.5 lb ai/A`
 * indexed, which is exactly the tier-C row this filter exists to remove.
 */
function topLevelBlocks(html: string, tags: readonly string[]): { start: number; end: number }[] {
  const re = new RegExp(`<(/?)(?:${tags.join("|")})\\b[^>]*>`, "gi");
  const out: { start: number; end: number }[] = [];
  let depth = 0;
  let start = -1;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const closing = m[1] === "/";
    // A self-closing or void form would never balance; tables/lists are never written that way, and
    // if one were, depth simply stays open and the trailing text is kept (fail-open).
    if (!closing) {
      if (depth === 0) start = m.index;
      depth++;
    } else if (depth > 0) {
      depth--;
      if (depth === 0 && start >= 0) {
        out.push({ start, end: m.index + m[0].length });
        start = -1;
      }
    }
  }
  return out;
}

function removeSpans(html: string, spans: { start: number; end: number }[]): string {
  if (spans.length === 0) return html;
  let out = "";
  let cursor = 0;
  for (const s of spans) {
    out += html.slice(cursor, s.start) + " ";
    cursor = s.end;
  }
  return out + html.slice(cursor);
}

const BLOCK_TAGS = ["ul", "ol", "table"] as const;

/** Strip every list and table block from a fragment, leaving paragraphs and headings intact. */
export function stripProductBlocks(sectionHtml: string): string {
  return removeSpans(sectionHtml, topLevelBlocks(sectionHtml, BLOCK_TAGS));
}

/**
 * Signals that a block is a product→fact row rather than agronomic prose: an application rate, a
 * re-entry or preharvest interval, or a resistance-group code attached to a product.
 */
const RATE_SIGNALS: RegExp[] = [
  /\d+(?:\.\d+)?\s*(?:fl\s*oz|lb\s*ai|lb|oz|gal|pt|qt|g|kg|mL|L)\s*(?:\/|per\s+)\s*(?:A\b|acre|100\s*gal)/i,
  /\b\d+\s*-?\s*(?:hr|hour|day)s?\s+(?:reentry|re-entry)\b/i,
  /\bREI\s*\d/i,
  /\bPHI\s*\d/i,
  /\bGroup\s+\d+[A-Z]?\s+(?:fungicide|insecticide|herbicide|acaricide)\b/i,
];

/**
 * Content-based backstop for the tier-C cut.
 *
 * Label classification alone is not enough, and the fixtures proved it: a `Chemical control` section
 * is itself subdivided by seasonal lead-ins ("Dormant season", "Early season", "Summer") and by
 * `Note` / `Combination Fungicides`, each of which opens a NEW section whose own label says nothing
 * about products. Their bullets are still rate tables. Rather than trying to enumerate every
 * sub-heading a land-grant editor might write, this reads the blocks themselves.
 *
 * Deliberately conservative — a block needs at least MIN_HITS separate rate-shaped signals, so a
 * single passing mention of a rate inside otherwise agronomic prose does not delete the list. It
 * runs over the WHOLE document, so it also covers sections the label rule never reaches.
 */
export function stripRateShapedBlocks(html: string, minHits = 2): string {
  const doomed = topLevelBlocks(html, BLOCK_TAGS).filter(({ start, end }) => {
    const text = textOf(html.slice(start, end));
    const hits = RATE_SIGNALS.reduce((n, re) => n + (re.test(text) ? 1 : 0), 0);
    // A long list where EVERY row carries a rate is a product table even when it keeps tripping the
    // same signal family (e.g. "Group 11 fungicide" on all thirty rows).
    const rateRows = (text.match(/\d+(?:\.\d+)?\s*(?:fl\s*oz|lb\s*ai|oz|gal|pt|qt)\b/gi) ?? []).length;
    return hits >= minHits || rateRows >= 3;
  });
  return removeSpans(html, doomed);
}
