// SKB Unit 5 — `allowPaths`, an EXACT-PATH allowlist, and the canonicalization contract it matches on.
//
// WHY A NEW PRIMITIVE. `allowPrefixes` cannot scope a source whose articles live at flat root slugs.
// Penn State Extension publishes `/grape-disease-black-rot` and `/grape-sour-rot` with no grape
// namespace at all — and `/powdery-mildew`, `/downy-mildew` and `/black-rot-and-frogeye-leaf-spot` are
// the ORNAMENTAL / TREE-FRUIT articles at an identical URL shape. There is no prefix that admits the
// first set and refuses the second. Only an exact list can.
//
// The rejected alternative was a CURATED_SPECS entry. It works, but it throws away PSU's real sitemap
// with `lastmod` and puts the source outside the monthly sweep, for no gain.
//
// ── THE CANONICALIZATION CONTRACT ──
//
// Stated once, here, and tested per clause. An allowlist whose comparison rules are implicit is an
// allowlist with bypasses nobody wrote down:
//
//   Input           match on PATHNAME only, resolved AFTER redirects (callers pass the final URL)
//   Query/fragment  IGNORED — never a way to smuggle an unlisted path past the gate
//   Trailing slash  `/x` and `/x/` are the SAME entry (PSU's sitemap lists slashed; each 301s to
//                   unslashed, so both forms are real and both must be admitted by one entry)
//   Case            CASE-SENSITIVE. Paths are not domains
//   Percent-encoding  decode ONCE for comparison, but `/a%2Fb` must NOT collapse to `/a/b` — an
//                   encoded separator is not a separator
//   Deny            `denyPrefixes` are evaluated first and win unconditionally (unchanged)
//   Empty allows    `allowPaths` present with `allowPrefixes: []` still FAILS CLOSED on an unlisted path
//
// Slash-tolerance is a property of the NORMALISER, not of each comparison. Both sides of every match
// go through `canonicalPathKey`, so the entry list and the candidate URL cannot be normalised
// inconsistently — which is the way a rule like this usually rots.
//
// Pure, no imports: `config.ts` validates its entries at load through here and `crawler.ts` matches
// through here, and neither can drift from the other.

/**
 * The comparison key for one pathname.
 *
 * The percent-encoding clause is the subtle one and it is the reason this decodes per SEGMENT rather
 * than whole-string. `decodeURIComponent("/a%2Fb")` is `/a/b`, which would make an encoded separator
 * indistinguishable from a real one — a listed `/a/b` would then admit `/a%2Fb`, and on a server that
 * routes them differently that is a bypass. So each segment is decoded independently and any `/` that
 * APPEARS from a decode is put back as `%2F`, keeping the two genuinely distinct while ordinary
 * over-encoding (`/gr%61pe-disease` -> `/grape-disease`) still compares equal.
 */
export function canonicalPathKey(pathname: string): string {
  const segments = pathname.split("/").map((seg) => {
    let decoded: string;
    try {
      decoded = decodeURIComponent(seg);
    } catch {
      // A malformed escape ("%zz") is not decodable. Compare it raw rather than throwing: this runs
      // inside the crawl path, and a hostile URL must be REFUSED by not matching, never by crashing
      // the loop.
      return seg;
    }
    // Order matters: escape `%` before `/`, so a decoded literal "%" cannot be confused with the
    // escape introduced on the next line.
    return decoded.replace(/%/g, "%25").replace(/\//g, "%2F");
  });
  let out = segments.join("/");
  if (out.length > 1) out = out.replace(/\/+$/, ""); // `/x/` === `/x`; never strip the root
  return out || "/";
}

/**
 * Validate + normalise a source's `allowPaths` at LOAD time.
 *
 * A malformed entry is a STARTUP FAILURE, not a silently ignored string (council S3). The failure it
 * prevents: someone writes `"grape-disease-black-rot"` without the leading slash, no URL ever matches
 * it, the crawl reports success, and the source lands with a fraction of the articles it was scoped
 * to have — with nothing anywhere saying why. A loud throw at import is the cheapest possible place
 * to find that.
 */
export function normalizeAllowPaths(entries: readonly string[], sourceKey: string): Set<string> {
  const out = new Set<string>();
  for (const raw of entries) {
    if (typeof raw !== "string" || !raw.startsWith("/")) {
      throw new Error(
        `knowledge source "${sourceKey}": allowPaths entry ${JSON.stringify(raw)} is not an absolute pathname (must start with "/")`,
      );
    }
    if (/[?#]/.test(raw)) {
      throw new Error(
        `knowledge source "${sourceKey}": allowPaths entry ${JSON.stringify(raw)} contains a query or fragment; entries are pathnames only`,
      );
    }
    if (/\s/.test(raw)) {
      throw new Error(
        `knowledge source "${sourceKey}": allowPaths entry ${JSON.stringify(raw)} contains whitespace`,
      );
    }
    out.add(canonicalPathKey(raw));
  }
  return out;
}

/** Is this pathname one of the source's exact allowed paths? Both sides go through the normaliser. */
export function allowPathsMatch(allowPaths: readonly string[] | undefined, pathname: string): boolean {
  if (!allowPaths?.length) return false;
  const key = canonicalPathKey(pathname);
  for (const entry of allowPaths) {
    if (canonicalPathKey(entry) === key) return true;
  }
  return false;
}
