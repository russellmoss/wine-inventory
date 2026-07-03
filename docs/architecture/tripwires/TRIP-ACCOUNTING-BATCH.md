---
id: TRIP-ACCOUNTING-BATCH
group: scale
severity: high
enforce: guard
verify: "npm run verify:accounting-idempotency"
signal: "poster run time approaching maxDuration; backlog depth climbing tick-over-tick; the partial index dropped"
decision: "Phase 15"
status: guarded
appliesTo:
  - src/lib/accounting/
tags:
  - tripwire
---

# TRIP-ACCOUNTING-BATCH — bounded poster drain stays bounded

> [!warning] Tripwire — revisit when this fires
> Poster run time approaching `maxDuration`, backlog depth climbing tick-over-tick, or the partial index on `accounting_delivery (tenantId, status) WHERE status IN ('PENDING','VERIFYING','FAILED')` dropped — the sweep would fall back to a full-table scan as POSTED history grows.

- **What breaks at scale:** an unbounded backlog in one invocation (Vercel ~300s cap + QBO 500/min per realm); a full scan of `accounting_delivery`.
- **Enforced by:** `npm run verify:accounting-idempotency` proves drain-over-ticks (bounded batch + `FOR UPDATE SKIP LOCKED` + lease). Watch the runtime `signal` in the /accounting dashboard.
- **Source:** [[scale-register]] (Phase 15), [[system-map]].
