import { describe, it, expect } from "vitest";
import {
  planTransfer,
  planRevert,
  type SourceComponent,
  type SnapshotLot,
  type DestComponent,
} from "@/lib/vessels/transfer-math";

const sum = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) * 100) / 100;

const merlot: SourceComponent = { id: "a", varietyId: "v1", vineyardId: "y1", vintage: 2025, volumeL: 225 };
const blend: SourceComponent[] = [
  { id: "a", varietyId: "v1", vineyardId: "y1", vintage: 2025, volumeL: 600 },
  { id: "b", varietyId: "v2", vineyardId: "y1", vintage: 2025, volumeL: 400 },
];

describe("planTransfer", () => {
  it("full transfer empties the source and moves everything", () => {
    const p = planTransfer([merlot], 225, 0);
    expect(p.deductions[0]).toEqual({ id: "a", deduct: 225, remaining: 0 });
    expect(sum(p.additions.map((x) => x.volumeL))).toBe(225);
    expect(p.addedL).toBe(225);
    expect(p.additions[0]).toMatchObject({ varietyId: "v1", vineyardId: "y1", vintage: 2025, volumeL: 225 });
  });

  it("partial transfer splits across components, sums exactly", () => {
    const p = planTransfer(blend, 500, 0);
    expect(sum(p.deductions.map((d) => d.deduct))).toBe(500);
    expect(sum(p.additions.map((a) => a.volumeL))).toBe(500);
    // proportional: 600/1000 * 500 = 300, 400/1000 * 500 = 200
    expect(p.deductions.find((d) => d.id === "a")!.deduct).toBe(300);
    expect(p.deductions.find((d) => d.id === "b")!.deduct).toBe(200);
  });

  it("loss reduces additions but not deductions", () => {
    const p = planTransfer([merlot], 225, 5);
    expect(sum(p.deductions.map((d) => d.deduct))).toBe(225); // removed from source
    expect(sum(p.additions.map((a) => a.volumeL))).toBe(220); // into destination
    expect(p.addedL).toBe(220);
  });

  it("loss spreads proportionally across a blend", () => {
    const p = planTransfer(blend, 1000, 10); // full rack, 10 L lost
    expect(sum(p.deductions.map((d) => d.deduct))).toBe(1000);
    expect(sum(p.additions.map((a) => a.volumeL))).toBe(990);
  });

  it("rejects over-draw", () => {
    expect(() => planTransfer([merlot], 300, 0)).toThrow();
  });

  it("rejects non-positive draw and bad loss", () => {
    expect(() => planTransfer([merlot], 0, 0)).toThrow();
    expect(() => planTransfer([merlot], 100, -1)).toThrow();
    expect(() => planTransfer([merlot], 100, 150)).toThrow();
  });

  it("drops fully-lost components from additions", () => {
    const p = planTransfer([merlot], 225, 225); // everything lost
    expect(p.additions).toEqual([]);
    expect(p.addedL).toBe(0);
  });
});

describe("planRevert", () => {
  const lot: SnapshotLot = { varietyId: "v1", vineyardId: "y1", vintage: 2025, volumeL: 225 };

  it("clean revert: dest holds exactly the lot, moves it all back", () => {
    const dest: DestComponent[] = [{ id: "d1", varietyId: "v1", vineyardId: "y1", vintage: 2025, volumeL: 225 }];
    const p = planRevert([lot], dest);
    expect(p.ok).toBe(true);
    expect(p.totalL).toBe(225);
    expect(p.deductions).toEqual([{ id: "d1", deduct: 225, remaining: 0 }]);
    expect(p.additions).toEqual([{ varietyId: "v1", vineyardId: "y1", vintage: 2025, volumeL: 225 }]);
  });

  it("blended dest: only the recorded lot moves, extra wine untouched", () => {
    const dest: DestComponent[] = [
      { id: "d1", varietyId: "v1", vineyardId: "y1", vintage: 2025, volumeL: 300 }, // had 75 L of its own + 225 racked in
      { id: "d2", varietyId: "v2", vineyardId: "y1", vintage: 2025, volumeL: 100 },
    ];
    const p = planRevert([lot], dest);
    expect(p.ok).toBe(true);
    expect(p.deductions).toEqual([{ id: "d1", deduct: 225, remaining: 75 }]);
    expect(p.additions).toHaveLength(1);
  });

  it("shortfall: dest no longer holds enough -> ok:false with the missing lot", () => {
    const dest: DestComponent[] = [{ id: "d1", varietyId: "v1", vineyardId: "y1", vintage: 2025, volumeL: 100 }];
    const p = planRevert([lot], dest);
    expect(p.ok).toBe(false);
    expect(p.shortfalls).toEqual([{ varietyId: "v1", vineyardId: "y1", vintage: 2025, need: 225, have: 100 }]);
  });

  it("missing lot entirely -> shortfall have:0", () => {
    const p = planRevert([lot], []);
    expect(p.ok).toBe(false);
    expect(p.shortfalls[0].have).toBe(0);
  });

  it("multi-lot revert sums and moves each back", () => {
    const lots: SnapshotLot[] = [
      { varietyId: "v1", vineyardId: "y1", vintage: 2025, volumeL: 300 },
      { varietyId: "v2", vineyardId: "y1", vintage: 2025, volumeL: 200 },
    ];
    const dest: DestComponent[] = [
      { id: "d1", varietyId: "v1", vineyardId: "y1", vintage: 2025, volumeL: 300 },
      { id: "d2", varietyId: "v2", vineyardId: "y1", vintage: 2025, volumeL: 200 },
    ];
    const p = planRevert(lots, dest);
    expect(p.ok).toBe(true);
    expect(p.totalL).toBe(500);
    expect(p.deductions).toHaveLength(2);
  });
});
