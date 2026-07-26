---
id: TENANT-3
group: tenancy
severity: critical
enforcedBy: app-code
verify: "npm run verify:tenant-callbacks"
decision: "Phase12"
status: guarded
appliesTo:
  - src/lib/tenant/
  - src/lib/prisma.ts
tags:
  - invariant
---

# TENANT-3 — a tenant scope must outlive the query it scopes

> [!danger] Invariant (critical, app-code)
> A Prisma model method returns a LAZY thenable — the tenant extension's `$allOperations` hook does not run until `.then()` is called. `AsyncLocalStorage.run` exits its scope the instant the callback returns, so a callback that hands back a bare `PrismaPromise` is evaluated OUTSIDE the scope that was meant to scope it: it throws with no ambient context, and silently runs under the OUTER tenant when one is live. Every tenant-scope entry point must force the callback's result INSIDE the scope (`async () => await fn()`), and call sites must be written `async () => await …`.

**Guarded by:** `npm run verify:tenant-callbacks` (call-site shape) + `test/tenant-context-lazy.test.ts` (the helper guarantee)
**Decision:** Phase12 — see [[INVARIANTS]], [[TENANT-1-rls-isolation]], [[TENANT-2-raw-sql-scoped]].
**Applies to:** `src/lib/tenant/`, `src/lib/prisma.ts`

The failure is asymmetric, and that is what made it latent. With **no** ambient context it fails loudly
(`Tenant context required for <Model>.<op>`), so any path that is always entered cold was already
correct-by-crash. With an ambient **outer** `runAsTenant` still live it fails **silently** under the
outer tenant — the cross-tenant shape, and the reason this is `critical` rather than a lint nit.

Two fences, deliberately:

1. **Structural** — `runAsTenant` / `runWithTenantContext` wrap the callback in `async () => await fn()`,
   so the thenable is forced inside the ALS scope no matter how the callback is written. This is the
   real guarantee and it covers code this repo cannot see (aliased callbacks, future call sites).
2. **Shape** — `verify:tenant-callbacks` keeps call sites in the form that is correct on its own merits,
   so the codebase never silently depends on fence 1 and the bad shape never reads as an idiom.

`runAsSystem` (an `async` fn handing back an UN-extended client — no ALS read) and
`runInTenantTx` / `runLedgerWrite` (callback passed into an `async` `$transaction` callback, forced
inside the scope) cannot hit this trap and are deliberately not scanned.
