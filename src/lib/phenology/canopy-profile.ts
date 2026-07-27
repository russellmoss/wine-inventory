// Spray Intelligence S4 / D12 — the DURABLE half of a block's canopy profile.
//
// Cluster compactness is a static viticultural fact for most blocks (Pinot Noir is tight,
// Cabernet Sauvignon is loose), so the variety carries the default and a grower only fills the
// block override when clone or site genuinely differs. This file owns that precedence in ONE
// place so the read seam (U7), S5b's botrytis/sour-rot microclimate term, and any future UI all
// resolve it identically instead of each re-deriving it.
//
// Pure — no Prisma, no React. `null` in means *not recorded*, and it resolves to `"unknown"`,
// never to a default (standing rule §3.6: a gap must never render as a clean answer).
//
// NOT a `*-core.ts`: this is a two-line precedence rule, not a domain capability, and it must
// not enter the verify:ai-native core→tool graph on its own.

/** Mirrors the Prisma `ClusterCompactness` enum. Kept as a string union so this file stays pure. */
export const CLUSTER_COMPACTNESS_VALUES = ["LOOSE", "MODERATE", "TIGHT"] as const;
export type ClusterCompactnessValue = (typeof CLUSTER_COMPACTNESS_VALUES)[number];

/** Mirrors the Prisma `TrellisSystem` enum. */
export const TRELLIS_SYSTEM_VALUES = [
  "VSP",
  "HIGH_WIRE_CORDON",
  "SPRAWL",
  "GDC",
  "SCOTT_HENRY",
  "LYRE",
  "OTHER",
] as const;
export type TrellisSystemValue = (typeof TRELLIS_SYSTEM_VALUES)[number];

/** Where a resolved compactness value came from. `unknown` is a first-class outcome. */
export type CompactnessSource = "BLOCK" | "VARIETY" | "UNKNOWN";

export type ResolvedCompactness = {
  /** null when nothing is recorded anywhere — the caller must treat this as cannot-determine. */
  value: ClusterCompactnessValue | null;
  source: CompactnessSource;
};

/**
 * D12 resolution order: block override → variety default → unknown.
 *
 * The `source` is returned alongside the value because a grower is entitled to know whether the
 * compactness driving a botrytis call was measured on THEIR block or inherited from the variety.
 */
export function resolveClusterCompactness(
  blockOverride: ClusterCompactnessValue | null | undefined,
  varietyDefault: ClusterCompactnessValue | null | undefined,
): ResolvedCompactness {
  if (blockOverride) return { value: blockOverride, source: "BLOCK" };
  if (varietyDefault) return { value: varietyDefault, source: "VARIETY" };
  return { value: null, source: "UNKNOWN" };
}

/** Human label for a resolved compactness, including the provenance. Never renders a bare guess. */
export function describeClusterCompactness(resolved: ResolvedCompactness): string {
  if (resolved.value === null) return "Cluster compactness not recorded";
  const pretty = resolved.value.charAt(0) + resolved.value.slice(1).toLowerCase();
  return resolved.source === "BLOCK"
    ? `${pretty} clusters (recorded for this block)`
    : `${pretty} clusters (variety default)`;
}
