---
id: MIGRATE-1
group: migration
severity: critical
enforcedBy: app-code
decision: "council 3.1 / Decision 4 / D11"
status: guarded
verify: "npm run verify:migration"
appliesTo:
  - src/lib/migration/
  - scripts/verify-migration.ts
tags:
  - invariant
---

# MIGRATE-1 - migration is seed-not-replay

> [!danger] Invariant (critical, app-code) - GUARDED
> Exactly one migration `SEED` per lot/vessel participates in the volume/cost fold
> (cutover balances). Legacy operational history is ingested only into the read-only
> archive and is never folded into `LotOperationLine`, `VesselLot`, or the cost DAG.
> An import cannot publish to the live tenant while any reconciliation delta remains
> unresolved, where unresolved means neither reconciled to zero nor explicitly
> accepted by the operator as a named exception in the reconciliation pack.

**Guarded by:** `npm run verify:migration`, which proves the draft -> reconcile ->
sign-off -> publish path, exactly-once seed posting, archive-only legacy rows, and
blocked unresolved deltas.

**Decision:** council 3.1 (two-track model) / FIX_RUNBOOK Decision 4 / D11 - see
[[INVARIANTS]] and [[system-map]].

**Applies to:** `src/lib/migration/` and `scripts/verify-migration.ts`.

This note is the machine-readable face of the invariant. The narrative lives in
[[INVARIANTS]] (Compliance & migration invariants); `npm run verify:invariants`
asserts guarded invariants' guards exist.
