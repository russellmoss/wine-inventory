---
id: LEDGER-12
group: ledger-projection
severity: critical
enforcedBy: app-code+db-constraint
verify: "npm run verify:one-lot-per-vessel"
decision: "plan-088"
status: guarded
appliesTo:
  - src/lib/ledger/
  - src/lib/vessels/
  - src/lib/transform/
  - src/lib/cellar/
  - src/lib/blend/
tags:
  - invariant
---

# LEDGER-12 — one lot per vessel

> [!danger] Invariant (critical, app-code + db-constraint)
> A vessel holds AT MOST ONE lot. Its contents are one cohesive liquid. The inverse is unbounded
> and stays legal: one lot may occupy MANY vessels.

**Guarded by:** `UNIQUE (tenantId, vesselId)` on `vessel_lot` (every write, always) + the chokepoint
assert + `test/ledger-math.test.ts` in CI. `npm run verify:one-lot-per-vessel` is the cross-tenant
**operational sweep** — it needs live DB access, which CI deliberately does not have, so it is run
before/after a migration or repair rather than on every PR.
**Decision:** plan 088 — see [[INVARIANTS]] and [[system-map]].
**Applies to:** `src/lib/ledger/`, `src/lib/vessels/`, `src/lib/transform/`, `src/lib/cellar/`, `src/lib/blend/`

```
LEGAL                                   ILLEGAL
─────                                   ───────
tank A → one lot                        tank A → two lots
tank A → lot L, 40 barrels → lot L      tank A → lot L + lot M
tank A → lot L, tank B → lot M
```

## Why

Two lots in one tank is a state the physical world does not have — you cannot pour Cabernet into a
tank of Pinot and still have two wines. The app permitted it, so every operation that attaches to a
lot (a chem panel, a tasting note, a sample, a work-order task) had to ask the winemaker "which
lot?", a question with no physical answer. That question was reported three times before anyone
fixed the state instead of the prompt.

InnoVint and Vintrace both forbid it. InnoVint's own "How to Split a Lot" guidance tells users to
round-trip volume through a *phantom vessel* — you need a fake vessel precisely because a real one
cannot hold two lots.

## How it is enforced

1. **In the cores** — `decideCombineRoute` (`src/lib/ledger/combine.ts`) resolves identity at the
   moment of combination for every operation that puts wine into an occupied vessel: **absorb** into
   the resident (the default, the physical truth), **keep** (requires a different destination), or
   **mint a new blend lot**. Absorbing is refused across tax class, ownership, bond, physical form
   and ferment state. These refusals are RETURNED, never thrown, so they survive prod redaction.
2. **At the ledger chokepoint** — `assertNoWorsenedCoResidence` in `writeLotOperation`, on the
   POST-FOLD balances. Defence in depth: reaching it means a core skipped its preflight, so the
   message is written for an engineer, not a winemaker.
3. **At the database** — `UNIQUE (tenantId, vesselId)` on `vessel_lot`
   (`20260721160000_one_lot_per_vessel`). Structural, so scripts and imports cannot bypass it.

## The chokepoint rule is MONOTONE, and that is deliberate

The app guard refuses an operation that would leave a vessel holding **more** lots than it started
with — not one that merely fails to be perfect.

Enforcing "must be exactly one" would refuse *every* operation on an already-mis-recorded vessel,
**including the rack that would empty it**. A legacy import lands three lots in a barrel and the
barrel is frozen: unusable, and unfixable through the app. Monotone instead means bad state can only
shrink, so an estate heals over time and can never regress.

With the DB constraint in place that state is unreachable anyway. The monotone rule is what keeps
the app sane if it is ever reached another way — a restored backup, a direct import, the constraint
dropped.

## Notes

- **Bottled wine is not affected.** `BOTTLE_STORAGE` ledger legs carry `vesselId: null`, so
  sparkling/en-tirage inventory never appears in `vessel_lot`.
- **A composition-shaped legacy import must map components → ONE lot**, not one lot per component.
  Bhutan's Barrel 18 was exactly this: a Day-Zero migration turned three `vessel_component` rows —
  a real three-variety blend — into three lots. What is *in* the vessel belongs in
  `vessel_component` and the lot's lineage, never in extra `vessel_lot` rows.
- **Partitioned vessels** (T-barrels, divided tanks) are modelled as distinct `vesselId`s
  (`B18-A`, `B18-B`), never as co-residence.

This note is the machine-readable face of the invariant. The narrative lives in [[INVARIANTS]];
the guard status is asserted by `npm run verify:invariants`; the `applies-to` paths drive the
auto-context hook that surfaces this rule before any edit to the governed code.
