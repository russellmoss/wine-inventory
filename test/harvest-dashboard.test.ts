import { describe, it, expect } from "vitest";
import { deriveBrixAtPick, groupSeriesByBlock } from "@/lib/harvest/dashboard";

describe("deriveBrixAtPick", () => {
  const series = [
    { recordedAt: "2026-09-10T12:00:00.000Z", brixValue: 18 },
    { recordedAt: "2026-09-20T12:00:00.000Z", brixValue: 22 },
    { recordedAt: "2026-09-30T12:00:00.000Z", brixValue: 25 },
  ];

  it("returns the explicit value when present, ignoring the series", () => {
    expect(deriveBrixAtPick({ pickDate: "2026-09-15", brixAtPick: 21.5 }, series)).toBe(21.5);
  });

  it("falls back to the nearest reading by date", () => {
    // 2026-09-21 is closest to the 09-20 reading
    expect(deriveBrixAtPick({ pickDate: "2026-09-21", brixAtPick: null }, series)).toBe(22);
    // 2026-09-29 is closest to the 09-30 reading
    expect(deriveBrixAtPick({ pickDate: "2026-09-29", brixAtPick: null }, series)).toBe(25);
  });

  it("on a tie picks the earliest reading (oldest-first input)", () => {
    // 2026-09-15 is exactly 5 days from both 09-10 (18) and 09-20 (22) → earliest wins
    expect(deriveBrixAtPick({ pickDate: "2026-09-15", brixAtPick: null }, series)).toBe(18);
  });

  it("returns null when there is no explicit value and no readings", () => {
    expect(deriveBrixAtPick({ pickDate: "2026-09-15", brixAtPick: null }, [])).toBeNull();
  });

  it("returns null for an unparseable pick date with no explicit value", () => {
    expect(deriveBrixAtPick({ pickDate: "not-a-date", brixAtPick: null }, series)).toBeNull();
  });

  it("explicit zero is a real value, not treated as missing", () => {
    expect(deriveBrixAtPick({ pickDate: "2026-09-21", brixAtPick: 0 }, series)).toBe(0);
  });
});

describe("groupSeriesByBlock", () => {
  it("splits readings per block, preserving order", () => {
    const rows = [
      { blockId: "a", recordedAt: "2026-09-10T00:00:00Z", brixValue: 18 },
      { blockId: "b", recordedAt: "2026-09-11T00:00:00Z", brixValue: 19 },
      { blockId: "a", recordedAt: "2026-09-20T00:00:00Z", brixValue: 22 },
    ];
    const out = groupSeriesByBlock(rows);
    expect(out.a.map((p) => p.brixValue)).toEqual([18, 22]);
    expect(out.b.map((p) => p.brixValue)).toEqual([19]);
  });

  it("returns an empty object for no rows", () => {
    expect(groupSeriesByBlock([])).toEqual({});
  });
});
