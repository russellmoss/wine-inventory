import { describe, it, expect } from "vitest";
import type { Prisma } from "@prisma/client";
import { consumePackagingTx } from "@/lib/cost/consume-packaging";

// Plan 056 Unit 1 — the PACKAGING consumer. Same in-memory Prisma.TransactionClient stub discipline as
// the addition characterization test: we drive consumePackagingTx and assert the exact stock draw-down,
// SupplyConsumption rows, and PACKAGING CostLines (lotId null) it writes on the bottle op.

type LotRow = { id: string; qtyRemaining: number; unitCost: number | null; receivedAt: Date };

function makeTx(opts: {
  settings: { costingMethod: string; costingPolicyVersion: number; currency: string } | null;
  lotsByMaterial: Record<string, LotRow[]>;
}) {
  const calls = {
    updates: [] as { id: string; decrement: number }[],
    consumptions: [] as Record<string, unknown>[],
    costLines: [] as Record<string, unknown>[],
  };
  const tx = {
    appSettings: { findFirst: async () => opts.settings },
    supplyLot: {
      findMany: async (args: { where: { materialId: string } }) =>
        (opts.lotsByMaterial[args.where.materialId] ?? []).filter((l) => l.qtyRemaining > 0),
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
      aggregate: async () => {
        const sum = calls.costLines
          .filter((c) => c.component === "PACKAGING" && c.reversalOfCostLineId == null)
          .reduce((a, c) => a + Number(c.amount), 0);
        return { _sum: { amount: sum } };
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

const WA = { costingMethod: "WEIGHTED_AVG", costingPolicyVersion: 2, currency: "USD" };
const FIFO = { costingMethod: "FIFO", costingPolicyVersion: 2, currency: "USD" };

describe("consumePackagingTx", () => {
  it("FIFO: draws by count across two lots, one PACKAGING CostLine (lotId null) on the bottle op", async () => {
    const { tx, calls } = makeTx({
      settings: FIFO,
      // 100 bottles @ $0.80 + 300 @ $0.90; consume 250 → 100×0.80 + 150×0.90 = 80 + 135 = $215.
      lotsByMaterial: { glass: [lot("g1", 100, 0.8, 1), lot("g2", 300, 0.9, 2)] },
    });
    const res = await consumePackagingTx(tx, { packaging: [{ materialId: "glass", qty: 250 }], bottleOpId: 500, capitalize: true });

    expect(res).toEqual({ packagingCost: 215, completeness: "KNOWN", lineCount: 1, shortfall: 0 });
    expect(calls.updates).toEqual([
      { id: "g1", decrement: 100 },
      { id: "g2", decrement: 150 },
    ]);
    expect(calls.consumptions).toHaveLength(2);
    expect(calls.consumptions[0]).toMatchObject({ operationId: 500, supplyLotId: "g1", qty: 100, methodUsed: "FIFO" });
    expect(calls.costLines).toHaveLength(1);
    expect(calls.costLines[0]).toMatchObject({ operationId: 500, lotId: null, component: "PACKAGING", amount: 215, currency: "USD", basisCompleteness: "KNOWN" });
  });

  it("WEIGHTED_AVG: prices at the on-hand WA rate", async () => {
    const { tx, calls } = makeTx({
      settings: WA,
      // 100 @ $0.80 + 300 @ $0.90 → WA $0.875; consume 200 → $175.
      lotsByMaterial: { glass: [lot("g1", 100, 0.8, 1), lot("g2", 300, 0.9, 2)] },
    });
    const res = await consumePackagingTx(tx, { packaging: [{ materialId: "glass", qty: 200 }], bottleOpId: 501, capitalize: true });
    expect(res.packagingCost).toBe(175);
    expect(calls.costLines[0]).toMatchObject({ amount: 175 });
  });

  it("multiple BoM lines: one CostLine each, cost + completeness aggregate", async () => {
    const { tx, calls } = makeTx({
      settings: FIFO,
      lotsByMaterial: {
        glass: [lot("g1", 1000, 0.8, 1)],
        cork: [lot("c1", 1000, 0.1, 1)],
      },
    });
    const res = await consumePackagingTx(tx, {
      packaging: [{ materialId: "glass", qty: 100 }, { materialId: "cork", qty: 100 }],
      bottleOpId: 502,
      capitalize: true,
    });
    expect(res.lineCount).toBe(2);
    expect(res.packagingCost).toBe(90); // 100×0.80 + 100×0.10
    expect(res.completeness).toBe("KNOWN");
    expect(calls.costLines).toHaveLength(2);
  });

  it("below-stock: draws to zero, reports shortfall, taints completeness (never blocks)", async () => {
    const { tx } = makeTx({ settings: FIFO, lotsByMaterial: { glass: [lot("g1", 100, 0.8, 1)] } });
    const res = await consumePackagingTx(tx, { packaging: [{ materialId: "glass", qty: 250 }], bottleOpId: 503, capitalize: true });
    expect(res.shortfall).toBe(150);
    expect(res.completeness).not.toBe("KNOWN");
  });

  it("zero/unknown-cost lot → UNKNOWN completeness (never a phantom $0)", async () => {
    const { tx } = makeTx({ settings: FIFO, lotsByMaterial: { glass: [lot("g1", 1000, null, 1)] } });
    const res = await consumePackagingTx(tx, { packaging: [{ materialId: "glass", qty: 100 }], bottleOpId: 504, capitalize: true });
    expect(res.completeness).not.toBe("KNOWN");
  });

  it("empty BoM is a no-op (cost 0, KNOWN, nothing written)", async () => {
    const { tx, calls } = makeTx({ settings: FIFO, lotsByMaterial: {} });
    const res = await consumePackagingTx(tx, { packaging: [], bottleOpId: 505, capitalize: true });
    expect(res).toEqual({ packagingCost: 0, completeness: "KNOWN", lineCount: 0, shortfall: 0 });
    expect(calls.consumptions).toHaveLength(0);
    expect(calls.costLines).toHaveLength(0);
  });

  it("capitalize=false: stock still depletes but NO CostLine, packagingCost 0", async () => {
    const { tx, calls } = makeTx({ settings: FIFO, lotsByMaterial: { glass: [lot("g1", 1000, 0.8, 1)] } });
    const res = await consumePackagingTx(tx, { packaging: [{ materialId: "glass", qty: 100 }], bottleOpId: 506, capitalize: false });
    expect(res.packagingCost).toBe(0);
    expect(calls.consumptions).toHaveLength(1); // stock still drawn
    expect(calls.costLines).toHaveLength(0); // but nothing capitalized
  });

  it("rejects a duplicate material in the BoM (double-deplete guard)", async () => {
    const { tx } = makeTx({ settings: FIFO, lotsByMaterial: { glass: [lot("g1", 1000, 0.8, 1)] } });
    await expect(
      consumePackagingTx(tx, { packaging: [{ materialId: "glass", qty: 10 }, { materialId: "glass", qty: 20 }], bottleOpId: 507, capitalize: true }),
    ).rejects.toThrow(/twice/i);
  });
});
