import { describe, it, expect } from "vitest";
import { apAccountForTarget, type ApAccounts } from "@/lib/accounting/ap-emit";
import { createEquipmentAssetsFromInvoiceCore } from "@/lib/equipment/equipment-core";
import { runAsTenant } from "@/lib/tenant/context";
import type { Prisma } from "@prisma/client";

// Plan 080 U5 — a MIXED invoice: parts + equipment assets + finished goods on ONE document, still ONE
// aggregate bill (AP-1). The end-to-end proof (real lots/assets/receipts/bill against Neon) is
// verify:ingest scenario 14; these lock the two PURE rules that decide whether the books come out right.

const ACTOR = { actorUserId: "u1", actorEmail: "u5@demo.test", tenantId: "org_demo_winery" };
const inTenant = <T>(fn: () => Promise<T>) => runAsTenant("org_demo_winery", fn);

describe("apAccountForTarget — council C3 per-line GL routing", () => {
  const full: ApAccounts = { inventory: "Inventory Asset", fixedAsset: "Fixed Assets", suppliesExpense: "Supplies Expense" };

  it("codes each target to its OWN account — the whole point of C3", () => {
    expect(apAccountForTarget("EQUIPMENT_ASSET", full)).toBe("Fixed Assets");
    expect(apAccountForTarget("MATERIAL", full)).toBe("Supplies Expense");
    expect(apAccountForTarget("FINISHED_GOOD", full)).toBe("Inventory Asset");
  });

  it("a mixed invoice therefore hits THREE different accounts, not one", () => {
    const accounts = (["MATERIAL", "EQUIPMENT_ASSET", "FINISHED_GOOD"] as const).map((t) => apAccountForTarget(t, full));
    expect(new Set(accounts).size).toBe(3);
  });

  it("WITHHOLDS (null) when the needed account is unconfigured, rather than miscoding", () => {
    const noFixed: ApAccounts = { ...full, fixedAsset: null };
    // capitalizing a pump into Inventory Asset would corrupt the balance sheet — refuse instead
    expect(apAccountForTarget("EQUIPMENT_ASSET", noFixed)).toBeNull();
    // ...while the other kinds on the same invoice still resolve
    expect(apAccountForTarget("MATERIAL", noFixed)).toBe("Supplies Expense");
  });

  it("is backward-compatible: consumables-only invoices post exactly as before U5", () => {
    // a tenant that never configured the new accounts (every pre-U5 tenant)
    const legacy: ApAccounts = { inventory: "Inventory Asset", fixedAsset: null, suppliesExpense: null };
    expect(apAccountForTarget("MATERIAL", legacy)).toBe("Inventory Asset");
    expect(apAccountForTarget(null, legacy)).toBe("Inventory Asset");
    expect(apAccountForTarget(undefined, legacy)).toBe("Inventory Asset");
  });
});

// ── council C7: Σ(created asset costs) must equal the line total EXACTLY ──
function makeTx() {
  const created: Record<string, unknown>[] = [];
  let seq = 0;
  const tx = {
    appSettings: { findFirst: async () => ({ currency: "USD" }) },
    vendor: { findUnique: async () => ({ id: "v1" }), findFirst: async () => null, create: async () => ({ id: "v1", name: "v" }) },
    equipmentAsset: {
      findMany: async () => [],
      create: async (args: { data: Record<string, unknown> }) => {
        const id = `eq_${++seq}`;
        created.push({ id, ...args.data });
        return { id };
      },
    },
    auditLog: { create: async () => ({}) },
  } as unknown as Prisma.TransactionClient;
  return { tx, created };
}

describe("equipment line residual allocation — council C7", () => {
  it("splits a line total across N assets with the residual on the LAST unit, summing EXACTLY", async () => {
    const { tx, created } = makeTx();
    // $100 over 3 assets does not divide evenly; a naive round would lose or invent a cent, and the
    // aggregate bill would no longer tie to the sum of what was booked.
    const res = await inTenant(() =>
      createEquipmentAssetsFromInvoiceCore(ACTOR, { name: "Clamp", kind: "other", quantity: 3, lineTotalBase: 100 }, tx),
    );
    const sum = res.unitCosts.reduce<number>((a, c) => a + (c ?? 0), 0);
    expect(Math.round(sum * 1e8) / 1e8).toBe(100);
    expect(created).toHaveLength(3);
    // the first N-1 are equal; the last absorbs the remainder
    expect(res.unitCosts[0]).toBe(res.unitCosts[1]);
    expect(res.unitCosts[2]).not.toBe(res.unitCosts[0]);
  });

  it("holds for an awkward total that would otherwise drift", async () => {
    for (const [total, n] of [[0.07, 3], [1234.56, 7], [10, 3]] as const) {
      const { tx } = makeTx();
      const res = await inTenant(() =>
        createEquipmentAssetsFromInvoiceCore(ACTOR, { name: `W${n}`, kind: "other", quantity: n, lineTotalBase: total }, tx),
      );
      const sum = res.unitCosts.reduce<number>((a, c) => a + (c ?? 0), 0);
      expect(Math.round(sum * 1e8) / 1e8, `${total} over ${n}`).toBe(total);
    }
  });

  it("an UNCOSTED equipment line books no cost at all — never a fabricated $0 (COST-2)", async () => {
    const { tx } = makeTx();
    const res = await inTenant(() => createEquipmentAssetsFromInvoiceCore(ACTOR, { name: "Gift", kind: "other", quantity: 2 }, tx));
    expect(res.unitCosts).toEqual([null, null]);
  });
});
