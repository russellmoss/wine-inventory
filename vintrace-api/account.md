# Vintrace v7 — Account API

OpenAPI 3.0.3. Source: `vintrace-api/specs/account-api-v7.yaml`.

**Server base URL** (path-versioned, per-tenant slug in the path):
- Production: `https://oz50.vintrace.net/vinx2/api/v7/account`
- Sandbox: `https://sandbox.vintrace.net/vinx2demo/api/v7/account`

**Auth:** `bearerAuth` (HTTP bearer token; API token minted in Vintrace — see their support docs).

**Scope of this module:** the "account" API is **purchase-orders only**. It is the *procurement / accounts-payable* surface (POs to vendors, with GENERAL / ADHOC / WINE_BATCH / STOCK line types). It does NOT expose wine batches, vessels, operations, inventory levels, compliance, or sales — those live in the sibling specs (`vessel-`, `operation-`, `stock-`, `harvest-`, `costs-`, `report-`, `identity-api-v7.yaml`). Every entity mapping below is judged against *this* module only.

Common header on every response: `correlation-id` (uuid). Optional request header `correlation-id`. Errors use a shared `BaseErrorRoot` (`{ errors: [{ code, message, detail }] }`) with 400/401/403/404/409 examples.

---

## Endpoints

### POST /purchase-orders
Create **or update** (upsert) a purchase order with its lines.

- **Upsert key:** `name` (unique) — typically the PO number. If a PO with that `name` exists, the body **overwrites** the existing values.
- **Request body** (`PurchaseOrder`): `name` (req, unique), `vendor` (req; `ExtIdentifiableEntity` — matched by `extId` or `name`), `vendorReference`, `deliverBy` (epoch ms; defaults to now), `state` (`NEW`|`APPROVED`), `fulfillment` (`NOT_FULFILLED`|`PART_FULFILLED`|`FULFILLED`|`OVER_FULFILLED`), `winery`, `taxPolicy` (`TAX_INCLUSIVE`|`TAX_EXCLUSIVE`|`NO_TAX`), `freightCost`, `notes`, `inactive`, `lines[]`.
- **Line (`PurchaseOrderLine`):** `type` (`GENERAL`|`ADHOC`|`WINE_BATCH`|`STOCK`), `lineNumber` (external line id), `itemCode` (looks up the Vintrace entity per line type), `vendorCode`, `description`, `quantityOrdered` (`Measurement` = `{unit, value}`), `unitPrice`, `totalPrice`, `quantityFulfilled` (writable for GENERAL/ADHOC; read-only + op-driven for the others), `taxable`.
- **Response** (`PurchaseOrderSuccessResponse`): `{ data: PurchaseOrder }` with server-assigned `id` and resolved `vendor`/`winery` ids.

### GET /purchase-orders/{id}
Fetch one PO by its Vintrace-internal integer `id` (not `name`).

- **Path param:** `id` (integer, Vintrace-generated).
- **Response:** `{ data: PurchaseOrder }` — same shape as above, including `lines[]`.

> **Note:** there is **no list/search endpoint** and **no query params** (the spec defines `limit`/`offset` pagination params but no path uses them). GET is by internal id only — you cannot page all POs or filter by date/vendor/state. This is a hard limit for a bulk historical pull.

---

## Key schemas

- **PurchaseOrder** — `id` (int, Vintrace), `name` (unique PO number), `vendor`, `vendorReference`, `deliverBy` (epoch ms), `state`, `fulfillment`, `winery`, `taxPolicy`, `freightCost`, `inactive`, `notes`, `lines[]`.
- **PurchaseOrderLine** — `id`, `type`, `lineNumber`, `itemCode`, `vendorCode`, `description`, `quantityOrdered`/`quantityFulfilled` (`Measurement`), `unitPrice`, `totalPrice`, `taxable`.
- **Line `type`** — `GENERAL` / `ADHOC` (free-text, fulfillment writable) vs `WINE_BATCH` / `STOCK` (resolve to a Vintrace entity via `itemCode`; fulfillment set by the receiving operation).
- **Measurement** (`common-schemas.yaml`) — `{ unit: string, value: number }`; the bundled spec does not publish a closed unit enum. Used for ordered/fulfilled quantities.
- **ExtIdentifiableEntity** (`common-schemas.yaml`) — external-id-matchable ref (`{ id?, name?, extId? }`); used for `vendor`.
- **Winery** (`common-schemas.yaml`) — winery/business-unit ref on the PO.
- **Enums** — `PurchaseOrderState {NEW, APPROVED}`, `Fulfillment {NOT_FULFILLED, PART_FULFILLED, FULFILLED, OVER_FULFILLED}`, `TaxPolicy {TAX_INCLUSIVE, TAX_EXCLUSIVE, NO_TAX}`.

> `common-schemas.yaml` is now vendored in `vintrace-api/specs/` from the public Stoplight v7 bundle; the shared shapes above are authoritative from that bundle.

---

## Migration entity mapping (this module only)

The account API only carries **purchase orders**. Only the procurement/PO and materials/vendor entities are in scope; everything else is `n/a` for this module (covered — or not — by the other Vintrace specs).

| Migration entity | Our model / core | Verdict | Notes |
|---|---|---|---|
| purchase-orders / procurement | (none — no PO model) | **partial** | POs readable one-at-a-time by internal `id` only; **no list/search/filter** endpoint, so you cannot enumerate historical POs without already holding every id. Also **write-first** (upsert), not a clean read-pull. Our side has no PO entity — nearest is `Vendor` + `SupplyLot.lotCode` (PO ref) + `ApExportEvent` (the AP posting). Migrating open/historical POs would need an import path we don't have. |
| materials / additions | `CellarMaterial` (+ `SupplyLot` receipts) | **partial** | PO lines carry `itemCode`/`vendorCode`/`description`/`unitPrice` and (for `STOCK`) resolve to a Vintrace stock item — enough to seed a material + a purchase cost. But the account API returns only PO-line references, not the material master (no category/kind, stock unit, active flag, weighted-avg cost). Full material taxonomy must come from a stock/materials spec, not here. |
| parties (growers/buyers/vendors) | `Vendor` | **partial** | Only **vendors** appear (as `ExtIdentifiableEntity` on the PO). No standalone party/vendor endpoint — vendor data is a by-product of a PO fetch (`id`/`name`/`extId`). Growers and buyers are absent from this module. Maps cleanly to our `Vendor` (`name`, `externalVendorId`, `terms`) but only for vendors referenced by a PO you can already GET. |
| inventory / stock levels | `StockMovement`, `SupplyLot`, `BottledInventory`, `FinishedGoodInventory` | **gap** | The account API exposes ordered/fulfilled quantities on a PO line, **not on-hand stock**. `WINE_BATCH`/`STOCK` line fulfillment is op-driven and read-only here. No current-state stock levels — must come from the stock spec. |
| cost / COGS | `CostLine`, `SupplyConsumption`, `ApExportEvent`, `AccountingDelivery` | **partial** | PO lines give `unitPrice`/`totalPrice`/`freightCost`/`taxable`/`taxPolicy` — i.e. **committed purchase cost / AP intent**, which maps to our AP path (`ApExportEvent`, `SupplyLot.unitCost`). But it's expected/ordered cost, not booked COGS or absorbed cost; no journal/ledger view. Useful for seeding vendor purchase prices, not for reproducing COGS history. |
| lots (wine batches) | `Lot`, `VesselLot`, `LotOperation` | **n/a** | Only referenced indirectly as a `WINE_BATCH` PO-line `type` (an `itemCode` pointer). No wine-batch data is returned by this module — see `operation-`/`vessel-`/`identity-api-v7.yaml`. |
| vessels (tanks/barrels) | `Vessel`, `BarrelAsset` | **n/a** | Not in the account module (see `vessel-api-v7.yaml`). |
| operation-history (racks/additions/transfers ledger) | `LotOperation`, `VesselTransfer`, `LotTreatment`, `StockMovement` | **n/a** | Not in the account module (see `operation-api-v7.yaml`). |
| compliance / TTB | `ComplianceReport`, `ComplianceProfile` | **n/a** | Not in the account module (see `report-api-v7.yaml`). No TTB/excise data exposed here. |
| blocks / vineyards / harvest | `Vineyard`, `VineyardBlock`, `HarvestRecord`, `HarvestPick`, `BrixLog` | **n/a** | Not in the account module (see `harvest-api-v7.yaml`). |
| purchase-orders / sales | `SalesExportEvent`, `Commerce7Order`, `StockMovement (SALE)` | **partial** | **Purchase** side only. This module is the buy side (POs to vendors). No **sales**/DTC/order-out surface at all — sales are absent from the account API. Our purchase side maps loosely to `Vendor`/`ApExportEvent`; sales side is a gap for this module. |

### Migration gaps (account module)
- **No enumeration/list endpoint** — GET is by internal integer `id` only; you cannot page or filter all POs, so a full historical PO pull is not feasible from this spec alone (you'd need every id up front).
- **Write-first, not read-first** — the primary verb is upsert (`POST`); there is no bulk export of existing POs.
- **Vendor master is incidental** — vendors surface only inside a PO you can already fetch; no vendor list/search.
- **No material master** — PO lines reference `itemCode`/`vendorCode` but the account API returns no material taxonomy, stock unit, or on-hand cost.
- **No stock levels, no COGS ledger, no compliance/TTB, no sales** in this module — those require the sibling Vintrace specs.
