import { describe, it, expect } from "vitest";
import type { Prisma } from "@prisma/client";
import { createEquipmentAssetCore, createEquipmentAssetsFromInvoiceCore } from "@/lib/equipment/equipment-core";
import { isDoseableCategory } from "@/lib/cellar/material-taxonomy";
import { runAsTenant } from "@/lib/tenant/context";
import { ActionError } from "@/lib/action-error";

// Plan 080 U3 — costed equipment. Locks the money-shaped properties of asset acquisition:
//   • COST-4 — purchaseCostBase is ALWAYS the tenant BASE currency; the foreign quintet is audit-only.
//   • council C5 — a qty>1 invoice line becomes N individually-tracked assets (a single FK can't hold N).
//   • council C7 — the per-unit split's rounding residual lands on the LAST unit so Σ(unit costs) == the line
//     total EXACTLY; otherwise the aggregate bill wouldn't reconcile to the cent.
//   • WORKORDER-7 — EQUIPMENT is never doseable; a capitalized asset is a fixed asset, not a material.
// Driven through the cores' injectedTx seam with an in-memory tx stub (no DB), inside a runAsTenant ALS
// context so requireTenantId() resolves.

const ACTOR = { actorUserId: "u1", actorEmail: "cellar@demo.test", tenantId: "org_demo_winery" };

function makeTx(opts: { vendors?: { id: string; name: string }[]; existingNames?: string[]; currency?: string } = {}) {
  const vendors = [...(opts.vendors ?? [])];
  const existing = new Set(opts.existingNames ?? []);
  const calls = { created: [] as Record<string, unknown>[], audits: [] as Record<string, unknown>[] };
  let seq = 0;
  const tx = {
    appSettings: { findFirst: async () => ({ currency: opts.currency ?? "USD" }) },
    vendor: {
      findUnique: async (args: { where: { id: string } }) => vendors.find((v) => v.id === args.where.id) ?? null,
      findFirst: async (args: { where?: Record<string, unknown> }) => {
        const name = String((args.where as { name?: unknown })?.name ?? "");
        return vendors.find((v) => v.name === name) ?? null;
      },
      create: async (args: { data: { name: string } }) => {
        const v = { id: `vend_${++seq}`, name: args.data.name };
        vendors.push(v);
        return v;
      },
    },
    equipmentAsset: {
      findMany: async (args: { where: { name: { startsWith: string } } }) =>
        [...existing].filter((n) => n.startsWith(args.where.name.startsWith)).map((name) => ({ name })),
      create: async (args: { data: Record<string, unknown> }) => {
        const name = String(args.data.name);
        if (existing.has(name)) {
          const err = new Error("Unique constraint failed") as Error & { code: string };
          err.code = "P2002";
          throw err;
        }
        existing.add(name);
        const id = `eq_${++seq}`;
        calls.created.push({ id, ...args.data });
        return { id };
      },
    },
    auditLog: {
      create: async (args: { data: Record<string, unknown> }) => {
        calls.audits.push(args.data);
        return {};
      },
    },
  } as unknown as Prisma.TransactionClient;
  return { tx, calls };
}

const inTenant = <T>(fn: () => Promise<T>) => runAsTenant("org_demo_winery", fn);

describe("createEquipmentAssetCore", () => {
  it("stamps the acquisition cost in the tenant BASE currency (COST-4)", async () => {
    const { tx, calls } = makeTx({ currency: "USD" });
    await inTenant(() =>
      createEquipmentAssetCore(ACTOR, { name: "Must pump", kind: "pump", purchaseCostBase: 4200.5, purchaseDate: new Date(5_000) }, tx),
    );
    expect(calls.created[0]).toMatchObject({ name: "Must pump", kind: "pump", purchaseCostBase: 4200.5, currency: "USD" });
    expect(calls.created[0].purchaseDate).toEqual(new Date(5_000));
    expect(String(calls.audits[0].summary)).toMatch(/4200\.5 USD/);
  });

  it("keeps an UNCOSTED asset valid — no cost, no currency claim (never a silent $0)", async () => {
    const { tx, calls } = makeTx();
    await inTenant(() => createEquipmentAssetCore(ACTOR, { name: "Old press", kind: "press" }, tx));
    expect(calls.created[0]).toMatchObject({ purchaseCostBase: null, currency: null, vendorId: null });
  });

  it("stores foreign-invoice provenance alongside the base cost (audit only, never revalued)", async () => {
    const { tx, calls } = makeTx();
    const d = new Date(7_000);
    await inTenant(() =>
      createEquipmentAssetCore(
        ACTOR,
        { name: "Euro filter", kind: "filter", purchaseCostBase: 1200, foreignPurchaseCost: 1000, foreignCurrency: "EUR", fxRate: 1.2, fxRateDate: d, fxRateSource: "ECB via Frankfurter" },
        tx,
      ),
    );
    expect(calls.created[0]).toMatchObject({ purchaseCostBase: 1200, currency: "USD", foreignPurchaseCost: 1000, foreignCurrency: "EUR", fxRate: 1.2, fxRateSource: "ECB via Frankfurter" });
    expect(calls.created[0].fxRateDate).toEqual(d);
  });

  it("find-or-creates the managed vendor from a free-text name, and honours an explicit vendorId", async () => {
    const byName = makeTx();
    await inTenant(() => createEquipmentAssetCore(ACTOR, { name: "P1", kind: "pump", vendorName: "Acme Cellar Supply" }, byName.tx));
    expect(byName.calls.created[0].vendorId).toBe("vend_1");

    const byId = makeTx({ vendors: [{ id: "v9", name: "Known Vendor" }] });
    await inTenant(() => createEquipmentAssetCore(ACTOR, { name: "P2", kind: "pump", vendorId: "v9" }, byId.tx));
    expect(byId.calls.created[0].vendorId).toBe("v9");
  });

  it("refuses an unknown vendorId, an invalid kind, and a blank name", async () => {
    const { tx } = makeTx();
    await expect(inTenant(() => createEquipmentAssetCore(ACTOR, { name: "X", kind: "pump", vendorId: "nope" }, tx))).rejects.toThrow(/vendor no longer exists/);
    await expect(inTenant(() => createEquipmentAssetCore(ACTOR, { name: "X", kind: "not-a-kind" }, tx))).rejects.toThrow(/Invalid equipment kind/);
    await expect(inTenant(() => createEquipmentAssetCore(ACTOR, { name: "  ", kind: "pump" }, tx))).rejects.toThrow(/needs a name/);
  });

  it("surfaces a duplicate name as a friendly CONFLICT, not a raw P2002", async () => {
    const { tx } = makeTx({ existingNames: ["Must pump"] });
    await expect(inTenant(() => createEquipmentAssetCore(ACTOR, { name: "Must pump", kind: "pump" }, tx))).rejects.toThrow(ActionError);
    await expect(inTenant(() => createEquipmentAssetCore(ACTOR, { name: "Must pump", kind: "pump" }, tx))).rejects.toThrow(/already exists/);
  });
});

describe("createEquipmentAssetsFromInvoiceCore — qty>1 (council C5/C7)", () => {
  it("creates N individually-named assets for one line", async () => {
    const { tx, calls } = makeTx();
    const res = await inTenant(() => createEquipmentAssetsFromInvoiceCore(ACTOR, { name: "Clamp", kind: "other", quantity: 3, lineTotalBase: 90 }, tx));
    expect(res.ids).toHaveLength(3);
    expect(calls.created.map((c) => c.name)).toEqual(["Clamp #1", "Clamp #2", "Clamp #3"]);
  });

  it("EXACT reconciliation: per-unit costs sum to the line total, residual on the LAST unit", async () => {
    const { tx } = makeTx();
    // 100 / 3 does not divide evenly — the residual must not be lost or the aggregate bill won't tie out.
    const res = await inTenant(() => createEquipmentAssetsFromInvoiceCore(ACTOR, { name: "Widget", kind: "other", quantity: 3, lineTotalBase: 100 }, tx));
    const sum = res.unitCosts.reduce<number>((s, c) => s + (c ?? 0), 0);
    expect(Math.round(sum * 1e8) / 1e8).toBe(100);
    expect(res.unitCosts[0]).toBe(res.unitCosts[1]); // even split across all but the last
    expect(res.unitCosts[2]).not.toBe(res.unitCosts[0]); // last absorbs the residual
  });

  it("qty 1 keeps the plain name and the whole line cost", async () => {
    const { tx, calls } = makeTx();
    const res = await inTenant(() => createEquipmentAssetsFromInvoiceCore(ACTOR, { name: "Bladder press", kind: "press", quantity: 1, lineTotalBase: 15000 }, tx));
    expect(calls.created[0].name).toBe("Bladder press");
    expect(res.unitCosts).toEqual([15000]);
  });

  it("an UNCOSTED line stays uncosted on every unit — never $0 (COST-2)", async () => {
    const { tx } = makeTx();
    const res = await inTenant(() => createEquipmentAssetsFromInvoiceCore(ACTOR, { name: "Hose", kind: "other", quantity: 2 }, tx));
    expect(res.unitCosts).toEqual([null, null]);
  });

  it("skips names already taken so a repeat purchase can't collide on (tenantId, name)", async () => {
    const { tx, calls } = makeTx({ existingNames: ["Clamp #1", "Clamp #2"] });
    await inTenant(() => createEquipmentAssetsFromInvoiceCore(ACTOR, { name: "Clamp", kind: "other", quantity: 2, lineTotalBase: 20 }, tx));
    expect(calls.created.map((c) => c.name)).toEqual(["Clamp #3", "Clamp #4"]);
  });

  it("refuses a non-positive quantity", async () => {
    const { tx } = makeTx();
    await expect(inTenant(() => createEquipmentAssetsFromInvoiceCore(ACTOR, { name: "X", kind: "other", quantity: 0 }, tx))).rejects.toThrow(/at least 1/);
  });
});

describe("WORKORDER-7 — equipment is never doseable", () => {
  it("EQUIPMENT stays outside the dosing allowlist even though it is now costed", () => {
    expect(isDoseableCategory("EQUIPMENT")).toBe(false);
    expect(isDoseableCategory("UNCLASSIFIED")).toBe(false);
    expect(isDoseableCategory("ADDITIVE")).toBe(true);
  });
});
