# Vintrace v7 Report API - Migration Reference

> OpenAPI source: `vintrace-docs/api/specs/report-api-v7.yaml` (OpenAPI 3.0.3).
> Auth: HTTP **Bearer** token (`Authorization: Bearer <token>`). See Vintrace's
> "Manage and create API tokens" support article.
> Base URL (server): `https://{host}.vintrace.net/{db}/api/v7/report`
> - Prod example: `https://oz50.vintrace.net/vinx2/api/v7/report`
> - Sandbox example: `https://sandbox.vintrace.net/vinx2demo/api/v7/report`
> Optional `correlation-id` (uuid) request header is echoed back on every response
> (incl. errors) for tracing.

## Scope note (important for migration planning)

This spec defines **exactly one endpoint**: `GET /vessel-details-report`. It is a
**point-in-time bulk-wine snapshot** - the state of every bulk-wine vessel (and its
contents, composition, cost, TTB status, allocations, and live analysis) *as of a
given date/time*. It is the richest single "current state" pull in the Vintrace v7
report surface, but it is fundamentally a **vessel/bulk-wine cross-section**, not an
event/history feed. It exposes no operation history, no fruit-intake events, no
stock-ledger movements, no grower/party records, no purchase orders, and no packaged
finished-goods inventory. Those live in the sibling APIs (`operation-`, `harvest-`,
`stock-`, `costs-`, `vessel-`, `account-`, `identity-`) - out of scope for this file.

---

## Endpoints

### `GET /vessel-details-report` - Bulk-wine vessel + contents snapshot

Return vessel and contents details for bulk wines **at a specified date/time**.
Response is paginated (`PageRoot`: `totalResults`, `offset`, `limit`,
`first`/`previous`/`next`/`last` links, `results[]`).

**Query params (all optional):**

| Param | Type | Purpose |
|---|---|---|
| `asAtDate` | int64 (epoch ms) | The report instant. Defaults to now. Drives *historical revisions* - `productId`, `productState`, `cost`, `liveMetrics`, `ttbDetails`, `allocations` are all resolved as-of this time. **This is the key knob for a current-state pull (omit -> now) or a historical reconstruction.** |
| `limit` / `offset` | int | Pagination (limit >= 1, offset >= 0). |
| `businessUnit` | string | Filter to a winery business unit (e.g. `US57`). |
| `batch` | string | Filter to one wine-batch code (e.g. `21NPVPINOT`). |
| `vessel` | string | Filter to one vessel code (e.g. `T25-01`). |
| `vesselId` | int | Filter by internal vessel id. |
| `vesselType` | string (CSV) | Restrict to vessel types: `TANK,BIN,BARREL,BARREL_GROUP,BIN_GROUP,PRESS,TANKER`. |
| `owner` | string | Filter by owner - Vintrace id (`1232342`) or external id (`ext:ABC32423`). |
| `productId` | int | Filter by product id of the contents. |
| `wineryId` / `wineryName` | int / string | Filter by winery. |
| `extraFields` | string (CSV) | **Opt-in heavy fields.** Must be set to include `allocations`, `composition`, `livemetrics` in the response. Omit -> those arrays are absent. |

**Response - `results[]` is `BulkWineDetails`** (one row per vessel). Key fields a
migration engineer needs:

- **Vessel identity:** `id` (internal), `name`, `description`, `vesselType`,
  `detailsAsAt` (epoch ms the details were effective).
- **Contents identity:** `productId` (may be a *historical* product revision id when
  `asAtDate` is in the past), `beverageType {id,name}`, `wineBatch` (see below),
  `productState {id,name,expectedLossesPercentage}`.
- **Ownership / facility:** `owner {id,extId,name}` (custom-crush owner),
  `winery {id,name,businessUnit}`.
- **Volumes:** `volume`, `capacity`, `ullage` (each a `Measurement {value,unit}`,
  e.g. gal).
- **TTB (`ttbDetails` -> `TaxDetails`):** `bond {id,name}` (bonded facility),
  `taxState` (`BONDED|TAXPAID|NON_DECLARED`), `taxClass {id,name,federalName,stateName}`,
  `alcoholPercentage`.
- **Cost (`cost` -> `CostBreakdown`):** dollar breakdown - `total`, `average`, `fruit`,
  `overhead`, `storage`, `additive`, `bulk`, `packaging`, `operation`, `freight`,
  `other`. **As-of `asAtDate`.**
- **Composition (`composition[]`, opt-in):** the blend slices - per slice `vintage`,
  `variety`, `region`, `subRegion`, optional `block`, and the share as `weighting`
  (0-1), `percentage` (0-100), and `componentVolume`.
- **Allocations (`allocations[]`, opt-in):** product allocations of this vessel's wine
  - `product {id,name,code}`, `vintage`, `itemCode`, `allocationVolume`,
  `allocationPercentageOfVessel`; plus top-level `unallocatedVolume` /
  `unallocatedPercentageOfVessel`.
- **Live analysis (`liveMetrics[]`, opt-in):** current lab metrics as
  `AnalysisResult {name,value,interfaceMappedName}` (e.g. Alcohol/Brix/Residual
  Sugar/Color).
- **Sparkling (`sparklingInfo.state`):** `BASE_WINE|TIRAGED|RIDDLING|RIDDLED|DISGORGED|DOSAGED|BOTTLED|TRANSFERRED`.

**Errors:** `default` -> `BaseErrorRoot` (`errors[]` of
`{code,message,detail}`); documented examples for 400/401/403.

---

## Key schemas

Schemas prefixed `common-schemas.yaml#/...` are shared definitions vendored in
`vintrace-docs/api/specs/common-schemas.yaml`; those shared shapes are recovered from the
public Stoplight v7 optimized bundle.

### `BulkWineDetails`
The per-vessel snapshot row (the response `results[]` element). Full field list above.
Combines vessel metadata + a point-in-time slice of the resident bulk wine.

### `BulkWineBatchDetails` (`wineBatch`)
The batch the resident wine belongs to. `WineBatchDetails` + `designatedSubRegion`.
Fields seen in the example: `id`, `name` (batch code, e.g. `21NAVCHA-05`),
`description`, `vintage`, `program`, and the designated attributes -
`designatedRegion`, `designatedSubRegion`, `designatedVariety`, `productCategory`,
`designatedProduct` (each a coded `{id,name,code}`), and `grading`
(`{scaleId,scaleName,valueId,valueName}`). This is Vintrace's **lot/wine-batch**
identity object.

### `TaxDetails` (`ttbDetails`)
`bond {id,name}`, `taxState` (`BONDED|TAXPAID|NON_DECLARED`), `taxClass {id,name,federalName,stateName}`, `alcoholPercentage`. The as-of TTB posture of the wine.

### `CompositionSlice` (`composition[]`)
`vintage`, `variety`, `region`, `subRegion`, `block`, `weighting` (0-1),
`percentage` (0-100), `componentVolume` (`Measurement`). The blend breakdown.

### `CostBreakdown` (`cost`) - *external ref*
Dollar cost decomposition: `total`, `average`, `fruit`, `overhead`, `storage`, `additive`,
`bulk`, `packaging`, `operation`, `freight`, `other`.

### `AllocationSlice` (`allocations[]`) - *external ref*
`product {id,name,code}`, `vintage`, `itemCode`, `allocationVolume`,
`allocationPercentageOfVessel`.

### `AnalysisResult` (`liveMetrics[]`) - *external ref*
`name`, `value`, `interfaceMappedName`.

### `Measurement` - *external ref*
`{ value: number, unit: string }` (e.g. gal). The bundled OpenAPI defines `unit` as a free string, not a closed enum.

### `Winery` / `IdentifiableEntity` / `ExtIdentifiableEntity` / `CodedIdentifiableEntity` - *external refs*
Reference-entity shapes: `IdentifiableEntity {id,name}`;
`ExtIdentifiableEntity {id,extId,name}`; `CodedIdentifiableEntity {id,name,code}`;
`Winery {id,name,businessUnit}`.

### `PageRoot` - *external ref*
Pagination envelope: `totalResults`, `offset`, `limit`, `first`, `previous`, `next`,
`last`, `results[]`.

---

## Migration entity coverage (from this endpoint alone)

| Migration entity | Verdict | Notes |
|---|---|---|
| Lots / wine batches | partial | `wineBatch` + `productState` + composition give current lot identity/blend per **occupied vessel**, but keyed by vessel - an emptied/bottled batch with no bulk vessel won't appear. No lineage/parentage. |
| Vessels (tanks/barrels) | partial | Full current-state vessel list (id/name/type/capacity/volume/ullage) via `vesselType`. But `BIN/PRESS/TANKER/*_GROUP` exceed our two-type model, and this is a *contents* view, not a vessel master. |
| Operation history | gap | Snapshot only. No racks/additions/transfers events here. |
| Inventory / stock levels | partial | Bulk-wine *volumes* per vessel only. No packaged finished-goods stock. |
| Compliance / TTB | partial | Per-vessel `ttbDetails` (bond, taxState, taxClass, ABV) as-of date - good raw material, but no filed reports/periods. |
| Cost / COGS | partial | Rich per-vessel `cost` breakdown as-of date; no per-op cost lines or COGS-per-bottle. |
| Parties (growers/buyers) | partial | Only `owner` (custom-crush owner) as an id/name; no grower/buyer master. |
| Blocks / vineyards / harvest | gap | `composition[].block` names a block string, but no vineyard/block master or harvest picks. |
| Purchase orders / sales | partial | `allocations` (product allocations) only; no POs, no sales orders. |
| Materials / additions | gap | `cost.additive` is a rollup dollar figure; no material catalog or addition events. |
