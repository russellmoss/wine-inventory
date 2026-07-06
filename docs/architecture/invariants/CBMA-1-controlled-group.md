---
id: CBMA-1
group: compliance
severity: high
enforcedBy: app-code
decision: "§B.1(iv) / reviewer mod 3"
status: deferred
appliesTo:
  - src/lib/compliance/
tags:
  - invariant
---

# CBMA-1 — controlled-group credit apportionment (DEFERRED)

> [!warning] Invariant (high, app-code) — DEFERRED
> Tenants in a common controlled group cannot each independently claim the full 30k/100k/750k CBMA ladder — the credit is apportioned across the group. `excise.ts:66-74` already parameterizes this as "v2".

**Guarded by:** _deferred_ — no code in the FIX_RUNBOOK phases; **activate when multi-entity tenants appear.** This note stays unguarded (no `verify:`) until then.
**Decision:** SYNTHESIS §B.1(iv) / FIX_RUNBOOK reviewer modification 3 — see [[INVARIANTS]] and [[system-map]].
**Applies to:** `src/lib/compliance/`

This note is the machine-readable face of the invariant. The narrative lives in
[[INVARIANTS]] (§ Compliance & migration invariants); the `appliesTo` paths drive the
auto-context hook.
