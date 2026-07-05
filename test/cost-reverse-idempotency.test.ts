import { describe, it, expect } from "vitest";
import type { Prisma } from "@prisma/client";
import { negateCostForReversedOp } from "@/lib/cost/reverse";

// Phase 8 (Unit 11, D3) — negateCostForReversedOp is documented as idempotent: a second call on the
// same reversed op must be a no-op, guarded by the `if (already) continue` checks (reverse.ts:26/52).
// This exercises that guard end-to-end against an in-memory tx double so a future regression that
// double-restores stock / double-negates cost on a retried reversal is caught.
//
// The fixture keeps every CostLine's `lotId` null, so `changedLotIds` stays empty and the
// variance-detection / export branch (which needs a real DB) is never entered — the test stays pure.

type Row = Record<string, unknown>;

let cuidSeq = 0;
const nextId = (prefix: string) => `${prefix}_${(cuidSeq++).toString(36)}`;

/** Minimal in-memory stand-in for the Prisma model delegates reverse.ts touches. */
function makeTable(seed: Row[]) {
  const rows: Row[] = seed.map((r) => ({ ...r }));
  const matches = (row: Row, where: Row) =>
    Object.entries(where).every(([k, v]) => row[k] === v);
  return {
    rows,
    async findMany({ where }: { where: Row }) {
      return rows.filter((r) => matches(r, where)).map((r) => ({ ...r }));
    },
    async findFirst({ where }: { where: Row }) {
      const hit = rows.find((r) => matches(r, where));
      return hit ? { ...hit } : null;
    },
    async create({ data }: { data: Row }) {
      const row: Row = { id: nextId("row"), ...data };
      rows.push(row);
      return { ...row };
    },
    async update({ where, data }: { where: Row; data: Row }) {
      const row = rows.find((r) => matches(r, where));
      if (!row) throw new Error("update: row not found");
      for (const [k, v] of Object.entries(data)) {
        if (v && typeof v === "object" && "increment" in (v as Row)) {
          row[k] = Number(row[k]) + Number((v as { increment: number }).increment);
        } else {
          row[k] = v;
        }
      }
      return { ...row };
    },
  };
}

function makeTx() {
  const lotId = nextId("lot");
  const consId = nextId("cons");
  const costId = nextId("cl");
  const supplyLot = makeTable([{ id: lotId, qtyRemaining: 100 }]);
  const supplyConsumption = makeTable([
    {
      id: consId,
      operationId: 1,
      supplyLotId: lotId,
      qty: 30,
      unitCost: 0.5,
      extendedCost: 15,
      methodUsed: "WEIGHTED_AVG",
      basisCompleteness: "KNOWN",
      policyVersion: 1,
      reversalOfConsumptionId: null,
    },
  ]);
  const costLine = makeTable([
    {
      id: costId,
      operationId: 1,
      lotId: null, // null → skips the DB-backed variance/export branch
      component: "SUPPLIES",
      amount: 15,
      currency: "USD",
      basisCompleteness: "KNOWN",
      policyVersion: 1,
      reversalOfCostLineId: null,
    },
  ]);
  return { lotId, supplyLot, supplyConsumption, costLine };
}

const sum = (rows: Row[], field: string) =>
  rows.reduce((acc, r) => acc + Number(r[field]), 0);

describe("negateCostForReversedOp — idempotency (double-negate is a no-op)", () => {
  it("first call restores stock + writes one reversal per row; second call changes nothing", async () => {
    const store = makeTx();
    const tx = {
      supplyConsumption: store.supplyConsumption,
      supplyLot: store.supplyLot,
      costLine: store.costLine,
    } as unknown as Prisma.TransactionClient;

    // First reversal (reversedOpId=1 → correctionOpId=2).
    const first = await negateCostForReversedOp(tx, 1, 2);
    expect(first.consumptions).toBe(1);
    expect(first.costLines).toBe(1);
    expect(first.variances).toBe(0);

    // Stock restored by the consumed qty (100 + 30), exactly one negating consumption + cost line.
    const lot = store.supplyLot.rows.find((r) => r.id === store.lotId)!;
    expect(Number(lot.qtyRemaining)).toBe(130);
    const reversalCons = store.supplyConsumption.rows.filter((r) => r.reversalOfConsumptionId != null);
    const reversalCost = store.costLine.rows.filter((r) => r.reversalOfCostLineId != null);
    expect(reversalCons).toHaveLength(1);
    expect(reversalCost).toHaveLength(1);
    // Net stays zero: original + negation.
    expect(sum(store.supplyConsumption.rows, "qty")).toBe(0);
    expect(sum(store.costLine.rows, "amount")).toBe(0);

    // Second reversal on the SAME reversed op — the `if (already) continue` guards must short-circuit.
    const second = await negateCostForReversedOp(tx, 1, 3);
    expect(second.consumptions).toBe(0);
    expect(second.costLines).toBe(0);
    expect(second.variances).toBe(0);

    // Nothing double-restored / double-negated: identical to after the first call.
    expect(Number(lot.qtyRemaining)).toBe(130);
    expect(store.supplyConsumption.rows.filter((r) => r.reversalOfConsumptionId != null)).toHaveLength(1);
    expect(store.costLine.rows.filter((r) => r.reversalOfCostLineId != null)).toHaveLength(1);
    expect(sum(store.supplyConsumption.rows, "qty")).toBe(0);
    expect(sum(store.costLine.rows, "amount")).toBe(0);
  });
});
