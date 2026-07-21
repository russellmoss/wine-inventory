# Council Feedback — Plan 088: One lot per vessel

**Date:** 2026-07-21
**Plan:** `docs/plans/2026-07-21-088-refactor-one-lot-per-vessel-plan.md`
**Reviewers:** Codex `gpt-5.4` (types + data layer), Gemini `gemini-3.1-pro-preview` (domain logic + UX)

Two findings were settled empirically against the live database rather than argued.
Those are marked **[VERIFIED]** / **[REFUTED]** below.

---

## Critical Issues

### C1. `deplete: true` is LOT-scoped, not vessel-scoped — the migration can wipe other vessels
*Codex.* Unit 10 collapses a vessel by calling `blendLotsCore` `GROW_EXISTING` with
`deplete: true` on each losing resident. That is only safe if every losing lot lives in
exactly **one** vessel. The plan's own headline requirement is that a lot may span many
vessels. A losing lot with barrels elsewhere would have those `vessel_lot` rows drawn down
too, distorting cost and compliance state **outside** the vessel being fixed.
**Fix:** gate the migration on "every losing lot has exactly one `VesselLot` row", or make
the collapse vessel-scoped (draw only the target vessel's volume) instead of lot-scoped.

### C2. The rollback story contradicts the invariant
*Codex.* Unit 1 lists "a CORRECTION restoring 2 lots in one vessel" as an **illegal** fold.
The risk table simultaneously claims the migration is safe because LEDGER-10's CORRECTION
path can reverse it. Once Unit 11 lands, correcting the migration would recreate the
forbidden state and be refused by both the app guard and Postgres. Both statements cannot
be true.
**Fix:** state the real rollback window — the migration is reversible **only before** Unit 11
turns the invariant on. Sequence and document accordingly; do not claim ordinary undo.

### C3. `VesselComponent` updates on ABSORB are unspecified
*Codex.* The plan promises composition survives every combine and makes `VesselComponent`
the source of truth for the Unit 15 UI, but never says how it is written on TOPPING absorb,
CRUSH `mode:"ADD"`, PRESS absorb, or group-rack absorb. Failure mode: the ledger says one lot,
lineage exists, and the composition breakdown is silently stale.
**Fix:** make ABSORB a single shared core that writes ledger lines, `LotLineage`,
`VesselComponent`, and `provenanceComplete` in one transaction. Route every op through it.

### C4. Tax-class crossing on a blind ABSORB is a TTB violation
*Gemini.* Defaulting to ABSORB merges incoming liquid into the resident lot's identity —
including its tax class. Racking a 15% ABV lot into a 13% lot keeps the resident's class.
This is the exact hazard InnoVint documents: *"If you blend into an existing lot across tax
classes, the TTB Report may not capture Lines 5 and 20 correctly."*
**Fix:** `decideCombineRoute` must inspect tax class (and `ownership` — ESTATE vs
CUSTOM_CRUSH_CLIENT). Differing class → ABSORB is **refused**, forcing NEW_BLEND so the class
is re-derived. Add a non-blocking composition warning when an absorb drops a varietal below
the 75% labelling threshold.

### C5. In-flight work orders reference lots the migration would absorb — **[VERIFIED: 3 tasks]**
*Gemini.* A drafted or scheduled task targeting an absorbed lot crashes at execution.
Queried live: **3 work-order tasks currently reference a lot in a co-resident vessel.**
**Fix:** the migration script scans pending work-order tasks for the absorbed `lotId`s and
either aborts with the list, or rewrites them to the survivor. Not optional — it is 3 today.

### C6. The old `@@unique([tenantId, vesselId, lotId])` — keep or drop?
*Codex.* Unit 11 adds `@@unique([tenantId, vesselId])` without saying what happens to the
existing composite. Drop it and every Prisma `WhereUniqueInput` / `upsert` keyed on
`(tenantId, vesselId, lotId)` must change in the same unit. Keep it and the schema carries two
uniqueness models.
**Fix:** decide explicitly in Unit 11 and enumerate the construction sites before regenerating
the client.

### C7. Functional-zero dust rows vs a plain UNIQUE index — **[REFUTED, with a caveat]**
*Gemini* argued the plain unique is incompatible with Unit 1's "a resident folding to functional
zero doesn't count as a second lot", and proposed a partial index
`WHERE volumeL > 0.001`.
Checked: [`foldLines`](src/lib/ledger/math.ts:66) sweeps any residual `<= FUNCTIONAL_ZERO_L`
(0.01) out of the map, and [`write.ts`](src/lib/ledger/write.ts:262) deletes the row when the
key has no target. **Live dust-row count across all tenants: 0.** So a plain unique is safe
*and* stronger — it would catch a future dust-row leak instead of hiding it.
**Kept as-is**, with the evidence recorded so the next reader doesn't re-litigate it.

---

## Design Questions

1. **Is the production co-residence even real?** — **[ANSWERED: no]**
   Gemini asked whether Bhutan BARREL 18 is a partitioned vessel (T-barrel) that physically
   holds distinct liquids, which would make the invariant unshippable. Checked the ledger:

   ```
   op#2 SEED 2026-06-27  2025-BJ-CF   75.00 L
   op#3 SEED 2026-06-27  2025-BJ-MR  100.00 L
   op#4 SEED 2026-06-27  2025-GS-CS   50.00 L
   BARREL 18: 225.00 / 225.00 L across 3 lots
   ```

   Three `SEED` ops, same day, three different wines (Merlot, Cab Franc, Cab Sauv across two
   vineyards), summing to **exactly** the barrel's 225 L capacity. Demo's B4 (225/225) and B5
   (228/228) show the identical signature. This is **Day-Zero onboarding data entry, not
   physics** — nobody commingles three varietals in one barrel at exactly 100/75/50.

   **This changes Unit 10.** Blending these into one lot would *fabricate a wine that has never
   existed*. The correct remedy for the barrels is a **CORRECTION of the bad SEED** (re-seat each
   lot in its own barrel), not a BLEND. Only the two tanks (T5 6,995/12,000 across 2 lots;
   T7 5,572/10,000 across 3) are plausibly real co-residence and may warrant a blend.

2. **When is ABSORB domain-legal at all?** *(Codex)* One-lot-per-vessel is orthogonal to "these
   two liquids may share an identity." What validates absorbing across differing `form`
   (MUST vs WINE), `afState`, `mlfState`, `ownership`, or vintage? Needs a named validator that
   every ABSORB path routes through.

3. **"Keep separate" at planning time.** *(Gemini)* Forcing a physical destination vessel breaks
   the real cellar workflow — a work order is drafted today, the cellar master picks clean
   barrels tomorrow. InnoVint solves this with *"let cellar staff choose vessels."* We need the
   equivalent: a draft may leave the destination unresolved; the invariant binds at **execution**,
   not at draft.

4. **Lees drums.** *(Gemini)* Racking 30 lots to one lees drum over a month means 30 absorbs and
   30 lineage edges. Is that the intent, and does the TTB engine treat a lees drum as a normal
   blend target?

5. **Co-ferment visibility.** *(Gemini)* Crushing 2 t Syrah + 1 t Viognier into one fermenter is
   a classic co-ferment. Absorbing Viognier into the Syrah lot is right for the finished wine —
   but does `VesselComponent` give the winemaker enough visibility that the Viognier isn't
   "lost"? This is the make-or-break UX question for Unit 15.

6. **TTB topping exemption.** *(Gemini)* Topping is not a declarable blend. If Unit 5 makes
   topping alter `VesselComponent`, confirm the 5120.17 fold still excludes `TOPPING` from
   "produced by / used for blending".

---

## Suggested Improvements

- **Return, don't throw, at the chokepoint.** *(Codex)* Unit 11 says `writeLotOperation` should
  *throw*. This codebase's convention is `{ ok: false, error }` because server-action
  `ActionError`s are redacted in prod. Keep the deep assert as defense, add preflight checks in
  each core, normalize to the structured return.
- **Split the census from the CI guard.** *(Codex)* CI only needs current violations; the op-type
  attribution query is expensive and awkward around corrections. Two scripts.
- **Don't ship `allowCoResidence` into runtime code.** *(Codex)* With `.env` pointing at
  production and no dev DB, a live bypass flag is a footgun. Make it a one-off script that runs
  before Unit 11 and is deleted.
- **Group rack: refuse multi-lot incoming.** *(Codex)* "Once per destination" is only safe if all
  members carry one lot identity. `decideCombineRoute` should take the full `incomingLotIds` set
  and require explicit NEW_BLEND when `size > 1` into an occupied destination.
- **Audit serialized contracts, not just types.** *(Codex)* The offline queue payloads, assistant
  tool schemas/goldens, and persisted work-order drafts are *persisted* shapes. Deleting the
  `"ambiguous"` / `{kind:"blend"}` branches needs a contract sweep, not a `tsc` pass.
- **Five vessels do not need a heuristic.** *(Gemini)* Replace largest-volume-wins with a required
  explicit mapping file, signed off per vessel. Now doubly true given finding 1 above.
- **CORRECTION over BLEND for mistake-caused co-residence.** *(Gemini)* If the co-residence came
  from a bad SEED and nothing has touched the lot since, undo the mistake rather than baking it
  into the cost ledger forever. The census (SEED 5, CORRECTION 2) says this is the common case.

---

## Verdict

Both reviewers converged on the same structural gap from different angles: **the plan is right
about the invariant and under-specified about the merge.** The invariant, the chokepoint, the
DB constraint, and the deletion sweep all survive review intact. Unit 10 does not — it needs to
split by cause (data-entry error → CORRECTION; real co-residence → BLEND) and gain a work-order
pre-flight.

## Raw Response — Codex

CRITICAL

- `scripts/migrate-collapse-co-residence.ts` / `src/lib/blend-core.ts` / type: migration semantics. The plan collapses each violating vessel by calling `blendLotsCore(... GROW_EXISTING, deplete: true)` against the losing resident lots. That is only safe if every losing lot exists in exactly one vessel. Your own invariant says one lot may legally span many vessels, so a lot-level deplete can wipe valid `vessel_lot` rows in other vessels and distort cost/compliance state outside the target vessel. Fix: add a pre-migration gate that proves every losing lot has exactly one `VesselLot` row, or introduce a vessel-scoped collapse path that re-identifies only the target vessel's occupancy and records lineage/components without depleting the lot globally.

- `src/lib/ledger/write.ts` + Unit 10 rollback claim / type: ordering + rollback hazard. Unit 1 explicitly treats "a CORRECTION restoring 2 [lots in one vessel]" as illegal, but the risk section says the migration is safe because LEDGER-10 correction can reverse it. Those two statements cannot both be true after Unit 11. Once `@@unique([tenantId, vesselId])` lands, correcting the migration would recreate the forbidden state and be blocked in app code or by Postgres. Fix: either remove the "normal correction can reverse this" claim and require a pre-cutover rollback window, or keep Unit 11 off until the migration is accepted and the rollback window is closed.

- `src/lib/cellar/topping.ts`, `src/lib/transform/crush-core.ts`, `src/lib/transform/press-core.ts`, `src/lib/vessels/group-rack-core.ts`, `app/(app)/vessels/*` / type: provenance/composition contract. The ABSORB path is described as "keep the resident lot identity" and sometimes "keep a LotLineage edge," but Unit 15 makes `VesselComponent` the source of truth for the vessel composition UI and the requirements say composition must survive every combine. The plan never says how `VesselComponent` is updated for TOPPING absorb, CRUSH `mode:"ADD"`, PRESS absorb, or group-rack absorb. Failure mode: ledger state says one lot per vessel, lineage exists, but the vessel composition breakdown is stale or incomplete. Fix: make ABSORB a single shared core that writes ledger lines, lineage, `VesselComponent`, and `provenanceComplete` in one transaction, then route every operation through it.

- `prisma/schema.prisma` + `src/lib/ledger/write.ts` / type: Prisma schema/client break surface. Unit 11 adds `@@unique([tenantId, vesselId])` but does not say whether `@@unique([tenantId, vesselId, lotId])` stays. If you remove the old unique, every Prisma `WhereUniqueInput`/`upsert` site keyed by `(tenantId, vesselId, lotId)` must change in the same unit. If you keep both, you have two uniqueness models in the schema: the database says "one row per vessel," while app code can keep reasoning in `(vesselId, lotId)` pairs. Fix: make this explicit in Unit 11. Either retain the old unique temporarily and add a follow-up cleanup unit, or remove it and enumerate every `findUnique`/`upsert` construction site that must be updated before regenerating Prisma client.

SHOULD FIX

- `src/lib/ledger/write.ts` / type: error contract. Unit 11 says the chokepoint should "throw a message naming the vessel, the resident lot, and the fix," but your codebase convention is to return `{ ok:false, error }` because action errors are redacted in production. A low-level throw here is likely to surface as a generic failure in server actions and API routes. Fix: keep the deep assert for defense, but add preflight checks in each domain core and normalize invariant failures into the existing structured return shape.

- `scripts/verify-one-lot-per-vessel.ts` / type: verification gate design. The plan combines two jobs: a standing CI guard and historical op attribution. The guard only needs current `vessel_lot` violations; the attribution query is more expensive and harder to keep correct around corrections. Fix: split this into `verify-one-lot-per-vessel` for CI and a separate audit/report script for incident analysis or migration prep.

- `src/lib/bulk/actions.ts` / type: runtime bypass hazard. Unit 7 adds an `allowCoResidence` escape for "Day-Zero legacy import" and plans to delete it later. In this repo, `.env` is production and there is no separate dev DB, so adding a live bypass into shared runtime code is a real footgun. Fix: keep the bypass out of application code. If legacy import is still needed, implement it as a one-off script that runs before Unit 11 and then delete the script.

- `src/lib/vessels/group-rack-core.ts` / type: combine decision completeness. "Apply `decideCombineRoute` once per destination" is only safe if all incoming members represent the same lot identity. If a grouped barrel-down can include multiple incoming lot IDs, routing once per destination can silently absorb multiple source lots into the resident lot without forcing `NEW_BLEND`. Fix: make `decideCombineRoute` consume the full `incomingLotIds` set and refuse or require explicit `NEW_BLEND` when `incomingLotIds.size > 1` and the destination is already occupied by a different lot.

- `src/lib/chemistry/resolve-lot.ts`, `src/lib/assistant/scope.ts`, `work-orders/*`, `src/lib/offline/queue.ts` / type: contract sweep. Units 12-14 remove `"ambiguous"` / `{kind:"blend"}` branches and the vessel-choice prompt, but the plan treats this mostly as UI deletion. Some of these are persisted or serialized contracts, not just compile-time types. Fix: add an explicit contract audit step for offline queue payloads, assistant tool schemas/goldens, and any persisted work-order drafts before deleting the branches.

DESIGN QUESTIONS

- `src/lib/transform/crush-core.ts`, `src/lib/transform/press-core.ts`, `src/lib/cellar/topping.ts` / type: domain-state validation. What validator decides that ABSORB is even legal when the incoming material has a different `Lot.form`, `afState`, `mlfState`, ownership, or tax-class-relevant state than the resident lot? "One lot per vessel" is orthogonal to "these two liquids may share identity." If that check already exists somewhere, name it in the plan and route all ABSORB paths through it.

- `scripts/migrate-collapse-co-residence.ts` / type: survivor selection policy. "Largest-volume resident survives" is operationally simple, but lot identity is externally referenced by chemistry, work orders, and compliance history. Do you actually want automatic identity preservation on a production vessel like `org_bhutan_wine_co BARREL 18`, or should migration require explicit survivor choice whenever any resident lot is referenced outside `vessel_lot`? The plan already supports `--survivor`; I would make that mandatory for production tenants rather than optional.

## Raw Response — Gemini

### CRITICAL

**1. DB Unique Constraint vs. Functional Zero (Unit 1 & Unit 11)**
* **What's wrong:** Unit 1 dictates that a "resident folding to functional zero does NOT count as a second lot." Unit 11 enforces a strict DB `@@unique([tenantId, vesselId])` on `VesselLot`. These are fundamentally incompatible. If an operation drains Lot A to 0.0001L (leaving a dust row) and fills Lot B into the same vessel, the application code will allow it, but the Prisma unique constraint will throw a fatal database error because two rows exist.
* **Where:** Unit 1 (App logic) and Unit 11 (Database schema).
* **The Fix:** You cannot use a standard unique constraint if you permit functional-zero dust rows. You must either strictly delete `VesselLot` rows the millisecond they cross the functional zero threshold (which can break float math in cost allocations), OR use a partial index in Postgres: `CREATE UNIQUE INDEX one_active_lot_per_vessel ON vessel_lot (tenant_id, vessel_id) WHERE volume > 0.001;`.

**2. Tax Class Crossing via ABSORB (Unit 3 & Unit 5)**
* **What's wrong:** Defaulting to `ABSORB` blindly merges incoming liquid into the resident lot's identity. If a user tops or racks a 15% ABV (Tax Class 2) lot into a 13% ABV (Tax Class 1) lot, `ABSORB` retains the resident lot's Tax Class 1 designation. You have just created a massive TTB 5120.17 violation. The same applies to varietal composition (diluting a Cabernet below the legal 75% threshold while keeping the Cab lot identity).
* **Where:** `decideCombineRoute` (Unit 3) and Topping (Unit 5).
* **The Fix:** `decideCombineRoute` MUST inspect the Tax Class of both lots. If they differ, `ABSORB` must be blocked, forcing a `NEW_BLEND` to legally re-evaluate the tax class. For varietal/appellation thresholds, throw a "composition warning" (e.g., "This absorb reduces Cabernet below 75%").

**3. In-flight Work Orders referencing Migrated Lots (Unit 10)**
* **What's wrong:** The migration script depletes minor lots into the survivor lot. If a winemaker has a drafted or scheduled Work Order to rack, sample, or bottle one of those minor lots next week, that operation will crash at execution because the lot no longer exists in that vessel.
* **Where:** `scripts/migrate-collapse-co-residence.ts` (Unit 10).
* **The Fix:** The script must scan `LotOperationLine` / pending work order tasks for future actions targeting the absorbed `lotId`s in those specific `vesselId`s. It must either abort and force a human to resolve the WO first, or automatically rewrite the pending WO to target the survivor lot.

**4. TTB Topping Exemption vs. Blend Folds (Unit 5 & TTB Engine)**
* **What's wrong:** The TTB permits topping without declaring it as a "Blend" on the 5120.17 Part IV, provided it's under certain volume thresholds (historically 1%, or just standard cellar practice). If Unit 5 makes Topping physically alter the resident lot's `VesselComponent` composition, you must ensure your TTB report engine doesn't accidentally fold these as "Used for Blending" / "Produced by Blending", which will inflate report line items and trigger audits.
* **Where:** Unit 5 and the TTB 5120.17 report engine.
* **The Fix:** Ensure the `LotOperation` `kind: TOPPING` explicitly bypasses the blending fold in the TTB engine, even though it alters `VesselComponent` under the hood.

### SHOULD FIX

**1. "Keep Separate" UX at Planning Time (Unit 3 & Unit 8)**
* **What's wrong:** Defining "Keep Separate" *strictly* by selecting a different destination vessel breaks the cellar planning workflow. Winemakers often draft a Work Order to "Split 500L off Tank A" today, but the cellar master won't select the exact empty destination barrels until tomorrow morning when they see what's clean.
* **Where:** Unit 3 (Combine Routes) and Unit 8 (Split-in-place).
* **The Fix:** You need a concept of a "Phantom/TBD Vessel" or allow `vesselId: null` in *drafted* (unexecuted) operations to represent "Keep Separate" without a physical vessel. Do not force physical vessel allocation during draft/proposal phases.

**2. Over-engineered Migration Heuristics (Unit 10)**
* **What's wrong:** You have exactly 5 vessels violating the rule, yet you are writing a generic `--survivor` largest-volume heuristic script. If one of those vessels is an 80/20 split where the 20 is a high-value trial that was *supposed* to be separated, auto-absorbing it based on volume destroys data.
* **Where:** Unit 10.
* **The Fix:** For exactly 5 vessels, do not use a volume heuristic. Require an explicit mapping file (`vesselId -> survivorLotId`) and make the winery owner sign off on the 5 specific resolutions.

**3. Costing Distortion via BLEND Migration (Unit 10)**
* **What's wrong:** If the co-residence was caused by a user mistake (e.g., an accidental `SEED` or racking to the wrong tank), executing a `BLEND` op to fix it bakes the error into the cost ledger forever. The survivor lot will now carry the financial burden of the mistake lot.
* **Where:** Unit 10.
* **The Fix:** Check the operations that created the co-residence. If the co-resident lot hasn't been touched since the mistake, the script should strongly suggest generating a `CORRECTION` op (undoing the mistake) rather than a `BLEND` op.

### DESIGN QUESTIONS

* **Lees Accumulation Drums:** How does `decideCombineRoute` handle racking to a shared Lees drum over a month? If 30 lots are racked to the same drum, `ABSORB` will trigger 30 lineage updates and composition recalculations. Does your TTB engine know to ignore Lees drums for standard blend reporting? (Usually, lees drums are moved to a specific junk tax/reporting class immediately).
* **Physical Barrel Dividers:** You noted a barrel with 3 lots in production. Did you confirm *why* it's there? If they are using "T-barrels" or partitioned vessels (which physically hold multiple distinct liquids), restricting `VesselLot` will completely block their physical reality. You may need to model partitioned vessels as distinct `vesselId`s (Barrel-101-A, Barrel-101-B) before migrating.
* **Multi-lot Crush / Co-fermentation:** Unit 6 says Crush resolves at the destination. If a winemaker crushes 2 tons of Syrah and 1 ton of Viognier into the *same* fermenter on the same day (a classic co-ferment), does the app force them to `ABSORB` the Viognier into the Syrah lot? This is correct for the final wine, but winemakers often want to see both source Lots represented in the must phase before it goes `ACTIVE`. Does `VesselComponent` provide enough visibility to satisfy the winemaker that the Viognier isn't "lost"?
