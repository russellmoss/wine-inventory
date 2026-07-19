import { describe, it, expect } from "vitest";
import type { Prisma } from "@prisma/client";
import { weightedAvgReceiptCost, recordFinishedGoodReceiptCore } from "@/lib/inventory/fg-cost-core";
import { runAsTenant } from "@/lib/tenant/context";

// Plan 080 U7 (council C4) — the purchased-cost layer for finished goods.
//
// The decision under test: valuation is a WEIGHTED AVERAGE over append-only receipts, not a mutable
// `unitCogs` column on the SKU (a second source of truth with no history) and not last-cost (whipsaws
// COGS). And the boundary: this layer never touches internally-bottled specific-lot COGS (COST-3).

const ACTOR = { actorUserId: "u1", actorEmail: "fg@demo.test", tenantId: "org_demo_winery" };
const inTenant = <T>(fn: () => Promise<T>) => runAsTenant("org_demo_winery", fn);

function makeTx(opts: { locationActive?: boolean; currency?: string } = {}) {
  const calls = { created: [] as Record<string, unknown>[], audits: [] as Record<string, unknown>[] };
  let seq = 0;
  const tx = {
    appSettings: { findFirst: async () => ({ currency: opts.currency ?? "USD" }) },
    location: { findUnique: async () => ({ id: "loc1", isActive: opts.locationActive ?? true }) },
    finishedGoodReceipt: {
      create: async (args: { data: Record<string, unknown> }) => {
        const id = `fgr_${++seq}`;
        calls.created.push({ id, ...args.data });
        return { id };
      },
    },
    auditLog: { create: async (args: { data: Record<string, unknown> }) => { calls.audits.push(args.data); return {}; } },
  } as unknown as Prisma.TransactionClient;
  return { tx, calls };
}

describe("weightedAvgReceiptCost — the valuation rule", () => {
  it("weights by quantity, not by receipt count (the whole point vs last-cost)", () => {
    // 100 units @ $2 then 10 units @ $12: last-cost would say $12, a naive mean $7. Correct WA is $2.909…
    const wa = weightedAvgReceiptCost([
      { qty: 100, unitCostBase: 2 },
      { qty: 10, unitCostBase: 12 },
    ]);
    expect(wa).toBeCloseTo((100 * 2 + 10 * 12) / 110, 8);
    expect(wa).not.toBe(12); // not last-cost
    expect(wa).not.toBe(7); // not an unweighted mean
  });

  it("is order-independent (append-only receipts can arrive in any order)", () => {
    const a = weightedAvgReceiptCost([{ qty: 3, unitCostBase: 5 }, { qty: 7, unitCostBase: 1 }]);
    const b = weightedAvgReceiptCost([{ qty: 7, unitCostBase: 1 }, { qty: 3, unitCostBase: 5 }]);
    expect(a).toBe(b);
  });

  it("returns null for NO receipts — unknown, never a fabricated $0 (COST-2)", () => {
    expect(weightedAvgReceiptCost([])).toBeNull();
  });

  it("counts a genuine $0 receipt (a freebie honestly drags the average down)", () => {
    expect(weightedAvgReceiptCost([{ qty: 1, unitCostBase: 0 }, { qty: 1, unitCostBase: 10 }])).toBe(5);
    // ...but a zero-cost receipt ALONE values at 0, which is a real answer, not "unknown"
    expect(weightedAvgReceiptCost([{ qty: 4, unitCostBase: 0 }])).toBe(0);
  });

  it("ignores malformed rows rather than poisoning the average", () => {
    const wa = weightedAvgReceiptCost([
      { qty: 10, unitCostBase: 5 },
      { qty: 0, unitCostBase: 999 },
      { qty: -5, unitCostBase: 999 },
      { qty: 10, unitCostBase: -1 },
      { qty: Number.NaN, unitCostBase: 3 },
    ]);
    expect(wa).toBe(5);
  });
});

describe("recordFinishedGoodReceiptCore", () => {
  it("stamps the receipt in the tenant BASE currency (COST-4)", async () => {
    const { tx, calls } = makeTx({ currency: "USD" });
    await inTenant(() => recordFinishedGoodReceiptCore(ACTOR, { wineSkuId: "sku1", qty: 12, unitCostBase: 8.25, locationId: "loc1" }, tx));
    expect(calls.created[0]).toMatchObject({ wineSkuId: "sku1", finishedGoodId: null, qty: 12, unitCostBase: 8.25, currency: "USD", locationId: "loc1" });
  });

  it("carries foreign provenance beside the base cost (audit only, never revalued)", async () => {
    const { tx, calls } = makeTx();
    const d = new Date(4_000);
    await inTenant(() =>
      recordFinishedGoodReceiptCore(
        ACTOR,
        { finishedGoodId: "g1", qty: 5, unitCostBase: 12, locationId: "loc1", foreignUnitCost: 10, foreignCurrency: "EUR", fxRate: 1.2, fxRateDate: d, fxRateSource: "ECB" },
        tx,
      ),
    );
    expect(calls.created[0]).toMatchObject({ finishedGoodId: "g1", wineSkuId: null, foreignUnitCost: 10, foreignCurrency: "EUR", fxRate: 1.2, fxRateSource: "ECB" });
  });

  it("requires EXACTLY ONE target — never both, never neither", async () => {
    const { tx } = makeTx();
    // @ts-expect-error deliberately violating the union to prove the runtime guard
    await expect(inTenant(() => recordFinishedGoodReceiptCore(ACTOR, { wineSkuId: "s", finishedGoodId: "g", qty: 1, unitCostBase: 1, locationId: "loc1" }, tx))).rejects.toThrow(/exactly one item/i);
    // @ts-expect-error neither target
    await expect(inTenant(() => recordFinishedGoodReceiptCore(ACTOR, { qty: 1, unitCostBase: 1, locationId: "loc1" }, tx))).rejects.toThrow(/exactly one item/i);
  });

  it("refuses a non-positive quantity, a negative cost, and an inactive location", async () => {
    const ok = makeTx();
    await expect(inTenant(() => recordFinishedGoodReceiptCore(ACTOR, { wineSkuId: "s", qty: 0, unitCostBase: 1, locationId: "loc1" }, ok.tx))).rejects.toThrow(/greater than zero/);
    await expect(inTenant(() => recordFinishedGoodReceiptCore(ACTOR, { wineSkuId: "s", qty: 1, unitCostBase: -1, locationId: "loc1" }, ok.tx))).rejects.toThrow(/can't be negative/);
    const closed = makeTx({ locationActive: false });
    await expect(inTenant(() => recordFinishedGoodReceiptCore(ACTOR, { wineSkuId: "s", qty: 1, unitCostBase: 1, locationId: "loc1" }, closed.tx))).rejects.toThrow(/not available/);
  });

  it("allows a $0 receipt (a real freebie is not the same as an error)", async () => {
    const { tx, calls } = makeTx();
    await inTenant(() => recordFinishedGoodReceiptCore(ACTOR, { wineSkuId: "s", qty: 2, unitCostBase: 0, locationId: "loc1" }, tx));
    expect(calls.created[0]).toMatchObject({ unitCostBase: 0 });
  });

  it("writes COST only — it never moves stock (the caller pairs it with receiveStock)", async () => {
    const { tx, calls } = makeTx();
    await inTenant(() => recordFinishedGoodReceiptCore(ACTOR, { wineSkuId: "s", qty: 3, unitCostBase: 4, locationId: "loc1" }, tx));
    // the stub exposes no inventory/movement models; touching one would throw. One receipt, one audit row.
    expect(calls.created).toHaveLength(1);
    expect(calls.audits).toHaveLength(1);
  });
});
