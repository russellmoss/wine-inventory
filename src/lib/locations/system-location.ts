import type { Prisma } from "@prisma/client";

/**
 * Plan 080 U2: resolve the tenant's system "Winery" Location id inside a tx.
 *
 * Consumable SupplyLots now carry a locationId. Callers that don't specify one (invoice apply, restock,
 * opening stock — the pre-location-aware paths) default to the system location so every lot has a home.
 * Prefers the isSystem-flagged location; falls back to a "Winery" by name (some tenants predate the flag);
 * creates it if truly absent (a tenant seeded before the system-location convention). Must run inside a
 * tenant context (runInTenantTx / runAsTenant) — reads are RLS-scoped and tenantId auto-injects on create.
 */
export async function resolveSystemLocationId(tx: Prisma.TransactionClient): Promise<string> {
  const bySystem = await tx.location.findFirst({ where: { isSystem: true }, select: { id: true } });
  if (bySystem) return bySystem.id;
  const byName = await tx.location.findFirst({ where: { name: "Winery" }, select: { id: true } });
  if (byName) return byName.id;
  const created = await tx.location.create({
    data: { name: "Winery", isSystem: true, isActive: true },
    select: { id: true },
  });
  return created.id;
}
