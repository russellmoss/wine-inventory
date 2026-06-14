import { describe, it, expect } from "vitest";
import {
  suggestBottles,
  consumedForBottles,
  casesAndLoose,
  computeProportionalDraw,
} from "@/lib/bottling/draw";

describe("bottle math", () => {
  it("suggests bottles by floor of liters/0.75", () => {
    expect(suggestBottles(750)).toBe(1000);
    expect(suggestBottles(751)).toBe(1001);
    expect(suggestBottles(0.74)).toBe(0);
  });

  it("consumed = bottles * 0.75", () => {
    expect(consumedForBottles(1000)).toBe(750);
    expect(consumedForBottles(1313)).toBe(984.75);
  });

  it("splits cases and loose (12/case)", () => {
    expect(casesAndLoose(1000)).toEqual({ cases: 83, loose: 4 });
    expect(casesAndLoose(24)).toEqual({ cases: 2, loose: 0 });
    expect(casesAndLoose(7)).toEqual({ cases: 0, loose: 7 });
  });
});

describe("computeProportionalDraw", () => {
  it("proportional split that sums exactly to consumed", () => {
    const r = computeProportionalDraw([{ id: "a", volumeL: 800 }, { id: "b", volumeL: 200 }], 100);
    const deducted = r.reduce((s, d) => s + d.deduct, 0);
    expect(Math.round(deducted * 100) / 100).toBe(100);
    expect(r.find((x) => x.id === "a")!.deduct).toBe(80);
    expect(r.find((x) => x.id === "b")!.deduct).toBe(20);
  });

  it("never leaves a negative remaining", () => {
    const r = computeProportionalDraw([{ id: "a", volumeL: 333.33 }, { id: "b", volumeL: 666.67 }], 500);
    for (const d of r) expect(d.remaining).toBeGreaterThanOrEqual(0);
    expect(Math.round(r.reduce((s, d) => s + d.deduct, 0) * 100) / 100).toBe(500);
  });

  it("full draw empties everything", () => {
    const r = computeProportionalDraw([{ id: "a", volumeL: 600 }, { id: "b", volumeL: 400 }], 1000);
    expect(r.every((d) => d.remaining === 0)).toBe(true);
  });

  it("rejects over-draw", () => {
    expect(() => computeProportionalDraw([{ id: "a", volumeL: 100 }], 200)).toThrow();
  });

  it("zero draw leaves volumes intact", () => {
    const r = computeProportionalDraw([{ id: "a", volumeL: 100 }], 0);
    expect(r[0]).toEqual({ id: "a", deduct: 0, remaining: 100 });
  });

  // Regression (codex review): many tiny components must still sum exactly.
  it("tiny components: 10 x 0.01 L, draw 0.04 sums exactly", () => {
    const comps = Array.from({ length: 10 }, (_, i) => ({ id: `c${i}`, volumeL: 0.01 }));
    const r = computeProportionalDraw(comps, 0.04);
    const drawn = Math.round(r.reduce((s, d) => s + d.deduct, 0) * 100) / 100;
    expect(drawn).toBe(0.04);
    expect(r.every((d) => d.remaining >= 0)).toBe(true);
  });

  it("tiny components: 10 x 0.01 L, draw 0.06 sums exactly (no overshoot)", () => {
    const comps = Array.from({ length: 10 }, (_, i) => ({ id: `c${i}`, volumeL: 0.01 }));
    const r = computeProportionalDraw(comps, 0.06);
    const drawn = Math.round(r.reduce((s, d) => s + d.deduct, 0) * 100) / 100;
    expect(drawn).toBe(0.06);
    expect(r.every((d) => d.deduct <= 0.01 + 1e-9)).toBe(true);
  });

  it("uneven thirds sum exactly to consumed", () => {
    const r = computeProportionalDraw(
      [{ id: "a", volumeL: 333.33 }, { id: "b", volumeL: 333.33 }, { id: "c", volumeL: 333.34 }],
      500,
    );
    const drawn = Math.round(r.reduce((s, d) => s + d.deduct, 0) * 100) / 100;
    expect(drawn).toBe(500);
  });
});
