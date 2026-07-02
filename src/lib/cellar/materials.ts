import { prisma } from "@/lib/prisma";
import { runInTenantTx } from "@/lib/tenant/tx";
import { writeAudit } from "@/lib/audit";
import type { LedgerActor } from "@/lib/vessels/rack-core";
import type { MaterialKind, RateBasis } from "@/lib/cellar/additions-math";
import {
  cleanMaterialName,
  coerceMaterialKind,
  coerceRateBasis,
  normalizeMaterialKey,
} from "@/lib/cellar/material-normalize";

// Script-safe core for the light CellarMaterial catalog (Phase 3). No "use server", no
// server-only, so the addition/fining cores + verification scripts can upsert directly;
// actions.ts wraps the mutating path as a server action for the UI datalist. Mirrors
// fieldnotes/input-actions.ts: dedup by (kind, normalizedKey), audit only on first create.
// Cost + inventory are deferred to Phase 8 (D-scope) — this is name + basis only.

export type CellarMaterialDTO = {
  id: string;
  name: string;
  kind: MaterialKind;
  defaultBasis: RateBasis | null;
  percentActive: number | null;
  // Phase 8 (Unit 10): stock awareness for the picker. `isStockTracked` opts the material into
  // draw-down; `onHand` is the summed remaining stock across its open SupplyLots (null when
  // untracked); `stockUnit` is the unit that on-hand is held in. Optional so pre-Phase-8 consumers
  // that don't render the picker are unaffected.
  isStockTracked?: boolean;
  onHand?: number | null;
  stockUnit?: string | null;
};

function toDTO(r: {
  id: string;
  name: string;
  kind: string;
  defaultBasis: string | null;
  percentActive: unknown;
}): CellarMaterialDTO {
  return {
    id: r.id,
    name: r.name,
    kind: r.kind as MaterialKind,
    defaultBasis: (r.defaultBasis as RateBasis | null) ?? null,
    percentActive: r.percentActive == null ? null : Number(r.percentActive),
  };
}

/**
 * Active materials, ordered by name (optionally filtered by kind) — feeds the picker with per-material
 * on-hand stock (summed over open SupplyLots). One extra aggregate query keeps the picker signature
 * unchanged for every existing call site (bulk/ferment/en-tirage). Tenant scoping is automatic (RLS +
 * the Prisma extension) on both queries.
 */
export async function listMaterials(opts: { kind?: MaterialKind } = {}): Promise<CellarMaterialDTO[]> {
  const rows = await prisma.cellarMaterial.findMany({
    where: { isActive: true, ...(opts.kind ? { kind: opts.kind } : {}) },
    orderBy: { name: "asc" },
    select: { id: true, name: true, kind: true, defaultBasis: true, percentActive: true, isStockTracked: true, stockUnit: true },
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
    onHand: r.isStockTracked ? (onHandByMaterial.get(r.id) ?? 0) : null,
  }));
}

export type UpsertMaterialInput = {
  name: string;
  kind?: string;
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
  const defaultBasis = coerceRateBasis(input.defaultBasis);
  const percentActive =
    input.percentActive == null || !Number.isFinite(input.percentActive) ? null : input.percentActive;

  const existing = await prisma.cellarMaterial.findFirst({
    where: { kind, normalizedKey },
    select: { id: true, name: true, kind: true, defaultBasis: true, percentActive: true, isActive: true },
  });

  if (existing) {
    const patch: { isActive?: boolean; defaultBasis?: string } = {};
    if (!existing.isActive) patch.isActive = true;
    if (!existing.defaultBasis && defaultBasis) patch.defaultBasis = defaultBasis; // backfill a missing basis
    if (Object.keys(patch).length > 0) {
      const updated = await prisma.cellarMaterial.update({
        where: { id: existing.id },
        data: patch,
        select: { id: true, name: true, kind: true, defaultBasis: true, percentActive: true },
      });
      return toDTO(updated);
    }
    return toDTO(existing);
  }

  const created = await runInTenantTx(async (tx) => {
    const row = await tx.cellarMaterial.create({
      data: { name, normalizedKey, kind, defaultBasis, percentActive },
      select: { id: true, name: true, kind: true, defaultBasis: true, percentActive: true },
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

// Phase 8 (Unit 10): canonical stock units a material's on-hand is held/consumed in.
export const STOCK_UNITS = ["g", "mg", "kg", "mL", "L", "unit"] as const;
export type StockUnit = (typeof STOCK_UNITS)[number];
export function coerceStockUnit(u: string | null | undefined): StockUnit {
  return (STOCK_UNITS as readonly string[]).includes((u ?? "").trim()) ? ((u as string).trim() as StockUnit) : "g";
}

export type CreateStockMaterialInput = {
  name: string;
  kind?: string;
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
          data: { isActive: true, isStockTracked: true, stockUnit, ...(defaultBasis ? { defaultBasis } : {}), ...(percentActive != null ? { percentActive } : {}) },
          select: { id: true, name: true, kind: true, defaultBasis: true, percentActive: true },
        })
      : await tx.cellarMaterial.create({
          data: { name, normalizedKey, kind, defaultBasis, percentActive, isStockTracked: true, stockUnit },
          select: { id: true, name: true, kind: true, defaultBasis: true, percentActive: true },
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
