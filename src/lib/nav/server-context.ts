import "server-only";
import { requireReadyUser } from "@/lib/dal";
import { isTenantAdminLike } from "@/lib/access";
import { isSparklingEnabled, isCustomCrushEnabled } from "@/lib/settings/data";
import type { SectionContext } from "./sections";

/**
 * The visibility context a hub page needs to render its sub-navigation.
 *
 * The ONE server-side answer to "who is this and what can they see": the six hub
 * strips, the /setup card hub and the Ctrl-K palette (`search/actions.ts`) all call
 * it. There was briefly a second, hand-rolled copy inside the palette action which
 * had already drifted — it missed `developer` in its admin check — so if you add a
 * third `SectionRequirement`, this is the only place that needs it.
 *
 * The client sidebar (`AppShell.tsx`) cannot call this (it is `server-only`) and
 * derives `hasVineyard` from the same `vineyardIds` prop; `test/shell-nav.test.ts`
 * pins that expression so the two cannot drift.
 *
 * NOT wrapped in `cache()`: the tenant comes from the async-local store, and reading
 * it inside a cached function is K12. `requireReadyUser()` is already `cache()`d, so
 * calling this alongside a page's own auth check costs one settings read, not two.
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
