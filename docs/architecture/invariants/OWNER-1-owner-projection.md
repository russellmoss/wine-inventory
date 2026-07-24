---
id: OWNER-1
group: ownership
severity: critical
enforcedBy: app-code
verify: "npm run verify:owner-model"
decision: "plan 093 (custom-crush data foundation) / council C1+C2"
status: guarded
appliesTo:
  - src/lib/owner/
  - src/lib/ledger/
  - src/lib/compliance/bond.ts
tags:
  - invariant
---

# OWNER-1 — ownerId is a maintained projection (never re-derived from lineage)

> [!danger] Invariant (critical, app-code) — GUARDED
> A lot's `ownerId` is SCALAR (one owner per lot; NULL = Estate/facility) and is a MAINTAINED PROJECTION, like `vessel_component` — not immutable ledger truth. The immutable record is the `CHANGE_OWNERSHIP` operation; the column is a re-stampable cache. Descendant rows (lot_operation_line, vessel_lot, bottled_lot_state, barrel_fill) carry their lot's CURRENT `ownerId`, read from the column at the write chokepoint and NEVER re-derived by walking lineage — re-deriving would let the next blend resurrect a pre-CHANGE_OWNERSHIP owner (eng-review P1). A derived lot takes the dominant owner of its sources; a cross-owner blend is ALLOWED (the minority is billed via BILLABLE_WINE_CONSUMED, never refused — council C2). `CHANGE_OWNERSHIP` is CONDITIONAL on the bond delta: same bond = a title-only op with ZERO TTB; host↔AP (distinct BWN) = title + a symmetric transfer-in-bond (council C1). Compliance keys off BOND, not ownerId — but an AP owner's bond takes precedence in `deriveBond` (OWNER-scope RLS itself is plan 092, NOT this invariant).

**Guarded by:** `npm run verify:owner-model` — descendant rows carry the owner (not lineage), inheritance across blend + reversal, conditional CHANGE_OWNERSHIP (title-only zero-TTB) + reversal, cross-owner blend allow-and-bill + void, AP-owner bond precedence, facility stays NULL.
**Decision:** plan 093 / council C1 (owner≠bond) + C2 (allow-and-bill) — see [[INVARIANTS]] and [[data_model_coalescence]].
**Applies to:** `src/lib/owner/`, `src/lib/ledger/` (the chokepoint owner-fold + the 8 lot.create sites), `src/lib/compliance/bond.ts` (AP precedence).

This note is the machine-readable face of the invariant. The narrative lives in [[INVARIANTS]];
`npm run verify:invariants` asserts guarded invariants' guards exist; the `appliesTo` paths drive the
auto-context hook. NOTE: the finished-goods / 1:1 owner-row stamping (plan 093 "4c") is an additive
follow-on for plan 092's enforcement surface — behaviour-preserving (all-estate → NULL), not yet stamped.
