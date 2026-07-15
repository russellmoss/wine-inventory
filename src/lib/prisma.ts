import { PrismaClient } from "@prisma/client";
import { getTenantContext } from "@/lib/tenant/context";
import { resolveTenantFromSession } from "@/lib/tenant/resolve";
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
    // Dev logs default to warn+error (readable). Per-query SQL logging is opt-in via
    // PRISMA_LOG_QUERIES=1 — it's invaluable when debugging a query but drowns the dev console
    // otherwise (every RLS set_config + BEGIN/COMMIT prints). Production stays error-only.
    log:
      process.env.NODE_ENV === "development"
        ? process.env.PRISMA_LOG_QUERIES === "1"
          ? ["query", "error", "warn"]
          : ["error", "warn"]
        : ["error"],
    // Default interactive-tx ceilings. Prisma defaults (timeout 5000 / maxWait 2000) are preserved
    // when the envs are unset, so production behavior is unchanged. Slow links (airplane wifi / cold
    // Neon) can lift them (e.g. PRISMA_TX_TIMEOUT_MS=120000) so cores whose interactive tx isn't
    // individually tunable (chemistry/ferment/materials) don't race the 5s default. Ledger + bottling
    // set their own per-call ceilings and override this.
    transactionOptions: {
      timeout: Number(process.env.PRISMA_TX_TIMEOUT_MS) || 5000,
      maxWait: Number(process.env.PRISMA_TX_MAX_WAIT_MS) || 2000,
    },
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
 * Tenant comes from the ALS context (actions/ledger/scripts) or, absent that, lazily from the
 * verified session (RSC reads). Creates get tenantId auto-injected (WITH-CHECK backstop). No tenant
 * at all -> throws (fail-closed). NODE RUNTIME ONLY (AsyncLocalStorage).
 */
export const prisma = base.$extends({
  name: "tenant-rls",
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        if (isGlobalModel(model)) return query(args);

        const ctx = getTenantContext();
        const tenantId = ctx?.tenantId ?? (await resolveTenantFromSession());
        if (!tenantId) {
          throw new Error(
            `Tenant context required for ${model}.${operation} — no active organization on the ` +
              `session and no runAsTenant() context.`,
          );
        }

        injectTenantId(operation, args as Record<string, unknown>, tenantId);

        // The ledger owns its interactive transaction + set_config (K5). Don't nest a batch tx.
        if (ctx?.skipWrap) return query(args);

        // set_config as the FIRST statements in the same tx as the query. is_local=true -> scoped
        // to this transaction (pooling-safe under PgBouncer). Bound params, never interpolated.
        // Plan 068 Unit 1b: also set `app.user_id` (the acting user, or '' when absent) so per-user
        // RLS on the inbox tables scopes owner-only reads. '' fails those policies closed and is a
        // no-op for every table without a per-user policy.
        const [, , result] = await base.$transaction([
          base.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`,
          base.$executeRaw`SELECT set_config('app.user_id', ${ctx?.userId ?? ""}, true)`,
          query(args),
        ]);
        return result as unknown;
      },
    },
  },
});
