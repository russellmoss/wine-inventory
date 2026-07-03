---
id: TRIP-TENANT-POOLER
group: security
severity: critical
enforce: guard
verify: "npm run verify:tenant-isolation"
decision: "D17 / H1"
status: guarded
appliesTo:
  - src/lib/tenant/
  - prisma/schema.prisma
tags:
  - tripwire
---

# TRIP-TENANT-POOLER — tenant id via SET LOCAL, proven through the pooler

> [!warning] Tripwire — revisit when this fires
> Any tenant id set outside a `SET LOCAL` inside a txn, or an isolation test that only hits direct Postgres. Transaction-mode poolers (PgBouncer/Neon) reuse connections and do NOT reset session GUCs — a session-scoped `app.tenant_id` leaks to the next client.

- **What breaks at scale:** pooled-connection GUC bleed = a silent cross-tenant leak, invisible against a direct connection.
- **Enforced by:** `npm run verify:tenant-isolation` (runs through a transaction-mode PgBouncer + a SET-LOCAL no-bleed test).
- **Source:** [[scale-register]] / [[security-register]] (D17/H1), [[system-map]].
