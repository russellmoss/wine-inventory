// Spray Intelligence S3a — the pure facts-as-of snapshot builder (KD-4, rule §3.8). Maps one
// resolver result onto the discrete snapshot columns, deriving factsCompleteness from the ACTUAL
// content (never trusting a resolver's claim upward) and the two knownness flags (council C7).
//
// Guarantees, mirrored by the DB CHECKs (invariant SPRAY-3):
//   - an empty array is NEVER emitted with known = true;
//   - factsCompleteness is KNOWN only when every field is present AND both flags are true;
//   - nothing is ever defaulted — absent stays null/false/UNKNOWN.

import type { ResolvedActiveIngredient, ResolvedProductFacts } from "./product-facts-port";
import type { SprayFactsCompleteness, SprayFactsSource, SprayMobilityClass } from "./types";

export interface FactsSnapshot {
  snapshotPhiDays: number | null;
  snapshotReiHours: number | null;
  snapshotRainfastHours: number | null;
  snapshotMobilityClass: SprayMobilityClass | null;
  snapshotResistanceGroups: string[];
  resistanceGroupsKnown: boolean;
  snapshotActiveIngredientKeys: string[];
  activeIngredientsKnown: boolean;
  snapshotActiveIngredients: ResolvedActiveIngredient[] | null;
  // The COMPOSITE watermark, flattened onto columns (S2's frozen contract — never a scalar).
  factsPublishedRevisionId: string | null;
  factsApprilAsOf: Date | null;
  factsCdprAsOf: Date | null;
  factsResistanceArtifactSha256: string | null;
  /** Display/staleness convenience: the NEWEST non-null component. Engines compare components. */
  factsAsOf: Date | null;
  factsSource: SprayFactsSource;
  factsCompleteness: SprayFactsCompleteness;
}

/** Parse an ISO component to a Date, or null. A malformed string is null — never Invalid Date. */
function parseComponent(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** The newest non-null component — what a human reads as "these facts are from …". */
export function newestFactsComponent(components: (Date | null)[]): Date | null {
  let newest: Date | null = null;
  for (const c of components) {
    if (c && (newest === null || c.getTime() > newest.getTime())) newest = c;
  }
  return newest;
}

/**
 * Normalize one resistance code to a scheme-prefixed, uppercase form ("frac: 7" → "FRAC:7").
 * A bare code with no scheme gets FRAC — the dominant scheme for vineyard fungicides; S2b's
 * resolver is expected to send scheme-prefixed codes so this branch is a legacy-input fallback,
 * not a guess about new data. Returns null for an empty/unusable code (dropped, never "").
 */
export function normalizeResistanceCode(raw: string | null | undefined): string | null {
  const s = String(raw ?? "").trim().toUpperCase().replace(/\s+/g, "");
  if (!s) return null;
  return s.includes(":") ? s : `FRAC:${s}`;
}

/** Normalize an active-ingredient key: strip non-alphanumerics, UPPERCASE ("Copper Hydroxide" → "COPPERHYDROXIDE"). */
export function normalizeAiKey(raw: string | null | undefined): string | null {
  const s = String(raw ?? "")
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase();
  return s || null;
}

function dedupe(values: string[]): string[] {
  return [...new Set(values)];
}

/** Map a resolver result onto the snapshot columns. Pure; never invents a default. */
export function buildFactsSnapshot(resolved: ResolvedProductFacts): FactsSnapshot {
  const groups = dedupe(
    (resolved.resistanceGroups ?? []).map(normalizeResistanceCode).filter((c): c is string => c != null),
  );
  const aiKeys = dedupe(
    (resolved.activeIngredientKeys ?? []).map(normalizeAiKey).filter((k): k is string => k != null),
  );
  const resistanceGroupsKnown = groups.length > 0;
  const activeIngredientsKnown = aiKeys.length > 0;
  const apprilAsOf = parseComponent(resolved.factsAsOf?.apprilAsOf);
  const cdprAsOf = parseComponent(resolved.factsAsOf?.cdprAsOf);

  const discrete = [resolved.phiDays, resolved.reiHours, resolved.rainfastHours, resolved.mobilityClass];
  const presentCount = discrete.filter((v) => v != null).length + (resistanceGroupsKnown ? 1 : 0) + (activeIngredientsKnown ? 1 : 0);
  const totalCount = discrete.length + 2;
  const factsCompleteness: SprayFactsCompleteness =
    presentCount === 0 ? "UNKNOWN" : presentCount === totalCount ? "KNOWN" : "PARTIAL";

  return {
    snapshotPhiDays: resolved.phiDays,
    snapshotReiHours: resolved.reiHours,
    snapshotRainfastHours: resolved.rainfastHours,
    snapshotMobilityClass: resolved.mobilityClass,
    snapshotResistanceGroups: resistanceGroupsKnown ? groups : [],
    resistanceGroupsKnown,
    snapshotActiveIngredientKeys: activeIngredientsKnown ? aiKeys : [],
    activeIngredientsKnown,
    snapshotActiveIngredients: resolved.activeIngredients && resolved.activeIngredients.length ? resolved.activeIngredients : null,
    factsPublishedRevisionId: resolved.factsAsOf?.publishedRevisionId ?? null,
    factsApprilAsOf: apprilAsOf,
    factsCdprAsOf: cdprAsOf,
    factsResistanceArtifactSha256: resolved.factsAsOf?.resistanceArtifactSha256 ?? null,
    factsAsOf: newestFactsComponent([apprilAsOf, cdprAsOf]),
    factsSource: resolved.source,
    factsCompleteness,
  };
}
