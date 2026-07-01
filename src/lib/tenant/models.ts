/**
 * Phase 12 — which Prisma models are GLOBAL (excluded from tenant scoping) and how tenantId is
 * auto-injected on create. Pure (no imports) so it is unit-tested without a DB or the client.
 */

/**
 * MODEL DENYLIST (K3, eng-review): the Better Auth core + organization plugin tables are GLOBAL —
 * no tenantId column, no RLS, and NOT wrapped by the tenant extension. Better Auth queries these
 * DURING LOGIN, before any tenant is known; forcing them through tenant context (or throwing when
 * absent) would break authentication. Names are Prisma model names as passed to `$allOperations`.
 */
export const GLOBAL_MODELS: ReadonlySet<string> = new Set([
  "User",
  "Session",
  "Account",
  "Verification",
  "Organization",
  "Member",
  "Invitation",
]);

export function isGlobalModel(model: string | undefined): boolean {
  return model != null && GLOBAL_MODELS.has(model);
}

/**
 * Auto-inject tenantId into the write payload of a create-family operation (the WITH-CHECK backstop
 * so an app bug can't omit it). Mutates `args` in place. Only fills tenantId when absent — an
 * explicitly-set tenantId is left as-is (RLS WITH CHECK will still reject a foreign one). Returns
 * the (same) args for convenience/testing.
 */
export function injectTenantId(
  operation: string,
  args: Record<string, unknown> | undefined,
  tenantId: string,
): Record<string, unknown> | undefined {
  if (!args) return args;
  const setOn = (obj: unknown) => {
    if (obj && typeof obj === "object" && !Array.isArray(obj)) {
      const rec = obj as Record<string, unknown>;
      if (rec.tenantId == null) rec.tenantId = tenantId;
    }
  };
  switch (operation) {
    case "create":
      setOn(args.data);
      break;
    case "upsert":
      // upsert has no `data`; the insert path is `create`.
      setOn(args.create);
      break;
    case "createMany":
    case "createManyAndReturn": {
      const d = args.data;
      if (Array.isArray(d)) d.forEach(setOn);
      else setOn(d);
      break;
    }
    default:
      break;
  }
  return args;
}
