/**
 * Tank-board grid (doc 04 §7). The CSS in `globals.css` (`.bw-tank-board`) is what actually
 * lays the board out; this module is the same table as data so the breakpoints are
 * unit-testable and so the two cannot silently disagree.
 *
 * | Width | Columns | Implemented |
 * |-------|---------|-------------|
 * | 390   | 2       | yes |
 * | 430   | 2       | yes (the doc's "larger type" ramp is NOT implemented) |
 * | 768   | 4       | yes |
 * | 1024  | 6       | yes |
 * | 1440+ | 6       | yes (the doc's "wider tiles" step is NOT implemented) |
 */

export type BoardBreakpoint = { minWidth: number; columns: number };

/** Ascending by `minWidth`. Mirrors `.bw-tank-board` exactly. */
export const BOARD_BREAKPOINTS: readonly BoardBreakpoint[] = [
  { minWidth: 0, columns: 2 },
  { minWidth: 768, columns: 4 },
  { minWidth: 1024, columns: 6 },
] as const;

/**
 * Doc 04 §7's tile minimum. Only the HEIGHT is applied: a min-width on a `minmax(0, 1fr)`
 * grid item overflows its track rather than widening it, so identity text clips with a
 * tooltip instead (doc 04 §164). `TILE_MIN_WIDTH` is kept as the documented intent and is
 * what the skeleton reserves.
 */
export const TILE_MIN_WIDTH = 132;
export const TILE_MIN_HEIGHT = 86;

export function boardColumns(viewportWidth: number): number {
  let columns = BOARD_BREAKPOINTS[0].columns;
  for (const bp of BOARD_BREAKPOINTS) {
    if (viewportWidth >= bp.minWidth) columns = bp.columns;
  }
  return columns;
}

/** Rows needed to show `count` tiles at a given viewport width. */
export function boardRows(count: number, viewportWidth: number): number {
  if (count <= 0) return 0;
  return Math.ceil(count / boardColumns(viewportWidth));
}
