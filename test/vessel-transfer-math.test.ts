import { describe, it, expect } from "vitest";
import { planTransfer, type SourceComponent } from "@/lib/vessels/transfer-math";

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
