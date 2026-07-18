---
id: COST-4
group: cost
severity: critical
enforcedBy: app-code
verify: "npm run verify:ingest"
decision: "Plan073"
status: guarded
appliesTo:
  - src/lib/ingest/
  - src/lib/money/fx/
  - src/lib/accounting/
tags:
  - invariant
---

# COST-4 — inventory cost is always stored in the base currency (never revalued for FX)

> [!danger] Invariant (critical, app-code)
> A foreign-currency invoice is converted at ingestion at a dated ECB rate (never the LLM; a missing rate
> fails loud, never a fabricated 1.0/$0). `SupplyLot.unitCost` + `SupplyLot.currency` are ALWAYS the tenant
> base currency, so the cost roll-up is single-currency. The foreign amount + rate + rate-date + source are
> preserved on the lot for audit but NEVER enter the roll-up. Inventory is non-monetary (IAS 21) — a lot's
> base cost is frozen at receipt and never revalued for FX. The A/P is decoupled: `ApExportEvent` holds the
> FOREIGN amount + `exchangeRate` (QBO owns FX gain/loss); the reconciliation invariant
> `base inventory value == round2(foreign amount × exchangeRate)` ties inventory to the payable.

**Guarded by:** `npm run verify:ingest` (EUR conversion + reconciliation + historical-cost-not-revalued) and
`npm run verify:cost` (single-currency roll-up re-proof).
**Decision:** Plan 073 — see [[INVARIANTS]] and [[system-map]].
**Applies to:** `src/lib/ingest/`, `src/lib/money/fx/`, `src/lib/accounting/`

This note is the machine-readable face of the invariant. The narrative lives in
[[INVARIANTS]]; the guard status is asserted by `npm run verify:invariants`; the
`applies-to` paths drive the auto-context hook that surfaces this rule before any
edit to the governed code.
