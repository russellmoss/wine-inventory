import { describe, it, expect } from "vitest";
import {
  groupYieldsByVintage,
  variancePct,
  type HarvestRecordDTO,
  type BlockMeta,
} from "@/lib/harvest/aggregate";

const blocks: BlockMeta[] = [
  { id: "b1", label: "Block 1", varietyName: "Merlot" },
  { id: "b2", label: "Block 2", varietyName: "Merlot" },
  { id: "b3", label: "Block 3", varietyName: "Syrah" },
];

describe("variancePct", () => {
  it("computes percentage delta", () => {
    expect(variancePct(100, 120)).toBeCloseTo(20);
    expect(variancePct(100, 80)).toBeCloseTo(-20);
  });
  it("returns null when estimate is null or zero (no divide-by-zero)", () => {
    expect(variancePct(null, 120)).toBeNull();
    expect(variancePct(0, 120)).toBeNull();
  });
});

describe("groupYieldsByVintage", () => {
  const records: HarvestRecordDTO[] = [
    {
      blockId: "b1", // estimate + multiple picks
      vintageYear: 2025,
      yieldEstimateKg: 1000,
      picks: [
        { weightKg: 400, pickDate: "2025-09-01" },
        { weightKg: 700, pickDate: "2025-09-10" },
      ],
    },
    { blockId: "b2", vintageYear: 2025, yieldEstimateKg: 500, picks: [] }, // estimate-only
    {
      blockId: "b3", // picks-only (no estimate) -> variance N/A
      vintageYear: 2025,
      yieldEstimateKg: null,
      picks: [{ weightKg: 300, pickDate: "2025-09-05" }],
    },
    {
      blockId: "b1", // a second vintage
      vintageYear: 2024,
      yieldEstimateKg: 900,
      picks: [{ weightKg: 950, pickDate: "2024-09-02" }],
    },
  ];

  it("groups by vintage year, newest first", () => {
    const groups = groupYieldsByVintage(records, blocks);
    expect(groups.map((g) => g.vintageYear)).toEqual([2025, 2024]);
  });

  it("sums estimate and actual (sum of picks) per season", () => {
    const [y2025] = groupYieldsByVintage(records, blocks);
    expect(y2025.estimateKg).toBe(1500); // 1000 + 500 (b3 null contributes 0)
    expect(y2025.actualKg).toBe(1400); // 1100 + 0 + 300
    expect(y2025.variancePct).toBeCloseTo(((1400 - 1500) / 1500) * 100);
  });

  it("multiple picks accumulate into one block actual", () => {
    const [y2025] = groupYieldsByVintage(records, blocks);
    const b1 = y2025.blocks.find((b) => b.blockId === "b1")!;
    expect(b1.actualKg).toBe(1100);
    expect(b1.variancePct).toBeCloseTo(10); // (1100-1000)/1000
  });

  it("marks variance N/A for a picks-only block (null estimate)", () => {
    const [y2025] = groupYieldsByVintage(records, blocks);
    const b3 = y2025.blocks.find((b) => b.blockId === "b3")!;
    expect(b3.estimateKg).toBeNull();
    expect(b3.variancePct).toBeNull();
  });

  it("rolls up by variety", () => {
    const [y2025] = groupYieldsByVintage(records, blocks);
    const merlot = y2025.varieties.find((v) => v.varietyName === "Merlot")!;
    const syrah = y2025.varieties.find((v) => v.varietyName === "Syrah")!;
    expect(merlot.estimateKg).toBe(1500); // b1 + b2
    expect(merlot.actualKg).toBe(1100);
    expect(syrah.estimateKg).toBe(0);
    expect(syrah.actualKg).toBe(300);
    expect(syrah.variancePct).toBeNull(); // estimate 0 -> N/A
  });

  it("handles a block with neither estimate nor picks", () => {
    const groups = groupYieldsByVintage(
      [{ blockId: "b1", vintageYear: 2026, yieldEstimateKg: null, picks: [] }],
      blocks,
    );
    expect(groups[0].estimateKg).toBe(0);
    expect(groups[0].actualKg).toBe(0);
    expect(groups[0].variancePct).toBeNull();
  });

  it("falls back to the block id when metadata is missing", () => {
    const groups = groupYieldsByVintage(
      [{ blockId: "ghost", vintageYear: 2025, yieldEstimateKg: 10, picks: [] }],
      blocks,
    );
    expect(groups[0].blocks[0].label).toBe("ghost");
    expect(groups[0].blocks[0].varietyName).toBeNull();
  });
});
