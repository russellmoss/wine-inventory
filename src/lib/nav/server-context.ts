import "server-only";
import { requireReadyUser } from "@/lib/dal";
import { isTenantAdminLike } from "@/lib/access";
import { isSparklingEnabled, isCustomCrushEnabled } from "@/lib/settings/data";
import type { SectionContext } from "./sections";

/**
 * The visibility context a hub page needs to render its sub-navigation.
 *
 * One helper rather than seven inline copies, so the sidebar, the sub-navs and the
 * palette cannot disagree about who sees what. NOT wrapped in `cache()`: the tenant
 * comes from the async-local store, and reading it inside a cached function is K12.
 *
 * `hasVineyard` is derived from the user's real membership set — `AppShell` used to
 * hard-code it to `isAdmin`, which hid Vineyard rounds from the vineyard manager the
 * destination exists for (D5).
 */
export async function navContext(): Promise<SectionContext> {
  const user = await requireReadyUser();
  const isAdmin = isTenantAdminLike(user);
  // requireReadyUser admits a user with no resolvable active org; a tenant-scoped
  // settings read throws for them, so both capability gates default to off.
  const tenantId = user.supportOrganizationId ?? user.activeOrganizationId;
  const [sparkling, customCrush] = await Promise.all([
    tenantId ? isSparklingEnabled() : Promise.resolve(false),
    tenantId ? isCustomCrushEnabled() : Promise.resolve(false),
  ]);
  return {
    isAdmin,
    isDeveloper: user.role === "developer",
    hasVineyard: user.vineyardIds.length > 0 || isAdmin,
    sparkling,
    customCrush,
  };
}
