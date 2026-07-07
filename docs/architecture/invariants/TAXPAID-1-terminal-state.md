---
id: TAXPAID-1
group: compliance
severity: critical
enforcedBy: app-code
verify: "npm run verify:taxpaid"
decision: "§B.1(iv)"
status: guarded
appliesTo:
  - src/lib/compliance/
  - src/lib/ledger/
tags:
  - invariant
---

# TAXPAID-1 — taxpaid is a terminal one-way state

> [!danger] Invariant (critical, app-code) — GUARDED
> `REMOVE_TAXPAID` volume cannot re-enter in-bond via an ordinary compensating reversal; only an explicit, refund-flagged Taxpaid-Returned-to-Bond event re-admits it. This guards the generic reverser (`reverseOperationCore`) against silently corrupting the tax-paid boundary.

**Guarded by:** `npm run verify:taxpaid` (Phase 2) — the reverser refuses REMOVE_TAXPAID, the write-chokepoint admissibility guard blocks the ADJUST re-admission path (CO-1), and only a refund-flagged RETURN_TO_BOND re-admits (§A11).
**Decision:** SYNTHESIS §B.1(iv) — see [[INVARIANTS]] and [[system-map]].
**Applies to:** `src/lib/compliance/`, `src/lib/ledger/`

This note is the machine-readable face of the invariant. The narrative lives in
[[INVARIANTS]] (§ Compliance & migration invariants); the `appliesTo` paths drive the
auto-context hook.
