import "server-only";
import { prisma } from "@/lib/prisma";
import { runAsTenant } from "@/lib/tenant/context";

/**
 * The D9 vineyard MEMBERSHIP set, read the only way it can safely be read.
 *
 * WHY THIS IS A SEPARATE MODULE AND A SEPARATE QUERY — the bug this closes:
 * `User` is a GLOBAL model (the auth denylist in `src/lib/tenant/models.ts`), so the Prisma
 * extension passes any `prisma.user.*` query STRAIGHT THROUGH and never opens its
 * `set_config('app.tenant_id', …)` transaction — Better Auth has to query those tables before any
 * tenant exists. But `user_vineyard` is an ordinary tenant-scoped table with FORCE ROW LEVEL
 * SECURITY. So a `vineyardMemberships` relation joined off that pass-through query is evaluated
 * with `app.tenant_id` UNSET, the fail-closed `tenant_isolation` policy matches nothing, and EVERY
 * user reads back ZERO memberships — silently, with no error.
 *
 * That silently emptied `AppUser.vineyardIds`, which:
 *   - locked every manager out of `/vineyards/field-notes` ("You haven't been assigned a vineyard");
 *   - disabled the vineyard-scoped assistant tools (`assistant/scope.ts`, `query-brix`,
 *     `query-recent-harvests`) and made `db-create`/`db-update` refuse vineyard-scoped writes;
 *   - turned the admin Users page into silent DATA LOSS — the checkboxes render from these ids and
 *     `setUserVineyards` REPLACES the whole set, so ticking one vineyard against an all-empty list
 *     dropped every membership the user already had.
 * It was invisible for as long as the runtime connected as the OWNER role (BYPASSRLS) and became
 * total at the Phase-12 `app_rls` (NOBYPASSRLS) cutover.
 *
 * `tenantId` is an EXPLICIT ARGUMENT, never read from the ALS store: the main caller
 * (`getCurrentUser`) runs inside React `cache()` (K12), and the effective tenant is DERIVED from
 * that same request. Wrapping in `runAsTenant` also makes the extension short-circuit on the ALS
 * context instead of calling `resolveTenantFromSession()`, so this can never recurse back into
 * `getCurrentUser`.
 *
 * Proof: `test/global-model-tenant-relation-select.test.ts` (static — no global model may select a
 * tenant relation) + `npm run verify:tenant-isolation` (runtime — pins both the empty pass-through
 * read and the correct scoped one against a real database).
 *
 * ⚠️ The `runAsTenant` callback MUST be `async` with an explicit `await`. Prisma's model methods
 * return a LAZY thenable: `runAsTenant(id, () => prisma.x.findMany(…))` merely *constructs* the
 * query inside the ALS scope and returns it — the extension's `$allOperations` doesn't run until
 * something calls `.then()`, which happens after `store.run()` has already exited. The tenant
 * context is gone by then and the read throws "Tenant context required". Awaiting inside the
 * callback keeps the whole operation within the scope.
 */
export async function loadVineyardMembershipIds(userId: string, tenantId: string): Promise<string[]> {
  const rows = await runAsTenant(
    tenantId,
    async () => await prisma.userVineyard.findMany({ where: { userId }, select: { vineyardId: true } }),
    { userId },
  );
  return rows.map((r) => r.vineyardId);
}

/**
 * Batch form for list screens (the admin Users page). Same rule, same reason — a nested
 * `vineyardMemberships` select on `prisma.user.findMany` reads back empty for every row.
 * Returns a map keyed by userId; a user with no membership is simply absent from the map.
 */
export async function loadVineyardMembershipIdsByUser(
  userIds: string[],
  tenantId: string,
): Promise<Map<string, string[]>> {
  const byUser = new Map<string, string[]>();
  if (userIds.length === 0) return byUser;
  // `async () => await …` — see the lazy-thenable note on loadVineyardMembershipIds.
  const rows = await runAsTenant(
    tenantId,
    async () =>
      await prisma.userVineyard.findMany({
        where: { userId: { in: userIds } },
        select: { userId: true, vineyardId: true },
      }),
  );
  for (const r of rows) {
    const list = byUser.get(r.userId);
    if (list) list.push(r.vineyardId);
    else byUser.set(r.userId, [r.vineyardId]);
  }
  return byUser;
}
