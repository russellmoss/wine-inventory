import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { AppUser } from "@/lib/access";

/**
 * Shared scoping for assistant read tools. Scoping is the handler's job, NEVER
 * trusted to the model. Managers (role !== "admin") are pinned to their one
 * assigned vineyard; admins see all. Returns null when a manager has no vineyard
 * assigned (nothing is in scope).
 */
export function scopedVineyardWhere(user: AppUser): Prisma.VineyardWhereInput | null {
  if (user.role === "admin") return {};
  if (!user.assignedVineyardId) return null;
  return { id: user.assignedVineyardId };
}

/**
 * Resolve vineyards the user may access, optionally narrowed by a partial name.
 * Empty array means "nothing in scope / no match" — the tool decides how to
 * report that. Capped so an admin query can't fan out unbounded.
 */
export async function resolveVineyards(
  user: AppUser,
  name?: string,
): Promise<{ id: string; name: string }[]> {
  const base = scopedVineyardWhere(user);
  if (base === null) return [];
  const where: Prisma.VineyardWhereInput = name
    ? { AND: [base, { name: { contains: name, mode: "insensitive" } }] }
    : base;
  return prisma.vineyard.findMany({
    where,
    orderBy: { name: "asc" },
    take: 25,
    select: { id: true, name: true },
  });
}

export type ScopedBlock = {
  id: string;
  label: string;
  vineyardName: string;
  varietyName: string | null;
};

/**
 * Find blocks the user may access, narrowed by partial block label and/or
 * vineyard name. Scoped to the manager's vineyard (admins see all). Used by write
 * tools to resolve a single target block before proposing a change.
 */
export async function findScopedBlocks(
  user: AppUser,
  opts: { block?: string; vineyard?: string },
): Promise<ScopedBlock[]> {
  const where: Prisma.VineyardBlockWhereInput = {};
  if (user.role !== "admin") {
    if (!user.assignedVineyardId) return [];
    where.vineyardId = user.assignedVineyardId;
  }
  if (opts.vineyard) where.vineyard = { name: { contains: opts.vineyard, mode: "insensitive" } };
  if (opts.block) where.blockLabel = { contains: opts.block, mode: "insensitive" };
  const rows = await prisma.vineyardBlock.findMany({
    where,
    take: 10,
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      blockLabel: true,
      vineyard: { select: { name: true } },
      variety: { select: { name: true } },
    },
  });
  return rows.map((b) => ({
    id: b.id,
    label: b.blockLabel ?? "(unlabeled)",
    vineyardName: b.vineyard.name,
    varietyName: b.variety?.name ?? null,
  }));
}
