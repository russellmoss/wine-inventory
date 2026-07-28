/**
 * Tank-board grid (doc 04 §7). The CSS in `globals.css` (`.bw-tank-board`) is what actually
 * lays the board out; this module is the same table as data so the breakpoints are
 * unit-testable and so the two cannot silently disagree.
 *
 * | Width | Columns |
 * |-------|---------|
 * | 390   | 2       |
 * | 430   | 2 (larger type) |
 * | 768   | 4       |
 * | 1024  | 6       |
 * | 1440+ | 6 (wider tiles) |
 */

export type BoardBreakpoint = { minWidth: number; columns: number };

/** Ascending by `minWidth`. Mirrors `.bw-tank-board` exactly. */
export const BOARD_BREAKPOINTS: readonly BoardBreakpoint[] = [
  { minWidth: 0, columns: 2 },
  { minWidth: 768, columns: 4 },
  { minWidth: 1024, columns: 6 },
] as const;

/** Doc 04 §7: "Tile minimum 132×86px so the lot code never truncates below 8 characters". */
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
