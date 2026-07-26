---
id: SPRAY-2
group: spray-record
severity: critical
enforcedBy: core
verify: "npm run verify:spray-record"
decision: "S3a KD-4 / KD-14 (council G1)"
status: guarded
appliesTo:
  - src/lib/spray/
tags:
  - invariant
---

# SPRAY-2 — decisions replay under facts-as-of-then

> [!danger] Invariant (critical, core)
> Every material line freezes a facts snapshot (AIs, resistance groups, PHI/REI, rainfast,
> mobility, `factsRevision` + `factsAsOf`) at entry. A correction COPIES the predecessor's
> snapshot VERBATIM — it re-resolves ONLY a line whose own product identity changed (KD-14,
> reversing an earlier draft per council G1). Re-resolving on correction would repaint a July
> spray with November's registration data. A monthly reference refresh must never silently change
> what a past decision meant (rule §3.8).

**Guarded by:** `npm run verify:spray-record`
**Decision:** S3a KD-4/KD-14 — see [[INVARIANTS]].
**Applies to:** `src/lib/spray/`
