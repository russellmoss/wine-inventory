import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Phase 12 multi-tenancy — the request/operation tenant context (K3/K9).
 *
 * One AsyncLocalStorage store carries the active tenant for the duration of a server action, route,
 * or script call. The Prisma extension (src/lib/prisma.ts) reads it to set `app.tenant_id` per DB
 * transaction; the ledger chokepoint reads it to set the GUC itself (K5). NODE RUNTIME ONLY — ALS
 * does not work on the Edge runtime, so any route/action touching tenant data must run on Node.
 *
 * K12 — cache discipline: NEVER read this store inside a memoized/cached function (React `cache()`,
 * `unstable_cache`). A cache keyed only on its args would serve the first tenant's rows to the next.
 * Pass `tenantId` as an EXPLICIT argument to every cached data function instead.
 */
export type TenantContext = {
  tenantId: string;
  /**
   * Plan 068 Unit 1b — the ACTING user id, carried so the Prisma extension can set `app.user_id`
   * per transaction alongside `app.tenant_id`. Per-user RLS on the inbox tables keys owner-only
   * reads on this GUC (INSERT stays tenant-only, so an actor can notify another user). Absent →
   * the extension sets `app.user_id` to '' → the per-user policies fail closed (zero rows). Safe
   * for every non-inbox table (they have no per-user policy).
   */
  userId?: string;
  /**
   * When true, the Prisma extension does NOT wrap operations in its own set_config transaction —
   * the caller owns the transaction and sets `app.tenant_id` itself (the ledger chokepoint, K5).
   * The extension still injects tenantId on creates. Prevents nesting a batch tx inside an
   * interactive one (Prisma #23583).
   */
  skipWrap?: boolean;
};

const store = new AsyncLocalStorage<TenantContext>();

/** Run `fn` with the given tenant as the active context. All tenant-scoped Prisma ops inside are
 *  scoped to `tenantId` (RLS + auto-injected on create). Pass `opts.userId` to also set `app.user_id`
 *  for per-user RLS (inbox); omit it for tenant-only work. */
export function runAsTenant<T>(tenantId: string, fn: () => Promise<T>, opts?: { userId?: string }): Promise<T> {
  if (!tenantId) throw new Error("runAsTenant requires a non-empty tenantId.");
  return store.run({ tenantId, userId: opts?.userId }, fn);
}

/** Internal: run with an explicit context object (used by the ledger to set skipWrap). */
export function runWithTenantContext<T>(ctx: TenantContext, fn: () => Promise<T>): Promise<T> {
  if (!ctx.tenantId) throw new Error("runWithTenantContext requires a non-empty tenantId.");
  return store.run(ctx, fn);
}

export function getTenantContext(): TenantContext | undefined {
  return store.getStore();
}

export function getTenantId(): string | undefined {
  return store.getStore()?.tenantId;
}

/** The acting user id in the current context, if set (Plan 068 Unit 1b — per-user RLS). */
export function getContextUserId(): string | undefined {
  return store.getStore()?.userId;
}

/** Fail-closed accessor for call sites that MUST have a tenant. */
export function requireTenantId(): string {
  const t = store.getStore()?.tenantId;
  if (!t) throw new Error("No tenant context — wrap this call in runAsTenant().");
  return t;
}
