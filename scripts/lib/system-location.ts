import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { resolveSystemLocationId } from "@/lib/locations/system-location";

/**
 * Resolve the tenant's system Location id for a verify/seed script.
 *
 * Plan 080 U1 made `SupplyLot.locationId` NOT NULL, which broke every script that seeds a supply lot —
 * they all died at fixture setup with "Null constraint violation on the fields: (locationId)".
 *
 * `resolveSystemLocationId` is the production helper for exactly this (it defaults the pre-location-aware
 * callers), but it is typed for `Prisma.TransactionClient`, and scripts hold the tenant-EXTENDED client.
 * The two are structurally compatible for the two calls the helper makes but not assignable, so the cast
 * lives here once instead of being copy-pasted into a dozen scripts.
 *
 * Must run inside a tenant context (runAsTenant / runInTenantTx): the reads are RLS-scoped and tenantId
 * auto-injects on create. Pass `db` when the caller holds a scoped client (e.g. asTenant(...)).
 */
export function systemLocationId(db: unknown = prisma): Promise<string> {
  return resolveSystemLocationId(db as Prisma.TransactionClient);
}
