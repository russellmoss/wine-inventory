import { PrismaClient } from "@prisma/client";
import { getTenantContext } from "@/lib/tenant/context";
import { isGlobalModel, injectTenantId } from "@/lib/tenant/models";

// Prevent multiple Prisma Client instances in dev (Next.js hot reload).
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// The BASE (un-extended) client. Used directly by the ledger chokepoint's interactive transaction
// (K5) — it sets `app.tenant_id` itself and must NOT be re-wrapped by the extension below.
const base =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = base;

/**
 * The un-extended client. ONLY the ledger chokepoint (runLedgerWrite) and audited system tooling
 * (runAsSystem) may use it, and they set `app.tenant_id` themselves. App code uses `prisma`.
 */
export const prismaBase = base;

/**
 * Phase 12 (K3) — the tenant-scoped client. Every tenant-scoped operation is wrapped in
 * `$transaction([ set_config('app.tenant_id', <id>, true), <query> ])` (batch form, BOUND param —
 * never string-interpolated) so RLS sees the tenant for that transaction. Global auth/org models
 * (the denylist) are passed straight through — Better Auth queries them before a tenant exists.
 * Creates get tenantId auto-injected (WITH-CHECK backstop). Missing tenant context on a tenant
 * model throws (fail-closed). NODE RUNTIME ONLY (AsyncLocalStorage).
 */
export const prisma = base.$extends({
  name: "tenant-rls",
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        if (isGlobalModel(model)) return query(args);

        const ctx = getTenantContext();
        if (!ctx?.tenantId) {
          throw new Error(
            `Tenant context required for ${model}.${operation} — wrap the call in runAsTenant().`,
          );
        }

        injectTenantId(operation, args as Record<string, unknown>, ctx.tenantId);

        // The ledger owns its interactive transaction + set_config (K5). Don't nest a batch tx.
        if (ctx.skipWrap) return query(args);

        // set_config as the FIRST statement in the same tx as the query. is_local=true -> scoped
        // to this transaction (pooling-safe under PgBouncer). Bound param, never interpolated.
        const [, result] = await base.$transaction([
          base.$executeRaw`SELECT set_config('app.tenant_id', ${ctx.tenantId}, true)`,
          query(args),
        ]);
        return result as unknown;
      },
    },
  },
});
