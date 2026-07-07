---
id: BOND-1
group: compliance
severity: critical
enforcedBy: app-code
verify: "npm run verify:bond"
decision: "council 3.5 / §B.1(iv)"
status: guarded
appliesTo:
  - src/lib/compliance/
  - src/lib/ledger/
tags:
  - invariant
---

# BOND-1 — bond isolation (line-scoped, time-aware, symmetric)

> [!danger] Invariant (critical, app-code) — GUARDED
> Every tenant-scoped ledger position belongs to exactly one bond; bond affiliation is posted at the operation/line level and is time-aware (the movement carries source + destination bond), derived point-in-time from the ledger like `deriveTaxClass()`. Any lot-level "home bond" is a projection only, never the compliance source of truth. A cross-bond movement posts symmetric Removed-in-Bond / Received-in-Bond to both bonds' reports, atomically within a single ledger transaction (one `runLedgerWrite` via a `…Tx` core) — a one-sided or two-transaction post is a violation.

**Guarded by:** `npm run verify:bond` (Phase 2) — symmetric §A15/§A7 transfer posting across both bonds' reports, point-in-time `deriveBond`, per-bond chains, lineage-child bond, cross-bond-blend refusal, backdated-transfer cascade.
**Decision:** council 3.5 / SYNTHESIS §B.1(iv) — see [[INVARIANTS]] and [[system-map]].
**Applies to:** `src/lib/compliance/`, `src/lib/ledger/`

This note is the machine-readable face of the invariant. The narrative lives in
[[INVARIANTS]] (§ Compliance & migration invariants); `npm run verify:invariants` asserts
guarded invariants' guards exist; the `appliesTo` paths drive the auto-context hook.
