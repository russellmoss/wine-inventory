// VI-P8 — Winkler Index (UC Davis climate regions I–V) from a season GDD total in °C-days (base 10, Apr–Oct).
// Thresholds are the standard °C conversions of the classic °F ranges. The design's honesty rule: near a
// class boundary, show the NUMBER, not just the roman numeral — a region label 20 °C-days from the next class
// implies a false precision. Pure.

export type WinklerRegion = "I" | "II" | "III" | "IV" | "V";

// Upper bounds (inclusive) of Regions I–IV in °C growing-degree-days; V is the open top.
const REGION_UPPER_C: Array<{ region: WinklerRegion; upper: number }> = [
  { region: "I", upper: 1389 },
  { region: "II", upper: 1667 },
  { region: "III", upper: 1944 },
  { region: "IV", upper: 2222 },
];

const BOUNDARIES_C = REGION_UPPER_C.map((r) => r.upper); // [1389, 1667, 1944, 2222]

export interface WinklerResult {
  region: WinklerRegion;
  seasonGddC: number;
  /** Distance (°C-days) to the nearest class boundary. */
  nearestBoundaryDeltaC: number;
  /** True when within `boundaryBandC` of a boundary → render the number, not just the class (design honesty). */
  nearBoundary: boolean;
}

export function winklerRegion(seasonGddC: number, boundaryBandC = 50): WinklerResult {
  let region: WinklerRegion = "V";
  for (const r of REGION_UPPER_C) {
    if (seasonGddC <= r.upper) {
      region = r.region;
      break;
    }
  }
  const nearestBoundaryDeltaC = Math.round(
    Math.min(...BOUNDARIES_C.map((b) => Math.abs(seasonGddC - b))) * 100,
  ) / 100;
  return { region, seasonGddC, nearestBoundaryDeltaC, nearBoundary: nearestBoundaryDeltaC <= boundaryBandC };
}
