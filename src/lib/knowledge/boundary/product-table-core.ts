// SKB Unit 1 — the tabular/prose boundary detector (invariant KB-1).
//
// WHAT IT DECIDES. Does this document carry a PRODUCT -> FACT mapping (product x FRAC group,
// x efficacy rating, x rate, x REI/PHI)? That is "tier C" in the SKB plan §2 and it must never enter
// the corpus for an enforcing source. Tier A (disease biology) and tier B (advisory prose that names
// FRAC groups as context and defers rates to the label) are both corpus content and must pass.
//
// WHY A TABLE AND NOT A KEYWORD. The rejected alternative was "exclude anything mentioning FRAC".
// It is grep-testable and wrong: it excludes tier B, which is most of the eastern extension writing
// the corpus is being expanded to get, and it aims at a keyword rather than at the failure mode. The
// failure mode is a product->fact mapping in the corpus being retrieved and quoted as authoritative
// while `pesticide_resistance_assignment` says GAP for the same product — a coverage gap rendering as
// a confident answer from the WRONG ENGINE (runbook §3.6). Density and legibility are what make that
// dangerous, and both are properties of a table.
//
// ── TWO CONSTRAINTS THAT SHAPE EVERY DECISION BELOW (council C2) ──
//
// 1. SEAM: this reads RAW HTML or the PDF pre-chunk line representation, NEVER post-extraction text.
//    `extract/pdf.ts` emits no pipe tables and no headings, so a table-dominated PDF collapses into
//    one segment. Reading extracted text destroys the row-repetition signal on exactly the documents
//    that matter. `index-documents.ts` calls this before `extractDocument`, for the same reason
//    `sections/` runs pre-extraction (Defuddle prunes the anchors it needs).
//
// 2. FAILURE DIRECTION IS SOURCE-DEPENDENT, and `uncertain` is a real verdict, not a rounding error.
//    An earlier draft returned "prose" when unsure, reasoning that a false positive silently deletes
//    good content. On a safety boundary that is backwards: a badly-formed table that a parser mangles
//    into a flat text list would be classified prose and ingested, so the only thing preventing a
//    table ingest would be perfect detection. The caller decides — for an ENFORCING source
//    `uncertain` skips (fail closed); for a REPORT-ONLY source it is admitted and counted, because
//    there the detector is a measurement and nothing is being gated. See `boundary/enforcing.ts`.
//
// THRESHOLDS RIDE REPEATED-ROW COUNT, NEVER DOCUMENT SIZE. Same reasoning as `crawl/challenge.ts`
// refusing a size heuristic: short legitimate pages exist and long table pages exist, so size measures
// the wrong thing in both directions.
//
// PURE + NO DEPS. Regex over raw markup rather than a DOM, matching `sections/split-html-sections.ts`:
// we are not parsing the document, only counting rows and cells. A nested table just yields extra
// rows, which pushes toward detection — the fail-closed direction.

export type BoundaryVerdict = "prose" | "product-table" | "uncertain";

export interface BoundaryAssessment {
  verdict: BoundaryVerdict;
  /**
   * Repeated product->fact rows detected. The threshold rides THIS, never byte size. For a structured
   * (HTML table) hit it is the qualifying table's row count; for a flat hit it is the longest RUN of
   * consecutive row-shaped lines, which is what "the same positional pattern" actually means once the
   * markup is gone.
   */
  rowCount: number;
  /** Named signals that fired, for the crawl log and the `verify:kb-boundary` report. */
  signals: string[];
  /** Did a real `<table>` back the verdict? Drives the prose/uncertain split — see below. */
  structured: boolean;
}

export type BoundaryInput =
  /** Raw fetched HTML bytes, decoded. */
  | { kind: "html"; html: string }
  /** The PDF pre-chunk line representation, or any already-flat text. One line per array entry. */
  | { kind: "text"; text: string };

/**
 * A qualifying table needs this many product->fact rows before it is called a product table.
 *
 * Four, not two: a tier-A biology page may legitimately embed a two- or three-row summary (a symptom
 * comparison, a two-product illustration) and the tier-C hazard is DENSITY — a lookup dense enough to
 * read as an authority. Below four the positional-repetition signal is not distinguishable from an
 * incidental list. Rows between 2 and 4 on a qualifying table return `uncertain` rather than `prose`,
 * so the borderline case still fails closed for an enforcing source.
 */
export const MIN_TABLE_ROWS = 4;

/** A run of flat row-shaped lines this long is enough to doubt the document. */
export const MIN_FLAT_RUN = 4;

/**
 * A flat run this long, WITH a column-header signal somewhere in the document, is enough to be sure
 * even with no markup left. This is the ENTO-635-C-through-the-PDF-extractor case: ~22 pages of rows.
 */
export const STRONG_FLAT_RUN = 12;

/**
 * Column-header phrases. These are CORROBORATION ONLY and can never produce a verdict by themselves —
 * a tier-B advisory paragraph legitimately contains "restricted-entry interval" and "preharvest
 * interval" in the sentence that delegates the numbers to the label, and that paragraph is exactly
 * what must stay in the corpus. Rows decide; headers qualify a table and raise a flat run's ceiling.
 */
const HEADER_SIGNALS: { name: string; re: RegExp }[] = [
  { name: "rate-per-acre", re: /\b(rate|amount)s?\s*(\/|per\s+)\s*(a|ac|acre)\b/i },
  { name: "restricted-entry", re: /\brestricted[-\s]entry\b|\(\s*rei\s*\)/i },
  { name: "days-to-harvest", re: /\bdays?\s+to\s+harvest\b|\bpre-?harvest\s+interval\b|\(\s*phi\s*\)/i },
  { name: "trade-name", re: /\btrade\s+names?\b|\bproduct\s+names?\b|\bpesticide\s+names?\b/i },
  { name: "formulation", re: /\bformulations?\b/i },
  { name: "relative-effectiveness", re: /\brelative\s+effectiveness\b|\befficacy\s+(of|rating|table)/i },
  { name: "active-ingredient", re: /\bactive\s+ingredients?\b/i },
  { name: "spray-timing", re: /\bspray\s+timing\b/i },
];

/**
 * Fact patterns that can appear ANYWHERE in a cell or a line. Used for both arms.
 * The flat arm requires TWO DISTINCT kinds on one line, which is what separates a collapsed table row
 * ("Abound 2.08SC 11 to 15.4 fl oz/A 4 hours 14 days") from an ordinary advisory sentence ("apply at
 * 7 to 10 day intervals") that happens to carry one interval.
 */
const INLINE_FACTS: { name: string; re: RegExp }[] = [
  {
    name: "rate-per-area",
    re: /\d+(\.\d+)?\s*(?:[-–]\s*\d+(\.\d+)?\s*)?(?:fl\s*)?(?:lbs?|oz|ounces?|pts?|pints?|qts?|quarts?|gal|gallons?|g|kg|ml|liters?|l)\b[^a-z0-9]{0,10}(?:\/|per\s+)\s*(?:a|ac|acre|100\s*gal)\b/i,
  },
  { name: "interval-hours", re: /\b\d+(\.\d+)?\s*(?:h|hr|hrs|hours?)\b/i },
  { name: "interval-days", re: /\b\d+(\.\d+)?\s*(?:days?)\b/i },
  { name: "group-code", re: /\bgroup\s+\d{1,2}\b|\bfrac\s+(?:group|code)s?\s*\d/i },
];

/**
 * Fact patterns that must be the WHOLE cell (or a whole whitespace-delimited token). An efficacy
 * matrix's cells are bare ratings and a FRAC column's cells are bare codes; unanchored, both would
 * match half the English language.
 */
const CELL_FACTS: { name: string; re: RegExp }[] = [
  { name: "efficacy-rating", re: /^(?:\+{1,4}|-{1,3}|[EGFPN](?:\s*[-/–]\s*[EGFPN])?|NR|excellent|good|fair|poor|none)$/i },
  // A FRAC code needs an actual code SHAPE — an M prefix ("M4"), a letter suffix ("3a"), or a list
  // of two or more ("3, 11"). A bare "7" is not a FRAC code, it is a number, and treating it as one
  // made "apply at 7 to 10 day intervals" read as a table row: two integers in a sentence became two
  // resistance-group cells. `bare-number` still covers a standalone integer where a CELL boundary
  // says it stands alone.
  { name: "frac-code", re: /^(?:m\d{1,2}[a-z]?|\d{1,2}[a-z])$|^m?\d{1,2}[a-z]?(?:\s*[,/+]\s*m?\d{1,2}[a-z]?)+$/i },
  { name: "bare-number", re: /^\d+(\.\d+)?(?:\s*[-–]\s*\d+(\.\d+)?)?$/ },
];

/** A formulation code is one of the strongest "this cell names a product" tells. */
const FORMULATION_CODE = /\b\d*(?:\.\d+)?(?:SC|WG|WDG|WP|EC|DF|DG|SG|ME|ZN|FL|CS|OD|SE)\b/;

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;|&#160;|&#xa0;/gi, " ")
    .replace(/&amp;|&#38;/gi, "&")
    .replace(/&lt;|&#60;/gi, "<")
    .replace(/&gt;|&#62;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");
}

function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, " "));
}

function normalize(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function wordCount(s: string): number {
  return s.split(/\s+/).filter(Boolean).length;
}

/** Does this cell hold a structured VALUE (a rate, an interval, a rating, a code)? */
export function isFactCell(cell: string): boolean {
  const t = normalize(cell);
  if (!t) return false;
  if (INLINE_FACTS.some((f) => f.re.test(t))) return true;
  return CELL_FACTS.some((f) => f.re.test(t));
}

/**
 * Does this cell NAME a product or active ingredient?
 *
 * Requiring one is what keeps this a PRODUCT->fact detector rather than a generic table detector.
 * That distinction is load-bearing: a tier-A biology page may carry a degree-day or growth-stage
 * table, and those must pass. "Bud break | 7 days" has a fact cell but its label cell carries no
 * product tell, so the row does not count.
 */
export function isProductCell(cell: string): boolean {
  const t = normalize(cell);
  if (t.length < 2 || t.length > 80) return false;
  if (wordCount(t) > 8) return false; // a product name is not a sentence
  if (!/[A-Za-z]/.test(t)) return false;
  if (isFactCell(t)) return false;
  // "azoxystrobin (Abound)" / "Abound (azoxystrobin)" — the AI/trade-name pairing extension tables use
  if (/\([^)]{2,}\)/.test(t)) return true;
  if (FORMULATION_CODE.test(t)) return true;
  return /^[A-Z]/.test(t);
}

/** Split one `<tr>`'s inner HTML into cell texts. */
function cellsOf(rowHtml: string): string[] {
  const cells: string[] = [];
  const re = /<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(rowHtml)) !== null) cells.push(normalize(stripTags(m[1])));
  return cells;
}

function rowsOf(tableHtml: string): string[] {
  const rows: string[] = [];
  const re = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(tableHtml)) !== null) rows.push(m[1]);
  return rows;
}

function headerSignalsIn(text: string): string[] {
  return HEADER_SIGNALS.filter((h) => h.re.test(text)).map((h) => h.name);
}

/** Is this row a product -> fact pairing? */
function isProductFactRow(cells: string[]): boolean {
  if (cells.length < 2) return false;
  const facts = cells.filter(isFactCell);
  if (facts.length === 0) return false;
  return cells.some((c) => isProductCell(c));
}

interface TableFinding {
  rows: number;
  qualified: boolean;
  headers: string[];
}

/**
 * Assess one `<table>`.
 *
 * QUALIFICATION is the guard against generic data tables. A table only counts when it either declares
 * a product/rate/interval column header of its own, OR at least two of its product cells carry a
 * trade-name parenthetical or a formulation code. A phenology table with a "7 days" column passes
 * neither and stays prose; ENTO-635-C's Table 3.1 and PSU's trade-name matrix pass both.
 */
function assessTable(tableHtml: string): TableFinding {
  const rows = rowsOf(tableHtml);
  const headers = headerSignalsIn(normalize(stripTags(tableHtml.slice(0, 4000))));
  let productFactRows = 0;
  let namedProducts = 0;
  for (const r of rows) {
    const cells = cellsOf(r);
    if (!isProductFactRow(cells)) continue;
    productFactRows++;
    if (cells.some((c) => isProductCell(c) && (/\([^)]{2,}\)/.test(c) || FORMULATION_CODE.test(c)))) {
      namedProducts++;
    }
  }
  return { rows: productFactRows, qualified: headers.length > 0 || namedProducts >= 2, headers };
}

/** Does this text carry a "this names a real product" tell — a trade-name parenthetical or a formulation code? */
function hasNamedProductTell(text: string): boolean {
  return /\([^)]{2,}\)/.test(text) || FORMULATION_CODE.test(text);
}

interface FlatLine {
  isRow: boolean;
  /** Does the row name a product outright? Used to QUALIFY a run, exactly as headers qualify a table. */
  named: boolean;
}

function classifyFlatLine(line: string): FlatLine {
  const no: FlatLine = { isRow: false, named: false };
  const t = normalize(line);
  if (t.length < 3 || t.length > 200) return no;
  if (wordCount(t) > 20) return no; // a prose sentence, not a row

  // Column gaps survived (multiple spaces, tabs, pipes) — treat the segments as cells.
  const segments = t.split(/\s{2,}|\t|\s*\|\s*/).map((s) => s.trim()).filter(Boolean);
  if (segments.length >= 3) {
    if (!isProductFactRow(segments)) return no;
    return { isRow: true, named: segments.some((s) => isProductCell(s) && hasNamedProductTell(s)) };
  }

  // Column gaps did NOT survive (a PDF text extractor collapses them to single spaces). Fall back to
  // requiring TWO DISTINCT fact kinds on one short line, which a normal advisory sentence does not
  // reach: "apply at 7 to 10 day intervals" carries one, "11 to 15.4 fl oz/A 4 hours 14 days" carries
  // three.
  const kinds = new Set(INLINE_FACTS.filter((f) => f.re.test(t)).map((f) => f.name));
  // Anchored kinds are checked per whitespace token, and need two of them, so a stray "E" never counts.
  // `bare-number` is deliberately EXCLUDED from this path: "apply at 7 to 10 day intervals" carries two
  // bare numbers and an interval, and counting them would make every dosing sentence a table row. A
  // bare number is only a fact when a CELL boundary says it stands alone.
  for (const cf of CELL_FACTS) {
    if (cf.name === "bare-number") continue;
    if (t.split(/\s+/).filter((tok) => cf.re.test(tok)).length >= 2) kinds.add(cf.name);
  }
  if (kinds.size < 2) return no;
  return { isRow: true, named: hasNamedProductTell(t) };
}

/** Is this single line shaped like a table row that lost its markup? */
export function isFlatRowLine(line: string): boolean {
  return classifyFlatLine(line).isRow;
}

/**
 * The flat arm: the longest RUN of consecutive row-shaped lines, and how many of those rows name a
 * product outright.
 *
 * A run rather than a total, because "repeated rows in the same positional pattern" is the actual
 * signal and a document-wide total would let scattered sentences accumulate into a false positive.
 * One non-row line is tolerated inside a run (a page break, a running header, a wrapped cell).
 */
function longestFlatRun(text: string): { run: number; named: number } {
  const lines = text.split(/\r?\n/);
  let best = 0;
  let bestNamed = 0;
  let current = 0;
  let currentNamed = 0;
  let gap = 0;
  for (const raw of lines) {
    const line = normalize(raw);
    if (!line) continue;
    const c = classifyFlatLine(line);
    if (c.isRow) {
      current++;
      if (c.named) currentNamed++;
      gap = 0;
      if (current > best) {
        best = current;
        bestNamed = currentNamed;
      }
    } else if (current > 0 && gap === 0) {
      gap = 1; // tolerate one interruption without ending the run
    } else {
      current = 0;
      currentNamed = 0;
      gap = 0;
    }
  }
  return { run: best, named: bestNamed };
}

/**
 * The boundary decision. Never throws — a caller in the fetch/index path must be able to treat this as
 * data, and the one thing it must never do is signal by exception (see `index-documents.ts`: a throw
 * there is read by the re-crawl tombstone pass as "the page was removed").
 */
export function assessProductTable(input: BoundaryInput): BoundaryAssessment {
  const signals: string[] = [];
  try {
    const isHtml = input.kind === "html";
    const raw = isHtml ? input.html : input.text;
    const flatText = isHtml ? stripTags(raw) : raw;

    const docHeaders = headerSignalsIn(normalize(flatText).slice(0, 200_000));
    for (const h of docHeaders) signals.push(`header:${h}`);

    // ── structured arm ──
    let bestTable: TableFinding = { rows: 0, qualified: false, headers: [] };
    if (isHtml) {
      const re = /<table\b[^>]*>([\s\S]*?)<\/table>/gi;
      let m: RegExpExecArray | null;
      let tables = 0;
      while ((m = re.exec(raw)) !== null) {
        tables++;
        const f = assessTable(m[1]);
        if (f.rows > bestTable.rows) bestTable = f;
      }
      if (tables > 0) signals.push(`tables:${tables}`);
      if (bestTable.rows > 0) {
        signals.push(`product-fact-rows:${bestTable.rows}`);
        signals.push(bestTable.qualified ? "table-qualified" : "table-unqualified");
      }
    }

    if (bestTable.qualified && bestTable.rows >= MIN_TABLE_ROWS) {
      return { verdict: "product-table", rowCount: bestTable.rows, signals, structured: true };
    }

    // ── flat arm ──
    // Runs on HTML too: a table built out of <div>s, or one the parser mangled, leaves no <table> to
    // find. This is the branch that stops "the only thing preventing a table ingest is perfect
    // detection".
    const { run: flatRun, named: flatNamed } = longestFlatRun(flatText);
    if (flatRun > 0) signals.push(`flat-run:${flatRun}`);
    // A flat run is QUALIFIED on the same terms as a table: the document declares a product/rate
    // column header, or the run itself names products outright. Without this a grape phenology table
    // ("Bud break | 14 days | 110") reads as a product table, because a growth stage is cell-shaped
    // and an interval is an interval. This is what keeps it a PRODUCT->fact detector once the markup
    // is gone, which is the only place the structured arm's own qualification cannot reach.
    const flatQualified = docHeaders.length > 0 || flatNamed >= 2;
    if (flatRun > 0) signals.push(flatQualified ? "flat-qualified" : "flat-unqualified");

    if (flatQualified && flatRun >= STRONG_FLAT_RUN && docHeaders.length > 0) {
      return { verdict: "product-table", rowCount: flatRun, signals, structured: false };
    }
    if (flatQualified && flatRun >= MIN_FLAT_RUN) {
      return { verdict: "uncertain", rowCount: flatRun, signals, structured: false };
    }
    // A qualifying table that is real but short. Below the density that makes tier C dangerous, but
    // not something to wave through on an enforcing source.
    if (bestTable.qualified && bestTable.rows >= 2) {
      return { verdict: "uncertain", rowCount: bestTable.rows, signals, structured: true };
    }

    return { verdict: "prose", rowCount: Math.max(bestTable.rows, flatRun), signals, structured: false };
  } catch (e) {
    // A detector crash must not become a throw in the index path, and must not become a silent pass.
    signals.push(`detector-error:${e instanceof Error ? e.name : "unknown"}`);
    return { verdict: "uncertain", rowCount: 0, signals, structured: false };
  }
}
