/**
 * Fuzzy matching for category / location drift prevention — pure, no DB.
 *
 * The bulk CSV import already reuses an existing registry value when it matches
 * case-insensitively (see ensureCategory/ensureLocation in actions.ts). This helper
 * catches the *near* duplicates that slip past an exact match — typos, spacing,
 * punctuation, and abbreviations — so the import UI can offer "did you mean X?".
 *
 * Unit-tested core. No React, no side effects.
 */

export type Match = { match: string; score: number };
export type ClosestMatchOptions = { threshold?: number };

const DEFAULT_THRESHOLD = 0.8;
// Shorter side must be this long to count as an abbreviation. 4 (not 3) so a short
// real name like "Bar" or "Red" doesn't fuzzy-trigger on every longer value ("Barrel").
const PREFIX_MIN_LEN = 4;
const PREFIX_SCORE = 0.85; // confidence floor for a clean prefix/abbreviation match

/**
 * Canonicalize a name for comparison: lowercase, collapse internal whitespace to a
 * single space, trim, then strip leading/trailing punctuation. Internal punctuation
 * (e.g. the hyphen in "t-shirt") is preserved. Unicode-aware: accented and non-Latin
 * letters (é, CJK) are kept, so "Café" stays "café" rather than degrading to "caf".
 */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
}

/** Classic Levenshtein edit distance (insert/delete/substitute = 1). */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let curr = new Array<number>(b.length + 1);

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

/**
 * Similarity in [0, 1] between two already-normalized strings. Edit-distance based,
 * with a floor for abbreviations: if the shorter string is a prefix of the longer one
 * (and long enough to be meaningful), treat it as a strong match so "merch" lines up
 * with "merchandise" even though their raw edit distance is large.
 */
function similarity(a: string, b: string): number {
  const lev = 1 - levenshtein(a, b) / Math.max(a.length, b.length);
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (short.length >= PREFIX_MIN_LEN && long.startsWith(short)) {
    return Math.max(lev, PREFIX_SCORE);
  }
  return lev;
}

/**
 * Find the closest existing name to `value`. Returns null when:
 *  - `value` already matches an existing name exactly (case/space/punctuation-insensitive)
 *    — nothing to suggest, the import will reuse it as-is, or
 *  - no candidate scores at or above the threshold.
 * Otherwise returns the highest-scoring candidate and its score.
 */
export function closestMatch(
  value: string,
  candidates: readonly string[],
  opts: ClosestMatchOptions = {},
): Match | null {
  const threshold = opts.threshold ?? DEFAULT_THRESHOLD;
  const nv = normalize(value);
  if (!nv) return null;

  let best: Match | null = null;
  for (const cand of candidates) {
    const nc = normalize(cand);
    if (!nc) continue;
    if (nc === nv) return null; // exact (normalized) match exists — no suggestion needed
    const score = similarity(nv, nc);
    if (best == null || score > best.score) best = { match: cand, score };
  }

  if (!best || best.score < threshold) return null;
  return best;
}
