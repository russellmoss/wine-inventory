import { describe, it, expect } from "vitest";
import {
  buildAncestry,
  buildDescendants,
  composeRollup,
  hasLineage,
  type LineageEdge,
  type LotMeta,
} from "@/lib/lot/lineage";

// A 60/30/10 blend: CHILD ← A (Cab, Estate, 2022), B (Merlot, Estate, 2022), C (Syrah, North, 2023).
const edges: LineageEdge[] = [
  { parentLotId: "A", childLotId: "CHILD", fraction: 0.6, kind: "BLEND" },
  { parentLotId: "B", childLotId: "CHILD", fraction: 0.3, kind: "BLEND" },
  { parentLotId: "C", childLotId: "CHILD", fraction: 0.1, kind: "BLEND" },
];
const meta = new Map<string, LotMeta>([
  ["CHILD", { id: "CHILD", code: "2022-BL-EST", vintageYear: 2022, varietyName: null, vineyardName: null }],
  ["A", { id: "A", code: "2022-EST-CAB", vintageYear: 2022, varietyName: "Cabernet", vineyardName: "Estate" }],
  ["B", { id: "B", code: "2022-EST-MER", vintageYear: 2022, varietyName: "Merlot", vineyardName: "Estate" }],
  ["C", { id: "C", code: "2023-NTH-SYR", vintageYear: 2023, varietyName: "Syrah", vineyardName: "North" }],
]);

describe("buildAncestry / buildDescendants", () => {
  it("resolves all immediate parents of a multi-parent blend", () => {
    const parents = buildAncestry("CHILD", edges, meta);
    expect(parents.map((p) => p.id).sort()).toEqual(["A", "B", "C"]);
    expect(parents.find((p) => p.id === "A")?.fraction).toBe(0.6);
  });

  it("resolves all children of a split (one parent → many children)", () => {
    const split: LineageEdge[] = [
      { parentLotId: "P", childLotId: "X", fraction: 0.5, kind: "BLEND" },
      { parentLotId: "P", childLotId: "Y", fraction: 0.5, kind: "BLEND" },
    ];
    const kids = buildDescendants("P", split, meta);
    expect(kids.map((k) => k.id).sort()).toEqual(["X", "Y"]);
  });

  it("terminates on a cycle and respects the depth bound", () => {
    const cyclic: LineageEdge[] = [
      { parentLotId: "A", childLotId: "B", fraction: 1, kind: "BLEND" },
      { parentLotId: "B", childLotId: "A", fraction: 1, kind: "BLEND" }, // cycle
    ];
    expect(() => buildAncestry("A", cyclic, meta)).not.toThrow();
    const deep = buildAncestry("A", cyclic, meta, 3);
    // depth-bounded — a finite tree, never infinite recursion
    expect(deep.length).toBeGreaterThan(0);
  });

  it("hasLineage is false for a plain lot with no edges (UI omits the section)", () => {
    expect(hasLineage("LONE", edges)).toBe(false);
    expect(hasLineage("CHILD", edges)).toBe(true);
  });
});

describe("composeRollup", () => {
  it("weights a 60/30/10 blend to the right variety / vineyard / vintage %", () => {
    const r = composeRollup("CHILD", edges, meta);
    expect(r.complete).toBe(true);
    // variety: Cab 60, Merlot 30, Syrah 10
    expect(r.byVariety).toEqual([
      { key: "Cabernet", label: "Cabernet", pct: 60 },
      { key: "Merlot", label: "Merlot", pct: 30 },
      { key: "Syrah", label: "Syrah", pct: 10 },
    ]);
    // vineyard: Estate 90 (A+B), North 10
    expect(r.byVineyard).toEqual([
      { key: "Estate", label: "Estate", pct: 90 },
      { key: "North", label: "North", pct: 10 },
    ]);
    // vintage: 2022 90, 2023 10
    expect(r.byVintage).toEqual([
      { key: "2022", label: "2022", pct: 90 },
      { key: "2023", label: "2023", pct: 10 },
    ]);
  });

  it("recurses through a blend-of-blends, multiplying fractions", () => {
    // GRAND ← CHILD (0.5) + D (0.5); CHILD ← A(0.6)/B(0.3)/C(0.1)
    const deepEdges: LineageEdge[] = [
      ...edges,
      { parentLotId: "CHILD", childLotId: "GRAND", fraction: 0.5, kind: "BLEND" },
      { parentLotId: "D", childLotId: "GRAND", fraction: 0.5, kind: "BLEND" },
    ];
    const deepMeta = new Map(meta);
    deepMeta.set("GRAND", { id: "GRAND", code: "NV-BL-GR", vintageYear: null, varietyName: null, vineyardName: null });
    deepMeta.set("D", { id: "D", code: "2021-NTH-CAB", vintageYear: 2021, varietyName: "Cabernet", vineyardName: "North" });
    const r = composeRollup("GRAND", deepEdges, deepMeta);
    // Cabernet = A(0.6*0.5=0.30) + D(0.5) = 0.80 → 80%
    const cab = r.byVariety.find((s) => s.key === "Cabernet");
    expect(cab?.pct).toBeCloseTo(80, 1);
  });

  it("flags incomplete provenance when fractions don't sum to 1", () => {
    const partial: LineageEdge[] = [{ parentLotId: "A", childLotId: "CHILD", fraction: 0.6, kind: "BLEND" }];
    const r = composeRollup("CHILD", partial, meta);
    expect(r.complete).toBe(false);
  });
});
