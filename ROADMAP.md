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

## Phase 1 — The Lot + ledger spine  ⬜  ← the foundation; get this right
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

## Phase 2 — Lot timeline (read-only chronology)  ⬜
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
- **Barrels as depreciating assets:** amortize cost across uses/years; allocate barrel
  carrying cost to the lots aging in them over time.
- **Cost roll-up = traversal of the ledger DAG:** each operation carries cost lines;
  **blends roll up parent cost by volume share; loss reallocates cost onto the
  remaining volume; bottling divides accumulated lot cost across bottles.** This is
  only correct *because* operations are an append-only ledger (D2) — the original
  reason mutable rows were rejected.
- Harvest/fruit cost and (optionally) labor/overhead enter the lot's cost basis at the
  appropriate operations.

**Exit:** receive a supply with a cost; an addition draws it down; produce an accurate
cost-per-bottle for a bottling that traces through at least one blend and one loss.

**Implementation: deferred to `/plan`.** Decisions to resolve then: costing method
(weighted-average vs. FIFO) for supply lots; barrel amortization model; whether
labor/overhead allocation is in scope for v1.
**Honors:** D2, D7.

---

## Phase 9 — Work orders  ⬜
**Goal:** Plan the day's cellar work, and make **completing a task auto-create the
ledger operation** — so logging is a side effect of doing the job, not a chore.

**Domain requirements (durable):**
- Create a work order with one or more **tasks** (templated: rack, add SO₂, top,
  pull an analysis, punch-down, etc.); assign to crew; schedule with due dates;
  surface **overdue / today / upcoming**.
- **Execution UX is floor-first** (phone/tablet, ideally voice-assistable for simple
  steps): a checklist the crew works through.
- **Completion writes the corresponding §3 ledger operation** on the affected lot(s) —
  the central tie-in. A planned rack, when checked off, *is* the rack.
- **Recurring/templated work orders** (weekly topping, scheduled SO₂ management).
- Reporting: scheduled vs. done, overdue, and (optionally) time tracking.

**Exit:** create a WO to rack two tanks; a crew member completes it; the racks appear
as real ledger operations on the lots with correct provenance.

**Implementation: deferred to `/plan`.** Decisions to resolve then: is a work order a
separate planning entity, or are operations given a "planned → executed" state? how do
templates instantiate? offline/poor-signal behavior on the cellar floor.
**Honors:** D2, D6.

---

## Phase 10 — Assistant coverage & MCP exposure  ⬜
**Goal:** Let the winemaker drive the whole system by talking to it — within the
**blast-radius guardrail (D10)** — and expose the tool set as an MCP server.

**Domain requirements (durable):**
- **Read everywhere:** the assistant can query any lot timeline, chemistry trend,
  current cellar state, cost, and work-order status across all new records.
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

**Exit:** ask the assistant for a lot's pH trend and get it; log a Brix reading by
voice; attempt a blend by voice and be routed to a UI confirmation rather than an
auto-write. MCP server answers the read/draft tools from an external client.

**Implementation: deferred to `/plan`.** Decisions to resolve then: the exact
read/draft/gated split per tool; voice-confirm vs. UI-confirm policy per operation;
MCP auth model.
**Honors:** D10.

---

## Dependency notes
- Phase 1 is a hard prerequisite for everything.
- Phase 5 (blends) must not ship before its RBAC redesign (D9).
- Phase 7 (sparkling) depends on the operation vocabulary (Phase 0/D4) and bottling.
- Cost (Phase 8) depends on a complete operation ledger (Phases 1, 3, 5).

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
