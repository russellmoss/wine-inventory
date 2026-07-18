---
id: WORKORDER-7
group: work-orders
severity: high
enforcedBy: app-code
verify: "npm run verify:work-orders-enhancements"
decision: "Plan 072"
status: guarded
appliesTo:
  - src/lib/cellar/material-taxonomy.ts
  - src/lib/work-orders/execute.ts
tags:
  - invariant
---

# WORKORDER-7 — EQUIPMENT + UNCLASSIFIED (and any unknown category) are non-doseable overhead, never wine COGS

> [!warning] Invariant (high, app-code)
> `isDoseableCategory` is a DEFAULT-DENY **allowlist**, not a denylist. Only the known-doseable set
> (`ADDITIVE`, `OTHER`) may be dosed into wine as an ADDITION/FINING; **every other category — `EQUIPMENT`,
> `UNCLASSIFIED`, `CLEANING_SANITIZING`, `PACKAGING`, and any unrecognized/typo'd/imported/admin-entered
> String — is non-doseable by default.** Dosing a non-additive would wrongly capitalize it into wine COGS
> (WORKORDER-3, COST-1/COST-2). Because `MaterialCategory` is a free-text String column (not a DB enum), a
> denylist would be doseable-by-default and any new/garbage string would silently pass through to wine COGS;
> the allowlist closes that. Unrecognized category INPUT is coerced to the non-doseable `UNCLASSIFIED` sink
> (never the doseable `OTHER`), so an import can't become doseable through a typo.

Plan 072 adds an `EQUIPMENT` category (a stock/supply home for spare parts and fittings — clamps, gaskets,
stainless) that must never be dosed into wine or capitalized as wine COGS. The one load-bearing edit is
rewriting `isDoseableCategory` (`src/lib/cellar/material-taxonomy.ts`) from a denylist to an allowlist; it
transitively protects all WORKORDER-3 call-sites through the execute seam
(`src/lib/work-orders/execute.ts` — the dose guard reads the STORED category and rejects a non-doseable
one). For the existing four categories the allowlist is behaviorally identical to the old denylist
(`{ADDITIVE, OTHER}` were the exact doseable set); the only change is that new/unknown categories now
default to non-doseable instead of doseable.

**Guarded by:** `npm run verify:work-orders-enhancements` (the execute-seam WORKORDER-3 guard, which reads
the stored category via `isDoseableCategory`), plus the pure allowlist proof in
`test/material-cost-safety.test.ts` — an exhaustive doseability snapshot over every `MATERIAL_CATEGORIES`
value (so a future category must opt IN to doseable explicitly) and a default-deny assertion that an
unknown/garbage category string is non-doseable.
**Decision:** Plan 072 — see [[INVARIANTS]] and [[system-map]]. Related:
[[WORKORDER-3-maintenance-supply-is-overhead]].
**Applies to:** `src/lib/cellar/material-taxonomy.ts`, `src/lib/work-orders/execute.ts`.

This note is the machine-readable face of the invariant. The narrative lives in [[INVARIANTS]]; the
guard status is asserted by `npm run verify:invariants`; the `applies-to` paths drive the auto-context
hook that surfaces this rule before any edit to the governed code.
