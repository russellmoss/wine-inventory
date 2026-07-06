---
id: BOND-1
group: compliance
severity: critical
enforcedBy: app-code
decision: "council 3.5 / §B.1(iv)"
status: planned
appliesTo:
  - src/lib/compliance/
  - src/lib/ledger/
tags:
  - invariant
---

# BOND-1 — bond isolation (line-scoped, time-aware, symmetric)

> [!danger] Invariant (critical, app-code) — PLANNED
> Every tenant-scoped ledger position belongs to exactly one bond; bond affiliation is posted at the operation/line level and is time-aware (the movement carries source + destination bond), derived point-in-time from the ledger like `deriveTaxClass()`. Any lot-level "home bond" is a projection only, never the compliance source of truth. A cross-bond movement posts symmetric Removed-in-Bond / Received-in-Bond to both bonds' reports, atomically within a single ledger transaction (one `runLedgerWrite` via a `…Tx` core) — a one-sided or two-transaction post is a violation.

**Guarded by:** _planned_ — guard `npm run verify:bond` lands in **Phase 2**, which flips this note to `status: guarded`. Currently unguarded by design.
**Decision:** council 3.5 / SYNTHESIS §B.1(iv) — see [[INVARIANTS]] and [[system-map]].
**Applies to:** `src/lib/compliance/`, `src/lib/ledger/`

This note is the machine-readable face of the invariant. The narrative lives in
[[INVARIANTS]] (§ Compliance & migration invariants); `npm run verify:invariants` asserts
guarded invariants' guards exist; the `appliesTo` paths drive the auto-context hook.
