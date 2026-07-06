# Roadmap — Winery Operating System (the build runbook)

> The ordered phase plan. This is the **runbook that drives each `/plan`.**
> Read `VISION.md` first — especially the **Locked decisions (§11)**. Every phase
> below names the decisions it must honor.
>
> **Two kinds of detail, treated differently:**
> - **Durable detail** (intent, winemaking domain requirements, hard cases, scope
>   in/out, exit criteria, open questions) is captured **now, for every phase** —
>   including 6–10. It's grounded in how wine actually works and in the locked
>   decisions, so it won't rot. The richer it is, the better each `/plan` performs.
> - **Implementation detail** (models/fields, files to touch, unit sequencing)
>   depends on what earlier phases actually build, so it is **deferred to the phase's
>   own `/plan`** — writing it now guarantees rework.
>
> Each far phase below therefore carries real domain content but ends with
> **"Implementation: deferred to `/plan`"** and a list of decisions to resolve then.

---

## How to use this runbook (the compound-engineering loop)

For each phase, in order:

1. **`/plan`** — it reads `VISION.md` + this `ROADMAP.md` + prior decisions from the
   context-ledger, and writes a full detailed plan to `docs/plans/phase-N-*.md`.
2. **`/work`** — execute that plan; tests after each unit; incremental commits.
3. **`/verify`** — prove the phase's **exit criteria** against the running app.
4. **`/ship`** — open/merge the PR.
5. **`/decision`** — record the locked choices + learnings into the context-ledger so
   the next phase's `/plan` compounds on them. Update this ROADMAP's "Status" + refine
   the *next* phase's detail. **Reconcile the three ordering authorities** — the
   **Execution sequence** (top), the **Dependency notes**, and the H-table **"Build WHEN"**
   column — so a later `/plan` can't obey a stale one. (Execution sequence wins on conflict;
   fix the other two to match.)
6. **`/clear`** — reset context, then start phase N+1.

**Status legend:** ⬜ not started · 🟦 planning · 🟨 in progress · ✅ done

---

## Execution sequence (chronological — the authoritative build order)

**Phase numbers are stable IDs, not order.** They're referenced in plan filenames, commits, and
memory, so we don't renumber. THIS list defines what we build and when; the numbered sections below
hold the durable detail. Order within a tier is dependency-driven unless marked *(adjustable)*.

**Foundation — shipped:** 1 Lot+ledger spine ✅ · 2 Timeline ✅ · 3 Cellar ops ✅ · 4 Chemistry &
tasting ✅ · 5 Blends/lineage/RBAC ✅ · 6 Transforms/ferment ✅ · 7 Bottle/sparkling ✅ ·
12 Multi-tenancy ✅ · Universal timeline undo (plan 024) ✅ · 14 Compliance/TTB **v1** 🟦.

**8 Supplies & cost roll-up — COMPLETE** (8a + 8b). 8a = engine U1–U7/U11 + costing settings, stock
picker, expendables surface, cost-per-bottle trust panel, custom-crush routing, verify:cost. **8b advanced
DONE** (U8 barrel amortization, U13 post-bottling variance events, U14 Phase-15 accounting export seam,
U16 bulk-wine receive) — proven end-to-end by `npm run verify:cost` (41 assertions).

**9 Work orders — IN PROGRESS** 🟨. Shipped to prod: the core issue→execute→auto-log→approve→finalize
engine (plan 032), the enhancements lane (plan 9.1, PR #16), the template builder + NOTE checklist (plan
034, PRs #28/#29), and **de-stem/crush + press/saignée as work-order blocks** (plan 035, PR #30 — 2026-07-04).
Remaining: the NL/voice work-order authoring wedge (co-designed with Phase 10) + shared vineyard reuse (Phase 20).

**Do now (near-term hygiene, decoupled):** seed a **sandbox "Demo Winery" tenant** (a short script —
Phase-12 tenancy is already live) and move all dev/QA there so testing stops polluting the real Bhutan
Wine Co. tenant. This is the pull-forward slice of **Phase 21a**.

> **⏱️ The real critical path is exogenous: "US design partner signed" — and it is undated.** Three of the
> most important workstreams below are gated on a partner *event*, not on build order: **TTB compliance
> (14) can only be *validated* by a US winery running a real period close** (Bhutan doesn't file TTB —
> synthetic data + one published sample is all we can prove alone); **13 Migration** is gated on a real
> Vintrace/InnoVint export; **24 Custom crush/AP** on a custom-crush/AP partner. The **wine calendar makes
> this urgent**: it's July 2026, harvest is ~8 weeks out, so harvest 2026 is realistically gone for a new
> partner — the achievable path is **sign by fall → onboard over winter → validate live 5120.17/5000.24
> filings Jan–Jun → run harvest 2027.** That only works if **partner outreach starts NOW, in parallel
> with 8b** — not after the sellable core ships. This is a build runbook so BD isn't a phase here, but it
> IS the gating milestone: track it in `analysis/incumbent-teardown/SYNTHESIS.md` and treat "partner signed" as the trigger the
> gated phases wait on.

**Then — the sellable core (this is what lands a US design partner):**
1. **Finish 8** (8a → 8b) — true cost-per-bottle.
2. **15 Accounting** (QuickBooks/Xero) — needs 8's cost output; beats both incumbents.
   - ↳ **13 Migration** is an **event-driven interrupt**, not a slot: build it the moment a design
     partner hands over a real Vintrace/InnoVint export. It jumps the queue when unblocked.
   - ↳ **Contracts follow-on** (fruit sourcing, per-acre/per-ton) slots right after 8 — feeds fruit cost.

**Then — operational depth (retention; closes the dirt-to-bottle cost loop):**
3. **9 Work orders** — the shared issue→execute→auto-log→approve→finalize engine for cellar **and** vineyard.
   - ↳ **23 Granular RBAC, roles & user types** — the fine-grained, owner-scoped permission foundation
     (extends Phase 5); prerequisite for the client portal and sharper authorization across 9/11/21a.
     Build right after/with 9.
   - ↳ **24 Custom crush, alternating proprietorship & client portal** — Owner model + client billing
     (WOs × contracted rates → invoices → two-way QBO/Xero) + a scoped **read-only client portal**.
     Competitive **parity** (both incumbents bill clients + offer a client view) *and* a differentiator.
     Needs 9 (WOs), 8 (ownership tag + rates + billable-expense seam), 15 (invoice sync), 23 (RBAC), 14/21a
     (AP filing). **Event-driven pull-forward: jump it earlier the moment a custom-crush/AP design partner
     signs — like migration.**
4. **11 Labor — SLICED (2026-07): build only the thin cost/pay-basis seam on the critical path;**
   demote the payroll-rule engine to trigger-based. **11a (on-path):** hours-against-WO-tasks → **labor
   cost per lot** (feeds 8) + **pay-basis display on the WO** (feeds 20) — after 9. **11b (trigger-based,
   like 17):** the full timeclock/payroll product (NFC presence panels, geofenced self-report, worker
   self-service, per-state ag-vs-manufacturing OT phase-ins, piece-rate↔min-wage reconciliation) — real
   retention depth for vineyard-heavy operations and a **distinct compliance-liability surface** (CA ag-OT
   ≠ TTB), so it must NOT swallow a quarter mid-sequence. Build 11b when a partner needs payroll, not before.
5. **20 Vineyard ops, equipment & farming cost** — after 9/11a/8; adds state spray/PUR compliance.
6. **18 Visual cellar floor plan** — spatial front-end to capture; differentiator/delight. *(adjustable — self-contained, could move earlier as a demo win.)*
   - ↳ **21a Founder god-mode + sandbox tenants** — small (built on shipped Phase-12); pull in **soon** after the do-now sandbox seed, whenever you want to enter/support any winery + run clean demos.
   - ↳ **Dip-chart gauging — self-contained pull-forward slice extracted from Phase 30 (2026-07):** a
     per-vessel calibration table + a dip→volume capture path. Small, and a **US evaluator asks about it in
     the first demo**; it's the capture-convenience side of volume accuracy (the *drift-killer* itself is
     book-vs-physical reconciliation, already in Phase 14). Pull it forward like the sandbox-tenant slice
     when a demo needs it; the rest of Phase 30 (maturity sampling, pick scheduling, crush-pad capacity)
     stays with the vineyard work.

**Then — intelligence & presentation layer:**
7. **10 Assistant coverage & MCP** — most valuable once there are many surfaces to read/act on.
   - ↳ **The NL/voice work-order wedge** (strategy §4.1 — the single highest-leverage feature) is the
     Phase-9 engine + Phase-10 assistant, co-designed: parse an utterance → resolve vessels/quantities →
     **compliance-validate the proposal (Phase 14)** → present a **diff for one-tap approval**. Lead the
     demo with it; it's the propose→approve pattern (D10) applied to authoring work orders.
   - ↳ **Pull-forward wedge slice (2026-07) — don't wait for the full WO engine.** A narrow **NL →
     proposed *ad-hoc* operations** slice (rack, add at g/hL, top) rides the **already-shipped** Phase-3
     cores + D10 draft→confirm + the existing assistant write tools (plans 013/014). It gives H8 its golden
     dataset now, gives you a demo winemakers lean forward at, and de-risks the parser **before** Phase 9
     depends on it. Frame: **seed H8 evals over the existing assistant write tools immediately (near-zero
     cost); the NL ad-hoc-ops slice is a pull-forward, not a reorder ahead of the 8b→15 sellable core.**
8. **19 AI-native dashboards** — rides the Phase-10 assistant infra; needs rich data (8/14/20). *(19a deterministic → 19b AI builder.)*
9. **25 Ambient capture** (photo/OCR → proposed entries) · **26 Scenario sandbox & blend solver** ·
   **27 Institutional memory** — the AI-native **differentiation** layer (strategy §4). All ride the
   Phase-10 assistant infra + rich data (8/14/20) and obey D10 (AI proposes, human commits). **25 is a
   wedge that can pull-forward** once the core capture surfaces exist; 26 needs cost (8) + tax class (14);
   27 needs longitudinal data + Phase 10.

**Cross-cutting delivery/architecture table stakes (interleave, don't defer to the end):**
- **28 Offline-first mobile & sync** — non-negotiable, hard engineering. **Trigger (named, not "as it
  scales"): the real sync layer is a HARD PREREQUISITE of any design partner's first harvest.** Phase 9's
  whole promise — crew executes on the floor, logging as a side effect — collapses the first time a cellar
  dead zone eats a completed checklist during a partner's harvest. The Phase-6 outbox carries *dev* usage
  until then; the conflict-resolution sync layer must land before a partner runs a live vintage on it.
- **H8 eval harness — do-now:** seed golden datasets over the **existing** assistant write tools
  immediately (near-zero cost), ahead of the first *new* AI-native surface (NL ad-hoc ops / Phase 25).
- **29 Sensor/telemetry** (TankNET-class) — rides the integration phases (with/after 16).
- **30 Harvest operations depth** (maturity sampling, pick scheduling, crush-pad capacity) — slot
  alongside the vineyard/Contracts work (20) so it's ready before a harvest. **Dip-chart gauging is split
  OUT of 30 into an early self-contained pull-forward slice** (see the operational-depth list above).

**Then — channel & commercialization (trigger-based, late):**
9. **16 DTC & sales integration** (Commerce7/WineDirect).
10. **17 SaaS billing** (Stripe) + **21b self-serve signup / onboarding / per-tenant branding** — the SaaS operational layer, built together when ready to sell self-serve; hand-create tenants via god-mode until then.

**Floating / event-driven (no fixed slot):** 13 (design-partner export) · 17 (ready to charge) ·
14's state/DTC compliance sub-phase · the Contracts follow-on. Pull each in when its trigger fires.

---

## Phase 0 — Decision lock-in & guardrails  ✅ shipped
**Goal:** Make the §11 locked decisions executable, before any schema work.
- Record all of VISION §11 (**D1–D15**) into the context-ledger as decisions.
- Write the ledger invariants and say which are **DB-level constraints** vs app checks
  (D14): per-op `sum(deltaL)=0`; projection == fold of ledger; CHECK `volumeL`>0 and
  `deltaL`<>0; unique `correctsOperationId`; vessel-capacity guard; corrections never
  mutate prior events; correction blocked if a later op touched the positions (D15).
- Define the **operation-type enum** (controlled, versioned — D4: `SEED`/`RACK`/`LOSS`/
  `ADJUST`/`DEPLETE`/`BOTTLE`/`CORRECTION` to start) and the **lot form** enum
  (fruit → must → juice → wine → bottled-in-process → finished).
- Decide the **capture-provenance** fields every op carries: monotonic `sequence`,
  `observedAt` vs `enteredAt`, `enteredBy`/`observedBy`, `captureMethod` (manual/voice/sensor).
**Exit:** decisions in the ledger; an `INVARIANTS.md` (constraints vs app checks); the
op-type + form enums; the provenance field list.
**Honors:** D2, D4, D6, D14, D15.

---

## Phase 1 — The Lot + ledger spine  ✅ shipped  ← the foundation
**Goal:** Introduce `Lot`, the append-only operation ledger, the materialized
projection, and lineage edges — and prove them end-to-end through **one rack**, safely
under concurrency.
- New models: `Lot` (identity, origin, form; **no vintage in the key**; metadata
  immutable after the first op); the operation ledger (immutable, double-entry
  volumetric lines, monotonic `sequence`, provenance fields); lineage edges; a
  **vessel-group** abstraction (structure-only this phase, like lineage — so group ops
  can fan out later, D13).
- `VesselComponent` evolves into the **projection** (current state = fold of ledger),
  maintained transactionally with **SERIALIZABLE isolation + canonical row locking +
  DB constraints** (D14) — not app-only assertions. Include a dust/functional-zero rule
  and Decimal-safe (centiliter-integer) fold math.
- Cut **racking** over: `transferWine` writes a ledger operation + updates the
  projection instead of mutating component rows. Replace `planRevert` with a
  **compensating correction** path that is blocked if a later op touched the positions
  (D6, D15). `VesselTransfer` becomes a **derived read-model** (unique `lotOperationId`
  FK; "reverted" derived from a correction op; ledger-writer-only).
- **Day-Zero migration (D11):** wrap each existing vessel tuple as a "Legacy Lot" at
  current volume (old tuple as JSON snapshot); deterministic + idempotent; verify volume
  conservation and projection==fold (abort on drift); **no fabricated lineage, no
  `BottlingSource.lotId` backfill**; archive the old table in a **later** step, not the
  cutover commit (much code still reads it); snapshot + maintenance window for the switch.
**Exit:** a real rack moves a lot via the ledger under concurrent writes without
overfill or lost updates; projection == fold of ledger (parity checker passes); the rack
can be corrected (not magically reverted) and the correction is blocked when downstream
ops touched it; existing vessels show as Legacy Lots; app builds and existing tests pass.
**Honors:** D1, D2, D3, D6, D11, D12, D13, D14, D15.

---

## Phase 2 — Lot timeline (read-only chronology)  ✅ shipped
> Also shipped alongside: **readable lot codes** — variety/vineyard abbreviations +
> block/subblock geography + sublot tags, generated at lot creation, with a one-time
> legacy recode. (Originally an unplanned bonus; the identity/naming layer is now
> first-class in **Phase 12.5 — Identity presentation layer**, which turns this hardcoded
> `buildLotCode` into a versioned tokenized template + rename support. Lives in
> `src/lib/lot/{code,generate}.ts`.)
**Goal:** The CRM-style timeline view over the ledger, plus the two-views linkage.
- Per-lot timeline (reverse-chronological feed of operations) + current-state header
  derived from the projection.
- Cellar floor view ↔ lot view cross-linking.
**Exit:** open any lot, read its life from the ledger; click a vessel → its lot(s).
**Honors:** D2 (timeline = ledger projection).

---

## Phase 3 — Cellar operations beyond racking  ✅ shipped
**Goal:** Generalize the ledger to the rest of the cellar, with floor-fast capture.
- Additions, topping, fining, filtration, **loss/angel's share** as first-class
  ledger operations (D7). Each: confirm → write event → update projection.
- **Vessel-group actions (D13):** one operation tops / adds to a whole barrel group and
  fans out ledger lines to the child vessels (build the UI on the Phase 1 group schema).
- **Additions math with basis provenance:** winemakers dictate *rates* (g/hL, ppm, %
  solution); the app auto-computes *totals* (grams) from the current vessel-volume
  projection and stores the basis + inputs used. The **topping keg** draws down a
  separate lot and appends lineage to every topped vessel.
- **Cap management** (pump-over / punch-down) as a near-zero-data, one-tap "done"
  operation; **exceptions** ("couldn't complete / vessel empty / wrong barrel").
- **Racking lives in the same vessel-first Actions row** (the core shipped in Phase 1/2;
  Phase 3 gives it an on-screen home next to Add/Top/Fine/Filter/Cap/Dump). Rack records
  the volume **out** of the source and the **measured volume landed** in the destination;
  the **lees loss is derived (out − in)** — never entered as a separate loss event.
- **Loss model (clarified):** the standalone op (`LOSS` type) is **"Dump" only** —
  deliberate disposal (spoilage / emptying a vessel). **Angel's share / evaporation is
  NOT a recorded event**; it is **derived from topping** (the volume topped back ≈ the
  headspace evaporation since the last top-up). Cumulative top-ups per vessel yield the
  evaporative loss for the cost model (Phase 8) with zero extra capture.
- Correction/compensation semantics matured across these (D6, D15).
**Exit:** each operation logs, updates state, and is correctable; a single group action
tops 60 barrels; an addition entered as g/hL records the computed grams + basis.
**Honors:** D6, D7, D13, D15.

---

## Phase 4 — Chemistry & tasting records  ✅ shipped
**Goal:** pH, TA, SO₂, temp, etc. + tasting notes attached to the homogeneous liquid.
- Analysis records (extensible analyte set) + tasting notes on the lot-in-vessel.
- Trend charts (reuse the vineyard Brix charting).
- **Sample / lab lifecycle:** a reading isn't always instant — model `pulled → sent →
  pending → result returned → attached to the lot`. Not every measurement appears at
  capture time.
**Exit:** log pH/TA on a lot; see analyte trends over its timeline; a pulled sample can
sit pending and later attach its result.
**Honors:** D2 (chemistry attaches to the lot, never a phantom parent share).

---

## Phase 5 — Blends, lineage tree & RBAC redesign  ✅ shipped
**Goal:** Blends that originate new lots, the traceability DAG, and multi-vineyard auth.
- Blend operation: draws down parents, **originates a new child Lot** with its own
  records and a parent→child lineage tree.
- **Redesign RBAC for multi-vineyard lots (D9)** — many-to-many source membership /
  tenant-level cellar permissions.
- **Bench trials:** temporary trial blends/additions with tasting outcomes that do
  **not** mutate production lineage until explicitly *promoted* to a real operation.
**Exit:** blend 3 lots → 1 new lot with correct lineage; a manager scoped to one
vineyard sees a blend spanning theirs without an auth break; a bench trial can be
evaluated and discarded without touching the ledger.
**Honors:** D2, D9.

---

## Phase 6 — State transforms & fermentation logging  ✅ shipped
**Goal:** Turn fruit into wine through measured transform operations, and capture the
daily life of an active fermentation.

**Domain requirements (durable):**
- **Crush/destem/press as ledger transforms** that change the lot's *form* and record
  **actual measured yield** (D8) — never an arithmetic kg→L conversion. Whites:
  **press before ferment** (juice off skins → settle/débourbage → rack off solids).
  Reds: **press after ferment** (must ferments on skins, then pressed).
- **Press fractions are splits (D4 + lineage):** free-run vs. pressings (and harder
  press cuts) commonly become **separate lots** so they can be kept apart or blended
  back deliberately. The model must allow one press to originate multiple child lots.
- **Fermentation logging via a "Round" (vessel-first capture — D12):** the primary
  capture UX is a **bulk-entry worksheet**, one row per active vessel in route order,
  oversized auto-advancing Brix/temp fields, with operator/time/zone inherited once per
  round and one-tap flags (stuck/hot/foam/sample-sent). A fast numpad beats voice for a
  20-tank matrix; voice is for tasting notes and single messy-hand ops. Feeds the analyte
  trend curve; surface a **stuck/sluggish fermentation** signal (sugar not dropping).
  (The Round grid is a reusable bulk-capture surface, not fermentation-only.)
- **Cap management for reds** (punch-down / pump-over) as logged operations; **cold
  soak / extended maceration** as states/operations.
- **Staged additions during ferment** (yeast, rehydration nutrients, DAP in stages) —
  these are §3 addition operations that also draw down supplies (Phase 8).
- **Malolactic fermentation (MLF):** track start/finish and malic-acid readings as a
  state on the lot (chemistry record + a form/flag), since it gates later operations.
- Must be **assistant-loggable** within the guardrail (sensor data only — D10).

**Exit:** crush a harvest lot → measured juice/must volume; ferment it with daily
Brix/temp showing a curve; split free-run vs. press into distinct lots with lineage.

**Implementation: deferred to `/plan`.** Decisions to resolve then: is "fermentation"
a lot *state* or purely a series of operations? how are press fractions modeled as a
one-to-many split? where do cap-management/MLF events live (ledger op vs. note)?
**Honors:** D4, D8, D10.

---

## Phase 7 — Bottle-as-continuable-container & sparkling  ✅ shipped
**Goal:** Make bottling **non-terminal** (D5) so traditional-method sparkling — the
hardest style — works end-to-end on the same spine.

**Domain requirements (durable):**
- **Traditional method (méthode champenoise):** base-wine ferment → **assemblage**
  (a blend, frequently **multi-vintage** with reserve wines — exercises D3 directly)
  → **tirage** (addition of *liqueur de tirage* = sugar + yeast) → bottle into an
  **"en tirage" in-process state** → **secondary fermentation in the bottle** →
  **lees aging** (sur lattes, often months–years) → **riddling/remuage** (manual or
  gyropalette; a non-volumetric work step) → **disgorgement** (loss op: ejects the
  lees plug, per-bottle volume loss) → **dosage** (addition of *liqueur d'expédition*;
  sugar level sets the style — brut nature / extra brut / brut / etc.) → cork + cage →
  finalize to a sellable SKU.
- **A tirage batch is a lot in a bottled-in-process state** — a *quantity of bottles*
  that still accrues operations. **Partial disgorgement is a split:** disgorge 500 of
  2,000 bottles on one date and the rest later → two children with their own
  disgorgement/dosage dates and specs.
- **Tank method (Charmat/Prosecco):** secondary ferment in a **pressurized tank**
  (already a vessel) → isobaric bottling. Fits the existing vessel model cleanly —
  the easy case, include it as the contrast.
- **Pét-nat / méthode ancestrale:** a single fermentation *finished in bottle* — a
  simpler variant of the same continuable-bottle idea.
- **Bottle-count ↔ volume reconciliation:** in-process sparkling is counted in
  bottles; disgorgement loss is per-bottle. The projection must reconcile both.
- **Sparkling-specific supplies** (tirage yeast/sugar, riddling aids, crown caps,
  corks, cages, dosage liqueur) feed Phase 8.

**Exit:** carry a multi-vintage assemblage through tirage → in-bottle 2nd ferment →
lees aging → partial disgorgement (a split) → dosage → finished SKU, with lineage and
volumes intact end-to-end.

**Implementation: deferred to `/plan`.** Decisions to resolve then: model the "bottle"
as a vessel type vs. a distinct in-process container; how partial disgorgement splits
a bottle-counted lot; whether riddling is a logged work step or omitted from the
ledger.
**Honors:** D3, D4, D5, D7.

---

## Phase 8 — Supplies inventory & cost roll-up  ✅ *COMPLETE — 8a (engine U1–U7/U11 + settings/picker/stock UI U9/U10/U12/U15 + custom-crush routing U16 + verify:cost U17) + 8b advanced (U8 barrel amortization, U13 post-bottling variance, U14 accounting export seam, U16 bulk-wine receive); proven by `npm run verify:cost` (41 assertions)*
**Goal:** Track the consumables that make wine, then compute true cost-per-lot and
cost-per-bottle. **Physical tracking first, cost second** (same records, added later).

**Domain requirements (durable):**
- **Inputs inventory:** yeast, nutrients, SO₂, acids, tannins, enzymes, fining agents,
  filter media; **dry/bottling goods** (bottles, corks, capsules, labels, cases);
  **tirage/dosage materials** (Phase 7). Receive with cost; **consume via the addition
  operations** already created in Phases 3/6/7 (so adding to a lot draws down stock).
- **Material picker becomes a real inventory dropdown (upgrades the Phase 3 catalog):**
  the Phase 3 addition/fining form uses a light free-text `CellarMaterial` catalog
  (datalist, upsert-on-type) as a stepping stone. Phase 8 turns it into a **dropdown of
  stock items filtered by kind** (e.g. fining agents), with **"create new …" straight
  from the picker** capturing cost + %active + opening stock — no more retyping names.
  The catalog rows created in Phase 3 are the seed of this inventory.
- **Where stock is managed:** a **Setup → winemaking expendables** surface plus the main
  **Inventory** page under per-kind **categories** (fining agents, nutrients, …) to
  receive/adjust stock; the addition operations draw it down automatically.
- **Barrels as depreciating assets:** amortize cost across uses/years; allocate barrel
  carrying cost to the lots aging in them over time.
- **Cost roll-up = traversal of the ledger DAG:** each operation carries cost lines;
  **blends roll up parent cost by volume share; loss reallocates cost onto the
  remaining volume; bottling divides accumulated lot cost across bottles.** This is
  only correct *because* operations are an append-only ledger (D2) — the original
  reason mutable rows were rejected.
- Harvest/fruit cost and (optionally) labor/overhead enter the lot's cost basis at the
  appropriate operations.
- **Accounting hand-off is a first-class requirement, not implied:** the cost basis + bottling
  COGS must export to the winery's books. The full **two-way QuickBooks/Xero** sync is **Phase
  15** (a documented competitive gap — InnoVint has no QuickBooks API, Vintrace's is one-way);
  Phase 8 must produce the cost data in a shape that clean two-way sync can consume.

**Exit:** receive a supply with a cost; an addition draws it down; produce an accurate
cost-per-bottle for a bottling that traces through at least one blend and one loss.

**Runbook detail for `/plan` (front-loaded so the plan is well-fed):**
- *Prerequisites:* the append-only ledger (Phases 1/3/5/6/7) + multi-tenancy (12) must be in
  place; cost lines attach to `LotOperation`s, so this is additive to the existing chokepoint.
- *What we'll need:* a `CostLine`/cost-basis model on operations; a supply-inventory model
  (receive-with-cost, draw-down via the existing ADDITION ops); a `SupplyLot` for
  weighted-avg/FIFO; barrel-asset amortization schedule. Reuse the Phase 3 `CellarMaterial`
  catalog as the seed.
- *Costing stance (recommended default, but configurable):* **weighted-average absorption
  costing** — it matches wine reality (blends *mix* cost, and "roll up parent cost by volume
  share" IS weighted-average) and GAAP-style inventory capitalization. **Absorption:** direct
  materials + (optionally) direct labor + overhead + barrel depreciation are **capitalized into
  the wine's cost** (WIP inventory), not expensed as incurred — and wine's multi-year aging
  means cost sits in **WIP for years** before a sale; the ledger DAG *is* that capitalization
  trail. **Make it configurable:** per-tenant setting for method (weighted-avg default; FIFO
  optional) and for which cost components are capitalized (materials always; labor/overhead/
  barrel toggle per the winery's policy). Tag every cost line by component so a winery/accountant
  can include or exclude. We produce a **defensible, auditable cost basis**; the winery's CPA +
  their books (Phase 15) own the GAAP/tax treatment (e.g. §263A/UNICAP) — we feed it, not compute
  it. (Not accounting advice; the winery sets their method.)
- *Decisions to resolve:* costing method (**weighted-average vs FIFO**) for supply lots;
  barrel amortization model (per-use vs per-year); is labor/overhead allocation in v1
  (ties to Phase 11 labor); how cost rolls through **blends (by volume share)**, **loss
  (reallocate onto remaining)**, and **bottling (divide across bottles)** — the DAG traversal;
  how partial-disgorgement SPLIT children (Phase 7) inherit cost basis.
- *Open questions:* rounding/precision for cost-per-bottle; how corrections (D6/D15) reverse a
  cost line; do we store computed cost snapshots or recompute-on-read from the DAG?
- *Output contract for Phase 15:* cost basis + bottling COGS in a shape a two-way accounting
  sync can post (per-SKU, per-run, tax-class-aware where needed).
**Honors:** D2, D7.

---

## Phase 9 — Work orders  🟨 *core lifecycle + enhancements + template builder + crush/press transform blocks shipped to prod; NL/voice authoring (flagship AI wedge, co-designed with Phase 10) + shared vineyard reuse (Phase 20) remain*
**Goal:** A full **issue → execute → auto-log → approve → finalize** work-order lifecycle so
**completing a task auto-creates the ledger operation** — logging is a side effect of doing the job,
and the manager never re-keys what the crew already did. **One shared work-order engine serves both the
cellar (this phase) and the vineyard (Phase 20).**

**Shipped so far:**
- **Core engine (plan 032):** issue → execute → auto-log → approve → finalize; prefilled actuals; soft-hold
  reservations; the operation-vs-observation lane split; batch review/approve + auto-finalize for
  self-executed work; reject = plan-024 ledger reversal.
- **Enhancements (plan 9.1, PR #16):** vessel-activity/maintenance lane (WORKORDER-3 overhead never enters the
  wine cost roll-up), generic ADDITION + starter materials, FILTRATION op, Open|Archive toggle, printable sheet.
- **Template builder (plan 034, PRs #28/#29):** clone-on-customize template CRUD from the typed field
  vocabulary + a NOTE checklist block; Open-dashboard/archive filter parity.
- **De-stem/crush + press/saignée transform blocks (plan 035, PR #30 — ✅ live in prod 2026-07-04):** crush and
  press are selectable work-order blocks with native run-time sub-forms; completing one runs `crushLotTx`/
  `pressLotTx` inside the work order's single ledger tx (real must lot + yield / fraction child lots + lineage);
  rejecting reverses via `reverseTransformCore`; detail + print render human-labelled rows. Proven by
  `npm run verify:work-orders-transform` (26 assertions).

**Domain requirements (durable):**
- **Lifecycle with a manager/worker role split** (ties to the Phase-5 RBAC): a **manager/foreman
  issues** a work order (tasks + instructions + assignees + due dates); the **worker executes** it on
  a floor-first checklist; **marking a task done writes the corresponding ledger operation(s)** —
  every addition, rack, movement, filtration, etc. on the affected lots — as **prefilled actuals**;
  the **manager then reviews and approves** ("yep, they did it") which **finalizes** the ops. Until
  approval, completed ops are in a `pending-approval` state (visible, correctable, reversible).
  **The state change is applied on *completion*, not on approval.** Marking a task done immediately
  writes the ledger op and the projection reflects it at once (the wine shows in T3 *now*), so the tank
  board is truthful and the crew can chain the next op without waiting on a sign-off. Approval is a
  **verification gate that confirms/locks** (reject = a plan-024 reversal) — it is **never** the trigger
  for the movement. (Anti-pattern to avoid: withholding the inventory change until approval — it desyncs
  the system from the floor, blocks sequential work, and makes the winemaker a harvest bottleneck.)
- **Approval is configurable + bulk, not a universal per-op gate.** Per tenant / template / role: an
  owner-operator who executes their own work **auto-finalizes** (no self-approval); a larger cellar with
  a green crew requires foreman/winemaker sign-off. Review is **batch** — approve a whole day's
  racks/additions on one screen — so approval never becomes the harvest bottleneck.
- **Operations vs. observations are two lanes.** State-changing ops (rack, addition, transfer, blend,
  bottling) get prefilled-actuals + the pending→approve lifecycle. **Observations (Brix/temp/punch-down
  readings, chem panels, tasting notes) are logged directly** to the lot with no approval gate (forcing
  one adds friction for zero compliance value). A recurring WO can *task* "punch down T5 and log Brix,"
  but the reading itself is a direct measurement entry, not a pending ledger op.
- **Resource reservation — soft holds at planning, hard invariants at commit.** Issuing a WO
  **allocates** its source volume and destination capacity as a *visible, advisory* hold ("barrel 3 is
  reserved by WO-142, rack from T10, due today"). A second WO or ad-hoc op targeting a reserved vessel
  **warns and requires an explicit override** — it does **not** hard-block (cellar plans change
  constantly; a hard lock rots into dead reservations and grid-locks harvest). Reservations are
  **capacity-aware** (can't plan two fills that overflow barrel 3, on either source or destination) and
  **auto-expire** on completion/cancel/past-due so they never dangle. The real guarantee against the bad
  outcome stays the ledger's **hard invariants at commit** — vessel-capacity (LEDGER-4) + non-negative
  balances + SERIALIZABLE canonical row-locking (LEDGER-5) physically prevent overfill / lost updates
  regardless of the reservation layer. Net: a lifecycle of increasingly hard holds —
  *issued* (soft reservation) → *completed* (real pending op, capacity-enforced) → *approved* (immutable).
- **Supply consumption follows the same lifecycle — reserve on create, deplete on complete.** Issuing a
  WO with an addition **allocates** the planned supply quantity (e.g. 5 kg bentonite) — it does **not**
  decrement stock. That drives **available-to-promise = on-hand − open-WO allocations**, so a second WO
  sees reduced availability and **warns** if there isn't enough (warn, not hard-block — more supply may
  be inbound). Completion books the **actual** used against the reservation: real depletion (`SupplyLot`
  qty down + `SupplyConsumption`, the Phase-8 machinery) plus the capitalized cost line onto the **wine
  lot** (cost is lot-centric; the lot currently resides in that tank/barrel). MATERIAL/DOSAGE always
  capitalize (D5); unknown unit cost is `UNKNOWN`, never a silent $0 (COST-2). The cost, like the op, is
  **pending** until approval, then finalized (reject = plan-024 reversal that negates the consumption +
  restores exact `SupplyLot` qty by identity). Planned target vs. recorded actual may differ; reconcile
  and release the reservation on completion.
- **Notes, instructions & structured deviation capture at three levels.** (1) **Order/task instructions**
  (winemaker → crew: "rack gently off the lees, hold back the last 20 L"); (2) **completion notes**
  (crew → winemaker: "tank ran dry at 180 L", "used KMBS not liquid SO₂"); (3) **attachments/photos**
  (addition label, gauge reading). Beyond free text, tasks capture **planned vs. actual + a reason**
  (target 30 ppm / actual 28 ppm) so approval is a real review, not a rubber stamp, and the deviation is
  auditable (D14).
- Create a work order with one or more **tasks** (templated: rack, add SO₂, top, pull an analysis,
  punch-down, etc.); schedule with due dates; surface **overdue / today / upcoming**.
- **Work-order instructions carry the pay basis for the foreman** — **piece-rate vs hourly + the
  rates** — sourced from the Phase-11 wage settings (WO *displays/attaches* it; Phase 11 owns the
  wage data + payroll math, no duplication).
- **Execution UX is floor-first** (phone/tablet, ideally voice-assistable), offline-tolerant.
- **Templates = curated defaults + governed per-tenant customization (the ERP pattern):** we ship
  **system templates** (best-practice defaults, e.g. the spray WO, a rack WO); each winery **clones +
  customizes** them or builds their own (**clone-on-customize** so our updates never overwrite their
  tweaks). An issued work order is an **instance** of a template. **Customization composes from a known,
  typed field vocabulary + a validated schema — never free-form cells** — so cost roll-up (8), reporting,
  and compliance mapping (14/20) keep working across every tenant. Templates are **versioned**; an
  instance records the version it used (history isn't rewritten by a later template edit). Same
  philosophy as the Phase-19 dashboard registry. Also supports **recurring** WOs (weekly topping, SO₂).
- Reporting: scheduled vs. done, overdue, pending-approval, and (optionally) time tracking.
- **NL/voice work-order authoring is the flagship AI-native wedge (co-designed with Phase 10, strategy
  §4.1):** a winemaker says/types *"rack T12 to T15 through the crossflow, add 30 ppm SO₂ after, top the
  2023 Grenache barrels from keg 4, pull juice panels on everything that finished primary"* → the system
  parses it into structured tasks, **resolves vessel IDs + computes addition totals from current
  volumes**, **compliance-validates on the proposal** (flags a tax-class-crossing move (Phase 14),
  insufficient keg volume), and presents a **diff for one-tap approval**. Voice matters most here (wet
  hands, gloves, 3 a.m. harvest). The parser is **gated by the D26/H8 eval harness**; the write obeys
  D10 (draft → confirm). This is the propose→approve pattern applied to *authoring* the work order, not
  just executing it — the part incumbents find hardest to copy (rules engine + language layer co-designed).
  - **Material resolution must obey the post-034/036 taxonomy (durable, added 2026-07-04):** when the parser
    resolves an addition ("add 30 ppm SO₂", "add Opti-Red", "add a tannin"), it resolves against a real
    `CellarMaterial` — never a free-form string — matching by **generic AND brand name** (`materialDisplayName`;
    the winemaker says the brand or the family, not the DB name) and the user-extensible **family** vocabulary.
    It MUST scope candidates to **doseable categories** (`isDoseableCategory`/`materialScopeForTask`), exactly
    like `MaterialFilterPicker`, so the AtoZ authoring path can never dose a cleaning/sanitizing or packaging
    material into wine (WORKORDER-3). Unresolved → flag on the proposal, never invent. Estimated cost in the
    diff derives from **weighted-avg `SupplyLot` cost** (Material carries no price column — plans 036/037-view-edit),
    UNKNOWN never a silent $0 (D14/COST-2).
  - **Cost in the proposal diff uses the tenant currency (durable, added 2026-07-04 — plan 037):** any cost the
    diff shows (dosing/supply cost, cost-per-L) renders through the shared money layer (`useCurrency`/`formatMoney`,
    symbol via `Input iconLeft` on any editable cost field) — never a hardcoded `$`. Currency is a display label
    only (no FX; orthogonal to `costingPolicyVersion`, D17); the parse/compliance logic is currency-agnostic.

**Exit:** a manager issues a WO to rack two tanks; a crew member checks it off; the racks appear as
**pending-approval** ledger ops with correct provenance; the manager approves and they finalize — the
manager typed none of the rack details.

**Implementation: deferred to `/plan`.** Decisions to resolve then: is a work order a separate planning
entity, or are operations given a `planned → executed → approved` state? how does approval interact with
the plan-024 reversal system (un-approve = reverse)? how do templates instantiate? offline/poor-signal
behavior on the floor. **Reservation model:** a separate soft-allocation record vs. a status on the
vessel/lot; expiry rules (complete/cancel/past-due); capacity-aware allocation math across source +
destination; override UX when a reserved vessel is targeted; **supply available-to-promise** (on-hand −
open allocations) + planned-vs-actual reconciliation on completion. **Approval configurability:** the per
tenant/template/role matrix (incl. auto-finalize for self-executed work) and the bulk-approve surface.
**Operation-vs-observation boundary:** which task types write pending ledger ops vs. direct measurements.
**Honors:** D2, D6, D12 (prefilled-actuals, not blind logs); shared engine with Phase 20 (vineyard).

---

## Phase 10 — Assistant coverage & MCP exposure  ⬜
**Goal:** Let the winemaker drive the whole system by talking to it — within the
**blast-radius guardrail (D10)** — and expose the tool set as an MCP server.

**Domain requirements (durable):**
- **Read everywhere (all surfaces built by then):** the assistant can query any lot timeline, chemistry
  trend, current cellar state, **cost/cost-per-bottle (8)**, **compliance status (14)**, **work-order
  status (9)**, **labor/hours (11)**, **vineyard block activity + equipment machine-hours + fuel +
  farming cost + spray/REI/PHI (20)**, and **what's in each vessel/room (18)** — one read layer over the
  whole system.
- **Risk-based gating (D10):** auto-log **low-risk observations** (Brix/temp/pH/TA) with
  a ~5s undo toast (no mandatory tap); voice-**draft medium-risk ops** (single-vessel
  additions, top-ups) with one-tap confirm + explicit readback; **UI-only** for
  lineage-mutating ops (blends, draws/racking, bottling, disgorgement) — a hallucinated
  blend of premium lots corrupts the cost/lineage DAG irreversibly.
- **STT jargon dictionary** (Brix, TA, KMBS, ullage, Brett, varietals, vessel/lot
  aliases) + first-class "undo last" / "correct X to Y" voice actions + batch confirm
  for Rounds.
- **MCP server** exposing the same tool set with the same read/draft-vs-gated-write
  boundary and the existing nonce-guarded confirm path; auth-scoped.
- **Coverage extends to the new surfaces under the same D10 gating:** draft/confirm vineyard + cellar
  **work-order actions (9/20)** and low-risk **observation logging** (Brix/pH/TA, machine-hours, a fuel
  fill-up); keep **UI-only** the high-blast-radius ones — approving/finalizing a work order (it writes
  many ledger ops), cost/variance edits, and spray records that carry regulatory weight.
- **The assistant IS the Phase-19 dashboard builder:** the natural-language "build me a dashboard" flow
  is a tool on this same loop that **emits a schema-validated dashboard spec** (never layout code),
  reusing this phase's infra + risk boundary. (10 is a soft prerequisite for 19b.)

**Exit:** ask the assistant for a lot's pH trend and get it; log a Brix reading by
voice; attempt a blend by voice and be routed to a UI confirmation rather than an
auto-write. MCP server answers the read/draft tools from an external client.

**Implementation: deferred to `/plan`.** Decisions to resolve then: the exact
read/draft/gated split per tool; voice-confirm vs. UI-confirm policy per operation;
MCP auth model.
**Honors:** D10.

---

## Phase 11 — Labor, timeclock & payroll  ⬜
> **⚠️ SLICED (2026-07) — split 11a (on the critical path) vs 11b (trigger-based).** As written below,
> this phase is a standalone ag-labor product (NFC panels, geofencing, per-state ag-vs-manufacturing OT
> phase-ins, piece-rate↔min-wage reconciliation) and would swallow a quarter mid-sequence — and **CA
> ag-OT correctness is a distinct compliance-liability surface from TTB.** So:
> - **11a (build on-path, after 9):** the thin seam the rest of the system actually needs —
>   **hours-against-WO-tasks → labor cost per lot** (feeds Phase 8) and **pay-basis display on the WO**
>   (feeds Phase 20). Minimal punch/entry model; no OT engine.
> - **11b (trigger-based, treated like Phase 17 — build when a partner needs payroll):** everything else
>   below — the full timeclock capture-method matrix, the per-state ag-vs-manufacturing **overtime rule
>   engine**, piece-rate reconciliation, pay periods/approval, and QuickBooks payroll export. Real
>   retention depth for vineyard-heavy operations, **not** on the sellable-core path.
>
> The durable domain detail below is **all still valid** — it just belongs to 11b unless tagged as the
> 11a seam. Resolve the exact 11a/11b line at `/plan`.

**Goal:** Track who worked, where, doing what, for how long — across **vineyard
(agricultural)** and **winery (manufacturing)** work — compute what they are owed under
the right state + classification rules, and later export approved hours to QuickBooks. A
labor system of record that plugs into cost (Phase 8) and work orders (Phase 9), not a
bolt-on spreadsheet.

**Domain requirements (durable):**
- **Timeclock = an append-only punch log** (worker + site + timestamp + capture method),
  same event-sourcing discipline as the operation ledger. Reuses the offline outbox
  (Phase 6 Dexie) — vineyard/cellar wifi is unreliable and a clock-in must never fail.
- **Capture methods are per-site, opt-in options** (mirrors the `captureMethod` pattern):
  - **PIN on a shared tablet kiosk** (default, no special hardware),
  - **manager enters/corrects times** (always available; needed for fixes),
  - **worker self-report from phone**,
  - **geofenced self-report** — self-report allowed only when GPS is within a set radius
    of the site; **reuses the existing vineyard block polygons + map/geo stack** or a
    site geofence,
  - **NFC tap** — physical **NFC panels/tags at each work site**, and **each tag carries
    its own location**. A worker taps to start time; taps to end/resume breaks and to
    clock out. Tapping **is** the presence proof (stronger than GPS — they must be at the
    panel), and the **clock-in / resume-from-break transitions require a fresh tap** — you
    cannot clock back in without physically tapping another NFC. Works by tapping the
    **worker's own phone** to the panel (see the self-service surface below), or via a
    fixed reader at the site.
  - **No biometric / no employer hardware cost by design:** deliberately **no face or
    fingerprint scanners**. Everything runs on phones/tablets the employer already owns;
    the only physical items are **cheap passive NFC tags/panels** (a few dollars each).
    Not collecting biometrics also sidesteps BIPA-class legal exposure entirely.
- **Worker self-service phone surface** (a distinct surface from the manager/kiosk views):
  a worker opens the app and sees their **time accruing live**, **starts/ends breaks**,
  and **clocks out** from their phone — with the rule that **presence-verified transitions
  (clock-in and resume-from-break) still require an NFC tap** (or the site's chosen
  presence method), while viewing time, starting a break, and clocking out are allowed
  from the phone. Workers see only their own hours; they do **not** self-report piece rate.
- **Work is classified per entry: vineyard vs winery**, and a single day **splits across
  both** (e.g. 4 h vineyard in the morning, 8 h winery that evening = two entries, two
  classifications). Each entry also captures **what kind of work** it was and its duration.
- **Payroll settings are configurable per state AND per classification.** A winery
  operates under different overtime rules for **agricultural** (vineyard) vs
  **manufacturing** (winery) labor — e.g. **California's ag-OT phase-in** differs from
  standard FLSA daily/weekly OT. Settings hold each state's rules and separate
  vineyard/winery rule sets; the OT engine applies the right rule per entry's
  classification + worker's state.
- **Wages per worker** (hourly and/or piece rates) so the system computes amounts owed.
- **Piece work (vineyard):** set a rate per unit (e.g. $/vine); the **manager or crew
  foreman** records the count done per worker/crew (**not** worker self-reported), and it
  calculates pay — with the guardrail that piece-rate pay must still reconcile against
  minimum wage for hours worked and separate rest-break pay where the state requires it
  (e.g. CA piece-rate law).
- **Pay periods / paydays** are configurable (weekly / bi-weekly / semi-monthly, period
  start day, payday offset) so timesheets roll up to the right pay run.
- **Approval workflow:** manager approves the period → timesheets become **immutable,
  exportable** records.
- **QuickBooks export (later):** the app is the system of record for punches; an **export
  adapter** maps approved hours/wages to **QuickBooks Online** (or QuickBooks Time / CSV /
  IIF). QBO's OAuth app-review is its own milestone.
- **Compliance is first-class:** no biometrics collected (so BIPA-class exposure is
  avoided by design); **GPS location capture for geofencing needs employee notice/consent**
  where the state requires it, and location should be captured only at punch moments, not
  continuously tracked; keep an **immutable audit trail of any edits to punches**.

**Exit:** a worker taps the **vineyard NFC panel** with their phone to clock in, watches
their **time accrue live in the app**, taps to take a break, then works the winery that
afternoon (kiosk PIN) — the two entries carry different classifications; the crew foreman
records the morning's **piece work** (vines × rate); the system computes hours + overtime
under the worker's state rules for each classification with the piece-rate minimum-wage
reconciliation, rolls it into the current pay period, a manager approves it, and it exports
cleanly to QuickBooks.

**Implementation: deferred to `/plan`.** Decisions to resolve then: punch model
(in/out events vs sessions) + rounding/break rules; how the **overtime rule engine**
represents per-state + ag-vs-manufacturing rules (rules-as-data vs per-state modules) and
how much of the 50-state matrix v1 covers; piece-rate ↔ minimum-wage reconciliation model;
geofence source (block polygons vs site radius) + location notice/consent; **NFC on the
worker's phone across platforms** (Android **Web NFC** works,
but **iOS can't read arbitrary tags in-browser** → likely needs a native/PWA/App-Clip
path or a fixed reader at the panel), **which state transitions require a physical tap vs.
are allowed from the phone**, and NFC **tag provisioning + location binding + anti-cloning**;
QuickBooks mapping + OAuth; how labor cost feeds the Phase 8 cost roll-up (allocating labor
to lots) and how clocking ties to Phase 9 work-order tasks.
**Honors:** D2 (append-only), D9 (worker/manager RBAC), D12/D14 (capture provenance).

---

## Phase 12 — Multi-tenancy & SaaS foundation  ✅ shipped *(activated in prod)*
**Goal:** Turn the single-winery app into a **multi-tenant SaaS**: many wineries (tenants),
many users each, with hard data isolation.

**Sequencing (this is a FOUNDATION, not a finale):** the **isolation-boundary slice must
land before a second winery's data exists** — i.e. before onboarding the first external
design-partner winery. Do **not** defer it to "after the last feature phase"; retrofitting
tenancy grows more expensive with every phase and every row. Its number here reflects
grouping, not build order. (Honors **D16**.)

**Domain requirements (durable):**
- **Tenant model:** an **Organization (winery)** is the tenant. Every domain row carries a
  `tenantId`. Users belong to an org (and to vineyards within it via the existing D9
  membership); a session is scoped to one org.
- **DB-enforced isolation (not app-only):** **Postgres Row-Level Security** keyed to the
  session's tenant, so an application bug cannot leak one winery's data to another
  (D14 spirit: enforce in the database, never app-side alone).
- **Per-tenant uniqueness:** everything globally unique today becomes unique **per tenant**
  — lot codes, `WineSku (name,vintage,size)`, vessel codes, material catalog, locations.
  Highest-churn retrofit and the main reason to do it early.
- **Tenant threading through the spine:** `writeLotOperation` + projections (`vessel_lot`,
  `BottledLotState`, …) + lineage + RBAC predicates all carry/assert the tenant; the
  chokepoint asserts tenant consistency on every write.
- **Isolation tests are first-class:** an automated suite proving no query, action, or
  projection can read/write across tenants (the failure mode that kills a B2B SaaS).
- **Operational layer (deferred, incremental):** org signup/provisioning, per-tenant config
  + **branding/theming** (the app is currently hardcoded "Bhutan Wine Company" — that
  becomes tenant-configurable), user invitations, billing, tenant-admin surface. Built when
  onboarding real paying wineries, not up front.
- **Bhutan Wine Company becomes tenant #1** (dogfood); design-partner wineries are 2..N.

**Exit:** two wineries' data coexist in one database with RLS-proven isolation (a
verification script shows no cross-tenant read/write); lot codes + SKUs unique per tenant;
a user logs in scoped to their org and sees only their winery.

**Implementation: deferred to `/plan` — and this phase gets the full review gate:**
`/council` + `/plan-eng-review` are **required** given the cross-tenant-leak blast radius;
`/plan-design-review` applies to the later ops-layer / tenant-admin UI (light for the
backend foundation). Decisions to resolve then: pooled-with-RLS vs schema-per-tenant vs
Neon project/branch-per-tenant; how the tenant is set per request (middleware / Prisma
client extension / session GUC); migration to backfill `tenantId` onto existing Bhutan data
+ recreate unique indexes per-tenant; how RLS interacts with SERIALIZABLE ledger writes and
the Prisma singleton; auth/session → org mapping (existing auth vs Neon Auth org claims).
**Honors:** D9 (RBAC within a tenant), D14 (DB-enforced), **D16**.

---

## Phase 12.5 — Identity presentation layer (naming templates + rename)  ⬜  *(FIX_RUNBOOK Phase 1 — hard dependency for migration)*
> Pulled forward from the incumbent teardown (`analysis/incumbent-teardown/SYNTHESIS.md` §B.2;
> `FIX_RUNBOOK.md` Phase 1 / council 3.4/3.7/3.12). Was previously an "unplanned bonus"
> (see Phase 2 note) — now first-class because it is the **#1 self-inflicted gap** and a
> **hard prerequisite for Phase 13 migration** (a winery must be able to adopt its incumbent's
> codes verbatim and find lots by any known identifier).
**Goal:** Separate durable identity (`id`) from the human-facing label, so a lot can be renamed
and its incumbent codes adopted without ever rewriting history.
**Domain requirements (durable):**
- **`Lot.displayName`** — mutable, **NON-unique** free-text label (legacy free-typed names collide
  legitimately); `code` stays mutable + **unique-per-tenant**; `id` remains the only opaque identity
  (**no** opaque system slug — Decision 2). Honors **NAMING-1**.
- **Per-tenant, versioned tokenized `NamingTemplate`** — today's hardcoded `buildLotCode` becomes the
  default template's renderer (clone-on-customize, like WO templates).
- **Append-only `LotCodeEvent`** — renames are events, never snapshot rewrites. Honors **NAMING-2**
  (verify-guarded like LEDGER-10; `verify:naming` lands here).
- **A `LotIdentifier` external-reference table (NOT three scalar `sourceSystem`/`sourceId`/`legacyCode`
  columns)** — holds current code, prior codes, source-system IDs, spreadsheet aliases, TTB labels; the
  idempotent re-import key **and** the cross-identifier search index.
- **Cross-identifier search** into every lot picker — resolve current `code`, `displayName`, historical
  codes (`LotCodeEvent`), and legacy identifiers (`LotIdentifier`), so a winemaker from InnoVint finds a
  lot by whatever code they remember (council 3.12).
**Exit:** a winemaker renames a lot's `code` + sets a non-unique `displayName`; the timeline shows history
honestly (as-recorded + "renamed →"); no line snapshot is rewritten; cross-identifier search finds a lot by
any known identifier. **Honors:** NAMING-1, NAMING-2, D3.
**Implementation: deferred to `/plan` (FIX_RUNBOOK Phase 1).**

### Remediation additions (FIX_RUNBOOK / incumbent teardown) — index
> These teardown-driven additions live in the phase family where the implementer will look; this is the
> one-line index so they stay auditable together. Source: `FIX_RUNBOOK.md` + `analysis/incumbent-teardown/SYNTHESIS.md` §B.2.
- **Identity presentation layer** → Phase 12.5 above (FIX Phase 1).
- **Migration kernel + two-track seed/archive + reconciliation pack** → Phase 13 rescope below (FIX Phase 3/4).
- **Bond model, TRANSFER_IN_BOND, per-bond scoping, tax-class event, tax-paid terminal, AMEND-1** → Phase 14 rescope below (FIX Phase 2).
- **New operations to name** (FIX Phase 5/6): `CHANGE_OWNERSHIP`, `TRANSFER_IN_BOND`, one-action in-place
  lot split, lees sub-lot, barrel-group (+ break/combine), recurring WOs + first-class task-skip, guarded
  metadata edit + fold-preserving reverse-and-rebook composite, generic `CUSTOM` op + `DRAIN`/`DELESTAGE`/`COLD_STAB`.
- **Lifecycle writers to finish** (FIX Phase 5): `Lot.status` `DEPLETED`/`ARCHIVED` and
  `LotLineage.kind=TRANSFORM` are declared-but-never-written — implement a real close/archive lifecycle
  (archive-not-delete once activity exists).
- **Do NOT chase:** vintrace's DSP / distillation / RTD breadth is explicitly out of scope (off-strategy).
- **Weight↔volume dual fruit-lot tracking** (InnoVint's model): a Phase-6/30 evaluation, kept in its
  roadmap home (see Phase 30) — not pulled forward.

---

## Competitive / GTM layer (Phases 13–16) — the "wine ERP", not just production

> These four phases turn the production system into a **fundable wine-industry ERP**, driven by
> the competitive + go-to-market analysis in the **incumbent teardown**
> (`analysis/incumbent-teardown/SYNTHESIS.md`). **Build-order priority overrides phase
> numbers**, and it is **not** 13→16:
> - **Near-term lead: 14 Compliance → 8 Cost → 15 Accounting.** Compliance (TTB) is ledger-derived
>   (buildable now), table stakes for any US winery, and — with the correction/undo wedge — part
>   of what makes the product worth switching to, i.e. what *lands* the first US design partner.
> - **13 Migration comes LATER than its wedge status implies** — it is **gated on having a real
>   Vintrace/InnoVint export to build against**, which you only get once a design partner shares
>   theirs. Build it against real data, not guesses. (Virtuous order: compliance + undo + polish →
>   land a design partner → get their export → build migration.)
> - All of the above still come **ahead of** 9 (work orders), 10 (assistant), 11 (labor).
> - **Note:** the Bhutan dogfood tenant is not a US filer, so TTB can be *built + tested on
>   synthetic US-shaped data now* but *validated* only with the first US design-partner winery.
> Numbers = grouping, not sequence.

## Phase 13 — Migration & onboarding (import from Vintrace / InnoVint)  ⬜  *(GTM wedge — high priority)*
**Depends on:** **Phase 12.5** (identity presentation layer — `LotIdentifier`/`NamingTemplate`/rename/search)
and **Phase 14** (Bond entity + line-level bond) — both are **hard prerequisites** (the seed adopts
incumbent codes and must place a multi-bond winery's positions on the right bond). Chronological order in
this file is not a contract; these dependencies are.
**Goal:** Get a winery **off Vintrace/InnoVint and live in days** via a migration *kernel* + thin
per-incumbent adapters. The lead wedge — attacks the incumbents' #1 pain (painful, months-long onboarding)
and the documented churn-with-exit-friction (wineries leave Vintrace and complain it obstructs exit).
Rescoped from the incumbent teardown (`FIX_RUNBOOK.md` Phase 3/4; council 3.1/3.2/3.3/3.9).
**Domain requirements (durable):**
- **Incumbent-agnostic migration kernel, InnoVint-first, thin adapters.** Build one shared spine
  (external-file legacy-seed + `LotIdentifier` idempotent keys + unit reconciliation + saved mappings +
  reconciliation pack + coverage-gap tracking) with thin per-incumbent adapters (InnoVint the lighthouse;
  vintrace second). Prove it end-to-end on a **synthetic InnoVint fixture bundle** committed to the repo —
  no trial account, no design partner during build.
- **Customer-authorized data import, never scraping:** ingest the winery's own exports (Vintrace CSV — mind
  the ~1,000-record/file cap; InnoVint CSV/XLSX) and, where the customer provides a token and ToS permits,
  the vendor REST API. Legal path: the winery owns its facts; verify each vendor's competitive-use ToS via
  the customer's signed agreement (see `analysis/incumbent-teardown/SYNTHESIS.md`).
- **Two-track seed/archive model (MIGRATE-1 — the load-bearing correctness fix).** Emit **exactly one
  migration `SEED`** per lot/vessel that hard-sets current volume/cost/tax-class/bond at cutover — the ONLY
  legacy-sourced data that participates in the fold. Ingest legacy operational history into a **read-only,
  STRUCTURED archive** (typed columns keyed on the stable source action ID — **not** an opaque JSON blob,
  so Phase 27 can make it queryable without re-ingest), **never folded**; the timeline stitches the two
  visually. **Do not replay legacy history through the active fold** (double-counts the seed; makes the fold
  disagree with the winemaker's Day-1 reality). Honors **D11**.
- **Reconciliation pack + draft-until-sign-off.** An import stays **DRAFT** (not published to the live
  tenant) until an operator signs off on a reconciliation pack (by-vessel occupancy, by-lot volume, cost by
  lot, finished-goods counts, TTB totals, chemistry counts, unmapped entities, inferred/partial lineage,
  with named-exception acceptance). **Publish is blocked while any reconciliation delta is unresolved.**
  Gate publish to admin/owner.
- **Deterministic saved mappings, AI suggest-only** — connector-specific templates + saved per-tenant
  mappings are the primary path; AI *suggests* a mapping for unmatched columns but **never auto-commits**.
  Emit row-level parse diagnostics.
- **Identity via `LotIdentifier` (Phase 12.5), not scalar columns** — adopt incumbent codes **verbatim** into
  `code` + `displayName` (non-unique); a genuine per-tenant `code` collision is a **preflight block with
  operator resolution, never a silent suffix**; `LotIdentifier` values are the idempotent re-import keys.
- **US units:** import from **gallons / lbs·tons / °Brix** → canonical liters (D8), plus a winery
  display-unit setting. Extends the Phase 6 per-winery unit setting.
- **Coverage gaps are explicit:** import what the model covers, snapshot the rest labeled inferred/partial,
  track unmapped source fields so nothing is silently dropped.
**Exit:** a synthetic (then a real, customer-provided) InnoVint export imports cleanly under a Demo tenant —
preflight → mapping → draft → reconciliation → sign-off — current balances seeded (fold correct), legacy
history archived read-only + stitched, codes adopted verbatim, publish gated on sign-off. **Honors:** D8,
D11, D16, MIGRATE-1, NAMING-1, BOND-1.
**Implementation: deferred to `/plan` (FIX_RUNBOOK Phase 3 kernel + Phase 4 InnoVint adapter).**

## Phase 14 — Compliance & reporting (TTB, excise, state/DTC)  🟦 *5120.17 + 5000.24 excise + filing-deadline reminders shipped; state/DTC remaining*  *(table stakes — high priority)*
> **v1 shipped (plan 025):** TTB F 5120.17 **Part I §A + §B**, all 6 tax classes, gallons + Part X,
> auto-derived from the ledger — tax-class derivation (ABV + still/sparkling + carbonation + product
> type, overridable), the reversible `REMOVE_TAXPAID` op, the period-boundary fold (carry-forward
> begin, footing via drift→A9/A30/B19), a review-before-file screen (`/compliance`), the filled
> AcroForm PDF (`pdf-lib` + calibrated fieldmap), an AI anomaly/readiness check, and two RLS-isolated
> tables (`compliance_report`, `compliance_profile`). Validated end-to-end on a synthetic tenant
> (`npm run verify:ttb`) + the pure fold against a TTB-published sample.
>
> **v1.1 shipped (plan 026):** TTB F 5000.24 **wine excise TAX return** as a second, independently-
> selectable form on `/compliance` (a `formType` discriminator generalizes the same filing table +
> review shell; every report query is `formType`-scoped so the two forms never cross). Computes the
> wine line 10 = Σ(gallons taxpaid-removed by class × rate, 27 CFR 24.270) and the **CBMA small-producer
> credit** (26 USC 5041(c)) across the stateless calendar-year 30k/130k/750k ladder (wine + cider share
> one ladder, each at its own rate), → net line 21. Return-cadence model incl. the **semimonthly
> September triple-split** (EFT vs non-EFT); a payment-first review screen with the CBMA ladder strip
> + a **Pay.gov data-entry panel** (primary) + the filled 5000.24 PDF (secondary); excise anomaly/
> readiness (>24% ABV → distilled-spirits block, over-750k, negative tax); reversible/amendable via the
> 025 machinery. Validated end-to-end (`npm run verify:excise`) incl. the CBMA step-down, C5 taxpaid-
> only base, PDF round-trip, file→reverse→amend, and the formType-scope regression. **Deferred
> (documented, not built):** Pay.gov e-file/auto-submit, the TTB Pilot Combined Return, state/DTC
> (ShipCompliant/Avalara), spirits/beer/tobacco computation, multi-entity controlled-group credit split,
> Parts III/IV/VI–IX, mid-period cross-class movement auto-posting (anomaly-flagged).

> **Remaining scope — bond + tax-class model (FIX_RUNBOOK Phase 2; SYNTHESIS §B.2; council 3.5).** Pulled
> *before* Phase 13 migration (the seed must place a multi-bond winery's positions on the right bond):
> - **`Bond` entity** (registry #, penal sum, premises, owner link), tenant-scoped + RLS-isolated. **Bond
>   affiliation is posted at the operation/line level and is time-aware** — the authoritative bond is derived
>   point-in-time from the ledger (mirroring `deriveTaxClass()`); any lot-level "home bond" is a **projection
>   only, never the compliance source of truth**. Honors **BOND-1**.
> - **`TRANSFER_IN_BOND` op family** — moves volume between bonds, posting **symmetric Removed-in-Bond /
>   Received-in-Bond** to both bonds' reports (fills §A 7/15, §B 3/9), atomic in one ledger tx.
> - **Per-bond report scoping** — one filed 5120.17 per bond; extend the `formType`-scoped query pattern with
>   a bond scope reading the line-level bond so filing chains never cross.
> - **`CHANGE_OWNERSHIP`** — atomic append-only ownership/bond change with **no follow-up zero-volume
>   Measurement ritual** (kills vintrace's worst quirk).
> - **Dated, append-only Change-Of-Tax-Class event** — ABV stays the suggested default but a winemaker can
>   intentionally set/correct a class. Honors **TAXCLASS-1**.
> - **Tax-paid terminal state + `RETURN_TO_BOND`** — taxpaid cannot re-enter in-bond via an ordinary
>   reversal; only a refund-flagged Return-to-Bond re-admits. Honors **TAXPAID-1**.
> - **Amended-chain integrity (AMEND-1)** — correcting a FILED period cascades `NEEDS_AMENDMENT` down the
>   form+bond chain and regenerates begin-balances.
> - **Bounded, partner-gated international sub-phase** (AU WET / NZ excise / CA Winegrower) — market
>   expansion, **not a US-launch blocker**; kept in this roadmap home, sequenced on a real AU/NZ partner.

**Goal:** Auto-generate the compliance a US winery legally must file, from the ledger. **Table
stakes** — both incumbents generate the 5120.17; we cannot sell to a US winery without it. Our
version is *auto-derived from an auditable event log + AI anomaly check + per-lot backing*.
Reference form (real, Sept-2025 rev): `docs/TTB 5120.17.pdf`.

**Domain requirements (durable):**
- **TTB F 5120.17 (Report of Wine Premises Operations)**, generated from the ledger. Structure
  (from the real form): **units are GALLONS**; **Part I** splits **Section A — Bulk Wines** and
  **Section B — Bottled Wines**, each a beginning→+adds→−removals→losses→ending reconciliation
  where **"on hand end" = book inventory** carried to next period's "on hand beginning."
  Also Parts III (distilled/wine spirits), IV (materials), VI (distilling material/vinegar),
  VII (in-fermenters), VIII (nonbeverage), IX (special natural wines), X (remarks). v1 = Part I
  (Sections A+B) + Part X; Parts III/IV/VI–IX as the winery needs them.
- **Six tax classes (the columns) — every volume must carry one:** (a) ≤16% ABV · (b) 16–21% ·
  (c) 21–24% · (d) artificially carbonated · (e) **sparkling** · (f) hard cider (statutory def:
  ≤0.64g CO₂/100mL, apple/pear, 0.5–<8.5% ABV). **Sparkling splits BF vs BP** (bottle-fermented
  vs bulk-process) — ties directly to Phase 7 (tirage vs tank method).
- **Every form line is an operation type** → build an explicit **operation→line-item map**:
  produced-by fermentation/sweetening/addition-of-spirits/blending/amelioration (A2–A6);
  received/transferred in bond (A7/A15, B3/B9); **bottled (A13 = B2)**; **removed taxpaid**
  (A14/B8 — the tax-determination event); used-for effervescent/testing/sweetening/spirits
  (A18–A23); removed for distilling-material/vinegar/export/family-use (A16/A17, B12/B13);
  losses-other-than-inventory (A29) vs inventory losses (A30); breakage (B18) / shortage (B19);
  inventory gains (A9). Blending is reported **only when different tax classes are blended**
  (form footnote 5).
- **Ledger classification requirements (the schema touch — cheaper to add EARLY):** to
  auto-derive the report, lots/operations must carry **(1) `taxClass`** (the 6-value enum, +
  sparkling BF/BP sub-type), **(2) `bondStatus`** (in-bond vs taxpaid; model tax-determination
  as an operation), and **(3) operation `reason` codes** that map to the form's line taxonomy.
  The **bulk/bottled** split already exists via `LotForm`. Flag: the app does **not** capture
  taxClass or bondStatus today — adding them before more operations pile on avoids a retrofit.
- **Filing rules:** monthly by default, **due the 15th** after period end; quarterly/annual
  allowed under 27 CFR 24.300(g)(2). **Original / Amended / Final** versions; amendments adjust
  from the excise return (F 5000.24) with Part X explanation. **Physical inventory** reconciles
  book vs actual as gains (A9) / losses (A30, bulk) / shortages (B19, bottled).
- **Excise tax return (F 5000.24):** compute wine excise by tax class incl. **CBMA/CBMTRA
  small-producer credits**; relate to the 5120.17 removals-taxpaid. Multi-bond for custom-crush.
- **State + DTC compliance** (the real differentiator beyond the federal 5120.17): integrate
  **ShipCompliant (Sovos) / Avalara** or generate state reports; the state-by-state DTC matrix
  over time.
- **FDA / FSMA-204 traceability & recall (table stakes):** the append-only lineage DAG already holds the
  facts; this makes them a **deliverable** — a lot-level **recall/traceability report** that, given any
  lot or additive lot number, reconstructs every affected downstream lot/SKU + the source evidence
  (additive records, receipts). Ties to the audit-defense packet; cheap given the ledger, disqualifying
  if absent.
- **AI/anomaly layer** — flag likely reporting errors before filing ("this month's losses are 5×
  your usual"), "am I compliant / ready to file" queries. **Human-review-before-file** always;
  auto-generate the numbers, never auto-submit unreviewed.
**Exit:** a month's 5120.17 (Part I A+B, all six tax classes, gallons) generates from the ledger
with per-lot audit backing and an anomaly check, matching the real form; a US design partner
validates it (Bhutan cannot — it doesn't file TTB, so build/test on synthetic US data first).
**Implementation: deferred to `/plan`.** Scope v1 to Part I + the beachhead states (NY + NE).
Decisions to resolve: how taxClass is assigned/derived (from ABV + wine type, with override);
whether tax-determination is a distinct op or a flag transition; report as filled TTB PDF vs
Pay.gov e-file vs both; how corrections (D6) flow to Amended reports.
**Honors:** D2 (ledger-derived), D8 (gallons↔liters), D14 (auditable), + Phase 7 (sparkling BF/BP).

## Phase 15 — Accounting integration (QuickBooks / Xero, COGS/AP)  ✅ *COMPLETE — all 15 units on main (plan 030): per-tenant OAuth + AEAD-encrypted tokens, guided CoA mapping (business roles), transactional outbox, exactly-once poster (claim→post→verify, query-before-post by DocNumber), reconcile read-back, supply receipt → AP Bill (immutable ApExportEvent), D6 current-period reversing journal, /accounting dashboard. QBO sandbox-verified live; proven by `npm run verify:accounting-idempotency` (11), `verify:accounting-reversal` (7), `verify:tenant-isolation`. Xero drops in behind the adapter. Prod GA gated on Intuit production app-review + SEC-C4 KEK→cloud-KMS (see docs/phase-15-go-live-runbook.md).*
**Goal:** **Two-way** sync to the winery's accounting system — beating both incumbents (InnoVint
has **no** QuickBooks API; Vintrace's is one-way/gated).
**Domain requirements (durable):**
- **Two-way QuickBooks Online / Xero** sync (COGS, AP, inventory GL) — not a one-way data dump.
- Cost basis flows from the **Phase 8** cost roll-up; approved bottling COGS posts to accounting.
- Purchasing / AP for dry goods + supplies (ties to Phase 8).
**Exit:** a bottling's COGS posts to QuickBooks/Xero and reconciles; a supply PO flows to AP.
**Runbook detail for `/plan`:**
- *Prerequisites:* Phase 8 cost roll-up (the source of COGS); multi-tenancy (each winery links
  its *own* accounting account — per-tenant OAuth tokens/credentials, tenant-scoped).
- *What we'll need:* a sync-mapping layer (our accounts/items → the winery's chart of accounts);
  an outbound poster (bottling COGS, inventory adjustments, supply AP bills) + inbound reconcile;
  idempotency keys so re-sync doesn't double-post; a per-tenant connection + token store.
- *Dev prerequisites (sign up when Phase 15 starts; all free to build against):* a free
  **Intuit Developer account** (developer.intuit.com) + a QBO **sandbox company** for QuickBooks
  Online; a free **Xero developer account** (developer.xero.com) + **demo company** for Xero.
  Both APIs are genuinely two-way (OAuth 2.0). **Per-winery OAuth:** each tenant authorizes our
  app against *their* books; store the token tenant-scoped (ties to Phase 12). Free to develop;
  **production requires Intuit app-review / Xero app certification** — a lead-time milestone, not
  a blocker. Start with **QuickBooks Online** (larger US SMB base; the gap where InnoVint has no
  API at all).
- *Decisions to resolve:* QuickBooks Online vs Xero first (QBO likely — larger US SMB base);
  scope of "two-way" (do we pull AP/payments back, or push-only v1 with reconcile-read?); how to
  map to a winery's existing chart of accounts (guided setup vs templates); handling amended
  filings / corrections (D6) as accounting reversals.
- *Open questions:* QBO **OAuth app-review** (its own milestone, plan lead time); rate limits;
  how WET/other regional taxes are handled (an Australian Vintrace gap — likely out of US v1
  scope); mapping tax classes (Phase 14) to accounting.
- *Accounting-method stance — map to theirs, don't impose:* we do **not** pick a reporting
  standard. QuickBooks/Xero is already configured with the winery's **basis** (cash vs accrual),
  **chart of accounts**, and GAAP/tax setup. We **post into their books the way their setup
  expects** and let their system do the treatment. Build it **method-agnostic + per-tenant
  configurable**: a guided mapping of our COGS/inventory/AP entries → *their* chart of accounts;
  **cash vs accrual changes when/whether COGS posts** (accrual: COGS at sale + inventory
  capitalized; cash: simpler). **Do NOT rebuild the general ledger or do double-entry ourselves —
  QuickBooks/Xero IS the GL;** we're the operational + cost system of record that feeds it. Cost
  basis comes from Phase 8 (weighted-average absorption default, configurable per tenant).
- *Competitive note:* two-way beats both incumbents (InnoVint has **no** QBO API; Vintrace's is
  one-way/gated) — keep it genuinely bidirectional, that's the differentiator.
**Honors:** D2, D7.

## Phase 16 — DTC & sales integration (Commerce7 / WineDirect)  🟨 BUILT — pending live sandbox verification
**Status (2026-07-03):** The Commerce7 DTC integration is **CODE-COMPLETE on `main`** (plan
`docs/plans/2026-07-03-031-feat-commerce7-dtc-sales-integration-plan.md`, Units 1–11). What's built and
proven offline against the Demo Winery DB: schema + RLS (5 tenant-scoped tables, 3-way delivery seam),
provider-neutral commerce adapter + Commerce7 REST client + mock + rate budget, nonce-bound install /
confirm / disconnect + HMAC-routed webhook, SKU + DTC sales-account mapping (withhold-when-unmapped),
inbound sync (mutable order projection → append-only diff→delta ingest, Paid-only, SALE depletion, one
SERIALIZABLE tx), additive-on-increase outbound inventory + read-only drift, the DTC revenue-delta poster
(reuses the Phase-15 exactly-once sweep), refund/cancel reversal (D6), webhook self-heal, the sync-status
dashboard, and the read-only per-channel DTC margin view. Green: `npm run verify:commerce7` (11 e2e
assertions) + `npm run verify:commerce7-idempotency` (20 assertions) + the full unit suite + `npm run build`.
**REMAINING before this ships to a real winery:** the **live Commerce7 sandbox verification** (Unit 0 —
waiting on the Commerce7 developer-account sandbox: App ID + Secret Key, and confirmation of the five
unconfirmed API surfaces — inventory adjust endpoint, 429 body, refund/partial-refund + `upsert` churn,
install/uninstall payloads, webhook source IPs). Also: the fee/payout reconciliation gap + revenue JE
DR/CR direction need an accountant sign-off (see the go-live runbook), and SEC-C4 KEK→KMS before GA.
See `docs/plans/phase-16-go-live-runbook.md`.
**Goal:** Close the fragmentation gap — finished-goods inventory + sales depletion + revenue — by
**integrating** the DTC/club/POS layer (integrate, do not rebuild).
**Domain requirements (durable):**
- **Commerce7 / WineDirect integration:** finished-goods inventory sync, sales depletion drawing
  down `BottledInventory`, revenue for per-SKU profitability. (Note InnoVint's Commerce7 link is
  one-way + 1:1-constrained — our multi-tenancy lets us do better with multi-winery accounts.)
- **Custom-crush client visibility** (a Vintrace gap): scoped **client read-access** via the
  Phase 12 multi-tenancy boundary — a real edge for custom-crush facilities. **(The full custom-crush /
  AP / client-portal + client-billing capability is now its own Phase 24 — built on Phase 23 RBAC; this
  Phase-16 line is only the DTC-adjacent finished-goods slice.)**
**Exit:** a DTC sale depletes finished-goods inventory; a custom-crush client sees only their wine.
**Implementation:** the DTC/Commerce7 slice is **built** (plan 031, Units 1–11 on `main`; verified offline,
pending the live sandbox smoke). The **custom-crush client-visibility** slice remains deferred to Phase 24.
**Honors:** D16 (tenant/client scoping), D19 (DTC-customer PII data-minimized — no PII in events/projection/logs),
D20 (event-driven adapter off our ledger; ERP authoritative, Commerce7 a downstream replica).

## Phase 17 — SaaS subscription billing (Stripe)  ⬜  *(commercialization — trigger-based, late)*
**Goal:** Charge wineries to use the app. This is **platform monetization**, distinct from the
in-app custom-crush *client* billing (**Phase 24**, building on the Phase-8 billable-expense seam + the
Phase-9 work-order engine; VISION **D21** — do not conflate; note the "D19" cost-side seam lives in the
plan-028 local decision list, a different namespace).
Not a product-capability blocker: it gates nothing in the 14 → 8 → 15 sellable path. Sequenced by
**readiness to charge real money**, not by phase number.
**Tool choice:** **Stripe** (Stripe Billing + Stripe Tax when needed) — the default for developer-built
US B2B SaaS: subscriptions, tiers, trials, proration, metered/usage, dunning, invoicing. Attaches to
the **Phase-12 `organization`** model (each tenant → a Stripe Customer + Subscription; webhook-driven
status; gate app access on `active`/`past_due`).
- *Alternatives considered:* **Merchant-of-Record (Paddle / Lemon Squeezy)** — offloads global
  sales-tax/VAT but takes a bigger cut (~5%+ vs Stripe ~2.9%+30¢); worth it only if we sell heavily
  international. **Chargebee / Recurly** — billing-ops layer, only if pricing gets genuinely complex.
  For a US winery SaaS, Stripe wins.
**Domain requirements (durable):**
- **Hand-invoice first, build self-serve later.** First paying customers / design partners →
  Stripe Invoicing sent by hand (zero code). Build self-serve subscriptions + access-gating only once
  manual invoicing hurts. Don't build ahead of paying customers.
- **Per-tenant subscription state** on the org (plan tier, trial, seats?, status), webhook-synced;
  app access gated on status (fail-closed on `past_due`/`canceled`, with a grace/dunning window).
- **Never let billing state leak across tenants** (Phase-12 RLS; billing tables are org-scoped).
**Exit:** a winery self-serve-subscribes, their access reflects subscription status, and a failed
payment triggers dunning without data loss.
**Open question (resolve at `/plan`):** **pricing model** — flat tier vs per-seat vs
**production-volume-based** (cases/tons, how Vintrace & InnoVint price). This choice decides whether we
need Stripe metered/usage billing or just fixed subscriptions.
**Implementation: deferred to `/plan`** (stub until we're near charging). **Honors:** D16 (tenant scoping).

## Phase 18 — Visual cellar floor plan (spatial capture UI)  ⬜  *(differentiator / delight)*
**Goal:** A **to-scale, clickable map of the cellar** — the winemaker lays out their rooms and places
tanks/barrels, then works the floor by clicking a vessel to see what's inside and log against it. This
is a **spatial front-end to the existing vessel-first capture** (honors D12), not a new data model —
the incumbents have nothing like it. The killer query: "where is lot X?" → the vessels holding it light
up.
**Domain requirements (durable):**
- **Rooms + floor-plan editor:** multiple named rooms per winery; click through the rooms they've
  created. An **editor mode** to lay out the space (place/move/resize/label vessels) vs a **daily
  view mode** (click to inspect/log). Rooms are tenant-scoped and map to / extend the existing
  `Location` model.
- **Place vessels to scale:** input real dimensions — **tank radius/footprint** rendered as a circle,
  barrels as rectangles/stacks — positioned on the room canvas (x/y + footprint on a placement record).
  A vessel's placement follows it as it physically moves between rooms.
- **Live state overlay on every vessel:** show the vessel **number/code** + resident **lot code(s)**,
  and be state-aware — **during fermentation show latest Brix + temp**; otherwise show the wine's
  **stage** (AF/MLF state, aging, bottled, etc.). Data comes from `vessel_lot` + the ferment/analysis
  readings (Phase 6) — no new source of truth.
- **Click-through to capture:** clicking a vessel opens the existing vessel-first surface to **log a
  ferment reading, addition, fining, movement/rack** — reuse the Phase 3/6 cores, don't fork them.
- **Barrels as stacks (top-down):** barrels shown from above as **stacks**; click a stack and it
  **unfurls to the individual barrels**, each showing its lot. A stack is a placeable grouping.
- **Filter / find-my-wine:** filter by **lot(s)**, variety, stage, etc. → matching vessels/barrels
  highlight in place and the rest dim. "Show me every barrel of the 2025 Pinot" lights them up on the map.
**Exit:** a winemaker builds a room, places to-scale tanks + a barrel stack, sees Brix/temp on a
fermenting tank and stage on the rest, clicks a tank to log an addition, and filters to one lot to see
exactly which barrels hold it.
**Runbook notes for `/plan`:**
- *Reuse:* `Vessel` (tanks + barrels), the `vessel_lot` projection (contents), `Location` (rooms),
  the ferment/`AnalysisPanel` readings (Brix/temp/stage), and the existing addition/rack/ferment cores
  (click-to-log). New tables (room, vessel-placement, barrel-stack) follow the Phase-12 RLS checklist.
- *Decisions to resolve:* canvas tech — **reuse the Leaflet + geoman stack** already used for the
  vineyard map (`SatelliteMap`), vs a diagramming lib (react-konva / SVG) better suited to an abstract,
  non-geo floor plan; to-scale vs schematic layout; explicit barrel-**stack** entity vs derived; how a
  vessel's placement updates when a movement/rack relocates it.
**Implementation: deferred to `/plan`.**  **Honors:** D12 (vessel-first capture), D16 (tenant scoping),
+ Phase 6 (ferment readings) and Phase 5 (lot state).

## Phase 19 — AI-native customizable dashboards  ⬜  *(differentiator / platform)*
**Goal:** Replace the legacy single dashboard (a leftover from the simple-inventory days that "makes
no sense" now) with **user-built, role-appropriate dashboards composed by AI in natural language**.
Winemakers want different views for harvest vs ferment vs cost vs compliance, at different times. They
describe what they want, an AI assist builds it, and they fine-tune on a canvas. Match the surface
Vintrace/InnoVint offer (scorecards, charts, tables, saved-search dashlets) but **AI-first, with minimal
training**.
**Core architectural principle (makes "AI-native" and "consistent" coexist):** the LLM **emits a
schema-validated dashboard SPEC (JSON) against a curated widget registry — never layout code or free
HTML.** Determinism/formatting come from the registry + server-side validation; freedom comes from
composition. Pre-built widgets + pre-made templates guarantee consistency; an invalid AI spec is
rejected and repaired, never rendered. This is the user's "as deterministic and programmatic as
possible."
**Resolved decisions (2026-07-02, pre-`/plan`):**
- **Ownership:** per-user dashboard instances + tenant/role **templates** that seed everyone and can be
  published (nobody starts blank; power users still customize their own).
- **AI data ceiling:** **curated metric catalog only** this phase — numbers always come from pre-built,
  validated metrics/widgets; arbitrary "ask anything" NL→query is a later guarded phase, OUT of scope here.
- **Interactive logging (Brix/pH/TA/additions from a widget): FAST-FOLLOW, not first release** — 19a/19b
  ship view + drill-down; log-from-widget lands after the foundation is proven.
- **Device:** **desktop-first** (the drag-resize canvas editor) + **tablet-viewable**; phone gets a
  simplified read view. Not full mobile editing parity.
- **Defaults (small, not asked):** refresh = on-load + manual refresh button (live later); who-can-edit
  = follows existing RBAC; export/share-a-dashboard = deferred fast-follow.
**Domain requirements (durable):**
- **Widget registry:** a fixed set of typed, pre-built widgets — **scorecard/metric, line/bar/pie
  chart, table, saved-search list, work-order list**, plus **interactive** ones: **drill-down**
  (click → filtered list/detail) in the first release, and **log-action** (launch an existing capture
  surface to log Brix / pH / TA / additions / movements from the dashboard, reusing the Phase 3/6 cores —
  honors D12) as the **fast-follow**. Each widget declares its data binding + config schema.
- **Curated metric/data catalog:** widgets bind to a tenant-scoped catalog of queryable
  metrics/entities (volume on hand, cost per lot/bottle from Phase 8, compliance figures from Phase 14,
  ferment state/readings, counts, losses…) — reuse existing read models. Allowlisted bindings keep AI
  output safe + deterministic (no arbitrary NL→SQL in v1).
- **AI builder:** natural-language create/edit ("give me a harvest dashboard with intake by variety and
  a ferment watchlist") on the **existing `/api/assistant` tool-use loop**; the AI edits the SAME spec
  the canvas edits (one source of truth).
- **Canvas editor:** grid-based drag / move / resize / relabel / font + config panels — the manual
  override on top of the AI. (Layer-1 candidate: `react-grid-layout`.)
- **Many dashboards + default + switcher:** users create as many as they want, **set one as the
  default** (what they land on at login), and switch via a **dropdown**. Pre-made templates seed new
  users; tenant/role templates can be published.
- **Tenant + user scoped** (Phase-12 checklist): dashboard instances + widget configs are per-user;
  templates are tenant/role level.
**Exit (19a/19b):** a winemaker asks the AI for a ferment dashboard, gets a valid multi-widget layout,
tweaks it on the canvas, drills into a scorecard, sets it as default, and switches to a cost dashboard
from the dropdown. **Fast-follow exit:** logs a Brix reading from a widget without leaving the dashboard.
**Runbook notes for `/plan`:**
- *Reuse:* the assistant tool-use loop (`/api/assistant`); existing read models (Phase 8 cost, Phase 14
  compliance, `vessel_lot`, ferment/`AnalysisPanel`); existing capture cores (log-from-widget); the
  hand-rolled SVG chart components (`FermentChart`, `AnalyteTrendChart`) as chart primitives.
- *Decisions still open for `/plan` (ownership/catalog/logging/device now resolved above):* **charting**
  — extend the bespoke SVG primitives vs adopt a lib (recharts/visx/nivo); **canvas/grid** lib
  (`react-grid-layout` candidate); the **widget-spec schema + registry** design (the load-bearing piece);
  the initial **template set** to seed users; how the AI-edit and canvas-edit reconcile on one spec.
- *Recommended internal phasing:* **19a** deterministic foundation (widget registry + validated spec +
  canvas + templates + multi-dashboard/default/switcher, no AI) → **19b** the natural-language AI
  builder on top. Build the deterministic system first; the AI is a spec-generator over it.
**Implementation: deferred to `/plan`.**  **Honors:** D12 (log from anywhere / vessel-first),
D14 (auditable), D16 (tenant scoping); reuses the assistant infra + Phase 8/14 read models.
Note: Phase 18's floor plan and saved searches become widget types here — the dashboard is the
composition layer.

## Phase 21 — SaaS operations: founder god-mode, sandbox tenants & onboarding  ⬜  *(operational layer on the shipped Phase-12 foundation)*
**Goal:** The human operational/admin layer ON TOP of the already-shipped Phase-12 isolation boundary
(RLS is live in prod). Phase 12 enforces per-tenant isolation; **this phase is how people create, enter,
and manage tenants**. Explicitly **not** a rebuild of multi-tenancy.
**Domain requirements (durable):**
- **Founder "god mode" (21a):** a **platform-level super-admin role above all tenants** — list every
  winery, and **enter any tenant's instance (act-as / impersonate)** to navigate + support, built on the
  existing `runAsTenant`/`runAsSystem` machinery + a tenant switcher. **Every god-mode entry is audited**
  (who entered which tenant, when); fail-closed to the founder/platform role only. Never a silent
  cross-tenant read path in the normal app.
- **Sandbox/demo tenants (21a):** one-command creation of a **seeded fake winery** ("Demo Winery") for
  demos AND dev/QA, isolated from real winery data. **Going forward all testing runs in a sandbox
  tenant, never the real Bhutan Wine Co. tenant.** A "reset sandbox to seed" affordance for repeatable demos.
- **Self-serve signup & onboarding (21b, late):** a real winery signs up → **clean empty tenant + owner
  login + guided setup** (locations, vessels, varieties…); invite teammates (Phase-5 RBAC + the
  better-auth org/member layer); **per-tenant branding**. Pairs with billing (Phase 17) at commercialization.
**Exit:** the founder lists all wineries, enters a demo tenant and resets it; a new winery self-signs-up
into a clean instance and invites a user; no test activity ever touches real winery data.
**Runbook notes for `/plan`:**
- *Reuse:* `runAsTenant`/`runAsSystem`/tenant-context (Phase 12); better-auth organization/member; the
  audit log (D14). *Near-term shortcut (do now, pre-phase):* a **seed script** that creates one demo
  tenant + fake data is a short task given tenancy is live — pull it in immediately so Phase-8 testing
  stops polluting the real tenant, ahead of the full phase.
- *Decisions to resolve:* impersonation model (full act-as vs read-only cross-tenant view); god-mode
  audit + guardrails; how sandbox seed data is defined/reset; the 21a (soon) vs 21b (late, with 17) split.
**Implementation: deferred to `/plan`.**  **Honors:** D16 (isolation — god-mode is the *audited*
exception via `runAsSystem`, not a hole), D14 (audit). Built on Phase 12; 21b pairs with Phase 17.

## Phase 20 — Vineyard operations, equipment & farming cost  ⬜  *(vineyard side of work orders)*
**Goal:** Bring the **issue → execute → log → approve → finalize** work-order lifecycle (the Phase-9
engine) to the **vineyard**, and capture the **farming costs** — labor, equipment/machine hours, fuel,
and consumables — so they roll up **per block** and feed the **fruit cost** that flows into wine cost
(Phase 8 CRUSH) and the fruit **Contracts** follow-on. This is how "what did it cost to grow this
fruit" becomes real.
**Domain requirements (durable):**
- **Vineyard work orders on the shared Phase-9 engine:** manager issues → crew executes → completion
  logs a **vineyard-block activity record** → manager approves → finalizes. Same lifecycle, role split,
  and auto-log-not-rekey principle.
- **Vineyard activities mirror the full append-only ledger (decided):** a block-activity is a
  first-class ledger record with the same discipline as the cellar op ledger — monotonic sequence,
  `observedAt`/`enteredAt`, who/what/capture-method provenance (D14), and **correctable/reversible via
  the plan-024 undo system** (un-approve = reverse). Not a lighter side-log. This is what makes
  block/farming cost auditable the same way wine cost is.
- **Operation taxonomy (seeded, user-extensible — wineries add their own):** spraying, hand/machine
  leafing, hand/machine shoot thinning, hand fruit thinning, hedging, hand/machine suckering, herbicide
  application, mechanized weeding, wire lifting, hand shoot positioning, hand planting, irrigation
  application, fertigation application, fertilizer spreading, mowing, flail mowing, trellis installation
  (end posts / line posts / fruiting wire / catch wires), fence installation, land preparation (deep
  ripping, disking, power tillering), pruning (spur and cane). **Add-your-own types** for any operation.
- **Pay basis on the WO for the foreman** — **piece-rate vs hourly + rates** — from the Phase-11 wage
  settings (display/attach; Phase 11 owns the math).
- **Equipment registry:** tractors, sprayers, quads, trucks, implements. A WO specifies **"this tractor
  + this sprayer + this implement,"** and executing/finalizing the WO **accrues machine-hours per unit**
  (running hour meter per piece of equipment).
- **Fuel tracking (both directions):** (1) **fill-ups** — every time a unit is fueled, record the unit +
  fuel type (diesel/petrol) + volume → per-unit fuel usage + cost; (2) **fuel deliveries** — record
  volume received + cost → an on-site fuel **inventory + weighted-avg cost** that fill-ups draw down.
  (Reuse the Phase-8 `SupplyLot` receive-with-cost + draw-down pattern.)
- **Vineyard consumables:** c-clips, grow tubes, stakes/pencil rods, gloves, pruners, loppers, etc. —
  receive-with-cost + draw-down, same Phase-8 supply pattern, so their cost lands on the block/operation.
- **Reference template:** `docs/spray orders/Spray work order template.xlsx` — a real, good spray WO to
  model the spray operation on. Its fields (fold these in): vineyard, operator, start/finish + start/stop
  times, **spray vol/acre, gear setting, ground speed** (rig calibration), materials + **active
  ingredient + PHI + application method + mixing order + amount per tank**, **blocks included + acres**
  (the cross-block application), **est.# tanks / tanks used / gal used**, tractor. Add **REI + applicator
  license** (the template omits them) for full compliance.
- **Spray & chemical records are regulatory records (decided, in scope):** a spray operation captures
  **product/chemical (EPA reg #), rate, area treated, applicator (+ license), date/time, target pest,
  and weather/wind** — enough to generate **pesticide-use reports (e.g. California PUR)**. Track each
  chemical's **REI (restricted-entry interval)** and **PHI (pre-harvest interval)** so the system can
  **flag a block as under-REI** (don't send crew in) and **block/warn on harvest before PHI elapses** —
  the PHI check ties directly into harvest/CRUSH (Phase 8/vineyard). Chemicals are a costed consumable
  (draw-down + cost as above). This makes compliance a by-product of logging the spray, not extra work.
- **Per-block AND cross-block entry:** report costs/activities **block by block**, but make it one action
  to **apply a work order across many blocks** ("did this to blocks 1–10, all the same") — enter once,
  attribute to each block, no per-block re-keying.
- **Farming cost roll-up:** labor + equipment + fuel + consumables on an operation → **per-block cost**
  → the block's contribution to **fruit cost** at harvest/CRUSH (Phase 8) and reconciled against grower
  **Contracts** (the fruit-sourcing follow-on).
**Exit:** a manager issues a "spray blocks 1–10" WO naming a tractor + sprayer + the chemical; the crew
completes it; machine-hours accrue on that tractor, fuel + chemical + labor cost attribute across all ten
blocks from one entry; the manager approves; each block shows its per-acre spray cost.
**Runbook notes for `/plan`:**
- *Reuse:* the Phase-9 WO engine; Phase-11 labor/pay; the Phase-8 `SupplyLot` cost pattern (fuel +
  consumables); the existing vineyard/block model + map polygons; feeds Phase-8 fruit cost + Contracts.
- *Resolved (2026-07-02):* vineyard activities **mirror the full append-only ledger**; spray/pesticide
  records + PUR-style reporting + REI/PHI enforcement are **in scope**.
- *Still open for `/plan`:* machine-hours from WO duration vs a manual meter reading; per-acre vs
  per-vine vs per-block cost normalization; how far PUR/state-specific report formats go in v1 (CA PUR
  first, others as follow-on); whether the PHI-blocks-harvest check is a hard gate or a warning.
**Implementation: deferred to `/plan`.**  **Honors:** D2/D6 (append-only, correctable), D12
(auto-log-not-rekey), D16 (tenant scoping); built on Phases 9 (engine), 11 (labor), 8 (cost/supply).

## Phase 22 — Production error monitoring & self-healing bug loop  ⬜  *(reliability / dev-velocity; extends the shipped feedback→PR loop)*
**Goal:** Catch runtime errors in production, turn each **distinct** bug into an actionable issue, and
feed it into the **same auto-fix-PR loop we already ship for assistant feedback** — Claude investigates
in a GitHub Action, opens a **path-fenced PR**, CI gates it, a human approves & merges, Vercel redeploys.
This is a **capture layer bolted onto an already-proven self-healing pipeline**, not a new pipeline.
**What we already have (reuse verbatim — do NOT rebuild):** the assistant-feedback loop (PR #5/#6,
2026-06-25) is exactly this pattern: a *source of problems* → a **scheduled + `repository_dispatch`
GitHub Action** (`.github/workflows/assistant-feedback.yml`) → an **agent script**
(`scripts/assistant-feedback-agent.ts`) that investigates read-only, proposes a fix, **gates on
typecheck, and NEVER runs untrusted/model-touched code with secrets in-job** (RCE hardening, commit
a30dd72) → `peter-evans/create-pull-request` → `ci.yml` gates → human merge → Vercel deploy. Phase 22
points that machine at a new source: **captured production errors.**
**Domain requirements (durable):**
- **Capture layer — decision leaning Sentry free tier ($0), roll-your-own as the zero-forever-cost
  fallback (final call is a `/plan` decision).**
  - *Primary (recommended): Sentry free tier* — `@sentry/nextjs`, 5k errors/mo at $0 (a single-winery
    app won't approach it). Earns its place on the two things that are annoying to build well and easy
    to build badly: **grouping/dedup** (500 identical crashes → ONE issue, so the agent fixes a bug not
    500 duplicate reports) and **source-map symbolication** (the agent sees `costRollup.ts:42`, not
    minified `a.b.c`). Trigger: a Sentry **alert → webhook → `repository_dispatch`** into the fix
    workflow (mirrors how the app fires `assistant_feedback`), plus the same scheduled sweep fallback.
    Tradeoff to accept explicitly: multi-tenant error data (possibly PII in breadcrumbs) transits a
    third party — **scrub PII via Sentry `beforeSend`/data-scrubbing before this ships.**
  - *Fallback: roll-your-own `ErrorEvent` table in Neon* — $0 forever, no vendor, **nothing leaves the
    Neon/RLS tenant boundary** (fits Phase-12 isolation exactly). Next.js `instrumentation.ts`
    `onRequestError` (server) + a client React error boundary → `POST` → tenant-scoped `ErrorEvent`
    table (Phase-12 checklist: RLS, `tenantId`, index). The agent reads NEW errors just like it reads
    NEW feedback. Cost of this path: you build **grouping/dedup + a fingerprint** yourself (else the
    agent re-fixes the same crash every sweep). If chosen, follow the Phase-12 new-table checklist.
  - *If Sentry free is ever outgrown:* **GlitchTip/Bugsink** are Sentry-SDK-compatible and self-hostable
    (~$5–15/mo) — same webhook, no agent change. Note it as the escape hatch, don't build it in v1.
- **Fix-agent scope & safety (extend, don't weaken, the existing hardening):** a **separate agent
  script** (e.g. `scripts/error-fix-agent.ts`) or a generalized shared core — reads ONE distinct NEW
  error (by fingerprint), investigates read-only, proposes a **minimal path-fenced fix**, **gates on
  typecheck**, refuses to run eslint/vitest/app code in the secrets-holding job (defer to PR CI),
  modify-existing-files-only + realpath fence. **The write-allowlist must widen** beyond
  `src/lib/assistant/**` (real bugs live app-wide) — but keep it a **deny-by-default fence** that
  **never** touches `.env`, `prisma/schema.prisma`, migrations, CI workflows, auth/authz, tenant
  scoping (`src/lib/tenant/**`), or the confirm-before-write path. Widening the fence is the main new
  risk surface — treat the allowlist as the security-critical artifact of this phase.
- **Dedup / don't-refile:** one open PR (or one triaged issue) per error fingerprint; mark the error
  `TRIAGED` with the PR URL on open (mirrors `assistant-feedback-mark.ts`). No fingerprint churn loops.
- **Human gate is non-negotiable (D-safety):** the loop **never commits to `main`** and never
  auto-merges. It opens a PR labelled (e.g. `auto-fix`); the human runs **`/merge-check`** before
  merging. Vercel redeploys on merge — no separate deploy step (matches `ci.yml`: CI gates, Vercel
  builds+migrates on merge).
- **Manual + user-reported bugs, same rail:** a lightweight in-app "report a bug" affordance (or a
  `workflow_dispatch` with an error/issue id) feeds the **same** agent, so both auto-captured crashes
  and human bug reports converge on one self-healing pipeline.
**Exit:** a real runtime error occurs in production; it surfaces as a single grouped issue; the fix
workflow fires (webhook or sweep), Claude opens a path-fenced PR with a root-cause summary + the
symbolicated stack it fixed; CI passes; the founder runs `/merge-check`, approves, merges; Vercel
redeploys with the fix — and the same issue does not re-file.
**Runbook notes for `/plan`:**
- *Reuse:* `assistant-feedback.yml` (workflow shape: dispatch + schedule + concurrency + PR-create +
  mark-triaged), `assistant-feedback-agent.ts` (agent loop, read-only tools, typecheck gate, fence,
  no-untrusted-exec), `assistant-feedback-mark.ts`, `ci.yml` (PR gate), the `GH_PAT`/"Actions may
  create PRs" repo config already set, and the Phase-12 new-table checklist if the Neon path is chosen.
- *Still open for `/plan`:* **(1) the capture-layer decision** (Sentry-free vs roll-your-own Neon — the
  one real fork; privacy vs zero-forever-cost vs build-effort); (2) how wide the write-allowlist opens
  and its exact denylist; (3) PII scrubbing config if Sentry; (4) whether to generalize one shared
  agent core over both feedback + errors or keep two scripts; (5) severity threshold that auto-triggers
  a fix attempt vs just files an issue (don't fire the agent on every transient 500).
**Implementation: deferred to `/plan`.**  **Honors:** the human-gate + no-untrusted-exec safety model
of the shipped feedback loop; D16 (tenant scoping — errors are tenant-scoped if the Neon path);
Phase-12 RLS checklist (Neon path only). **Built on:** the assistant-feedback→PR loop (shipped) + `ci.yml`.

## Phase 23 — Granular RBAC, roles & user types  ⬜  *(authorization foundation; prerequisite for the client portal)*
**Goal:** Evolve Phase-5's tenant-level RBAC into a **fine-grained, typed permission system** — distinct
**user types** (facility staff by role, custom-crush/AP **client users**, read-only auditors/bookkeepers,
the founder platform-admin) with **capability-level AND data-scope permissions** — so we can safely expose
an **owner-scoped client portal** (Phase 24) and give facility managers real control over who can see and
do what. This is the security-critical layer the client portal rests on: **an intra-tenant leak (one client
seeing another client's wine) is as damaging as a cross-tenant leak**, so it gets the same DB-enforced,
fail-closed discipline as tenant RLS.

**Domain requirements (durable):**
- **Typed roles + a capability matrix (not a single admin/member flag):** permissions over
  **capability** (view / draft / execute / approve / finalize / configure / bill) × **domain area**
  (lots, ops, chemistry, cost, compliance, work orders, inventory, settings, billing). **Cloneable
  per-tenant role templates** on a governed vocabulary (same clone-on-customize philosophy as the
  Phase-9 work-order templates); roles are **versioned**.
- **Data-scope permissions (owner / vineyard scoping):** a role can be scoped to a subset of lots by
  **Owner** (custom-crush client / AP proprietor) and/or by vineyard membership (extends the Phase-5
  many-to-many). **Owner-scoping is enforced in the query/RLS layer, not the UI** — a fail-closed owner
  predicate on every owner-scoped read (D14/D16 spirit, extended *intra*-tenant).
- **Client user type (external, read-mostly):** a limited external user that logs into the facility's
  tenant but sees only their Owner's records; cannot see other owners, cannot configure, cannot create
  work orders. The Phase-24 portal is a view over exactly this scope.
- **Auditability:** every permission grant/change is on the audit log (D14); god-mode (Phase 21a) stays
  the **audited** platform-admin exception, never a silent cross-scope read path.

**Exit:** a facility admin defines a "Cellar tech" role (execute ops, no cost/billing), a "Client
(read-only)" role scoped to one Owner, and a "Bookkeeper" role (cost + billing, no cellar ops); each user
sees exactly their capabilities and data scope, enforced at the DB layer (a scoped user cannot query
outside their scope even via a crafted request).

**Implementation: deferred to `/plan` — gets the full review gate** (`/council` + `/plan-eng-review`)
given the intra-tenant-leak blast radius. Decisions to resolve then: permission model (RBAC capability
matrix vs ABAC/policy engine); how owner-scope composes with tenant RLS (a second predicate vs a policy
using a per-session owner set); role-template design + versioning; how it reconciles with the better-auth
org/member layer. **Honors:** D9 (RBAC), D14 (DB-enforced + audited), D16 (isolation discipline extended
intra-tenant), D21.

---

## Phase 24 — Custom crush, alternating proprietorship & client portal  ⬜  *(competitive parity + differentiator — event-driven pull-forward)*
**Goal:** Support **custom-crush facilities** and **alternating-proprietorship (AP)** operations
end-to-end: wine is **owned by clients/proprietors** (not the facility), the facility **bills clients from
completed work orders at contracted rates**, and each client logs into a **scoped portal to see their own
wine records, inventory, cost, compliance and invoices** — **read-only; clients do not create work
orders.** Both incumbents already have client billing + a client-view portal, so this is **parity we must
reach to sell to custom-crush facilities**, with a real differentiator seam (both incumbents' client
access is view-only — our multi-tenancy + WO engine let us later offer owner-scoped *participation*).

**Domain requirements (durable):**
- **Owner/proprietor as a first-class entity** (upgrades the Phase-8 lot `ownership` tag into a real
  **Owner** record: name, contact, portal users, contracted rate card, accounting mapping). A lot's Owner
  drives cost treatment (client-owned fruit/wine is **not** the facility's inventory asset — Phase 8
  already routes client supply draw-downs to a **billable-expense ledger**) and portal scope (Phase 23).
- **Contracted rate cards in Settings:** per-Owner (or default) **service rates** — storage/barrel-per-
  month, bench trials, bottling per case, lab work, additions/markup, labor — the basis for billing.
  Rates are **effective-dated + versioned**; an issued invoice records the rate version it used (later
  edits never rewrite billed history — same discipline as cost-policy versioning).
- **Client billing from work orders (the core):** a completed/approved **work order (Phase 9)** × the
  Owner's **rate card** → **billable line items** → a **client invoice** (create / preview / send /
  reverse / credit), summing services + billable-expense draw-downs. Invoices **sync two-way to
  QuickBooks/Xero (Phase 15)** — beating Vintrace's one-way client-billing-to-Xero. **Installments /
  deposits** supported (Vintrace parity).
- **Client portal (scoped, read-only):** an Owner's portal user logs in and sees — **only their Owner's**
  — lots + timelines, current inventory + volumes, chemistry/analysis, cost/COGS, **their TTB/compliance
  position**, and **their invoices** (view/download/payment status). Enforced by Phase-23 owner-scoping at
  the DB layer. **No work-order creation** in v1; a client "request" affordance is a possible later seam.
- **Custom crush vs AP are DIFFERENT models — we support BOTH, one mechanism each (confirmed 2026-07):**
  - **Custom crush → owner-within-tenant:** the *facility* is the bonded winery / TTB permit holder and
    **files the TTB reports**; clients own wine as inventory and are billed for services. A client is an
    **Owner inside the facility tenant** with a **read-only, owner-scoped** portal — **Phase-23
    owner-scoping is the machinery.** Compliance is the facility's.
  - **Alternating proprietorship (AP02) → tenant-per-proprietor:** each proprietor is a **separate bonded
    winery** alternating use of the premises and **files its OWN TTB reports on its own bond**, so an AP
    proprietor = **its own tenant** (Phase 12/14). The proprietor is an operator working inside the
    facility on their **own** wines: **full admin of their own lots/wines, zero access to any other
    proprietor's** — which **Phase-12 RLS already enforces** (AP needs little of Phase-23's owner-scoping;
    that's the custom-crush mechanism). The **facility host** operates/oversees across proprietors via
    **audited god-mode (Phase 21a)**.
  - **The one genuinely hard, unresolved AP decision:** the premises — **vessels, rooms, equipment — are
    physically shared**, but wine/lots/compliance are per-proprietor tenant. How do legally-separate
    tenants share a physical Tank 5 without a cross-tenant read? (A facility/premises layer *above* the
    tenants? Per-tenant vessel copies + a facility occupancy view? god-mode reconciliation of who's in
    which vessel now?) This is the **crux of AP** — resolve in `/plan` before building.

**Exit:** a custom-crush facility sets a client's rate card, issues + completes a "rack + add SO₂" work
order on that client's lots, generates an invoice summing the service rates + the SO₂ draw-down, sends it,
and syncs it to QuickBooks; the client logs into their portal and sees only their own lots, inventory,
cost, compliance status, and that invoice — and cannot see any other client. Separately, an AP proprietor's
wine files under its own TTB report.

**Implementation: deferred to `/plan`.** Built on Phase 9 (work orders → billing), 8 (ownership tag +
billable-expense seam + rates), 15 (invoice sync), **23 (owner-scoped RBAC/portal — must land first)**, 14
(per-owner/proprietor compliance), 21a (multi-org for AP). Decisions: the custom-crush-vs-AP tenancy model
(above); invoice data model + numbering + credit/reverse; rate-card schema + versioning; portal as a scoped
view of the main app vs a distinct surface; whether an AP proprietor is a tenant. **Honors:** D9, D14, D16
(isolation extended to owner scope), **D21** (wine ownership is first-class), + Phases 8/9/14/15/21a.

---

## AI-native differentiation layer (Phases 25–27) — "the ledger writes itself"

> Added 2026-07-02 from `ai-native-winery-erp-strategy.md` §4. The production spine (1–8) and the
> compliance/accounting ERP layer (13–16) are **table stakes + fast-followable**; these three phases
> are the strategy's actual defensibility thesis — *invert the data-entry relationship so the system
> captures reality and the human approves.* They are **additive to the append-only ledger**, not a
> new data model, and all obey D10 (AI proposes, human commits). Sequencing: they ride the assistant
> infra (Phase 10) and rich data (8/14/20); **Phase 25 (ambient capture) is a wedge that can
> pull-forward** once the core capture surfaces exist.

## Phase 25 — Ambient capture (vision/OCR → proposed ledger entries)  ⬜  *(differentiator — the "kills the binder" wedge)*
**Goal:** Make the cellar the input device. A photo or forwarded email of a physical artifact becomes a
**proposed** ledger entry with the source document attached as evidence, queued for one-tap approval —
never a direct write (**D22**, extends the D10 propose→approve pattern to the vision modality).
**Domain requirements (durable):**
- **Capture → proposal, always evidence-backed:** photograph a **weigh tag → fruit-receipt proposal**;
  a **lab whiteboard / spectrophotometer readout → analysis-reading proposal**; an **additive/dry-goods
  invoice → supply-receipt proposal with lot numbers + cost** (feeds Phase 8); a **bottling BOL email →
  case-goods proposal**; **chalk marks / a dip reading on a tank → volume-update proposal**. Every
  proposal stores the **image/document as the attached source** (the photo IS the TTB/FDA source record).
- **Human-in-the-loop by construction:** the extraction populates a **diff against current state** for
  review/edit/approve; low-risk observations may use the D10 undo-toast path, lineage-mutating captures
  route to UI confirmation. A model misread can never reach the ledger unapproved.
- **Confidence + provenance:** each extracted field carries a confidence; `captureMethod = vision` +
  observed/entered provenance (D14). Ambiguities are flagged for winemaker confirmation, not guessed.
- **Reuse the existing image pipeline** (Vercel Blob + client downscale from the field-notes surface) and
  the Phase-8 receive-with-cost + draw-down models as the write targets.
**Exit:** photograph a weigh tag and a supplier invoice; each produces an editable, evidence-attached
proposed receipt; approving it writes the correct ledger op with the image retained as source.
**Implementation: deferred to `/plan`.** Decisions to resolve then: vision model + structured-extraction
approach; per-artifact schema + confidence thresholds; email-ingestion channel; how proposals queue and
expire. **Honors:** D10, D22, D14, D16; **gated by the D26/H8 eval harness** (weigh-tag OCR is an eval target).

## Phase 26 — Scenario sandbox & goal-seeking blend solver  ⬜  *(differentiator — the oversupply-era question)*
**Goal:** Fork cellar state to plan blend/rack/bottling programs safely, see their consequences, then
**promote a plan to real work orders** — and layer a **goal-seeking blend solver** on top. Nothing
touches production until explicitly promoted (**D23**).
**Domain requirements (durable):**
- **Fork-and-simulate:** fork the current ledger projection into a scratch scenario; model a sequence of
  blends/rackings/bottlings and see the resulting **composition (fractional parentage), tax-class
  movement (Phase 14), COGS/case (Phase 8), and vessel utilization** — without writing to the real ledger.
  This is exactly what the append-only ledger makes cheap and a mutable-CRUD model cannot.
- **Promote to reality:** a scenario becomes a set of **proposed operations / a work order** (Phase 9)
  the winemaker commits; the simulation never mutated production.
- **Goal-seeking solver:** *"Build a ~$18-COGS GSM around the 2024 Grenache, keep it under 15% ABV, use
  the distressed Mourvèdre first, minimize barrel count freed before harvest."* The solver **proposes
  candidate blends from real inventory** with full constraint accounting (composition, ABV/tax class,
  cost, volume available). Output is a **proposal** (D10), never an auto-write.
- **This is what answers "blend it, bottle it, sell it bulk, or declassify it"** quantitatively — the
  strategic question of an oversupply market, which no incumbent tool answers.
- **Relation to bench trials (Phase 5):** bench trials are lab-scale tasting trials on one bench; this is
  full cellar-state simulation with cost/compliance/utilization math. Reuse the trial-promotion pattern.
**Exit:** fork the cellar, simulate a 3-lot blend + a racking program, see the child composition + tax
class + COGS/case + freed vessels, then promote it to a work order; separately, ask the solver for a
constrained blend and get ranked candidate recipes from actual inventory.
**Implementation: deferred to `/plan`.** Decisions to resolve then: how a scenario forks the projection
(copy-on-write scratch vs replay); solver approach (constraint/LP vs guided search); how promotion emits
work orders; scenario persistence/sharing. **Honors:** D2 (ledger is the substrate), D10, D23; reuses
Phase 8 cost + Phase 14 tax-class + Phase 9 work orders.

## Phase 27 — Institutional memory (longitudinal retrieval + reasoning)  ⬜  *(the retention moat — worthless year 1, priceless year 5)*
**Goal:** Let the winery ask questions of its **own accumulated history** and get cited, reasoned answers —
turning years of ledger + analyses + notes + outcomes into an unremovable knowledge asset. **Read-only,
cited, tenant-scoped, never a write path** (**D24**).
**Domain requirements (durable):**
- **Retrieval + reasoning over the tenant's OWN longitudinal data:** "How did we handle the stuck ferment
  on this block in 2022?" · "Show me every vintage where we picked this block above 25 Brix and the
  resulting TA adjustments." · "Draft the harvest plan for Block 7 from the last four vintages, adjusted
  for this year's maturity curve." Answers **cite the underlying records** (ops, readings, notes).
- **Strictly read-only + tenant-scoped:** obeys D16 isolation and the D10 no-AI-writes guardrail; it never
  proposes a write here (that stays the assistant's job under its risk gates). Cross-tenant retrieval is
  impossible by construction (RLS + tenant-scoped index).
- **Rides the Phase-10 assistant infra** (tool-use loop + read layer) and the accumulated data from
  8/14/20 — it is a retrieval/reasoning capability, not a new capture surface.
**Exit:** ask a longitudinal question spanning multiple past vintages and get a correct, **cited** answer
drawn only from this tenant's records; a comparable question from another tenant cannot surface this
tenant's data.
**Implementation: deferred to `/plan`.** Decisions to resolve then: retrieval architecture (embeddings +
tenant-scoped vector index vs structured query synthesis vs hybrid); citation/grounding model; freshness/
indexing cadence; how it composes with the Phase-10 read tools. **Honors:** D10, D16, D24; built on Phase 10.

---

## Delivery & integration table stakes (Phases 28–30) — the price of admission we hadn't slotted

> Added 2026-07-02 from `ai-native-winery-erp-strategy.md` §2/§5. These are **mandatory, not
> differentiating** — a winemaker disqualifies you in the first demo if they're missing — but they were
> only implied (cross-cutting notes / footnotes) in earlier revisions. Promoted to real phases so they
> get a `/plan` and an owner.

## Phase 28 — Offline-first mobile & sync  ⬜  *(table stakes — non-negotiable, hard engineering)*
> **🚩 Named trigger (not "as field use scales"): the real sync layer is a HARD PREREQUISITE of any design
> partner's first harvest.** "Land it as it scales" means it lands after someone gets burned — and Phase
> 9's whole promise (crew executes on the floor, logging as a side effect) collapses the first time a
> cellar dead zone eats a completed checklist during a partner's live vintage. The Phase-6 outbox carries
> *dev* usage until then; this phase must ship before a partner runs a harvest on the system.
**Goal:** Floor and vineyard capture that **works at zero connectivity** and reconciles cleanly — the
real sync layer, not the Phase-6 best-effort outbox. Cellars are Faraday cages, vineyards are dead zones,
and ~60% of the year's data is created in an 8-week harvest, often at 2 a.m. (**D25**).
**Domain requirements (durable):**
- **Zero-connectivity capture** for every heavy floor/field surface (Round grid, crush-pad, additions,
  work-order execution, timeclock punches) — a Brix reading or a clock-in **must never fail** for lack
  of signal.
- **Operation-log / CRDT sync with deterministic conflict resolution** — not last-write-wins; queued ops
  reconcile against the SERIALIZABLE ledger with the same idempotency (`commandId`) discipline already
  used, plus a defined merge policy for concurrent edits and a visible sync/exception state.
- **iOS AND Android** capture. Decide the delivery vehicle: hardened PWA vs native/Capacitor wrapper vs
  App-Clip path (also unblocks the Phase-11 Web-NFC-on-iOS gap).
- **Builds on** the Phase-6 Dexie outbox (`commandId`, duplicate-as-success) — this phase adds the
  conflict-resolution + full-mirror + cross-surface sync the outbox deliberately deferred.
**Exit:** capture a full Round, an addition, and a work-order completion with the device in airplane mode;
reconnect; everything syncs with correct provenance, duplicates collapse, and a genuine concurrent-edit
conflict resolves deterministically with a visible record — no lost or double-counted ops.
**Implementation: deferred to `/plan`.** Decisions to resolve then: CRDT vs op-log-with-merge; the
conflict-resolution policy per op family; PWA vs native shell (iOS constraints); how offline writes carry
tenant context (D17) and pass RLS on sync. **Honors:** D14 (SERIALIZABLE + provenance), D17 (tenant on
sync), D25; built on Phase 6.

## Phase 29 — Sensor & telemetry integration (TankNET-class)  ⬜  *(table stakes — fermentation monitoring)*
**Goal:** Ingest tank/cellar hardware telemetry (TankNET, VinWizard-class) as **auto-logged low-risk
observations** (temp, and where available Brix/density) under the D10 sensor gate — closing the
fermentation-monitoring table stake.
**Domain requirements (durable):**
- **Sensor readings as low-risk auto-logged observations (D10):** streamed temp/density map to the same
  analysis/ferment readings a human would enter, with `captureMethod = sensor` provenance (D14) and the
  ~5s undo affordance; they **never** write lineage-mutating ops.
- **Event-driven inbound integration (D20):** an adapter maps each hardware vendor's feed to our reading
  model; reuse the one tool-contract registry so a sensor reading is the same typed observation as a
  manual or voice one.
- **Feeds** the ferment curve (Phase 6), the floor-plan live overlay (Phase 18), and anomaly checks.
**Exit:** a tank probe's temperature stream appears on that lot's ferment curve automatically, tagged
sensor-sourced, without a human keying it — and cannot silently alter volumes or lineage.
**Implementation: deferred to `/plan`.** Decisions to resolve then: which vendor feed(s) first; push vs
poll ingestion; dedup/rate-limiting; mapping sensor identity → vessel/lot. **Honors:** D10 (sensor gate),
D14, D20 (event-driven + one registry); see `docs/api-strategy.md` (hardware integration row).

## Phase 30 — Harvest operations depth  ⬜  *(table stakes — the 8-week stress test)*
> **Dip-chart gauging split OUT (2026-07) into an early self-contained pull-forward slice** — it's small,
> a US evaluator asks about it in the first demo, and it need not wait for the harvest-planning work. It's
> the **capture-convenience** side of volume accuracy; the actual reconciliation-*drift* killer is
> book-vs-physical reconciliation (already in Phase 14, A9/A30/B19), not the dip chart itself. Its detail
> stays documented below as the **Dip-chart slice**; the rest of Phase 30 is the harvest-planning depth.
**Goal:** Round out harvest — the period when 60% of the year's data is created — with the planning +
measurement pieces the ledger doesn't yet carry: **maturity sampling & trend tracking, pick scheduling,
and crush-pad capacity planning.** (Weigh-tag intake capture is Phase 25; grower contracts are the
Contracts follow-on; crush/press yield is Phase 6; **dip-chart gauging is the pull-forward slice below**.)
**Domain requirements (durable):**
- **Maturity sampling & trend tracking:** pre-harvest Brix/pH/TA samples per block over time (reuse the
  vineyard Brix charting + Phase-4 analysis model) → a **ripeness curve** that informs pick timing.
- **Pick scheduling:** plan which blocks pick when, against maturity + crush-pad capacity + labor
  (Phase 11) + equipment (Phase 20); surface a harvest calendar.
- **Crush-pad capacity planning:** model daily intake capacity (tonnage, press/tank availability) so the
  pick schedule doesn't overrun the pad — the harvest bottleneck.
- **Dip-chart slice (pull-forward, self-contained):** per-vessel dip chart so a **dip/height reading
  yields a volume** (a first-class capture path, incl. the Phase-25 photo-a-dip proposal); improves
  volume-entry accuracy (a known incumbent sore spot). Just a per-vessel calibration table + a capture
  path — pull it forward like the sandbox-tenant slice when a demo needs it, ahead of the rest of Phase 30.
**Exit:** track a block's ripeness curve, schedule its pick against crush-pad capacity; **(dip-chart
slice)** read a tank's volume from a dip measurement via its dip chart.
**Implementation: deferred to `/plan`.** Decisions to resolve then: dip-chart data model (per-vessel
calibration table vs geometry formula); how pick scheduling composes with Phase-20 vineyard WOs and
Phase-11 labor; capacity-planning granularity. **Honors:** D8 (measured volumes), D12 (vessel-first),
D14, D16; reuses Phase 4 analysis + Phase 6 crush/press + the vineyard block/map model.

---

## Universal timeline undo (the "correction wedge")  ✅ shipped
`docs/plans/2026-07-01-024-feat-universal-timeline-undo-plan.md` — 024a + 024b shipped + verified
(`verify:reverse` 31, `verify:reverse-transform` 37). Tenant-aware.
One `reverseOperationCore` + one timeline Undo affordance for every op. **This is the direct
answer to the #1 recurring complaint about *both* incumbents** ("can't cleanly fix a mistake" —
competitive analysis, Theme 2). Our append-only ledger makes every correction a first-class,
auditable event — an advantage mutable-row incumbents can't match. Lead with it.

---

## Dependency notes
- Phase 1 is a hard prerequisite for everything.
- **Multi-tenancy (Phase 12) is a foundation, not a finale:** land the isolation-boundary
  slice **before onboarding design-partner winery #2**, ahead of its list position. Only
  the SaaS operational layer (signup / billing / per-tenant branding) is genuinely late.
  Every feature phase built before it lands pays a small `tenantId`-threading tax; every
  phase built after a late retrofit pays a much larger one.
- Phase 5 (blends) must not ship before its RBAC redesign (D9).
- Phase 7 (sparkling) depends on the operation vocabulary (Phase 0/D4) and bottling.
- Cost (Phase 8) depends on a complete operation ledger (Phases 1, 3, 5).
- **Build order:** see the authoritative **"Execution sequence"** section at the top of this file —
  it overrides phase numbers. In short: 14 Compliance (v1 shipped) + 8 Cost → 15 Accounting is the
  sellable core that lands a design partner; then operational depth (9 → 11 → 20 → 18); then the
  intelligence/presentation layer (10 → 19); then channel + commercialization (16, 17). **13 Migration**
  is an event-driven interrupt (gated on a real Vintrace/InnoVint export from a design partner), not a
  fixed slot. TTB is buildable on synthetic US data but validated only with a US design partner (Bhutan
  doesn't file TTB). See `analysis/incumbent-teardown/SYNTHESIS.md`.
- Phase 11 (labor) has an **independent core** and does not block 7/8; it pays off most
  after Phase 9 (clock against work-order tasks) and feeds Phase 8 (labor cost per lot).
- **Phase 24 (custom crush / AP / client portal)** depends on **Phase 23 (granular owner-scoped RBAC),
  which must land first**, plus Phase 9 (work orders → billing), 8 (ownership tag + rate cards +
  billable-expense seam), and 15 (two-way invoice sync); AP's per-proprietor TTB filing leans on Phase 14
  + 21a (multi-org). It is an **event-driven pull-forward** — advance 23→24 ahead of its list position the
  moment a custom-crush/AP design partner signs, since it unlocks a whole facility segment.

## Cross-cutting architecture & hardening requirements (with build order)
> Added 2026-07 after a cross-LLM + market-research pass (deep-research + incumbent-API analysis).
> These are the non-negotiable engineering invariants behind a **best-in-class AI-native ERP** — the
> failure modes that per-phase `/plan`s structurally miss because they're cross-cutting. Each honors a
> new locked decision (**D17–D20**, VISION §11) and names **WHEN** it must land. Full detail:
> `docs/api-strategy.md` + `docs/architecture/{scale,security}-register.md`. **The "Build WHEN" column
> IS the authoritative ordering** for this hardening work; it interleaves with the feature phases above.

| # | Requirement | Honors | Build WHEN | Status |
|---|-------------|--------|------------|--------|
| **H1** | **Pooled-RLS leak proof** — tenant id set via `SET LOCAL app.tenant_id` *inside* the txn; the isolation suite runs through the **Neon pooler (transaction mode)**, not just direct Postgres | D17 | **NOW** — one-day audit; catastrophic if wrong; must hold before winery #2 | 🟡 wired — CI runs the suite through a transaction-mode PgBouncer (`pool_size=1`, no reset query) + a SET-LOCAL no-bleed test; 🟢 on first green run |
| **H2** | **SERIALIZABLE bounded-retry layer** — every ledger write retries on SQLSTATE `40001` with backoff + a cap; serialization conflicts are logged/observable | D18 | **NOW / with every new write path** — the chokepoint exists; the retry half is the gap | 🟢 done — one shared `withWriteRetry` (`src/lib/db/write-retry.ts`): P2034, full-jitter backoff, cap 5, per-domain logging; consolidated across ledger/stock/bottling |
| **H3** | **Cost + analytics OFF the write path** — DAG cost-roll-up and heavy reads run on a read replica or deferrable read-only snapshot; benchmark at realistic lineage depth | D18 | **With Phase 8 cost** (as lineage deepens; scale-register already 🟡 on this) | ⬜ |
| **H4** | **Event-store evolution kit** — versioned/upcastable events + projection snapshots + throttled, blue-green projection rebuilds | D18 | **Before scale / before the first breaking event-schema change** — cheapest while single-tenant | ⬜ |
| **H5** | **Crypto-shredding + PII-out-of-events** — personal data in a mutable store referenced by id; erasure = drop the key | D19 | **User-account PII: design in NOW. DTC-customer PII: before Phase 16** | ⬜ |
| **H6** | **One tool-contract registry** — UI actions, assistant tools, MCP tools, dashboard metric catalog are all projections of one typed registry with risk-gating baked in | D20 | **Establish before Phase 10 (MCP) & 19 (AI dashboards); refactor assistant tools toward it opportunistically now** | ⬜ |
| **H7** | **Event-driven outbound integrations + open public/partner API + webhooks** | D20 | **Tier-1 adapters per their phases (15/16/…); the public API + webhooks land with Phase 10/MCP** | ⬜ |
| **H8** | **Eval harness for the probabilistic shell** — golden datasets + regression evals gating NL/voice work-order parsing, document/weigh-tag OCR (Phase 25), and blend-solving (Phase 26) before they're customer-facing; CI runs them and blocks on regression | D26 | **Do-now / with the first AI-native write surface** — cheap to seed early, and domain-correct cellar-language eval data is itself a moat | 🟡 seeded — `test/evals/` golden set over the shipped assistant write tools; structural eval (drift-proof vs the real registry + coverage guard) runs in CI; gated LLM eval via `npm run eval:assistant`. Grows with each new AI surface |

**Sequencing summary (do-now → later):** H1 + H2 are **immediate** (cheap, and both guard catastrophic
correctness/leak failures before a second tenant exists). H4 + H6 are **"do while single-tenant"** —
they cost 10× more once there are many tenants and live event streams. H3 rides **Phase 8**, H5 rides
**Phase 16** (with user-PII designed in now), and H7 rides the **Phase 10/MCP + integration phases**.
**H8 (eval harness) is do-now** — seed it with the first AI-native write surface (NL/voice WO or Phase-25
ambient capture); the golden cellar-language datasets are cheap to start and expensive for anyone without
wine fluency to replicate.
None of this reorders the feature phases; it interleaves the load-bearing invariants so we don't ship a
feature onto a foundation that can't carry it. See `docs/api-strategy.md` for the API/MCP/integration
architecture these depend on.

---

## Cross-cutting capture requirements (apply to every phase that captures data)
These came out of the design review and hold across phases — honor them whenever a
capture surface is built, don't relitigate per phase:
- **Vessel-first capture, lot timeline for review (D12).** Default cellar staff into the
  physical (vessel/round/group) surface; the lot timeline is one tap away.
- **One-tap ad-hoc actions** on every vessel/lot; never require creating a work order
  first. Work-order completion creates a **prefilled-actuals** record, not a blind log.
- **Capture provenance on every op** (D14): monotonic sequence, `observedAt` vs
  `enteredAt`, who observed/entered, capture method (manual/voice/sensor).
- **Exceptions are first-class** ("couldn't complete / vessel empty / wrong barrel /
  volume lower than expected").
- **Offline / degraded mode** — cellars have poor wifi; capture must tolerate it
  (queue-and-sync). Decide the approach when the first heavy floor surface ships (Phase 6).
- **Sticky context** — don't re-select block/vessel for every entry in a sequence.
