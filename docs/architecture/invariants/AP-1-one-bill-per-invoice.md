---
id: AP-1
group: accounting
severity: high
enforcedBy: app-code
verify: "npm run verify:ingest"
decision: "Plan076"
status: guarded
appliesTo:
  - src/lib/ingest/
  - src/lib/accounting/
tags:
  - invariant
---

# AP-1 — an ingested invoice emits its A/P exactly once, as ONE aggregate event

> [!warning] Invariant (high, app-code)
> Applying an ingested invoice books its A/P as a SINGLE aggregate invoice-level event, never as N per-lot
> events. The apply passes `skipApEmit` to `receiveSupplyCore` (suppressing the per-lot `emitApExportForReceipt`)
> and calls `emitApExportForInvoice` once after every line's lot exists: one `ApExportEvent` keyed
> `apinv:<ingestedInvoiceId>` with a multi-line `billLinesJson` → one multi-line QBO Bill. This makes a supplier
> invoice a single payable in QuickBooks (matching the winemaker's mental model), avoids a shared invoice # on
> N per-lot bills colliding on DocNumber (QBO err 6140), and gives payment status ONE balance to reconcile.
> Manual (non-ingest) supply receipts keep the per-lot path unchanged.

**Guarded by:** `npm run verify:ingest` (scenario 1: an applied multi-line invoice yields exactly ONE aggregate
`ApExportEvent` and ZERO per-lot events; scenario 8: the aggregate event is removed on reverse).
**Decision:** Plan 076 — one Bill per invoice + Paid/Outstanding A/P. See [[INVARIANTS]].
**Applies to:** `src/lib/ingest/`, `src/lib/accounting/`

This note is the machine-readable face of the invariant. The narrative lives in
[[INVARIANTS]]; the guard status is asserted by `npm run verify:invariants`; the
`applies-to` paths drive the auto-context hook that surfaces this rule before any
edit to the governed code.
