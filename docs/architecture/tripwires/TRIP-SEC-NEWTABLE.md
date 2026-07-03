---
id: TRIP-SEC-NEWTABLE
group: security
severity: high
enforce: guard
verify: "npm run verify:tenant-isolation"
decision: "Phase 12"
status: guarded
appliesTo:
  - prisma/schema.prisma
  - prisma/migrations/
tags:
  - tripwire
---

# TRIP-SEC-NEWTABLE — a new tenant table that skipped the checklist leaks

> [!warning] Tripwire — revisit when this fires
> A new domain/registry table added without the full Phase-12 checklist (tenantId + index, FK, backfill + NOT NULL, per-tenant uniques, RLS enable/force/policy, app_rls grants, a verify case).

- **What breaks:** a missing RLS policy on a new table = silent cross-tenant leak; a missing tenant context = a broken table.
- **Enforced by:** `npm run verify:tenant-isolation` sweeps every table for the RLS policy + FORCE — a table that skipped step 6 fails the sweep.
- **Source:** the 9-step checklist in [[CLAUDE]], [[security-register]] (Phase 12).
