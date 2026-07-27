/**
 * Spray S2 Unit 5 — the pesticide lookup result contract. Pure types, no imports.
 *
 * Design rules these types enforce (S2 plan, council G1/G2/G3/C1/C4):
 *  - Every read returns a discriminated union — no bare nulls, no throw-on-absent, and NO variant
 *    that is truthy-coercible into "permitted".
 *  - `factsAsOf` is a COMPOSITE (C1): one lookup spans four sources on different cadences, so a
 *    single scalar revision id would be a false contract. This exact shape is the cross-lane
 *    agreement with S3a (docs/spray_assistant/phases/S2-S3a-factsAsOf-contract.md).
 *  - `provenance` ships as the FULL union from day one (C4): widening a literal union later breaks
 *    exhaustive consumers. S2 only ever produces "registry"; "grower-supplied" is S2b's override.
 */

/** ISO strings, not Dates — this object is snapshot-copied by S3a's spray record. */
export interface PesticideFactsAsOf {
  publishedRevisionId: string;
  apprilAsOf: string | null;
  cdprAsOf: string | null;
  resistanceArtifactSha256: string | null;
}

export type PesticideProvenance = "registry" | "grower-supplied";

/* ─── Spray S2b — the product-facts row shapes the resolver maps from ────────────────────────────
 * Structural (not Prisma-generated) so this file stays import-free and the pure mapping module can
 * consume them without pulling the client in. */

export type PesticideFactGroupValue = "REGULATORY" | "AGRONOMIC";
export type PesticideEntryActivityValue = "GENERAL" | "SCOUTING" | "HAND_LABOR" | "HARVESTING" | "IRRIGATION";

export interface CuratedFactsRow {
  id: string;
  epaRegNumber: string;
  factGroup: PesticideFactGroupValue;
  labelVersionKey: string;
  worstCasePhiDays: number | null;
  worstCaseReiHours: number | null;
  minRepeatIntervalDays: number | null;
  rainfastHours: number | null;
  mobilityClass: string | null;
  agronomicClass: string[];
  sourceAsOf: Date;
  reviewedBy: string | null;
  reviewDueAt: Date;
  reiConditions: { activity: PesticideEntryActivityValue; hours: number }[];
  phiConditions: { days: number; condition: string; isDefault: boolean }[];
}

export interface TenantFactsRow {
  productRef: string;
  productName: string;
  epaRegistrationNumber: string | null;
  factGroup: PesticideFactGroupValue;
  worstCasePhiDays: number | null;
  worstCaseReiHours: number | null;
  minRepeatIntervalDays: number | null;
  rainfastHours: number | null;
  mobilityClass: string | null;
  agronomicClass: string[];
  enteredAt: Date;
}

export interface RegistryIdentityRow {
  activeIngredients: { name: string; percentByWeight: number | null; casNumber: string | null }[];
  resistance: ProductResistanceView | null;
}

export interface PesticideJurisdiction {
  /** ISO 3166-1 alpha-2, e.g. "US". Anything else → jurisdiction-unsupported (never a throw — rule §3.9). */
  country: string;
  /** US state code, e.g. "CA". Required for a clearance; missing → state-registration-unknown. */
  state?: string | null;
}

/** The caller's vine context (K11). BEARING is the default — the conservative common case: a
 * non-bearing-only registration then fails the composition. UNSPECIFIED site rows count for a
 * BEARING context (a bare "Grapes" label is the normal bearing registration); NON_BEARING-only
 * rows never do. */
export type VineSiteContext = "BEARING" | "NON_BEARING";

export type PesticideSiteModifierValue = "BEARING" | "NON_BEARING" | "UNSPECIFIED";
export type ResistanceResolutionValue = "CODED" | "NO_CODE_EXISTS" | "GAP";
export type ResistanceSiteTypeValue = "SINGLE" | "MULTI" | "UNKNOWN";

export interface AiResistanceView {
  aiName: string;
  pcCode: string | null;
  resolution: ResistanceResolutionValue;
  codes: string[];
  siteType: ResistanceSiteTypeValue;
  /** null when the AI has NO assignment row — which is itself a GAP by construction. */
  derivedFrom: string | null;
}

/** K13 most-conservative rollup: any constituent AI in GAP makes the PRODUCT GAP. Codes that did
 * resolve travel as explicitly-labelled partial evidence — never as the answer. */
export interface ProductResistanceView {
  scheme: "FRAC";
  resolution: ResistanceResolutionValue;
  /** For CODED: the answer. For GAP: PARTIAL EVIDENCE only (see partialEvidence). */
  codes: string[];
  partialEvidence: boolean;
  siteType: ResistanceSiteTypeValue;
  derivedFrom: "PRODUCT_KEYED_TABLE" | "EXTENSION_PROSE" | "LABEL_SINGLE_AI" | "AI_ROLLUP";
  perAi: AiResistanceView[];
}

export interface FederalStatusView {
  registeredOnGrapes: boolean;
  siteModifiers: PesticideSiteModifierValue[];
  registrationStatus: string | null;
}

/* ─── Spray S2b Unit 3 — separation rules (KD-2). Structural, so `separation.ts` stays pure. ────── */

export type PesticideSeparationTargetKindValue = "ACTIVE_INGREDIENT" | "AGRONOMIC_CLASS" | "PRODUCT";
export type PesticideSeparationDirectionValue = "TARGET_AFTER_SUBJECT" | "TARGET_BEFORE_SUBJECT";

/** A rule asserted BY `subjectEpaRegNumber`'s label ABOUT a target, in one direction (KD-2). Never
 * inherited by category — two different oils carry two different rule sets. */
export interface SeparationRuleRow {
  subjectEpaRegNumber: string;
  targetKind: PesticideSeparationTargetKindValue;
  targetKey: string;
  direction: PesticideSeparationDirectionValue;
  minDays: number;
  fruitPresentOnly: boolean;
  /** verbatim label text, rendered as-is, never parsed for meaning */
  condition: string | null;
}

export interface SeparationProductProfile {
  epaRegNumber: string;
  activeIngredientKeys: readonly string[];
  /** KD-14: empty array means "not yet classified", distinct from a positively-tagged product that
   * simply lacks this tag. A CLASS-target rule against an empty array is ambiguous, never a match
   * and never a confirmed non-match (council G5 — a gap must not render as no restriction). */
  agronomicClass: readonly string[];
  rules: readonly SeparationRuleRow[];
}

export interface SeparationQuery {
  /** applied first */
  earlier: SeparationProductProfile;
  /** applied second, `elapsedDays` after `earlier` */
  later: SeparationProductProfile;
  elapsedDays: number;
  fruitPresent: boolean;
}

/** RESTRICTION_FOUND — a rule confidently matched. NO_RESTRICTION — every candidate rule confidently
 * did not match. NO_EVIDENCE — a CLASS-targeted rule exists but the candidate is not yet classified,
 * so the rule can neither be confirmed nor ruled out (council G5, KD-14). Distinct from NO_RESTRICTION
 * on purpose: a gap must never render as "no restriction" (rule §3.6). */
export type SeparationEvidenceStatus = "RESTRICTION_FOUND" | "NO_RESTRICTION" | "NO_EVIDENCE";

/** Evidence, never a verdict (S7b decides what to do with it). */
export interface SeparationEvidence {
  status: SeparationEvidenceStatus;
  /** the most restrictive minDays among every matched rule, or null if none matched */
  minDays: number | null;
  elapsedDays: number;
  /** elapsedDays < minDays — a factual comparison, not an authorization decision */
  belowMinimum: boolean;
  /** every rule tied for most-restrictive, so a caller can cite all of them */
  producingRules: SeparationRuleRow[];
  /** verbatim label text from a producing rule, if any carried one */
  condition: string | null;
  /** A CLASS-targeted rule exists that could NOT be confirmed or ruled out (council G5), even
   * though a DIFFERENT rule already produced a confident match. A confident match must never
   * hide the possibility of an even-more-restrictive unresolved rule — the gap-as-no-restriction
   * failure this module exists to prevent applies here too, not only when nothing matched. */
  hasUnresolvedAmbiguity: boolean;
}

export interface RegistrationRestrictionView {
  state: string;
  counties: string[];
  kind: string;
  exception: string | null;
  quote: string;
}

export interface RegistrationData {
  product: {
    epaRegNumber: string;
    productName: string;
    companyName: string | null;
    labelDate: string | null;
    pestCategoryRaw: string | null;
    registrationStatus: string | null;
  };
  grapeSites: { siteNameRaw: string; siteModifier: PesticideSiteModifierValue }[];
  state: { state: string; status: "REGISTERED" };
  restrictions: RegistrationRestrictionView[];
  activeIngredients: { name: string; pcCode: string | null; percent: number | null }[];
  resistance: ProductResistanceView | null;
}

/**
 * The legality composition (council C12): federal is necessary-never-sufficient, state is a required
 * conjunct, restrictions subtract. The ONLY composition yielding `ok: true` is: federally registered
 * on grapes for this vine context AND state-registered in this jurisdiction AND no unresolved
 * restriction. There is no path from partial knowledge to a clearance.
 */
export type RegistrationLookupResult =
  | { ok: true; data: RegistrationData; factsAsOf: PesticideFactsAsOf; provenance: PesticideProvenance }
  | { ok: false; reason: "source-not-enabled" }
  | { ok: false; reason: "malformed-reg-number"; detail: string }
  | { ok: false; reason: "unsupported-registration-format"; format: "CA_STATE_ONLY" | "EXEMPT_25B" }
  | { ok: false; reason: "not-found" }
  | { ok: false; reason: "not-registered-on-grapes"; factsAsOf: PesticideFactsAsOf }
  | {
      ok: false;
      reason: "non-bearing-only"; // ⚑ G1: never reported as registered for a bearing block
      siteModifiers: PesticideSiteModifierValue[];
      factsAsOf: PesticideFactsAsOf;
    }
  | {
      ok: false;
      reason: "state-not-registered"; // explicit CDPR NOT_REGISTERED row — a real NO, not absence
      state: string;
      federalStatus: FederalStatusView;
      factsAsOf: PesticideFactsAsOf;
    }
  | {
      ok: false;
      reason: "state-registration-unknown"; // ⚑ G2: the federal fact is shown, never as a clearance
      state: string | null;
      federalStatus: FederalStatusView;
      factsAsOf: PesticideFactsAsOf;
    }
  | { ok: false; reason: "jurisdiction-unsupported" }; // ⚑ G2 / rule §3.9 — non-US never throws
