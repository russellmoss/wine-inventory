import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireTenantId, runWithTenantContext } from "@/lib/tenant/context";

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
