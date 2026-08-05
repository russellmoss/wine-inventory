import "server-only";
import { prisma } from "@/lib/prisma";
import { ActionError } from "@/lib/action-error";
import { isTenantAdminLike, type AppUser } from "@/lib/access";

/**
 * D9 vineyard scoping — the SCRIPT-SAFE core.
 *
 * Split from `scope.ts` for the reason every other `*-core.ts` in this repo is: the gates in `scope.ts`
 * reach `getActionUser()` → `@/lib/dal` → `next/navigation`, and importing that from a plain `tsx`
 * script blows up loading Next's client router context (`React.createContext is not a function`) long
 * before it reaches a database. Everything here depends only on `prisma`, the pure predicate in
 * `access.ts`, and the dependency-free `ActionError` — no `next/*`, no `dal`, no `"use server"`.
 *
 * That is what makes `scripts/verify-vineyard-scope-runtime.ts` possible: the FK paths and the decision
 * logic are the halves that can silently be WRONG, and they are now provable against a real database.
 * The session half stays in `scope.ts`, and the "every action reaches a gate" half is the static guard.
 */

/** Every id kind below resolves to a vineyard through exactly one documented FK path. */
export const NO_ACCESS = "You can only work with your assigned vineyard.";

/**
 * ── RESOLVERS ──
 * The DB half of each gate, exported SEPARATELY from the session half on purpose.
 *
 * `requireVineyardAccess` reaches `getActionUser()` → `getCurrentUser()` → `headers()`, so it can only
 * run inside a request. That made the FK paths — the part most likely to be wrong, and the part a
 * static guard cannot check — unprovable outside the app. Splitting them means
 * `scripts/verify-vineyard-scope-runtime.ts` can prove against a real database that each id kind
 * resolves to the RIGHT vineyard, while the static guard proves every action reaches a gate.
 *
 * Each returns `null` for "no such row", never a throw, so a caller decides the message.
 */

/** `vineyard_block.vineyardId`. */
export async function resolveBlockVineyard(blockId: string): Promise<string | null> {
  const block = await prisma.vineyardBlock.findUnique({ where: { id: blockId }, select: { vineyardId: true } });
  return block?.vineyardId ?? null;
}

/** `vineyard_subblock.blockId` → `vineyard_block.vineyardId`. */
export async function resolveSubblockVineyard(subblockId: string): Promise<{ vineyardId: string; blockId: string } | null> {
  const sub = await prisma.vineyardSubblock.findUnique({
    where: { id: subblockId },
    select: { blockId: true, block: { select: { vineyardId: true } } },
  });
  return sub ? { vineyardId: sub.block.vineyardId, blockId: sub.blockId } : null;
}

/** `vineyard_planting_area.vineyardId`. */
export async function resolvePlantingAreaVineyard(plantingAreaId: string): Promise<string | null> {
  const area = await prisma.vineyardPlantingArea.findUnique({
    where: { id: plantingAreaId },
    select: { vineyardId: true },
  });
  return area?.vineyardId ?? null;
}

/** `spray_block_line.blockId` → `vineyard_block.vineyardId` (raw FK; no Prisma relation). */
export async function resolveSprayBlockLineVineyard(blockLineId: string): Promise<string | null> {
  const line = await prisma.sprayBlockLine.findUnique({ where: { id: blockLineId }, select: { blockId: true } });
  if (!line) return null;
  return resolveBlockVineyard(line.blockId);
}

/** `spatial_style.vineyardId` — `{ vineyardId: null }` means a SYSTEM (tenant-wide) style. */
export async function resolveSpatialStyleVineyard(styleId: string): Promise<{ vineyardId: string | null } | null> {
  const style = await prisma.spatialStyle.findUnique({ where: { id: styleId }, select: { vineyardId: true } });
  return style ? { vineyardId: style.vineyardId } : null;
}

/** The distinct vineyards a set of blocks belongs to. `null` when any id does not exist. */
export async function resolveBlocksVineyards(blockIds: string[]): Promise<string[] | null> {
  const unique = [...new Set(blockIds)];
  if (unique.length === 0) return [];
  const blocks = await prisma.vineyardBlock.findMany({
    where: { id: { in: unique } },
    select: { vineyardId: true },
  });
  if (blocks.length !== unique.length) return null;
  return [...new Set(blocks.map((b) => b.vineyardId))];
}

/**
 * Every vineyard a spray application touches — the header's primary site UNION the vineyards of its
 * block lines' blocks. A pass is deliberately allowed to span sites (`record-core.ts` computes
 * `isCrossSite = vineyardIds.length > 1`), and the header `vineyardId` is only "the primary site,
 * defaulted from the FIRST block line". So the header alone is NOT the record's footprint.
 *
 * NOTE these FKs are raw composite SQL (K11), not Prisma relations — `spray_application` and
 * `spray_block_line` declare no `@relation`, so this walks them with scalar lookups. A nested
 * `select: { application: … }` does not compile against this schema.
 */
export async function sprayApplicationVineyardIds(applicationId: string): Promise<string[] | null> {
  const app = await prisma.sprayApplication.findUnique({
    where: { id: applicationId },
    select: { vineyardId: true },
  });
  if (!app) return null;
  const lines = await prisma.sprayBlockLine.findMany({ where: { applicationId }, select: { blockId: true } });
  const blockIds = [...new Set(lines.map((l) => l.blockId))];
  const blocks = blockIds.length
    ? await prisma.vineyardBlock.findMany({ where: { id: { in: blockIds } }, select: { vineyardId: true } })
    : [];
  return [...new Set([app.vineyardId, ...blocks.map((b) => b.vineyardId)])];
}

/**
 * The read-side shape. A LIST read spanning vineyards must FILTER to what the caller reaches rather
 * than throw — throwing would blank a whole board for a manager who legitimately sees a subset.
 *
 * `all`  — admin/developer: no vineyard predicate.
 * `some` — a manager with memberships: restrict to that set.
 * `none` — a manager with NO memberships: return nothing (fail closed). Callers MUST short-circuit to
 *          an empty result; they must not fall through to an unfiltered query.
 */
export type VineyardScope =
  | { kind: "all" }
  | { kind: "some"; vineyardIds: string[] }
  | { kind: "none" };

/** Pure: the scope a given user has. Split out so it is unit-testable without a session. */
export function vineyardScopeOf(user: AppUser): VineyardScope {
  if (isTenantAdminLike(user)) return { kind: "all" };
  if (user.vineyardIds.length === 0) return { kind: "none" };
  return { kind: "some", vineyardIds: user.vineyardIds };
}

/**
 * Narrow a caller-supplied optional vineyardId against a scope, for the
 * `load…(vineyardId?)` read shape: an explicit id must be IN scope; an absent id means "everything I
 * reach". Returns the id list to filter on, or `null` for "no predicate needed" (admin, no id).
 * Throws FORBIDDEN when an explicit id is out of scope, so a crafted id cannot widen a read.
 */
export function narrowVineyardFilter(scope: VineyardScope, vineyardId?: string | null): string[] | null {
  if (vineyardId) {
    if (scope.kind === "none") throw new ActionError(NO_ACCESS, "FORBIDDEN");
    if (scope.kind === "some" && !scope.vineyardIds.includes(vineyardId)) {
      throw new ActionError(NO_ACCESS, "FORBIDDEN");
    }
    return [vineyardId];
  }
  if (scope.kind === "all") return null;
  if (scope.kind === "none") return [];
  return scope.vineyardIds;
}
