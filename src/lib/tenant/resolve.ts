import { getTenantContext } from "@/lib/tenant/context";

/**
 * Resolve the tenant from the VERIFIED session when no ALS context is set (K9). Server actions,
 * the ledger, and scripts set the ALS context explicitly (fast path); RSC page reads / API routes /
 * data-loaders don't, so we lazily resolve from getCurrentUser().activeOrganizationId here.
 * Dynamic import breaks the prisma <-> dal/auth static cycle. getCurrentUser reads only global
 * (denylisted) tables, so this can't recurse. Returns undefined outside a request scope (e.g. a
 * script that forgot runAsTenant) -> the caller throws (fail-closed).
 *
 * This is the single source of truth for session-based tenant resolution, shared by the Prisma
 * extension (src/lib/prisma.ts) and the raw-read tx wrapper (src/lib/tenant/tx.ts) so the two can
 * never scope raw and model queries to different tenants.
 */
export async function resolveTenantFromSession(): Promise<string | undefined> {
  try {
    const { getCurrentUser } = await import("@/lib/dal");
    const user = await getCurrentUser();
    return user?.activeOrganizationId ?? undefined;
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
