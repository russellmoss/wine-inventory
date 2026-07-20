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
// vendor-specific marker string that cannot occur in viticulture prose. A missed challenge is
// exactly today's behaviour, so a false negative is never a regression; a false positive would
// silently drop real content, which would be.
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
    vendor: "imperva",
    markers: ["_Incapsula_Resource", "Incapsula incident ID", "Request unsuccessful."],
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
