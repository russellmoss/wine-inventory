import { describe, it, expect } from "vitest";
import type { Prisma } from "@prisma/client";
import { createStockMaterialCore } from "@/lib/cellar/materials";
import { runAsTenant } from "@/lib/tenant/context";

// Plan 080 U14 — SETTING UP A RECORD IS NOT RECEIVING STOCK.
//
// The field report: a winemaker set up a label record and the app "automatically received 50 units" that
// never physically arrived. The cause was not a receipt bug — it was that package size ("sold as a 50-count
// roll") was being read as a declaration of stock on hand, so merely DESCRIBING a product seeded a costed
// SupplyLot. Phantom on-hand then poisons depletion and weighted-average cost downstream (COST-1).
//
// These lock the split: describing books nothing; only an explicit caller-supplied quantity books stock.
// Driven through the `injectedTx` seam with an in-memory client that records every write, matching
// test/material-stock.test.ts.

const ACTOR = { actorUserId: "u1", actorEmail: "setup@demo.test", tenantId: "org_demo_winery" };
const inTenant = <T>(fn: () => Promise<T>) => runAsTenant("org_demo_winery", fn);

function makeTx() {
  const lots: Record<string, unknown>[] = [];
  const materials: Record<string, unknown>[] = [];
  const tx = {
    appSettings: { findFirst: async () => ({ costingPolicyVersion: 1, currency: "USD" }) },
    vendor: { findUnique: async () => null, findFirst: async () => null },
    location: { findFirst: async () => ({ id: "loc_winery", name: "Winery" }) },
    cellarMaterial: {
      findFirst: async () => null,
      create: async (args: { data: Record<string, unknown> }) => {
        const row = { id: `mat_${materials.length + 1}`, ...args.data };
        materials.push(row);
        return row;
      },
      update: async (args: { data: Record<string, unknown> }) => ({ id: "mat_1", ...args.data }),
    },
    supplyLot: {
      create: async (args: { data: Record<string, unknown> }) => {
        const row = { id: `lot_${lots.length + 1}`, ...args.data };
        lots.push(row);
        return row;
      },
    },
    auditLog: { create: async () => ({}) },
  } as unknown as Prisma.TransactionClient;
  return { tx, lots, materials };
}

// The exact shape the consumables setup form sends: a described product, no quantity anywhere.
const LABEL_RECORD = {
  name: "Ann's Blend 2026 front label",
  kind: "PACKAGING" as const,
  stockUnit: "each",
  packageAmount: 50,
  packageUnit: "each",
};

describe("consumable setup books no stock (plan 080 U14)", () => {
  it("creating a record with a package size books ZERO lots — the reported phantom-50 bug", async () => {
    const { tx, lots, materials } = makeTx();
    await inTenant(() => createStockMaterialCore(ACTOR, LABEL_RECORD, tx));

    expect(materials).toHaveLength(1);
    expect(lots).toEqual([]); // before U14 this was one 50-unit SupplyLot nobody received
  });

  it("still RECORDS the package size — it is purchase metadata, not stock", async () => {
    const { tx, materials } = makeTx();
    await inTenant(() => createStockMaterialCore(ACTOR, LABEL_RECORD, tx));

    // The fix must not throw the description away; that is what the label/pack-size UI reads.
    expect(materials[0]).toMatchObject({ packageAmount: 50, packageUnit: "each" });
  });

  it("a priced package still books nothing — cost belongs to a receipt, not a description", async () => {
    const { tx, lots } = makeTx();
    // "1 lb of yeast, $54" describes how it is sold. Before U14 this silently seeded ~453 g of stock.
    await inTenant(() =>
      createStockMaterialCore(ACTOR, { name: "Lalvin EC-1118", kind: "YEAST", stockUnit: "g", packageAmount: 1, packageUnit: "lb" }, tx),
    );
    expect(lots).toEqual([]);
  });

  it("an EXPLICIT opening quantity still books stock — deliberate intent is preserved", async () => {
    const { tx, lots } = makeTx();
    // MaterialPicker's opening-qty field and the demo seed pass this on purpose; U14 must not break them.
    await inTenant(() =>
      createStockMaterialCore(ACTOR, { name: "KMBS", kind: "SO2", stockUnit: "g", openingQty: 2000, unitCost: 0.02 }, tx),
    );

    expect(lots).toHaveLength(1);
    expect(lots[0]).toMatchObject({ qtyReceived: 2000, qtyRemaining: 2000, unitCost: 0.02 });
  });

  it("an explicit quantity with UNKNOWN cost books the lot at null, never a fabricated $0 (COST-2)", async () => {
    const { tx, lots } = makeTx();
    await inTenant(() =>
      createStockMaterialCore(ACTOR, { name: "Donated corks", kind: "PACKAGING", stockUnit: "each", openingQty: 500 }, tx),
    );

    expect(lots).toHaveLength(1);
    expect(lots[0]!.unitCost).toBeNull();
  });

  it("a zero or negative opening quantity books nothing", async () => {
    for (const openingQty of [0, -5]) {
      const { tx, lots } = makeTx();
      await inTenant(() =>
        createStockMaterialCore(ACTOR, { name: `Edge ${openingQty}`, kind: "PACKAGING", stockUnit: "each", openingQty }, tx),
      );
      expect(lots, `openingQty=${openingQty}`).toEqual([]);
    }
  });
});
