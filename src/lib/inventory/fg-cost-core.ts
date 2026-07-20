import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { runInTenantTx } from "@/lib/tenant/tx";
import { requireTenantId } from "@/lib/tenant/context";
import { ActionError } from "@/lib/action-error";
import { writeAudit } from "@/lib/audit";
import { coerceCurrency } from "@/lib/money/currency";
import { round8 } from "@/lib/cost/rollup";
import type { LedgerActor } from "@/lib/vessels/rack-core";

// Plan 080 U7 (council C4) — the PURCHASED-cost layer for finished goods.
//
// Valuation of 3rd-party / merch / externally-purchased finished goods is the WEIGHTED AVERAGE over
// append-only `FinishedGoodReceipt` rows. Explicitly NOT a mutable `unitCogs` column on the SKU (a second
// source of truth with no history) and NOT last-cost (which whipsaws COGS).
//
// HARD BOUNDARY: internally-bottled wine is NOT valued here. Its COGS is the specific-lot figure frozen in
// `BottlingCostSnapshot`, which is immutable (COST-3). A receipt never touches that. A library BUY-BACK of
// your own wine is a genuine purchase and does get a receipt (council DQ1: lock only when the provenance is
// an internal bottling run) — so the two layers can coexist on one SKU, and `finishedGoodCost` reports
// which layer answered.

export type FinishedGoodTarget = { wineSkuId: string; finishedGoodId?: never } | { finishedGoodId: string; wineSkuId?: never };

/** A receipt as the valuation math sees it. Pure input — no Prisma types. */
export type ReceiptView = { qty: number; unitCostBase: number };

/**
 * PURE weighted-average unit cost over receipts. Σ(qty × unitCost) / Σ(qty).
 * null when there is nothing to value — "unknown", never a fabricated $0 (COST-2).
 * A zero-cost receipt is a legitimate freebie and DOES participate (it drags the average down honestly);
 * only the absence of receipts is unknown.
 */
export function weightedAvgReceiptCost(receipts: readonly ReceiptView[]): number | null {
  let qty = 0;
  let cost = 0;
  for (const r of receipts) {
    if (!Number.isFinite(r.qty) || r.qty <= 0) continue;
    if (!Number.isFinite(r.unitCostBase) || r.unitCostBase < 0) continue;
    qty += r.qty;
    cost += r.qty * r.unitCostBase;
  }
  return qty > 0 ? round8(cost / qty) : null;
}

export type RecordReceiptInput = FinishedGoodTarget & {
  qty: number;
  /** per unit, tenant BASE currency (COST-4). 0 is allowed (a freebie); negative is refused. */
  unitCostBase: number;
  locationId: string;
  vendorId?: string | null;
  receivedAt?: Date | null;
  note?: string | null;
  sourceInvoiceLineId?: string | null;
  // immutable foreign-invoice provenance (all null for a base-currency purchase)
  foreignUnitCost?: number | null;
  foreignCurrency?: string | null;
  fxRate?: number | null;
  fxRateDate?: Date | null;
  fxRateSource?: string | null;
};

/**
 * Append a purchased-cost receipt. `injectedTx` lets an invoice apply (Wave 3 / U5) write the receipt in the
 * SAME transaction as the goods movement and the aggregate bill.
 *
 * This records COST only — it does NOT move stock. The caller pairs it with `receiveStock` so the physical
 * balance and the valuation layer stay one decision rather than drifting apart.
 */
export async function recordFinishedGoodReceiptCore(
  actor: LedgerActor,
  input: RecordReceiptInput,
  injectedTx?: Prisma.TransactionClient,
): Promise<{ receiptId: string }> {
  const qty = Math.trunc(Number(input.qty));
  if (!Number.isFinite(qty) || qty <= 0) throw new ActionError("Received quantity must be a whole number greater than zero.", "VALIDATION");
  const unitCostBase = Number(input.unitCostBase);
  if (!Number.isFinite(unitCostBase) || unitCostBase < 0) throw new ActionError("Unit cost can't be negative.", "VALIDATION");
  const wineSkuId = input.wineSkuId ?? null;
  const finishedGoodId = input.finishedGoodId ?? null;
  if (!!wineSkuId === !!finishedGoodId) throw new ActionError("A receipt must be for exactly one item (a wine SKU or a merchandise item).", "VALIDATION");

  const body = async (tx: Prisma.TransactionClient) => {
    const tenantId = requireTenantId();
    const settings = await tx.appSettings.findFirst({ select: { currency: true } });
    const loc = await tx.location.findUnique({ where: { id: input.locationId }, select: { id: true, isActive: true } });
    if (!loc || !loc.isActive) throw new ActionError("That location is not available.", "VALIDATION");

    const row = await tx.finishedGoodReceipt.create({
      data: {
        tenantId,
        wineSkuId,
        finishedGoodId,
        qty,
        unitCostBase,
        currency: coerceCurrency(settings?.currency),
        locationId: input.locationId,
        receivedAt: input.receivedAt ?? undefined,
        vendorId: input.vendorId ?? null,
        sourceInvoiceLineId: input.sourceInvoiceLineId ?? null,
        note: input.note?.trim() || null,
        foreignUnitCost: input.foreignUnitCost != null && Number.isFinite(input.foreignUnitCost) && input.foreignUnitCost >= 0 ? input.foreignUnitCost : null,
        foreignCurrency: input.foreignCurrency?.trim() ? coerceCurrency(input.foreignCurrency) : null,
        fxRate: input.fxRate != null && Number.isFinite(input.fxRate) && input.fxRate > 0 ? input.fxRate : null,
        fxRateDate: input.fxRateDate ?? null,
        fxRateSource: input.fxRateSource?.trim() || null,
        createdById: actor.actorUserId,
        createdByEmail: actor.actorEmail,
      },
      select: { id: true },
    });
    await writeAudit(tx, {
      ...actor,
      action: "CREATE",
      entityType: "FinishedGoodReceipt",
      entityId: row.id,
      summary: `Recorded purchased cost for ${qty} unit${qty === 1 ? "" : "s"} @ ${unitCostBase}`,
    });
    return { receiptId: row.id };
  };

  return injectedTx ? body(injectedTx) : runInTenantTx(body);
}

export type FinishedGoodCost = {
  /** weighted-average purchased unit cost; null when this item has no receipts. */
  unitCost: number | null;
  /** which layer answered — purchased receipts, or the frozen bottling snapshot. */
  source: "receipts" | "bottling" | "unknown";
};

/**
 * Weighted-average PURCHASED cost per wine SKU, for the ids given. Read through the extended `prisma` (RLS
 * auto-scopes) — NOT runInTenantTx, which 500s in an RSC read (plan 075).
 *
 * Deliberately does NOT consult BottlingCostSnapshot: an internally-bottled SKU's COGS is specific-lot and
 * lives there untouched. Callers that need the blended picture ask for both and prefer bottling provenance.
 */
export async function purchasedCostForWineSkus(wineSkuIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (wineSkuIds.length === 0) return out;
  const rows = await prisma.finishedGoodReceipt.findMany({
    where: { wineSkuId: { in: wineSkuIds } },
    select: { wineSkuId: true, qty: true, unitCostBase: true },
  });
  const byId = new Map<string, ReceiptView[]>();
  for (const r of rows) {
    if (!r.wineSkuId) continue;
    const arr = byId.get(r.wineSkuId) ?? [];
    arr.push({ qty: r.qty, unitCostBase: Number(r.unitCostBase) });
    byId.set(r.wineSkuId, arr);
  }
  for (const [id, receipts] of byId) {
    const wa = weightedAvgReceiptCost(receipts);
    if (wa != null) out.set(id, wa);
  }
  return out;
}

/** Weighted-average purchased cost per merchandise item. Same contract as the wine-SKU reader. */
export async function purchasedCostForFinishedGoods(finishedGoodIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (finishedGoodIds.length === 0) return out;
  const rows = await prisma.finishedGoodReceipt.findMany({
    where: { finishedGoodId: { in: finishedGoodIds } },
    select: { finishedGoodId: true, qty: true, unitCostBase: true },
  });
  const byId = new Map<string, ReceiptView[]>();
  for (const r of rows) {
    if (!r.finishedGoodId) continue;
    const arr = byId.get(r.finishedGoodId) ?? [];
    arr.push({ qty: r.qty, unitCostBase: Number(r.unitCostBase) });
    byId.set(r.finishedGoodId, arr);
  }
  for (const [id, receipts] of byId) {
    const wa = weightedAvgReceiptCost(receipts);
    if (wa != null) out.set(id, wa);
  }
  return out;
}
