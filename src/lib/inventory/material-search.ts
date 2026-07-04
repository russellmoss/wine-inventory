import { normalize, similarity } from "@/lib/inventory/similarity";

// Fuzzy, search-as-you-type ranking for material pickers (Phase 034). Pure — no React, no DB.
// Reuses the drift-prevention similarity engine (edit-distance + abbreviation/prefix floor) so a
// typo ("bentonit") or an abbreviation still finds the product, while an exact substring ("kmbs"
// inside "Potassium Metabisulfite (KMBS)") always wins. Callers pass a getText selector so the same
// helper works over DTOs, picker options, or plain strings.

export type RankOptions = {
  /** Minimum fuzzy score for a NON-substring candidate to survive. Substring hits always survive. */
  threshold?: number;
};

const DEFAULT_THRESHOLD = 0.5;

/** Score one candidate text against an already-normalized query. Substring hits score highest. */
function scoreText(nq: string, text: string): number {
  const nt = normalize(text);
  if (!nt) return 0;
  if (nt === nq) return 1; // exact (normalized) match
  if (nt.startsWith(nq)) return 0.97; // prefix of the whole name
  if (nt.includes(nq)) return 0.9; // substring anywhere (catches "(kmbs)", mid-word)
  return similarity(nq, nt); // fall back to edit-distance + abbreviation floor
}

/**
 * Filter + rank `items` by how well they match `query`. Empty/blank query → items unchanged
 * (identity order, so the caller's existing sort — usually name asc — is preserved). Otherwise
 * returns only items scoring at/above threshold (substring hits always included), sorted by score
 * desc then by their original order (stable) to keep ties deterministic.
 */
export function rankMaterials<T>(query: string, items: readonly T[], getText: (item: T) => string | string[], opts: RankOptions = {}): T[] {
  // Cap the query before the O(query×name) edit-distance rank so a huge paste can't spike work per keystroke.
  const nq = normalize((query ?? "").slice(0, 64));
  if (!nq) return [...items];
  const threshold = opts.threshold ?? DEFAULT_THRESHOLD;

  // getText may return several texts (name + category + sub-category) — the item's score is the BEST match
  // across them, so searching "yeast" or "additive" finds materials by their family/category, not just name.
  const scored = items
    .map((item, index) => {
      const t = getText(item);
      const texts = Array.isArray(t) ? t : [t];
      const score = texts.reduce((best, x) => Math.max(best, scoreText(nq, x)), 0);
      return { item, index, score };
    })
    .filter((s) => s.score >= threshold);

  scored.sort((a, b) => (b.score - a.score) || (a.index - b.index));
  return scored.map((s) => s.item);
}
