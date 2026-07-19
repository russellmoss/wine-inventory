import type { Prisma } from "@prisma/client";
import { runInTenantTx } from "@/lib/tenant/tx";
import { requireTenantId } from "@/lib/tenant/context";
import { ActionError } from "@/lib/action-error";
import { writeAudit } from "@/lib/audit";
import { findOrCreateVendorCore } from "@/lib/vendors/vendors";
import { coerceCurrency } from "@/lib/money/currency";
import type { LedgerActor } from "@/lib/vessels/rack-core";
import { EQUIPMENT_KINDS, EQUIPMENT_STATUSES, type EquipmentKind, type EquipmentStatus } from "@/lib/equipment/vocab";

// Plan 080 U3 — COSTED equipment intake. An EquipmentAsset can now carry its acquisition cost, purchase date,
// managed vendor and foreign-invoice provenance, so an equipment purchase reaches the books the way a
// consumable purchase already does. Two rules this file exists to keep:
//   • COST-4 — `purchaseCostBase` is ALWAYS the tenant BASE currency (the roll-up basis). A foreign invoice is
//     converted UPSTREAM and its original figures are stamped in the immutable foreign quintet (audit only).
//   • WORKORDER-7 — a capitalized asset is a FIXED ASSET, never a dosable material. Nothing here touches
//     SupplyLot; EQUIPMENT stays non-doseable. Quantity-tracked *parts* remain CellarMaterial (EQUIPMENT
//     category) and flow through the consumable path instead.
// NO A/P is emitted here: asset acquisition posts through the SAME aggregate `emitApExportForInvoice` bill as
// every other invoice line (AP-1), wired in Unit 5 — never a bespoke per-asset emit.

export function normalizeEquipmentKind(v: unknown): EquipmentKind {
  if (typeof v === "string" && (EQUIPMENT_KINDS as readonly string[]).includes(v)) return v as EquipmentKind;
  throw new ActionError(`Invalid equipment kind "${String(v)}" (allowed: ${EQUIPMENT_KINDS.join(", ")}).`);
}

export function normalizeEquipmentStatus(v: unknown): EquipmentStatus {
  if (v == null || v === "") return "available";
  if (typeof v === "string" && (EQUIPMENT_STATUSES as readonly string[]).includes(v)) return v as EquipmentStatus;
  throw new ActionError(`Invalid equipment status "${String(v)}" (allowed: ${EQUIPMENT_STATUSES.join(", ")}).`);
}

/** A non-negative finite money amount, else null (unknown cost — D14/COST-2, never a silent $0). */
function money(v: number | null | undefined): number | null {
  return v != null && Number.isFinite(v) && v >= 0 ? v : null;
}

export type EquipmentCostInput = {
  /** acquisition cost in the tenant BASE currency (COST-4). null/omitted = uncosted asset (still valid). */
  purchaseCostBase?: number | null;
  purchaseDate?: Date | null;
  /** the managed vendor (source of truth). Wins over `vendorName`. */
  vendorId?: string | null;
  /** free-text vendor — find-or-creates the managed vendor so assets link to the same row invoices do. */
  vendorName?: string | null;
  // Immutable foreign-invoice provenance (all null for a base-currency purchase).
  foreignPurchaseCost?: number | null;
  foreignCurrency?: string | null;
  fxRate?: number | null;
  fxRateDate?: Date | null;
  fxRateSource?: string | null;
};

export type CreateEquipmentAssetInput = {
  name: string;
  kind: string;
  status?: string | null;
  locationId?: string | null;
  notes?: string | null;
} & EquipmentCostInput;

/** Resolve the managed vendor for the asset stamp. A vendorId is authoritative; a bare name find-or-creates. */
async function resolveVendorId(tx: Prisma.TransactionClient, input: EquipmentCostInput): Promise<string | null> {
  if (input.vendorId) {
    const v = await tx.vendor.findUnique({ where: { id: input.vendorId }, select: { id: true } });
    if (!v) throw new ActionError("That vendor no longer exists.", "VALIDATION");
    return v.id;
  }
  const name = input.vendorName?.trim();
  if (!name) return null;
  const v = await findOrCreateVendorCore({ name }, tx);
  return v?.id ?? null;
}

function costData(input: EquipmentCostInput, baseCurrency: string | null | undefined) {
  const purchaseCostBase = money(input.purchaseCostBase);
  return {
    purchaseCostBase,
    // Only stamp a currency when there IS a cost — an uncosted asset shouldn't claim a currency.
    currency: purchaseCostBase != null ? coerceCurrency(baseCurrency) : null,
    foreignPurchaseCost: money(input.foreignPurchaseCost),
    foreignCurrency: input.foreignCurrency?.trim() ? coerceCurrency(input.foreignCurrency) : null,
    fxRate: input.fxRate != null && Number.isFinite(input.fxRate) && input.fxRate > 0 ? input.fxRate : null,
    fxRateDate: input.fxRateDate ?? null,
    fxRateSource: input.fxRateSource?.trim() || null,
    purchaseDate: input.purchaseDate ?? null,
  };
}

/**
 * Create ONE equipment asset, optionally costed. `injectedTx` lets a multi-line invoice apply run every line
 * in the SAME transaction (Unit 5) instead of opening its own.
 */
export async function createEquipmentAssetCore(
  actor: LedgerActor,
  input: CreateEquipmentAssetInput,
  injectedTx?: Prisma.TransactionClient,
): Promise<{ id: string }> {
  const name = input.name?.trim();
  if (!name) throw new ActionError("Equipment needs a name.");
  const kind = normalizeEquipmentKind(input.kind);
  const status = normalizeEquipmentStatus(input.status);

  const body = async (tx: Prisma.TransactionClient) => {
    const tenantId = requireTenantId();
    const settings = await tx.appSettings.findFirst({ select: { currency: true } });
    const vendorId = await resolveVendorId(tx, input);
    const cost = costData(input, settings?.currency);
    const row = await tx.equipmentAsset.create({
      data: {
        tenantId,
        name,
        kind,
        status,
        locationId: input.locationId || null,
        notes: input.notes?.trim() || null,
        vendorId,
        ...cost,
      },
      select: { id: true },
    });
    await writeAudit(tx, {
      ...actor,
      action: "CREATE",
      entityType: "EquipmentAsset",
      entityId: row.id,
      summary:
        cost.purchaseCostBase != null
          ? `Added equipment ${name} @ ${cost.purchaseCostBase} ${cost.currency}`
          : `Added equipment ${name}`,
    });
    return { id: row.id };
  };

  try {
    return injectedTx ? await body(injectedTx) : await runInTenantTx(body);
  } catch (e) {
    if (e && typeof e === "object" && (e as { code?: string }).code === "P2002") {
      throw new ActionError(`Equipment "${name}" already exists.`, "CONFLICT");
    }
    throw e;
  }
}

/**
 * Pick `count` free asset names for a qty>1 invoice line. `EquipmentAsset` is unique on (tenantId, name), so
 * buying two identical pumps on one invoice CANNOT create two rows called "Pump" — each unit gets its own
 * numbered identity ("Pump #1", "Pump #2"), skipping any number already taken.
 */
async function reserveAssetNames(tx: Prisma.TransactionClient, base: string, count: number): Promise<string[]> {
  if (count === 1) return [base];
  const taken = new Set(
    (await tx.equipmentAsset.findMany({ where: { name: { startsWith: base } }, select: { name: true } })).map((r) => r.name),
  );
  const names: string[] = [];
  let n = 1;
  while (names.length < count) {
    const candidate = `${base} #${n}`;
    if (!taken.has(candidate)) {
      names.push(candidate);
      taken.add(candidate);
    }
    n += 1;
    if (n > count + taken.size + 1000) throw new ActionError(`Couldn't name ${count} new "${base}" assets — rename the existing ones.`, "CONFLICT");
  }
  return names;
}

export type CreateEquipmentAssetsFromInvoiceInput = CreateEquipmentAssetInput & {
  /** units bought on this invoice line. qty > 1 → N individually-tracked assets (council C5). */
  quantity: number;
  /** total BASE-currency cost of the whole line; split per unit. Overrides `purchaseCostBase` when given. */
  lineTotalBase?: number | null;
};

/**
 * Create N individually-tracked assets from ONE costed invoice line (council C5 — a single FK can't represent
 * N assets, so Unit 5 links them through a join table using the ids returned here).
 *
 * Per-unit cost is the line total split evenly with the **rounding residual pushed onto the LAST unit**, so
 * Σ(created asset costs) == the line total EXACTLY (council C7) and the aggregate bill reconciles to the cent.
 * Always runs in the caller's transaction — an invoice apply is all-or-nothing.
 */
export async function createEquipmentAssetsFromInvoiceCore(
  actor: LedgerActor,
  input: CreateEquipmentAssetsFromInvoiceInput,
  tx: Prisma.TransactionClient,
): Promise<{ ids: string[]; unitCosts: (number | null)[] }> {
  const quantity = Math.trunc(Number(input.quantity));
  if (!Number.isFinite(quantity) || quantity < 1) throw new ActionError("Equipment quantity must be a whole number of at least 1.", "VALIDATION");

  const lineTotal = money(input.lineTotalBase) ?? (money(input.purchaseCostBase) != null ? money(input.purchaseCostBase)! * quantity : null);
  // Split evenly at 8dp (the Decimal scale money is held at), residual onto the last unit → exact Σ.
  const unitCosts: (number | null)[] = [];
  if (lineTotal == null) {
    unitCosts.push(...Array<number | null>(quantity).fill(null)); // uncosted line stays uncosted (never $0)
  } else {
    const per = Math.floor((lineTotal / quantity) * 1e8) / 1e8;
    let allocated = 0;
    for (let i = 0; i < quantity - 1; i++) {
      unitCosts.push(per);
      allocated = Math.round((allocated + per) * 1e8) / 1e8;
    }
    unitCosts.push(Math.round((lineTotal - allocated) * 1e8) / 1e8);
  }

  const base = input.name?.trim();
  if (!base) throw new ActionError("Equipment needs a name.");
  const names = await reserveAssetNames(tx, base, quantity);

  const ids: string[] = [];
  for (let i = 0; i < quantity; i++) {
    const { id } = await createEquipmentAssetCore(actor, { ...input, name: names[i], purchaseCostBase: unitCosts[i] }, tx);
    ids.push(id);
  }
  return { ids, unitCosts };
}
