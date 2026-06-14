import { describe, it, expect } from "vitest";
import { classifyBlend } from "@/lib/bulk/blend";

const c = (varietyId: string, varietyName: string, volumeL: number) => ({ varietyId, varietyName, volumeL });

describe("classifyBlend", () => {
  it("single variety is unblended", () => {
    const r = classifyBlend([c("merlot", "Merlot", 1000)]);
    expect(r.isBlend).toBe(false);
    expect(r.totalL).toBe(1000);
    expect(r.varieties[0]).toMatchObject({ varietyName: "Merlot", volumeL: 1000, pct: 100 });
  });

  it("same variety across two vineyards is still unblended (100% Merlot)", () => {
    const r = classifyBlend([c("merlot", "Merlot", 500), c("merlot", "Merlot", 500)]);
    expect(r.isBlend).toBe(false);
    expect(r.varieties).toHaveLength(1);
    expect(r.varieties[0].volumeL).toBe(1000);
  });

  it("two varieties is a blend with correct ratios", () => {
    const r = classifyBlend([c("merlot", "Merlot", 800), c("syrah", "Syrah", 200)]);
    expect(r.isBlend).toBe(true);
    expect(r.varieties.map((v) => [v.varietyName, v.pct])).toEqual([
      ["Merlot", 80],
      ["Syrah", 20],
    ]);
  });

  it("empty vessel", () => {
    const r = classifyBlend([]);
    expect(r).toMatchObject({ totalL: 0, isBlend: false });
    expect(r.varieties).toHaveLength(0);
  });

  it("sorts varieties by volume desc", () => {
    const r = classifyBlend([c("a", "A", 100), c("b", "B", 300), c("cc", "C", 200)]);
    expect(r.varieties.map((v) => v.varietyName)).toEqual(["B", "C", "A"]);
  });
});
