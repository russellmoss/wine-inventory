// Spray Intelligence S3a — the product-facts PORT (KD-3). The seam that keeps lane C (the record)
// parallel to lane B (S2/S2b registration): S3a never imports src/lib/pesticide/; S2b later
// registers a real resolver behind this interface. S3a ships the null implementation, which is
// what makes "an unknown product resolves to UNKNOWN, never clear" (rule §3.6) the CURRENT,
// TESTED behavior rather than a promise about future code.
//
// The primary method is resolveMany (council C11): a per-line resolve() is an N+1 the null
// resolver would hide entirely, so the bad shape would ship untested and S2b would inherit it.
// The write core dedupes keys per application before calling it.

import type { SprayFactsCompleteness, SprayFactsSource, SprayMobilityClass } from "./types";

export interface ProductFactsKey {
  epaRegistrationNumber?: string | null;
  tenantProductRef?: string | null;
  productName: string;
}

/**
 * The facts-as-of watermark — a COMPOSITE, structurally identical to S2's frozen
 * `PesticideFactsAsOf` (docs/spray_assistant/phases/S2-S3a-factsAsOf-contract.md). Declared
 * here rather than imported from `src/lib/pesticide/` on purpose: this port is also how a
 * NON-registry resolver answers (the S2b tenant-defined / grower-supplied path, rule §3.9), and
 * the spray family must not take a hard dependency on the US registry lane.
 *
 * A null component means **we have never published that source** — render unknown, never "current".
 * ISO strings, not Dates: this object is snapshot-COPIED onto an immutable record, and a
 * JSON-round-trippable value survives that copy without a serialization seam (S2 contract, rule 1).
 */
export interface ProductFactsAsOf {
  /** S2's `PesticideDataRevision` cuid. A STRING — never an Int (that was the shipped seam defect). */
  publishedRevisionId: string;
  apprilAsOf: string | null;
  cdprAsOf: string | null;
  resistanceArtifactSha256: string | null;
  /**
   * S2b — THE FIFTH SOURCE. The curated product-facts artifact moves on its OWN cadence (a human
   * commits it), so per the contract's change rule it gets its own component instead of overloading
   * one of S2's four. Null = no curated facts contributed to this snapshot.
   */
  productFactsArtifactSha256?: string | null;
  productFactsAsOf?: string | null;
}

/**
 * S2b KD-11 — FACT-GROUP provenance. A DIFFERENT axis from the registry watermark above: which
 * SOURCE each group's values came from, and whether that group was already past review when the
 * grower acted. Conflating the two is exactly how the scalar-vs-composite seam defect happened.
 *
 * Optional on the port so the null resolver and any pre-S2b caller stay valid; absent means "the
 * resolver does not distinguish groups", which the snapshot builder records as NONE/not-stale.
 */
export interface ProductFactsGroupProvenance {
  source: SprayFactsSource;
  asOf: string | null;
  staleAtWrite: boolean;
}

export interface ResolvedActiveIngredient {
  name: string;
  percentByWeight: number | null;
  casNumber: string | null;
}

/**
 * What a resolver can say about one product. ALWAYS returned — completeness is the honest answer.
 * A null field means "the resolver could not determine this"; an empty resistanceGroups array is
 * treated identically to null by the snapshot builder (it can never become known=true + []).
 */
export interface ResolvedProductFacts {
  completeness: SprayFactsCompleteness;
  source: SprayFactsSource;
  phiDays: number | null;
  reiHours: number | null;
  rainfastHours: number | null;
  mobilityClass: SprayMobilityClass | null;
  /** Scheme-prefixed codes ("FRAC:7"). null (or empty) = could not determine. */
  resistanceGroups: string[] | null;
  /** Normalized AI keys ("SULFUR"). null (or empty) = could not determine. */
  activeIngredientKeys: string[] | null;
  activeIngredients: ResolvedActiveIngredient[] | null;
  /** The composite watermark naming WHICH facts these are. Null = the resolver has no provenance
   * to offer (the null resolver, or a source that has never published). */
  factsAsOf: ProductFactsAsOf | null;
  /** S2b KD-11 — per-group provenance. Absent = the resolver does not distinguish groups. */
  regulatory?: ProductFactsGroupProvenance | null;
  agronomic?: ProductFactsGroupProvenance | null;
}

export interface ProductFactsResolver {
  /** Index-aligned with `keys`. Must never throw on an unknown product — unknown IS the answer. */
  resolveMany(keys: ProductFactsKey[]): Promise<ResolvedProductFacts[]>;
}

export const UNRESOLVED_PRODUCT_FACTS: ResolvedProductFacts = {
  completeness: "UNKNOWN",
  source: "NONE",
  phiDays: null,
  reiHours: null,
  rainfastHours: null,
  mobilityClass: null,
  resistanceGroups: null,
  activeIngredientKeys: null,
  activeIngredients: null,
  factsAsOf: null,
};

/** The S3a default: every product resolves to UNKNOWN. Replaced by S2b's real resolver. */
export const NullProductFactsResolver: ProductFactsResolver = {
  async resolveMany(keys: ProductFactsKey[]): Promise<ResolvedProductFacts[]> {
    return keys.map(() => ({ ...UNRESOLVED_PRODUCT_FACTS }));
  },
};
