import { describe, it, expect } from "vitest";
import type { Prisma } from "@prisma/client";
import { consumeMaterialCore } from "@/lib/cost/consume";

// Plan 056 Unit 1 — CHARACTERIZATION tests locking the ADDITION consumption path BEFORE extracting the
// shared `depleteSupplyLotsTx` helper (council fold: lock lot-pick order, WA/FIFO cost, insufficient
// rollback, unknown-cost taint, SupplyConsumption shape/count, CostLine totals). These must stay green
// unchanged after the extract — that IS the proof the refactor preserved the addition path's behavior
// (the live-Neon `verify:cost` is the second, end-to-end proof).
//
// consumeMaterialCore is DB-bound, so we drive it with an in-memory Prisma.TransactionClient stub that
// records every supplyLot.update / supplyConsumption.create / costLine.create — the exact write sequence
// is what we lock.

type LotRow = { id: string; qtyRemaining: number; unitCost: number | null; receivedAt: Date };

function makeTx(opts: {
  material: { isStockTracked: boolean; stockUnit: string | null } | null;
  settings: { costingMethod: string; costingPolicyVersion: number; currency: string } | null;
  lots: LotRow[];
}) {
  const calls = {
    updates: [] as { id: string; decrement: number }[],
    consumptions: [] as Record<string, unknown>[],
    costLines: [] as Record<string, unknown>[],
  };
  const tx = {
    cellarMaterial: { findUnique: async () => opts.material },
    appSettings: { findFirst: async () => opts.settings },
    supplyLot: {
      findMany: async () => opts.lots.filter((l) => l.qtyRemaining > 0),
      update: async (args: { where: { id: string }; data: { qtyRemaining: { decrement: number } } }) => {
        calls.updates.push({ id: args.where.id, decrement: args.data.qtyRemaining.decrement });
        return {};
      },
    },
    supplyConsumption: {
      create: async (args: { data: Record<string, unknown> }) => {
        calls.consumptions.push(args.data);
        return {};
      },
    },
    costLine: {
      create: async (args: { data: Record<string, unknown> }) => {
        calls.costLines.push(args.data);
        return {};
      },
    },
  } as unknown as Prisma.TransactionClient;
  return { tx, calls };
}

const lot = (id: string, qtyRemaining: number, unitCost: number | null, receivedAtMs: number): LotRow => ({
  id,
  qtyRemaining,
  unitCost,
  receivedAt: new Date(receivedAtMs),
});

const WA = { costingMethod: "WEIGHTED_AVG", costingPolicyVersion: 3, currency: "USD" };
const FIFO = { costingMethod: "FIFO", costingPolicyVersion: 3, currency: "USD" };
const GRAM = { isStockTracked: true, stockUnit: "g" };

describe("consumeMaterialCore (characterization — addition path)", () => {
  it("WEIGHTED_AVG: draws oldest-first physically, prices at WA, one CostLine per dosed lot", async () => {
    const { tx, calls } = makeTx({
      material: GRAM,
      settings: WA,
      // 100g @ $0.02 + 300g @ $0.06 → WA $0.05/g; dose 250g → 250 × 0.05 = $12.50
      lots: [lot("a", 100, 0.02, 1), lot("b", 300, 0.06, 2)],
    });
    const res = await consumeMaterialCore(tx, {
      operationId: 42,
      materialId: "m1",
      doseUnit: "g",
      perLot: [{ lotId: "L1", amount: 250 }],
    });

    expect(res).toEqual({ stockTracked: true, drawn: 250, shortfall: 0, totalCost: 12.5, completeness: "KNOWN" });
    // Physical draw is oldest-first: 100 from a, then 150 from b.
    expect(calls.updates).toEqual([
      { id: "a", decrement: 100 },
      { id: "b", decrement: 150 },
    ]);
    expect(calls.consumptions).toHaveLength(2);
    expect(calls.consumptions[0]).toMatchObject({ operationId: 42, supplyLotId: "a", qty: 100, unitCost: 0.05, extendedCost: 5, methodUsed: "WEIGHTED_AVG", basisCompleteness: "KNOWN", policyVersion: 3 });
    expect(calls.consumptions[1]).toMatchObject({ supplyLotId: "b", qty: 150, unitCost: 0.05, extendedCost: 7.5 });
    // One MATERIAL cost line for the single dosed lot, carrying the full depletion cost.
    expect(calls.costLines).toHaveLength(1);
    expect(calls.costLines[0]).toMatchObject({ operationId: 42, lotId: "L1", component: "MATERIAL", amount: 12.5, currency: "USD", basisCompleteness: "KNOWN", policyVersion: 3 });
  });

  it("FIFO: prices each slice at that lot's own cost", async () => {
    const { tx, calls } = makeTx({
      material: GRAM,
      settings: FIFO,
      lots: [lot("a", 100, 0.02, 1), lot("b", 300, 0.06, 2)],
    });
    const res = await consumeMaterialCore(tx, { operationId: 7, materialId: "m1", doseUnit: "g", perLot: [{ lotId: "L1", amount: 250 }] });
    expect(res.totalCost).toBe(11); // 100×0.02 + 150×0.06
    expect(res.completeness).toBe("KNOWN");
    expect(calls.consumptions[0]).toMatchObject({ qty: 100, unitCost: 0.02, extendedCost: 2 });
    expect(calls.consumptions[1]).toMatchObject({ qty: 150, unitCost: 0.06, extendedCost: 9 });
  });

  it("below-stock: draws to zero, reports shortfall, taints completeness (never blocks)", async () => {
    const { tx, calls } = makeTx({ material: GRAM, settings: FIFO, lots: [lot("a", 100, 0.02, 1)] });
    const res = await consumeMaterialCore(tx, { operationId: 9, materialId: "m1", doseUnit: "g", perLot: [{ lotId: "L1", amount: 250 }] });
    expect(res.drawn).toBe(100);
    expect(res.shortfall).toBe(150);
    expect(res.completeness).not.toBe("KNOWN");
    expect(calls.updates).toEqual([{ id: "a", decrement: 100 }]);
    expect(calls.consumptions).toHaveLength(1);
  });

  it("allocates cost across multiple dosed lots proportional to dose amount", async () => {
    const { tx, calls } = makeTx({ material: GRAM, settings: WA, lots: [lot("a", 400, 0.05, 1)] });
    // 300g total: L1 gets 100g (⅓), L2 gets 200g (⅔). WA $0.05/g → $15 total, split $5 / $10.
    await consumeMaterialCore(tx, {
      operationId: 11,
      materialId: "m1",
      doseUnit: "g",
      perLot: [{ lotId: "L1", amount: 100 }, { lotId: "L2", amount: 200 }],
    });
    expect(calls.costLines).toHaveLength(2);
    expect(calls.costLines[0]).toMatchObject({ lotId: "L1", amount: 5 });
    expect(calls.costLines[1]).toMatchObject({ lotId: "L2", amount: 10 });
  });

  it("untracked material: no depletion, an UNKNOWN-cost MATERIAL line (never phantom $0)", async () => {
    const { tx, calls } = makeTx({ material: { isStockTracked: false, stockUnit: null }, settings: WA, lots: [] });
    const res = await consumeMaterialCore(tx, { operationId: 5, materialId: "m1", doseUnit: "g", perLot: [{ lotId: "L1", amount: 50 }] });
    expect(res).toEqual({ stockTracked: false, drawn: 0, shortfall: 0, totalCost: 0, completeness: "UNKNOWN" });
    expect(calls.updates).toHaveLength(0);
    expect(calls.consumptions).toHaveLength(0);
    expect(calls.costLines).toHaveLength(1);
    expect(calls.costLines[0]).toMatchObject({ component: "MATERIAL", amount: 0, basisCompleteness: "UNKNOWN" });
  });

  it("unconvertible dose→stock unit (counted stock): UNKNOWN line, no depletion", async () => {
    // dose is g but the material is counted in 'unit' → no conversion → UNKNOWN, no draw.
    const { tx, calls } = makeTx({ material: { isStockTracked: true, stockUnit: "unit" }, settings: WA, lots: [lot("a", 100, 1, 1)] });
    const res = await consumeMaterialCore(tx, { operationId: 5, materialId: "m1", doseUnit: "g", perLot: [{ lotId: "L1", amount: 50 }] });
    expect(res.completeness).toBe("UNKNOWN");
    expect(calls.updates).toHaveLength(0);
    expect(calls.costLines[0]).toMatchObject({ amount: 0, basisCompleteness: "UNKNOWN" });
  });
});

describe("consumeMaterialCore — Plan 066: SO₂/KMBS active-fraction stock scaling", () => {
  it("scales the stock draw + cost up by 1/activeFraction (18 g SO₂ → 31.25 g KMBS)", async () => {
    // KMBS is 57.6% SO₂. An 18 g-SO₂ dose must draw 18/0.576 = 31.25 g of KMBS stock.
    const { tx, calls } = makeTx({ material: GRAM, settings: WA, lots: [lot("a", 1000, 0.05, 1)] });
    const res = await consumeMaterialCore(tx, {
      operationId: 66,
      materialId: "kmbs",
      doseUnit: "g",
      perLot: [{ lotId: "L1", amount: 18 }],
      activeFraction: 0.576,
    });
    expect(res.drawn).toBe(31.25);
    expect(calls.updates).toEqual([{ id: "a", decrement: 31.25 }]);
    expect(calls.consumptions[0]).toMatchObject({ supplyLotId: "a", qty: 31.25, unitCost: 0.05, extendedCost: 1.5625 });
    expect(calls.costLines[0]).toMatchObject({ lotId: "L1", component: "MATERIAL", amount: 1.5625 });
  });

  it("no activeFraction → unchanged (regression: draws the raw amount)", async () => {
    const { tx, calls } = makeTx({ material: GRAM, settings: WA, lots: [lot("a", 1000, 0.05, 1)] });
    const res = await consumeMaterialCore(tx, { operationId: 66, materialId: "m1", doseUnit: "g", perLot: [{ lotId: "L1", amount: 18 }] });
    expect(res.drawn).toBe(18);
    expect(calls.updates).toEqual([{ id: "a", decrement: 18 }]);
  });

  it("out-of-range activeFraction (0 or >1) is ignored → no scaling (safety)", async () => {
    for (const bad of [0, -0.5, 1.5, Number.NaN]) {
      const { tx } = makeTx({ material: GRAM, settings: WA, lots: [lot("a", 1000, 0.05, 1)] });
      const res = await consumeMaterialCore(tx, { operationId: 66, materialId: "m1", doseUnit: "g", perLot: [{ lotId: "L1", amount: 18 }], activeFraction: bad });
      expect(res.drawn).toBe(18);
    }
  });
});
