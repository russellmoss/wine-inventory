// Plan 079 follow-on — recover a document's revision date.
//
// Plan 084 (Cornell) merged IN: strict ISO parsing of extractor metadata, PDF metadata dates, and
// PDF title cleaning. That work arrived on a branch predating this file and had independently
// rebuilt the same seam; the halves turned out complementary, so both are kept. See
// resolvePublishedDate for the ONE place the Cornell version was outright better and replaced
// what was here.
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
 * A date carrying a real MONTH NAME, in either order, with an optional day:
 * "May 9, 2023" · "9 May 2023" · "Tue, 09 May 2023 00:00:00 GMT" · "March 2024".
 *
 * The month name is the whole safety argument — see resolvePublishedDate step 3. Every input that
 * V8's legacy parser silently fabricated a January 1st from ("Issue 2019", "n.d. 2019", "Spring
 * 2020") fails to match, because none of them names a month.
 */
const MONTH_NAME_DATE = new RegExp(
  String.raw`(?:^|[\s,])(?:(?<day>\d{1,2})\s+)?(?<mon>[A-Za-z]{3,9})\.?\s+(?:(?<day2>\d{1,2})(?:st|nd|rd|th)?,?\s+)?(?<year>\d{4})(?!\d)`,
);

/**
 * Resolve a document's published date, preferring extractor-supplied metadata (meta tags / JSON-LD via
 * Defuddle) and falling back to a label-anchored scan of the extracted body text.
 *
 * ORDER MATTERS, and step 1 is a FIX, not a refactor. This used to open with a bare `new Date(meta)`.
 * V8's legacy parser silently discards tokens it does not recognise, so it FABRICATES a January 1st
 * out of junk metadata — measured:
 *
 *     new Date("n.d. 2019")  -> 2019-01-01     new Date("Issue 2019")  -> 2019-01-01
 *     new Date("Page 2016")  -> 2016-01-01     new Date("Spring 2020") -> 2020-01-01
 *
 * Every one of those cleared the range checks and was stored as fact, then used by the assistant to
 * decide which of two conflicting spray recommendations is "more recent". Credit to the Cornell
 * branch (plan 084) for measuring it. `parseHtmlPublishedDate` is strict ISO-8601 and rejects them all.
 */
export function resolvePublishedDate(
  opts: { metadataDate?: string | null; markdown?: string | null },
  now: Date = new Date(),
): Date | null {
  const meta = (opts.metadataDate ?? "").trim();
  if (meta) {
    // 1. Strict ISO-8601. Both real producers of this field (JSON-LD datePublished,
    //    <meta article:published_time>) are specified as ISO, so strictness costs nothing.
    const iso = parseHtmlPublishedDate(meta, now);
    if (iso) return iso;

    // 2. Date-SHAPED but not ISO — the MSU case, `2024-4-11EDT12:00AM`: unpadded month/day with a
    //    timezone jammed on, which no spec parser accepts. Anchored at the START, so junk like
    //    "Issue 2019" cannot reach it. The time/zone tail is discarded: unparseable as written, and
    //    a date-only reading is off by at most a day, which is nothing against a staleness bucket
    //    measured in years.
    const m = LEADING_YMD.exec(meta);
    if (m) {
      const d = buildDate(Number(m[1]), Number(m[2]), Number(m[3]), now);
      if (d) return d;
    }

    // 3. MONTH-NAME dates: "May 9, 2023", "9 May 2023", RFC-2822 "Tue, 09 May 2023 00:00:00 GMT".
    //    These are legitimate and unambiguous, and strict ISO alone would throw them away — several
    //    publishers emit them. What makes this safe where a bare `new Date()` was not is the
    //    requirement of a real MONTH NAME: that is exactly what the fabricating inputs lack.
    //
    //        "Issue 2019" / "n.d. 2019" / "Page 2016" / "2019"  -> no month name -> refused
    //        "Spring 2020"                                      -> not a month   -> refused
    //
    //    A month+year with no day still resolves to the 1st, which is the same convention the
    //    label-anchored body scan already uses for "Revised: March 2024". The month is real, so this
    //    is a precision loss, not an invention.
    const named = MONTH_NAME_DATE.exec(meta);
    if (named) {
      const mon = MONTHS[named.groups!.mon.slice(0, 3).toLowerCase()];
      if (mon) {
        const rawDay = named.groups!.day ?? named.groups!.day2;
        const day = rawDay ? Number(rawDay) : 1;
        const d = buildDate(Number(named.groups!.year), mon, day, now);
        if (d) return d;
      }
    }
  }
  // 3. Label-anchored scan of the body — the UC IPM case, where the date exists only as prose.
  return parsePublishedDate(opts.markdown ?? "", now)?.date ?? null;
}

/**
 * Publication dates below this year are treated as parse noise, not data. Viticulture/enology extension
 * material predating 1980 is not in scope for any source in the registry, whereas a mis-parsed string
 * landing in 1900 (or the Unix epoch) is a common failure mode.
 */
const MIN_PUBLISHED_YEAR = 1980;

/**
 * Tolerance for a document dated slightly in the future. Publisher clock skew and timezone handling
 * routinely produce "tomorrow"; a date beyond this is evidence of a parse error, not an embargo.
 */
const FUTURE_TOLERANCE_MS = 2 * 24 * 60 * 60 * 1000;

/**
 * Reject dates that are structurally valid but cannot be a real publication date. Callers must treat a
 * false result as "no date", never as "date is zero".
 */
export function isPlausiblePublishedDate(d: Date, now: Date = new Date()): boolean {
  if (Number.isNaN(d.getTime())) return false;
  if (d.getUTCFullYear() < MIN_PUBLISHED_YEAR) return false;
  if (d.getTime() > now.getTime() + FUTURE_TOLERANCE_MS) return false;
  return true;
}

/**
 * Did Date.UTC silently roll the components over into a different day?
 *
 * A month/day range check alone is not enough: day 31 is "in range" but February 31st rolls forward to
 * March 2nd and September 31st to October 1st. Small compared to a year-shift, but the callers' comments
 * claim the rollover is closed, so close it rather than leave a claim that is almost true.
 */
function rolledOver(d: Date, monthIdx: number, dayNum: number): boolean {
  return d.getUTCMonth() !== monthIdx || d.getUTCDate() !== dayNum;
}

/**
 * Parse the publication date Defuddle lifts out of a page (JSON-LD `datePublished`,
 * `<meta property="article:published_time">`, and similar). The field is typed `string` but is populated
 * from arbitrary publisher markup, so it arrives as anything from a clean ISO timestamp to "n.d." to "".
 *
 * STRICT ISO-8601 ONLY (`YYYY-MM-DD`, optionally with a time and zone). Both real sources of this field
 * are specified as ISO-8601, so strictness costs nothing and closes a real hole: a "contains a 4-digit
 * year, then trust `new Date()`" check is NOT sufficient, because V8's legacy date parser silently
 * discards tokens it does not recognize. Measured:
 *
 *     new Date("n.d. 2019")  -> 2019-01-01    new Date("Issue 2019") -> 2019-01-01
 *     new Date("Page 2016")  -> 2016-01-01    new Date("2019")       -> 2019-01-01
 *
 * A publisher whose `datePublished` carries a journal volume, an issue label, or literally "n.d." would
 * have had a January 1st fabricated for it and persisted as fact — then used by the assistant to decide
 * which of two conflicting spray recommendations is "more recent". A bare year is rejected for the same
 * reason: Jan 1 is a fabrication, not a publication date.
 *
 * A date with no explicit timezone is read as UTC rather than server-local, so the stored instant does
 * not depend on where the crawler happens to run.
 */
const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?\s*(Z|[+-]\d{2}:?\d{2})?$/i;

export function parseHtmlPublishedDate(raw: unknown, now: Date = new Date()): Date | null {
  if (typeof raw !== "string") return null;
  const m = ISO_DATE_RE.exec(raw.trim());
  if (!m) return null;

  const [, year, month, day, hour, minute, second, zone] = m;
  const monthIdx = Number(month) - 1;
  const dayNum = Number(day);
  // Reject out-of-range components rather than letting Date.UTC roll them over ("2019-13-01" would
  // otherwise become January 2020 — a document shifted a full year).
  if (monthIdx < 0 || monthIdx > 11) return null;
  if (dayNum < 1 || dayNum > 31) return null;

  // Validate the calendar day against a plain UTC construction FIRST. This must not be done on the
  // zone-resolved value: "2024-10-15T23:00:00-05:00" is legitimately 2024-10-16 in UTC, and comparing
  // that back to day 15 would reject a perfectly good date.
  const asUtc = new Date(Date.UTC(Number(year), monthIdx, dayNum));
  if (rolledOver(asUtc, monthIdx, dayNum)) return null;

  // With an explicit zone the string is unambiguous, so let Date resolve the offset.
  const parsed = zone
    ? new Date(raw.trim())
    : new Date(
        Date.UTC(
          Number(year),
          monthIdx,
          dayNum,
          hour ? Number(hour) : 0,
          minute ? Number(minute) : 0,
          second ? Number(second) : 0,
        ),
      );

  if (!isPlausiblePublishedDate(parsed, now)) return null;
  return parsed;
}

/**
 * Parse a PDF metadata date string: `D:YYYYMMDDHHmmSS` optionally followed by a timezone as `Z`, or
 * `+HH'mm'` / `-HH'mm'` (PDF 32000-1 §7.9.4). Observed in the wild on the Cornell corpus in all three
 * forms, including the malformed-but-common `D:20220509184810Z00'00'`.
 *
 * Everything after the year is optional in practice, so missing components default to the start of the
 * period (Jan 1, midnight) rather than failing the whole parse.
 */
export function parsePdfDate(raw: unknown, now: Date = new Date()): Date | null {
  if (typeof raw !== "string") return null;
  const m = /^D:(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?(?:(Z)|([+-])(\d{2})'?(\d{2})?'?)?/.exec(raw.trim());
  if (!m) return null;

  const [, year, month, day, hour, minute, second, zulu, sign, offHour, offMin] = m;
  const monthIdx = month ? Number(month) - 1 : 0;
  const dayNum = day ? Number(day) : 1;
  // Reject out-of-range components rather than letting Date.UTC silently roll them over (month "13"
  // would become January of the next year, quietly shifting the document a year forward).
  if (monthIdx < 0 || monthIdx > 11) return null;
  if (dayNum < 1 || dayNum > 31) return null;
  // Day 31 is "in range" but rolls forward in a short month (Feb 31 -> Mar 2, Sep 31 -> Oct 1).
  if (rolledOver(new Date(Date.UTC(Number(year), monthIdx, dayNum)), monthIdx, dayNum)) return null;

  let ms = Date.UTC(
    Number(year),
    monthIdx,
    dayNum,
    hour ? Number(hour) : 0,
    minute ? Number(minute) : 0,
    second ? Number(second) : 0,
  );

  // A local-time stamp with an explicit offset: subtract the offset to get UTC. `Z` is already UTC.
  if (!zulu && sign) {
    const offsetMs = (Number(offHour) * 60 + Number(offMin ?? 0)) * 60 * 1000;
    ms += sign === "+" ? -offsetMs : offsetMs;
  }

  const d = new Date(ms);
  if (!isPlausiblePublishedDate(d, now)) return null;
  return d;
}

/**
 * PDF `Title` metadata is frequently the authoring tool's placeholder rather than a real title
 * (measured on the Cornell corpus: "-", "PowerPoint Presentation", "Microsoft Word - insects.doc",
 * "18schruft"). Strip the known producer prefixes and reject what is left if it carries no signal, so
 * the caller can fall back to the first-line heuristic instead of citing a document as "PowerPoint
 * Presentation".
 */
export function cleanPdfTitle(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  // Cap FIRST, matching the first-line heuristic's own 200-char limit (pdf.ts). The title is prepended
  // as a breadcrumb to EVERY chunk of the document, so an unbounded /Title from a malformed or hostile
  // PDF would bloat the whole document and its embedding cost. Slicing before the regex work also keeps
  // the string operations below bounded regardless of input size.
  let t = raw.slice(0, 200).trim();
  // "Microsoft Word - foo.docx" / "Microsoft PowerPoint - foo.pptx" — the real title follows the dash.
  t = t.replace(/^Microsoft\s+(?:Word|PowerPoint|Excel)\s*-\s*/i, "").trim();
  // Drop a trailing authoring-tool file extension left over from the above.
  t = t.replace(/\.(?:docx?|pptx?|xlsx?|pdf|indd)$/i, "").trim();
  if (t.length < 4) return null;
  if (/^(?:PowerPoint|Word|Excel)\s+Presentation$/i.test(t)) return null;
  if (/^untitled$/i.test(t)) return null;
  // No letters at all (e.g. "12345", "- - -") carries no citation value.
  if (!/[A-Za-z]{3}/.test(t)) return null;
  return t;
}
