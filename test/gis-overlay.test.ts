import { describe, it, expect } from "vitest";
import { resolveLayerStack, polygonsToVectorOverlay, type LayerStack, type MapOverlay } from "../src/lib/gis/overlay";
import type { VineyardPolygon } from "../src/lib/gis/geometry";

const sq: VineyardPolygon = { type: "Polygon", coordinates: [[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]] };

function layer(id: string, zIndex: number, visible = true): LayerStack["layers"][number] {
  return { overlay: { kind: "vector", id, data: { type: "FeatureCollection", features: [] }, style: { color: "#000" } }, visible, zIndex };
}

describe("resolveLayerStack", () => {
  it("orders by ascending zIndex", () => {
    const stack: LayerStack = { layers: [layer("c", 3), layer("a", 1), layer("b", 2)] };
    expect(resolveLayerStack(stack).map((o) => o.id)).toEqual(["a", "b", "c"]);
  });

  it("drops hidden layers", () => {
    const stack: LayerStack = { layers: [layer("a", 1), layer("b", 2, false)] };
    expect(resolveLayerStack(stack).map((o) => o.id)).toEqual(["a"]);
  });

  it("keeps declaration order among equal zIndex (stable)", () => {
    const stack: LayerStack = { layers: [layer("x", 5), layer("y", 5)] };
    expect(resolveLayerStack(stack).map((o) => o.id)).toEqual(["x", "y"]);
  });

  it("narrows the discriminated union by kind", () => {
    const o: MapOverlay = polygonsToVectorOverlay("plantings", [{ geometry: sq, properties: { name: "North" } }], { color: "#0a0", fillOpacity: 0.2 });
    expect(o.kind).toBe("vector");
    if (o.kind === "vector") {
      expect(o.data.features.length).toBe(1);
      expect(o.data.features[0].properties?.name).toBe("North");
    }
  });
});
