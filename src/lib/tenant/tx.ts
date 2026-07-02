import type { Prisma } from "@prisma/client";
import { prisma, prismaBase } from "@/lib/prisma";
import { requireTenantId, runWithTenantContext } from "@/lib/tenant/context";
import { resolveActiveTenantId } from "@/lib/tenant/resolve";

/**
 * Phase 12 — run an interactive transaction with the tenant set (the general-purpose sibling of
 * runLedgerWrite, for the mutation+audit transactions in server actions). Sets `app.tenant_id` as
 * the FIRST statement so RLS applies inside, and runs under `skipWrap` so the per-op extension does
 * NOT nest a batch transaction (Prisma #23583) — but the extension STILL auto-injects tenantId on
 * creates within the tx. The tx client is the extended one at runtime (auto-inject) and is exposed
 * as `Prisma.TransactionClient` so existing cores/`writeAudit` typings are unchanged.
 *
 * Tenant comes from the ALS context (set by action()/adminAction() or a script's runAsTenant);
 * fail-closed if absent.
 */
export function runInTenantTx<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  options?: { maxWait?: number; timeout?: number; isolationLevel?: Prisma.TransactionIsolationLevel },
): Promise<T> {
  const tenantId = requireTenantId();
  return runWithTenantContext({ tenantId, skipWrap: true }, () =>
    prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
      return fn(tx as unknown as Prisma.TransactionClient);
    }, options),
  );
}

/**
 * Phase 12 — run RAW SQL reads ($queryRaw/$executeRaw) with `app.tenant_id` set so RLS scopes them.
 * The tenant Prisma extension only intercepts MODEL operations, so raw queries otherwise run with no
 * GUC and, under the activated NOBYPASSRLS role, match zero rows (silent-empty) — see plan 029.
 *
 * Unlike runInTenantTx (ALS-only, for server actions), this resolves the tenant the SAME way the
 * extension does — ALS context first, else the verified session — so it also works in RSC page reads
 * and API routes that never set an ALS context. Fail-closed: throws if no tenant can be resolved.
 * Uses the un-extended base client (raw is not intercepted anyway; avoids nesting the extension's tx).
 * The resolved tenantId is passed to the callback so raw queries can add an explicit
 * `"tenantId" = ${tenantId}` predicate (defense-in-depth on top of RLS).
 */
export async function runInTenantRawTx<T>(
  fn: (tx: Prisma.TransactionClient, tenantId: string) => Promise<T>,
  options?: { maxWait?: number; timeout?: number; isolationLevel?: Prisma.TransactionIsolationLevel },
): Promise<T> {
  const tenantId = await resolveActiveTenantId();
  if (!tenantId) {
    throw new Error(
      "Tenant context required for a raw-SQL read — no active organization on the session and no " +
        "runAsTenant() context.",
    );
  }
  return prismaBase.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
    return fn(tx as unknown as Prisma.TransactionClient, tenantId);
  }, options);
}
