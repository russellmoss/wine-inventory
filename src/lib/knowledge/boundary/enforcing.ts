// SKB Unit 2 — which sources the tabular/prose boundary is ENFORCED on, stated once.
//
// Stated once on purpose: the crawl loops, the monthly sweep, and `verify:kb-boundary` all read this,
// and if any two of them disagreed the audit could pass while the gate leaked (or the reverse).
//
// ── THE SHAPE IS A REPORT-ONLY LIST, NOT AN ENFORCING LIST, AND THAT IS THE POINT (council C3) ──
//
// Enforcement is the DEFAULT and report-only is the explicitly-named exception. Three consequences,
// all of them the reason it is written this way round:
//
//   1. A new source enforces automatically. Nobody can add one and forget to opt it in — the SKB
//      sources (Penn State, Virginia Tech grape IPM, and MSU if it ever populates) are covered the
//      moment they register, without touching this file.
//   2. An unknown or missing source key enforces. Fail closed.
//   3. D3's close-out is a literal DELETION from this list. "A safety invariant cannot be
//      grandfathered" — report-only is a single-PR state, not a resting one. The list shrinks to
//      empty (or to a named per-document exclusion with a recorded reason) inside this phase, and
//      when it is empty the whole mechanism disappears rather than quietly persisting.
//
// WHY THE INCUMBENTS ARE HERE AT ALL. Retroactively excluding live corpus content on an unmeasured
// detector is its own hazard: it changes retrieval for 25 sources at once with no before-evidence.
// So they are measured first. `verify:kb-boundary` prints the per-source count, and that number is
// what the close-out decides against.

import { KNOWLEDGE_SOURCES } from "../config";

export type BoundaryMode = "enforce" | "report-only";

/**
 * The 25 sources registered BEFORE SKB. Frozen deliberately: this is a census taken at a moment in
 * time, not a policy that new sources join. `test/knowledge-boundary-gate.test.ts` asserts every key
 * here is a real registered source, so a rename or a typo fails loudly instead of silently promoting
 * a source to enforcing (or, worse, leaving a live source unmeasured).
 *
 * Removing an entry is how this phase closes D3. Do not add one.
 */
export const BOUNDARY_REPORT_ONLY_SOURCE_KEYS: readonly string[] = [
  "ives-technical-reviews",
  "cornell-grapes",
  "viticulture-extension-refs",
  "awri",
  "wine-australia",
  "wsu",
  "osu-owri",
  "osu-extension",
  "scott-labs",
  "ifv-occitanie",
  "ifv-france",
  "umc",
  "icvv",
  "chambre-gironde",
  "mapa",
  "wbi",
  "lvwo",
  "incavi",
  "laffort",
  "enartis",
  "ets",
  "vt-enology-notes",
  "uc-ipm",
  "msu-grapes",
  "epa-pesticide",
];

const REPORT_ONLY = new Set(BOUNDARY_REPORT_ONLY_SOURCE_KEYS);

/**
 * How the boundary applies to one source. An absent/unknown key enforces — a document whose source we
 * cannot identify is the last thing to wave through.
 */
export function boundaryModeFor(sourceKey: string | null | undefined): BoundaryMode {
  if (!sourceKey) return "enforce";
  return REPORT_ONLY.has(sourceKey) ? "report-only" : "enforce";
}

/** Keys in the report-only census that are no longer registered sources (a rename or a deletion). */
export function staleReportOnlyKeys(): string[] {
  const registered = new Set(KNOWLEDGE_SOURCES.map((s) => s.key));
  return BOUNDARY_REPORT_ONLY_SOURCE_KEYS.filter((k) => !registered.has(k));
}
