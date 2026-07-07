# Vintrace → Cellarhand — Data-Migration Strategy

> **Scope.** How to migrate a winery off **Vintrace** onto **Cellarhand** using the Vintrace v7 API
> (`vintrace-api/specs/*.yaml`; per-module KB in [`INDEX.md`](./INDEX.md)) as the pull source, plus a
> CSV/report-export fallback for what the API cannot reach.
>
> **The one non-negotiable model** (from `FIX_RUNBOOK.md` MIGRATE-1 + `analysis/CELLARHAND-CURRENT-STATE.md`
> §7): **seed current balances + read-only history archive.** Exactly **one migration `SEED`** per
> lot/vessel participates in Cellarhand's volume/cost fold (cutover balances). **Legacy operational
> history is ingested ONLY into the read-only `LegacyOperation` archive and is NEVER folded.** An import
> **cannot publish** to the live tenant while unresolved reconciliation deltas exist. This is not a
> preference — replaying Vintrace ops through `runLedgerWrite` would double-count against the SEED and
> corrupt the append-only ledger. The API's coarseness (below) is *convenient*: it structurally cannot
> tempt us into a replay because it does not expose the ops to replay.

This document is honest about what the API can and cannot do. Where it says **GAP**, the API returns
nothing usable and the data must come from a **CSV / PDF report export** (§B) — never scraping, only the
winery's own authorized exports.

> [!important] Prerequisite (do this before writing the importer) — export `common-schemas`
> The eight module specs `$ref` a shared components file (`common-schemas.yaml`: `Measurement`,
> `CostBreakdown`, `CodedIdentifiableEntity`, `ExtIdentifiableEntity`, `Winery`, `PageRoot`,
> `BaseErrorRoot`, …) that was **not in the Stoplight export**. The field shapes for those in this KB
> were **reconstructed from in-file examples and are NOT authoritative.** Export `common-schemas` from
> Stoplight (same Export flow), drop it in `vintrace-api/specs/`, and re-verify every unit-tagged
> `Measurement` and `CostBreakdown` bucket, the pagination envelope, and the error root against the real
> definitions before trusting the generated client. This is migration step 0.

---

## A. CURRENT-STATE SEED — what to pull, in what order, mapped to our tables

The seed is built in dependency order so every foreign key resolves before the row that needs it. Each
step is idempotent on a stable external identifier (Vintrace `id`/`extId` → `LotIdentifier`), so a
re-pull is a no-op / update, never a duplicate.

### Step 0 — Auth + tenant handshake
- Obtain a Vintrace **API token** (Bearer). Confirm the tenant's prod base
  (`https://<host>.vintrace.net/<slug>/api/v7/<module>`). **Do all build/test against
  `sandbox.vintrace.net/vinx2demo` first** (§D).
- Pull `Winery` context (embedded on responses) to confirm you are pointed at the right cellar.
- Send a `correlation-id` on every request and log the echo — this is your import audit trail.

### Step 1 — Reference data (resolve FKs before anything references them)

| Order | Pull | Endpoint | → Our target | Notes |
|---|---|---|---|---|
| 1a | **Parties** | `GET /parties` (identity) | `Vendor` for `type=vendor`; growers/buyers/carriers **have no home model** | Full current-state party master. Keep `extId` as the join key. Growers/customers/distributors need a new Party model or role-mapping onto `Vendor` (see §B-6). |
| 1b | **Vineyards + blocks** | `GET /blocks?include=...` (harvest) | `Vineyard`, `VineyardBlock`, `Variety` | Vineyards come **nested** (no `GET /vineyards`). Map `area`/rows/spacing/clone/rootstock/variety/planted. No polygon geometry, no sub-blocks. Full re-pull + diff (no `updatedSince`). |
| 1c | **Vessels (master)** | `GET /tanks\|barrels\|barrel-groups\|tankers\|bins/{id}` (vessel) | `Vessel`, `BarrelAsset`, `VesselGroup` | **GET by integer id only — no list.** You must first **enumerate vessel ids** from another source (Step 2's `wine-batches`/`vessel-details-report` occupancy, or a vessel-list CSV export). Map `capacityL`, cooperage fields, `isActive`; **tanker/bin have no `VesselType`** (map or drop). Barrel `purchaseCost` $ is NOT in the API — needs a cost source. |
| 1d | **Materials master** | *(no read)* | `CellarMaterial` | **GAP.** `POST /receivals` is write-only; there is no stock-item master read. Material catalog must come from a CSV export (§B-2). |

### Step 2 — Lot identity + current bulk state (the core seed)

| Order | Pull | Endpoint | → Our target | Notes |
|---|---|---|---|---|
| 2a | **Wine-batch identity** | `GET /wine-batches?include=vessels` (operation) | `Lot` (`code`←batchCode, `displayName`, `vintageYear`←productionYear, origin, ownership); `LotIdentifier` (`source-system-id`, `current-code`) | Adopt Vintrace batch codes **verbatim** (NAMING-1). No lineage, no AF/MLF state, no per-lot form here. |
| 2b | **Per-vessel occupancy + composition** | `GET /vessel-details-report?asAtDate=<cutover>` (report) | `VesselLot` (`volumeL`), blend composition, `Vessel` roster | The authoritative **cutover balance** read: volume/ullage per vessel as-of the cutover date. A batch across N vessels = N rows; an emptied/bottled batch is **invisible** here (catch it via 2a + finished-goods CSV §B-3). |
| 2c | **Tax-class + bond posture** | same `vessel-details-report` `ttbDetails`; `GET /bulk-intakes` `cost.ttbDetails` (operation) | tax-class inputs on `Lot` (`productType`/`carbonation`/`taxAbvOverride`); `Bond` line-level (Phase 2) | Raw material for `deriveTaxClass()` + bond placement. **Not** filed reports. Vessel `dspAccount` is mostly informational for wine. |
| 2d | **Rolled-up cost basis** | `vessel-details-report` `CostBreakdown` (report); cross-check `GET /business-unit-transactions` (costs) | `LotCostState.totalCost` + `CostComponent` buckets | Report gives a per-vessel **snapshot** (total + fruit/overhead/storage/additive/bulk/packaging/operation/freight/other). Costs API gives the **delta stream** to reconcile against (§C). Vintrace `storage`/`freight`/`other` buckets are **lossy** into our enum → fold to `BARREL`/`VARIANCE`/note. |
| 2e | **Sparkling state** | `vessel-details-report` `sparklingInfo.state` (report) | `BottledLotState`, `BottleStage` | Snapshot position only (no tirage/disgorge/dosage dates or g/L). |

### Step 3 — Emit the seed
- For each `(vessel, lot)` current position, emit **exactly one migration `SEED`** op (extend the D11
  `migrate-legacy-lots.ts` pattern to accept the external pull) that hard-sets current volume, cost
  basis, tax class, and **line-level bond** at the cutover date. This is the **only** Vintrace-sourced
  data that enters the fold (MIGRATE-1).
- Attach chemistry where a CSV export supplies it (§B-4) → `AnalysisReading` keyed on lot/vessel code.
- Everything stays **DRAFT** until reconciliation sign-off (§C).

### Step 4 — Legacy history → read-only archive (NEVER folded)
- Ingest whatever operation fragments the API *does* expose — `GET /shipments`,
  `GET /barrel-treatments`, `GET /bulk-intakes`, `GET /tirage/{id}` (operation), `GET /dispatches`
  (stock), and `GET /business-unit-transactions` cost movements (costs) — into the **`LegacyOperation`**
  archive as **structured, action-ID-keyed rows** (Decision 4: typed columns, not JSON blobs).
- The lot timeline **stitches** these visually: *"Pre-Cellarhand history → migration cutover → active
  ledger."* Archived rows never enter `foldLines()` / `VesselLot` / the cost DAG.

---

## B. GAPS the API can't fill — the CSV / report-export plan

For each gap the API leaves, the fallback is a **customer-authorized CSV or PDF report export** from
their Vintrace instance (Vintrace's report engine can emit these even where the API cannot). Each is
labeled **inferred/partial** on import and **never silent-dropped** (ux-principle 10).

| # | Gap | Why the API can't | Export-export plan | → Our target |
|---|---|---|---|---|
| **B-1** | **Operation history** (racks, additions, finings, filtrations, transfers, crush/press, blends) | Only shipments/barrel-treatments/bulk-intakes/tirage are listable; most op types are write-only or have no read schema. `report` is a snapshot with **no event feed**. | Vintrace **Operation/Activity CSV export** (per-op rows with dates + action id). Import to **`LegacyOperation` archive only** (MIGRATE-1) — reconcile against, never fold. | `LegacyOperation` (display-only) |
| **B-2** | **Materials catalog + supply lots** (kind, category, stock unit, on-hand, weighted-avg cost) | `POST /receivals` is write-only; no stock-item master, no receival readback, no on-hand. | Vintrace **stock-item / SUPPLY CSV export**; on-hand from a stock-level report. | `CellarMaterial` + opening `SupplyLot` (qty/unit/unitCost/lotCode) |
| **B-3** | **Finished-goods / cased inventory on-hand** (per-SKU counts, locations) | No stock-level read anywhere; report is bulk-wine only; `wine-batches` occupancy is bulk. | Vintrace **case-goods / finished-stock CSV** → reuse our existing narrow `parseInventoryCsv` (`Item,Vintage,Category,Location,Quantity`) `RECEIVE` path. | `WineSku`, `BottledInventory`, `FinishedGoodInventory`, `StockMovement(RECEIVE)` |
| **B-4** | **Chemistry / analysis history** (pH/TA/SO2/…, per lot over time) | Maturity-samples are create-only; `report` shows no analyses; ops don't expose per-analysis reads. | Vintrace **analysis/lab CSV export** (keyed on lot/vessel code; **chunk by ≤31-day window** if the export limits range). | `AnalysisPanel`, `AnalysisReading` (seed-time snapshot) |
| **B-5** | **Actual harvest picks** (delivered weight, pick date, brix/pH/TA at pick) | harvest API has only pre-harvest **forecasts** + create-only maturity-samples; no pick weigh-in endpoint. | Vintrace **fruit-intake / weighbridge CSV export**. | `HarvestRecord`, `HarvestPick` (or archive as inferred if pre-cutover only) |
| **B-6** | **Filed TTB / compliance reports** (5120.17 / 5000.24 periods, carry-forward, filing status) | API exposes only the **live per-vessel tax/bond posture**, never a filed report or period. | Vintrace **filed-report PDF/CSV export** → **archive only** (do **not** regenerate history as filed Cellarhand periods). Cellarhand recomputes forward periods from the cutover seed. | `LegacyOperation`/archive; forward periods via our `ComplianceReport` engine post-cutover |
| **B-7** | **Lineage / parentage** (blend/split DAG) | `wine-batches` has no parentage; report `composition[].block` is a label; costs/harvest give apportionment only. | Vintrace **Lot-Components / composition CSV** → **inferred/partial** lineage snapshot (label it; **never fabricate** a clean DAG — D11). | `LotLineage` (inferred) + `LotHarvestSource` apportionment where clean |
| **B-8** | **Grower/buyer party linkage to fruit** | identity gives parties, but our harvest chain has no grower FK. | Capture grower `extId` on the block/intake CSV; hold until a Party model exists (schema addition, tracked). | (schema gap — record `extId`, don't drop) |
| **B-9** | **Sales / DTC orders** | No sales surface in the API (only bulk **dispatch** shipments). | Out of Vintrace scope — DTC comes through our **Commerce7** path, not migration. | `Commerce7Order` / `SalesExportEvent` (separate integration) |

**Unit normalization applies to every step** (D8): Vintrace weights/volumes are unit-tagged
(tn/lb/gal_US/L, °Brix); convert to canonical **liters / kg** on import. Timestamps are epoch ms.

---

## C. RECONCILIATION — the onboarding trust moment

The winemaker will not trust a migrated book until the numbers **tie back to Vintrace's own reports**.
The import stays **DRAFT** and **publish is blocked** until an operator signs off a **reconciliation
pack**. Each line reconciles a Cellarhand-computed total against a Vintrace-sourced total; a mismatch
must be resolved or explicitly accepted as a **named exception**.

| Reconciliation line | Cellarhand side (post-seed) | Vintrace side (source of truth) | How to tie |
|---|---|---|---|
| **By-vessel bulk volume** | Σ `VesselLot.volumeL` per vessel | `GET /vessel-details-report?asAtDate=<cutover>` volume/ullage | Per-vessel equality within a dust tolerance (mirror the existing 0.01 L drift abort in `migrate-legacy-lots.ts`). |
| **By-lot volume** | Σ `VesselLot.volumeL` per lot | `GET /wine-batches` occupancy amount | Batch-across-N-vessels handled by summing report rows. |
| **Cost by lot** | `LotCostState.totalCost` + buckets | `vessel-details-report` `CostBreakdown`, cross-checked vs **Σ `business-unit-transactions` deltas from inception** | The Costs API is a delta stream with **no as-of balance** — sum every historical movement to reconstruct the balance, then compare. Flag the **lossy buckets** (storage/freight/other) as named exceptions. |
| **Finished-goods counts** | `FinishedGoodInventory` per SKU/location | Vintrace case-goods CSV (§B-3) | Count equality per SKU. |
| **TTB period posture** | Cellarhand cutover on-hand-by-tax-class (derived) | `vessel-details-report` `ttbDetails` aggregated by tax class | Posture match, **not** filed-report match (we don't reproduce filed periods). |
| **Chemistry counts** | `AnalysisReading` rows imported | analysis CSV row count (§B-4) | Row-count + spot-value check. |
| **Unmapped / inferred** | coverage-gap report | — | Every unmapped column, inferred lineage edge, and rejected row is **listed with a reason** and must be acknowledged. |

Sign-off is **admin/owner-gated**. Only after sign-off does the DRAFT publish to the live tenant.

---

## D. SANDBOX-FIRST

**Build and validate the entire importer against `https://sandbox.vintrace.net/vinx2demo/` before any
production instance is touched.** Rationale and rules:

- The sandbox uses the **same v7 shapes** as prod (only the host/slug differ), so the client, mappers,
  and reconciliation logic are identical — only the base URL and token change.
- Discover the API's real behaviors safely: the **no-list / GET-by-int-id** constraints on
  `account` and `vessel`, the **required `startDate`/`endDate`** on costs, the **`results` vs `result`**
  wrapper inconsistency in the costs spec, page-envelope pagination, and the missing shared-schema field
  shapes — all get pinned against the sandbox, not a customer's live cellar.
- Confirm token scope + rate behavior against the sandbox; a full-history costs pull (delta stream from
  inception) is large — validate paging + backoff here first.
- In **our** environment, all seeding/verification runs inside `runAsTenant("org_demo_winery", …)`
  (never Bhutan Wine Co.); the sandbox is the **Vintrace** side, Demo Winery is the **Cellarhand** side.
- Only after `verify:migration` is green against the sandbox + Demo Winery does a real prod pull begin —
  and even then it lands as a DRAFT gated on reconciliation sign-off (§C).

---

## E. Ordered migration runbook checklist

1. **Auth / token** — obtain Vintrace Bearer token; confirm prod base + `Winery` context; wire
   `correlation-id` logging. **Point at sandbox first (§D).**
2. **Reference data** — pull in FK order: (a) `GET /parties` → `Vendor`; (b) `GET /blocks` →
   `Vineyard`/`VineyardBlock`; (c) enumerate + `GET` each vessel → `Vessel`/`BarrelAsset`; (d) materials
   catalog from CSV (§B-2). Adopt Vintrace codes/`extId` verbatim into `LotIdentifier`.
3. **Current balances (the seed)** — `GET /wine-batches` (identity) + `GET /vessel-details-report?asAtDate=<cutover>`
   (volume/composition/cost/ttbDetails/sparkling); normalize units; emit **one migration `SEED` per
   (vessel, lot)** with volume + cost basis + tax class + line-level bond. Attach chemistry (§B-4). Keep
   everything **DRAFT**.
4. **Reconcile** — build the reconciliation pack (§C): by-vessel volume, by-lot volume, cost-by-lot
   (Cellarhand vs Σ Vintrace deltas), finished-goods counts, TTB posture, chemistry counts, unmapped /
   inferred list. Resolve or name-accept every delta. **Publish is blocked until admin/owner sign-off.**
5. **History archive** — ingest legacy operation fragments (API §Step 4) + CSV history exports
   (§B-1/B-6/B-7) into the **structured, action-ID-keyed `LegacyOperation`** archive; stitch onto the lot
   timeline. **Never folded, never fabricated.**
6. **Publish** — on sign-off, publish the DRAFT to the live tenant. `verify:migration`, `verify:cost`,
   `verify:ttb`, `verify:tenant-isolation`, and the full suite must be green.
