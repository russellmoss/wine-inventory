import { getTenantContext } from "@/lib/tenant/context";

/**
 * Resolve the tenant from the VERIFIED session when no ALS context is set (K9). Server actions,
 * the ledger, and scripts set the ALS context explicitly (fast path); RSC page reads / API routes /
 * data-loaders don't, so we lazily resolve from getCurrentUser().activeOrganizationId here.
 * Dynamic import breaks the prisma <-> dal/auth static cycle. Returns undefined outside a request
 * scope (e.g. a script that forgot runAsTenant) -> the caller throws (fail-closed).
 *
 * ⚠️ NO-RECURSION CONTRACT. `getCurrentUser` must never reach this function, or it would await
 * itself. Its `user` read is on a GLOBAL (denylisted) model, which the extension passes straight
 * through without resolving a tenant. Its ONE tenant-scoped read — the D9 vineyard membership set
 * (`src/lib/users/vineyard-memberships.ts`) — is wrapped in `runAsTenant` with an EXPLICIT tenantId,
 * so the extension short-circuits on the ALS context and never gets here. Any new tenant-scoped read
 * added to `getCurrentUser` must do the same.
 *
 * This is the single source of truth for session-based tenant resolution, shared by the Prisma
 * extension (src/lib/prisma.ts) and the raw-read tx wrapper (src/lib/tenant/tx.ts) so the two can
 * never scope raw and model queries to different tenants.
 */
export async function resolveTenantFromSession(): Promise<string | undefined> {
  try {
    const { getCurrentUser } = await import("@/lib/dal");
    const user = await getCurrentUser();
    return user?.supportOrganizationId ?? user?.activeOrganizationId ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * The active tenant, resolved the same way the Prisma extension resolves it: the ALS context first
 * (server actions / ledger / scripts), else the verified session (RSC reads / API routes). Returns
 * undefined when neither is present — callers fail closed.
 */
export async function resolveActiveTenantId(): Promise<string | undefined> {
  return getTenantContext()?.tenantId ?? (await resolveTenantFromSession());
}
