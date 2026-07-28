export type Fill = { filledL: number; pct: number; over: boolean; remainingL: number };

/**
 * Current fill of a vessel from its resident LOT volumes vs capacity.
 *
 * Feed this `VesselLot.volumeL` — the ledger projection — never `VesselComponent.volumeL`.
 * Components are composition (what the wine is made OF), and a lot with no recorded origin
 * has zero component rows, so summing them reports a full tank as empty. Both call sites do
 * this correctly; the parameter name is historical.
 *
 * `pct` is rounded to one decimal, which is within AC-S23's 1px tolerance for any track
 * under 2000px. See `fill-geometry.ts`.
 */
export function computeFill(componentVolumesL: number[], capacityL: number): Fill {
  const filledL = Math.round(componentVolumesL.reduce((a, b) => a + b, 0) * 100) / 100;
  const pct = capacityL > 0 ? Math.round((filledL / capacityL) * 1000) / 10 : 0;
  return {
    filledL,
    pct,
    over: filledL > capacityL,
    remainingL: Math.round((capacityL - filledL) * 100) / 100,
  };
}
