---
id: TENANT-1
group: tenancy
severity: critical
enforcedBy: database
verify: "npm run verify:tenant-isolation"
decision: "Phase12"
status: guarded
appliesTo:
  - prisma/schema.prisma
  - src/lib/tenant/
  - prisma/migrations/
tags:
  - invariant
---

# TENANT-1 — rls isolation

> [!danger] Invariant (critical, database)
> Every domain table is tenant-scoped and RLS-isolated: ENABLE + FORCE ROW LEVEL SECURITY + a tenant_isolation policy (USING and WITH CHECK on current_setting('app.tenant_id', true), fail-closed). Auth/org tables are the only globals.

**Guarded by:** `npm run verify:tenant-isolation`
**Decision:** Phase12 — see [[INVARIANTS]] and [[system-map]].
**Applies to:** `prisma/schema.prisma`, `src/lib/tenant/`, `prisma/migrations/`

This note is the machine-readable face of the invariant. The narrative lives in
[[INVARIANTS]]; the guard status is asserted by `npm run verify:invariants`; the
`applies-to` paths drive the auto-context hook that surfaces this rule before any
edit to the governed code.
