// VI-P8 Unit 10 — pure presentation helpers for the climate card (testable; the component is not). Keeps the
// sparkline math + honesty labels out of the React file.

export interface SparkPoint {
  date: string;
  cumC: number;
}

/** Build an SVG polyline `points` string for a cumulative-GDD sparkline scaled into [0,width]×[0,height]. */
export function sparklinePoints(points: SparkPoint[], width: number, height: number, pad = 2): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `${pad},${height - pad}`;
  const maxC = Math.max(...points.map((p) => p.cumC), 1);
  const n = points.length;
  return points
    .map((p, i) => {
      const x = pad + (i / (n - 1)) * (width - 2 * pad);
      const y = height - pad - (p.cumC / maxC) * (height - 2 * pad);
      return `${Math.round(x * 10) / 10},${Math.round(y * 10) / 10}`;
    })
    .join(" ");
}

/** How much to trust an aggregate given its completeness %. */
export function trustLabel(completenessPct: number): "High" | "Partial" | "Sparse" {
  if (completenessPct >= 90) return "High";
  if (completenessPct >= 60) return "Partial";
  return "Sparse";
}

export function coverageLabel(state: string): string {
  switch (state) {
    case "US_HIGH_RES":
      return "High-resolution (US grids + station)";
    case "GLOBAL_COARSE":
      return "Global coarse (≈50 km) — no nearby high-res grid";
    default:
      return "No coverage";
  }
}

/** GDD-vs-last-year phrasing (warmer / cooler / similar), honest about the direction. */
export function gddComparisonLabel(deltaC: number | null): string {
  if (deltaC === null) return "No prior-year data to compare yet";
  if (Math.abs(deltaC) < 25) return `About the same as last year (${deltaC >= 0 ? "+" : ""}${deltaC} GDD)`;
  return deltaC > 0 ? `Warmer than last year (+${deltaC} GDD)` : `Cooler than last year (${deltaC} GDD)`;
}
