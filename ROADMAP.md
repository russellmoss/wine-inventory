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
   the *next* phase's detail.
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

**In progress:** **8 Supplies & cost roll-up** (8a cost spine underway → then 8b advanced).

**Do now (near-term hygiene, decoupled):** seed a **sandbox "Demo Winery" tenant** (a short script —
Phase-12 tenancy is already live) and move all dev/QA there so testing stops polluting the real Bhutan
Wine Co. tenant. This is the pull-forward slice of **Phase 21a**.

**Then — the sellable core (this is what lands a US design partner):**
1. **Finish 8** (8a → 8b) — true cost-per-bottle.
2. **15 Accounting** (QuickBooks/Xero) — needs 8's cost output; beats both incumbents.
   - ↳ **13 Migration** is an **event-driven interrupt**, not a slot: build it the moment a design
     partner hands over a real Vintrace/InnoVint export. It jumps the queue when unblocked.
   - ↳ **Contracts follow-on** (fruit sourcing, per-acre/per-ton) slots right after 8 — feeds fruit cost.

**Then — operational depth (retention; closes the dirt-to-bottle cost loop):**
3. **9 Work orders** — the shared issue→execute→auto-log→approve→finalize engine for cellar **and** vineyard.
4. **11 Labor, timeclock & payroll** — after 9 (clock against tasks); feeds 8 cost + 20 pay.
5. **20 Vineyard ops, equipment & farming cost** — after 9/11/8; adds state spray/PUR compliance.
6. **18 Visual cellar floor plan** — spatial front-end to capture; differentiator/delight. *(adjustable — self-contained, could move earlier as a demo win.)*
   - ↳ **21a Founder god-mode + sandbox tenants** — small (built on shipped Phase-12); pull in **soon** after the do-now sandbox seed, whenever you want to enter/support any winery + run clean demos.

**Then — intelligence & presentation layer:**
7. **10 Assistant coverage & MCP** — most valuable once there are many surfaces to read/act on.
8. **19 AI-native dashboards** — rides the Phase-10 assistant infra; needs rich data (8/14/20). *(19a deterministic → 19b AI builder.)*

**Then — channel & commercialization (trigger-based, late):**
9. **16 DTC & sales integration** (Commerce7/WineDirect).
10. **17 SaaS billing** (Stripe) + **21b self-serve signup / onboarding / per-tenant branding** — the SaaS operational layer, built together when ready to sell self-serve; hand-create tenants via god-mode until then.

**Floating / event-driven (no fixed slot):** 13 (design-partner export) · 17 (ready to charge) ·
14's state/DTC compliance sub-phase · the Contracts follow-on. Pull each in when its trigger fires.

---

## Phase 0 — Decision lock-in & guardrails  ⬜
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
> legacy recode. (Unplanned bonus; lives in `src/lib/lot/{code,generate}.ts`.)
**Goal:** The CRM-style timeline view over the ledger, plus the two-views linkage.
- Per-lot timeline (reverse-chronological feed of operations) + current-state header
  derived from the projection.
- Cellar floor view ↔ lot view cross-linking.
**Exit:** open any lot, read its life from the ledger; click a vessel → its lot(s).
**Honors:** D2 (timeline = ledger projection).

---

## Phase 3 — Cellar operations beyond racking  ⬜
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

## Phase 4 — Chemistry & tasting records  ⬜
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

## Phase 5 — Blends, lineage tree & RBAC redesign  ⬜
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

## Phase 6 — State transforms & fermentation logging  ⬜
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

## Phase 7 — Bottle-as-continuable-container & sparkling  ⬜
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

## Phase 8 — Supplies inventory & cost roll-up  ⬜
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

## Phase 9 — Work orders  ⬜
**Goal:** A full **issue → execute → auto-log → approve → finalize** work-order lifecycle so
**completing a task auto-creates the ledger operation** — logging is a side effect of doing the job,
and the manager never re-keys what the crew already did. **One shared work-order engine serves both the
cellar (this phase) and the vineyard (Phase 20).**

**Domain requirements (durable):**
- **Lifecycle with a manager/worker role split** (ties to the Phase-5 RBAC): a **manager/foreman
  issues** a work order (tasks + instructions + assignees + due dates); the **worker executes** it on
  a floor-first checklist; **marking a task done writes the corresponding ledger operation(s)** —
  every addition, rack, movement, filtration, etc. on the affected lots — as **prefilled actuals**;
  the **manager then reviews and approves** ("yep, they did it") which **finalizes** the ops. Until
  approval, completed ops are in a `pending-approval` state (visible, correctable, reversible).
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

**Exit:** a manager issues a WO to rack two tanks; a crew member checks it off; the racks appear as
**pending-approval** ledger ops with correct provenance; the manager approves and they finalize — the
manager typed none of the rack details.

**Implementation: deferred to `/plan`.** Decisions to resolve then: is a work order a separate planning
entity, or are operations given a `planned → executed → approved` state? how does approval interact with
the plan-024 reversal system (un-approve = reverse)? how do templates instantiate? offline/poor-signal
behavior on the floor.
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

## Phase 12 — Multi-tenancy & SaaS foundation  ⬜
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

## Competitive / GTM layer (Phases 13–16) — the "wine ERP", not just production

> These four phases turn the production system into a **fundable wine-industry ERP**, driven by
> the competitive + go-to-market analysis in `docs/STRATEGY.md` and
> `docs/competitive-analysis-vintrace-innovint.md`. **Build-order priority overrides phase
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
**Goal:** Get a winery **off Vintrace/InnoVint and live in days** via AI-assisted import of their
own data. The lead wedge — attacks the incumbents' #1 pain (painful, months-long onboarding) and
the documented churn-with-exit-friction (wineries leave Vintrace and complain it obstructs exit).
**Domain requirements (durable):**
- **Customer-authorized data import, never scraping:** ingest the winery's own exports (Vintrace
  CSV — mind the ~1,000-record/file cap; InnoVint CSV/XLSX) and, where the customer provides a
  token and ToS permits, the **Vintrace REST API**. Legal path: the winery owns its facts,
  nominative-fair-use naming; verify each vendor's competitive-use ToS via the customer's signed
  agreement (see `docs/competitive-analysis-vintrace-innovint.md`).
- **AI-assisted mapping** — an LLM maps a messy source export onto our schema, reconciles units,
  infers lineage, flags ambiguities for winemaker confirmation. This *is* the "configures your
  winery" magic.
- **Reuse the D11 legacy-lot pattern as the import spine** — seed lots at current state with the
  source record as a JSON snapshot; do **not** fabricate years of fake ledger history.
- **External identifiers** (`sourceSystem` + `sourceId`/`legacyCode`) on key entities so the
  winery recognizes their data and re-imports are idempotent.
- **US units:** import from **gallons / lbs·tons / °Brix** → canonical liters (D8), plus a
  **winery display-unit setting** (gallons for US wineries) — needed for the US market *and*
  migration comprehension. Extends the Phase 6 per-winery unit setting.
- **Coverage gaps are explicit:** import what the model covers, snapshot the rest, track
  unmapped source fields so nothing is silently dropped.
**Exit:** a real Vintrace (and InnoVint) export imports cleanly under a tenant; the winery sees
their lots/vessels/inventory in their own units + codes, live, without weeks of setup.
**Implementation: deferred to `/plan`.**  **Honors:** D8, D11, D16.

## Phase 14 — Compliance & reporting (TTB, excise, state/DTC)  🟦 *v1 slice shipped*  *(table stakes — high priority)*
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

## Phase 15 — Accounting integration (QuickBooks / Xero, COGS/AP)  ⬜
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

## Phase 16 — DTC & sales integration (Commerce7 / WineDirect)  ⬜
**Goal:** Close the fragmentation gap — finished-goods inventory + sales depletion + revenue — by
**integrating** the DTC/club/POS layer (integrate, do not rebuild).
**Domain requirements (durable):**
- **Commerce7 / WineDirect integration:** finished-goods inventory sync, sales depletion drawing
  down `BottledInventory`, revenue for per-SKU profitability. (Note InnoVint's Commerce7 link is
  one-way + 1:1-constrained — our multi-tenancy lets us do better with multi-winery accounts.)
- **Custom-crush client visibility** (a Vintrace gap): scoped **client read-access** via the
  Phase 12 multi-tenancy boundary — a real edge for custom-crush facilities.
**Exit:** a DTC sale depletes finished-goods inventory; a custom-crush client sees only their wine.
**Implementation: deferred to `/plan`.**  **Honors:** D16 (tenant/client scoping).

## Phase 17 — SaaS subscription billing (Stripe)  ⬜  *(commercialization — trigger-based, late)*
**Goal:** Charge wineries to use the app. This is **platform monetization**, distinct from the
in-app custom-crush *client* billing (that's a Phase 8 domain feature, D19 — do not conflate).
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

## In-flight — Universal timeline undo (the "correction wedge")  🔄
`docs/plans/2026-07-01-024-feat-universal-timeline-undo-plan.md` (building now, tenant-aware).
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
  doesn't file TTB). See `docs/STRATEGY.md` + `docs/competitive-analysis-vintrace-innovint.md`.
- Phase 11 (labor) has an **independent core** and does not block 7/8; it pays off most
  after Phase 9 (clock against work-order tasks) and feeds Phase 8 (labor cost per lot).

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
