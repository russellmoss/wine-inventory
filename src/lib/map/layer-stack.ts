/**
 * Map Explorer layer stack — PURE ordering logic (no React, no Leaflet, no DOM).
 *
 * Why this exists: the layer control used to reorder a list of NAMES while the map painted whatever
 * order Leaflet happened to have in the DOM. A raster (`L.ImageOverlay` → an `<img>`) and a vector
 * (`L.GeoJSON` → paths inside the ONE shared SVG renderer container) both live in `overlayPane`, and
 * that shared SVG container keeps its DOM position no matter what order the vector layers are added
 * in — so "move up" moved the words and nothing else.
 *
 * The fix is deterministic z-ordering by Leaflet PANE: every slot in the stack gets its own pane with
 * an explicit z-index, and each layer is created into its slot's pane. This module owns the pure part
 * of that — the slot arithmetic and the pane naming — so it can be unit-tested without a browser.
 *
 * Vocabulary:
 * - the UI shows the stack TOP→BOTTOM (like an image editor's layers panel);
 * - the map paints BOTTOM→TOP (later slot = higher z-index = painted over);
 * - the block-polygon layer is rendered by `SatelliteMap` itself (not an overlay), so it takes part in
 *   the ordering via `blocksOrderIndex` — the number of overlays that paint BELOW it.
 */

/** Stack id of the block-polygon layer (rendered by SatelliteMap, not passed as an overlay). */
export const BLOCKS_LAYER_ID = "blocks";

/** Leaflet's own `overlayPane` sits at z-index 400 and `markerPane` at 600 — the stack lives between. */
export const STACK_PANE_BASE_Z = 401;
const STACK_PANE_PREFIX = "bw-stack-";

/** Pane name for overlay slot `slot` (0 = bottom). */
export function stackPaneName(slot: number): string {
  return `${STACK_PANE_PREFIX}${slot}`;
}

/** Dedicated pane for the block polygons — its z-index moves as the blocks layer moves in the stack. */
export const BLOCKS_PANE_NAME = "bw-blocks";

/** z-index for a stack slot. Stays strictly between Leaflet's overlayPane (400) and markerPane (600). */
export function stackPaneZIndex(slot: number): number {
  return STACK_PANE_BASE_Z + Math.max(0, Math.min(slot, 190));
}

/**
 * Slot assignment for a stack of `overlayCount` overlays plus the block layer wedged in at
 * `blocksOrderIndex` (0 = under everything). Returns each participant's slot, bottom-up.
 */
export function stackSlots(
  overlayCount: number,
  blocksOrderIndex: number,
): { blocksSlot: number; overlaySlots: number[] } {
  const b = Math.max(0, Math.min(blocksOrderIndex, overlayCount));
  const overlaySlots: number[] = [];
  for (let i = 0; i < overlayCount; i++) overlaySlots.push(i < b ? i : i + 1);
  return { blocksSlot: b, overlaySlots };
}

/** Move `id` one step within a TOP→BOTTOM order (dir -1 = up/nearer the top). Returns the SAME array when it can't move. */
export function moveInOrder<T>(order: readonly T[], id: T, dir: -1 | 1): T[] {
  const i = order.indexOf(id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= order.length) return order as T[];
  const next = [...order];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

/**
 * Resolve a TOP→BOTTOM layer order into what `SatelliteMap` needs: the visible overlays in
 * BOTTOM→TOP paint order, and where the block layer sits among them.
 *
 * Hidden layers contribute nothing — so hiding the middle layer collapses the stack rather than
 * leaving a hole, and `blocksOrderIndex` stays consistent with the array that is actually painted.
 */
export function resolveMapStack<Id extends string, O>(
  orderTopDown: readonly Id[],
  opts: {
    /** The id that stands for the block-polygon layer (usually `BLOCKS_LAYER_ID`). */
    blocksId: Id;
    isVisible: (id: Id) => boolean;
    overlaysFor: (id: Id) => readonly O[];
  },
): { overlays: O[]; blocksOrderIndex: number } {
  const overlays: O[] = [];
  // Default: blocks under everything — the pre-pane behaviour, which other maps still rely on.
  let blocksOrderIndex = 0;
  for (let i = orderTopDown.length - 1; i >= 0; i--) {
    const id = orderTopDown[i];
    if (id === opts.blocksId) {
      blocksOrderIndex = overlays.length;
      continue;
    }
    if (!opts.isVisible(id)) continue;
    overlays.push(...opts.overlaysFor(id));
  }
  return { overlays, blocksOrderIndex };
}
