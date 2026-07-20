// Plan 084 Unit 2 — decide whether one section of a VT Enology Notes issue is technical content
// worth embedding, or a time-bound announcement that would pollute retrieval.
//
// Pure, no I/O. Fails OPEN: anything unrecognized is KEPT. False negatives (an ad leaks in) are
// annoying; false positives (dropping rot chemistry) are much worse.
//
// ============================ DO NOT ADD THESE PATTERNS ============================
// Measured across 125 real section titles from the 2002/2005/2008/2011 year indexes. Each of these
// words appears in the archive with BOTH meanings, so as a bare pattern it deletes real content:
//
//   /technical/i   SEMANTICALLY INVERTED. "Technical Study Tour", "Volatile Sulfur Compound
//                  Technical Roundtable" are events. ZERO genuinely technical titles contain it.
//   /review/i      "Brettanomyces Review", "Herbaceous Character in Red Wines - A Review" are
//                  literature reviews.
//   /sustainab/i   "Sustainable Winery Expansion - Energy and Water Use Audit" is engineering.
//   /available/i   "available nitrogen" / YAN is core vocabulary. Only ever match it anchored to a
//                  publication, edition, CD, or manual.
//   /new/i         "New Analytical Technologies" is technical.
//   /norton/i      Norton is a grape variety.
//
// test/knowledge-sections-classify.test.ts asserts all of the above. If you re-add one, it fails.
// ==================================================================================

export type SectionGenre = "event" | "personnel" | "admin";

export interface SectionVerdict {
  keep: boolean;
  /** Human-readable justification, surfaced by scripts/verify-vt-enology.ts. */
  reason: string;
}

/**
 * Strip the section number and normalize the archive's spelling variants so one pattern matches
 * fourteen years of inconsistent typography.
 */
export function normalizeHeading(raw: string): string {
  return raw
    .replace(/[*_]+/g, "") // markdown emphasis: "_Winery Planning and Design_, Edition 16"
    .replace(/[‒-―−]/g, "-") // en/em dash -> hyphen: "Red Wines – A Review"
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    // leading section number: arabic ("3.", "29bii."), Roman ("II."), either closer
    .replace(/^\s*(?:\d+[a-z]*|[ivxlc]+)\s*[.)]\s*/i, "")
    .replace(/\bon-line\b/gi, "Online")
    .replace(/\bround table\b/gi, "Roundtable")
    .replace(/\s+/g, " ")
    .trim();
}

/** Event and commerce promotion: tours, courses, workshops, conferences, trade shows. */
function matchEvent(h: string): string | null {
  if (/\b(workshop|short course|symposium|conference|roundtable)\b/i.test(h)) return "event: program/course";
  if (/\b(annual meeting|section meeting|roundtable meeting|meeting reminder|meeting review)\b/i.test(h))
    return "event: meeting";
  if (/american society for enology and viticulture|\bASEV\b/i.test(h)) return "event: ASEV";
  if (/\b(study tour|wine trip|trip postponed)\b/i.test(h)) return "event: tour/trip";
  // trade shows are named, not generic -- a bare /unlimited|weekend/ would be far too greedy
  if (/\b(wineries unlimited|wine weekend|mechanical harvester demonstration)\b/i.test(h))
    return "event: trade show";
  if (/\bcalendar of\b/i.test(h)) return "event: calendar";
  // a title carrying a concrete date is an announcement: "Workshop, February 10". The digit after
  // the month is what makes this safe -- it defuses the modal verb in "May".
  if (/,\s*(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}/i.test(h))
    return "event: dated announcement";
  return null;
}

/** Personnel and memorial news: hires, awards, obituaries, staffing. */
function matchPersonnel(h: string): string | null {
  if (/\bin (memoriam|remembrance|memory)\b/i.test(h)) return "personnel: memorial";
  // the \b after intern is load-bearing: without it this eats "...International Cool Climate..."
  if (/\b(award|scholarship|recipient|interns?)\b/i.test(h)) return "personnel: award/appointment";
  if (/\bour new\b/i.test(h)) return "personnel: new staff";
  if (/\bout of office\b|\badvisory committee formed\b/i.test(h)) return "personnel: staffing notice";
  return null;
}

/** Publication and administrative housekeeping: availability notices, web/site admin, indexing. */
function matchAdmin(h: string): string | null {
  // "available" ONLY when anchored to a publication artifact -- never bare (see the header note)
  if (/\b(edition\s+\d+|CD|manual|publication)\b[^.]*\bavailable\b/i.test(h))
    return "admin: publication availability";
  if (/\bpublications?\b/i.test(h) && /\b(online|posted)\b/i.test(h)) return "admin: publication posting";
  if (/\b(web ?site|web domain|domain address)\b|\.org\b/i.test(h)) return "admin: web/site notice";
  if (/\b(subject index|indexing)\b/i.test(h)) return "admin: indexing";
  if (/\bslide show (posted|available)\b/i.test(h)) return "admin: slide posting";
  if (/\bbudget reduction\b/i.test(h)) return "admin: budget notice";
  return null;
}

/**
 * Above this, the text is body prose, not a heading — so we refuse to classify it.
 *
 * Found live by scripts/verify-vt-enology.ts, not by reasoning. Anchor #1 on EN-159 is NOT followed
 * by a bold title, so heading extraction runs on to the first </p> and swallows a whole paragraph.
 * That paragraph mentions "On-Line Publications" in passing, which tripped the admin rule and
 * dropped a section whose actual subject is "an outline of some fermentation considerations".
 *
 * Calibration: that prose is 207 chars; the longest REAL non-technical heading in the corpus
 * ("American Society for Enology and Viticulture - Eastern Section Conference and Symposium,
 * July 15-17, Lehigh Valley, PA") is 118. 150 separates them with margin on both sides.
 */
const MAX_CLASSIFIABLE_HEADING = 150;

export function classifySection(rawHeading: string): SectionVerdict {
  const h = normalizeHeading(rawHeading ?? "");
  if (!h) return { keep: true, reason: "no heading — fail open" };

  // Prose can mention a workshop or a publication in passing. Only a real heading gets classified.
  if (h.length > MAX_CLASSIFIABLE_HEADING) {
    return { keep: true, reason: "body prose, not a heading — fail open" };
  }

  // Events and personnel drop UNCONDITIONALLY. No colon rescue: USER RULING is that trip/meeting
  // recaps go the same way as the ads, and without this the "Study Tour: Alsace, Burgundy and
  // Champagne" section would survive on the strength of its right-hand side.
  const event = matchEvent(h);
  if (event) return { keep: false, reason: event };

  const personnel = matchPersonnel(h);
  if (personnel) return { keep: false, reason: personnel };

  const admin = matchAdmin(h);
  if (admin) {
    // USER RULING — colon rescue, scoped to the admin genre only. "New Online Publications:
    // Oxidation Sensory Screen - Hydrogen Sulfide/Mercaptan Sensory Screen" is an administrative
    // wrapper around a real technical payload. If the right-hand side survives on its own, keep it.
    const colon = h.indexOf(":");
    if (colon >= 0) {
      const rhs = h.slice(colon + 1).trim();
      if (rhs && !matchEvent(rhs) && !matchPersonnel(rhs) && !matchAdmin(rhs)) {
        return { keep: true, reason: `admin wrapper with technical payload (rescued: ${admin})` };
      }
    }
    return { keep: false, reason: admin };
  }

  return { keep: true, reason: "technical (default keep)" };
}
