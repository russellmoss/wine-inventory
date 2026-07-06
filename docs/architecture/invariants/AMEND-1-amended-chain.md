---
id: AMEND-1
group: compliance
severity: critical
enforcedBy: app-code
decision: "§B.1(iv)"
status: planned
appliesTo:
  - src/lib/compliance/
tags:
  - invariant
---

# AMEND-1 — amended-chain integrity

> [!danger] Invariant (critical, app-code) — PLANNED
> Correcting a FILED period marks all later FILED reports in that form + bond chain `NEEDS_AMENDMENT` and regenerates begin-balances down the chain (carry-forward makes this cheap).

**Guarded by:** _planned_ — guard lands in **Phase 2** (extends `verify:ttb` / `verify:excise`), which flips this note to `status: guarded`. Currently unguarded by design.
**Decision:** SYNTHESIS §B.1(iv) — see [[INVARIANTS]] and [[system-map]].
**Applies to:** `src/lib/compliance/`

This note is the machine-readable face of the invariant. The narrative lives in
[[INVARIANTS]] (§ Compliance & migration invariants); the `appliesTo` paths drive the
auto-context hook. Open Phase-2 design question: whether begin-balance regeneration runs
synchronously or as a queued job with a `NEEDS_CALCULATION` lock at scale.
