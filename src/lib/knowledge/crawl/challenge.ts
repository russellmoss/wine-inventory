// Plan 085 — WAF / bot-wall challenge detection.
//
// WHY THIS EXISTS: the fetch path had ZERO response-body validation. A bot-wall interstitial is
// served with HTTP **200** and `content-type: text/html`, so `fetchDocument` returns it as a
// success and `classifyContentType` calls it "html" (its header arm wins over magic bytes). It
// then flows straight through persistDocument -> extractHtml -> chunk -> embed, landing in the
// GLOBAL corpus as a document whose entire content is "Request unsuccessful."
//
// It is worse than one bad document. Imperva stamps a unique `incident_id` into every challenge,
// so each fetch yields a DIFFERENT content hash. The conditional-GET / content-hash dedup that
// makes the monthly re-crawl cheap never fires, and the garbage is re-embedded every month,
// forever, burning Voyage credits and diluting retrieval.
//
// POSTURE — SIGNATURE ONLY, NEVER SIZE. The tempting heuristic is "a 950-byte HTML page is
// suspicious". It is wrong in both directions: legitimately short pages exist (stubs, thin index
// pages, redirect shims), and Cloudflare's interstitial is not small. So every match must be a
// vendor-specific marker string that cannot occur in viticulture prose.
//
// THE ASYMMETRY, STATED PRECISELY, because it sets the bar for adding a marker. A false NEGATIVE
// is exactly today's behaviour, so it is never a regression. A false POSITIVE is not "one dropped
// page" — the consequence is SOURCE-WIDE and JOB-WIDE: one bogus match adds the whole source to
// `challengedKeys` in recrawl-knowledge.ts (excluding every one of its documents from the
// tombstone pass), and if that source indexed nothing else that run it lands in findDarkSources
// and hard-fails the monthly job. Calibrate new markers against that, not against one page.
//
// CALLER CONTRACT: this is reported, never thrown. See `fetcher.ts` and the note in
// `scripts/recrawl-knowledge.ts` — a throw out of `fetchDocument` is read as "the page was
// removed" by the tombstone pass, so throwing here would mark a whole source's corpus slice
// `withdrawn` on a transient WAF blip.

/** How much of the body to inspect. Interstitials put their markers in <head>; this bounds the
 *  cost of scanning a 15 MB PDF while leaving generous headroom for a verbose challenge page. */
const SCAN_BYTES = 64 * 1024;

export interface ChallengeInfo {
  /** Which bot-wall product answered. Recorded so a run log says WHO blocked us, not just "blocked". */
  vendor: "imperva" | "cloudflare" | "akamai" | "datadome" | "perimeterx";
  /** The marker string that matched, for the run log / issue body. */
  marker: string;
  /** Full body size. Diagnostic only — deliberately NOT part of the match decision. */
  byteSize: number;
}

/**
 * Vendor markers. Each entry must be a string that appears in the vendor's interstitial and
 * cannot plausibly appear in a document we actually want. Ordered most-observed first.
 */
const SIGNATURES: { vendor: ChallengeInfo["vendor"]; markers: string[] }[] = [
  {
    // Observed live on www.canr.msu.edu (plan 085 recon): HTTP 200, 965 bytes.
    //
    // The interstitial also contains the sentence "Request unsuccessful." — deliberately NOT a
    // marker. It is generic English, not a vendor signature, and it is redundant: the real body
    // always carries `_Incapsula_Resource` in <head> alongside it. Since we scan the first 64 KB of
    // EVERY body across all 21 sources, a generic phrase is real false-positive surface (inline
    // head JS, i18n string blobs) for zero detection gain.
    vendor: "imperva",
    markers: ["_Incapsula_Resource", "Incapsula incident ID"],
  },
  {
    vendor: "cloudflare",
    markers: ["cf-browser-verification", "Checking your browser before accessing", "cf-im-under-attack"],
  },
  {
    // Akamai returns a numbered reference on its deny page.
    vendor: "akamai",
    markers: ["Access Denied</TITLE>", "Reference&#32;&#35;18.", "akamai-bot-manager"],
  },
  { vendor: "datadome", markers: ["datadome.co", "dd_cookie_test"] },
  { vendor: "perimeterx", markers: ["_pxhd", "px-captcha", "perimeterx.net"] },
];

/** A PDF can never be an HTML interstitial, and its binary payload could contain anything. */
function isPdf(bytes: Buffer, rawContentType: string): boolean {
  if (rawContentType.toLowerCase().includes("application/pdf")) return true;
  return bytes.subarray(0, 5).toString("latin1") === "%PDF-";
}

/**
 * Return challenge details if `bytes` is a bot-wall interstitial, else null.
 *
 * Pure and network-free by design: `fetchDocument` is effectively untestable (its `readCapped`
 * needs a real ReadableStream and `assertPublicHost` does live DNS), so the risky judgement is
 * pulled out here where it can be tested directly. Same shape as `classifyContentType`.
 */
export function detectChallengePage(bytes: Buffer, rawContentType: string): ChallengeInfo | null {
  if (bytes.length === 0) return null;
  if (isPdf(bytes, rawContentType)) return null;

  // An absent/unknown content-type must NOT buy a free pass — some WAFs omit it on the
  // interstitial. Only a positively-identified PDF is exempt, handled above.
  const head = bytes.subarray(0, SCAN_BYTES).toString("utf8");

  for (const { vendor, markers } of SIGNATURES) {
    for (const marker of markers) {
      if (head.includes(marker)) return { vendor, marker, byteSize: bytes.length };
    }
  }
  return null;
}

/** The slice of CrawlSummary that the went-dark decision needs. */
export interface SourceOutcome {
  documents: number;
  /**
   * 304s. Load-bearing, not decoration — see findDarkSources. A conditional GET that returns 304
   * is POSITIVE PROOF the origin answered us rather than the bot wall.
   */
  notModified: number;
  skippedChallenge: number;
}

/**
 * Sources that a bot wall shut out completely this run: challenged at least once AND brought back
 * nothing at all. Returned sorted so the run log and the failure message are stable.
 *
 * WHY NOT `skippedChallenge > 0`: challenges are intermittent by nature (recon saw one path
 * challenged and its siblings served, same host, minutes apart). Failing the monthly job on ANY
 * challenge would cry wolf every month and train everyone to ignore it.
 *
 * WHY `notModified === 0` AND NOT JUST `documents === 0`: this is the trap. `documents` only counts
 * pages we actually re-indexed, and the whole point of the conditional-GET re-crawl is that
 * unchanged pages come back 304 and increment `notModified` instead. So a perfectly healthy source
 * on a stable corpus legitimately finishes a month with `documents === 0`. Pair that with one
 * intermittent challenge on one new URL and the naive predicate declares a working source "dark"
 * and reds the job — and it gets MORE likely every month as the corpus settles and the 304 rate
 * approaches 100%. Requiring zero 304s as well means we only fire when the source produced no
 * content-bearing response whatsoever, which is what "shut out" actually means.
 */
export function findDarkSources(summaries: Record<string, SourceOutcome>): string[] {
  return Object.entries(summaries)
    .filter(([, s]) => s.skippedChallenge > 0 && s.documents === 0 && s.notModified === 0)
    .map(([key]) => key)
    .sort();
}
