/**
 * Search result shaping and ranking (doc 01 §7).
 *
 * Pure — no Prisma, no React — so the ordering rules, the per-group cap and the
 * "Ask is never first" rule are unit-testable without a database or a browser.
 *
 * The palette is DETERMINISTIC. It never depends on an LLM call, and it works
 * with the assistant disabled or unavailable: a cellar hand must be able to find
 * a barrel when the model is down.
 */

export type SearchKind =
  | "destination"
  | "barrel"
  | "group"
  | "tank"
  | "lot"
  | "workOrder"
  | "block"
  | "material";

export interface SearchHit {
  kind: SearchKind;
  id: string;
  /** The thing's own name — a lot code, a barrel code, a nav label. */
  label: string;
  /** Disambiguates two things with similar labels. Never decorative. */
  subtitle?: string;
  href: string;
}

/**
 * Group order (doc 01 §7). Destinations first: typing "lots" almost always means
 * "take me to Lots", and making someone scroll past 5 barrels to reach it would
 * make the palette slower than the sidebar it replaces.
 */
export const GROUP_ORDER: SearchKind[] = [
  "destination",
  "barrel",
  "group",
  "tank",
  "lot",
  "workOrder",
  "block",
  "material",
];

export const GROUP_LABEL: Record<SearchKind, string> = {
  destination: "Go to",
  barrel: "Barrels",
  group: "Barrel groups",
  tank: "Tanks",
  lot: "Lots",
  workOrder: "Work orders",
  block: "Blocks",
  material: "Materials",
};

/** Max rows per group before "more" (doc 01 §7). */
export const PER_GROUP_CAP = 5;

export interface SearchGroup {
  kind: SearchKind;
  label: string;
  hits: SearchHit[];
  /** How many were dropped by the cap — surfaced as "+N more", never hidden. */
  more: number;
}

/**
 * A question gets an **Ask** row at the BOTTOM, never the top (doc 01 §7).
 *
 * The assistant must not be load-bearing for findability. If "where is the
 * Syrah?" put Ask first, the deterministic result the user actually wanted would
 * sit below an LLM call that might be slow, wrong, or switched off.
 */
export function looksLikeQuestion(q: string): boolean {
  const t = q.trim().toLowerCase();
  if (t.endsWith("?")) return true;
  return /^(who|what|when|where|why|how|which|is|are|can|should|did|does)\b/.test(t);
}

/** Group hits, preserving GROUP_ORDER and capping each group. */
export function groupHits(hits: SearchHit[]): SearchGroup[] {
  const out: SearchGroup[] = [];
  for (const kind of GROUP_ORDER) {
    const all = hits.filter((h) => h.kind === kind);
    if (all.length === 0) continue;
    out.push({
      kind,
      label: GROUP_LABEL[kind],
      hits: all.slice(0, PER_GROUP_CAP),
      more: Math.max(0, all.length - PER_GROUP_CAP),
    });
  }
  return out;
}

/**
 * Rank within a group. An EXACT code match wins outright — someone typing
 * "CH-NEUTRAL-14" wants that barrel, not a fuzzy neighbour — then prefix, then
 * substring, then alphabetical so the order is stable between keystrokes.
 */
export function rankHits(hits: SearchHit[], query: string): SearchHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return hits;
  const score = (h: SearchHit): number => {
    const l = h.label.toLowerCase();
    if (l === q) return 0;
    if (l.startsWith(q)) return 1;
    if (l.includes(q)) return 2;
    if ((h.subtitle ?? "").toLowerCase().includes(q)) return 3;
    return 4;
  };
  return [...hits].sort((a, b) => {
    const d = score(a) - score(b);
    return d !== 0 ? d : a.label.localeCompare(b.label);
  });
}

/** The flat, keyboard-navigable row list the palette actually renders. */
export function flattenForKeyboard(groups: SearchGroup[]): SearchHit[] {
  return groups.flatMap((g) => g.hits);
}

/** Wrap the active index so ArrowDown at the end returns to the top. */
export function moveIndex(current: number, delta: number, length: number): number {
  if (length === 0) return 0;
  return (current + delta + length) % length;
}
