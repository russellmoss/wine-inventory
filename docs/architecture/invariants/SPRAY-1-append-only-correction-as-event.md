---
id: SPRAY-1
group: spray-record
severity: critical
enforcedBy: database
verify: "npm run verify:spray-record"
decision: "S3a KD-1 / KD-2"
status: guarded
appliesTo:
  - prisma/schema.prisma
  - src/lib/spray/
tags:
  - invariant
---

# SPRAY-1 — spray history is append-only, corrected as an event

> [!danger] Invariant (critical, database)
> A spray record's CONTENT is immutable: an in-place edit is refused by a Postgres BEFORE UPDATE
> trigger on all six append-only tables, and a mistake is fixed by APPENDING a new revision
> (`supersedesApplicationId`, at-most-once via a unique) — a VOID is a successor row, not the
> absence of one. Only bookkeeping (`status`, `supersededByApplicationId`) and DERIVED columns
> (`driedBeforeRain*`) are ever updated, each on an explicit per-table allowlist.

**Guarded by:** `npm run verify:spray-record`
**Decision:** S3a KD-1/KD-2 — see [[INVARIANTS]] and the S3a plan.
**Applies to:** `prisma/schema.prisma`, `src/lib/spray/`

This note is the machine-readable face of the invariant. The narrative lives in
[[INVARIANTS]]; the guard status is asserted by `npm run verify:invariants`.
