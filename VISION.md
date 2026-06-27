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

## 5. The journey, as a chronology

The Lot's page is a **timeline** — a CRM/Salesforce-style activity feed. At the top:
what the lot *is* right now (location, volume, form, composition, latest numbers),
all derived from the ledger projection. Below: a reverse-chronological feed of every
operation, chemistry reading, tasting note, and work-order completion in its life.

The natural stages (harvest → crush/press → fermentation → cellar/élevage →
blending → bottling) are just **chapters** of that timeline. The stage names are not
load-bearing; the timeline being **made of real, queryable records** is.

**Two views of the same truth:** "follow one wine" (open a Lot, read its life story —
how a winemaker thinks) and "what's in my cellar right now" (the vessel floor plan —
how a cellar hand thinks at the start of a shift). Both read from the same
projection and link to each other constantly.

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

**Blast-radius guardrail (LOCKED — D10).** The council was firm here: keep the AI
scoped to **reading** the timeline, **drafting** tasting notes, and **logging simple
sensor data** (Brix/temp). The **costly, lineage-mutating volumetric operations**
(blends, draws, bottling) stay behind explicit UI forms even with the nonce — an LLM
hallucinating a blend of the wrong premium lots corrupts the cost and lineage DAG
irreversibly.

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
| **D4** | **Open/extensible operation vocabulary**; lot **form** is a changeable property (fruit→must→juice→wine→bottle) | Makes red/white/sparkling/rosé all just operation sequences |
| **D5** | **"Bottle" is a continuable container/state**, not a terminal dead-end; distinguish "bottled, in-process" from "finished good" | Sparkling: 2nd ferment, aging, disgorge, dosage happen *after* bottling |
| **D6** | **Undo = compensating "correction" events** with temporal-validity guards, never row reversion | Once a lot has downstream ops, magic revert corrupts lineage |
| **D7** | **Loss, topping, angel's share are first-class ledger operations** | Otherwise cost-per-liter silently drifts |
| **D8** | **State change (kg→L at crush/press) records *measured actual yield*** — never arithmetic conversion | Extraction varies ~600–750 L/tonne |
| **D9** | **RBAC redesigned for multi-vineyard lots** before blends ship (many-to-many source membership / tenant-level cellar perms) | A blended lot spans vineyards; per-vineyard-row auth breaks |
| **D10** | AI/MCP scoped to **read + draft + sensor-logging**; gate volumetric/lineage ops behind UI confirm | LLM hallucination on a blend is irreversible |
| **D11** | **Day-Zero migration: no fake history.** Wrap each current vessel tuple as a "Legacy Lot" seeded at current volume (old tuple stored as JSON snapshot); leave old tables read-only; do **not** fabricate links to historical picks/transfers | Existing data already collapsed multiple picks into one tuple — lineage is irrecoverably lossy |

**Product boundary (from D11):** full vine-to-bottle traceability **starts at
cutover.** Pre-cutover data is explicitly labeled inferred/partial.

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
