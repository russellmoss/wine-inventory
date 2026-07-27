// Spray Intelligence S4 — the ONE shape S5b, S6, and S7b read.
//
// Pure composition over stage-core + growth-core + the durable canopy profile. No Prisma, no
// React — `read.ts` does the loading and hands the pieces in.
//
// RULE §3.5 IS THE POINT OF THIS FILE: measured and estimated must be distinguishable. There is
// deliberately NO field here that conflates the two — no bare `stage: string`, no `confidence`
// without a `source` beside it. A consumer physically cannot read an estimate as an observation,
// because every derived value arrives married to its provenance. A negative test asserts that.

import {
  resolveClusterCompactness,
  type ClusterCompactnessValue,
  type ResolvedCompactness,
  type TrellisSystemValue,
} from "@/lib/phenology/canopy-profile";
import type { GrowthEstimate } from "@/lib/phenology/growth-core";
import type { PhenologyEstimate, PhenologySource } from "@/lib/phenology/stage-core";
import { toCoordinate } from "@/lib/phenology/stage-core";
import type { PhenoStage } from "@/lib/fieldnotes/types";
import type {
  ClusterDamage,
  FruitZoneLeafRemoval,
  VinegarFlyPressure,
} from "@/lib/phenology/observation-types";
import { wasScouted } from "@/lib/phenology/observation-types";

/**
 * How close to a stage transition an ESTIMATE has to be before S7b should refuse rather than
 * gamble a phytotoxicity interlock on it. 0.15 of a stage ≈ the width of one pct bucket and a
 * half — wide enough that "just about to set fruit" trips it.
 */
export const BOUNDARY_RISK_MARGIN = 0.15;

/** Stages at which fruit is physically on the vine — what S7b's fruit-present interlocks key off. */
export const FRUIT_PRESENT_STAGES: readonly PhenoStage[] = [
  "FRUIT_SET",
  "VERAISON",
  "RIPENING",
  "HARVEST",
];

export type PhenologyBlockDTO = {
  blockId: string;
  blockLabel: string;

  // ── Stage ─────────────────────────────────────────────────────────────────────────────────
  /** null = cannot determine. Always read `stageSource` beside it. */
  stage: PhenoStage | null;
  stagePct: number | null;
  /** OBSERVED | INTERPOLATED | MODELED, or null when the stage is unknown. */
  stageSource: PhenologySource | null;
  stageConfidence: PhenologyEstimate["confidence"];
  /** The observation the answer leans on, and how stale it is — the S8 nudge to go measure. */
  anchorDate: string | null;
  anchorAgeDays: number | null;
  biofixDate: string | null;
  gddSinceBiofix: number | null;
  stageReasonCode: PhenologyEstimate["reasonCode"];
  stageReason: string | null;

  // ── Fruit presence (derived, INHERITS the stage's provenance) ──────────────────────────────
  fruitPresent: boolean | null;
  fruitPresentSource: PhenologySource | null;
  /**
   * The stage estimate sits within `BOUNDARY_RISK_MARGIN` of a transition AND is not an
   * observation. S7b should refuse a fruit-present interlock rather than gamble it on a guess.
   * Never true for an OBSERVED stage — a human looked.
   */
  boundaryRisk: boolean;

  // ── Growth ────────────────────────────────────────────────────────────────────────────────
  cmPerWeek: number | null;
  cmPerWeekRange: GrowthEstimate["cmPerWeekRange"];
  unprotectedNewLeafFraction: number | null;
  unprotectedNewLeafRange: GrowthEstimate["unprotectedNewLeafRange"];
  shootsAtLeast10cm: boolean | null;
  growthBasis: GrowthEstimate["basis"];
  growthConfidence: GrowthEstimate["confidence"];
  growthReasonCode: GrowthEstimate["reasonCode"];
  growthReason: string | null;

  // ── Canopy (durable + weekly) ─────────────────────────────────────────────────────────────
  trellisSystem: TrellisSystemValue | null;
  clusterCompactness: ClusterCompactnessValue | null;
  clusterCompactnessSource: ResolvedCompactness["source"];
  fruitZoneLeafRemoval: FruitZoneLeafRemoval | null;
  hedgedThisWeek: boolean | null;

  // ── Scouting (three-state, never collapsed) ───────────────────────────────────────────────
  clusterDamage: ClusterDamage | null;
  vinegarFlyPressure: VinegarFlyPressure | null;
  clusterDamageScouted: boolean;
  vinegarFlyScouted: boolean;

  // ── Honesty block (mirrors weather/read-core.ts:95-100) ───────────────────────────────────
  honesty: {
    /** True whenever ANY stage value here was derived rather than seen. */
    stageIsEstimated: boolean;
    /** True when the growth figure is a range or a modeled tail, not two measurements. */
    growthIsEstimated: boolean;
    /** True when a scouting field is null or NOT_ASSESSED — i.e. nobody looked. */
    scoutingGap: boolean;
    /** Weather coverage of the span the stage estimate rests on. */
    spanCompleteness: number | null;
  };
};

export type ComposeBlockInput = {
  blockId: string;
  blockLabel: string;
  stage: PhenologyEstimate;
  growth: GrowthEstimate;
  trellisSystem: TrellisSystemValue | null;
  blockCompactness: ClusterCompactnessValue | null;
  varietyCompactness: ClusterCompactnessValue | null;
  fruitZoneLeafRemoval: FruitZoneLeafRemoval | null;
  hedgedThisWeek: boolean | null;
  clusterDamage: ClusterDamage | null;
  vinegarFlyPressure: VinegarFlyPressure | null;
};

/** Is this coordinate within the boundary margin of an integer stage edge? */
function nearTransition(coord: number): boolean {
  const frac = coord - Math.floor(coord);
  return frac <= BOUNDARY_RISK_MARGIN || frac >= 1 - BOUNDARY_RISK_MARGIN;
}

export function composePhenologyBlockCore(input: ComposeBlockInput): PhenologyBlockDTO {
  const { stage, growth } = input;

  // fruitPresent is DERIVED from the stage, so it can be no more certain than the stage is. It
  // inherits the provenance rather than getting one of its own — otherwise a MODELED stage could
  // produce a fruit-present flag that reads as fact to an interlock.
  const fruitPresent = stage.stage === null ? null : FRUIT_PRESENT_STAGES.includes(stage.stage);

  const estimatedStage = stage.source === "INTERPOLATED" || stage.source === "MODELED";
  const boundaryRisk =
    estimatedStage && stage.stage !== null
      ? nearTransition(toCoordinate(stage.stage, stage.stagePct))
      : false;

  const compactness = resolveClusterCompactness(input.blockCompactness, input.varietyCompactness);

  const clusterDamageScouted = wasScouted(input.clusterDamage);
  const vinegarFlyScouted = wasScouted(input.vinegarFlyPressure);

  return {
    blockId: input.blockId,
    blockLabel: input.blockLabel,

    stage: stage.stage,
    stagePct: stage.stagePct,
    stageSource: stage.source,
    stageConfidence: stage.confidence,
    anchorDate: stage.anchorDate,
    anchorAgeDays: stage.anchorAgeDays,
    biofixDate: stage.biofixDate,
    gddSinceBiofix: stage.gddSinceBiofix,
    stageReasonCode: stage.reasonCode,
    stageReason: stage.reason,

    fruitPresent,
    fruitPresentSource: stage.source,
    boundaryRisk,

    cmPerWeek: growth.cmPerWeek,
    cmPerWeekRange: growth.cmPerWeekRange,
    unprotectedNewLeafFraction: growth.unprotectedNewLeafFraction,
    unprotectedNewLeafRange: growth.unprotectedNewLeafRange,
    shootsAtLeast10cm: growth.shootsAtLeast10cm,
    growthBasis: growth.basis,
    growthConfidence: growth.confidence,
    growthReasonCode: growth.reasonCode,
    growthReason: growth.reason,

    trellisSystem: input.trellisSystem,
    clusterCompactness: compactness.value,
    clusterCompactnessSource: compactness.source,
    fruitZoneLeafRemoval: input.fruitZoneLeafRemoval,
    hedgedThisWeek: input.hedgedThisWeek,

    clusterDamage: input.clusterDamage,
    vinegarFlyPressure: input.vinegarFlyPressure,
    clusterDamageScouted,
    vinegarFlyScouted,

    honesty: {
      stageIsEstimated: estimatedStage,
      growthIsEstimated: growth.basis === "BAND_RANGE" || growth.basis === "LEAF_EXPANSION_TAIL",
      scoutingGap: !clusterDamageScouted || !vinegarFlyScouted,
      spanCompleteness: stage.spanCompleteness,
    },
  };
}
