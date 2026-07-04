import { prisma } from "@/lib/prisma";
import { runInTenantTx } from "@/lib/tenant/tx";
import { writeAudit } from "@/lib/audit";
import { emitApExportForReceipt } from "@/lib/accounting/ap-emit";
import type { LedgerActor } from "@/lib/vessels/rack-core";
import type { MaterialKind, RateBasis } from "@/lib/cellar/additions-math";
import {
  cleanMaterialName,
  coerceRateBasis,
  normalizeMaterialKey,
} from "@/lib/cellar/material-normalize";
import { STOCK_UNITS, coerceStockUnit, materialDisplayName, type StockUnit, type CellarMaterialDTO } from "@/lib/cellar/materials-shared";
import { coerceFamily, categoryOf, coerceMaterialCategory, type MaterialCategory } from "@/lib/cellar/material-taxonomy";
import { deriveOpeningLot } from "@/lib/cost/intake-cost";
import { coerceCurrency } from "@/lib/money/currency";

export { materialDisplayName };

// Phase 036: the columns every DTO read needs. One place so create/upsert/list stay in sync.
const MATERIAL_DTO_SELECT = {
  id: true, name: true, kind: true, subcategory: true, category: true,
  genericName: true, brand: true, brandName: true, preferGeneric: true,
  vendor: true, vendorUrl: true, packageAmount: true, packageUnit: true,
  defaultBasis: true, percentActive: true,
} as const;

/** Fields common to the intake inputs (upsert + create-stock). All optional; the display/purchase metadata. */
export type MaterialIntakeInput = {
  name?: string;
  genericName?: string | null;
  brand?: string | null;
  brandName?: string | null;
  preferGeneric?: boolean | null;
  kind?: string; // family
  category?: string | null; // stored main category; falls back to categoryOf(kind)
  subcategory?: string | null;
  defaultBasis?: string | null;
  percentActive?: number | null;
  vendor?: string | null;
  vendorUrl?: string | null;
  packageAmount?: number | null;
  packageUnit?: string | null;
};

// Trim + length-cap a free-text field server-side (never trust the client). 200 chars is generous for a
// product/brand/vendor label; capping matters because a runaway value would bloat rows (family feeds the
// unique index). Blank → null.
const trimOrNull = (v: unknown, max = 200): string | null => {
  const s = String(v ?? "").trim().slice(0, max);
  return s.length > 0 ? s : null;
};

/** Keep a vendor URL only if it's http(s); a bare domain gets https://; any other scheme (javascript:,
 * data:, …) is dropped — defense-in-depth in case it's ever rendered as an href. */
function normalizeVendorUrl(v: unknown): string | null {
  const s = trimOrNull(v, 300);
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) return s;
  if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return null; // some other scheme → reject
  return `https://${s}`.slice(0, 300); // bare domain → assume https
}

/** Resolve the persisted CellarMaterial fields from an intake input. `name` (identity/snapshot) derives from
 * brand name → generic name → the explicit `name`. Family + category are normalized (category stored, falling
 * back to the family's category). */
function deriveMaterialFields(input: MaterialIntakeInput) {
  const genericName = trimOrNull(input.genericName);
  const brand = trimOrNull(input.brand);
  const brandName = trimOrNull(input.brandName);
  const rawName = brandName ?? genericName ?? input.name ?? "";
  const name = cleanMaterialName(rawName); // throws on empty
  const normalizedKey = normalizeMaterialKey(rawName);
  const kind = coerceFamily(input.kind);
  const category = input.category != null ? coerceMaterialCategory(input.category) : categoryOf(kind);
  const packageAmount =
    input.packageAmount != null && Number.isFinite(input.packageAmount) && input.packageAmount > 0 ? input.packageAmount : null;
  return {
    name,
    normalizedKey,
    kind,
    category,
    genericName,
    brand,
    brandName,
    preferGeneric: !!input.preferGeneric,
    vendor: trimOrNull(input.vendor),
    vendorUrl: normalizeVendorUrl(input.vendorUrl),
    packageAmount,
    packageUnit: packageAmount != null ? trimOrNull(input.packageUnit) : null,
    subcategory: normalizeSubcategory(input.subcategory),
    defaultBasis: coerceRateBasis(input.defaultBasis),
    percentActive: input.percentActive == null || !Number.isFinite(input.percentActive) ? null : input.percentActive,
  };
}

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
  category?: string | null;
  genericName?: string | null;
  brand?: string | null;
  brandName?: string | null;
  preferGeneric?: boolean | null;
  vendor?: string | null;
  vendorUrl?: string | null;
  packageAmount?: unknown;
  packageUnit?: string | null;
  defaultBasis: string | null;
  percentActive: unknown;
}): CellarMaterialDTO {
  return {
    id: r.id,
    name: r.name,
    kind: r.kind as MaterialKind,
    subcategory: r.subcategory ?? null,
    category: r.category ?? categoryOf(r.kind), // fallback for legacy rows
    genericName: r.genericName ?? null,
    brand: r.brand ?? null,
    brandName: r.brandName ?? null,
    preferGeneric: !!r.preferGeneric,
    vendor: r.vendor ?? null,
    vendorUrl: r.vendorUrl ?? null,
    packageAmount: r.packageAmount == null ? null : Number(r.packageAmount),
    packageUnit: r.packageUnit ?? null,
    defaultBasis: (r.defaultBasis as RateBasis | null) ?? null,
    percentActive: r.percentActive == null ? null : Number(r.percentActive),
  };
}

/** Trim + length-cap a free-text subcategory to a stored value; blank → null (falls back to the built-in
 * kind label). The 80-char cap is server-side (not just the client input) so a huge paste can't bloat the
 * TEXT column or degrade the picker's chip render. */
function normalizeSubcategory(raw: unknown): string | null {
  const s = String(raw ?? "").trim().slice(0, 80).trimEnd();
  return s.length > 0 ? s : null;
}

/**
 * Active materials, ordered by name (optionally filtered by kind) — feeds the picker with per-material
 * on-hand stock (summed over open SupplyLots). One extra aggregate query keeps the picker signature
 * unchanged for every existing call site (bulk/ferment/en-tirage). Tenant scoping is automatic (RLS +
 * the Prisma extension) on both queries.
 */
export async function listMaterials(opts: { kind?: MaterialKind; category?: MaterialCategory; includeInactive?: boolean } = {}): Promise<CellarMaterialDTO[]> {
  // Phase 036: `category` is now a STORED column (covers user-invented families), `kind` filters the family.
  // They compose on different columns, so no clobber.
  const rows = await prisma.cellarMaterial.findMany({
    where: {
      ...(opts.includeInactive ? {} : { isActive: true }),
      ...(opts.kind ? { kind: opts.kind } : {}),
      ...(opts.category ? { category: opts.category } : {}),
    },
    orderBy: { name: "asc" },
    select: { ...MATERIAL_DTO_SELECT, isStockTracked: true, stockUnit: true, isActive: true },
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

export type UpsertMaterialInput = MaterialIntakeInput;

/**
 * Upsert-on-first-use. Sanitizes to a display name + dedup key, then finds-or-creates on
 * (kind, normalizedKey). A dedup hit returns the canonical row (reactivating + backfilling
 * a missing defaultBasis), without re-auditing. Returns the canonical DTO either way.
 */
export async function upsertMaterialCore(
  actor: LedgerActor,
  input: UpsertMaterialInput,
): Promise<CellarMaterialDTO> {
  const f = deriveMaterialFields(input);

  const existing = await prisma.cellarMaterial.findFirst({
    where: { kind: f.kind, normalizedKey: f.normalizedKey },
    select: { ...MATERIAL_DTO_SELECT, isActive: true },
  });

  if (existing) {
    const patch: { isActive?: boolean; defaultBasis?: string; subcategory?: string; category?: string } = {};
    if (!existing.isActive) patch.isActive = true;
    if (!existing.defaultBasis && f.defaultBasis) patch.defaultBasis = f.defaultBasis; // backfill a missing basis
    if (!existing.subcategory && f.subcategory) patch.subcategory = f.subcategory; // backfill a missing subcategory
    if (!existing.category) patch.category = f.category; // backfill a missing stored category
    if (Object.keys(patch).length > 0) {
      const updated = await prisma.cellarMaterial.update({
        where: { id: existing.id },
        data: patch,
        select: MATERIAL_DTO_SELECT,
      });
      return toDTO(updated);
    }
    return toDTO(existing);
  }

  const created = await runInTenantTx(async (tx) => {
    const row = await tx.cellarMaterial.create({
      data: {
        name: f.name, normalizedKey: f.normalizedKey, kind: f.kind, category: f.category,
        subcategory: f.subcategory, defaultBasis: f.defaultBasis, percentActive: f.percentActive,
        genericName: f.genericName, brand: f.brand, brandName: f.brandName, preferGeneric: f.preferGeneric,
        vendor: f.vendor, vendorUrl: f.vendorUrl, packageAmount: f.packageAmount, packageUnit: f.packageUnit,
      },
      select: MATERIAL_DTO_SELECT,
    });
    await writeAudit(tx, {
      ...actor,
      action: "CREATE",
      entityType: "CellarMaterial",
      entityId: row.id,
      summary: `Added cellar material "${f.name}" (${f.kind.toLowerCase()})`,
    });
    return row;
  });
  return toDTO(created);
}

export type CreateStockMaterialInput = MaterialIntakeInput & {
  stockUnit?: string | null;
  /** opening on-hand quantity in stockUnit; > 0 seeds a SupplyLot. Optional — physical tracking works without it. */
  openingQty?: number | null;
  /** per-stockUnit cost of the opening stock; null = unknown cost (D14). */
  unitCost?: number | null;
  /** Phase 036 intake: total price paid for the package. With packageAmount+packageUnit it derives the
   * opening lot (qty in stockUnit + per-stockUnit unitCost) via deriveOpeningLot — overrides openingQty/unitCost. */
  totalCost?: number | null;
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
  const f = deriveMaterialFields(input);
  const stockUnit = coerceStockUnit(input.stockUnit);
  let openingQty =
    input.openingQty != null && Number.isFinite(input.openingQty) && input.openingQty > 0 ? input.openingQty : 0;
  let unitCost =
    input.unitCost != null && Number.isFinite(input.unitCost) && input.unitCost >= 0 ? input.unitCost : null;
  // Phase 036: a package (amount+unit) seeds the opening lot in the canonical stock unit; total cost (when
  // given) sets the per-stock-unit cost, else the lot is UNKNOWN-cost (D14) — never $0, and never a package
  // with no on-hand. Overrides the raw openingQty/unitCost when it resolves.
  if (f.packageAmount != null && f.packageUnit) {
    const derived = deriveOpeningLot({ packageAmount: f.packageAmount, packageUnit: f.packageUnit, totalCost: input.totalCost ?? null, stockUnit });
    if (derived.qtyInStockUnit != null && derived.qtyInStockUnit > 0) {
      openingQty = derived.qtyInStockUnit;
      unitCost = derived.unitCost; // null when no cost given → UNKNOWN (D14), which is correct
    }
  }

  return runInTenantTx(async (tx) => {
    const existing = await tx.cellarMaterial.findFirst({
      where: { kind: f.kind, normalizedKey: f.normalizedKey },
      select: { id: true },
    });
    // The rich-intake path sets the display/purchase metadata on both create and reactivate-update.
    const richData = {
      category: f.category, genericName: f.genericName, brand: f.brand, brandName: f.brandName,
      preferGeneric: f.preferGeneric, vendor: f.vendor, vendorUrl: f.vendorUrl,
      packageAmount: f.packageAmount, packageUnit: f.packageUnit, subcategory: f.subcategory,
      ...(f.defaultBasis ? { defaultBasis: f.defaultBasis } : {}),
      ...(f.percentActive != null ? { percentActive: f.percentActive } : {}),
    };
    const material = existing
      ? await tx.cellarMaterial.update({
          where: { id: existing.id },
          data: { isActive: true, isStockTracked: true, stockUnit, ...richData },
          select: MATERIAL_DTO_SELECT,
        })
      : await tx.cellarMaterial.create({
          data: { name: f.name, normalizedKey: f.normalizedKey, kind: f.kind, isStockTracked: true, stockUnit, ...richData },
          select: MATERIAL_DTO_SELECT,
        });

    if (!existing) {
      await writeAudit(tx, { ...actor, action: "CREATE", entityType: "CellarMaterial", entityId: material.id, summary: `Added stock material "${f.name}" (${f.kind.toLowerCase()})` });
    }

    if (openingQty > 0) {
      const settings = await tx.appSettings.findFirst({ select: { costingPolicyVersion: true, currency: true } });
      const lot = await tx.supplyLot.create({
        data: { materialId: material.id, qtyReceived: openingQty, qtyRemaining: openingQty, stockUnit, unitCost, currency: coerceCurrency(settings?.currency), policyVersion: settings?.costingPolicyVersion ?? 1, supplierNote: "Opening stock" },
        select: { id: true },
      });
      await writeAudit(tx, { ...actor, action: "CREATE", entityType: "SupplyLot", entityId: lot.id, summary: `Opening stock ${openingQty} ${stockUnit} of "${f.name}"${unitCost != null ? ` @ ${unitCost}/${stockUnit}` : " (cost unknown)"}` });
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
    const settings = await tx.appSettings.findFirst({ select: { costingPolicyVersion: true, currency: true } });
    const lot = await tx.supplyLot.create({
      data: {
        materialId: material.id,
        qtyReceived: qty,
        qtyRemaining: qty,
        stockUnit,
        unitCost,
        currency: coerceCurrency(settings?.currency),
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
