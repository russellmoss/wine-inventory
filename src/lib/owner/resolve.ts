import type { Prisma } from "@prisma/client";

// Plan 093 Unit 4b: resolve the ORIGINATING owner of a NEW lot from its parent/source lots. The single
// place the "which owner does a derived lot get" rule lives, so the 8 lot.create sites stay consistent.

/**
 * The originating owner id for a new lot, read from its parents' CURRENT ownerId column — NEVER lineage
 * (re-deriving from ancestors would resurrect a pre-CHANGE_OWNERSHIP owner; eng-review P1). Scalar:
 * - 0 parents carrying an owner (all Estate / NULL) → NULL (facility).
 * - exactly 1 distinct owner → that owner.
 * - >1 distinct owner → only reachable once Unit 6 relaxes the cross-owner combine refusal (today the
 *   combine guard blocks a mixed-owner blend upstream). Returns a deterministic pick for now; Unit 6
 *   replaces this with the volume-weighted DOMINANT owner + a BILLABLE_WINE_CONSUMED for the minority.
 */
export async function resolveOriginatingOwnerId(tx: Prisma.TransactionClient, parentLotIds: (string | null | undefined)[]): Promise<string | null> {
  const ids = [...new Set(parentLotIds.filter((x): x is string => !!x))];
  if (ids.length === 0) return null;
  const rows = await tx.lot.findMany({ where: { id: { in: ids } }, select: { ownerId: true } });
  const owners = [...new Set(rows.map((r) => r.ownerId).filter((x): x is string => x != null))];
  if (owners.length <= 1) return owners[0] ?? null;
  return [...owners].sort()[0];
}
