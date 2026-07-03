---
id: TENANT-2
group: tenancy
severity: critical
enforcedBy: app-code
verify: "npm run verify:raw-sql"
decision: "plan-029"
status: guarded
appliesTo:
  - src/lib/
tags:
  - invariant
---

# TENANT-2 — raw sql scoped

> [!danger] Invariant (critical, app-code)
> $queryRaw bypasses the tenant extension — raw SQL must run inside runInTenantRawTx (ALS-or-session), never ALS-only runInTenantTx, so RLS still sees app.tenant_id.

**Guarded by:** `npm run verify:raw-sql`
**Decision:** plan-029 — see [[INVARIANTS]] and [[system-map]].
**Applies to:** `src/lib/`

This note is the machine-readable face of the invariant. The narrative lives in
[[INVARIANTS]]; the guard status is asserted by `npm run verify:invariants`; the
`applies-to` paths drive the auto-context hook that surfaces this rule before any
edit to the governed code.
