# From Wine Inventory to a Winery Operating System

> The north star and **locked architectural constraints** for evolving the current
> app into a full vineyard-to-bottle winery ERP (Vintrace-style).
>
> This document is the source of truth that **every `/plan` must read first.** It is
> deliberately non-technical in the narrative sections and precise in the
> "Locked decisions" section. The phase-by-phase build order lives in `ROADMAP.md`;
> detailed per-phase plans are generated just-in-time into `docs/plans/`.
>
> _Revised after a cross-LLM council review (Gemini + Codex) that corrected the
> original mutable-allocation model. See §3 and §11._

---

## 1. The one idea everything hangs on: the Lot

The app today tracks the right *things* — vineyards, blocks, Brix, harvest weights,
what's in each tank and barrel, racking, bottling, inventory — but it tracks them
*separately*. When wine moves from a tank into a barrel, the system knows volumes
and grape composition, but there is no single thread that says *"this is the same
wine I picked from Block 3 on October 2nd."*

The heart of this evolution is that thread. Call it a **Lot**.

A **Lot** is a batch of wine with an identity that is born at harvest and never
dies. It gets a **Lot ID** the moment fruit is picked, and that ID follows the wine
through everything that happens to it — pressing, settling, fermentation, racking,
barrel aging, blending, bottling. When a bottle leaves the building you can trace
it all the way back to the row of vines it grew on.

Think of the Lot as the **patient chart** in a hospital. The patient (the wine)
moves between rooms (vessels), gets treatments (additions, fining, racking), and
has vitals taken (Brix, pH, TA, temperature). The chart travels with them. You
never lose track of who the patient is just because they changed rooms.

Everything else serves that one idea: **give the wine a continuous identity, and
record everything that happens to it against that identity.**

---

## 2. What a Lot is, concretely

- A Lot is **created at harvest**. Logging a pick creates (or joins) a Lot. The Lot
  remembers its origin: vineyard, block, variety, vintage, pick date, Brix at pick,
  weight.
- A Lot has a **current state** — where it lives, how much there is, what form it's
  in — but that current state is **derived**, not stored as the truth (see §3).
- A Lot has a **history** — an unbroken timeline of every event in its life.
- Lots **split** (rack half a tank to barrels), **merge into new lots** (blend three
  lots into one), and **change form** (grapes → must → juice → wine → bottle). The
  system keeps the lineage, so a blended lot knows its parents and a parent lot
  knows its children.

Because lots split and merge, traceability is a **family tree (a DAG)**, not a
straight line. A finished bottling traces back to several harvest lots; a single
harvest lot can feed several bottlings. The system must make that tree easy to see.

---

## 3. The core architecture (LOCKED)

> This section was rewritten after the council review. The original plan treated
> "what's in a vessel" as **mutable allocation rows**. That breaks on blends and
> makes cost roll-ups mathematically impossible. The corrected model:

**Four pieces, and the relationship between them is non-negotiable:**

1. **`Lot` — identity.** A durable id with origin + lineage. Vintage is an
   *attribute*, **not** part of the identity (see §11, locked decision D3).

2. **An append-only operation ledger — the source of truth.** Every cellar action
   (crush, rack, blend, top-up, addition, fining, filtration, loss/angel's share,
   tirage, disgorge, dosage, bottle) is an **immutable event** that writes
   double-entry volumetric lines, e.g. `−500 L of Lot A from Tank 1`,
   `+1000 L of Lot C into Tank 3`. This mirrors the pattern the app *already* uses
   for bottled wine (`StockMovement`) — the architectural smell today is that
   **bulk wine has no such ledger**; it has mutable `VesselComponent` rows. We fix
   that by giving bulk wine the same ledger discipline.

3. **A materialized current-state projection.** "What's in Tank 3 right now / where
   does Lot A live / how full is this barrel" is a **fold of the ledger**, maintained
   transactionally as operations are written. We do **not** do pure event-sourcing
   with replay-everything reads (too heavy); we keep a fast projection alongside the
   ledger. `VesselComponent` evolves into this projection layer, not the truth.

4. **Lineage edges.** Parent→child relationships for derived lots, so blends and
   splits form the traceability DAG and cost can be rolled up by traversing it.

**Consequences that are part of the model, not edge cases:**

- **A blend originates a NEW lot.** Pumping Lot A + Lot B into a tank does not leave
  two co-resident allocations — it draws both down via ledger lines and creates
  **Lot C**, which owns its own chemistry, tasting notes, additions, cost basis, and
  a lineage tree back to A and B. Chemistry and additions attach to the
  **homogeneous liquid (the lot in the vessel)**, never to a phantom share of a
  parent lot.
- **"Undo" is a compensating operation, not a row reversion.** The current
  `planRevert` works only because identity is simple and local today. Once a lot has
  downstream operations, you cannot magically revert an earlier one — you record a
  **correction event** with temporal-validity guards. (Locked decision D6.)
- **Loss is first-class.** Lees, angel's share (barrel evaporation), and topping are
  ledger operations, not silent manual volume edits — otherwise cost-per-liter
  drifts from reality. (Locked decision D7.)
  - **How each loss is captured (clarified Phase 3):** *lees loss* is recorded as part
    of a **rack** — you record the volume moved and the measured volume that landed, and
    the loss is **derived** (out − in), not entered separately. *Angel's share /
    evaporation* is **never a manual event**: it is **derived from topping** — the volume
    topped back into a vessel is, by definition, the headspace evaporation since the last
    top-up, so cumulative top-ups give the evaporative loss for free. The standalone
    **"dump" operation (the `LOSS` op type) is only for deliberately discarding wine**
    (spoilage, failed lot, emptying a vessel) — not for evaporation.

---

## 4. Process is data, not schema — reds, whites, sparkling, rosé

The ledger does **not** encode "the winemaking process." It records whatever
operations actually happened, in whatever order. So the difference between styles
becomes **data (a different sequence of the same operations)**, never a different
schema. This is the strongest reason to use the ledger model.

- **White** — harvest → **press first** (juice off the skins *before* ferment) →
  cold settle → rack off solids → ferment → MLF/additions → fining/filtration →
  bottle. Same primitives as red; press happens early.
- **Red** — harvest → destem/crush → ferment **on skins** (punch-downs/pump-overs
  as operations) → **press late** → barrel élevage → blend → bottle.
- **Sparkling (traditional method)** — press → ferment base wine → **assemblage**
  (blend, often multi-vintage) → tirage (addition) → **second fermentation in the
  bottle** → aging on lees → riddling → **disgorge** (loss op) → **dosage**
  (addition) → final cork. Tank-method (Prosecco/Charmat) is easier: second ferment
  is just in a pressurized tank (already a vessel).
- **Rosé (saignée)** — bleed juice off a red must = a **split** that originates a new
  rosé lot with lineage back to the parent red. Pét-nat, orange/skin-contact, and
  carbonic are likewise just operation sequences.

**Three requirements make this true (LOCKED — see §11):** an open/extensible
operation vocabulary with a changeable lot *form* (D4); "bottle" as a
continuable container/state, not a terminal dead-end, so sparkling can keep
accruing operations after bottling until disgorge/dosage finalize a sellable SKU
(D5); and vintage kept out of lot identity (D3).

---

## 5. Two surfaces: capture (vessel-first) and review (the Lot timeline)

> Revised after the design review. The original draft made the Lot timeline the
> primary object for everything. All three reviewers were unanimous: that is the
> right model for *review* and the wrong model for *capture*. Winemakers **plan and
> sell in lots, but they work in vessels** (a cellar hand doing morning pump-overs
> navigates physical space, not abstract IDs). Forcing lot-first entry on the floor
> kills adoption (D12).

**Capture is vessel-first.** The daily operating surface for cellar staff is the
**vessel / cellar context** — tanks, barrels, groups. The make-or-break interactions:

- **Fermentation Round** — a bulk-entry worksheet: one row per vessel in route order,
  oversized auto-advancing fields (Brix, temp), context (operator, time, zone)
  inherited once for the whole round. A fast numpad beats voice for a 20-tank matrix.
- **One-tap ad-hoc actions** on every vessel/lot header (log addition, rack, top, pull
  a sample) — *no* requirement to create a work order first. Work orders are for
  *planned/delegated* work; completing one creates a **prefilled-actuals** record, not
  a blind auto-log. Reactive work uses quick-log.
- **Group actions** — top or add SO₂ to 60 barrels in one action that fans out to the
  child vessels (D13). Per-barrel logging is unusable.

**Review is the Lot timeline.** The Lot's page is a CRM/Salesforce-style chronological
feed — current-state header on top (location, volume, form, composition, latest
numbers, all from the projection), then every operation, chemistry reading, tasting
note, and work-order completion in the lot's life. This is the surface for
investigation, lineage, planning, and compliance. It is one tap from any vessel, but
it is not the daily capture driver.

The natural stages (harvest → crush/press → fermentation → cellar/élevage → blending →
bottling) are just **chapters** of that timeline. The stage names are not load-bearing;
the timeline being **made of real, queryable records** is. The two surfaces read from
the same ledger projection and link to each other constantly.

---

## 6. Records that hang off the timeline

Each timeline event is a typed record so the system can ask the right questions and
run the right math.

- **Chemistry / analysis** — a measurement at a point in time, attached to the lot
  in its vessel. This is where **pH** and **titratable acidity (TA)** live, alongside
  Brix, temperature, RS, free/total SO₂, malic acid, VA, alcohol. Logging what was
  measured. Because these are tied to a lot + timestamp, **trend charts come for
  free** (the app already does this for vineyard Brix).
- **Tasting / flavor notes** — aroma, flavor, structure, score, "needs more time,"
  "ready to blend." Logged at any stage; becomes a searchable tasting history.
- **Operations / work done** — the physical actions that move/transform wine. Each is
  a ledger event (see §3): racking, additions, topping, fining, filtration, press,
  blend.
- **Additions** — a special operation that records *what / how much / to which lot*,
  so it simultaneously logs a winemaking action **and** draws down supplies (§7).

---

## 7. Inputs, supplies, and cost

A new **winemaking-inputs inventory** (yeast, bentonite, nutrients, SO₂, acids,
tannins, fining agents, enzymes, filter media; barrels as a depreciating asset),
mirroring the existing finished-goods pattern: **receive** with cost, **consume**
via additions, always know **how much is left and what it cost.**

Because every addition ties to a lot, and lineage forms a DAG, you get the thing
every winery wants: **cost per lot, then cost per bottle** — harvest + additions +
barrel depreciation + bottling materials accumulating on the lot. **Cost roll-up is a
traversal of the ledger DAG**; it is only correct *because* operations are an
append-only ledger (mutable rows make accurate roll-through-blends impossible).
Sequence: make physical tracking real first, then layer cost on the same records.

---

## 8. Work orders

A work order is "the plan for the day." It flips logging from after-the-fact to part
of the job: the winemaker **creates** a work order ("rack Tanks 3 & 4 to barrels, add
SO₂ to the Chardonnay lots, top all reds"); the crew **executes** it on the floor
(ideally phone/tablet, possibly voice); **completing a task auto-creates the ledger
operation** on the affected lot(s). The work records itself as a side effect of doing
it. This is the feature that makes the data stay clean instead of rotting — and it
gives the planning/accountability layer an ERP needs.

---

## 9. The assistant becomes the winemaker's voice (with a guardrail)

The app already has what most winery software never will: a working AI assistant that
reads and writes through **nonce-guarded confirm-before-write tools**, with a voice
mode. The vision extends that pattern so the winemaker can talk to the winery —
*"log a Brix of 22.4 and temp 78 on the Cab in Tank 4," "what's the pH on all my
Chardonnay lots?", "which lots haven't been topped in two weeks?"*

**Risk-based guardrail (LOCKED — D10).** The design review refined this: gate by
**risk, not capability**. Auto-log **low-risk observations** (Brix, temp, pH, TA) with
a short undo window; let voice **draft medium-risk ops** (single-vessel additions,
top-ups) with a one-tap confirm and an explicit readback; keep **lineage-mutating
volumetric operations** (blends, draws, bottling) behind UI confirmation even with the
nonce. Speed where it's safe; a hard stop where a hallucinated blend of premium lots
would irreversibly corrupt the cost and lineage DAG. (Plus a winemaking-jargon STT
dictionary: Brix, TA, KMBS, ullage, Brett…)

> **MCP angle.** Because the assistant is already built on a clean, safe tool set,
> exposing those tools as an **MCP server** is a natural step, not a rebuild — and the
> same read/draft vs. gated-write boundary applies there.

---

## 10. What we keep — this is an evolution, not a rewrite

Stay in the current repo. Greenfield would re-derive months of platform work
(auth/RBAC, the assistant tool framework + nonce confirm-to-write + voice, the
inventory ledger, audit, design system, maps) that is **orthogonal to the Lot
concept**. The council unanimously agreed.

| Today | Becomes |
|---|---|
| Vineyards, blocks, varieties, GPS maps | The **origin** of every lot — unchanged, linked forward |
| Brix logs (vineyard) | First chapter of "chemistry," extended into the cellar (pH, TA, SO₂…) |
| Harvest records + picks | The **birth event** of a lot |
| Vessels + `VesselComponent` | Vessels stay; `VesselComponent` evolves into the **projection** over the ledger |
| Racking/transfer with loss + undo | Becomes **ledger operations**; undo becomes **compensating corrections** |
| Bottling → SKUs → inventory ledger | The lot's journey end — now traceable through the DAG; "bottle" becomes continuable for sparkling |
| Finished-goods inventory | Joined by a new **supplies/inputs inventory** with cost |
| Field notes (weekly, AI summaries) | The vineyard-side timeline |
| Assistant + voice + confirm-to-write | The command surface (read/draft/sensor) + seed of the MCP |
| Audit log | Stays as "who changed what"; the **lot timeline** is the new "what happened to the wine" |

**Honest reuse estimate (corrected by the council):** ~full reuse of *infrastructure*,
but the *winemaking domain logic* (racking, blending, harvest→lot, bottling draw,
bulk edits, the read models/reports/search/assistant tools that encode the old
identity) is **largely rewritten**. The earlier "~80% untouched" figure was too rosy.
The design language in `DESIGN.md` carries straight through.

---

## 11. Locked architectural decisions (every `/plan` MUST honor these)

| # | Decision | Why |
|---|---|---|
| **D1** | Build on the existing repo, not greenfield | Platform work is paid for and orthogonal to the domain |
| **D2** | Bulk wine is an **append-only operation ledger + materialized projection**, not mutable rows | Required for blends, corrections, and accurate cost roll-up |
| **D3** | **Vintage is an attribute, not part of lot identity** | NV/multi-vintage sparkling, reserve wines, declassification |
| **D4** | Operation type is a **controlled, versioned enum** extended each phase (NOT free-text); lot **form** is a changeable property (fruit→must→juice→wine→bottle) | Type-safe ledger; still makes red/white/sparkling/rosé just operation *sequences*. "Open" meant no fixed pipeline, not untyped. |
| **D5** | **"Bottle" is a continuable container/state**, not a terminal dead-end; distinguish "bottled, in-process" from "finished good" | Sparkling: 2nd ferment, aging, disgorge, dosage happen *after* bottling |
| **D6** | **Undo = compensating "correction" events** with temporal-validity guards, never row reversion | Once a lot has downstream ops, magic revert corrupts lineage |
| **D7** | **Loss, topping, angel's share are first-class ledger operations** | Otherwise cost-per-liter silently drifts |
| **D8** | **State change (kg→L at crush/press) records *measured actual yield*** — never arithmetic conversion | Extraction varies ~600–750 L/tonne |
| **D9** | **RBAC redesigned for multi-vineyard lots** before blends ship (many-to-many source membership / tenant-level cellar perms) | A blended lot spans vineyards; per-vineyard-row auth breaks |
| **D10** | Voice/AI gated by **risk, not capability**: auto-log low-risk observations (+ undo), voice-*draft* medium-risk ops (one-tap confirm + readback), UI-only for lineage-mutating ops (blends/draws/bottling) | Speed where safe; hard stop where a hallucination is irreversible |
| **D11** | **Day-Zero migration: no fake history.** Wrap each current vessel tuple as a "Legacy Lot" seeded at current volume (old tuple stored as JSON snapshot); leave old tables read-only; do **not** fabricate links to historical picks/transfers, and do **not** backfill `BottlingSource.lotId` from present-day lots | Existing data already collapsed multiple picks into one tuple — lineage is irrecoverably lossy; inferred links are fabricated provenance |
| **D12** | **Capture is vessel-first; the Lot timeline is the review/audit/lineage spine**, not the daily capture surface | Winemakers work in vessels, plan/sell in lots; lot-first capture on the floor kills adoption |
| **D13** | **Vessel/barrel *groups* are first-class**; a group operation fans out to child vessels (one action tops 60 barrels) | Per-barrel logging is unusable; the schema must allow group-targeted ops |
| **D14** | Ledger writes use **SERIALIZABLE isolation + canonical row locking + DB-level constraints** (CHECK `volumeL`>0, `deltaL`<>0, unique `correctsOperationId`, vessel capacity), never app-only assertions; every op carries a **monotonic sequence** + observed/entered/method provenance | App-side folds lose updates and overfill vessels; timestamps collide and clocks drift |
| **D15** | A correction is **blocked if any later non-correction op touched the affected vessel/lot positions** (not merely "enough volume present") | A mathematically-valid inverse can silently rewrite a blended/topped composition |
| **D16** | **Multi-tenant from the foundation** — an **Organization (winery) tenant**; every domain row carries `tenantId`; isolation is **enforced in Postgres (Row-Level Security), not app-only**; **uniqueness is per-tenant** (lot codes, SKUs, vessel codes, materials, locations…); the isolation boundary is laid **before a second winery's data exists**. The SaaS operational layer (signup, provisioning, billing, per-tenant branding) is deferred and built incrementally. | The product is a multi-tenant SaaS sold to many wineries; retrofitting tenancy later touches every table/query/constraint and risks cross-tenant data leaks (the worst B2B failure). DB-enforced isolation means an app bug still can't cross wineries. |
| **D17** | **Tenant context is set with `SET LOCAL app.tenant_id` INSIDE each transaction, and RLS isolation is proven through the POOLED endpoint, not only against direct Postgres** | Transaction-mode poolers (PgBouncer / Neon) reuse a physical connection across clients and do **not** reset session GUCs between transactions — a session-scoped tenant id silently leaks to the next request. `SET LOCAL` scopes it to the txn; the leak only manifests *through the pooler*, so CI must exercise the pooled endpoint or the proof is hollow. (Verified risk, 2026-07 research.) |
| **D18** | **Event-store operational discipline is first-class:** SERIALIZABLE writes wrapped in a **bounded retry on SQLSTATE 40001** (backoff + cap); **versioned/upcastable events**; **projection snapshots + throttled, blue-green projection rebuilds**; and **cost-DAG traversal + heavy analytics run OFF the write path** (read replica / deferrable read-only snapshot) | SSI aborts conflicting txns with no auto-retry; projection rebuilds are the #1 event-sourcing operational pain and grow non-linearly; replay storms collapse reads; long analytic reads on the write path both contend and risk unbounded SSI memory. Build these escape hatches while single-tenant, not during a harvest-season outage. |
| **D19** | **Right-to-erasure via crypto-shredding, never row deletion; personal data (DTC customers, user accounts) is NEVER embedded in immutable ledger events** — it lives in a mutable store referenced by id | An append-only log conflicts with GDPR/CCPA Art. 17 erasure (regulator-recognized). Encrypt-then-drop-key erases without breaking the ledger or lineage; keeping PII out of events keeps the erasure surface tiny — matters most at the Phase-16 DTC boundary, but user-account PII must be designed in now. |
| **D20** | **One typed tool-contract registry is the single source of truth: the UI actions, assistant tools, MCP tools, and dashboard metric catalog are all PROJECTIONS of it, with read/draft/gated-write risk classification baked in once.** Outbound integrations are **event-driven off the ledger**; the winery's own data is reachable via an **open, tenant-scoped public/partner API + webhooks** | Prevents maintaining the same operations four times; makes "AI-native" cheap for us and expensive for incumbents to retrofit; the open API + clean export is the **anti-lock-in wedge** against incumbents that "obstruct the exit." Full design in `docs/api-strategy.md`. |
| **D21** | **Wine ownership is a first-class dimension (custom crush + alternating proprietorship): a lot carries an Owner/proprietor, and access, cost treatment, and compliance are owner-scoped.** Custom-crush clients are **Owners inside the facility's tenant** (the facility holds the bond and files TTB); AP proprietors are **independent bonded filers = their own tenant** — a proprietor **self-administers their own lots/wines (full admin of their own operation) but is isolated from every other proprietor**, which Phase-12 RLS already delivers, while the **facility host operates across proprietors via audited god-mode (Phase 21a)**. Custom crush needs the NEW owner-scoping (Phase 23); AP mostly reuses tenancy (12) + god-mode (21a). The open problem is **shared physical premises/vessels/equipment across separate proprietor tenants** (the "alternating" part). | Custom crush + AP are core winery business models both incumbents serve; ownership drives billing (services × contracted rates → client invoices), cost (client wine is NOT the facility's inventory asset → route draw-downs to a billable-expense ledger), portal scope, and — for AP — **separate per-proprietor TTB filing**. Retrofitting an owner dimension after cost/compliance are wired is expensive; the Phase-8 lot `ownership` tag + billable-expense ledger already seed it. (ROADMAP Phases 23–24.) |
| **D22** | **Ambient capture: vision/OCR turns physical artifacts into *proposed* ledger entries, never direct writes.** Photographing a weigh tag, lab whiteboard/spectrophotometer readout, additive invoice, or bottling BOL — or forwarding an email — produces a **proposed operation with the source image/document attached as evidence**, queued for one-tap human approval (extends D10's propose→approve to the vision modality). | Eliminates transcription (the incumbents' #1 data-entry complaint) while *enriching* the audit trail — the photo IS the source document the TTB/FDA want to see; routing every extraction through approval means a model misread can never corrupt the ledger. (ROADMAP Phase 25.) |
| **D23** | **Scenario planning forks ledger state; simulations never touch production until explicitly promoted.** A sandbox forks current cellar state to model blend/rack/bottling programs and see resulting composition, tax-class movement, vessel utilization, and COGS/case; a **goal-seeking blend solver proposes candidate blends from real inventory under constraints** — both emit *proposed* operations a human promotes to real work orders. | The event-sourced ledger IS the fork-and-simulate substrate the incumbents' mutable-CRUD models can't cheaply replicate; users explicitly ask for a racking/blending sandbox; and "what do I do with this excess bulk wine" is *the* oversupply-era question no tool answers quantitatively. Solver output is a proposal (D10 discipline), never an auto-write. (ROADMAP Phase 26.) |
| **D24** | **Institutional memory is read-only retrieval + reasoning over the tenant's OWN longitudinal data — cited, never a write path, never cross-tenant.** Questions like "how did we handle the stuck ferment on this block in 2022?" are answered from the winery's accumulated operations/analyses/notes/outcomes, with answers citing the underlying records. | Worthless in year one, priceless in year five — it makes churn feel like amputation (the retention moat); reuses the Phase-10 assistant infra; read-only + tenant-scoped keeps it inside D16 isolation and the D10 no-AI-writes-to-the-ledger guardrail. (ROADMAP Phase 27.) |
| **D25** | **Offline-first is a first-class architecture, not a per-surface afterthought:** floor/vineyard capture works at **zero connectivity** and reconciles via an **operation-log / CRDT sync with deterministic conflict resolution**; the mobile capture surface targets **iOS AND Android**. | Cellars are Faraday cages and vineyards are dead zones; ~60% of the year's data is created in an 8-week harvest, often at 2 a.m. without signal — a clock-in or Brix reading must never fail. The Phase-6 outbox is a start but has *no* conflict resolution; the real sync layer is hard engineering the strategy calls non-negotiable table stakes. (ROADMAP Phase 28.) |
| **D26** | **AI features are gated by an eval harness from day one:** NL/voice work-order parsing, document/weigh-tag OCR, and blend-solving each ship behind **golden datasets + regression evals** before they are customer-facing; CI runs them. | Domain-correct eval data (real cellar-operations language) is scarce and expensive for anyone without wine fluency — owning it is itself a competitive advantage; without regression evals the AI-native surfaces silently degrade. The deterministic core stays exact/tested (D14); this governs the probabilistic shell. (Pairs with hardening item H8.) |

**Product boundary (from D11):** full vine-to-bottle traceability **starts at
cutover.** Pre-cutover data is explicitly labeled inferred/partial.

**Product scope (2026-07): production system → wine-industry ERP.** The north star has
widened from a single-winery production tool to a **multi-tenant, AI-native wine ERP** for
small/medium wineries (the fundable, competitive product). The production spine (Phases 1–8)
stays the moat; on top of it the **ERP/GTM layer** — competitor **migration/onboarding**
(the wedge), **TTB/state compliance** (table stakes), **two-way accounting**, and **DTC
integration** — is now first-class (ROADMAP Phases 13–16). Phase **priority follows the
competitive + go-to-market evidence** in `docs/STRATEGY.md` and
`docs/competitive-analysis-vintrace-innovint.md`, not the phase numbers. The durable
architectural edge that this ERP layer rests on is the append-only ledger + compensating
corrections (D2/D6/D15): it directly answers the #1 recurring complaint about both
incumbents ("can't cleanly fix a mistake") and makes cost + compliance provably correct.

**Moat honesty (revised 2026-07 after a cross-LLM + market-research pass — see
`docs/architecture/scale-register.md` and the deep-research findings).** The four moat claims are
**not** equal; build all of them, but pitch only the durable ones:
- **Durable (lead with these):** (1) **correction-as-a-first-class-event** — the mutable-state
  model both incumbents appear to use can't retrofit clean, auditable corrections without a rewrite
  (behavioral evidence: InnoVint *"no way to edit an action already input"*; Vintrace *"correcting a
  dispatch reverts volumes to zero"*); (2) the **switching-cost compound** — two-way accounting +
  painless AI migration off the incumbent + founder/Cornell GTM, layered so ACV grows as modules
  switch on.
- **Real but fast-followable:** **two-way QuickBooks** — a genuinely open gap (InnoVint has *no* QBO
  API, confirmed) and a real head-start, but a connector any competitor or ETL vendor can build.
- **Table stakes — build them, do NOT pitch them as the wedge:** **ledger-derived TTB/compliance**
  (both incumbents already auto-derive it; Sovos ShipCompliant already auto-*files* DtC/excise) and
  the **AI assistant / AI dashboards** (SAP is shipping 200+ Joule agents and already claims
  agent-action audit logging as *its* differentiator — the exact angle we lean on). Treat AI-native +
  auditable compliance as **required correctness**, not defensibility. The AI layer is a feature race;
  the moat is the data model + switching cost underneath it.

---

## 12. How we build it — compound engineering

We do **not** write one massive plan, and we do **not** detail all phases up front.
We build in phases, and each phase's decisions compound into the next.

- **`VISION.md`** (this file) — north star + the locked decisions in §11. Stable.
- **`ROADMAP.md`** — the ordered phase runbook: goal, scope, exit criteria, and the
  §11 decisions each phase must honor. Detail is front-loaded for the *next* phase and
  light for far ones; refined just-in-time.
- **`docs/plans/phase-N.md`** — full implementation plan, generated by `/plan`
  **only when about to build that phase**.
- **context-ledger (MCP)** — append-only decisions + learnings captured each phase;
  the next `/plan` queries it so plans compound instead of re-deriving.

**The loop, run end-to-end:**

```
ROADMAP → /plan (reads VISION + ROADMAP + context-ledger) → docs/plans/phase-N.md
        → /work → /verify → /ship → /decision (record learnings) → /clear → phase N+1
```

Each `/work` stays inside a clean context window; each successive `/plan` is sharper
because it builds on what earlier phases decided.

---

## 13. The north star, in one sentence

**Give every batch of wine a single identity from the vine to the bottle, record
everything that happens to it as an append-only ledger of operations, let blends and
splits form a traceable family tree, and let the winemaker drive it by talking to it —
all in an interface calm and clear enough to train someone on in an afternoon, for
reds, whites, and sparkling alike.**
