---
title: Vintrace ↔ InnoVint capability crosswalk — table stakes, gaps, and moat
tags:
  - analysis
  - parity
  - competitive
status: living
---

# Vintrace ↔ InnoVint capability crosswalk

> [!abstract] What this is
> A by-domain comparison of the two incumbent winery-ERPs (Vintrace, 567 help
> articles; InnoVint, 430 pages) reconciled against **our** codebase (Cellarhand).
> The thesis under test: **the overlap between the two incumbents is the
> "table-stakes" set — the MVP-parity target.** True, with one correction below.
>
> Produced by a 20-domain multi-agent crosswalk (41 agents: per-domain capability
> extraction → repo reconciliation → synthesis). The per-capability verdicts feed
> the **Capability-Parity register** (`docs/architecture/parity/`, new `overlap`
> field + the "⭐ Table stakes" views in `parity.base`). Regenerate with
> `node scripts/ingest-parity-corpus.mjs`; guarded by `npm run verify:parity`.

## The correction to "overlap = MVP"

Overlap = **table stakes** (the don't-lose set), **not** MVP. The intersection of
two mature incumbents is ~**90 deduplicated capabilities** — and we already **fully
cover a slim majority (~50+)**. So the overlap doesn't *define* the MVP; the MVP is
the **subset of the overlap we haven't shipped yet**. Two things pure-overlap
thinking throws away are captured here too: the **skip-list** (single-vendor niche)
and the **moat targets** (where *both* incumbents are weak — our AI-native openings).

Our coverage is deepest exactly where switching cost lives: the append-only ledger,
cross-tax-class 5120.17 accounting, cost roll-up with per-bottle COGS + auto barrel
depreciation, blend/split lineage, sparkling (tirage→disgorge→dosage), and a two-way
QBO + Commerce7 money loop that **beats both**.

## The one-paragraph executive read

> The true table-stakes set (capabilities BOTH incumbents ship) is large — ~90
> deduplicated capabilities across intake, cellar ops, blending/lineage, lab,
> sparkling, bottling, finished goods, costing, TTB compliance, work orders,
> purchasing, DTC, reporting, integrations, and mobile. We already FULLY cover a
> slim majority (~50+), deepest where switching cost lives. The **single biggest
> MVP-parity gap** is not one feature but a cluster: the **cellar-floor operational
> layer** — a real mobile/offline client, barcode/QR scanning, a drag-drop WO
> calendar, dip charts — plus **fruit-intake compliance artifacts** (bins/tare
> weigh-groups, sequential weigh-tag/weighmaster certificates) and the entire
> **grower→contract→AVA vineyard front** (no grower entity, no fruit contract, no
> appellation carried to the bottle). The **top moat opening** is our
> correction-as-event ledger + first-class bidirectional lineage DAG + auto
> per-bottle COGS/barrel depreciation, surfaced through the AI assistant as the
> natural-language query-and-write layer neither incumbent exposes — with the
> sharpest near-term AI wins being an **OCR/photo lab-analysis importer** (leapfrogs
> InnoVint's Gemini feature onto our confirm-gated core) and turning every
> production event on a client lot into a **priced, API-exposed custom-crush charge**
> that is literally un-extractable from either incumbent.

---

## 1. Table stakes — ranked by OUR remaining gap

These are capabilities **both** incumbents ship. The MVP-parity punch-list is the
`gap`/`partial` rows; the `covered` rows are proof we're already at parity (many
with a moat edge on top).

### 1a. ❌ Gaps (both incumbents have it; we don't) — the MVP punch-list

| Capability | Domain | What's missing for parity |
|---|---|---|
| Gross/tare/net via bins or weighing groups | Fruit intake | Reusable tare-container defs + gross→net calc + CA common-tare |
| Weigh tag / weighmaster certificate (sequential #) | Fruit intake | Monotonic cert counter, weighmaster/deputy fields, PDF cert, void-not-delete |
| Multiple growers/parcels on one truck delivery | Fruit intake | Delivery/weigh-tag grouping object tying many picks to one truck |
| Track fruit received-and-sold/dispatched | Fruit intake | HarvestPick has no owner/sold concept; no sold-fruit dispatch / TTB Part IV fruit removal |
| Grower / fruit-source party record | Vineyards & growers | No Grower entity or grower FK (VineyardDetail.manager is free text) |
| AVA / appellation assignment | Vineyards & growers | No region/AVA field; appellation never flows to the bottle |
| Grower / vineyard contract (fruit purchase) | Vineyards & growers | No fruit-purchase contract model of any kind (Phase-8 follow-on) |
| Bonus/penalty (value) rules on fruit price | Vineyards & growers | No fruit-price value-rule engine; needs a contract to hang thresholds on |
| Bulk CSV import/export of vineyard/block/grower | Vineyards & growers | Inventory CSV only; no vineyard/block/grower entity or event round-trip |
| Rack-and-return (out + back in one action) | Bulk cellar ops | No dedicated action, holding-vessel abstraction, or no-net-gain guard |
| Blend & return (blend then return to source) | Blending | No single primitive; manual choreography only (both weak — moat) |
| Bulk-create / import barrels (auto-code) | Barrel mgmt | createVessel is one-at-a-time; no CSV importer or "add N identical" |
| Barrel storage-location tracking (stack coords) | Barrel mgmt | Vessel has no location field; Location attaches only to finished goods |
| Barcode/QR vessel labeling & scan-to-act | Barrel mgmt | No QR/barcode generation or scan-driven action surface anywhere |
| Saved analysis template / panel (reusable set) | Lab & analysis | AnalysisPanel is an instance; no reusable metric set, no default-per-event |
| CSV bulk import/export of lab results | Lab & analysis | No analyte-keyed bulk import or export |
| Analysis follows the wine through movements | Lab & analysis | Measurements attach to one lot; no live-metric carry-forward to child lots |
| Case-pack / grouping (units per case, pallets) | Finished goods | On-hand is bare bottle counts; no units-per-case, no case/pallet entity |
| Bottling as a schedulable work-order task | Bottling | WO engine has no BOTTLE/packaging task type |
| Bill of Lading from a dispatch/removal | FG / compliance | Removal is a bare disposition event; no BOL doc/register (both weak — moat) |
| On-order / earmarked (committed) inventory | Sales / FG | Paid-only ingest; no committed-vs-available reservation (both weak — moat) |
| Indirect overhead allocation across many lots | Costing | Components + toggles exist but nothing writes the CostLine (Phase 11) |
| Operation / treatment / labor cost tracking | Costing | No per-op auto-cost; LABOR CostLine never written (true labor absent in both — moat) |
| Lab / analysis cost tracking | Costing | AnalysisPanel carries no cost linkage |
| Distilled-spirits (Part III) proof-gallon handling | Compliance | No proof-gallon engine; >24% ABV rejected as out-of-scope (both weak — moat) |
| State excise / state tax-class reporting | Compliance | Federal only; no state winegrower return (both thin — moat) |
| Backdate / effective-time control on WO completion | Work orders | completeTaskCore stamps server now; no operator-set effective date |
| Public REST API + token auth | Integrations | No API-key model; NDJSON assistant is the only programmatic surface |
| Tank-controller integration (TankNET/VinWizard) | Integrations | No controller feed (self-serve onboarding is an opening — moat) |
| Barcode/QR vessel scanning on mobile | Mobile | No camera scanning; assistant resolves by spoken name |
| Update vessel location / move barrels on mobile | Mobile | No vessel location model at all (precise positioning weak in both — moat) |
| Tag vessels / wines / blocks | Mobile | No first-class Tag model (only free-text sublotTag/blendName) |
| Dip / tank-measurement calculator | Mobile | No dip-chart model; volume tracked directly |
| Bulk import of sales / depletions via file | Sales & DTC | All sale ingest is C7 API; no CSV importer |

### 1b. 🟨 Partial (we have a surrogate; not full parity)

The full set (~60 rows) lives in the register — filter **parity.base → "⭐ Table
stakes — our remaining gaps"**. Highlights of the biggest UX/coverage deltas:

- **Drag-drop WO calendar** — we have due-date buckets, no calendar grid/reschedule (the biggest scheduling UX gap).
- **Pre-harvest booking & maturity sample sets** — Open-WO + BrixLog surrogates; no durable booking entity or season-long sample-set object.
- **Fruit cost at intake (freight, per-block rate)** — cost binds to CRUSH, not the pick; no freight line.
- **Packaging BOM → per-bottle COGS** — `BottlingCostSnapshot.costPerBottle` exists but `packagingCost = 0` today (wire PACKAGING SupplyLot depletion — both weak, moat).
- **In-bond vs tax-paid on finished goods** — rich bulk bond model; finished goods carry no bond/tax-status.
- **Custom-crush client as a billing subject** — binary ownership enum, not an entity; no charge/invoice/AR (both lack AR — moat).

### 1c. ✅ Covered (already at parity — several with a moat edge)

We fully cover ~50 table-stakes capabilities. The ones where we **out-model both
incumbents** (recorded as `modelDiff` in the register):

- **Correcting a committed operation** — event-sourced append-only reversal + typed correct/edit cores (the correction-as-event moat both make laborious).
- **Lot lineage DAG (forward + backward)** — first-class bidirectional edge table; neither exposes a clean parentage graph.
- **Cross-tax-class blend accounting (5120.17 lines 5 & 20)** — auto-computed from the blend event; both are error-prone dummy-vessel workflows.
- **Barrel depreciation** — auto fill-based SYD posted to lot cost by time×space; neither auto-computes it.
- **Disgorge / dosage** — first-class ops + derived EU sweetness class; both improvise from a generic op.
- **Amend a filed 5120.17** — immutable FILED rows + AMENDED successors + NEEDS_AMENDMENT cascade; neither keeps a filed-vs-amended trail.
- **Two-way QBO + native Commerce7** — outbox + exactly-once poster + AP Bill + reversals; InnoVint has no ERP integration.
- **Predictive ferment-health** — `detectStuck` forecasts from the Brix curve; both only threshold/inactivity alerts.

---

## 2. Skip-list — single-incumbent / niche (defer for MVP)

Safe to defer. Full list (~31) in the register (filter `overlap != both`). Themes:

- **Enterprise modules** — product allocations/supply-demand grid, equipment-utilization Gantt, MRP + PO generation (Vintrace-tier).
- **AU/NZ/Canada-specific** — grower payment installments, statutory levies, WET/NZ excise, VQA.
- **DSP regime** — distillation/redistillation/dealcoholization/RTD/hard-seltzer + DSP TTB reports (distinct 27 CFR part 19 plant; already deliberately-omitted).
- **Niche hardware/attributes** — weighbridge scale feed, in-barrel SO2 (Barrelwise), gyropalette master-data, days-on-skins metric, whole-cluster % as a first-class field (all cheaply derivable or manual for MVP).

---

## 3. Moat targets — where BOTH incumbents are weak

Our AI-native differentiation openings. Full set (~31) below; the highest-leverage:

1. **Correction-as-event ledger** — universal reversal + typed correct/edit + amend cascade, surfaced as an assistant that reverses any op by chat AND proactively says "your backdated op means the March 5120.17 needs re-filing." (Both make correction laborious and lineage-fragile.)
2. **First-class bidirectional lineage DAG** — recall/traceability answers ("where did lot X end up" / "what's in lot Y") no incumbent API can serve.
3. **Auto per-bottle COGS + fill-based barrel depreciation** — finish PACKAGING depletion, then an AI COGS explainer ("what did the 2023 Pinot cost per bottle, and why").
4. **OCR/photo lab-analysis importer** — photo/PDF/handwritten sheet → readings → lot, onto our confirm-gated `record_measurement` core. Leapfrogs InnoVint's Gemini feature. **Sharpest near-term AI win.**
5. **Custom-crush charge-from-event + invoice/AR** — turn any production event on a client lot into a priced, reviewable, API-exposed charge. The whole chain is un-extractable from both.
6. **Auto cross-tax-class blend accounting** — any assistant-created blend is compliance-correct with no phantom-vessel workflow.
7. **Predictive ferment-health nudges** — "T4 looks stuck: flat 3 days at 8 Brix."
8. **State winegrower excise returns** built on the federal engine we already own.
9. **Configurable KPI dashboard + threshold alerting + NL ad-hoc reporting** — the assistant IS the NL query layer; add saved KPI tiles + threshold/scheduled delivery.
10. **Expiry-aware materials + reorder alerting**; **unified SSO + enforced MFA + SCIM**; **self-serve lab/controller onboarding**; **automated competitor-migration wedge** (the acquisition lever — no automated migration exists in either); **robust offline-first + voice cellar-floor client**; **compose a WO conversationally on the floor** (neither can create a WO on mobile); **multi-platform two-way DTC/POS connector**.

---

## How this landed in the register

- **New `overlap` field** on every parity note (`both` | `vintrace-only` | `innovint-only` | `unknown`), set by the `ENRICHMENT` map in `scripts/ingest-parity-corpus.mjs`. 46 capabilities enriched with an exact code/corpus path + counterpart article.
- **`parity.base`** gained an `overlap_icon` formula, an **⭐ Table stakes (both incumbents)** view, and an **⭐ Table stakes — our remaining gaps** view.
- Current register state: **31 covered · 11 partial · 955 gap**, with **overlap: 38 both · 3 VT-only · 5 IV-only · 951 unknown**. The `unknown` bulk is the un-triaged corpus tail — enrich more articles in the `ENRICHMENT` map over time (the 90-capability table-stakes estimate is the analysis's dedup count; only the ~46 highest-signal ones are stamped so far).
- Guarded by `npm run verify:parity` (every `covered` claim resolves to a real file — currently green).

> [!note] Coverage honesty
> The overlap dimension is stamped on the **curated subset** we can back with a
> resolving path (same pattern as the register's existing `covered` claims), not all
> ~90 table-stakes capabilities. The 951 `unknown` notes are the honest denominator —
> raise the numerator by enriching more articles, don't hand-edit generated notes.
