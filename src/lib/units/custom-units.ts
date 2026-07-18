import type { Prisma } from "@prisma/client";
import type { ExtraUnits } from "@/lib/units/measure";

// Plan 075: bridge the per-tenant CustomUnit rows into the pure unit engine's ExtraUnits shape. Split into a
// PURE mapper (unit-tested) and a thin tx-bound loader. The loader takes an IN-HAND tx (cost cores are
// tx-bound and never open a side connection) + an explicit tenantId (K12: never read the ALS tenant here).

/** A CustomUnit row as this bridge needs it (perCanonical arrives as a Prisma.Decimal → coerced to number). */
type CustomUnitRow = { normalizedName: string; dimension: string; perCanonical: Prisma.Decimal | number | string };

/**
 * Map CustomUnit rows → ExtraUnits keyed by lowercased normalizedName. Defensive: a row with a malformed
 * dimension or a non-positive/non-finite factor is SKIPPED (it degrades to UNKNOWN cost downstream, never a
 * fabricated conversion). The create core validates these up front, so a skip here means corrupted data.
 */
export function toExtraUnits(rows: readonly CustomUnitRow[]): ExtraUnits {
  const out: ExtraUnits = {};
  for (const r of rows) {
    const dim = r.dimension;
    if (dim !== "mass" && dim !== "volume" && dim !== "count") continue;
    const per = Number(r.perCanonical);
    if (!Number.isFinite(per) || per <= 0) continue;
    out[r.normalizedName.trim().toLowerCase()] = { dimension: dim, perCanonical: per };
  }
  return out;
}

/**
 * Load a tenant's custom units from an in-hand transaction. RLS + the tenant extension already scope reads,
 * but we pass `tenantId` explicitly so this is correct under runAsSystem too and never depends on ALS state.
 */
export async function loadCustomUnits(tx: Prisma.TransactionClient, tenantId: string): Promise<ExtraUnits> {
  const rows = await tx.customUnit.findMany({
    where: { tenantId },
    select: { normalizedName: true, dimension: true, perCanonical: true },
  });
  return toExtraUnits(rows);
}
