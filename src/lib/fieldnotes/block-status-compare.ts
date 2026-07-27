// Key-wise BlockStatus comparison.
//
// This lives in its own file rather than in types.ts for two reasons. One, types.ts is contended
// with the S3a spray-record lane, and S4 keeps its diff there down to the field declarations and
// the parser call so whichever lane lands second rebases trivially. Two, it imports FROM types.ts
// and nothing imports it back, so there is no cycle.

import { EMPTY_BLOCK_STATUS, type BlockStatus } from "@/lib/fieldnotes/types";

/**
 * Did the manager leave this block alone?
 *
 * Replaces the `JSON.stringify(s) !== JSON.stringify(EMPTY_BLOCK_STATUS)` comparison that
 * `markRemainingHealthy` used to do. That comparison broke the moment BlockStatus gained a key:
 * the serialized string stopped matching, every untouched block read as edited, and the healthy
 * stamp silently stopped landing. Comparing the keys we care about — and ignoring any others —
 * means the NEXT field added to BlockStatus does not re-break it.
 */
export function isUntouchedBlockStatus(s: BlockStatus | undefined | null): boolean {
  if (!s) return true;
  const e = EMPTY_BLOCK_STATUS;
  return (
    s.phenoStage === e.phenoStage &&
    s.phenoStagePct === e.phenoStagePct &&
    s.shootTip === e.shootTip &&
    s.canopyDensity === e.canopyDensity &&
    s.waterStress === e.waterStress &&
    s.weedPressure === e.weedPressure &&
    s.leafConditions.length === 0 &&
    s.diseasePestSpotted === e.diseasePestSpotted &&
    s.diseaseDescription === e.diseaseDescription &&
    s.photoUrls.length === 0 &&
    s.shootLengthCm === e.shootLengthCm &&
    s.shootLengthBand === e.shootLengthBand &&
    s.hedgedThisWeek === e.hedgedThisWeek &&
    s.fruitZoneLeafRemoval === e.fruitZoneLeafRemoval &&
    s.clusterDamage === e.clusterDamage &&
    s.vinegarFlyPressure === e.vinegarFlyPressure
  );
}
