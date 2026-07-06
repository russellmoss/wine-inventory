# Migration Feasibility — the GTM wedge (Agent 5)

> **Charge.** For each incumbent (vintrace, InnoVint), map every EXPORT / REPORT / API surface usable as
> a migration EXTRACTION path into Cellarhand, and classify each data domain as **cleanly extractable /
> lossy / must-be-reconstructed**. Special focus (user priority): how lot/batch **codes** appear in each
> incumbent's exports, and whether a stable **internal id** is exposed alongside the human code — so
> Cellarhand can adopt the winery's existing code as a *display name* on our surrogate id without forcing
> renames. Feeds Agent 7 (identity/naming) and the synthesis migration section.
>
> Method: both incumbents compared explicitly (converge = table stakes; diverge = design choice;
> both-struggle = differentiation). Every claim cited to `vintrace-docs/…` or `innovint-docs/…`.
> Cellarhand's side is tagged **[IMPLEMENTED] / [PLANNED] / [ABSENT]** per `analysis/CELLARHAND-CURRENT-STATE.md`.
> Baseline reality: **Phase 13 (migration) is UNBUILT**; the only real ingest today is an internal
> legacy-lot script (reads our own `vessel_component` table, *discards* incumbent codes) + a narrow
> finished-goods CSV (§7 of the current-state brief).

---

## 1. Vintrace extraction surfaces

Vintrace (Zendesk corpus, 567 articles; `exports`=143, `api`=24, `migration`=58) is **export-rich but
format-inconsistent** — the richest historical surfaces are PDF-only, while the machine-readable paths
are scattered across dozens of individually-scoped reports each with its own CSV/PDF toggle.

### 1.1 API
- **REST API** — general get/add/update of "your data in vintrace," RESTful JSON, **OpenAPI spec
  exportable** for a dev team (`vintrace-docs/setup-and-admin/api/api-overview.md`). Live spec at
  `api-docs.vintrace.com` (external, **not** mirrored in the corpus — endpoint/entity/pagination/id
  inventory is not knowable from these docs alone).
- **Tokens** — user-linked; **Local vintrace Admin** permission to mint/delete; **shown once** on
  creation (`vintrace-docs/setup-and-admin/api/managing-api-tokens.md`). Legacy support-generated tokens
  may exist un-named.
- Assessment: the API is the **most complete** vintrace surface and the cleanest migration path if the
  customer authorizes a token and ToS permits (ROADMAP Phase 13 explicitly names "the Vintrace REST API"
  as a legal extraction path). But without the spec in-corpus we cannot confirm which entities expose the
  stable id vs. only the mutable code.

### 1.2 Generic CSV import/export (setup & reference data)
- `vintrace-docs/setup-and-admin/configuration/importing-and-exporting-data.md`: CSV only, header row
  supported, header-only templates downloadable. **Two migration-critical facts here:**
  - **1000-record/file cap** on import ("create multiple CSV files then import them in order").
  - **The "VINx2 ID" column is the stable internal id** and must never be edited ("be sure to leave that
    column as-is; do not edit it"). This is vintrace's durable surrogate key — see §4.
- Round-trips documented for **barrels**, tank **dip charts**, **sales price lists**, blocks/vineyards/
  micro-AVAs (all carry the VINx2 ID column on export).

### 1.3 Lots / bulk wine / lineage / operational history
- **Batch Explorer** (`vintrace-web/winemaking/using-the-batch-explorer.md`) — lot lifecycle by batch
  (New/Active/Archived/Depleted). Only the **"In Production" tab exports to Excel or PDF**; Dispatched/
  Bottled/Costs tabs are on-screen. Keys on batch **code**.
- **Bulk Wine Search** (`…/bulk-wine-search.md`) — lookup by code/owner/vintage/color/varietal/sub-AVA;
  **no file export documented** (feeds operations).
- **Stock Summary Report** (`reporting/bulk-wine/stock-summary-report.md`) — full per-wine operation
  history ("Show Op History") and per-op balances, **PDF only** → the deepest lineage surface but
  machine-hostile.
- **Operation Throughput Report** (`reporting/operations/…`) — operations on a batch, **CSV or PDF** →
  the machine-readable lineage alternative.
- **Composition of Bulk Wine** (`reporting/bulk-wine/composition-of-bulk-wine.md`) — blend composition %
  (vintage/variety/region), **PDF or CSV** ("Breakdown Comp." = one line per element).
- Others: Bulk Wine Placement (PDF/CSV), Vessel Forecasting (CSV), Wine Barrel History (PDF only),
  Causes-of-Loss / Wine Production Loss / Wine Addition Impact (CSV).

### 1.4 Cost / COGS
- **CSV**: Bulk Cost Movement by Posted Date, Bulk Cost Summary, Wine/Juice Costing, Inventory Stock
  Report (Breakout Costing only in CSV).
- **PDF only**: Stock Cost Detail (per-category + per-unit + full cost-event history).
- **Bulk Inventory by Allocation** — the *only* cross-batch product-cost source, CSV, **performance-
  limited** ("may take some time to run" → email, not generate).

### 1.5 Tax / TTB
- **TTB 5120.17** (`reporting/ttb-usa/ttb-report-5120-17.md`) — **editable PDF**, per-bond, Original/
  Amended, summary form (no lot codes on the form).
- **Tax Breakdown Report** (`…/tax-breakdown-report.md`) — the **CSV** lot-level backer ("individual
  batches/lots that were used"), separate sheets bulk vs. bottle, per-bond/tax-class.
- **Tax Event Console** (`…/tax-event-console.md`) — **on-screen only** troubleshooting UI; per-event
  Operation + Target(wine) links; **no file export**.
- State: State Government Tax Class (PDF), CA Winegrower Supplemental, Sales Tax (PDF).

### 1.6 Finished goods / allocations / sales
- **Allocated Products** and **Product Allocations** — **CSV round-trip** (export→edit→import, column
  mapping on import) (`vintrace-web/finished-goods-allocations/…`).
- **Sales Order import** — CSV, keys on **Item Code** + unique **External Reference**; import-only.
- Sales reports: Summary (CSV), Sales/Sales Tax (PDF).
- Inventory/stock movement family: Stock Receipt / Movement / Summary (CSV), Dispatch & Packaged (PDF or
  CSV).

### 1.7 Chemistry / lab
- **Lab results export/import** (`vintrace-web/lab-work/exporting-and-importing-lab-results.md`) — **CSV**,
  export This Page vs. All Matching; **import keys on "AT numbers" in the ID column** (a stable lab-request
  id); "VINx2 Standard" generic mappable format.

### 1.8 Work orders
- **Export Jobs Details** (`vintrace-web/work-orders/exporting-jobs-details.md`) — **XLS**, but **off by
  default** (contact support, v9.9.3+) and **only Ready/In-Progress/Submitted** jobs → closed/historical
  work orders are effectively **not exportable** here.

### 1.9 Harvest / vineyard
- Grape Delivery (CSV, incl. sold-fruit/buyer), Fruit Placement (PDF/CSV email), Grower Contract
  Remittance (**ZIP of per-grower PDFs**), CA Grape Crush (PDF), Fruit sample analysis (Sample Set Console
  CSV), block/vineyard bulk update (CSV w/ VINx2 ID).

---

## 2. InnoVint extraction surfaces

InnoVint (HubSpot corpus, 430 articles; `exports`=90, `api`=3, `migration`=39) is **more uniform** — one
"Export" button on every explorer/report emitting **CSV or XLSX**, plus a genuinely powerful ad-hoc
reporting engine — but with harder subscription gating and browser fragility.

### 2.1 API — **corrects the Cellarhand baseline**
- **InnoVint HAS a full public REST API.** `innovint-docs/support-hours-faqs/general/does-innovint-take-
  product-requests.md`: *"the 100% API and open nature of our platform allows … third party developers to
  custom build … integrations, and reports … Find our public API support documentation here"* → base
  `sutter.innovint.us/api/v1/`. Auth is a **Personal Access Token (PAT)** per a user (bot-user
  recommended), confirmed by `make-advanced-features/integrations/innovint-baker-wine-grape-analysis-
  integration.md`.
- ⚠️ **This contradicts Cellarhand's own `docs/api-strategy.md:23`** ("InnoVint … has **no public developer
  REST API** surfaced"). The corpus says otherwise. The API is the **cleanest programmatic extraction path**
  and its URL-embedded resource ids are the best stable migration keys (§4). (Endpoints aren't mirrored in
  the corpus — pull the live spec.)

### 2.2 Master export inventory
- `guidance-faqs/frequently-asked-questions/what-exports-are-available-in-innovint.md` is the authoritative
  list. All UI exports are **CSV or XLSX** via a blue **Export** button; **Chrome-only** (Safari
  unsupported); data-heavy exports need pop-ups allowed from `cellar.innovint.us`.

### 2.3 Lots / bulk wine / lineage
- **Lot Explorer — Simple Export**: volume/weight/tax-class/bond/stage/vessel counts/vintage-varietal-
  appellation+top%/vineyard/block/color/owners/tags + latest chemistry. **Lot Code, Lot Name, AND URL**
  (URL = stable id). CSV/XLSX.
- **Lot Explorer — Export Lot Components** = the **lineage/composition** export (per-component %, volume,
  vintage/varietal/appellation, vineyard/block/clone, tags). **Documented as the round-trip path** for
  moving lots between InnoVint accounts (export components → reformat → re-import via
  `make/lots/how-to-import-lots-via-csv-file.md`).
- **Individual Lot Details** exports: Analysis, **History** (effective/deleted/created dates, action,
  **Action URL**, involved lots, tax-class-at-time, bond, owners, notes, performed-by, Lot#1/#2/#3
  deltas), Composition, Cost. CSV/XLSX.
- **Custom Reports** (`make/reporting/custom-reports.md`) — flagship pivot-style report across all
  accessible wineries: lot code/name/color/contents/volume/vessels/bond/owners/stage/style/tax-class/
  varietal/vintage/appellation/tags/last-action + **all analysis types** + **COGS** (total, /unit, all cost
  categories, shrinkage, bulk-out, bottled). **XLSX/Numbers/CSV.** Caps: **3 saved reports** (restricted)
  / **200** (MAKE-PLUS); **excludes case-good, fruit, and archived lots entirely**; varietal/vintage/
  appellation only shown at the 75% legal threshold else "Blend."

### 2.4 Operational history / activity
- **Winery Activity Feed (WAF)** — all actions, volume-adjust reasons + notes; filter by action/lot/date/
  owner; **CSV**. Explicitly the fallback for events the TTB Audit omits (sweetening/tax-class transfers).
- **Inventory at Point in Time** / **Vessels at Point in Time** — snapshot lots/vessels as-of a past
  date/time; CSV/XLSX; **MAKE-PLUS only**; data-heavy.
- **Individual Vessel History** — vessel-level movement lineage (starting/ending contents, contents
  change, starting/new lot). CSV.

### 2.5 Chemistry / lab
- **Recent Analyses** — CSV, re-import-formatted, **31-day max window**; excludes TankNet-integration data.
- Primary/ML Fermentation, Stability & Aging, Custom Analysis (by Lot Composite / Vessel / Vineyard
  Block) — exportable. **Analysis Import** round-trips via two CSV templates, matched by Lot Code or Vessel
  code (`make/analysis/how-to-import-analyses-via-csv-file.md`).

### 2.6 Tax / TTB
- **TTB 5120.17 (MAKE)** — **editable government form** download, per-bond/date-range, aggregate (no lot
  codes on the form) (`make/compliance/generate-and-download-the-ttb-report.md`).
- **TTB 5120.17 Audit Report** — **CSV**, the lot-level backing data: each row = one lot's contribution to
  a Part/Section/Line, with **effective-at, action type, action URL, unique action ID, lot code, signed
  volume by tax class** (`make/compliance/understanding-the-ttb-audit-report.md`). **The single richest
  operational-history extraction in either corpus** — a signed, per-action, per-lot movement ledger that
  maps almost 1:1 onto Cellarhand's `LotOperationLine` (signed `deltaL` + `lotCode` snapshot). Caveat:
  **sweetening/concentrate-to-wine transactions are omitted** (reconcile via WAF).
- **State Compliance by Bond** — XLSX, grouped; not point-in-time.

### 2.7 Cost / finance (Costing/COGS add-on)
- All **CSV**: Lot Cost, Roll Forward, Cost Over Time, Cost Item, Bottled Costs, Fruit Cost (weigh-tag
  granular), Dry Goods Explorer + Batch history, Additive/Packaging History (**MAKE-PLUS only**).
- **Cost Audit Report** — **CSV-only**, full lot activity: effective-at, action type, lot code/name, bond,
  winery, **action URL + action ID**, tax-class-at-time, starting/ending volume, volume/cost change,
  cost/unit, cost-by-category, owner, tags. A second per-lot event ledger with the same stable action-id key.

### 2.8 Finished goods / case goods (SUPPLY)
- **Bottling Report** — **CSV**, links **bulk wine lot ↔ case-good lot** (both codes/names + owner/bond +
  bottled volume/gains/losses + format + tax-class-at-bottling + recent chemistry) + a **URL** column
  (bottling-action id). The key bulk→bottle lineage bridge.
- **SUPPLY Inventory Explorer** (point-in-time, CSV), **Action History Feed** (CSV; incl. **Commerce7 Order
  Number** + action URL), **SUPPLY TTB Export** (**multi-tab XLSX** with an Audit tab, Section-B).
- ⚠️ **Migration gap**: *"there is not a linkage between MAKE and SUPPLY"* (`supply/using-supply/tracking-
  case-goods-make-to-supply.md`) — SUPPLY SKU codes are independent of MAKE case-good lot codes; the bulk↔
  finished-goods join must be rebuilt.

### 2.9 Onboarding shape (mirror of what an extraction must preserve)
- `new-to-innovint/…/how-to-onboard-inventory-overview.md`: InnoVint onboards **current-state only** —
  vineyards → vessels → lots → volume; **no historical ledger for the pre-InnoVint era**. This *validates
  Cellarhand's D11* ("no fake history") and means InnoVint itself treats migration as a current-state
  snapshot; deep history exists only inside its action feed / audit reports.

---

## 3. Per-incumbent feasibility map

Classification: **Clean** = machine-readable (CSV/XLSX/API) with the fields + a stable key; **Lossy** =
extractable but format-degraded (PDF), gated, capped, or missing history/ids; **Reconstruct** = no direct
export of the modeled shape — must be inferred/rebuilt or snapshotted per D11.

### 3.1 Vintrace

| Domain | Class | Format & path | Notes / gaps |
|---|---|---|---|
| Lots / bulk wine (current state) | **Clean** | CSV — Batch Explorer "In Production" (Excel), generic CSV w/ VINx2 ID | Depleted/archived reachable; batch **code** is the visible key, VINx2 id only in setup CSVs |
| Vessels / barrels | **Clean** | CSV — barrel details export, dip charts, generic import/export (VINx2 ID) | Fully round-trippable |
| Lineage / composition | **Lossy** | CSV (Composition "Breakdown Comp."; Operation Throughput) **but** deepest history is Stock Summary **PDF-only** | Blend %/graph in CSV; full op-by-op lineage machine-readable only via Operation Throughput |
| Operational history | **Lossy** | Operation Throughput **CSV**; Stock Summary **PDF** | No single "all events" CSV; per-batch report sprawl |
| Cost basis | **Lossy** | Mostly CSV (cost movement/summary/costing); Stock Cost Detail **PDF-only**; cross-batch product cost perf-limited | Recoverable but multi-report assembly |
| Tax / TTB history | **Lossy** | Tax Breakdown **CSV** (lot-level); 5120.17 **PDF**; Tax Event Console **screen-only** | CSV backer exists; event console not exportable |
| Chemistry / analyses | **Clean** | CSV lab export (keyed on AT numbers) | Round-trippable, mappable metrics |
| Work orders | **Reconstruct / Lossy** | XLS Export Jobs Details **off-by-default + open jobs only** | Closed/historical WOs not exportable → reconstruct from op history or snapshot |
| Finished goods / allocations | **Clean** | CSV round-trip (allocated products, product allocations, stock reports) | Item Code is the key |
| Ownership | **Lossy** | Owner is a batch attribute in exports/auto-codes; **no ownership-change history** | Current owner clean; ownership *timeline* absent |

### 3.2 InnoVint

| Domain | Class | Format & path | Notes / gaps |
|---|---|---|---|
| Lots / bulk wine (current state) | **Clean** | CSV/XLSX — Lot Explorer Simple Export (+URL id); Custom Reports | Custom Reports **excludes case/fruit/archived lots** — use Lot Explorer for those |
| Vessels | **Clean** | CSV/XLSX — Vessel Explorer + Vessel History | Round-trippable (import can't update existing) |
| Lineage / composition | **Clean** | CSV — Lot Components export (documented round-trip) | Component %/vineyard/clone all present |
| Operational history | **Clean** | CSV — WAF; TTB Audit; Cost Audit (all carry action URL + action ID) | Best-in-class: signed per-action per-lot rows w/ stable action id |
| Cost basis | **Clean** (add-on) | CSV — Lot Cost / Roll Forward / Cost-over-Time / Bottled / Fruit / Cost Audit | Requires Costing/COGS subscription; some MAKE-PLUS only |
| Tax / TTB history | **Clean** | CSV — TTB Audit Report; XLSX — SUPPLY TTB (Audit tab); 5120.17 form itself PDF-like | Sweetening tax-class moves omitted from Audit → WAF backfill |
| Chemistry / analyses | **Clean** | CSV — Recent Analyses (31-day windows), Custom Analysis, Lot analysis export | Chunk by 31-day windows for full history |
| Work orders | **Lossy** | Actions surface in WAF/Audit exports; no dedicated WO-history export found | WO *structure* (task grouping/templates) likely reconstruct from action feed |
| Finished goods / case goods | **Lossy** | CSV Bottling Report (bulk↔case link) + SUPPLY exports, **but MAKE↔SUPPLY not linked** | Bulk→bottle bridge good; SUPPLY SKU↔MAKE case-lot join must be rebuilt |
| Ownership | **Lossy** | Owner column in most exports; **owner/tag changes never tracked over time** | Current owner clean; ownership *timeline* irrecoverable |

**Both fail (differentiation surface):** full **operational-history-as-first-class-export** in a single
clean feed (vintrace fragments it across PDF reports; InnoVint's cleanest is the *compliance* audit, which
drops sweetening and isn't a general event log); **work-order history**; and an **ownership-change
timeline**. These are exactly where Cellarhand's append-only ledger + append-only corrections would let it
*ingest and then out-preserve* what the incumbents can barely export.

---

## 4. Lot / batch codes in the exports (user-priority focus)

**The core question for Agent 7: does each incumbent expose a *stable internal id* alongside a *human
code*, so Cellarhand can adopt the code as a display name on our surrogate id without forcing renames?**

### Vintrace — three-tier identity
1. **Human batch code** — auto-code-generated, **mutable, and cascades**: *"Changing the batch code updates
   all historical references to that code"* (`vintrace-web/winemaking/changing-a-wine-batch-s-properties.md`).
   Also swappable inline during a transfer. **Not a safe join key.** Composition is parseable (vintage +
   variety + region + Inc, plus single-char fraction/oak codes, "WB"/"PB" prefixes —
   `setup-and-admin/configuration/configuring-and-using-auto-codes.md`).
2. **"Batch Number" auto-code** — a *universally unique, ever-incrementing* number "with every batch in your
   database, regardless of other details" (same article) — but it's embedded in the human code, not
   necessarily the DB id.
3. **"VINx2 ID"** — the true DB surrogate: a CSV column you *"leave as-is; do not edit"*
   (`importing-and-exporting-data.md`). ⚠️ **But it is only documented in setup/reference-data CSVs**
   (barrels, dip charts, blocks, price lists) — the **operational reports (TTB, cost, stock, throughput)
   key on the mutable batch code only.** So the stable id exists but may not travel with the operational
   exports; the **API** is the likely place to get id-keyed operational data.

### InnoVint — code + name, both mutable; id only via URL
- **Lot Code AND Lot Name are both freely mutable**, and a change *"will change to display the new code,
  name … throughout the entire history of the lot"* (`make/lots/changing-lot-properties.md`). No visible
  stable lot-id column in any export — the only durable id is the **URL** (embeds the internal record id),
  present in Lot Explorer Simple Export, Lot History, Bottling, and lot-detail exports.
- **Actions do expose a stable id**: *"Each action or task recorded in InnoVint has a unique action ID"*
  (TTB Audit + Cost Audit reports) — so the *event* stream is stably keyed even though *lots* are not
  (in CSV).
- **Rename resilience:** only the **Lot Properties History Report** records code/name change events
  (audit of code/name/color/style/stage/tax-class/archived over time) — but it has **no documented export
  button** (screen/print only). Owner and Tag changes are **never** historically tracked.

### Implication for Cellarhand's adopt-the-code-as-display-name goal
- **Feasibility is HIGH in principle, but the mapping targets Cellarhand's *planned* layer, not today's.**
  Both incumbents already separate *stable identity* (VINx2 ID / URL-embedded id / action id) from a
  *mutable human label* (batch code / lot code+name) — which is **exactly the target architecture Agent 7
  is evaluating** and the *opposite* of Cellarhand's current model (§5).
- The right import mapping is: **incumbent stable id → Cellarhand `Lot.id` (surrogate) via a new
  `sourceSystem`+`sourceId` external key; incumbent human code → Cellarhand display label.** Vintrace gives
  a clean code + a documented (if narrowly-exposed) VINx2 ID; InnoVint gives a code + name but the id is
  URL-embedded (parseable) and cleanest via the API.
- **Blocker on our side:** Cellarhand's `Lot.code` is **immutable, scheme-hardcoded, and doubles as the
  per-tenant unique key** with no separate `displayName` field (`src/lib/lot/code.ts`, current-state §5).
  So adopting a winery's arbitrary existing code as a free label collides with `@@unique([tenantId,code])`
  and the immutable line-level `lotCode` snapshots. Adopting incumbent codes without renames **requires the
  PLANNED display-name/renameable-label split first** (hand-off to Agent 7).

---

## 5. Cellarhand today + planned (3-state)

| Capability | State | Evidence |
|---|---|---|
| Import bulk wine lots / vessel contents / cost / chemistry / lineage / tax / WO / ownership | **[ABSENT]** | current-state §7: "any import of bulk wine lots… is ABSENT today" |
| Day-Zero legacy-lot spine (wrap current vessel tuple as `isLegacy` Lot via `SEED`, JSON snapshot, no fake history) | **[IMPLEMENTED, internal-only]** | `scripts/migrate-legacy-lots.ts`; reads our own `vessel_component`, **discards existing code**, idempotent by `LEGACY-<id>` |
| One-time legacy recode (`LEGACY-*` → `YEAR-VINEYARD-VARIETY`) | **[IMPLEMENTED, CLI]** | `scripts/recode-legacy-lots.ts` (declared exception to code-immutability) |
| Finished-goods CSV import (`Item,Vintage,Category,Location,Quantity`, ≤2000 rows, RECEIVE into stock ledger) | **[IMPLEMENTED, narrow]** | `src/lib/inventory/csv.ts`, `importInventory` |
| `sourceSystem` + `sourceId`/`legacyCode` external ids on key entities (idempotent re-import) | **[PLANNED]** | ROADMAP Phase 13 §760-761; **schema grep confirms no such fields today** (only unrelated QBO `externalId`) |
| AI-assisted mapping of a messy export → schema, unit reconciliation, lineage inference | **[PLANNED]** | ROADMAP §755-757 |
| US-unit import (gal/lbs·tons/°Brix → liters) + winery display-unit setting | **[PLANNED]** (D8 canonical-liter core exists) | ROADMAP §762-764 |
| Ingest customer's own Vintrace/InnoVint exports (CSV) + Vintrace REST API w/ token | **[PLANNED]** | ROADMAP §750-754 (gated on a design partner's real export) |
| Renameable display-name layer separate from immutable surrogate id | **[ABSENT]** (code IS the unique key; no `displayName`) | current-state §5; no roadmap entry |
| Import of ownership / owner-change history | **[ABSENT]** (ownership is a static cost-only tag, no change op) | current-state §6 |

**Net:** Phase 13 is a **greenfield build gated on a real partner export.** The D11 legacy-lot pattern is
built but only ingests our *own* prior table and *throws away* incumbent codes — the exact opposite of the
"adopt their codes as display names" goal, which needs both the planned `sourceSystem`/`sourceId` keys and
the (unroadmapped) display-name split.

---

## 6. Shared tooling vs. incumbent-specific

**Shared (build once):**
- **D11 legacy-lot spine** — wrap current-state per vessel/lot as an `isLegacy` Lot seeded at current
  volume via `SEED`, source record as JSON snapshot. Both incumbents onboard current-state-only anyway
  (InnoVint explicitly; vintrace's clean exports are current-state), so this pattern fits both.
- **`sourceSystem` + `sourceId`/`legacyCode` external-id columns** — same shape whether the id is a vintrace
  VINx2 ID or an InnoVint URL-embedded/action id; makes re-imports idempotent for both.
- **Unit reconciliation** (gal/lbs/tons/°Brix → liters, D8) — both are US-unit tools.
- **CSV/XLSX column-mapping + AI-assisted schema mapping** — both emit tabular files needing the same
  "messy columns → our schema" reconciliation; both have per-file caps to chunk around.
- **Chemistry import** — both round-trip analyses via CSV keyed on lot/vessel code; one importer serves both.
- **Coverage-gap tracking** (snapshot the unmapped, never silent-drop) — same discipline for both.

**Incumbent-specific:**
- **Vintrace connectors** — (a) REST API + OpenAPI ingester; (b) the VINx2-ID-bearing generic CSVs vs.
  the code-keyed operational reports (must reconcile the two id spaces); (c) PDF-only surfaces (Stock
  Summary, Stock Cost Detail) need OCR/snapshot or API fallback; (d) 1000-row file chunking; (e) batch-code
  *cascade* semantics (a code seen in an old report may have been rewritten).
- **InnoVint connectors** — (a) `sutter.innovint.us/api/v1/` PAT-auth client (the cleanest path — **update
  `api-strategy.md`**, which wrongly says InnoVint has no API); (b) URL-parsing to recover the stable lot
  id; (c) the **TTB Audit / Cost Audit CSVs** as the primary operational-history ingest (signed per-action
  rows) + WAF backfill for sweetening; (d) MAKE↔SUPPLY re-join (SKU code ≠ case-good lot code); (e)
  MAKE-PLUS/Costing add-on gating (some exports simply won't exist for lower tiers → reconstruct); (f)
  31-day analysis-window chunking; (g) Chrome/pop-up export fragility (affects a customer's ability to
  self-serve the files).

---

## 7. Convergence / divergence / both-fail

**Convergence (table stakes for a migration tool):**
- Both expose **current-state** lots/vessels/composition/chemistry as **clean CSV/XLSX** with a documented
  **round-trip import format** — so a current-state D11 seed is straightforwardly feasible from either.
- Both separate a **stable id** from a **mutable human code** internally — the identity model Cellarhand
  *should* adopt.
- Both offer a **REST API** (vintrace documented+OpenAPI; InnoVint public+PAT) — token-authorized API
  ingest is viable for both, ToS permitting.
- Both file **TTB 5120.17** and expose a **lot/action-level audit backer** (vintrace Tax Breakdown CSV;
  InnoVint TTB Audit CSV).

**Divergence (design choices to exploit):**
- **Format uniformity:** InnoVint = one Export button, uniform CSV/XLSX; vintrace = per-report CSV/PDF
  lottery with the deepest history **PDF-locked**. → InnoVint is *easier to extract cleanly*; vintrace needs
  more OCR/API fallback.
- **Operational-history keying:** InnoVint's audit CSVs carry a **stable action id + signed per-lot deltas**
  (near-isomorphic to our `LotOperationLine`); vintrace's machine-readable op history (Operation Throughput)
  keys on the **mutable batch code**. → InnoVint operational history imports with higher fidelity.
- **Code stability:** vintrace batch code *cascades on edit* (rewrites history); InnoVint code+name rewrite
  display but the event id is stable. Different reconciliation logic per source.

**Both fail (Cellarhand differentiation):**
- No **single clean operational-event export** (vintrace fragments to PDF; InnoVint's cleanest is
  compliance-scoped and drops sweetening).
- No **work-order history export** worth the name (vintrace: open jobs only, off by default; InnoVint: only
  as raw actions).
- No **ownership-change timeline** (both track only *current* owner; changes untracked).
- Both onboard **current-state only** — neither can hand a migrating winery its *own* deep history in a
  clean, id-keyed, event-shaped form. Cellarhand's append-only ledger is the substrate that could **ingest
  what they can export and then preserve it better than the source** — and the open API + clean export is
  the anti-lock-in wedge (D20) precisely because the incumbents "obstruct the exit."

---

## 8. Recommendations

1. **Build two source connectors on one shared spine.** Reuse the D11 legacy-lot pattern + a shared
   AI-mapping/unit-reconciliation/coverage-gap core; add thin vintrace and InnoVint adapters. Prioritize
   **InnoVint first for a lighthouse migration** — uniform CSV/XLSX + a public PAT API + the action-id-keyed
   TTB/Cost Audit CSVs make it the lowest-friction, highest-fidelity extraction; vintrace's PDF-locked
   history makes it the harder second target.
2. **Ship the `sourceSystem` + `sourceId`/`legacyCode` external-id columns NOW** (Phase 13 §760), keyed to
   **vintrace VINx2 ID** and **InnoVint URL-embedded lot id / action id**. This is the join backbone and the
   idempotency key; it's currently **[ABSENT]** in the schema.
3. **Unblock "adopt their codes without renames" — hand Agent 7 a hard dependency:** introduce a
   **`displayName`/label layer distinct from the immutable surrogate id and the unique key**, so an
   incumbent's arbitrary lot code can become a free-text display name that won't collide with
   `@@unique([tenantId,code])` or the immutable `lotCode` line snapshots. Without this, migration *must*
   discard or mangle the winery's existing codes (today's `recode-legacy-lots.ts` behavior) — the #1
   recognition/adoption killer. This is the single most important cross-agent finding.
4. **Ingest operational history as append-only ledger events where a stable event key exists.** InnoVint's
   TTB Audit + Cost Audit CSVs (signed per-lot, per-action, action-id-keyed) map almost directly to
   `LotOperation`/`LotOperationLine`; import them as **historical events flagged `captureMethod:"IMPORT"`**,
   not as fabricated live ops — and **backfill sweetening/tax-class moves from the WAF export** (TTB Audit
   omits them). For vintrace, prefer the **API** over the code-keyed Operation Throughput report to get
   id-stable history; treat PDF-only Stock Summary as OCR/snapshot fallback (D22 ambient-capture seam).
5. **Honor D11 literally — snapshot, don't fabricate.** Where lineage/ownership-timeline/work-order-history
   isn't cleanly exportable (both incumbents fail here), store the source blob as the JSON snapshot and
   **label it inferred/partial** rather than inventing edges. Track every unmapped source column so nothing
   is silently dropped (Phase 13 §765).
6. **Correct `docs/api-strategy.md`.** It asserts InnoVint has "no public developer REST API"; the corpus
   documents a full public API at `sutter.innovint.us/api/v1/` with PAT auth. The anti-lock-in positioning
   still holds (their APIs are extraction-only / one-way accounting), but the factual claim should be fixed
   so Phase 13 planning targets the real API path.
7. **Design the extraction UX around the customer self-serving files.** Both tools gate exports behind
   admin permissions (vintrace Import/Export Setup Data + API-admin; InnoVint PAT + Chrome/pop-ups + tier
   gating). The onboarding flow should give the winery an exact, per-incumbent checklist of which
   exports/API calls to run, in what order, respecting the 1000-row (vintrace) / 200-row (InnoVint SUPPLY) /
   31-day (InnoVint analyses) chunking limits.
