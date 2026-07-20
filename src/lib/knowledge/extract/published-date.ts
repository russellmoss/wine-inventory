// Plan 079 follow-on — recover a document's revision date.
//
// WHY THIS EXISTS: `KnowledgeDocument.publishedAt` was read by retrieval (retrieve.ts:111) and surfaced
// by the assistant's citation (`date`), but NOTHING ever wrote it — so the whole corpus reported
// "0 with a date" and every citation said `unknown`. For the enology sources that was cosmetic. It
// stopped being cosmetic when UC IPM landed: those are PESTICIDE guidelines, where registrations get
// cancelled and REIs / resistance ratings change, and the UC IPM grape pages carry revision stamps as
// old as `Updated: 12/14`. Citing decade-old spray guidance with no date is a safety problem.
//
// DESIGN: parse the EXTRACTED MARKDOWN, not source HTML. The markdown is the one shape every source
// shares post-extraction, so this stays generic instead of becoming a UC IPM screen-scraper. (Defuddle's
// own `published` field is preferred when present — it reads meta/JSON-LD — but it is empty on UC IPM,
// which publishes the date only as body text.)
//
// POSTURE: conservative by construction. A WRONG date is worse than no date here, because a confident
// recent-looking stamp on stale spray guidance is precisely the failure we are trying to prevent. Every
// match must be LABEL-ANCHORED ("Updated:", "Revised:", …) so a bare year in prose ("a 2019 trial found")
// can never be mistaken for a revision date, and every candidate is range-checked. Anything ambiguous
// returns null and the citation keeps saying "unknown" — the honest answer.

/** Earliest plausible revision date. Anything older is a mis-parse, not a real stamp. */
const MIN_YEAR = 1980;

export interface ParsedPublishedDate {
  date: Date;
  /** The raw substring matched, for logging / debugging a suspicious backfill. */
  matched: string;
}

/** Two-digit year -> century. 00-79 => 2000s, 80-99 => 1900s (so "95" is 1995, "14" is 2014). */
function expandTwoDigitYear(yy: number): number {
  return yy < 80 ? 2000 + yy : 1900 + yy;
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/**
 * Build a UTC date from parts, or null if the parts are not a plausible revision date.
 * Day defaults to 1 when the stamp carries only month + year (the common "MM/YY" case).
 */
function buildDate(year: number, month: number, day: number, now: Date): Date | null {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  if (year < MIN_YEAR) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  // Reject roll-over (e.g. 02/31 -> Mar 3) — a date that does not round-trip was never a real date.
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  // Reject the future. A revision stamp ahead of "now" means we mis-parsed (usually DD/MM vs MM/DD).
  if (d.getTime() > now.getTime()) return null;
  return d;
}

// Labels that actually denote a revision. Deliberately NOT including bare "Date:" — too loose, and on
// several sources it marks an event date (a field day, a webinar) rather than the document's revision.
const LABEL = String.raw`(?:text|treatment\s+table|table|page|content|guideline|this\s+page)?\s*` +
  String.raw`(?:last\s+)?(?:updated|revised|reviewed|published|modified)`;

/**
 * Ordered date-shape matchers. Each returns [year, month, day] or null.
 * Order matters: the most specific (unambiguous) shapes are tried first.
 */
const SHAPES: { re: RegExp; parse: (m: RegExpMatchArray) => [number, number, number] | null }[] = [
  // ISO: 2024-03-17
  {
    re: new RegExp(String.raw`${LABEL}\s*:?\s*(\d{4})-(\d{1,2})-(\d{1,2})`, "i"),
    parse: (m) => [Number(m[1]), Number(m[2]), Number(m[3])],
  },
  // Month name + optional day + 4-digit year: "March 2024", "March 17, 2024", "17 March 2024"
  {
    re: new RegExp(String.raw`${LABEL}\s*:?\s*([A-Za-z]{3,9})\.?\s+(\d{1,2})?,?\s*(\d{4})`, "i"),
    parse: (m) => {
      const mo = MONTHS[m[1].slice(0, 3).toLowerCase()];
      return mo ? [Number(m[3]), mo, m[2] ? Number(m[2]) : 1] : null;
    },
  },
  // MM/DD/YYYY
  {
    re: new RegExp(String.raw`${LABEL}\s*:?\s*(\d{1,2})/(\d{1,2})/(\d{4})`, "i"),
    parse: (m) => [Number(m[3]), Number(m[1]), Number(m[2])],
  },
  // MM/DD/YY
  {
    re: new RegExp(String.raw`${LABEL}\s*:?\s*(\d{1,2})/(\d{1,2})/(\d{2})(?!\d)`, "i"),
    parse: (m) => [expandTwoDigitYear(Number(m[3])), Number(m[1]), Number(m[2])],
  },
  // MM/YYYY
  {
    re: new RegExp(String.raw`${LABEL}\s*:?\s*(\d{1,2})/(\d{4})(?!\d)`, "i"),
    parse: (m) => [Number(m[2]), Number(m[1]), 1],
  },
  // MM/YY — the UC IPM shape ("Text Updated: 12/14"). Last, because it is the loosest: a bare two-part
  // date is only reachable here BECAUSE the label anchor already proved it is a revision stamp.
  {
    re: new RegExp(String.raw`${LABEL}\s*:?\s*(\d{1,2})/(\d{2})(?!\d|/)`, "i"),
    parse: (m) => [expandTwoDigitYear(Number(m[2])), Number(m[1]), 1],
  },
];

/**
 * Find every label-anchored revision date in `text` and return the MOST RECENT one.
 *
 * Most-recent is the right pick because a document may carry several stamps (UC IPM stamps the prose and
 * the treatment table separately) and `publishedAt` means "when was this last revised". Note this is the
 * charitable reading, so it can only ever make a document look NEWER than its oldest section — which is
 * why the assistant must show the date rather than silently trust it.
 */
export function parsePublishedDate(text: string, now: Date = new Date()): ParsedPublishedDate | null {
  if (!text) return null;
  let best: ParsedPublishedDate | null = null;

  for (const { re, parse } of SHAPES) {
    // Re-scan the whole text per shape with a global clone so multiple stamps are all considered.
    const g = new RegExp(re.source, "gi");
    let m: RegExpExecArray | null;
    while ((m = g.exec(text)) !== null) {
      const parts = parse(m);
      if (!parts) continue;
      const d = buildDate(parts[0], parts[1], parts[2], now);
      if (!d) continue;
      if (!best || d.getTime() > best.date.getTime()) best = { date: d, matched: m[0].trim() };
    }
  }
  return best;
}

/**
 * A leading `YYYY-M-D`, anchored at the start of the string, ignoring whatever follows.
 *
 * Plan 085 — MSU Extension (canr.msu.edu) emits JSON-LD dates as `2024-4-11EDT12:00AM`: month and
 * day unpadded, and the timezone abbreviation jammed straight onto the date with no separator. No
 * spec-compliant parser accepts that (`new Date(...)` is Invalid Date), so `publishedAt` came back
 * null for the whole source.
 *
 * We take the Y-M-D and DISCARD the time and zone. They are unparseable as written, and a date-only
 * reading is off by at most one day, which is immaterial to a staleness bucket measured in years.
 * Anchored at the start so a number sequence sitting inside some other string can never be mistaken
 * for a publication date.
 */
const LEADING_YMD = /^(\d{4})-(\d{1,2})-(\d{1,2})(?!\d)/;

/**
 * Resolve a document's published date, preferring extractor-supplied metadata (meta tags / JSON-LD via
 * Defuddle) and falling back to a label-anchored scan of the extracted body text.
 */
export function resolvePublishedDate(
  opts: { metadataDate?: string | null; markdown?: string | null },
  now: Date = new Date(),
): Date | null {
  const meta = (opts.metadataDate ?? "").trim();
  if (meta) {
    const parsed = new Date(meta);
    if (!Number.isNaN(parsed.getTime())) {
      const d = buildDate(parsed.getUTCFullYear(), parsed.getUTCMonth() + 1, parsed.getUTCDate(), now);
      if (d) return d;
    }
    // Only reachable when the built-in parser REFUSED the string, so every metadata shape that
    // already worked keeps taking the branch above, byte for byte. This is the salvage path.
    const m = LEADING_YMD.exec(meta);
    if (m) {
      const d = buildDate(Number(m[1]), Number(m[2]), Number(m[3]), now);
      if (d) return d;
    }
  }
  return parsePublishedDate(opts.markdown ?? "", now)?.date ?? null;
}
