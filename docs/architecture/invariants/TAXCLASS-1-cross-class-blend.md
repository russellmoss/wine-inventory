---
id: TAXCLASS-1
group: compliance
severity: critical
enforcedBy: app-code
verify: "npm run verify:taxclass"
decision: "§B.1(iv)"
status: guarded
appliesTo:
  - src/lib/compliance/
  - src/lib/transform/
tags:
  - invariant
---

# TAXCLASS-1 — cross-class blend posts symmetrically

> [!danger] Invariant (critical, app-code) — GUARDED
> A blend/rack/topping across ≥2 tax classes posts symmetric Produced-by / Used-for-blending movements (§A 5/20/24/25), atomic within one transaction; the result carries the destination (receiving) lot's tax class and the winemaker is warned when sources cross classes.

**Guarded by:** `npm run verify:taxclass` (Phase 2) — §A24/§A10 change postings, cross-class §A5/§A20 + warning, and the R6 no-double-count (a same-period blend-child class change is suppressed; the report foots).
**Decision:** SYNTHESIS §B.1(iv) — see [[INVARIANTS]] and [[system-map]].
**Applies to:** `src/lib/compliance/`, `src/lib/transform/`

This note is the machine-readable face of the invariant. The narrative lives in
[[INVARIANTS]] (§ Compliance & migration invariants); the `appliesTo` paths drive the
auto-context hook. The mechanism for assigning a class to a brand-new blend lot is a Phase-2
design detail — this invariant fixes only that the class carried is the receiving lot's.
