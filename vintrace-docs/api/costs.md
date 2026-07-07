# Vintrace v7 — Costs API

Reference for migration into Cellarhand. Source spec: `vintrace-docs/api/specs/costs-api-v7.yaml` (OpenAPI 3.0.3).

- **Server base URL:** `https://oz50.vintrace.net/vinx2/api/v7/costs` (production), `https://sandbox.vintrace.net/vinx2demo/api/v7/costs` (sandbox). Path prefix `/api/v7/costs`.
- **Auth:** HTTP Bearer token (`Authorization: Bearer <token>`). Tokens managed per Vintrace support article.
- **Correlation:** optional `correlation-id` request header (UUID); echoed back in the `correlation-id` response header.
- **Scope:** this module is a **single read endpoint** — a dated ledger of **bulk-wine cost movements** (a cost general-ledger feed). It is NOT a batch/vessel/inventory catalog. It exposes deltas (volume + cost) per posted event, not current-state balances.

---

## Endpoints

### GET /business-unit-transactions — bulk-wine cost movements between two dates

Returns a paginated, time-windowed stream of cost movements. Each row is one posted cost event (`postedId`) triggered by a winemaking/cellar/sales activity (`activityId`). Both an OUT leg and an IN leg are emitted for transfers (see example: a single inter-winery transfer → two rows with equal/opposite `volumeDelta` + `costDelta`).

**Query params**
- `startDate` (int64 epoch ms, **required**) — window start (transaction effective date).
- `endDate` (int64 epoch ms, **required**) — window end.
- `limit` (int ≥1) / `offset` (int ≥0) — pagination.
- `businessUnit` (string, e.g. `US57`) — filter to one winery's business unit.
- `wineryName` (string) — filter by winery name.
- `wineryId` (int) — filter by winery id.

**Response** `GetBusinessUnitTransactionsResponse` — a paged root (`totalResults`, `offset`, `limit`, `first`/`previous`/`next`/`last` link cursors) wrapping `results[]` of `TransactionDetails`. The inline example still uses singular `result`; the recovered shared `PageRoot` schema uses `results`.

**Key `TransactionDetails` fields (what a migration engineer needs)**
- `activityId` (string, `XX:nnnnnnnn`) — the source activity that initiated the cost movement (e.g. `OP:29086`).
- `postedId` (int) — unique internal id of *this* cost movement (the row's PK).
- `resultOfCorrection` (bool) — true if this movement came from a later correction, not the original activity.
- `activityType` (string) — human label of the triggering activity (e.g. `Movement out (Inter-winery)`, `Movement in (Inter-winery)`).
- `activitySummary` (string) — human sentence describing the activity.
- `activityDate` / `postedDate` (int64 epoch ms) — effective date vs. posting date.
- `primaryCostTarget` / `secondaryCostTarget` (string) — human code/name of the batch/item the cost acted on.
- `wineBatch` (string) — the wine batch involved (a code/name, NOT an id).
- `vessel` (string) — the vessel code involved.
- `location` (string) — winery building within the primary winery.
- `primaryWinery` / `secondaryWinery` / `otherWinery` (`Winery`: `{ id, name, businessUnit }`).
- `productCategory` / `program` (`CodedIdentifiableEntity`: `{ id, name, code }`) — batch's product category + assigned program.
- `volumeDelta` (`Measurement`: `{ unit, value }`) — signed volume change (e.g. `gal`, `-15`).
- `costDelta` (`CostBreakdown`) — signed cost change in dollars, decomposed: `total`, `average`, `fruit`, `overhead`, `storage`, `additive`, `bulk`, `packaging`, `operation`, `freight`, `other`. **This is the money model.**
- `customer` / `vendor` (`ExtIdentifiableEntity`) — bulk-wine buyer/seller if the movement is a bulk sale/purchase.
- `lossReason` (`IdentifiableEntity`) — set on write-off/loss movements.
- `allocationDescription` (string) + `impactedAllocations[]` (`{ productName, vintage, itemCode, name }`) — the finished-product allocations this movement touched.
- `references` — `{ bulkSalesOrder, bulkPurchaseOrder, externalWorkOrder, workOrder, jobNumber, billOfLadingNumber }` — cross-refs to the order/work-order/BOL that drove the movement.

**Errors:** `default` → `BaseErrorRoot` (`errors[]` of `{ code, message, detail }`) with 400 / 401 / 403 examples.

---

## Key schemas

Shared models are declared in `vintrace-docs/api/specs/common-schemas.yaml`, recovered from the public Stoplight v7 optimized bundle.

| Schema | Shape / fields | Notes |
| --- | --- | --- |
| `TransactionDetails` | see field list above | One posted cost movement (row of `results[]`). |
| `CostBreakdown` (`costDelta`) | `total, average, fruit, overhead, storage, additive, bulk, packaging, operation, freight, other` (all numeric, signed) | Vintrace's cost-component taxonomy. Maps roughly to our `CostComponent` enum — see mapping below. |
| `Measurement` (`volumeDelta`) | `{ unit, value }` | Unit is a free string in the bundled OpenAPI, not a closed enum; value is signed. |
| `Winery` (`primaryWinery` …) | `{ id, name, businessUnit }` | A winery = a costing "business unit". Multi-winery within one Vintrace org. |
| `CodedIdentifiableEntity` (`productCategory`, `program`) | `{ id, name, code }` | Product-category + program dimensions on a batch. |
| `ExtIdentifiableEntity` (`customer`, `vendor`) | external-id-bearing party | Bulk trade counterparties. |
| `IdentifiableEntity` (`lossReason`) | `{ id, name }` | Loss/write-off reason code. |
| `impactedAllocations[]` | `{ productName, vintage, itemCode, name }` | Finished-product allocation refs (item code = vintage+product). |
| `references` | `{ bulkSalesOrder, bulkPurchaseOrder, externalWorkOrder, workOrder, jobNumber, billOfLadingNumber }` | Source-document cross-refs. |
| `PageRoot` | `totalResults, offset, limit, first, previous, next, last, results[]` | Standard Vintrace pagination envelope. |
| `BaseErrorRoot` | `errors[]` of `{ code, message, detail }` | Error envelope. |

### Notable models referenced but NOT in this API
The task mentions WineBatch / Vessel / FruitIntake as "key schemas" — **this Costs API does not define them as objects.** It refers to a wine batch, vessel, and product only by *string code/name* (`wineBatch`, `vessel`, `primaryCostTarget`). The structured `WineBatch` / `Vessel` / `FruitIntake` entities live in the sibling specs (`operation-api-v7.yaml`, `vessel-api-v7.yaml`, `harvest-api-v7.yaml`, `stock-api-v7.yaml`) — the Costs API is purely the cost-delta ledger over them.

---

## Migration mapping (Costs module → Cellarhand)

Our side, from `prisma/schema.prisma` + `src/lib/cost/*` + `src/lib/ledger/*`. The Costs API is a **derived cost-movement ledger**; on our side the closest analogues are the append-only cost artifacts (`CostLine`, `SupplyConsumption`, `OperationCostTransfer`, `CostExportEvent`) rolled up per `LotOperation`, plus `LotCostState` for cached balances.

`CostBreakdown` → our `CostComponent` enum: `fruit`→`FRUIT`, `additive`→`MATERIAL`, `packaging`→`PACKAGING`, `overhead`→`OVERHEAD`, `operation`→`LABOR`/`OVERHEAD` (op labor), `bulk`→bulk-wine inherited cost (our `OperationCostTransfer`), `storage`→`BARREL`/storage (our `BarrelFill`/`BarrelAsset`), `freight`/`other`→no direct component (we have `VARIANCE` + note only). We have no first-class `storage`/`freight`/`other` cost buckets.
