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
