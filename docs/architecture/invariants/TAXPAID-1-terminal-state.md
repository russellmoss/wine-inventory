---
id: TAXPAID-1
group: compliance
severity: critical
enforcedBy: app-code
decision: "§B.1(iv)"
status: planned
appliesTo:
  - src/lib/compliance/
  - src/lib/ledger/
tags:
  - invariant
---

# TAXPAID-1 — taxpaid is a terminal one-way state

> [!danger] Invariant (critical, app-code) — PLANNED
> `REMOVE_TAXPAID` volume cannot re-enter in-bond via an ordinary compensating reversal; only an explicit, refund-flagged Taxpaid-Returned-to-Bond event re-admits it. This guards the generic reverser (`reverseOperationCore`) against silently corrupting the tax-paid boundary.

**Guarded by:** _planned_ — guard lands in **Phase 2** (`npm run verify:taxpaid`, or folded into `verify:excise`), which flips this note to `status: guarded`. Currently unguarded by design.
**Decision:** SYNTHESIS §B.1(iv) — see [[INVARIANTS]] and [[system-map]].
**Applies to:** `src/lib/compliance/`, `src/lib/ledger/`

This note is the machine-readable face of the invariant. The narrative lives in
[[INVARIANTS]] (§ Compliance & migration invariants); the `appliesTo` paths drive the
auto-context hook.
