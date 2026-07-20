import { describe, it, expect } from "vitest";
import type { Prisma } from "@prisma/client";
import { adjustConsumableCore, transferConsumableCore, receiveConsumableCore } from "@/lib/cellar/material-stock-core";
import { runWithTenantContext } from "@/lib/tenant/context";
import { ActionError } from "@/lib/action-error";

// Plan 080 U2b — the location-aware consumables stock engine. These lock the MONEY-critical properties of
// the lot-split transfer (COST-1 conservation: Σqty and Σvalue are preserved across a split, and each
// destination lot inherits its source's cost/age/expiry/provenance) plus the adjust semantics and the
// specific shortfall messages the UI relies on.
//
// The cores are DB-bound, so — exactly as test/cost-consume.test.ts does for the dose path — we drive them
// through their `injectedTx` seam with an in-memory Prisma.TransactionClient stub that records every write.
// That makes the FIFO/split arithmetic provable without a database (the live-Neon verify:cost is the
// second, end-to-end proof).

type LotRow = {
  id: string;
  qtyRemaining: number;
  unitCost: number | null;
  receivedAt: Date;
  locationId: string;
  currency?: string;
  expiresAt?: Date | null;
  lotCode?: string | null;
  vendorId?: string | null;
  policyVersion?: number;
  stockUnit?: string;
  foreignUnitCost?: number | null;
  foreignCurrency?: string | null;
  fxRate?: number | null;
  fxRateDate?: Date | null;
  fxRateSource?: string | null;
};

// The actor carries tenantId so writeAudit doesn't reach for the (absent) ALS tenant context.
const ACTOR = { actorUserId: "u1", actorEmail: "cellar@demo.test", tenantId: "org_demo_winery" };

const LOC = {
  lab: { id: "loc_lab", name: "Lab", isActive: true },
  red: { id: "loc_red", name: "Red Cellar", isActive: true },
  closed: { id: "loc_closed", name: "Old Shed", isActive: false },
};

function makeTx(opts: {
  material?: { id: string; name: string; stockUnit: string | null; isStockTracked: boolean } | null;
  lots: LotRow[];
  settings?: { costingPolicyVersion: number; currency: string } | null;
  /** Plan 080 U15: the tenant's custom units, so a receipt "by the roll" can resolve its pack size. */
  customUnits?: { normalizedName: string; dimension: string; perCanonical: number }[];
}) {
  const lots = opts.lots.map((l) => ({ ...l }));
  const calls = {
    created: [] as Record<string, unknown>[],
    draws: [] as { id: string; amount: number }[],
    movements: [] as Record<string, unknown>[],
    audits: [] as Record<string, unknown>[],
    materialUpdates: [] as Record<string, unknown>[],
  };
  let seq = 0;

  const locById: Record<string, { name: string; isActive: boolean }> = {
    [LOC.lab.id]: { name: LOC.lab.name, isActive: LOC.lab.isActive },
    [LOC.red.id]: { name: LOC.red.name, isActive: LOC.red.isActive },
    [LOC.closed.id]: { name: LOC.closed.name, isActive: LOC.closed.isActive },
  };

  const matchLot = (where: Record<string, unknown>) =>
    lots.filter((l) => {
      if (where.locationId != null && l.locationId !== where.locationId) return false;
      if (where.qtyRemaining != null && !(l.qtyRemaining > 0)) return false;
      if (where.unitCost != null && l.unitCost == null) return false;
      return true;
    });

  const tx = {
    cellarMaterial: {
      findUnique: async () => (opts.material === undefined ? { id: "m1", name: "KMBS", stockUnit: "g", isStockTracked: true } : opts.material),
      update: async (args: Record<string, unknown>) => {
        calls.materialUpdates.push(args);
        return {};
      },
    },
    location: { findUnique: async (args: { where: { id: string } }) => locById[args.where.id] ?? null },
    customUnit: { findMany: async () => opts.customUnits ?? [] },
    appSettings: { findFirst: async () => opts.settings ?? { costingPolicyVersion: 3, currency: "USD" } },
    supplyLot: {
      findMany: async (args: { where: Record<string, unknown>; orderBy?: unknown }) => {
        const rows = matchLot(args.where);
        // mirror the core's deterministic (receivedAt, id) FIFO order
        return [...rows].sort((a, b) => a.receivedAt.getTime() - b.receivedAt.getTime() || a.id.localeCompare(b.id));
      },
      updateMany: async (args: { where: { id: string; qtyRemaining: { gte: number } }; data: { qtyRemaining: { decrement: number } } }) => {
        const lot = lots.find((l) => l.id === args.where.id);
        const amount = args.data.qtyRemaining.decrement;
        if (!lot || !(lot.qtyRemaining >= args.where.qtyRemaining.gte)) return { count: 0 };
        lot.qtyRemaining = Math.round((lot.qtyRemaining - amount) * 1e6) / 1e6;
        calls.draws.push({ id: lot.id, amount });
        return { count: 1 };
      },
      create: async (args: { data: Record<string, unknown> }) => {
        const id = `new_${++seq}`;
        calls.created.push({ id, ...args.data });
        return { id };
      },
    },
    materialMovement: {
      create: async (args: { data: Record<string, unknown> }) => {
        calls.movements.push(args.data);
        return {};
      },
    },
    auditLog: {
      create: async (args: { data: Record<string, unknown> }) => {
        calls.audits.push(args.data);
        return {};
      },
    },
  } as unknown as Prisma.TransactionClient;

  return { tx, calls, lots };
}

const lot = (id: string, qtyRemaining: number, unitCost: number | null, receivedAtMs: number, locationId: string, extra: Partial<LotRow> = {}): LotRow => ({
  id,
  qtyRemaining,
  unitCost,
  receivedAt: new Date(receivedAtMs),
  locationId,
  currency: "USD",
  expiresAt: null,
  lotCode: null,
  vendorId: null,
  policyVersion: 3,
  stockUnit: "g",
  foreignUnitCost: null,
  foreignCurrency: null,
  fxRate: null,
  fxRateDate: null,
  fxRateSource: null,
  ...extra,
});

describe("transferConsumableCore — lot-split", () => {
  it("splits ONE source lot: conserves Σqty and Σvalue, inherits cost + age, sets splitFromLotId", async () => {
    const { tx, calls, lots } = makeTx({ lots: [lot("a", 100, 2, 1_000, LOC.lab.id)] });

    const res = await transferConsumableCore(ACTOR, { materialId: "m1", fromLocationId: LOC.lab.id, toLocationId: LOC.red.id, qty: 30 }, tx);

    expect(res.splitLots).toBe(1);
    // source drawn, destination created — Σqty conserved (100 → 70 + 30)
    expect(lots.find((l) => l.id === "a")!.qtyRemaining).toBe(70);
    expect(calls.created).toHaveLength(1);
    const dest = calls.created[0];
    expect(dest.qtyReceived).toBe(30);
    expect(dest.qtyRemaining).toBe(30);
    expect(dest.locationId).toBe(LOC.red.id);
    // COST-1: the split carries the source's unit cost, so Σvalue is preserved (70×2 + 30×2 == 100×2)
    expect(dest.unitCost).toBe(2);
    // FIFO age is preserved (a split must not look like a fresh receipt)
    expect(dest.receivedAt).toEqual(new Date(1_000));
    // council S2: provenance derives transitively through the lineage edge, never a row-copy
    expect(dest.splitFromLotId).toBe("a");
  });

  it("draws MULTIPLE source lots oldest-first, one destination lot per slice, each at its own cost", async () => {
    const { tx, calls, lots } = makeTx({
      lots: [
        lot("new", 50, 5, 2_000, LOC.lab.id),
        lot("old", 20, 1, 1_000, LOC.lab.id),
      ],
    });

    const res = await transferConsumableCore(ACTOR, { materialId: "m1", fromLocationId: LOC.lab.id, toLocationId: LOC.red.id, qty: 35 }, tx);

    expect(res.splitLots).toBe(2);
    // oldest ("old", t=1000) fully drawn first, then 15 from "new"
    expect(calls.draws).toEqual([
      { id: "old", amount: 20 },
      { id: "new", amount: 15 },
    ]);
    expect(lots.find((l) => l.id === "old")!.qtyRemaining).toBe(0);
    expect(lots.find((l) => l.id === "new")!.qtyRemaining).toBe(35);
    // each destination lot keeps its own source cost — a blended average would destroy FIFO cost lineage
    expect(calls.created.map((c) => [c.qtyReceived, c.unitCost, c.splitFromLotId])).toEqual([
      [20, 1, "old"],
      [15, 5, "new"],
    ]);
    // COST-1 conservation of VALUE across the move: 20×1 + 15×5 == 95 left source, arrives intact
    const movedValue = calls.created.reduce((s, c) => s + Number(c.qtyReceived) * Number(c.unitCost), 0);
    expect(movedValue).toBe(20 * 1 + 15 * 5);
  });

  it("inherits expiry, vendor, lot code, policy version and the FX quintet onto the split lot", async () => {
    const expires = new Date(9_000_000);
    const fxDate = new Date(8_000_000);
    const { tx, calls } = makeTx({
      lots: [
        lot("a", 10, 3, 1_000, LOC.lab.id, {
          expiresAt: expires,
          vendorId: "v1",
          lotCode: "LOT-9",
          policyVersion: 7,
          currency: "USD",
          foreignUnitCost: 2.5,
          foreignCurrency: "EUR",
          fxRate: 1.2,
          fxRateDate: fxDate,
          fxRateSource: "ECB via Frankfurter",
        }),
      ],
    });

    await transferConsumableCore(ACTOR, { materialId: "m1", fromLocationId: LOC.lab.id, toLocationId: LOC.red.id, qty: 4 }, tx);

    const dest = calls.created[0];
    expect(dest.expiresAt).toEqual(expires);
    expect(dest.vendorId).toBe("v1");
    expect(dest.lotCode).toBe("LOT-9");
    expect(dest.policyVersion).toBe(7);
    expect(dest.foreignUnitCost).toBe(2.5);
    expect(dest.foreignCurrency).toBe("EUR");
    expect(dest.fxRate).toBe(1.2);
    expect(dest.fxRateDate).toEqual(fxDate);
    expect(dest.fxRateSource).toBe("ECB via Frankfurter");
  });

  it("writes both movement legs under ONE transferGroupId (out negative, in positive)", async () => {
    const { tx, calls } = makeTx({ lots: [lot("a", 100, 2, 1_000, LOC.lab.id)] });

    const res = await transferConsumableCore(ACTOR, { materialId: "m1", fromLocationId: LOC.lab.id, toLocationId: LOC.red.id, qty: 30, reason: "restock lab" }, tx);

    expect(calls.movements).toHaveLength(2);
    const [out, into] = calls.movements;
    expect(out).toMatchObject({ locationId: LOC.lab.id, kind: "TRANSFER", deltaQty: -30, transferGroupId: res.transferGroupId, reason: "restock lab" });
    expect(into).toMatchObject({ locationId: LOC.red.id, kind: "TRANSFER", deltaQty: 30, transferGroupId: res.transferGroupId });
  });

  it("blocks a shortfall with the SPECIFIC reason — empty source vs partial", async () => {
    // empty at source
    const empty = makeTx({ lots: [lot("a", 100, 2, 1_000, LOC.red.id)] }); // stock is elsewhere
    await expect(
      transferConsumableCore(ACTOR, { materialId: "m1", fromLocationId: LOC.lab.id, toLocationId: LOC.red.id, qty: 5 }, empty.tx),
    ).rejects.toThrow(/There's no "KMBS" at Lab to transfer/);

    // partial at source
    const partial = makeTx({ lots: [lot("a", 3, 2, 1_000, LOC.lab.id)] });
    await expect(
      transferConsumableCore(ACTOR, { materialId: "m1", fromLocationId: LOC.lab.id, toLocationId: LOC.red.id, qty: 5 }, partial.tx),
    ).rejects.toThrow(/only 3 g there, can't transfer 5/);

    // and nothing was written on the blocked path
    expect(partial.calls.created).toHaveLength(0);
    expect(partial.calls.movements).toHaveLength(0);
  });

  it("never cross-pulls from another location", async () => {
    const { tx } = makeTx({
      lots: [lot("here", 2, 1, 1_000, LOC.lab.id), lot("elsewhere", 500, 1, 1_000, LOC.red.id)],
    });
    // 500 exists at Red Cellar, but a Lab→Red transfer of 10 must see only Lab's 2 and block.
    await expect(
      transferConsumableCore(ACTOR, { materialId: "m1", fromLocationId: LOC.lab.id, toLocationId: LOC.red.id, qty: 10 }, tx),
    ).rejects.toThrow(/only 2 g there/);
  });

  it("refuses a same-location move and a non-positive quantity", async () => {
    const { tx } = makeTx({ lots: [lot("a", 10, 1, 1_000, LOC.lab.id)] });
    await expect(transferConsumableCore(ACTOR, { materialId: "m1", fromLocationId: LOC.lab.id, toLocationId: LOC.lab.id, qty: 5 }, tx)).rejects.toThrow(ActionError);
    await expect(transferConsumableCore(ACTOR, { materialId: "m1", fromLocationId: LOC.lab.id, toLocationId: LOC.red.id, qty: 0 }, tx)).rejects.toThrow(/greater than zero/);
  });

  it("refuses an inactive destination", async () => {
    const { tx } = makeTx({ lots: [lot("a", 10, 1, 1_000, LOC.lab.id)] });
    await expect(
      transferConsumableCore(ACTOR, { materialId: "m1", fromLocationId: LOC.lab.id, toLocationId: LOC.closed.id, qty: 5 }, tx),
    ).rejects.toThrow(/Destination location is not available/);
  });
});

describe("adjustConsumableCore", () => {
  it("positive delta seeds a lot at the location's weighted-avg cost (KNOWN, never $0 — COST-2)", async () => {
    // location holds 10 @ $2 and 30 @ $6 → WA = (10×2 + 30×6) / 40 = 5
    const { tx, calls } = makeTx({ lots: [lot("a", 10, 2, 1_000, LOC.lab.id), lot("b", 30, 6, 2_000, LOC.lab.id)] });

    await adjustConsumableCore(ACTOR, { materialId: "m1", locationId: LOC.lab.id, delta: 5, reason: "cycle count" }, tx);

    expect(calls.created).toHaveLength(1);
    expect(calls.created[0]).toMatchObject({ qtyReceived: 5, qtyRemaining: 5, unitCost: 5, locationId: LOC.lab.id });
    expect(calls.movements[0]).toMatchObject({ kind: "ADJUST", deltaQty: 5, reason: "cycle count" });
  });

  it("positive delta falls back to the tenant-wide WA when this location has no priced lot", async () => {
    // nothing priced at Lab; Red Cellar holds 10 @ $4
    const { tx, calls } = makeTx({ lots: [lot("r", 10, 4, 1_000, LOC.red.id)] });
    await adjustConsumableCore(ACTOR, { materialId: "m1", locationId: LOC.lab.id, delta: 2, reason: "found" }, tx);
    expect(calls.created[0]).toMatchObject({ unitCost: 4 });
  });

  it("negative delta draws down FIFO oldest-first", async () => {
    const { tx, calls, lots } = makeTx({ lots: [lot("new", 50, 5, 2_000, LOC.lab.id), lot("old", 20, 1, 1_000, LOC.lab.id)] });

    await adjustConsumableCore(ACTOR, { materialId: "m1", locationId: LOC.lab.id, delta: -25, reason: "spillage" }, tx);

    expect(calls.draws).toEqual([
      { id: "old", amount: 20 },
      { id: "new", amount: 5 },
    ]);
    expect(lots.find((l) => l.id === "new")!.qtyRemaining).toBe(45);
    expect(calls.movements[0]).toMatchObject({ kind: "ADJUST", deltaQty: -25 });
    // an adjustment is NOT a costed consumption — no SupplyLot is created on the way down
    expect(calls.created).toHaveLength(0);
  });

  it("BLOCKS a negative adjustment past on-hand (deliberate move — never goes negative)", async () => {
    const { tx, calls } = makeTx({ lots: [lot("a", 3, 2, 1_000, LOC.lab.id)] });
    await expect(
      adjustConsumableCore(ACTOR, { materialId: "m1", locationId: LOC.lab.id, delta: -10, reason: "oops" }, tx),
    ).rejects.toThrow(/only 3 g there, can't remove 10/);
    expect(calls.movements).toHaveLength(0);
  });

  it("requires a non-zero delta and a reason", async () => {
    const { tx } = makeTx({ lots: [lot("a", 10, 2, 1_000, LOC.lab.id)] });
    await expect(adjustConsumableCore(ACTOR, { materialId: "m1", locationId: LOC.lab.id, delta: 0, reason: "x" }, tx)).rejects.toThrow(/non-zero/);
    await expect(adjustConsumableCore(ACTOR, { materialId: "m1", locationId: LOC.lab.id, delta: 5, reason: "  " }, tx)).rejects.toThrow(/reason/);
  });
});

// Plan 080 U15 (#366/#370) — receiving BY THE PACK. The pure conversion is unit-tested exhaustively in
// test/receipt-quantity.test.ts; these prove the CORE wires it in — the quantity AND the per-unit cost are
// resolved server-side into the material's stock unit BEFORE the lot is written, so the booked stock and the
// cost every future depletion charges to wine are both correct (COST-1). requireTenantId() reads the ALS
// tenant (loadCustomUnits is K12-explicit), so the core runs inside a tenant context here.
describe("receiveConsumableCore — receive by the pack", () => {
  const LABELS = { id: "m1", name: "6BSS labels", stockUnit: "unit", isStockTracked: true };
  const ROLL = [{ normalizedName: "roll", dimension: "count", perCanonical: 500 }];

  it("books 3 rolls of 500 as 1,500 labels at $0.50 each — the reported ask (#366/#370)", async () => {
    const { tx, calls } = makeTx({ material: LABELS, customUnits: ROLL, lots: [] });

    await runWithTenantContext({ tenantId: ACTOR.tenantId }, () =>
      receiveConsumableCore(ACTOR, { materialId: "m1", locationId: LOC.lab.id, qty: 3, qtyUnit: "roll", unitCost: 250, skipApEmit: true }, tx),
    );

    // The lot is stored in the STOCK unit, not the pack unit: 3 rolls → 1,500 labels.
    expect(calls.created).toHaveLength(1);
    expect(calls.created[0]).toMatchObject({ qtyReceived: 1500, qtyRemaining: 1500, locationId: LOC.lab.id });
    // COST-1: cost converts through the TOTAL — $250/roll × 3 = $750 over 1,500 labels = $0.50/label exactly.
    expect(Number(calls.created[0].unitCost)).toBeCloseTo(0.5, 10);
    expect(1500 * Number(calls.created[0].unitCost)).toBeCloseTo(3 * 250, 8);
    // and a RECEIVE movement stamped in the stock unit at the location.
    expect(calls.movements[0]).toMatchObject({ kind: "RECEIVE", deltaQty: 1500, locationId: LOC.lab.id });
  });

  it("still receives in the base stock unit when no pack unit is chosen", async () => {
    const { tx, calls } = makeTx({ material: LABELS, customUnits: ROLL, lots: [] });

    await runWithTenantContext({ tenantId: ACTOR.tenantId }, () =>
      receiveConsumableCore(ACTOR, { materialId: "m1", locationId: LOC.lab.id, qty: 500, unitCost: 0.5, skipApEmit: true }, tx),
    );

    // No qtyUnit → nothing to convert: 500 labels at the stated $0.50, unchanged.
    expect(calls.created[0]).toMatchObject({ qtyReceived: 500, qtyRemaining: 500 });
    expect(Number(calls.created[0].unitCost)).toBeCloseTo(0.5, 10);
    expect(calls.movements[0]).toMatchObject({ kind: "RECEIVE", deltaQty: 500 });
  });

  it("REFUSES a cross-dimension pack rather than fabricating a conversion (COST-1)", async () => {
    // "roll" measures a count; the material is tracked in grams — no density, so the receipt is blocked.
    const grams = { id: "m1", name: "KMBS", stockUnit: "g", isStockTracked: true };
    const { tx, calls } = makeTx({ material: grams, customUnits: ROLL, lots: [] });

    await expect(
      runWithTenantContext({ tenantId: ACTOR.tenantId }, () =>
        receiveConsumableCore(ACTOR, { materialId: "m1", locationId: LOC.lab.id, qty: 2, qtyUnit: "roll", unitCost: 10, skipApEmit: true }, tx),
      ),
    ).rejects.toThrow(/measure different things/i);
    // nothing booked on the blocked path
    expect(calls.created).toHaveLength(0);
    expect(calls.movements).toHaveLength(0);
  });
});
