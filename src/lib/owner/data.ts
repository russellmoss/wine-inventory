import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

// Plan 093 (custom-crush data foundation), Unit 1: the read/pure layer for the first-class `Owner`.
// SCALAR ownership — a lot has AT MOST one Owner. Facility's own wine carries NO Owner (ownerId NULL),
// which is the load-bearing convention behind the cost predicate + the verify: a NULL owner on a LOT
// means "Estate (facility)", NOT "unknown". (An unresolved intake LINE is a different thing — Unit 9's
// `needsOwnerAssignment` — and must never be labelled "Estate".)

export type OwnerKind = "CUSTOM_CRUSH_CLIENT" | "AP_PROPRIETOR";

export type OwnerRow = {
  id: string;
  name: string;
  kind: OwnerKind;
  isActive: boolean;
};

const OWNER_SELECT = { id: true, name: true, kind: true, isActive: true } as const;

function toRow(r: { id: string; name: string; kind: string; isActive: boolean }): OwnerRow {
  return { id: r.id, name: r.name, kind: r.kind as OwnerKind, isActive: r.isActive };
}

/**
 * The SINGLE definition of how an owner renders in any human-facing surface — the assistant confirm
 * cards (Unit 12), the verify script (Unit 11), and every future GUI cell (plan 092). A NULL owner is
 * the facility's own wine and must NEVER surface as a blank/"unknown" column. Defining it once means the
 * confirm card and the client-facing home can't drift on the label. (Design review, 2026-07-23.)
 */
export function ownerLabel(owner: Pick<OwnerRow, "name"> | null | undefined): string {
  return owner?.name ?? "Estate (facility)";
}

/**
 * The billability signal, resolved from the Owner (replacing the old `ownership === "CUSTOM_CRUSH_CLIENT"`
 * enum predicate at cost/data.ts). A NULL owner = facility = NOT billed back (its cost capitalizes into
 * facility inventory). A custom-crush client's direct cost is billed back, not capitalized. AP proprietor
 * billability is a follow-on (its cost scope is not in this foundation) — kept literal to the pre-migration
 * answer so `verify:owner-model` sees identical results (Open Q3). This is the ONE place to change it.
 */
export function isBillableOwner(owner: Pick<OwnerRow, "kind"> | null | undefined): boolean {
  return owner?.kind === "CUSTOM_CRUSH_CLIENT";
}

/** List the current tenant's owners (name-sorted). Reads via the extended `prisma` (tenant resolved from
 *  the session) so it works in a server-component render with no ALS context — mirrors listCustomUnitsCore. */
export async function listOwnersCore(injectedTx?: Prisma.TransactionClient): Promise<OwnerRow[]> {
  const rows = injectedTx
    ? await injectedTx.owner.findMany({ orderBy: { name: "asc" }, select: OWNER_SELECT })
    : await prisma.owner.findMany({ orderBy: { name: "asc" }, select: OWNER_SELECT });
  return rows.map(toRow);
}

/** Resolve a single owner by id (tenant-scoped via the extension). Returns null for a missing id OR a
 *  NULL/absent ownerId — callers treat null as "Estate (facility)" via `ownerLabel`. */
export async function getOwnerCore(ownerId: string | null | undefined, injectedTx?: Prisma.TransactionClient): Promise<OwnerRow | null> {
  if (!ownerId) return null;
  // Branch the call rather than unioning `injectedTx ?? prisma` into one var — the extended client's type
  // is too deep to union with TransactionClient (tsc "excessive stack depth"). Mirrors listOwnersCore.
  const row = injectedTx
    ? await injectedTx.owner.findUnique({ where: { id: ownerId }, select: OWNER_SELECT })
    : await prisma.owner.findUnique({ where: { id: ownerId }, select: OWNER_SELECT });
  return row ? toRow(row) : null;
}
