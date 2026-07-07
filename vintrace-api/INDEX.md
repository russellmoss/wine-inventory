# Vintrace v7 API — Knowledge-Base Index

OpenAPI 3.0.3 specs live in `vintrace-api/specs/*.yaml`; each has been read into a per-module KB
page (below). Every module shares the same envelope: **Bearer-token auth**, an optional
`correlation-id` request header (echoed back), a `default` error root
(`{ errors: [{ code, message, detail }] }`), and page-wrapped list responses
(`totalResults`/`offset`/`limit`/`first`/`previous`/`next`/`last`/`results`).

> **Server bases.** Prod is per-tenant, e.g. `https://oz50.vintrace.net/vinx2/api/v7/<module>`.
> Sandbox is `https://sandbox.vintrace.net/vinx2demo/api/v7/<module>` — **build and test the importer
> here first** (see [`MIGRATION-STRATEGY.md`](./MIGRATION-STRATEGY.md) §D).

> **Shared-schema caveat.** `common-schemas.yaml` (`Measurement`, `CostBreakdown`,
> `ExtIdentifiableEntity`, `CodedIdentifiableEntity`, `Winery`, `PageRoot`, `BaseErrorRoot`, …) is
> `$ref`-ed by several specs but is **not present** in `vintrace-api/specs/`. Those field shapes were
> reconstructed from in-file examples and must be confirmed against the real shared components file
> before the client is trusted.

## Per-module KB pages

| Module | KB page | Endpoints | One-line summary |
|---|---|---|---|
| **account** | [`account.md`](./account.md) | 2 | Purchase-orders only — `POST /purchase-orders` (upsert) + `GET /purchase-orders/{id}` (by internal int id, **no list**). Write-first; vendor/material/cost ride on the PO. No sales side. |
| **costs** | [`costs.md`](./costs.md) | 1 | `GET /business-unit-transactions` — a dated, paginated **delta stream** of bulk-wine cost movements (signed volume + decomposed cost buckets). Not a per-batch balance; batches/vessels are string refs. |
| **harvest** | [`harvest.md`](./harvest.md) | 7 | Vineyards/blocks CRUD + `GET /blocks` (full pull) + create-only assessments/maturity-samples. **No actual pick weigh-in, no GET vineyards/maturity-samples.** |
| **identity** | [`identity.md`](./identity.md) | 2 | Party master — `GET /parties` (full current-state pull of every counterparty type) + `POST /parties` upsert. The only place a real party list exists. |
| **operation** | [`operation.md`](./operation.md) | 16 | Wine-batch master (`GET /wine-batches`) + work-order index + a few directly-listable ops (shipments, barrel-treatments, bulk-intakes, tirage). Most op types are **write-only or read-schema-undefined**. |
| **report** | [`report.md`](./report.md) | 1 | `GET /vessel-details-report` — point-in-time snapshot **keyed by vessel** (`asAtDate`): batch identity, volume, cost breakdown, ttbDetails, allocations, sparkling state. **No event/history feed.** |
| **stock** | [`stock.md`](./stock.md) | 2 | `POST /receivals` (write dry-goods intake) + `GET /dispatches` (outbound shipment history). **No on-hand levels, no stock-item master, no receival readback.** |
| **vessel** | [`vessel.md`](./vessel.md) | 6 | Rich vessel **master data** by kind (`GET /tanks|barrels|barrel-groups|tankers|bins/{id}`) + `POST /tanks`. **GET by integer id only — no list/search.** No wine content. |

## Master coverage table

Rows = the migration entities we care about; a cell verdict is the **best** coverage any module offers.
Legend: **covered** = a clean current-state pull exists; **partial** = usable but thin / write-only /
delta-only / ref-only; **gap** = not exposed by any module (must come from CSV export — see
[`MIGRATION-STRATEGY.md`](./MIGRATION-STRATEGY.md) §B).

| Migration entity | Verdict | Best endpoint(s) | Which module | Our target model |
|---|---|---|---|---|
| **Vessels (tanks/barrels)** | partial | `GET /tanks\|barrels\|barrel-groups\|tankers\|bins/{id}` (master); `GET /vessel-details-report` (roster of *occupied* vessels) | vessel; report | `Vessel`, `BarrelAsset`, `VesselGroup`/`VesselGroupMember` |
| **Lots (wine batches)** | partial | `GET /wine-batches` (identity + occupancy); `GET /vessel-details-report` (composition per vessel) | operation; report | `Lot`, `VesselLot`, `LotIdentifier` |
| **Inventory — bulk volume** | partial | `GET /vessel-details-report` (volume/ullage as-of date); `GET /wine-batches` (per-vessel amount) | report; operation | `VesselLot` balances |
| **Inventory — finished goods / on-hand** | gap | — (only outbound `GET /dispatches`) | (none) | `StockMovement`, `BottledInventory`, `FinishedGoodInventory` |
| **Materials / additions master** | partial | `POST /receivals` (write-only intake shape) | stock | `CellarMaterial`, `SupplyLot` |
| **Operation history (racks/additions/transfers ledger)** | gap | `GET /shipments`, `/barrel-treatments`, `/bulk-intakes`, `/tirage/{id}`, `GET /dispatches` (fragments only) | operation; stock | `LotOperation`, `LotOperationLine`, `VesselTransfer`, `LotTreatment` — **archive only, never folded** |
| **Cost / COGS** | partial | `GET /business-unit-transactions` (delta stream); `GET /vessel-details-report` (rolled-up per-vessel snapshot); `GET /shipments?include=cost` | costs; report; operation | `LotCostState`, `CostLine`, `SupplyConsumption`, `BottlingCostSnapshot` |
| **Parties (growers/buyers/vendors/carriers)** | partial | `GET /parties` (full master); elsewhere ref-only | identity | `Vendor` only (no unified party/grower/buyer model) |
| **Blocks / vineyards** | partial | `GET /blocks` (full pull, vineyards nested) | harvest | `Vineyard`, `VineyardBlock`, `Variety` |
| **Harvest picks (actual weigh-in)** | gap | — (only pre-harvest forecasts + create-only samples) | (none) | `HarvestPick`, `HarvestRecord`, `BrixLog` |
| **Compliance / TTB (filed reports)** | gap | — (only per-vessel `ttbDetails` posture on `GET /vessel-details-report`) | report (posture); operation (intake ttbDetails) | `ComplianceReport`, `ComplianceProfile` |
| **Tax-class / bond posture (raw inputs)** | partial | `GET /vessel-details-report` (`ttbDetails`); `POST /bulk-intakes` (`cost.ttbDetails`); vessel `dspAccount` | report; operation; vessel | tax-class inputs on `Lot`; `Bond` (Phase 2) |
| **Purchase orders (buy)** | partial | `POST /purchase-orders` + `GET /purchase-orders/{id}` (by int id, no list) | account | `Vendor`, `ApExportEvent` (no PO model) |
| **Sales / DTC (sell)** | gap | — (only bulk **dispatch** shipments, not DTC orders) | (none; stock/operation dispatch = bulk out) | `Commerce7Order`, `SalesExportEvent`, `StockMovement(SALE)` |
| **Sparkling state** | partial | `GET /vessel-details-report` (`sparklingInfo.state`) | report | `BottledLotState`, `BottleStage` |

### Headline

**The Vintrace v7 API is a coarse, current-state / write-first surface.** It gives a usable pull of
**parties, vineyard blocks, vessel master data, and current bulk-wine identity + volume + cost + tax
posture per vessel** — enough to *seed cutover balances*. It does **not** expose the three things a
faithful replay would need: **operation history, filed TTB/compliance reports, or finished-goods
on-hand**. That is exactly why our model is **"seed current balances + read-only history archive,"**
never replay legacy history through the active ledger fold.
