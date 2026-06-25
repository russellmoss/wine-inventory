import { describe, it, expect } from "vitest";
import { assembleBlockStatuses, unknownInputNames } from "@/lib/assistant/report-merge";
import { EMPTY_BLOCK_STATUS, type BlockStatus } from "@/lib/fieldnotes/types";

const blocks = [
  { id: "b1", label: "Block 1" },
  { id: "b2", label: "Block 2" },
  { id: "b3", label: "Block 3" },
];

const base: Record<string, BlockStatus> = {
  b1: { ...EMPTY_BLOCK_STATUS, waterStress: "MILD" },
};

describe("assembleBlockStatuses", () => {
  it("guarantees coverage of every current block", () => {
    const out = assembleBlockStatuses(base, {}, blocks);
    expect(Object.keys(out).sort()).toEqual(["b1", "b2", "b3"]);
    expect(out.b1.waterStress).toBe("MILD"); // base preserved
    expect(out.b2).toEqual(EMPTY_BLOCK_STATUS); // seeded
  });

  it("overlays edits keyed by id", () => {
    const out = assembleBlockStatuses(base, { b1: { diseasePestSpotted: true } }, blocks);
    expect(out.b1.diseasePestSpotted).toBe(true);
    expect(out.b1.waterStress).toBe("MILD"); // merged, not replaced
  });

  it("overlays edits keyed by block label (case/space-insensitive)", () => {
    const out = assembleBlockStatuses(base, { "block 2": { weedPressure: "HIGH" } }, blocks);
    expect(out.b2.weedPressure).toBe("HIGH");
  });

  it("ignores edits for unknown blocks", () => {
    const out = assembleBlockStatuses(base, { "Block 9": { weedPressure: "HIGH" } }, blocks);
    expect(out.b3).toEqual(EMPTY_BLOCK_STATUS);
    expect(Object.keys(out).sort()).toEqual(["b1", "b2", "b3"]);
  });
});

describe("unknownInputNames", () => {
  const apps = (names: string[]) => names.map((name) => ({ name, scope: "WHOLE" as const, blockIds: [] }));

  it("returns names not already in the master list (normalized compare)", () => {
    expect(unknownInputNames(apps(["NEEM OIL", "SULFUR"]), ["NEEM-OIL"])).toEqual(["SULFUR"]);
  });

  it("dedupes and returns empty when all are known", () => {
    expect(unknownInputNames(apps(["Sulfur", "sulfur"]), ["SULFUR"])).toEqual([]);
  });
});
