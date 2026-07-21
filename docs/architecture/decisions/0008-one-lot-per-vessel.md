# ADR 0008 — A vessel holds one lot; a lot may occupy many vessels

- **Date:** 2026-07-21
- **Status:** accepted
- **Invariant:** [[LEDGER-12-one-lot-per-vessel]] · **Plan:** `docs/plans/2026-07-21-088-refactor-one-lot-per-vessel-plan.md`

## Context

A winemaker submitted a thumbs-down on the assistant. The app had asked him *"you have 3 lots in
one tank — which lot do you want to transfer?"* His words: **"stupid and physically impossible."**

He is right, and that is the whole finding. You cannot transfer one third of the liquid in a tank
and leave the other two thirds behind. The question has no physical answer. The system was asking
it because the DATA MODEL permitted a state the cellar cannot be in: several `vessel_lot` rows for
one `vesselId`.

The same complaint had been reported **three times** (`cmruoc3yk…`, `cmrsrs02…`, and one earlier),
and answered three times with an instance-level fan-out — one more surface taught to cope with
co-residence. Every "which lot?" picker in the app existed only to resolve a state the domain
should never have allowed. We had been fixing instances of a class defect.

**Prior art, checked before deciding** (vendored InnoVint + Vintrace documentation):

- Neither product models a vessel as a bag of lots. Both treat **the vessel's contents as one wine**.
- Intake stays granular — a pick, a press fraction, a barrel lot each arrive as their own lot.
- **Identity is decided at the moment of combination**, not deferred: combining either grows an
  existing wine or mints a new blend, and the operator chooses which.
- "Some combined, some separate" is expressed by **DESTINATION** — separate wines go to separate
  vessels — never by two wines sharing one tank.
- Vintrace keeps a **composition** record (variety / vineyard / vintage shares) on the vessel, which
  is how a combined wine still answers "what am I made of".

Our `vessel_component` table is already that composition record. We had the right primitive and
were not using it as the answer.

**The Bhutan diagnosis, which we initially got backwards.** Barrel 18 held three lots (Merlot 100 L,
Cab Franc 75 L, Cab Sauv 50 L) and was first written off as a data-entry error — "nobody commingles
three varietals at exactly 100/75/50." Investigation showed all three came from
`system@day-zero-migration` with the note *"Day-Zero legacy seed from vessel_component"*. The OLD
model was a COMPOSITION table, and the migration turned each component ROW into its own LOT. Barrel
18 was never three wines. It is one three-variety Bordeaux blend, and it is the **fossil of exactly
the modelling error this ADR fixes**. It now reads `2025-BL-BJB · 45% Merlot · 33% Cabernet Franc ·
22% Cabernet Sauvignon`.

## Decision

**A vessel holds AT MOST ONE lot. A lot may occupy MANY vessels.**

The second half matters as much as the first: one wine spread across twelve barrels is one lot in
twelve vessels, not twelve lots. Enforced at `writeLotOperation` — the single write site for
`vessel_lot` — and by a DB unique index on `(tenantId, vesselId)`.

Five commitments follow:

1. **Intake stays granular.** Picks, press fractions and barrel lots each arrive as their own lot.
   Nothing about this decision pushes merging earlier.
2. **Identity is decided at the moment of combination**, by one shared function
   (`decideCombineRoute`) that every combining operation calls: rack, crush, press, saignée,
   topping, blend. Three outcomes — KEEP (destination was empty), ABSORB (the resident wine grows
   and keeps its identity), NEW_BLEND (a new lot is minted).
3. **"Some combined, some separate" is expressed by DESTINATION.** Want them separate? Send them to
   separate vessels. There is no in-tank separation.
4. **Lineage and composition preserve what was combined.** `LotLineage` records the parentage;
   `vessel_component` records the makeup, attributed through lineage by `composeLeaves`. The
   winemaker sees "91% Syrah · 9% Cabernet Sauvignon" on the tank.
5. **The invariant is enforced at the ledger**, not in each UI.

## Enforcement is MONOTONE, not absolute

The guard is `assertNoWorsenedCoResidence(current, next)`: an operation may never INCREASE the
number of lots in a vessel. It does not demand that every vessel already be clean.

This was chosen over a hard "must be perfect" assert because the alternative would have bricked
writes on any tenant with a pre-existing violation the moment the code deployed. "Never make it
worse" turns the invariant on safely everywhere, and the DB unique index (added after the live
violations were collapsed) makes new ones impossible.

## What was rejected

- **Co-residence with a `keepSeparate` flag.** This is the fiction with a bow on it. Two wines in
  one tank are one liquid whatever a boolean says; the flag would have made every downstream
  read — cost, TTB, composition, chemistry — ask "is this the pretend-separate kind?"
- **A blanket BLEND repair.** Collapsing every violation as a "blend" would have booked TTB
  blending activity (5120.17 lines 5/20) that never happened. Repairs classify per vessel.
- **Row surgery on `vessel_lot`.** The ledger is append-only (LEDGER-10). Repairs are compensating
  operations, in the ledger, with an actor and a note — never UPDATE/DELETE on a projection.
- **Partitioned vessels modelled as co-residence.** A divided tank is real equipment. The
  sanctioned representation is **distinct `vesselId`s** (one per partition), which the invariant
  already allows and which keeps volume, capacity and fill honest per side.

## Consequences

- **Every "which lot?" picker in the app is deleted** — assistant, work-order builder, cellar
  record forms, chemistry capture, ferment monitor. Naming a vessel names its wine.
- **Plan 060's whole-tank fan-out is deleted.** It wrote one analysis panel per co-resident lot,
  sharing a `vesselReadingGroupId`, because a tank reading had no single owner. One reading is now
  one row. Historical groups still collapse to one physical reading on the vessel views.
- **A refusal must always offer the legal move.** Refusing an ABSORB across tax class or ownership
  without an escape would be a dead end (UX principle 2), so each refusal ships with its escape —
  usually "create a new blend lot".
- **Composition became load-bearing**, which exposed a real bug: the fold silently wrote NOTHING for
  a blend-lot destination, because it resolved origins only for lots with a direct origin. Fixed in
  the same plan (`composeLeaves` for every lot); without it this ADR's central promise — that the
  Cabernet stays visible — would have decayed exactly where absorbs happen.
- **Provenance gaps are now visible.** 15 live vessels hold wine with no recorded origin at all.
  They read "100% Source unrecorded" rather than being renormalised into a confident lie.

## Verification

`npm run verify:one-lot-per-vessel` (all tenants, CI), the `(tenantId, vesselId)` unique index,
`npm run verify:vessel-composition`, and `npm run verify:vessel-composition-readout`.
