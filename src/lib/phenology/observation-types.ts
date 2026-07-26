// Spray Intelligence S4 — the six new weekly block observations, their vocabularies, and their
// parsers. They live HERE rather than in src/lib/fieldnotes/types.ts on purpose: that file is
// shared with the S3a spray-record lane, and keeping S4's diff there to ~7 additive lines
// (one import, six field declarations, six parser calls) means whichever lane lands second
// rebases trivially instead of untangling a merge.
//
// Pure — no Prisma, no React, no server-only. Hand-rolled validators in the house style
// (fieldnotes/types.ts:139-161), no zod. Every parser maps `undefined` -> `null` so the two
// live 10-field legacy rows parse byte-identically with the new fields absent.
//
// ── THE RULE THIS FILE EXISTS TO ENFORCE ──────────────────────────────────────────────────
// On the scouting pair, `null`, `"NOT_ASSESSED"`, and `"NONE"` are THREE DISTINCT FACTS:
//   null            — the control never rendered (the block is pre-FRUIT_SET / pre-VERAISON)
//   "NOT_ASSESSED"  — the control rendered and the grower did not answer it
//   "NONE"          — someone looked and saw nothing
// Collapsing any two of these turns "nobody looked" into "no damage", which is a biased sample
// read as a clean bill of health — the weeks somebody bothers to check correlate with the weeks
// something looked bad. Standing rule §3.6 applied to a scouting field. This is a contract test
// (test/phenology-observation-types.test.ts), not a convention.
//
// NOT a `*-core.ts`: this is vocabulary + validation, not a domain capability, and it must not
// enter the verify:ai-native core→tool graph on its own.

import { FieldNoteParseError } from "@/lib/fieldnotes/parse-error";

// ───────────────────────── Vocabularies ─────────────────────────
// Arrays (not TS enums) so the form maps over them and tests assert on them — house style.

/**
 * One-tap shoot-extension band. D4: this exists because a MEASURED length costs walking the
 * block with a tape, and the live fill-rate evidence says the fields that cost real effort do
 * not get filled (photos sit at 0 %). The band answers the downy-mildew 3-10 rule's actual
 * question — "are shoots ≥ 10 cm?" — EXACTLY. It must never be turned into a point growth rate
 * (council C8): band midpoints read `CM_10_30 → CM_30_60` as 55 % of leaf area unprotected when
 * the truth may be 29 → 31 cm, i.e. ~6 %. That is fiction with a decimal point on it.
 */
export const SHOOT_LENGTH_BANDS = ["LT_10", "CM_10_30", "CM_30_60", "GT_60"] as const;
export type ShootLengthBand = (typeof SHOOT_LENGTH_BANDS)[number];

/** Fruit-zone leaf removal — a genuine STANDING condition, so it carries forward week to week. */
export const FRUIT_ZONE_LEAF_REMOVAL_LEVELS = ["NONE", "PARTIAL", "FULL"] as const;
export type FruitZoneLeafRemoval = (typeof FRUIT_ZONE_LEAF_REMOVAL_LEVELS)[number];

/**
 * Berry/cluster wound status. Gated at FRUIT_SET, not VERAISON (council S6): botrytis exploits
 * EARLY wounds — powdery scarring, hail, bird damage at pea-size — and those infections stay
 * latent until veraison. Hiding the control until veraison would blind the botrytis model to
 * exactly the damage that matters most.
 */
export const CLUSTER_DAMAGE_LEVELS = [
  "NOT_ASSESSED",
  "NONE",
  "TRACE",
  "MODERATE",
  "SEVERE",
] as const;
export type ClusterDamage = (typeof CLUSTER_DAMAGE_LEVELS)[number];

/** Vinegar-fly pressure. Gated at VERAISON — flies are a ripening-sugar phenomenon; earlier is noise. */
export const VINEGAR_FLY_PRESSURE_LEVELS = [
  "NOT_ASSESSED",
  "NONE",
  "LOW",
  "MODERATE",
  "HIGH",
] as const;
export type VinegarFlyPressure = (typeof VINEGAR_FLY_PRESSURE_LEVELS)[number];

/** The scouting pair's "someone rendered the control but did not answer" sentinel. */
export const NOT_ASSESSED = "NOT_ASSESSED" as const;

/** The six S4 additions to BlockStatus, as one type the shared file can spread in. */
export type PhenologyObservations = {
  /** Mean of ~10 representative shoots, cm. `0` is a MEANINGFUL value, not an absence. */
  shootLengthCm: number | null;
  shootLengthBand: ShootLengthBand | null;
  /** An EVENT, not a state (D5/council C7). Never carried forward. `false` is meaningful. */
  hedgedThisWeek: boolean | null;
  fruitZoneLeafRemoval: FruitZoneLeafRemoval | null;
  clusterDamage: ClusterDamage | null;
  vinegarFlyPressure: VinegarFlyPressure | null;
};

/** All six absent — what a legacy row and a newly-added block both parse to. */
export const EMPTY_PHENOLOGY_OBSERVATIONS: PhenologyObservations = {
  shootLengthCm: null,
  shootLengthBand: null,
  hedgedThisWeek: null,
  fruitZoneLeafRemoval: null,
  clusterDamage: null,
  vinegarFlyPressure: null,
};

/** The phenological stages at which each scouting control becomes visible (council S6). */
export const CLUSTER_DAMAGE_GATE_STAGES = ["FRUIT_SET", "VERAISON", "RIPENING", "HARVEST"] as const;
export const VINEGAR_FLY_GATE_STAGES = ["VERAISON", "RIPENING", "HARVEST"] as const;

/** Is the cluster-damage control rendered at this stage? Drives the UI gate AND the coverage denominator. */
export function clusterDamageApplies(stage: string | null): boolean {
  return stage != null && (CLUSTER_DAMAGE_GATE_STAGES as readonly string[]).includes(stage);
}

/** Is the vinegar-fly control rendered at this stage? */
export function vinegarFlyApplies(stage: string | null): boolean {
  return stage != null && (VINEGAR_FLY_GATE_STAGES as readonly string[]).includes(stage);
}

// ───────────────────────── Parsers ─────────────────────────
// Same shape and error type as the parsers in fieldnotes/types.ts so a malformed payload fails
// identically wherever it enters. Local copies (not imports) because those helpers are private
// to that module and S4 must not widen its export surface — that file is contended with S3a.

function parseNullableEnumLocal<T extends string>(
  v: unknown,
  allowed: readonly T[],
  field: string,
): T | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string" && (allowed as readonly string[]).includes(v)) return v as T;
  throw new FieldNoteParseError(`Invalid value for "${field}": ${JSON.stringify(v)}.`);
}

/**
 * Shoot length in cm. Rejects negatives — a negative length is not a small shoot, it is a bad
 * payload, and the growth model divides by this number. `0` is accepted and meaningful
 * (a block cut back to the trunk), and it must survive every downstream truthiness gate.
 */
export function parseShootLengthCm(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" && Number.isFinite(v) && v >= 0) return v;
  throw new FieldNoteParseError(
    `Expected a non-negative number or null for "shootLengthCm": ${JSON.stringify(v)}.`,
  );
}

export function parseShootLengthBand(v: unknown): ShootLengthBand | null {
  return parseNullableEnumLocal(v, SHOOT_LENGTH_BANDS, "shootLengthBand");
}

/**
 * `hedgedThisWeek`. Tri-state on purpose: `true` (hedged), `false` (explicitly not hedged), and
 * `null` (not assessed) are three different facts. Deliberately NOT `raw === true`, which is how
 * `diseasePestSpotted` silently swallowed a cleared flag.
 */
export function parseHedgedThisWeek(v: unknown): boolean | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "boolean") return v;
  throw new FieldNoteParseError(
    `Expected true, false, or null for "hedgedThisWeek": ${JSON.stringify(v)}.`,
  );
}

export function parseFruitZoneLeafRemoval(v: unknown): FruitZoneLeafRemoval | null {
  return parseNullableEnumLocal(v, FRUIT_ZONE_LEAF_REMOVAL_LEVELS, "fruitZoneLeafRemoval");
}

export function parseClusterDamage(v: unknown): ClusterDamage | null {
  return parseNullableEnumLocal(v, CLUSTER_DAMAGE_LEVELS, "clusterDamage");
}

export function parseVinegarFlyPressure(v: unknown): VinegarFlyPressure | null {
  return parseNullableEnumLocal(v, VINEGAR_FLY_PRESSURE_LEVELS, "vinegarFlyPressure");
}

/** Parse all six at once from a raw block-status object. Absent keys -> null, never dropped. */
export function parsePhenologyObservations(raw: Record<string, unknown>): PhenologyObservations {
  return {
    shootLengthCm: parseShootLengthCm(raw.shootLengthCm),
    shootLengthBand: parseShootLengthBand(raw.shootLengthBand),
    hedgedThisWeek: parseHedgedThisWeek(raw.hedgedThisWeek),
    fruitZoneLeafRemoval: parseFruitZoneLeafRemoval(raw.fruitZoneLeafRemoval),
    clusterDamage: parseClusterDamage(raw.clusterDamage),
    vinegarFlyPressure: parseVinegarFlyPressure(raw.vinegarFlyPressure),
  };
}

// ───────────────────────── Scouting-value semantics ─────────────────────────

/**
 * Did somebody actually look? `"NOT_ASSESSED"` and `null` both mean NO — and S5b's sour-rot and
 * botrytis indices must read this, never a truthiness check on the raw value.
 */
export function wasScouted(v: ClusterDamage | VinegarFlyPressure | null): boolean {
  return v !== null && v !== NOT_ASSESSED;
}

/**
 * The affirmative "someone looked and saw nothing" answer — the ONLY value that may be read as
 * a clean bill of health. `null` and `"NOT_ASSESSED"` must never reach a model as this.
 */
export function isScoutedClean(v: ClusterDamage | VinegarFlyPressure | null): boolean {
  return v === "NONE";
}
