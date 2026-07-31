import { describe, it, expect } from "vitest";
import {
  BLOCKS_LAYER_ID,
  BLOCKS_PANE_NAME,
  moveInOrder,
  resolveMapStack,
  stackPaneName,
  stackPaneZIndex,
  stackSlots,
} from "@/lib/map/layer-stack";

type Id = "ndvi" | "soil" | typeof BLOCKS_LAYER_ID;

/** The Map Explorer stack, resolved the way NdviMapPanel resolves it. */
function resolve(order: Id[], visible: Partial<Record<Id, boolean>> = {}) {
  const vis: Record<Id, boolean> = { ndvi: true, soil: true, blocks: true, ...visible };
  return resolveMapStack<Id, string>(order, {
    blocksId: BLOCKS_LAYER_ID,
    isVisible: (id) => vis[id],
    overlaysFor: (id) => (id === "blocks" ? [] : [id]),
  });
}

describe("moveInOrder", () => {
  it("swaps a layer one step up (toward the top of the list)", () => {
    expect(moveInOrder(["blocks", "soil", "ndvi"], "ndvi", -1)).toEqual(["blocks", "ndvi", "soil"]);
  });

  it("swaps a layer one step down", () => {
    expect(moveInOrder(["blocks", "soil", "ndvi"], "blocks", 1)).toEqual(["soil", "blocks", "ndvi"]);
  });

  it("returns the same array at the ends and for an unknown id", () => {
    const order = ["blocks", "soil", "ndvi"];
    expect(moveInOrder(order, "blocks", -1)).toBe(order);
    expect(moveInOrder(order, "ndvi", 1)).toBe(order);
    expect(moveInOrder(order, "nope", -1)).toBe(order);
  });
});

describe("stackSlots / pane z-indices", () => {
  it("wedges the block layer into the slot sequence without colliding", () => {
    // 3 overlays, blocks 2nd from the bottom → slots 0, [blocks]=1, 2, 3
    const { blocksSlot, overlaySlots } = stackSlots(3, 1);
    expect(blocksSlot).toBe(1);
    expect(overlaySlots).toEqual([0, 2, 3]);
    expect(new Set([blocksSlot, ...overlaySlots]).size).toBe(4);
  });

  it("puts blocks under everything at index 0 and over everything at the end", () => {
    expect(stackSlots(2, 0)).toEqual({ blocksSlot: 0, overlaySlots: [1, 2] });
    expect(stackSlots(2, 2)).toEqual({ blocksSlot: 2, overlaySlots: [0, 1] });
  });

  it("clamps an out-of-range blocks index instead of producing a duplicate slot", () => {
    expect(stackSlots(2, 9).blocksSlot).toBe(2);
    expect(stackSlots(2, -4).blocksSlot).toBe(0);
  });

  it("keeps every z-index strictly between Leaflet's overlayPane (400) and markerPane (600)", () => {
    for (const slot of [0, 1, 5, 50, 500]) {
      const z = stackPaneZIndex(slot);
      expect(z).toBeGreaterThan(400);
      expect(z).toBeLessThan(600);
    }
    // Higher slot never paints below a lower one.
    expect(stackPaneZIndex(2)).toBeGreaterThan(stackPaneZIndex(1));
  });

  it("names one distinct pane per slot, none colliding with the block pane", () => {
    const names = [0, 1, 2].map(stackPaneName);
    expect(new Set(names).size).toBe(3);
    expect(names).not.toContain(BLOCKS_PANE_NAME);
  });
});

describe("resolveMapStack", () => {
  it("reverses the top→bottom list into bottom→top paint order", () => {
    // Listed blocks, soil, ndvi (top→bottom) → NDVI painted first, blocks last.
    const { overlays, blocksOrderIndex } = resolve(["blocks", "soil", "ndvi"]);
    expect(overlays).toEqual(["ndvi", "soil"]);
    expect(blocksOrderIndex).toBe(2); // blocks above both
  });

  it("moves the blocks layer through the stack as the list is reordered", () => {
    expect(resolve(["soil", "ndvi", "blocks"]).blocksOrderIndex).toBe(0); // bottom of the list = under everything
    expect(resolve(["soil", "blocks", "ndvi"]).blocksOrderIndex).toBe(1);
    expect(resolve(["blocks", "soil", "ndvi"]).blocksOrderIndex).toBe(2);
  });

  it("swapping two overlay layers swaps their paint order", () => {
    expect(resolve(["blocks", "soil", "ndvi"]).overlays).toEqual(["ndvi", "soil"]);
    expect(resolve(["blocks", "ndvi", "soil"]).overlays).toEqual(["soil", "ndvi"]);
  });

  it("a hidden layer contributes nothing and collapses the stack (no empty slot)", () => {
    const { overlays, blocksOrderIndex } = resolve(["blocks", "soil", "ndvi"], { soil: false });
    expect(overlays).toEqual(["ndvi"]);
    expect(blocksOrderIndex).toBe(1);
  });

  it("keeps blocksOrderIndex within the overlay array when everything above is hidden", () => {
    const { overlays, blocksOrderIndex } = resolve(["soil", "ndvi", "blocks"], { soil: false, ndvi: false });
    expect(overlays).toEqual([]);
    expect(blocksOrderIndex).toBe(0);
  });

  it("defaults blocks to the bottom when the stack has no blocks entry (other maps' behaviour)", () => {
    const { overlays, blocksOrderIndex } = resolve(["soil", "ndvi"]);
    expect(overlays).toEqual(["ndvi", "soil"]);
    expect(blocksOrderIndex).toBe(0);
  });
});
