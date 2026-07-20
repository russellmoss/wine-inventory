// Plan 084 Unit 1 — publication-date normalization for the extraction seam.
//
// Why this exists: retrieval surfaces a date to the assistant (retrieve.ts -> search-knowledge-base),
// and the tool prompt asks the model to resolve conflicting recommendations BY RECENCY. A wrong date is
// therefore worse than no date: it silently re-orders which advice the model presents as current. Every
// function here is fail-closed — anything we cannot parse with confidence returns null, and the caller
// renders "unknown" rather than a guess.
//
// Pure + dependency-free so it is cheap to unit-test exhaustively (test/knowledge-extract.test.ts).

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
 * Parse the publication date Defuddle lifts out of a page (JSON-LD `datePublished`,
 * `<meta property="article:published_time">`, and similar). The field is typed `string` but is populated
 * from arbitrary publisher markup, so it arrives as anything from a clean ISO timestamp to "n.d." to "".
 *
 * Requires an explicit 4-digit year in the raw string before trusting Date parsing: without that guard a
 * bare "05/06" or a stray number parses to a real Date in the current century and would be published as
 * fact.
 */
export function parseHtmlPublishedDate(raw: unknown, now: Date = new Date()): Date | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (!s) return null;
  if (!/(?:^|\D)(\d{4})(?:\D|$)/.test(s)) return null;
  const parsed = new Date(s);
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
  let t = raw.trim();
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
