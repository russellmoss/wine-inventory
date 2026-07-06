---
id: MIGRATE-1
group: migration
severity: critical
enforcedBy: app-code
decision: "council 3.1 / Decision 4 / D11"
status: planned
appliesTo:
  - scripts/migrate-legacy-lots.ts
tags:
  - invariant
---

# MIGRATE-1 — migration is seed-not-replay

> [!danger] Invariant (critical, app-code) — PLANNED
> Exactly one migration `SEED` per lot/vessel participates in the volume/cost fold (cutover balances). Legacy operational history is ingested ONLY into the read-only archive and is NEVER folded (excluded from `foldLines()` / `VesselLot` / the cost DAG). An import cannot publish to the live tenant while any reconciliation delta remains unresolved — "unresolved" = neither reconciled to zero nor accepted by the operator as a named exception in the reconciliation pack (not a numeric tolerance). Operationalizes D11.

**Guarded by:** _planned_ — guard `npm run verify:migration` lands in **Phase 3**, which flips this note to `status: guarded` and confirms the enforcing path. Currently unguarded by design.
**Decision:** council 3.1 (two-track model) / FIX_RUNBOOK Decision 4 / D11 — see [[INVARIANTS]] and [[system-map]].
**Applies to:** `scripts/migrate-legacy-lots.ts` (the migration lib does not exist yet; this `appliesTo` is the closest existing anchor — the auto-context hook stays inert for this rule until the Phase-3 migration code lands, which is correct for a planned invariant).

This note is the machine-readable face of the invariant. The narrative lives in
[[INVARIANTS]] (§ Compliance & migration invariants); `npm run verify:invariants` asserts
guarded invariants' guards exist.
