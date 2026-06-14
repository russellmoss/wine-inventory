export type Fill = { filledL: number; pct: number; over: boolean; remainingL: number };

/** Current fill of a vessel from its component volumes vs capacity. */
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
