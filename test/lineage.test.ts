import { describe, it, expect } from "vitest";
import {
  buildAncestry,
  buildDescendants,
  composeRollup,
  composeLeaves,
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

// ─────────── composeLeaves — the JOINT attribution (plan 088, Unit 5) ───────────
// composeRollup returns per-dimension MARGINALS (byVariety / byVineyard / byVintage), and
// marginals cannot reconstruct the joint (variety, vineyard, vintage) tuple that
// vessel_component is keyed on. The ledger's composition fold needs the leaves themselves.
describe("composeLeaves", () => {
  const w = (r: { leaves: { lotId: string; weight: number }[] }, lotId: string) =>
    Math.round((r.leaves.filter((l) => l.lotId === lotId).reduce((a, l) => a + l.weight, 0)) * 1e6) / 1e6;

  it("a lot with no lineage is its own single leaf at full weight", () => {
    const r = composeLeaves("A", []);
    expect(r.leaves).toEqual([{ lotId: "A", weight: 1 }]);
    expect(r.complete).toBe(true);
  });

  it("attributes a one-level blend to its parents by fraction", () => {
    const r = composeLeaves("CHILD", edges);
    expect(w(r, "A")).toBe(0.6);
    expect(w(r, "B")).toBe(0.3);
    expect(w(r, "C")).toBe(0.1);
    expect(r.complete).toBe(true);
  });

  it("multiplies fractions down a 3-deep chain", () => {
    // GRAND ← 0.5 CHILD (itself 0.6 A / 0.4 B), 0.5 D
    const deep: LineageEdge[] = [
      { parentLotId: "A", childLotId: "CHILD", fraction: 0.6, kind: "BLEND" },
      { parentLotId: "B", childLotId: "CHILD", fraction: 0.4, kind: "BLEND" },
      { parentLotId: "CHILD", childLotId: "GRAND", fraction: 0.5, kind: "BLEND" },
      { parentLotId: "D", childLotId: "GRAND", fraction: 0.5, kind: "BLEND" },
    ];
    const r = composeLeaves("GRAND", deep);
    expect(w(r, "A")).toBe(0.3); // 0.5 * 0.6
    expect(w(r, "B")).toBe(0.2); // 0.5 * 0.4
    expect(w(r, "D")).toBe(0.5);
    expect(r.complete).toBe(true);
  });

  it("weights always sum to 1 so a fold never invents or loses volume", () => {
    for (const root of ["CHILD", "A"]) {
      const total = composeLeaves(root, edges).leaves.reduce((a, l) => a + l.weight, 0);
      expect(total).toBeCloseTo(1, 9);
    }
  });

  it("attributes an uncovered remainder to the node itself and flags it incomplete", () => {
    const partial: LineageEdge[] = [{ parentLotId: "A", childLotId: "CHILD", fraction: 0.7, kind: "BLEND" }];
    const r = composeLeaves("CHILD", partial);
    expect(w(r, "A")).toBe(0.7);
    expect(w(r, "CHILD")).toBeCloseTo(0.3, 9); // the unknown 30% stays on the child, not dropped
    expect(r.complete).toBe(false);
    expect(r.leaves.reduce((a, l) => a + l.weight, 0)).toBeCloseTo(1, 9);
  });

  it("splits evenly when fractions are missing entirely", () => {
    const noFractions: LineageEdge[] = [
      { parentLotId: "A", childLotId: "CHILD", fraction: null, kind: "BLEND" },
      { parentLotId: "B", childLotId: "CHILD", fraction: null, kind: "BLEND" },
    ];
    const r = composeLeaves("CHILD", noFractions);
    expect(w(r, "A")).toBe(0.5);
    expect(w(r, "B")).toBe(0.5);
  });

  it("survives a cycle instead of blowing the stack", () => {
    const cyclic: LineageEdge[] = [
      { parentLotId: "A", childLotId: "B", fraction: 1, kind: "BLEND" },
      { parentLotId: "B", childLotId: "A", fraction: 1, kind: "BLEND" },
    ];
    const r = composeLeaves("A", cyclic);
    expect(r.leaves.reduce((a, l) => a + l.weight, 0)).toBeCloseTo(1, 9);
  });

  it("agrees with composeRollup — same walk, marginals vs joint", () => {
    const leaves = composeLeaves("CHILD", edges);
    const rollup = composeRollup("CHILD", edges, meta);
    const cab = rollup.byVariety.find((s) => s.key === "Cabernet");
    expect(cab?.pct).toBe(60);
    expect(w(leaves, "A")).toBe(0.6);
    expect(rollup.complete).toBe(leaves.complete);
  });
});
