import type { Prisma } from "@prisma/client";
import { withWriteRetry as retryWrite } from "@/lib/db/write-retry";
import { runInTenantTx } from "@/lib/tenant/tx";
import { writeAudit } from "@/lib/audit";
import { ActionError } from "@/lib/action-error";
import type { LedgerActor } from "@/lib/vessels/rack-core";
import { coerceStockUnit } from "@/lib/cellar/materials-shared";
import { receiveSupplyCore, type ReceiveSupplyInput } from "@/lib/cellar/materials";
import { weightedAvgUnitCost, type SupplyLotView } from "@/lib/cost/deplete";
import { coerceCurrency } from "@/lib/money/currency";

// Plan 080 U2b — the location-aware consumables stock engine: per-location Receive / Adjust / Transfer,
// mirroring the wine stock engine (src/lib/stock/movements.ts) but on the COST-lot (`SupplyLot`) grain so
// physical location and cost lineage stay on the SAME row (no double-book, no cost/location desync). Every
// move writes an append-only `MaterialMovement` audit row (the consumables analogue of `StockMovement`).
//
// Cores are script-safe (no "use server"): actions.ts wraps them as safeActions; the assistant tools
// (Unit 12) and verify scripts call them directly. All three open `withWriteRetry(runInTenantTx(...))` —
// NOT runLedgerWrite — matching the wine engine.

// The shared serialization-retry wrapper (D18/H2), labelled for this domain's logs.
const withWriteRetry = <T>(fn: () => Promise<T>) => retryWrite(fn, 5, "material-stock");

// Material quantities are Decimal(18,6). Pin ONE scale and round before every write so the conditional
// `gte` decrement guard below is exact (float drift could otherwise make a guard miss by ~5e-7).
const round6 = (n: number): number => Math.round((n + Number.EPSILON) * 1e6) / 1e6;
const QTY_EPS = 1e-9;

/**
 * Atomic, race-safe per-LOT decrement: only succeeds if the lot still holds `>= amount`. Mirrors the
 * conditional `updateMany`+`gte` guard the wine engine uses on its balance rows (movements.ts `decrement`)
 * — a concurrent draw can never take a `SupplyLot` below zero without this. Returns whether it drew.
 */
async function drawLotGuarded(tx: Prisma.TransactionClient, lotId: string, amount: number): Promise<boolean> {
  const r = await tx.supplyLot.updateMany({
    where: { id: lotId, qtyRemaining: { gte: amount } },
    data: { qtyRemaining: { decrement: amount } },
  });
  return r.count > 0;
}

async function loadLocation(tx: Prisma.TransactionClient, id: string): Promise<{ name: string; isActive: boolean } | null> {
  return tx.location.findUnique({ where: { id }, select: { name: true, isActive: true } });
}

type StockMaterial = { id: string; name: string; stockUnit: string | null; isStockTracked: boolean };

async function loadStockMaterial(tx: Prisma.TransactionClient, materialId: string): Promise<StockMaterial> {
  const m = await tx.cellarMaterial.findUnique({ where: { id: materialId }, select: { id: true, name: true, stockUnit: true, isStockTracked: true } });
  if (!m) throw new ActionError("Material not found.", "VALIDATION");
  return m;
}

/** Weighted-avg unit cost for pricing a positive adjustment / negative reconcile: this LOCATION's priced
 * open lots first, else the material tenant-wide. null (unknown, D14/COST-2) only when nothing is priced. */
async function resolveMaterialWaCost(tx: Prisma.TransactionClient, materialId: string, locationId: string): Promise<number | null> {
  const toView = (l: { id: string; qtyRemaining: Prisma.Decimal; unitCost: Prisma.Decimal | null; receivedAt: Date }): SupplyLotView => ({
    id: l.id,
    qtyRemaining: Number(l.qtyRemaining),
    unitCost: l.unitCost == null ? null : Number(l.unitCost),
    receivedAt: l.receivedAt.getTime(),
  });
  const local = await tx.supplyLot.findMany({ where: { materialId, locationId, qtyRemaining: { gt: 0 }, unitCost: { not: null } }, select: { id: true, qtyRemaining: true, unitCost: true, receivedAt: true } });
  const localWa = weightedAvgUnitCost(local.map(toView));
  if (localWa != null) return localWa;
  const tenantWide = await tx.supplyLot.findMany({ where: { materialId, qtyRemaining: { gt: 0 }, unitCost: { not: null } }, select: { id: true, qtyRemaining: true, unitCost: true, receivedAt: true } });
  return weightedAvgUnitCost(tenantWide.map(toView));
}

async function writeMovement(
  tx: Prisma.TransactionClient,
  actor: LedgerActor,
  data: { materialId: string; locationId: string; kind: "RECEIVE" | "ADJUST" | "TRANSFER" | "CONSUME"; deltaQty: number; supplyLotId?: string | null; transferGroupId?: string | null; reason?: string | null },
): Promise<void> {
  await tx.materialMovement.create({
    data: {
      materialId: data.materialId,
      locationId: data.locationId,
      kind: data.kind,
      deltaQty: round6(data.deltaQty),
      supplyLotId: data.supplyLotId ?? null,
      transferGroupId: data.transferGroupId ?? null,
      reason: data.reason ?? null,
      createdById: actor.actorUserId,
      createdByEmail: actor.actorEmail,
    },
  });
}

// ── Receive ───────────────────────────────────────────────────────────────────────────────────────────

export type ReceiveConsumableInput = ReceiveSupplyInput & { locationId: string };

/**
 * Receive a costed supply lot INTO a specific location. Reuses `receiveSupplyCore` (same lot shape, FX,
 * per-lot A/P emit unless `skipApEmit`) with the location stamped, then writes a RECEIVE `MaterialMovement`
 * — both in ONE tx so the ledger row and the lot commit together.
 */
export async function receiveConsumableCore(actor: LedgerActor, input: ReceiveConsumableInput, injectedTx?: Prisma.TransactionClient): Promise<{ supplyLotId: string }> {
  const qty = round6(Number(input.qty));
  if (!(qty > QTY_EPS)) throw new ActionError("Received quantity must be greater than zero.", "VALIDATION");
  const body = async (tx: Prisma.TransactionClient) => {
    const loc = await loadLocation(tx, input.locationId);
    if (!loc || !loc.isActive) throw new ActionError("That location is not available.", "VALIDATION");
    const { supplyLotId } = await receiveSupplyCore(actor, { ...input, qty, locationId: input.locationId }, tx);
    await writeMovement(tx, actor, { materialId: input.materialId, locationId: input.locationId, kind: "RECEIVE", deltaQty: qty, supplyLotId, reason: input.note ?? null });
    return { supplyLotId };
  };
  // Reuse an injected tx (a multi-line invoice apply runs every line in ONE transaction) or open our own.
  return injectedTx ? body(injectedTx) : withWriteRetry(() => runInTenantTx(body));
}

// ── Adjust ────────────────────────────────────────────────────────────────────────────────────────────

export type AdjustConsumableInput = {
  materialId: string;
  locationId: string;
  /** signed, non-zero, in the material's stock unit. Positive = found stock (new priced lot); negative = a
   * deliberate write-down drawn FIFO from this location's open lots. */
  delta: number;
  reason: string;
};

/**
 * Adjust a consumable's on-hand AT a location by a signed delta. A user adjustment is DELIBERATE, so — like
 * the wine engine — a negative that exceeds this location's on-hand is BLOCKED with the specific shortfall
 * (never allowed negative here; only *consumption* reconciles negative). A positive adjustment seeds a new
 * lot priced at the material's weighted-avg (KNOWN cost, COST-2) so the found stock isn't valued at $0.
 */
export async function adjustConsumableCore(actor: LedgerActor, input: AdjustConsumableInput, injectedTx?: Prisma.TransactionClient): Promise<void> {
  const delta = round6(Number(input.delta));
  if (!Number.isFinite(delta) || Math.abs(delta) <= QTY_EPS) throw new ActionError("Adjustment must be a non-zero quantity.", "VALIDATION");
  const reason = input.reason?.trim();
  if (!reason) throw new ActionError("Give a reason for the adjustment.", "VALIDATION");

  const body = async (tx: Prisma.TransactionClient) => {
    const material = await loadStockMaterial(tx, input.materialId);
    const loc = await loadLocation(tx, input.locationId);
    if (!loc || !loc.isActive) throw new ActionError("That location is not available.", "VALIDATION");
    const stockUnit = coerceStockUnit(material.stockUnit);
    let supplyLotId: string | null = null;

    if (delta > 0) {
      const settings = await tx.appSettings.findFirst({ select: { costingPolicyVersion: true, currency: true } });
      const unitCost = await resolveMaterialWaCost(tx, input.materialId, input.locationId);
      const lot = await tx.supplyLot.create({
        data: {
          materialId: input.materialId,
          qtyReceived: delta,
          qtyRemaining: delta,
          stockUnit,
          unitCost,
          currency: coerceCurrency(settings?.currency),
          locationId: input.locationId,
          policyVersion: settings?.costingPolicyVersion ?? 1,
          supplierNote: `Adjustment: ${reason}`,
        },
        select: { id: true },
      });
      supplyLotId = lot.id;
      // Positive adjustment must mark the material stock-tracked if it wasn't (mirrors receiveSupplyCore).
      if (!material.isStockTracked || !material.stockUnit) {
        await tx.cellarMaterial.update({ where: { id: material.id }, data: { isStockTracked: true, stockUnit } });
      }
    } else {
      // Negative: draw down this location's open lots oldest-first, blocking on a shortfall.
      const need = round6(-delta);
      const lots = await tx.supplyLot.findMany({
        where: { materialId: input.materialId, locationId: input.locationId, qtyRemaining: { gt: 0 } },
        orderBy: [{ receivedAt: "asc" }, { id: "asc" }],
        select: { id: true, qtyRemaining: true },
      });
      const have = round6(lots.reduce((s, l) => s + Number(l.qtyRemaining), 0));
      if (have + QTY_EPS < need) {
        throw new ActionError(
          have <= QTY_EPS
            ? `There's no "${material.name}" at ${loc.name} to adjust down.`
            : `Not enough "${material.name}" at ${loc.name}: only ${have} ${stockUnit} there, can't remove ${need}.`,
          "CONFLICT",
        );
      }
      let remaining = need;
      for (const l of lots) {
        if (remaining <= QTY_EPS) break;
        const take = round6(Math.min(Number(l.qtyRemaining), remaining));
        if (!(await drawLotGuarded(tx, l.id, take))) {
          throw new ActionError(`The stock of "${material.name}" at ${loc.name} just changed — try the adjustment again.`, "CONFLICT");
        }
        remaining = round6(remaining - take);
      }
    }

    await writeMovement(tx, actor, { materialId: input.materialId, locationId: input.locationId, kind: "ADJUST", deltaQty: delta, supplyLotId, reason });
    await writeAudit(tx, {
      ...actor,
      action: "STOCK_MOVEMENT",
      entityType: "CellarMaterial",
      entityId: input.materialId,
      summary: `Adjusted "${material.name}" by ${delta > 0 ? "+" : ""}${delta} ${stockUnit} at ${loc.name} (${reason})`,
    });
  };

  if (injectedTx) await body(injectedTx);
  else await withWriteRetry(() => runInTenantTx(body));
}

// ── Transfer ──────────────────────────────────────────────────────────────────────────────────────────

export type TransferConsumableInput = {
  materialId: string;
  fromLocationId: string;
  toLocationId: string;
  qty: number;
  reason?: string | null;
};

/**
 * Move `qty` of a consumable between locations by LOT-SPLIT: draw the source location's open lots
 * oldest-first, and for each drawn slice create a destination lot that INHERITS the source lot's cost, age
 * (`receivedAt`), expiry, vendor, policy version and FX quintet, and points back via `splitFromLotId`
 * (provenance — LotDocument/expiry — derives transitively through that edge; never row-copied, council S2).
 * This preserves FIFO age + weighted-avg cost per location and supports partial transfers. Both movement
 * legs share a `transferGroupId`. A shortfall on this deliberate move BLOCKS with the specific reason.
 */
export async function transferConsumableCore(actor: LedgerActor, input: TransferConsumableInput, injectedTx?: Prisma.TransactionClient): Promise<{ transferGroupId: string; splitLots: number }> {
  const qty = round6(Number(input.qty));
  if (!(qty > QTY_EPS)) throw new ActionError("Transfer quantity must be greater than zero.", "VALIDATION");
  if (input.fromLocationId === input.toLocationId) throw new ActionError("Choose two different locations.", "VALIDATION");
  const reason = input.reason?.trim() || null;
  const transferGroupId = crypto.randomUUID();

  const body = async (tx: Prisma.TransactionClient) => {
    const material = await loadStockMaterial(tx, input.materialId);
    const [from, to] = await Promise.all([loadLocation(tx, input.fromLocationId), loadLocation(tx, input.toLocationId)]);
    if (!from) throw new ActionError("Source location not found.", "VALIDATION");
    if (!to || !to.isActive) throw new ActionError("Destination location is not available.", "VALIDATION");
    const stockUnit = coerceStockUnit(material.stockUnit);

    // Source lots oldest-first (deterministic (receivedAt, id) tiebreak, matching the per-location FIFO index).
    const lots = await tx.supplyLot.findMany({
      where: { materialId: input.materialId, locationId: input.fromLocationId, qtyRemaining: { gt: 0 } },
      orderBy: [{ receivedAt: "asc" }, { id: "asc" }],
      select: {
        id: true, qtyRemaining: true, unitCost: true, currency: true, receivedAt: true, expiresAt: true,
        lotCode: true, vendorId: true, policyVersion: true, stockUnit: true,
        foreignUnitCost: true, foreignCurrency: true, fxRate: true, fxRateDate: true, fxRateSource: true,
      },
    });
    const have = round6(lots.reduce((s, l) => s + Number(l.qtyRemaining), 0));
    if (have + QTY_EPS < qty) {
      throw new ActionError(
        have <= QTY_EPS
          ? `There's no "${material.name}" at ${from.name} to transfer.`
          : `Not enough "${material.name}" at ${from.name}: only ${have} ${stockUnit} there, can't transfer ${qty}.`,
        "CONFLICT",
      );
    }

    let remaining = qty;
    let created = 0;
    for (const src of lots) {
      if (remaining <= QTY_EPS) break;
      const take = round6(Math.min(Number(src.qtyRemaining), remaining));
      if (!(await drawLotGuarded(tx, src.id, take))) {
        throw new ActionError(`The stock of "${material.name}" at ${from.name} just changed — try the transfer again.`, "CONFLICT");
      }
      // Destination lot inherits the source slice's cost/age/expiry/vendor/policy/FX; lineage via splitFromLotId.
      await tx.supplyLot.create({
        data: {
          materialId: input.materialId,
          qtyReceived: take,
          qtyRemaining: take,
          stockUnit: src.stockUnit,
          unitCost: src.unitCost,
          currency: src.currency,
          locationId: input.toLocationId,
          splitFromLotId: src.id,
          receivedAt: src.receivedAt,
          expiresAt: src.expiresAt,
          lotCode: src.lotCode,
          vendorId: src.vendorId,
          policyVersion: src.policyVersion,
          foreignUnitCost: src.foreignUnitCost,
          foreignCurrency: src.foreignCurrency,
          fxRate: src.fxRate,
          fxRateDate: src.fxRateDate,
          fxRateSource: src.fxRateSource,
          supplierNote: `Transferred from ${from.name}`,
        },
      });
      created += 1;
      remaining = round6(remaining - take);
    }

    // Two movement legs, one group: OUT at source (−qty), IN at destination (+qty).
    await writeMovement(tx, actor, { materialId: input.materialId, locationId: input.fromLocationId, kind: "TRANSFER", deltaQty: -qty, transferGroupId, reason });
    await writeMovement(tx, actor, { materialId: input.materialId, locationId: input.toLocationId, kind: "TRANSFER", deltaQty: qty, transferGroupId, reason });
    await writeAudit(tx, {
      ...actor,
      action: "STOCK_MOVEMENT",
      entityType: "CellarMaterial",
      entityId: input.materialId,
      summary: `Transferred ${qty} ${stockUnit} of "${material.name}" from ${from.name} to ${to.name} [grp ${transferGroupId.slice(0, 8)}]`,
    });
    return created;
  };

  const splitLots = injectedTx ? await body(injectedTx) : await withWriteRetry(() => runInTenantTx(body));
  return { transferGroupId, splitLots };
}
