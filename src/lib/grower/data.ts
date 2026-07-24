import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

// Plan 093 Unit 8: the read/pure layer for the first-class Grower — the party that FARMED the fruit
// (distinct from Owner, who OWNS the wine). Replaces the free-text VineyardDetail.manager (kept as legacy).

export type GrowerRow = {
  id: string;
  name: string;
  company: string | null;
  contact: string | null;
  isEstate: boolean;
  isActive: boolean;
};

const GROWER_SELECT = { id: true, name: true, company: true, contact: true, isEstate: true, isActive: true } as const;

function toRow(r: { id: string; name: string; company: string | null; contact: string | null; isEstate: boolean; isActive: boolean }): GrowerRow {
  return { id: r.id, name: r.name, company: r.company, contact: r.contact, isEstate: r.isEstate, isActive: r.isActive };
}

/** How a grower renders in any human-facing surface. A NULL grower is unassigned (not "estate" — estate is
 *  a real Grower flagged isEstate). Never surfaces blank. */
export function growerLabel(grower: Pick<GrowerRow, "name"> | null | undefined): string {
  return grower?.name ?? "Unassigned grower";
}

/** List the current tenant's growers (name-sorted). Reads via the extended `prisma` (session tenant). */
export async function listGrowersCore(injectedTx?: Prisma.TransactionClient): Promise<GrowerRow[]> {
  const rows = injectedTx
    ? await injectedTx.grower.findMany({ orderBy: { name: "asc" }, select: GROWER_SELECT })
    : await prisma.grower.findMany({ orderBy: { name: "asc" }, select: GROWER_SELECT });
  return rows.map(toRow);
}

/** Resolve a single grower by id (tenant-scoped). Null for a missing/absent id. */
export async function getGrowerCore(growerId: string | null | undefined, injectedTx?: Prisma.TransactionClient): Promise<GrowerRow | null> {
  if (!growerId) return null;
  const row = injectedTx
    ? await injectedTx.grower.findUnique({ where: { id: growerId }, select: GROWER_SELECT })
    : await prisma.grower.findUnique({ where: { id: growerId }, select: GROWER_SELECT });
  return row ? toRow(row) : null;
}
