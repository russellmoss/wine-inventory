---
id: TAXCLASS-1
group: compliance
severity: critical
enforcedBy: app-code
decision: "§B.1(iv)"
status: planned
appliesTo:
  - src/lib/compliance/
  - src/lib/transform/
tags:
  - invariant
---

# TAXCLASS-1 — cross-class blend posts symmetrically

> [!danger] Invariant (critical, app-code) — PLANNED
> A blend/rack/topping across ≥2 tax classes posts symmetric Produced-by / Used-for-blending movements (§A 5/20/24/25), atomic within one transaction; the result carries the destination (receiving) lot's tax class and the winemaker is warned when sources cross classes.

**Guarded by:** _planned_ — guard lands in **Phase 2** (`npm run verify:taxclass`, or folded into `verify:ttb`), which flips this note to `status: guarded`. Currently unguarded by design.
**Decision:** SYNTHESIS §B.1(iv) — see [[INVARIANTS]] and [[system-map]].
**Applies to:** `src/lib/compliance/`, `src/lib/transform/`

This note is the machine-readable face of the invariant. The narrative lives in
[[INVARIANTS]] (§ Compliance & migration invariants); the `appliesTo` paths drive the
auto-context hook. The mechanism for assigning a class to a brand-new blend lot is a Phase-2
design detail — this invariant fixes only that the class carried is the receiving lot's.
