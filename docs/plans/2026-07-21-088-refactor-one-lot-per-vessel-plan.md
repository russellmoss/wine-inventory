---
title: One lot per vessel — a vessel is one cohesive liquid
type: refactor
status: draft
date: 2026-07-21
branch: refactor/one-lot-per-vessel
branches: [refactor/one-lot-per-vessel (units 1-13), refactor/one-lot-per-vessel-sweep (units 14-19)]
depth: deep
units: 19
council: council-feedback-088-one-lot-per-vessel.md
reviews: [council (codex+gemini), plan-eng-review, plan-design-review]
---

## Overview

A vessel's contents are **one cohesive liquid**. Today the app lets a tank hold three lots
at once and then asks the winemaker "which lot?" on every operation that attaches to a lot —
a question with no physical answer. This plan makes one-lot-per-vessel a **hard invariant**
enforced at the ledger chokepoint and at the database, moves the identity decision to the
moment of combination (where InnoVint and Vintrace both put it), repairs the live vessels that
violate it, and **deletes** every "which lot?" picker rather than fan-out-patching them.

A lot still spans **many** vessels — 40 barrels, a tank plus a puncheon, any mix. That
direction is correct today and stays. Only many-lots-per-vessel is wrong.

**Revision note (post-council):** hardened by a Codex + Gemini review — ABSORB now refuses
across tax class, composition is written by one shared core, and the repair pre-flights
in-flight work orders. The council also asked whether the live co-residence is *real* wine;
three of the five vessels are Day-Zero data entry (see Problem Frame). **Russell's call: repair
them all uniformly — Bhutan's data will be re-accounted by hand afterwards.** That removes the
plan's single highest-risk step.

## Problem Frame

**Reported by:** Russell, assistant thumbs-down `cmruoc3yk0000jf0491y8hety` (2026-07-21), P0.

> "If we say we are going to rack a tank and there are multiple lots in the tank, you can't
> choose which lot, you're doing the whole tank of liquid… they become a new lot. They are one
> cohesive liquid that can't be separated again and the system constantly asks me to choose
> which lot I want to do stuff to across lots of things like ops and analyses etc."

**Who has this problem:** every winemaker, on every co-fermented or blended vessel, on every
operation that is not a rack.

**This is the third report of the same defect.** Feedback `cmrsrs02` (2026-07-20), recorded at
[TODOS.md:335](../../TODOS.md#L335): *"the tank is now one lot, even though it's a collection of
3 — but we still are required to select [one]."* The responses so far: Plan 060 fanned out
`record_measurement`; a TODO proposed fanning out `record_tasting_note`; PR #444 built that
fan-out. **Three instance-level answers to one class-level defect.** That pattern — fixing the
instance because the ticket describes an instance — is the exact failure mode the feedback-loop
class-sweep work was built to catch.

**What happens if we do nothing:** a fourth fan-out, then a fifth. Each makes the fiction more
tolerable and none removes it.

**Product pressure test:** this is a *modeling* problem wearing a UX costume. The tell —
the racking path is already correct ([`rackWineTx`](src/lib/vessels/rack-core.ts:87) draws
proportionally across every resident and takes no lot parameter). The pickers exist purely to
resolve a state the domain does not permit.

### What the live data actually says

A read-only audit (2026-07-21) found **5** violating vessels. Their shape is diagnostic:

```
org_bhutan_wine_co  BARREL 18   3 lots   225.00 / 225.00 L   ← PRODUCTION
org_demo_winery     BARREL B4   3 lots   225.00 / 225.00 L
org_demo_winery     BARREL B5   3 lots   228.00 / 228.00 L
org_demo_winery     TANK   T7   3 lots  5572.00 / 10000.00 L
org_demo_winery     TANK   T5   2 lots  6995.00 / 12000.00 L

BARREL 18 full history:
  op#2 SEED 2026-06-27  2025-BJ-CF   75.00 L
  op#3 SEED 2026-06-27  2025-BJ-MR  100.00 L
  op#4 SEED 2026-06-27  2025-GS-CS   50.00 L
```

Three `SEED` ops on one day, three different wines (Merlot, Cab Franc, Cab Sauvignon across
two vineyards), summing to **exactly** the barrel's capacity. B4 and B5 show the same
signature. **Nobody commingles three varietals in one barrel at exactly 100/75/50 L.** This is
onboarding data entry, not physics.

Worth knowing, but **not worth building around**: Russell's call is to collapse all five
uniformly and re-account Bhutan's three barrel lots by hand afterwards. Recorded here so nobody
later reads the merged Bhutan lot as a real field blend.

Ops that created co-residence overall: `RACK 8 · SEED 5 · CRUSH 5 · CORRECTION 2 · PRESS 1`.

### Prior art

Read in full from the vendored `innovint-docs/` and `vintrace-docs/`:

- InnoVint's [How to Split a Lot](../../innovint-docs/guidance-faqs/frequently-asked-questions/how-to-split-a-lot.md)
  instructs users to round-trip volume through a **"phantom" vessel**. You need a fake vessel
  because a vessel cannot hold two lots — the invariant stated by its absence.
- InnoVint resolves identity at **every movement**: *Retain lot code · Combine with existing lot
  (this creates a new blend) · Create a new lot*
  ([how-to-record-a-rack.md](../../innovint-docs/make/movement-actions/how-to-record-a-rack.md)).
- Combining **is** homogenization: *"InnoVint assumes that all weight drained and pressed within
  a single action is homogenized (the composition is blended) in the press"*
  ([drain-and-press.md](../../innovint-docs/harvest/harvest-workflow-fermentation-tracking/drain-and-press.md)).
- Their tax-class warning, which this plan now encodes: *"If you blend into an existing lot
  across tax classes, the TTB Report may not capture Lines 5 and 20 correctly"*
  ([how-to-record-a-blend.md](../../innovint-docs/make/movement-actions/how-to-record-a-blend.md)).
- Work orders may defer the destination: *"let cellar staff choose vessels"* — the pattern that
  keeps "keep separate" workable at planning time.
- Vintrace assigns each extraction fraction a **Vessel + Batch** pair
  ([crush-and-extraction.md](../../vintrace-docs/harvest-vintage/crush-and-press/crush-and-extraction.md));
  blend detail lives as a **composition** on the batch
  ([fixing-a-wine-s-composition.md](../../vintrace-docs/vintrace-web/winemaking/fixing-a-wine-s-composition.md)).

## Requirements

- **MUST:** a vessel holds **at most one** lot, enforced at `writeLotOperation` **and** by a
  database constraint on `vessel_lot`.
- **MUST:** a lot may still occupy **many** vessels of any type, with no cap.
- **MUST:** every operation putting liquid into an occupied vessel resolves identity *in the
  operation*: **absorb into the resident lot** (default) · **keep this lot** (different
  destination) · **mint a new blend lot** (explicit escape).
- **MUST:** ABSORB is **refused** across differing tax class or ownership — those must mint a
  new blend lot so the class is re-derived (TTB 5120.17 lines 5/20).
- **MUST:** every ABSORB writes ledger lines, `LotLineage`, `VesselComponent`, and
  `provenanceComplete` in **one transaction**, through one shared core.
- **MUST:** live violations are repaired through real ledger operations, never row surgery.
- **MUST:** the repair pre-flights in-flight work-order tasks (**3 exist today**).
- **MUST:** existing invariants stay green — LEDGER-4 (capacity), LEDGER-6 (balanced),
  LEDGER-10 (immutable ops), COST-1 (cost conservation), the TTB/tax-class folds.
- **MUST:** every "which lot?" picker is **deleted**, not left unreachable.
- **SHOULD:** a work-order draft may leave the destination vessel unresolved; the invariant
  binds at **execution**, not at draft.
- **SHOULD:** vessel screens present one liquid with a composition breakdown.
- **NICE:** a composition readout mirroring Vintrace's percentage view.

## Scope Boundaries

**In scope:** the `vessel_lot` projection and its single writer; every core that can post a
positive vessel-bearing line; every lot-resolution seam and its UI; the live repair; the
invariant register note and a new `verify:*` guard.

**Out of scope:**
- **Bottled / sparkling inventory.** `BOTTLE_STORAGE` legs always carry `vesselId: null`
  ([sparkling/plan.ts:51](src/lib/sparkling/plan.ts:51)) — verified across every writer — so
  `vessel_lot` is purely liquid-in-vessel and `BottledLotState` is untouched.
- **Partitioned vessels** (T-barrels, divided tanks). Raised in council; the live data shows no
  such usage. If it ever appears, the answer is distinct `vesselId`s (`B18-A`, `B18-B`), not
  co-residence. Recorded in the ADR as the sanctioned escape.
- **Retroactive composition correction** (Vintrace's "Fixing a Wine's Composition") — separate plan.
- **Renaming lots to blend codes on absorb** — absorb keeps the resident's identity by design.
- **Consumable/supply lots**; **multi-vessel lot bulk-action UX**.

## Research Summary

### Codebase patterns

**The chokepoint is singular.** `vessel_lot` has exactly **one** write site —
[`ledger/write.ts:258-270`](src/lib/ledger/write.ts:258), the projection diff inside
`writeLotOperation`. Every core reaches it via `runLedgerWrite`. The guard goes there.

**Functional-zero dust cannot break the unique index** — council raised this; it is settled.
[`foldLines`](src/lib/ledger/math.ts:66) sweeps any residual `<= FUNCTIONAL_ZERO_L` (0.01) out
of the map and [`write.ts:262`](src/lib/ledger/write.ts:262) deletes the row. **Live dust-row
count across all tenants: 0.** A plain `UNIQUE` is therefore safe *and* stronger than a partial
index — it would surface a future dust leak instead of hiding it.

**Primitives that already exist.** Nothing needs inventing:

| Primitive | File | What it does |
|---|---|---|
| `decideRackRoute` | [rack-core.ts:225](src/lib/vessels/rack-core.ts:225) | routes RACK vs BLEND — **but bails to plain RACK when the destination holds >1 lot**, the self-perpetuating leak |
| `blendLotsCore` | [blend-core.ts:74](src/lib/blend/blend-core.ts:74) | `NEW_LOT` / `GROW_EXISTING`, writes `LotLineage` + provenance |
| `crushLotCore` `mode:"ADD"` | [crush-core.ts:26](src/lib/transform/crush-core.ts:26) | "an existing must lot in the vessel ABSORBS the crush, keeping its identity" — InnoVint's *Combine with existing lot*, already built |
| `planLedgerRack` / `computeProportionalDraw` | [ledger/math.ts:101](src/lib/ledger/math.ts:101) | proportional draw across residents |
| `correctOperationCore` | [cellar/correct.ts:29](src/lib/cellar/correct.ts:29) | `SEED` is in `CORRECTABLE` behind an `allowSeed` flag — the repair path for the bad-seed barrels |

**Leaks that create co-residence:**

| Path | File | Current behavior |
|---|---|---|
| RACK into a >1-lot destination | [rack-core.ts:225](src/lib/vessels/rack-core.ts:225) | bails to plain RACK |
| TOPPING | [cellar/topping.ts:17](src/lib/cellar/topping.ts:17) | *"the keg wine becomes co-resident"* — deliberate |
| CRUSH `mode:"NEW"` into occupied | [crush-core.ts:117](src/lib/transform/crush-core.ts:117) | nothing forces `ADD` |
| PRESS fractions | [press-core.ts:144](src/lib/transform/press-core.ts:144) | a fraction can target an occupied vessel |
| SEED | [bulk/actions.ts:122](src/lib/bulk/actions.ts:122) | no occupancy check — **produced 5 of the live violations** |
| SPLIT in place | [split-core.ts:65](src/lib/cellar/split-core.ts:65) | `destVesselId` **defaults to the source vessel** |
| CORRECTION | [rack-core.ts:319](src/lib/vessels/rack-core.ts:319) | restores prior balances, can restore co-residence |

**The pickers** (the deletion list): [chemistry/resolve-lot.ts:65](src/lib/chemistry/resolve-lot.ts:65) ·
[assistant/scope.ts:316](src/lib/assistant/scope.ts:316) + [:336](src/lib/assistant/scope.ts:336) ·
[chemistry/measurements.ts:195](src/lib/chemistry/measurements.ts:195) + [fanout-plan.ts](src/lib/chemistry/fanout-plan.ts) ·
`record-tasting-note.ts` (PR #444) · [work-orders/vessel-lot-resolve.ts:11](src/lib/work-orders/vessel-lot-resolve.ts:11) ·
[nl-resolve.ts:209,394](src/lib/work-orders/nl-resolve.ts:394) ·
[proposal-readiness.ts:414,478,575](src/lib/work-orders/proposal-readiness.ts:575) ·
[cellar/forms/shared.tsx:71](src/components/cellar/forms/shared.tsx:71) ·
[WorkOrderBuilderClient.tsx:335](src/app/(app)/work-orders/new/WorkOrderBuilderClient.tsx:335) ·
[BlendBuilderClient.tsx:306](src/app/(app)/blend/BlendBuilderClient.tsx:306) ·
[FermentMonitor.tsx:70](src/components/ferment/FermentMonitor.tsx:70) ·
assistant prompt rules 36–37 ([prompt.ts:36](src/lib/assistant/prompt.ts:36)).

### Prior learnings

- **`prismaBase` reads on RLS tables return 0 rows** — census and repair must use `runAsSystem`.
- **ONE DATABASE.** `.env` is production; there is no dev DB. `db:push` never reaches prod —
  migrations go `migrate diff` → `migrate deploy`.
- **Server-action `ActionError`s are redacted in prod** — refusals must be **returned** as
  `{ ok: false, error }`, not thrown.
- **Prompt-rule edits are the #1 recurring root cause here** (plan 081 rules 40/45; #387 rule 44).
- Worktrees lack `.env`; the git index is shared — `git commit --only <paths>`.
- `verify:naming` green before **and** after any lot-identity work.

### Council review

Full record in [council-feedback-088-one-lot-per-vessel.md](../../council-feedback-088-one-lot-per-vessel.md).
Codex (types/data layer) and Gemini (domain/UX) converged on the same structural gap: the
invariant was right, the merge was under-specified. Absorbed into Units 3, 4a, 7, 11, 12, 13,
and the risk table. Two findings were settled against live data — the dust-row objection
**refuted** (0 dust rows, sweep verified), and the "is the production co-residence real?"
question **answered no** (see Problem Frame), which rewrote Unit 12.

## Key Decisions

| Decision | Choice | Alternatives considered | Rationale |
|---|---|---|---|
| Where to enforce | **Both** app guard in `writeLotOperation` and DB `UNIQUE (tenantId, vesselId)` | App-only; DB-only; partial index | App gives a domain-language refusal; DB makes it structurally impossible. Dust rows verified absent, so a plain unique is correct and catches future leaks |
| Default combine behavior | **Absorb into the resident lot** | Always mint; always ask | The physical truth; matches InnoVint's default. Minting on every top-up spawns junk lot codes |
| ABSORB across tax class / ownership | **Refuse — force NEW_BLEND** | Allow, warn | InnoVint documents this exact 5120.17 hazard. Silent tax-class inheritance is a filing error |
| Where composition is written | **One shared `absorbIntoResident` core** writing ledger + lineage + `VesselComponent` + provenance in one tx | Per-operation duplication | Council C3: otherwise the ledger is right and the composition UI is silently stale |
| "Keep separate" | **Destination** — a different vessel; drafts may defer it | A `keepSeparate` flag | The flag is the fiction. Deferral is InnoVint's own "let cellar staff choose vessels" |
| Repairing live violations | **One uniform remedy** — the survivor absorbs the rest via a real `BLEND` op | Classify by cause (bad `SEED` → `CORRECTION`) | Russell's call: Bhutan's barrel data gets re-accounted by hand afterwards, so per-cause machinery buys nothing |
| Survivor selection | **Largest-volume resident**, with a per-vessel `--survivor` override | Required signed mapping file | Five vessels, and the outcome is being hand-checked anyway. The override covers the one case where volume is the wrong tiebreak |
| Migration rollback | **Only before Unit 11 lands** | "CORRECTION can always reverse it" | Council C2: after the invariant is on, a reversal would recreate the forbidden state and be refused |
| Fan-out (Plan 060 / PR #444) | **Delete it** | Keep as fallback | With ≤1 lot per vessel a fan-out loops over one item |
| `resolveLotTargetOrChoice` | **Collapse to single resolution**; keep the choice plumbing for ambiguous lot **codes** | Delete entirely | An ambiguous lot code is a real ambiguity; the vessel picker is not |
| Split-in-place >1 child | **Each child needs its own destination**; at most one may stay | Allow sublot co-residence | Same fiction at smaller scale |
| Day-Zero co-residence escape | **A one-off script, never a runtime flag** | `allowCoResidence` in `bulk/actions.ts` | `.env` is production; a live bypass flag is a footgun |
| PR #444 | **Close as superseded** | Merge first | It ships a fan-out this plan deletes, and closes a P0 on a sliver |

## Delivery: two branches

Eng review, scope challenge. 19 units across ~45 files is one unreviewable branch. Split at the
natural seam — the point where the app becomes *correct*:

```
BRANCH 1 — refactor/one-lot-per-vessel        Units 1-13
  the rule, every operation obeying it, the live cleanup, the DB constraint.
  ✅ App is CORRECT here. Co-residence is impossible. Pickers still exist but are
     unreachable (a vessel never has >1 lot, so no branch that asks ever fires).
  ✅ Ships the P0 fix. Safe to stop here indefinitely.

BRANCH 2 — refactor/one-lot-per-vessel-sweep  Units 14-19
  delete the dead pickers, rebuild the vessel screens as one liquid, close the loop.
  ✅ Pure deletion + presentation. No behavior change, no data change.
```

Branch 1 carries all the risk (production data, the DB migration, the invariant). Branch 2
carries all the churn (prompt rules, ~20 UI files). Reviewing them together buries the first in
the second. If branch 2 drags, the winemaker still has the fix.

## Implementation Units

### Unit 1: The invariant as a pure function

**Goal:** A pure predicate over folded balances deciding whether an operation would leave any
vessel holding more than one lot, naming the offending vessel and lots.
**Files:** `src/lib/ledger/math.ts`, `test/ledger-math.test.ts`
**Approach:** `assertOneLotPerVessel(next: VesselLotBalance[])` beside `assertBalanced`
([math.ts:53](src/lib/ledger/math.ts:53)), over **post-fold** balances so draining B while
filling A in one op is legal. Return a structured violation (`vesselId`, `lotIds[]`), not a
boolean. Not wired yet.
**Tests:** legal — empty→1; 1 grows; drain-B-fill-A; one lot into 40 vessels. Illegal — 1 lot
plus a foreign positive line; 3 survivors; a CORRECTION restoring 2. Boundary — a resident
folding to functional zero is not a second lot (asserted against `foldLines`' actual sweep).
**Depends on:** none · **Execution note:** test-first
**Verification:** `npx vitest run test/ledger-math.test.ts`

### Unit 2: The CI guard

**Goal:** A cheap, read-only check that fails when any vessel holds more than one lot.
**Files:** `scripts/verify-one-lot-per-vessel.ts`, `package.json`
**Approach:** `runAsSystem` (RLS — `prismaBase` returns 0 rows here) grouping `vessel_lot` by
`(tenantId, vesselId)` having `count(*) > 1`, joined to vessel and lot codes. Exit non-zero on
any violation. **Current violations only** — no historical attribution (that is Unit 3, per
council: the attribution query is expensive and awkward around corrections).
**Depends on:** none
**Verification:** `npm run verify:one-lot-per-vessel` — expect **5 violations** pre-repair

### Unit 3: The co-residence audit report

**Goal:** A separate, richer report used for repair planning and incident analysis.
**Files:** `scripts/audit-co-residence.ts`
**Approach:** Per violating vessel: residents with volumes, capacity and fill %, the full ledger
history of that vessel, the op types that introduced each resident, whether each lot appears in
**other** vessels, and any work-order tasks referencing it. This is what feeds Unit 12's
pre-flights and what a human reads before `--apply`. Not wired to CI.
**Depends on:** none
**Verification:** run it; output must reproduce the Problem Frame table

### Unit 4: Shared combine vocabulary + routing decision

**Goal:** One pure decision function every combining operation shares, including the legality
checks that make ABSORB safe.
**Files:** `src/lib/ledger/combine.ts` (new), `test/combine-route.test.ts` (new)
**Approach:** `CombineMode = "ABSORB" | "NEW_BLEND" | "KEEP"` and
`decideCombineRoute({ destResidentLotIds, incoming, explicit? })` where `incoming` carries the
lot ids **and** their domain state. Rules:
- empty destination → `KEEP`
- destination holds the same lot → `KEEP` (a merge, not a blend)
- destination holds a different lot → `ABSORB` by default; `NEW_BLEND` when explicit
- **`incoming` carries >1 distinct lot into an occupied destination → require explicit
  `NEW_BLEND`** (council: "once per destination" is only safe for a single incoming identity)
- **differing tax class or `ownership` → refuse ABSORB, require `NEW_BLEND`** so the class is
  re-derived (TTB 5120.17 lines 5/20)
- differing `form` (MUST vs WINE) / `afState` / `mlfState` → refuse with a domain message
- destination holds >1 lot → refuse ("repair this vessel first"); reachable only pre-Unit-13

Subsumes and replaces `decideRackRoute`.
**Type contract (eng review P2):** the `incoming` element type requires the full domain state
(`lotId`, `form`, `afState`, `mlfState`, `productType`, `ownership`) with **no optional
fields**, so a caller that forgets to load one is a `tsc` error rather than a silently
permissive decision. Explicit over clever.
**Tests:** the full truth table; the tax-class refusal; the ownership refusal; the
multi-incoming refusal; MUST-into-WINE refusal; **afState/mlfState mismatch refusal**; the
>1-resident refusal.
**Depends on:** Unit 1 · **Execution note:** test-first
**Verification:** `npx vitest run test/combine-route.test.ts`

### Unit 5: The shared ABSORB core — and the composition fold it depends on

**Goal:** One transaction that makes absorbing correct everywhere, and a composition fold that
does not silently drop blended wine.

**Files:** `src/lib/ledger/absorb.ts` (new), `src/lib/ledger/write.ts`, `src/lib/lot/lineage.ts`,
`src/lib/blend/blend-core.ts`, `test/absorb-core.test.ts`, `test/vessel-composition.test.ts`

**Approach — two halves, and the second is the load-bearing one.**

**(a) The absorb core.** `absorbIntoResidentTx(tx, actor, { fromVesselId?, sourceLotId, drawL, toVesselId, residentLotId, opType })`
wrapping the existing `blendLotsCore` `GROW_EXISTING` machinery. `opType` passes through so
`TOPPING` stays `TOPPING` in the ledger and the timeline. It **does not** write
`VesselComponent` itself — [`foldVesselComponents`](src/lib/ledger/write.ts:393) already folds
composition at the chokepoint from the op's lines. Duplicating it here is exactly the drift
Unit 5 exists to prevent.

**(b) ⚠️ Fix the fold — eng review P1.** [`write.ts:379`](src/lib/ledger/write.ts:379) skips any
line whose lot has no origin tuple:

```js
if (!o?.originVarietyId || !o.originVineyardId || o.vintageYear == null) continue; // can't form a tuple
```

A blend lot **has no origin by construction** —
[blend-core.ts:215](src/lib/blend/blend-core.ts:215): *"origin\* stay NULL — a multi-source
blend has no single origin."* So every blend-lot line contributes **nothing** to
`VesselComponent`. Today that is minor staleness. This plan makes ABSORB the default and blend
lots the norm, so the breakdown that **Unit 18's whole UI rests on** decays exactly where it
matters. The winemaker asks "what's in T7?", sees "62% Pinot", and the missing 38% is the
absorb from last week. That reads as data loss, and it would sink the feature.

The fix reuses a primitive that already exists: [`composeRollup`](src/lib/lot/lineage.ts:111)
recursively attributes a lot's makeup to its **ancestor leaves** by multiplying lineage
fractions, is cycle-guarded, and attributes any uncovered remainder to the node itself rather
than dropping it. For an origin-less lot, expand the line's `deltaL` across those leaves and
emit one component delta per leaf tuple.

**One refactor required:** `composeRollup` returns *separate* marginals (`byVariety`,
`byVineyard`, `byVintage`), and separate marginals **cannot** reconstruct the joint
`(variety, vineyard, vintage)` tuple `VesselComponent` needs. Extract the intermediate
leaf attribution as `composeLeaves(rootId, edges, meta): { lotId, weight }[]`, have
`composeRollup` consume it (no behavior change, so its existing tests stay green), and have the
fold map each leaf to its own origin tuple.

**Also (eng review P2, while in this file):** the fold is a sequential `findFirst`-then-write
loop — one Neon round trip per tuple, awaited in series, inside a SERIALIZABLE tx with a 20 s
ceiling. Expanding blends multiplies the tuple count. Replace with one `findMany`, an in-memory
diff, and batched writes.

**Tests:** absorb writes exactly one `vessel_lot` row and one lineage edge; `opType`
round-trips; cost conservation holds (COST-1); absorbing an incomplete-provenance source makes
the resident incomplete. **Composition:** absorbing into a **blend-lot resident** produces
component rows for every ancestor leaf summing to the destination volume (the case that
silently produced nothing before); a 3-deep blend chain attributes correctly; a lot whose
lineage fractions don't sum to 1 attributes the remainder to itself and marks provenance
incomplete; `composeRollup`'s existing tests still pass after the `composeLeaves` extraction.
**Depends on:** Unit 4 · **Execution note:** test-first
**Verification:** `npx vitest run test/absorb-core.test.ts test/vessel-composition.test.ts` && `npm run verify:cost`

### Unit 6: RACK routes universally

**Goal:** Racking into an occupied vessel always resolves identity; the ">1 lot → plain RACK"
bail is gone.
**Files:** `src/lib/vessels/rack-core.ts`, `src/lib/vessels/transfer.ts`, `test/rack-route.test.ts`
**Approach:** `rackVesselCore` ([rack-core.ts:248](src/lib/vessels/rack-core.ts:248)) uses
`decideCombineRoute`; `ABSORB` → `absorbIntoResidentTx`; `NEW_BLEND` → the existing `newBlend`
escape; `KEEP` → the unchanged plain-rack path. `rackWineCore` (the raw path used by WO
completion) refuses a foreign-lot destination so no caller routes around the decision. Refusals
are **returned** as `{ ok: false, error }`.
**Tests:** into empty (KEEP); into the same lot (merge); into a different lot (ABSORB, resident
keeps identity, lineage + composition written); with the new-blend escape; across tax classes
→ refused naming the fix; `rackWineCore` direct call into a foreign-lot vessel refused.
**Depends on:** Units 4, 5
**Verification:** `npx vitest run test/rack-route.test.ts` && `npm run verify:reverse`

### Unit 7: TOPPING absorbs — and stays exempt from the blend fold

**Goal:** Topping grows the resident lot instead of adding a second resident, without becoming
a declarable blend on the TTB return.
**Files:** `src/lib/cellar/topping.ts`, `src/lib/compliance/generate.ts` (assertion only),
`test/topping.test.ts`
**Approach:** Route the topping draw through `absorbIntoResidentTx` with `opType: "TOPPING"`.
The `LotLineage` `TOPPING` edge is **kept** — it is the composition record. Council C4/Gemini:
**verify the 5120.17 fold still excludes `TOPPING` from lines 5/20** ("produced by blending" /
"used for blending") now that topping mutates `VesselComponent`; add an explicit regression test
rather than assuming.
**Tests:** top a single-lot vessel → one resident, volume grows, lineage edge present; top an
empty vessel → the keg lot moves (KEEP); topping never mints a lot code; **a TOPPING op does not
appear on 5120.17 lines 5 or 20**; volume conservation.
**Depends on:** Units 4, 5
**Verification:** `npx vitest run test/topping.test.ts` && `npm run verify:ttb` && `npm run verify:long-tail-ops`

### Unit 8: CRUSH / PRESS / SAIGNÉE resolve at the destination

**Goal:** Fruit and fractions landing in an occupied vessel absorb into the resident lot by
default — InnoVint's *Combine with existing lot*.
**Files:** `src/lib/transform/crush-core.ts`, `press-core.ts`, `actions.ts`, `test/transform-combine.test.ts`
**Approach:** In `crushLotTx`, a `mode: "NEW"` target naming an occupied destination routes
through `decideCombineRoute`; `ABSORB` re-targets to the resident (i.e. `mode: "ADD"`, which
already exists and is the correct primitive); `NEW_BLEND` mints via `blendLotsCore`. Same for
each `press-core` fraction destination and for saignée. **Preserve `LotHarvestSource` pick
attribution on absorb** — picks must point at the lot that actually holds them (council S8).
Co-ferment case (2 t Syrah + 1 t Viognier into one fermenter) is the *expected* path, not an
error: the confirm names the resident lot and shows the resulting composition.
**Tests:** 2 picks → one empty tank = one MUST lot with both `LotHarvestSource` rows; a third
pick → absorbed, still one lot, three source rows, composition updated; new-blend escape mints a
child; free-run and press to two vessels → two lots; both fractions into the same vessel →
refused with the fix named.
**Depends on:** Units 4, 5
**Verification:** `npx vitest run test/transform-combine.test.ts` && `npm run verify:reverse-transform` && `npm run verify:phase6-reversal`

### Unit 9: SEED refuses an occupied vessel

**Goal:** Manual create-in-vessel cannot drop a second lot into a tank that already holds wine —
the path that produced 5 of the 5 live violations.
**Files:** `src/lib/bulk/actions.ts`, `test/seed-occupancy.test.ts`
**Approach:** Check occupancy before writing the `SEED` op
([bulk/actions.ts:122](src/lib/bulk/actions.ts:122)). If occupied, **return** a refusal naming
both legal moves: add the volume to the resident lot (an `ADJUST`, not a `SEED`), or seed into an
empty vessel. Per council, **no `allowCoResidence` runtime flag** — Day-Zero import, if it ever
needs one, is a one-off script that runs before Unit 13 and is then deleted.
**Tests:** seed into empty → ok; seed into occupied → refused with both options; the refusal is a
returned result, not a thrown `ActionError`.
**Depends on:** Unit 4
**Verification:** `npx vitest run test/seed-occupancy.test.ts`

### Unit 10: Split-in-place needs distinct destinations

**Goal:** Splitting a lot cannot leave two sublots in one vessel.
**Files:** `src/lib/cellar/split-core.ts`, split UI, `test/split-in-place.test.ts`
**Approach:** `cleanChildren` defaults `destVesselId` to the source
([split-core.ts:65](src/lib/cellar/split-core.ts:65)). New contract: **at most one** child may
default to the source; every other must name a distinct empty-or-same-lot destination. Validate
before planning lines; return a refusal naming which child needs a home. Lees keep the existing
`discardedLeesL` route or take their own vessel. A **draft** may leave a child's destination
unresolved (Unit 11); the rule binds at execution.
**⚠️ Design review — this collides with UX Principle 12, "No phantom vessels"**
([ux-principles.md:66](../architecture/ux-principles.md)): *"Split and blend-return are **real
operations**, never fake round-trips through a throwaway vessel."* That principle exists because
this app deliberately built `splitLotInPlaceCore` as a first-class op instead of copying
InnoVint's phantom-vessel workaround — the same workaround this plan cites as evidence. A
winemaker splitting a tank into three trial sublots with no spare tanks will do the obvious
thing and **create two fake vessels**, regressing the principle and handing back the advantage.

**The replacement affordance (design decision): trial tags, not fake splits.** The tank stays
one lot; the winemaker attaches a named tag ("yeast trial A") to the readings and notes taken
from it. The trial stays trackable, the liquid stays honest, and nobody invents a vessel.
`Lot.sublotTag` already exists but lives on the *lot*, so it still requires a split — this needs
a lightweight tag on the capture records (`AnalysisPanel`, `LotTastingNote`) instead. The
refusal must **offer this by name**, not just say no:

> *"T7 holds one wine — sub-lots can't share a tank. Send this fraction to another vessel, or
> tag your readings 'yeast trial A' to track it in place."*

**Tests:** 1 child in place → ok; 2 children, one in place + one to an empty barrel → ok; 2
children both in place → refused naming the second **and offering the trial tag**; LEES to its
own vessel → ok; `discardedLeesL` unchanged; a tagged reading filters back out by tag.
**Depends on:** Unit 4
**Verification:** `npx vitest run test/split-in-place.test.ts` && `npm run verify:split-in-place`

### Unit 11: Deferred destinations — "let cellar staff choose"

**Goal:** A work order can be drafted before the destination vessel is known, without either
breaking the invariant or forcing a fake vessel choice at planning time.
**Files:** `src/lib/work-orders/{proposal-readiness,data}.ts`, `src/app/(app)/work-orders/new/WorkOrderBuilderClient.tsx`, `test/work-order-deferred-dest.test.ts`
**Approach:** Council/Gemini: forcing a physical destination at draft time breaks the real cellar
workflow (the cellar master picks clean barrels tomorrow morning). Mirror InnoVint's *"let cellar
staff choose vessels"* — a draft task may carry an unresolved destination; readiness surfaces it
as a known-unresolved field rather than an error; `decideCombineRoute` runs at **execution**,
when the vessel is finally named. This is what makes "keep separate = a different destination"
livable.
**Tests:** a draft with a deferred destination is valid and shows as deferred; executing it with
an occupied vessel routes through `decideCombineRoute`; executing with an empty vessel is a plain
move; a deferred destination never reaches `writeLotOperation` unresolved.
**[→E2E]** the one that unit tests structurally cannot catch: draft today with a deferred
destination, then execute tomorrow when that vessel has been filled by *someone else's* wine in
the meantime. Spans the builder, readiness, and execution — needs an integration test.
**Depends on:** Unit 4
**Verification:** `npx vitest run test/work-order-deferred-dest.test.ts` && `npm run verify:work-orders`

### Unit 12: Collapse the live violations

**Goal:** Five vessels become one lot each, through real ledger operations.
**Files:** `scripts/repair-co-residence.ts` (new)
**Approach:** For each violating `(tenantId, vesselId)`, the **largest-volume** resident absorbs
the others via `absorbIntoResidentTx` — one `BLEND` op per vessel with full lineage and
composition. `--survivor <lotId>` overrides the tiebreak per vessel.

Three pre-flights the council found, all cheap and all protecting against real breakage:

1. **Vessel-scoped, never lot-scoped** (council C1 — ⚠️ **confirmed by the Unit 3 audit as the
   universal case, not an edge case**). The audit found **all 6 non-survivor lots also occupy
   other vessels** (`2024-OAK-1-CS-2` occupies 5 others). A `blendLotsCore` deplete keyed on the
   *lot* would have drained wine out of vessels nobody was repairing. The collapse must draw only
   **this vessel's** volume of each losing lot and leave their other vessels untouched. There is
   no "gate and skip" option here — 100% of the live data would trip it.
2. **In-flight work orders** (council C5): **1 task** references a co-resident lot today
   (`2024-OAK-1-CS-2`, an APPROVED RACK), surfacing against 3 of the 5 vessels. Abort with the
   list unless `--rewrite-tasks` re-points it at the survivor. *(The plan previously said 3 —
   that probe counted rows and did not filter DONE/SKIPPED/REJECTED or cancelled WOs.)*
3. **Tax class / ownership**: if the residents differ, the collapse must mint a new blend lot
   rather than inherit the survivor's class (same rule as Unit 4, applied to the repair).

`--dry-run` is the default and prints before/after per vessel, volumes moved, resulting
composition, cost before/after per lot, and the TTB lines touched. `--apply` requires an explicit
`--tenant`. Demo's four rehearse first.

**Bhutan: LEAVE IT ALONE (Russell, 2026-07-21).** BARREL 18 keeps its three lots. *"I don't want
to break what they have, but going forward I do want them using our actual logic."*

That has two consequences the plan has to absorb:

- ⛔ **The DB `UNIQUE` constraint cannot ship** while any tenant is dirty — Postgres refuses to
  create a unique index over violating rows. Unit 13 becomes app-guard-only until Barrel 18 is
  clean (by collapse, or naturally when the barrel is emptied).
- ⚠️ **The app guard must be "never make it worse", not "must be perfect".** Refusing every
  operation whose result leaves a vessel holding >1 lot would freeze Barrel 18 solid — they could
  not even rack the wine out of it. The rule is therefore: **an operation may not INCREASE the
  number of lots in a vessel, and may never take a compliant vessel above one.** Pre-existing
  co-residence is grandfathered and can only shrink. This is a better invariant anyway: it is
  monotone, so the estate heals over time and can never regress.

**Applied so far:** Demo `Tank T5` (op #4336) — the rehearsal Russell asked for. B4/B5/T7 remain
blocked on one in-flight work-order task; Barrel 18 is now out of scope by decision.

**Rollback window:** reversible **only until Unit 13 lands** (council C2 — once the invariant is
on, a reversing CORRECTION would recreate the forbidden state and be refused). Do not ship
Unit 13 until the collapse is accepted.
**Tests:** dry-run against a seeded synthetic tenant reproduces the expected plan; apply yields
one lot per vessel with conserved volume and cost; re-running is a no-op; the WO pre-flight
aborts when a task references an absorbed lot; the lot-scope gate refuses a multi-vessel losing
lot; differing tax classes mint a new blend lot; **a partial run resumes cleanly** — each vessel
is its own `BLEND` op in its own transaction, so aborting after vessel 3 of 5 leaves a consistent
DB and re-running finishes the rest (eng review P3: assert this, don't claim it).
**Depends on:** Units 3–11
**Execution note:** ⚠️ **`.env` is production.** Review the dry-run before `--apply`.
**Verification:** `npm run verify:one-lot-per-vessel` → **0**; `verify:cost`; `verify:ttb`; `verify:taxclass`

### Unit 12b: Composition must survive an absorb into an origin-bearing lot ⚠️ OPEN

**Found by verifying the T5 rehearsal (2026-07-21) rather than trusting it.** After the collapse
T5 holds one lot at 6,995 L — correct — but `vessel_component` reports **Syrah 6,995 L**, i.e.
100%. 625 L of it is Cabernet. That is the "where did my Cabernet go?" failure the design review
predicted, and Unit 5 only fixed half of it.

**Two defects, both pre-existing, neither previously tested:**

1. **The fold never consults lineage for a lot that HAS an origin.** Unit 5 taught
   `syncVesselComponents` to attribute origin-LESS (blend) lots through `composeLeaves`. But
   `2026-SY-2` has its own origin tuple, so `hasTuple` short-circuits and the whole line —
   including volume it just absorbed from another lot — is attributed to Syrah.
2. **`GROW_EXISTING` records the wrong fraction for this purpose.** blend-core computes
   `fraction = parentGross / grossDenom` over the *incoming* parents only, so absorbing 625 L of
   `2026-CS` into a 6,370 L resident wrote `fraction = 0.99999` ("all the incoming wine came from
   2026-CS") when composition needs "2026-CS is 8.9% of the RESULT".

**Why it blocks:** every further collapse bakes in another wrong breakdown, and Unit 18's vessel
screen reads directly from `vessel_component`. TOPPING is deliberately exempt (Vintrace's
"Topping Without Updating Wine Composition", and the TTB treats it as cellar practice) — this is
about BLEND-shaped absorbs only.

**Sketch:** resolve composition through `composeLeaves` whenever a lot has lineage, letting the
uncovered remainder fall to its own origin (which `composeLeaves` already does); and make
GROW_EXISTING's fraction the parent's share of the resulting lot. Both need a regression test in
`verify-vessel-composition`, which currently only covers origin-less children.

### Unit 13: Turn the invariant on

**Goal:** Co-residence becomes structurally impossible.
**Files:** `prisma/schema.prisma`, `prisma/migrations/*`, `src/lib/ledger/write.ts`,
`INVARIANTS.md`, `docs/architecture/invariants/LEDGER-12-one-lot-per-vessel.md` (new), `package.json`
**Approach:** Two layers.
(a) **App:** call `assertOneLotPerVessel` on the post-fold `next` balances inside
`writeLotOperation`, beside `assertBalanced` and the capacity check
([write.ts:250](src/lib/ledger/write.ts:250)). Per council, the chokepoint assert is
**defense-in-depth**; the user-facing refusal comes from the per-core preflights (Units 6–10)
which **return** `{ ok: false, error }` — a deep throw would surface in prod as a redacted 500.
Eng review P2: word the chokepoint message as an **internal** assertion —
*"Invariant LEDGER-12 violated: vessel {code} would hold {n} lots. A core is missing its
combine preflight."* By fold time the domain intent is gone, so it cannot produce a useful
winemaker-facing message; making it obviously-internal means an engineer reads it correctly and
a winemaker never sees it.
(b) **DB:** `@@unique([tenantId, vesselId])` on `VesselLot`, via `migrate diff` → `migrate deploy`
(never `db:push`). **Decide the existing `@@unique([tenantId, vesselId, lotId])` explicitly**
(council C6): keep it — it is strictly weaker than the new one, it is a `WhereUniqueInput` target
for existing `findUnique`/`upsert` sites, and removing it in the same unit would force a
client-wide construction-site sweep for no gain. Note the redundancy in the schema comment and
leave removal to a follow-up.
Register **LEDGER-12** (`severity: critical`, `enforcedBy: app-code+db-constraint`,
`verify: "npm run verify:one-lot-per-vessel"`, `appliesTo: src/lib/{ledger,vessels,transform,cellar}/`)
plus the `INVARIANTS.md` narrative. Wire the guard into CI.
**Tests:** the guard rejects a synthetic two-lot fold with the right message; the DB rejects a
direct second-row insert; `BOTTLE_STORAGE` legs (`vesselId: null`) are unaffected — asserted
explicitly, since that is the one thing that would make the constraint wrong.
**Ordering must be mechanical, not remembered (eng review P2).** The rollback window closes here,
and prose in a plan file will not stop a future agent from landing this first. The migration
**refuses to run** unless Unit 12 has recorded its completion (a marker row / audit entry the
migration checks). Self-enforcing beats documented.
**Depends on:** Unit 12 (**must not** land before the data is clean — the index cannot be created
while violations exist, and it closes the rollback window)
**Verification:** `npm run verify:invariants` && `npm run verify:invariant-frontmatter` && `npm run verify:one-lot-per-vessel`

### Unit 14: Serialized-contract sweep ✅ DONE

**Goal:** Find the persisted shapes that a `tsc` pass will not catch before the deletions start.

**Findings (measured against production, 2026-07-21):**

| Surface | Persisted? | Live rows | Verdict |
|---|---|---|---|
| `AnalysisPanel.vesselReadingGroupId` | **DB column** | 10 panels in **5 real fan-out groups** | ⚠️ **KEEP THE READ PATH** |
| `CaptureInput.occupancyToken` | **IndexedDB, on tablets** | unknown (client-side) | ⚠️ keep accepting it |
| `CaptureInput.vesselReadingGroupId` | IndexedDB | unknown | stop sending; tolerate on read |
| `WorkOrderTask.plannedPayload` lot fields | DB JSON | 89 tasks, **3 in unexecuted WOs** | safe — Unit 11 already made the lot optional |
| Assistant resume tokens (`#<lotId>` pin) | signed, in-flight chat only | 1,182 messages | safe — the pin path SURVIVES for ambiguous lot codes |

**⚠️ The one that changes Unit 15's scope.** `vesselReadingGroupId` was going to be deleted with
the fan-out. It cannot be: **5 whole-tank readings were genuinely fanned out** across lots that
have since been merged, and both vessel-scoped read paths
([timeline-data.ts:232](src/lib/vessel/timeline-data.ts:232),
[chemistry/data.ts:102](src/lib/chemistry/data.ts:102)) collapse a group to ONE timeline item.
Drop the column and those five readings each render **twice**, forever.

Deleting the duplicate panels instead is worse — they are real recorded measurements against real
(now-merged) lots, and destroying measurement history to tidy a column is not a trade worth making.

**So Unit 15 deletes the WRITE path and keeps the READ path.** Stop minting group ids; keep
collapsing by them. The column becomes documented legacy: a record of how readings were captured
before LEDGER-12, not a shape anything new produces.

**`occupancyToken` likewise stays accepted.** It is a resident-lot signature living in IndexedDB on
cellar tablets; a device that has been offline across the deploy will still send it. It degenerates
to `${vesselId}:${lotId}` for a single-lot vessel, so it costs nothing to keep honouring.

**Depends on:** Unit 13
**Verification:** the counts above, re-run before the deletions land

### Unit 15: Delete the chemistry pickers and the fan-out

**Goal:** A vessel resolves to its one lot. No ambiguity branch, no fan-out.
**Files:** `src/lib/chemistry/{resolve-lot,measurements,tasting,samples,data}.ts`,
`src/lib/chemistry/fanout-plan.ts` (delete), `src/lib/offline/queue.ts`,
`src/lib/vessel/timeline-data.ts`, chemistry tests
**Approach:** `resolveResidentLot` loses `"ambiguous"`; `resolveVesselLot` loses the CONFLICT
throw ([resolve-lot.ts:65](src/lib/chemistry/resolve-lot.ts:65)). Delete the Plan 060 whole-tank
fan-out ([measurements.ts:195](src/lib/chemistry/measurements.ts:195)) and `fanout-plan.ts`.
Simplify the shared-`captureId` grouping in `data.ts` and `timeline-data.ts` that existed only to
re-collapse fanned-out panels, and the offline queue's N-capture representation (per Unit 14's
compat path). Keep `"empty"` and `"not_resident"` — both still real.
**Depends on:** Units 13, 14
**Verification:** `npm run verify:chemistry` && `npx vitest run test/chemistry*.test.ts`

### Unit 16: Delete the assistant pickers and the prompt rules

**Goal:** The assistant never asks "which lot" about a vessel again.
**Files:** `src/lib/assistant/scope.ts`, `prompt.ts`,
`tools/{record-measurement,record-tasting-note,pull-sample,record-bulk-wine-cost,transition-lot-state,sparkling-tirage,navigate}.ts`,
assistant goldens
**Approach:** `resolveLotCandidates` keeps `kind: "many"` **only** for ambiguous lot *codes*. The
vessel branch collapses to one lot, so `resolveLotTarget`'s "holds a blend" throw
([scope.ts:316](src/lib/assistant/scope.ts:316)) and `resolveLotTargetOrChoice`'s vessel prompt
([scope.ts:336](src/lib/assistant/scope.ts:336)) go, along with the "float the lot with the most
recent reading to the top" continuity hack (which existed only to stop a co-ferment's daily
readings fragmenting across lots). Rewrite prompt rules 36 and 37
([prompt.ts:36](src/lib/assistant/prompt.ts:36)) — they currently *describe the picker*. Update
tool descriptions saying "a blend asks which lot". `sparkling-tirage`'s assemblage deep-link
([sparkling-tirage.ts:49](src/lib/assistant/tools/sparkling-tirage.ts:49)) becomes unreachable.
**Tests:** two **new** golden cases added to the D26/H8 suite — "log pH 3.4 on T7" and "note that
T7 smells like rotten eggs" against a 3-source tank — each producing a confirm card with **no**
picker turn; an ambiguous lot *code* still returns a choice; the existing suite stays green
(**hard CI gate**).
**Depends on:** Units 13, 14, 15
**Execution note:** ⚠️ prompt-rule edits are the #1 recurring root cause on this codebase.
**Capture the baseline for both new cases BEFORE touching any rule**, then measure after each
individual rule edit. Never batch. Order matters — plan 081 shipped on a baseline that was never
taken, and its "3/3 cold" overstated the fix (4/5 under history).
**Verification:** the assistant golden suite; `npm run verify:assistant-cellar-contents`

### Unit 17: Delete the work-order and form pickers

**Goal:** No lot dropdown anywhere a vessel has been named.
**Files:** `src/lib/work-orders/{vessel-lot-resolve,nl-resolve,proposal-readiness,data}.ts`,
`src/components/cellar/forms/*`, `WorkOrderBuilderClient.tsx`, `BlendBuilderClient.tsx`,
`FermentMonitor.tsx`, `src/app/(app)/bulk/*`
**Approach:** `VesselLotState` loses `{ kind: "blend" }`
([vessel-lot-resolve.ts:11](src/lib/work-orders/vessel-lot-resolve.ts:11)); `no-vessel` /
`single` / `empty` / `deferred` (Unit 11) remain. `nl-resolve` drops both "which lot" throws.
`proposal-readiness` drops the `rack_blend_review` confirmable and the unresolved-lot gate.
`LotField` ([shared.tsx:71](src/components/cellar/forms/shared.tsx:71)) becomes a read-only lot
display; `useLotPick` collapses. `BlendBuilderClient` drops the `INVALID` multi-lot mode
([BlendBuilderClient.tsx:306](src/app/(app)/blend/BlendBuilderClient.tsx:306)) — every occupied
vessel is now a legal blend source. `FermentMonitor` drops the whole-tank/this-lot opt-out.
**Depends on:** Units 13, 14
**Verification:** `npm run verify:work-orders` && `npm run verify:work-order-nl` && `npm run verify:universal-work-order-authoring`

### Unit 18: A vessel reads as one liquid

**Goal:** Vessel screens present one lot plus its **composition** — and make a co-ferment's
minority component visibly *present*, not lost.
**Files:** `src/app/(app)/vessels/*`, `src/app/(app)/bulk/BulkClient.tsx`,
`src/lib/vessel/timeline-view.ts`, `src/lib/cellar/contents-query.ts`
**Approach:** Build to the **Design Specification** section above — hierarchy (lot identity →
fill → composition), one-line collapsed composition expandable to per variety/vineyard/vintage,
compact inline list not a card grid, 44px targets, collapsed by default on mobile. Data comes
from `VesselComponent` (fixed in Unit 5), which is exactly Vintrace's model using a record we
already write. **This is the answer to the council's sharpest UX question:** when Viognier is
absorbed into a Syrah lot, the winemaker must see "18% Viognier" on the tank, or the feature
reads as data loss. Tokens only; `ux-principles.md` rules 1, 2, 5.
**Tests:** single-origin → one row at 100%; a blend → N rows summing to 100%;
`provenanceComplete: false` → the incomplete-provenance affordance (never a silent gap);
collapsed by default at 375px with fill and lot identity above the fold.
**Depends on:** Units 13, 17
**Execution note:** browser QA on **Demo Winery only**, `QA-*` fixtures, cleaned up after.
**Verification:** browser QA against Demo T7 post-repair + `npm run verify:naming`

### Unit 19: Close the loop

**Goal:** The decision is recorded where the next agent will find it, and the reporter hears back.
**Files:** `docs/architecture/system-map.md`, `docs/architecture/decisions/ADR-00NN-one-lot-per-vessel.md`,
`docs/architecture/scale-register.md`, `VISION.md`, `NOW.md`, `INVARIANTS.md`
**Approach:** ADR recording the decision, the InnoVint/Vintrace evidence, the Bhutan diagnosis,
and what was rejected (co-residence with a `keepSeparate` flag; blanket-BLEND repair; row
surgery; partitioned vessels as co-residence — the sanctioned escape is distinct `vesselId`s).
Clarify **VISION D2**: a measurement belongs to exactly one lot *because a vessel is exactly one
lot*, not despite it. Refresh the system map. Resolve feedback `cmruoc3yk0000jf0491y8hety` via
`closeFeedbackItemCore` (the canonical path — a raw status write skips the structured outcome
note and the reporter notice) and **close PR #444 as superseded**.
**Depends on:** Units 1–18
**Verification:** `npm run verify:invariants` && `npm run verify:tripwires`

## Design Specification

From `/plan-design-review`. This plan's entire user-facing surface is **confirms and refusals**,
so the copy *is* the feature. Calibrated against [DESIGN.md](../../DESIGN.md) (tokens only) and
[ux-principles.md](../architecture/ux-principles.md).

### The moment that decides everything

```
STEP | WINEMAKER DOES               | FEELS                       | MUST BE DESIGNED
-----|------------------------------|-----------------------------|------------------
 1   | Racks Cab into a Pinot tank  | routine                     | (absorb routes)
 2   | Reads the confirm card       | ⚠️ "wait — is my Cab gone?"  | ← THE WHOLE THING
 3   | Looks at the tank afterwards | needs to SEE 18% Cabernet   | composition readout
 4   | Next day, checks the lot     | wants the lineage           | already exists, surface it
```

Step 2 is where absorb either reads as *correct* or as *theft*. Get the card right and the rest
follows.

### Interaction states

| Surface | Loading | Empty | Refused | Confirmed | Partial |
|---|---|---|---|---|---|
| **Combine confirm** (rack/crush/top/press into an occupied vessel) | skeleton on the composition line only — never block the volumes | n/a (destination is occupied by definition) | see copy below | names the **surviving lot** + the resulting composition: *"T7 stays 24-PN-1 · now 82% Pinot Noir · 18% Cabernet"* | draw < full source: state what remains where |
| **Tax-class / ownership refusal** | — | — | *"These two wines report under different tax classes, so they can't share a lot. Create a new blend lot to combine them."* + primary action **Create blend lot** | — | — |
| **Split-in-place refusal** | — | — | *"T7 holds one wine — sub-lots can't share a tank. Send this fraction to another vessel, or tag your readings to track it in place."* + two actions | — | — |
| **Seed into occupied** | — | — | *"Tank 5 already holds 24-PN-1. Add this volume to that wine, or seed into an empty vessel."* + two actions | — | — |
| **Vessel composition** | one-line skeleton | *"Empty"* — not "No lots found" | provenance incomplete → *"part of this wine's source is unrecorded"*, never a silent gap | *"82% Pinot Noir · 18% Cabernet"*, tap to expand | — |
| **Deferred WO destination** (Unit 11) | — | *"Vessel chosen at execution"* — a deliberate state, styled as intent not as missing data | destination occupied at execution → route through the combine confirm | — | — |

**Copy rules (UX principle 5, winery language):** every refusal names the wine, the vessel, and
the legal move — never the constraint. No "LEDGER-12", no "co-residence", no "resident lot".
A winemaker should never learn the word `VesselLot`.

**Every refusal offers a next step (UX principle 2, no dead-ends).** A refusal with no action is
a dead end, and this plan adds six of them. Each ships with its escape as a button.

### Vessel composition readout (Unit 18)

Hierarchy — the tank answers three questions in this order:

```
  ┌────────────────────────────────────────────┐
  │ 24-PN-1   Estate Pinot Noir       PRIMARY  │  what is this?
  │ 4,820 L / 6,000 L        ▓▓▓▓▓▓░░ SECOND   │  how much?
  │ 82% Pinot Noir · 18% Cabernet   ⌄ THIRD    │  made of what?  ← new, collapsed
  └────────────────────────────────────────────┘
       expanded ⌄ → per variety / vineyard / vintage, sorted desc, % + volume
```

Composition is **one line, collapsed by default, expandable** — visible enough to answer "where
did my Cabernet go" at a glance, quiet enough that it never outranks lot identity or fill.
Render as a compact inline list, **not** a card grid or icon row (AI-slop check).

### Responsive & accessibility — this is a cellar-floor app

The person hitting these confirms is standing at a tank on a phone or tablet, in wet gloves,
often in poor light. A dialog designed for a desktop review session fails there.

- **Touch targets ≥ 44px** on every confirm/refusal action. Gloved hands.
- **The refusal's escape actions must be reachable without scrolling** on a 375px viewport —
  the explanation may wrap, the buttons may not fall below the fold. (Same class of bug as
  #203, where a confirm card below the fold read as "Confirm does nothing".)
- **Composition collapsed by default on mobile** — expanded it can be six rows deep.
- Confirm/refusal dialogs are **keyboard-reachable and focus-trapped**; Escape cancels, and
  cancelling never writes.
- Contrast per DESIGN.md tokens; **never encode the absorb/refuse distinction in color alone** —
  it carries a word.
- Composition percentages get an accessible label (*"82 percent Pinot Noir"*), not just a bar.

### Design review: NOT in scope

- **A composition-history view** (how the blend % changed over time) — the lineage already
  records it; visualizing it is a separate plan.
- **Redesigning the vessel page** — this adds one line to an existing header, nothing more.
- **New iconography or component types** — existing tokens and components only.
- **The trial-tag filter UI beyond the basics** — Unit 10 ships tag capture and tag filtering on
  readings; a full trial-comparison view is future work.

## Test Strategy

**Unit tests:** pure functions carry the correctness load and run without a DB —
`assertOneLotPerVessel` (Unit 1) and `decideCombineRoute` (Unit 4), matching
`test/ledger-math.test.ts`. Every core change gets a co-residence-refused case **and** a
tax-class-refused case.

**Integration:** the `verify:*` family drives live cores against the DB. Green before and after:
`verify:one-lot-per-vessel` (new), `verify:reverse`, `verify:reverse-transform`,
`verify:phase6-reversal`, `verify:split-in-place`, `verify:barrel-groups`,
`verify:group-rack-progressive`, `verify:chemistry`, `verify:work-orders`, `verify:work-order-nl`,
`verify:cost`, `verify:ttb`, `verify:taxclass`, `verify:excise`, `verify:naming`,
`verify:invariants`.

**Compliance:** Unit 7 adds a **TTB regression test** asserting `TOPPING` never lands on 5120.17
lines 5/20 now that topping mutates composition. Unit 4's tax-class refusal gets its own case.

**Assistant goldens:** D26/H8 is a hard CI gate. Unit 16 is the highest-risk edit in the plan —
measure before and after each prompt-rule change, never batch.

**Manual verification (Demo Winery only, `QA-*` fixtures) — run steps 3, 4 and 8 on a 375px
viewport, since that is where the winemaker actually is:**
1. Crush two picks into one empty tank → one MUST lot, both picks attributed.
2. Crush a third pick into it → absorbed, one lot, composition shows three sources.
3. Rack that tank into an occupied tank → absorb confirm names the surviving lot and the resulting composition.
4. Rack across tax classes → refused, message names "mint a new blend lot".
5. Record pH against the tank → one panel, no picker, no fan-out.
6. Assistant: "log a tasting note on T7 that it smells reductive" → confirm card, no picker turn.
7. Draft a WO "rack T7 to T5" → no unresolved lot field; draft one with a deferred destination → shows as deferred, resolves at execution.
8. In-place split with two children in the source → refused, message names the fix.
9. `runAsTenant("org_demo_winery", …)` read-back: exactly one `vessel_lot` row per vessel.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| **Collapsing production (Bhutan BARREL 18)** merges three lots | MED | **LOW** | Russell has accepted this and will re-account the barrel by hand. Diagnosed as Day-Zero data entry, not real wine. `--tenant` required; Demo rehearses first; reversible until Unit 13; the ADR records that the merged lot is not a field blend |
| **Rollback window closes at Unit 13** | HIGH | MED | Stated explicitly (council C2). Unit 13 does not ship until the repair is accepted. No claim that ordinary undo works afterward |
| **Tax-class inheritance on ABSORB** produces a wrong 5120.17 | MED | **HIGH** | Unit 4 refuses ABSORB across tax class / ownership, forcing NEW_BLEND. `verify:ttb` + `verify:taxclass` + `verify:excise` green before and after; amendment cascade (AMEND-1) handles filed periods |
| **TOPPING starts folding as a blend** now that it mutates composition | MED | **HIGH** | Unit 7 adds an explicit regression test on 5120.17 lines 5/20 rather than assuming |
| **A losing lot lives in other vessels** — a lot-scoped deplete drains them | MED | **HIGH** | Unit 12 pre-flight gate refuses any losing lot with `vessel_lot` rows elsewhere (council C1) |
| **In-flight work orders** reference absorbed lots | **HIGH** | MED | **3 exist today.** Unit 12 pre-flights and either aborts with the list or re-points them |
| **Composition goes stale** while the ledger looks right — `write.ts:379` skips origin-less (blend) lots, and this plan makes blend lots the norm | **HIGH** | **HIGH** | Eng review P1. Unit 5(b) fixes the fold via `composeLeaves`/`composeRollup` ancestor attribution, with a test for the exact case that previously produced nothing. **Unit 18 is unshippable without it** — a tank reading "62% Pinot" with the other 38% missing reads as data loss |
| **Cost roll-up** distorted by merging different bases | MED | MED | `absorbIntoResidentTx` reuses the Phase 8 transfer path; `verify:cost` (COST-1) green before/after; the dry-run prints cost before/after per lot |
| **Prompt-rule edits regress the assistant** | **HIGH** | MED | Measure before/after per rule; never batch; goldens are a hard gate |
| **Deferred destinations leak an unresolved vessel into the ledger** | LOW | **HIGH** | Unit 11 asserts a deferred destination can never reach `writeLotOperation`; the invariant binds at execution |
| **Serialized contracts** break on deletion | MED | MED | Unit 14 sweeps offline-queue payloads, tool schemas/goldens, and persisted WO drafts before Units 15–17 delete anything |
| **Unique-index creation fails** while violations remain | MED | MED | Unit 13 depends on Unit 12; the repair re-runs the guard to 0 first |
| A workflow legitimately needs two liquids in one vessel | LOW | MED | Neither competitor supports it; live data shows none. Escape = distinct `vesselId`s (`B18-A`/`B18-B`), recorded in the ADR |

## What already exists (reused, not rebuilt)

| Existing | Used by | Notes |
|---|---|---|
| `blendLotsCore` GROW_EXISTING / NEW_LOT | Units 5, 6, 8, 12 | lineage + provenance + cost transfer already correct |
| `crushLotCore` `mode: "ADD"` | Unit 8 | already *is* InnoVint's "Combine with existing lot" |
| `decideRackRoute` | Unit 4 | widened into `decideCombineRoute`, not replaced wholesale |
| `foldVesselComponents` ([write.ts:393](src/lib/ledger/write.ts:393)) | Unit 5 | composition is **already** folded at the chokepoint — Unit 5 fixes its blend-lot hole rather than writing a second folder |
| `composeRollup` ([lineage.ts:111](src/lib/lot/lineage.ts:111)) | Unit 5 | ancestor-leaf attribution with cycle guard and incomplete-provenance remainder — the whole composition fix |
| `correctOperationCore` + `allowSeed` | Unit 12 | the `SEED` reversal path already exists |
| `foldLines` functional-zero sweep | Units 1, 13 | why a plain `UNIQUE` is safe |
| `planLedgerRack` / `computeProportionalDraw` | Units 6, 9 | proportional draw across residents |

## NOT in scope (considered, deferred)

- **Bottled / sparkling inventory** — `BOTTLE_STORAGE` legs carry `vesselId: null`, verified across
  every writer, so `vessel_lot` is liquid-only and `BottledLotState` is untouched.
- **Partitioned vessels (T-barrels, divided tanks)** — raised in council. No live usage. If it ever
  appears the answer is distinct `vesselId`s (`B18-A` / `B18-B`), recorded in the ADR as the
  sanctioned escape. Modelling it as co-residence would reintroduce the defect.
- **Retroactive composition correction** (Vintrace's "Fixing a Wine's Composition") — genuinely
  useful, entirely separate. The composition fold this plan fixes is a prerequisite for it.
- **Renaming a lot to a blend code on absorb** — absorb deliberately keeps the resident's identity;
  minting is the explicit escape. Auto-renaming would churn codes on every top-up.
- **Removing the now-redundant `@@unique([tenantId, vesselId, lotId])`** — strictly weaker than the
  new constraint and a live `WhereUniqueInput` target. Removing it demands a client-wide
  construction-site sweep for zero behavioral gain. Follow-up.
- **Multi-vessel lot bulk actions** (act on all 40 barrels of a lot at once) — the adjacent UX win
  this plan makes *possible* but does not deliver.
- **Consumable / supply lots** — different table, different domain, unaffected.

## Success Criteria

- [ ] `npm run verify:one-lot-per-vessel` reports **0 violations** across all tenants
- [ ] `vessel_lot` carries a DB `UNIQUE (tenantId, vesselId)`; a direct second-row insert is rejected
- [ ] **LEDGER-12** registered in `INVARIANTS.md` + `docs/architecture/invariants/`, counted by `verify:invariants`
- [ ] One lot **spanning many vessels** still works — explicitly asserted for a 12-barrel group
- [ ] Every combining op resolves identity in the operation, defaulting to absorb
- [ ] ABSORB across tax class or ownership is **refused**, and a `TOPPING` op never appears on 5120.17 lines 5/20
- [ ] Every ABSORB writes ledger + lineage + `VesselComponent` + provenance in one transaction
- [ ] **Absorbing into a blend-lot resident produces composition rows** (the `write.ts:379` hole) —
      a 3-deep blend chain attributes to its ancestor leaves and sums to the destination volume
- [ ] The 3 in-flight work-order tasks are resolved or re-pointed before the collapse applies
- [ ] Zero occurrences of "which lot" / "holds a blend" / "holds more than one lot" in `src/`
- [ ] `fanout-plan.ts` deleted; no fan-out remains in chemistry or tasting
- [ ] Assistant records a reading **and** a tasting note against a 3-source tank with no picker turn
- [ ] `/vessels` shows one lot per vessel with a composition breakdown that names the minority component
- [ ] **Every refusal names the wine, the vessel, and the legal move — and ships an action button**
      (no dead-ends; no `VesselLot` / "co-residence" / "LEDGER-12" in user-facing copy)
- [ ] **UX Principle 12 holds** — the split refusal offers trial tags, so nobody needs a phantom vessel
- [ ] Confirm and refusal actions are reachable without scrolling at 375px, ≥44px targets
- [ ] A WO can be drafted with a deferred destination and resolves at execution
- [ ] Feedback `cmruoc3yk0000jf0491y8hety` RESOLVED via `closeFeedbackItemCore`; PR #444 closed as superseded
- [ ] All tests pass; no regressions in the `verify:*` family

## REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| Council | `/council` | Cross-LLM adversarial (Codex `gpt-5.4` + Gemini `3.1-pro`) | 1 | ISSUES FOUND → RESOLVED | 7 critical, 7 should-fix, 6 design questions. 2 settled against live data (1 refuted, 1 answered) |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR | 8 issues (1 P1, 4 P2, 2 P3), 1 critical gap, 5 test gaps — all closed. Scope reduced to 2 branches |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | CLEAR | 4/10 → 9/10. 1 UX-principle collision found (Principle 12, phantom vessels), 6 dead-end refusals, a11y absent |
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | not run (refactor, not a product-direction change) |
| DX Review | `/plan-devex-review` | Developer experience | 0 | — | not run (no new developer-facing surface) |

**CROSS-MODEL:** no tension. Council C3 ("composition never written on ABSORB") and eng-review P1
("composition IS written but skips origin-less blend lots") point at the same seam from opposite
directions — one fix closes both. Gemini's dust-row objection was **refuted** by reading
`foldLines` + a live count of 0. Gemini's "is the production co-residence real?" was **answered no**
(three same-day `SEED`s summing to exact barrel capacity), which reshaped Unit 12 before the
user's call simplified it further.

**HIGHEST-VALUE FINDINGS, in order:**
1. *(eng)* `write.ts:379` drops composition for blend lots — Unit 18's UI rests on it, and this plan
   makes blend lots the norm. Would have shipped a tank reading "62% Pinot" with 38% missing.
2. *(design)* Unit 10 would have pushed users to create phantom vessels, regressing an existing
   UX principle the app built a first-class op to satisfy.
3. *(council)* ABSORB inheriting the resident's tax class is a TTB 5120.17 filing error — the exact
   hazard InnoVint documents.
4. *(council)* 3 in-flight work-order tasks reference lots the collapse would absorb.

**UNRESOLVED:** none.
**VERDICT:** COUNCIL + ENG + DESIGN CLEARED — ready to implement, branch 1 first.
