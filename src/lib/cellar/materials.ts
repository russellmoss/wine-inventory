import { prisma } from "@/lib/prisma";
import { runInTenantTx } from "@/lib/tenant/tx";
import { writeAudit } from "@/lib/audit";
import { emitApExportForReceipt } from "@/lib/accounting/ap-emit";
import type { LedgerActor } from "@/lib/vessels/rack-core";
import type { MaterialKind, RateBasis } from "@/lib/cellar/additions-math";
import {
  cleanMaterialName,
  coerceMaterialKind,
  coerceRateBasis,
  normalizeMaterialKey,
} from "@/lib/cellar/material-normalize";
import { STOCK_UNITS, coerceStockUnit, type StockUnit, type CellarMaterialDTO } from "@/lib/cellar/materials-shared";
import { kindsForCategory, type MaterialCategory } from "@/lib/cellar/material-taxonomy";

// The client-safe DTO shape + stock-unit vocabulary live in materials-shared.ts (no server
// imports) so 'use client' components can use them without pulling prisma into the browser
// bundle. Re-exported here so existing server-side call sites keep importing from materials.ts.
export { STOCK_UNITS, coerceStockUnit };
export type { StockUnit, CellarMaterialDTO };

// Script-safe core for the light CellarMaterial catalog (Phase 3). No "use server", no
// server-only, so the addition/fining cores + verification scripts can upsert directly;
// actions.ts wraps the mutating path as a server action for the UI datalist. Mirrors
// fieldnotes/input-actions.ts: dedup by (kind, normalizedKey), audit only on first create.
// Cost + inventory are deferred to Phase 8 (D-scope) — this is name + basis only.

function toDTO(r: {
  id: string;
  name: string;
  kind: string;
  subcategory?: string | null;
  defaultBasis: string | null;
  percentActive: unknown;
}): CellarMaterialDTO {
  return {
    id: r.id,
    name: r.name,
    kind: r.kind as MaterialKind,
    subcategory: r.subcategory ?? null,
    defaultBasis: (r.defaultBasis as RateBasis | null) ?? null,
    percentActive: r.percentActive == null ? null : Number(r.percentActive),
  };
}

/** Trim a free-text subcategory to a stored value; blank → null (falls back to the built-in kind label). */
function normalizeSubcategory(raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  return s.length > 0 ? s : null;
}

/**
 * Active materials, ordered by name (optionally filtered by kind) — feeds the picker with per-material
 * on-hand stock (summed over open SupplyLots). One extra aggregate query keeps the picker signature
 * unchanged for every existing call site (bulk/ferment/en-tirage). Tenant scoping is automatic (RLS +
 * the Prisma extension) on both queries.
 */
export async function listMaterials(opts: { kind?: MaterialKind; category?: MaterialCategory; includeInactive?: boolean } = {}): Promise<CellarMaterialDTO[]> {
  // `category` filters to the set of kinds that make up that main category (derived, see material-taxonomy);
  // `kind` (if also given) narrows further. Both compose with the isActive filter.
  const categoryKinds = opts.category ? kindsForCategory(opts.category) : null;
  const rows = await prisma.cellarMaterial.findMany({
    where: {
      ...(opts.includeInactive ? {} : { isActive: true }),
      ...(opts.kind ? { kind: opts.kind } : {}),
      ...(categoryKinds ? { kind: { in: categoryKinds } } : {}),
    },
    orderBy: { name: "asc" },
    select: { id: true, name: true, kind: true, subcategory: true, defaultBasis: true, percentActive: true, isStockTracked: true, stockUnit: true, isActive: true },
  });
  const onHand = await prisma.supplyLot.groupBy({
    by: ["materialId"],
    where: { qtyRemaining: { gt: 0 } },
    _sum: { qtyRemaining: true },
  });
  const onHandByMaterial = new Map(onHand.map((g) => [g.materialId, Number(g._sum.qtyRemaining ?? 0)]));
  return rows.map((r) => ({
    ...toDTO(r),
    isStockTracked: r.isStockTracked,
    stockUnit: r.stockUnit,
    isActive: r.isActive,
    onHand: r.isStockTracked ? (onHandByMaterial.get(r.id) ?? 0) : null,
  }));
}

export type UpsertMaterialInput = {
  name: string;
  kind?: string;
  subcategory?: string | null;
  defaultBasis?: string | null;
  percentActive?: number | null;
};

/**
 * Upsert-on-first-use. Sanitizes to a display name + dedup key, then finds-or-creates on
 * (kind, normalizedKey). A dedup hit returns the canonical row (reactivating + backfilling
 * a missing defaultBasis), without re-auditing. Returns the canonical DTO either way.
 */
export async function upsertMaterialCore(
  actor: LedgerActor,
  input: UpsertMaterialInput,
): Promise<CellarMaterialDTO> {
  const name = cleanMaterialName(input.name); // throws on empty
  const normalizedKey = normalizeMaterialKey(input.name);
  const kind = coerceMaterialKind(input.kind);
  const subcategory = normalizeSubcategory(input.subcategory);
  const defaultBasis = coerceRateBasis(input.defaultBasis);
  const percentActive =
    input.percentActive == null || !Number.isFinite(input.percentActive) ? null : input.percentActive;

  const existing = await prisma.cellarMaterial.findFirst({
    where: { kind, normalizedKey },
    select: { id: true, name: true, kind: true, subcategory: true, defaultBasis: true, percentActive: true, isActive: true },
  });

  if (existing) {
    const patch: { isActive?: boolean; defaultBasis?: string; subcategory?: string } = {};
    if (!existing.isActive) patch.isActive = true;
    if (!existing.defaultBasis && defaultBasis) patch.defaultBasis = defaultBasis; // backfill a missing basis
    if (!existing.subcategory && subcategory) patch.subcategory = subcategory; // backfill a missing subcategory
    if (Object.keys(patch).length > 0) {
      const updated = await prisma.cellarMaterial.update({
        where: { id: existing.id },
        data: patch,
        select: { id: true, name: true, kind: true, subcategory: true, defaultBasis: true, percentActive: true },
      });
      return toDTO(updated);
    }
    return toDTO(existing);
  }

  const created = await runInTenantTx(async (tx) => {
    const row = await tx.cellarMaterial.create({
      data: { name, normalizedKey, kind, subcategory, defaultBasis, percentActive },
      select: { id: true, name: true, kind: true, subcategory: true, defaultBasis: true, percentActive: true },
    });
    await writeAudit(tx, {
      ...actor,
      action: "CREATE",
      entityType: "CellarMaterial",
      entityId: row.id,
      summary: `Added cellar material "${name}" (${kind.toLowerCase()})`,
    });
    return row;
  });
  return toDTO(created);
}

export type CreateStockMaterialInput = {
  name: string;
  kind?: string;
  subcategory?: string | null;
  defaultBasis?: string | null;
  percentActive?: number | null;
  stockUnit?: string | null;
  /** opening on-hand quantity in stockUnit; > 0 seeds a SupplyLot. Optional — physical tracking works without it. */
  openingQty?: number | null;
  /** per-stockUnit cost of the opening stock; null = unknown cost (D14). */
  unitCost?: number | null;
};

/**
 * Phase 8 (Unit 10): create (or reactivate) a STOCK-TRACKED material and, if an opening quantity is
 * given, seed a costed SupplyLot so on-hand + weighted-avg cost start populated. Sets isStockTracked so
 * future draw-downs deplete it (Unit 3). Cost/opening are optional — an untracked-cost material still
 * doses (D14). Stamps the SupplyLot with the tenant's current costing-policy version (D17).
 */
export async function createStockMaterialCore(
  actor: LedgerActor,
  input: CreateStockMaterialInput,
): Promise<CellarMaterialDTO> {
  const name = cleanMaterialName(input.name); // throws on empty
  const normalizedKey = normalizeMaterialKey(input.name);
  const kind = coerceMaterialKind(input.kind);
  const subcategory = normalizeSubcategory(input.subcategory);
  const defaultBasis = coerceRateBasis(input.defaultBasis);
  const percentActive =
    input.percentActive == null || !Number.isFinite(input.percentActive) ? null : input.percentActive;
  const stockUnit = coerceStockUnit(input.stockUnit);
  const openingQty =
    input.openingQty != null && Number.isFinite(input.openingQty) && input.openingQty > 0 ? input.openingQty : 0;
  const unitCost =
    input.unitCost != null && Number.isFinite(input.unitCost) && input.unitCost >= 0 ? input.unitCost : null;

  return runInTenantTx(async (tx) => {
    const existing = await tx.cellarMaterial.findFirst({
      where: { kind, normalizedKey },
      select: { id: true },
    });
    const material = existing
      ? await tx.cellarMaterial.update({
          where: { id: existing.id },
          data: { isActive: true, isStockTracked: true, stockUnit, ...(defaultBasis ? { defaultBasis } : {}), ...(percentActive != null ? { percentActive } : {}), ...(subcategory ? { subcategory } : {}) },
          select: { id: true, name: true, kind: true, subcategory: true, defaultBasis: true, percentActive: true },
        })
      : await tx.cellarMaterial.create({
          data: { name, normalizedKey, kind, subcategory, defaultBasis, percentActive, isStockTracked: true, stockUnit },
          select: { id: true, name: true, kind: true, subcategory: true, defaultBasis: true, percentActive: true },
        });

    if (!existing) {
      await writeAudit(tx, { ...actor, action: "CREATE", entityType: "CellarMaterial", entityId: material.id, summary: `Added stock material "${name}" (${kind.toLowerCase()})` });
    }

    if (openingQty > 0) {
      const settings = await tx.appSettings.findFirst({ select: { costingPolicyVersion: true } });
      const lot = await tx.supplyLot.create({
        data: { materialId: material.id, qtyReceived: openingQty, qtyRemaining: openingQty, stockUnit, unitCost, policyVersion: settings?.costingPolicyVersion ?? 1, supplierNote: "Opening stock" },
        select: { id: true },
      });
      await writeAudit(tx, { ...actor, action: "CREATE", entityType: "SupplyLot", entityId: lot.id, summary: `Opening stock ${openingQty} ${stockUnit} of "${name}"${unitCost != null ? ` @ ${unitCost}/${stockUnit}` : " (cost unknown)"}` });
    }

    return { ...toDTO(material), isStockTracked: true, stockUnit, onHand: openingQty };
  });
}

export type ReceiveSupplyInput = {
  materialId: string;
  qty: number;
  unitCost?: number | null;
  lotCode?: string | null;
  note?: string | null;
  // Phase 15 Unit 10 — optional A/P: a purchase-on-credit under a vendor becomes a QBO Bill.
  vendorName?: string | null;
  terms?: string | null; // e.g. "Net 30" — drives the Bill DueDate
};

/**
 * Phase 8 (Unit 12): receive a costed supply lot against an existing material — the restock path. Writes
 * a SupplyLot (qtyReceived == qtyRemaining) in the material's stock unit, stamped with the tenant's
 * current costing-policy version (D17). Marks the material stock-tracked if it wasn't. Null unit cost is
 * unknown-cost (D14), not $0.
 */
export async function receiveSupplyCore(actor: LedgerActor, input: ReceiveSupplyInput): Promise<{ supplyLotId: string }> {
  const qty = Number(input.qty);
  if (!Number.isFinite(qty) || qty <= 0) throw new Error("Received quantity must be greater than zero.");
  const unitCost = input.unitCost != null && Number.isFinite(input.unitCost) && input.unitCost >= 0 ? input.unitCost : null;

  return runInTenantTx(async (tx) => {
    const material = await tx.cellarMaterial.findUnique({ where: { id: input.materialId }, select: { id: true, name: true, stockUnit: true, isStockTracked: true } });
    if (!material) throw new Error("Material not found.");
    const stockUnit = coerceStockUnit(material.stockUnit);
    if (!material.isStockTracked || !material.stockUnit) {
      await tx.cellarMaterial.update({ where: { id: material.id }, data: { isStockTracked: true, stockUnit } });
    }
    const settings = await tx.appSettings.findFirst({ select: { costingPolicyVersion: true } });
    const lot = await tx.supplyLot.create({
      data: {
        materialId: material.id,
        qtyReceived: qty,
        qtyRemaining: qty,
        stockUnit,
        unitCost,
        policyVersion: settings?.costingPolicyVersion ?? 1,
        lotCode: input.lotCode?.trim() || null,
        supplierNote: input.note?.trim() || null,
      },
      select: { id: true },
    });
    await writeAudit(tx, { ...actor, action: "CREATE", entityType: "SupplyLot", entityId: lot.id, summary: `Received ${qty} ${stockUnit} of "${material.name}"${unitCost != null ? ` @ ${unitCost}/${stockUnit}` : " (cost unknown)"}` });
    // Phase 15 Unit 10 — transactional outbox: a purchase-on-credit emits an A/P Bill export + delivery
    // in THIS tx. No-op unless a vendor + A/P accounts + a known cost are all present.
    await emitApExportForReceipt(lot.id, { vendorName: input.vendorName, terms: input.terms }, tx);
    return { supplyLotId: lot.id };
  });
}

/** Phase 8 (Unit 12): activate/deactivate a supply in the catalog (history-safe — never a hard delete). */
export async function setMaterialActiveCore(actor: LedgerActor, materialId: string, isActive: boolean): Promise<void> {
  await runInTenantTx(async (tx) => {
    const m = await tx.cellarMaterial.findUnique({ where: { id: materialId }, select: { id: true, name: true } });
    if (!m) throw new Error("Material not found.");
    await tx.cellarMaterial.update({ where: { id: materialId }, data: { isActive } });
    await writeAudit(tx, { ...actor, action: "UPDATE", entityType: "CellarMaterial", entityId: materialId, summary: `${isActive ? "Reactivated" : "Deactivated"} supply "${m.name}"` });
  });
}
