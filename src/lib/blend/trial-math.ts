// Pure bench-trial math (Phase 5, Unit 9). A trial records component RATIOS (proportions or
// bench volumes in mL); promoting scales those ratios to the target tank volume in litres. No
// DB / server imports — unit-tested directly.

export type TrialComponentRatio = {
  lotId: string;
  proportion?: number | null; // share in (0,1]
  volume?: number | null; // bench volume (mL or L) — only the ratio matters
};

/**
 * Scale a trial's component ratios to `targetL` litres. Weight = proportion ?? volume; each
 * component's litres = (weight / Σweight) * targetL. Ratio-based, so a 60/30/10 trial (whether
 * expressed as 0.6/0.3/0.1 or 60/30/10 mL) of a 600 L tank → 360/180/60 L.
 */
export function scaleTrialToVolume(
  components: TrialComponentRatio[],
  targetL: number,
): { lotId: string; litres: number }[] {
  const weights = components.map((c) => ({ lotId: c.lotId, w: c.proportion ?? c.volume ?? 0 }));
  const total = weights.reduce((a, x) => a + x.w, 0);
  if (!(total > 0) || !(targetL > 0)) return weights.map((x) => ({ lotId: x.lotId, litres: 0 }));
  return weights.map((x) => ({ lotId: x.lotId, litres: Math.round((x.w / total) * targetL * 100) / 100 }));
}
