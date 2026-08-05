import "server-only";
import { getActionUser, ActionError } from "@/lib/actions";
import { canAccessVineyard, isTenantAdminLike, type AppUser } from "@/lib/access";
// The script-safe half: resolvers + the pure decision logic. Re-exported below so existing call sites
// keep importing everything from `@/lib/vineyard/scope` and no consumer has to know about the split.
import {
  NO_ACCESS,
  resolveBlockVineyard,
  resolveBlocksVineyards,
  resolveSubblockVineyard,
  resolvePlantingAreaVineyard,
  resolveSprayBlockLineVineyard,
  resolveSpatialStyleVineyard,
  sprayApplicationVineyardIds,
  vineyardScopeOf,
  type VineyardScope,
} from "./scope-core";

export {
  resolveBlockVineyard,
  resolveBlocksVineyards,
  resolveSubblockVineyard,
  resolvePlantingAreaVineyard,
  resolveSprayBlockLineVineyard,
  resolveSpatialStyleVineyard,
  sprayApplicationVineyardIds,
  vineyardScopeOf,
  narrowVineyardFilter,
} from "./scope-core";
export type { VineyardScope } from "./scope-core";

/**
 * D9 vineyard-membership scoping for server actions — THE shared gate.
 *
 * `canAccessVineyard` (src/lib/access.ts) is the pure predicate: an admin/developer reaches every
 * vineyard in the tenant, a manager (`role: "user"`) reaches only the vineyards in their membership
 * SET. This module is the server-side half — it resolves a caller-supplied id back to its vineyard and
 * applies that predicate, so no call site has to remember the FK path.
 *
 * WHY THIS EXISTS: the predicate was applied in 8 files and skipped in the rest, so the vineyard-scoped
 * domains (weather, spray, soil, planting areas, NDVI, block CRUD) authorized to TENANT only. RLS stops
 * cross-TENANT access, but D9 is an INTRA-tenant control and Postgres does not enforce it — a manager
 * assigned to vineyard A could read and mutate vineyard B. The clearest proof it was a bug rather than a
 * choice: `src/lib/assistant/tools/db-update.ts` already refuses exactly this for the `Vineyard` and
 * `VineyardBlock` entities ("You can only edit records in your assigned vineyard"), so the assistant
 * path was STRICTER than the GUI path for the same rows.
 *
 * FAIL-CLOSED: a manager with an EMPTY membership set reaches nothing (`{ kind: "none" }` / a thrown
 * FORBIDDEN), never everything. This matches field notes, harvest, and `assistant/scope.ts`, and it is
 * the direction plan 092 requires — a user an unfinished backfill left unseeded must resolve to the
 * empty set, not to see-all.
 *
 * NOT A REPLACEMENT FOR PLAN 092. This is an app-layer fence with zero DB enforcement, so it holds only
 * for traffic that goes through these actions. Plan 092 (capability matrix + RESTRICTIVE RLS quad)
 * replaces the mechanism with one Postgres enforces; until then this is the fence that exists, and it
 * should be complete rather than partial.
 */

/** Assert the acting user reaches `vineyardId`. Returns the resolved user for audit/actor use. */
export async function requireVineyardAccess(vineyardId: string): Promise<AppUser> {
  const user = await getActionUser();
  if (!canAccessVineyard(user, vineyardId)) throw new ActionError(NO_ACCESS, "FORBIDDEN");
  return user;
}

/** `vineyard_block.vineyardId`. Returns the vineyard so callers can revalidate/audit against it. */
export async function requireBlockAccess(blockId: string): Promise<{ user: AppUser; vineyardId: string }> {
  const vineyardId = await resolveBlockVineyard(blockId);
  if (vineyardId === null) throw new ActionError("Block not found.");
  const user = await requireVineyardAccess(vineyardId);
  return { user, vineyardId };
}

/**
 * Assert access to EVERY vineyard the given blocks belong to — the write gate for an operation whose
 * payload names blocks directly (a spray pass, which may legitimately span sites). One query, not N.
 * Fail-closed on an unknown blockId: a caller must not learn which ids exist by probing.
 */
export async function requireBlocksAccess(blockIds: string[]): Promise<{ user: AppUser; vineyardIds: string[] }> {
  const user = await getActionUser();
  const vineyardIds = await resolveBlocksVineyards(blockIds);
  if (vineyardIds === null) throw new ActionError("Block not found.");
  if (!vineyardIds.every((id) => canAccessVineyard(user, id))) throw new ActionError(NO_ACCESS, "FORBIDDEN");
  return { user, vineyardIds };
}

/** `vineyard_subblock.blockId` → `vineyard_block.vineyardId`. */
export async function requireSubblockAccess(subblockId: string): Promise<{ user: AppUser; vineyardId: string; blockId: string }> {
  const sub = await resolveSubblockVineyard(subblockId);
  if (sub === null) throw new ActionError("Subblock not found.");
  const user = await requireVineyardAccess(sub.vineyardId);
  return { user, vineyardId: sub.vineyardId, blockId: sub.blockId };
}

/** `vineyard_planting_area.vineyardId`. */
export async function requirePlantingAreaAccess(plantingAreaId: string): Promise<{ user: AppUser; vineyardId: string }> {
  const vineyardId = await resolvePlantingAreaVineyard(plantingAreaId);
  if (vineyardId === null) throw new ActionError("Planting area not found.");
  const user = await requireVineyardAccess(vineyardId);
  return { user, vineyardId };
}

/**
 * A spray record is reachable only if the caller reaches EVERY vineyard it touches — the fail-closed
 * reading of a composite record. A cross-site pass inherently carries block lines from other sites, so
 * granting on "any one of my vineyards matches" would leak the other site's blocks, rates and
 * jurisdictions inside a record the manager is entitled to only part of. Cross-site passes are the rare
 * case and are admin-run; a manager who cannot see all of one sees none of it.
 */
export async function requireSprayApplicationAccess(applicationId: string): Promise<{ user: AppUser; vineyardIds: string[] }> {
  const user = await getActionUser();
  // Admins reach every vineyard — skip the two extra round-trips the footprint walk would cost.
  if (isTenantAdminLike(user)) {
    const ids = await sprayApplicationVineyardIds(applicationId);
    if (ids === null) throw new ActionError("Spray record not found.");
    return { user, vineyardIds: ids };
  }
  const ids = await sprayApplicationVineyardIds(applicationId);
  if (ids === null) throw new ActionError("Spray record not found.");
  if (!ids.every((id) => canAccessVineyard(user, id))) throw new ActionError(NO_ACCESS, "FORBIDDEN");
  return { user, vineyardIds: ids };
}

/** `spray_block_line.blockId` → `vineyard_block.vineyardId` (raw FK; no Prisma relation). */
export async function requireSprayBlockLineAccess(blockLineId: string): Promise<{ user: AppUser; vineyardId: string }> {
  const vineyardId = await resolveSprayBlockLineVineyard(blockLineId);
  if (vineyardId === null) throw new ActionError("Spray block line not found.");
  const user = await requireVineyardAccess(vineyardId);
  return { user, vineyardId };
}

/**
 * `spatial_style.vineyardId` — NULLABLE. A NULL vineyardId is a SYSTEM-scope style (tenant-wide
 * defaults), which is admin-like territory, not a manager's: a manager editing a system style would
 * change every vineyard's rendering including ones outside their scope.
 */
export async function requireSpatialStyleAccess(styleId: string): Promise<{ user: AppUser; vineyardId: string | null }> {
  const style = await resolveSpatialStyleVineyard(styleId);
  if (style === null) throw new ActionError("Style not found.");
  if (style.vineyardId === null) {
    const user = await getActionUser();
    if (!isTenantAdminLike(user)) throw new ActionError("Only an admin can change a tenant-wide style.", "FORBIDDEN");
    return { user, vineyardId: null };
  }
  const user = await requireVineyardAccess(style.vineyardId);
  return { user, vineyardId: style.vineyardId };
}

/** Resolve the acting user's read scope over vineyards. */
export async function currentVineyardScope(): Promise<{ user: AppUser; scope: VineyardScope }> {
  const user = await getActionUser();
  return { user, scope: vineyardScopeOf(user) };
}
