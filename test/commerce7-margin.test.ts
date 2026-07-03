import { describe, it, expect } from "vitest";
import { aggregateMargin, GROSS_OF_FEES_CAVEAT, type MarginEvent } from "@/lib/commerce/margin";

// Phase 16 Unit 10b — the pure per-(WineSku, channel) margin aggregation (revenue deltas × Phase-8
// COGS). The DB-backed getDtcMargin join is rendered from seeded Demo Winery data in verify:commerce7.

const skuByRef = new Map([
  ["var_1", { skuId: "sku_a", label: "Pinot 2022" }],
  ["var_2", { skuId: "sku_b", label: "Chardonnay 2023" }],
]);
const cogs = new Map([
  ["sku_a", 8], // $8/bottle
  ["sku_b", 6],
]);

describe("aggregateMargin", () => {
  it("computes per-SKU × per-channel revenue, COGS, and margin", () => {
    const events: MarginEvent[] = [
      { channel: "DTC", discountDelta: 0, lines: [{ skuRef: "var_1", qtyDelta: 2, revenueDelta: 90 }] },
      { channel: "Club", discountDelta: 0, lines: [{ skuRef: "var_1", qtyDelta: 1, revenueDelta: 40 }] },
    ];
    const rows = aggregateMargin(events, skuByRef, cogs);
    const dtc = rows.find((r) => r.channel === "DTC")!;
    expect(dtc).toMatchObject({ skuLabel: "Pinot 2022", unitsSold: 2, netRevenue: 90, cogs: 16, margin: 74 });
    const club = rows.find((r) => r.channel === "Club")!;
    expect(club).toMatchObject({ unitsSold: 1, netRevenue: 40, cogs: 8, margin: 32 });
  });

  it("a refund/adjustment delta nets into the SKU's margin (signed deltas)", () => {
    const events: MarginEvent[] = [
      { channel: "DTC", discountDelta: 0, lines: [{ skuRef: "var_1", qtyDelta: 3, revenueDelta: 135 }] },
      { channel: "DTC", discountDelta: 0, lines: [{ skuRef: "var_1", qtyDelta: -1, revenueDelta: -45 }] }, // refund one
    ];
    const rows = aggregateMargin(events, skuByRef, cogs);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ unitsSold: 2, netRevenue: 90, cogs: 16, margin: 74 });
  });

  it("attributes order-level discount to lines by revenue share", () => {
    // $20 order discount split across two lines by their $ share (90/130 vs 40/130).
    const events: MarginEvent[] = [
      { channel: "DTC", discountDelta: 20, lines: [{ skuRef: "var_1", qtyDelta: 2, revenueDelta: 90 }, { skuRef: "var_2", qtyDelta: 1, revenueDelta: 40 }] },
    ];
    const rows = aggregateMargin(events, skuByRef, cogs);
    const a = rows.find((r) => r.skuId === "sku_a")!;
    const b = rows.find((r) => r.skuId === "sku_b")!;
    expect(a.netRevenue).toBeCloseTo(90 - 20 * (90 / 130), 2); // ≈ 76.15
    expect(b.netRevenue).toBeCloseTo(40 - 20 * (40 / 130), 2); // ≈ 33.85
  });

  it("marginPct is null when there is no revenue (avoid divide-by-zero)", () => {
    const events: MarginEvent[] = [{ channel: "DTC", discountDelta: 0, lines: [{ skuRef: "var_1", qtyDelta: 0, revenueDelta: 0 }] }];
    const rows = aggregateMargin(events, skuByRef, cogs);
    expect(rows[0].marginPct).toBeNull();
  });

  it("carries a persistent gross-of-fees caveat", () => {
    expect(GROSS_OF_FEES_CAVEAT).toMatch(/gross of/i);
  });
});
