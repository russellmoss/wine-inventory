---
id: AMEND-1
group: compliance
severity: critical
enforcedBy: app-code
verify: "npm run verify:ttb"
decision: "§B.1(iv)"
status: guarded
appliesTo:
  - src/lib/compliance/
tags:
  - invariant
---

# AMEND-1 — amended-chain integrity

> [!danger] Invariant (critical, app-code) — GUARDED
> Correcting a FILED period marks all later FILED reports in that form + bond chain `NEEDS_AMENDMENT` and regenerates begin-balances down the chain (carry-forward makes this cheap).

**Guarded by:** `npm run verify:ttb` (Phase 2) — the AMEND-1 3-period chain: a backdated op flips the whole downstream (formType, bond) FILED chain to `NEEDS_AMENDMENT`, the carry-forward reads through a marked report, and re-filing picks up the corrected upstream onHandEnd. 5120.17-only.
**Decision:** SYNTHESIS §B.1(iv) — see [[INVARIANTS]] and [[system-map]].
**Applies to:** `src/lib/compliance/`

This note is the machine-readable face of the invariant. The narrative lives in
[[INVARIANTS]] (§ Compliance & migration invariants); the `appliesTo` paths drive the
auto-context hook. Open Phase-2 design question: whether begin-balance regeneration runs
synchronously or as a queued job with a `NEEDS_CALCULATION` lock at scale.
