/**
 * Fill geometry (AC-S23) — the pixel maths behind `FillIndicator`, split out so it can be
 * tested. The repo's vitest runs `environment: "node"` with no jsdom, so a component cannot
 * be rendered here; a pure function can, and the criterion is arithmetic anyway.
 *
 * AC-S23: "Fill height is proportional to volumeL / capacityL within 1px."
 *
 * `computeFill` already rounds `pct` to one decimal, so the worst-case error this function
 * can inherit is ±0.05%. On a track of H px that is H × 0.0005 px: at doc 04 §7's minimum
 * tile height of 86px it is 0.043px, and it stays under 1px for any track below 2000px.
 * So the rounded `pct` is safe to render from directly, and `fillWithinTolerance` pins that
 * claim rather than asking a reviewer to trust the arithmetic.
 */

/** Pixels of fill for a given percentage on a track of `trackPx`. Clamped to the track. */
export function fillHeightPx(pct: number, trackPx: number): number {
  if (!Number.isFinite(pct) || !Number.isFinite(trackPx) || trackPx <= 0) return 0;
  const clamped = Math.min(100, Math.max(0, pct));
  return (clamped / 100) * trackPx;
}

/**
 * The AC-S23 predicate: does rendering from the rounded `pct` land within `tolerancePx` of
 * rendering from the exact ratio? Over-full is excluded because the bar is deliberately
 * clamped at 100% there — clamping is a rendering decision, and the overflow is stated in
 * text and flagged with an `attention` chip instead of drawn past the end of the track.
 */
export function fillWithinTolerance(
  volumeL: number,
  capacityL: number,
  pct: number,
  trackPx: number,
  tolerancePx = 1,
): boolean {
  if (capacityL <= 0) return true;
  const ideal = Math.min(1, volumeL / capacityL) * trackPx;
  return Math.abs(fillHeightPx(pct, trackPx) - ideal) < tolerancePx;
}
