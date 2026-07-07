# Vintrace v7 — Stock API

Reference for migration into Cellarhand. Source spec: `vintrace-api/specs/stock-api-v7.yaml` (OpenAPI 3.0.3).

- **Server base URL:** `https://oz50.vintrace.net/vinx2/api/v7/stock` (production), `https://sandbox.vintrace.net/vinx2demo/api/v7/stock` (sandbox). Path prefix `/api/v7/stock`.
- **Auth:** HTTP Bearer token (`Authorization: Bearer <token>`). Tokens managed per the Vintrace support article.
- **Correlation:** optional `correlation-id` request header (UUID); echoed in the `correlation-id` response header, plus a `Location` header on create (`/stock/receivals/1234`).
- **Scope:** this module is TINY — exactly **two endpoints**: a WRITE to receive stock into the cellar (`POST /receivals`) and a READ of outbound shipments (`GET /dispatches`). It is a goods-movement I/O surface (dry-goods / stock-item receipt in, dispatch out). It is NOT a batch/vessel/inventory-balance catalog: there is no "list stock items", no current on-hand levels, no stock-item master, and no GET for an individual receival. `/dispatches` is read-only (no create). Shared shapes such as `Measurement`, `IdentifiableEntity`, `ExtIdentifiableEntity`, `Winery`, and `PageRoot` are vendored in `vintrace-api/specs/common-schemas.yaml` from the public Stoplight v7 bundle.

---

## Endpoints

### POST /receivals — receive stock into the system

Records a receive-stock action: dry goods / stock items arriving against a supplier + carrier + (optionally) a purchase order, routed into storage areas/bins. Returns the persisted action (with generated ids) in `data`.

**Request** `ReceiveStockActionSchema` (required: `vendor`, `carrier`, `receiveStockActionDetails` per the schema's `required` block — note the example instead uses `supplier` + `stockDetails`, so field naming is loose between the schema and its example).

Key request fields (what a migration engineer needs):
- `occurredTime` (int64 epoch ms) — when the receival happened; defaults to today if omitted.
- `operator` / `receivedBy` (ExtIdentifiableEntity, by `extId`) — who performed / received.
- `supplier` (ExtIdentifiableEntity) — the vendor supplying the stock.
- `carrier` (ExtIdentifiableEntity) — the freight carrier.
- `purchaseOrder` / `purchaseOrderName` / `purchaseOrderId` — the PO this receipt fulfills.
- `purchaseOrderFulfillmentState` — `NOT_FULFILLED | PART_FULFILLED | FULFILLED | OVER_FULFILLED`.
- `orderNo` / `receiptNo` / `connote` / `rego` / `driversName` — order + shipping/logistics references (truck rego plate, consignment note, driver).
- `freightCost` (double) — freight cost for the receival.
- `stockDetails[]` (`stockDetailBody`) — the line items being received. Each detail:
  - `stockItemCode` (string) — the stock item / SKU code received.
  - `receivedAmount` (Measurement: `{ value, unit }`, e.g. `600 gal`) — quantity in stock units.
  - `price` (double) + `priceType` (`PER_UNIT | TOTAL`) — line cost.
  - `vendorCode` — vendor's code for the item.
  - `lotName` — the stock-item batch / lot name (e.g. `BID-001`) — supplier lot reference.
  - `manufacturedDate` / `expiryDate` (int64 epoch ms) — shelf-life dates.
  - `routeDetails[]` → `routeStockItem` — where the received qty is put away: `{ quantity, storageArea (IdentifiableEntity by id), bin (string) }`.

**Response** `ReceiveStockActionResponse` → `data` = the same `ReceiveStockActionSchema`, now with generated `id`, resolved `operator/supplier/carrier/receivedBy` (id + name + extId), `purchaseOrder` (id + name), and `receiptNo`. `200` also returns `Location: /stock/receivals/{id}`.

### GET /dispatches — list outbound stock dispatches (shipments)

Returns ALL stock-dispatch actions, paginated. Read-only current-state + history of outbound shipments (export/transfer of finished stock out of a winery).

**Query params:** `limit` (1–200, default 10), `offset` (≥0, default 0). Standard paged envelope.

**Response** `GetStockDispatchesSuccessResponse` — a paged root (`totalResults`, `offset`, `limit`, `first`/`previous`/`next`/`last` link cursors) wrapping `results[]` of `StockDispatchData`.

Key `StockDispatchData` fields (extends `ScheduleOperationDetails`):
- `id` (int, nullable if scheduled-not-yet-completed), `workOrderNumber`, `jobNumber` — provenance in a scheduled work order.
- `occurredTime` / `modifiedTime` (int64 epoch ms; `occurredTime` may be a future date if scheduled; `modifiedTime` null if not yet occurred).
- `operator` (ExtIdentifiableEntity) + `reversed` (bool) — actor + reversal flag.
- `source` (Winery) — the winery dispatching from.
- `destination` (ExtIdentifiableEntity) — who it went to (customer/company).
- `dispatchType` (IdentifiableEntity, e.g. `Export`).
- `stockItems[]` (`DispatchedStockItemData`): `item` (CodedIdentifiableEntity: id/name/code, e.g. `2019-0012`), `quantity` (Measurement, e.g. `1 x12` — a case pack), `routeDetails[].stockRoute` (`RouteStockItem`: `quantity`, `storageArea`, `bin`) — where it was pulled from.
- `shippingInfo` (`StockDispatchShippingInfoData`): `carrier`, `vendor`, `sentBy` (ExtIdentifiableEntity); `containerTypes`, `reference`, `port`, `packingConfig`, `orderNo`, `truckNo`, `containerNo`, `sealNo`, `driverName`; `freightCode` / `scale` (IdentifiableEntity); `totalWeight` (Measurement); `shippingRemarks`.

**Errors:** `default` → `BaseErrorRoot` (`errors[]` of `{ code, message, detail }`) — covers 400 bad request, 401 not-authorized, 403 forbidden, 404 not-found.

---

## Key schemas

- **`stockDetailBody`** — one received line: `stockItemCode`, `receivedAmount` (Measurement), `price` + `priceType`, `vendorCode`, `lotName` (supplier batch), `manufacturedDate`/`expiryDate`, `routeDetails[]`. This is the closest thing the module has to an inbound stock/lot row.
- **`RouteStockItem`** — put-away/pick location: `{ quantity, storageArea (id), bin }`. Used for both receival routing and dispatch source routing.
- **`ReceiveStockActionSchema`** — full receival action: header (supplier/carrier/operator/receivedBy/PO/freight) + `stockDetails[]`.
- **`StockDispatchData`** — full outbound shipment: header (`source` winery, `destination`, `dispatchType`, operator, reversed) + `stockItems[]` + `shippingInfo`.
- **`ScheduleOperationDetails`** (base for dispatch) — `id`, `workOrderNumber`, `jobNumber`, `occurredTime`, `modifiedTime`, `operator`, `reversed`. Ties a stock op back to a work order.
- **`StockDispatchShippingInfoData`** — freight/logistics detail block for a dispatch (carrier, vendor, container/port/seal/truck, weight, remarks).
- **Measurement** (common) — `{ value: number, unit: string }`; the bundled spec does not publish a closed unit enum. **IdentifiableEntity** — `{ id, name }`. **ExtIdentifiableEntity** — `{ id, name, extId }` (extId = external system key, the migration join point). **CodedIdentifiableEntity** — `{ id, name, code }`. **Winery** — a winery/business-unit reference.

---

## Migration note

For a CURRENT-STATE migration, this module contributes **inbound dry-goods receipts** (material/supply intake, with supplier + PO + cost + lot + expiry) and **outbound finished-stock shipments** (dispatch history). It exposes NO current on-hand balances, NO stock-item master list, NO wine-batch/vessel data, and NO way to enumerate past receivals (only `POST` to create, no `GET`). Historical inbound cost/lot detail is only knowable if it was captured on the original receivals — and those are not readable back through this API. Bulk-wine, vessels, cost ledger, compliance, and harvest all live in the other v7 modules.
