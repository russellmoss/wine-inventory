# Vintrace Operation API v7 — Reference

OpenAPI 3.0.3. Source: `vintrace-docs/api/specs/operation-api-v7.yaml` (+ shared `common-schemas.yaml`).

- **Base URL (prod example):** `https://oz50.vintrace.net/vinx2/api/v7/operation`
- **Base URL (sandbox example):** `https://sandbox.vintrace.net/vinx2demo/api/v7/operation`
- **Auth:** `bearerAuth` (HTTP bearer token; API token per Vintrace support article).
- **Conventions:**
  - Timestamps are **epoch milliseconds** (`int64`) throughout.
  - List endpoints are paginated: `limit` (1–200, default 10) + `offset`, and return
    `totalResults / offset / limit / first / previous / next / last / results[]`.
  - Incremental sync via `modifiedSince` / `modifiedBefore` (epoch ms) on list endpoints.
  - Most entity refs are `{id, name}` (IdentifiableEntity), `{id, name, extId}`
    (ExtIdentifiableEntity — external id lookups via `ext:...`), or `{id, name, code}`
    (CodedIdentifiableEntity). Measurements are `{value, unit}`.
  - Optional `correlation-id` request header; echoed on every response.
  - Path ids often accept `ext:<externalId>`, and operation ids accept `job:<workOrderJobId>`.

This module is **operations-centric** (winery jobs / transactions), not a master-data or
current-state store. It is the ledger-of-record for cellar work; it is thin on standalone
current-state reads (only wine batches and shipments/intakes are directly listable).

---

## Endpoints

### GET /shipments
All shipments from **Bulk Dispatch** and **Inter-winery dispatch** operations (the wine-leaving-the-cellar ledger).
- **Query:** `limit`, `offset`, `modifiedSince`, `modifiedBefore`, `type` (`BULK`|`INTER_WINERY`),
  `dispatchType` (comma list of names), `freightCode` (comma list), `include`
  (`allocations,metrics,cost,composition` — omitted by default).
- **Response (`ShipmentData[]`):** `id`, `workOrderNumber`, `jobNumber`, `shipmentNumber`, `type`,
  `source` (Winery), `destination` (`winery` or `party`), `occurredTime`, `modifiedTime`, `carrier`,
  `reference`, `dispatchType`, `freightCode`, `reversed`, and `wineDetails[]`:
  - per line: `vessel`, `wineBatch` (id/name/vintage/region/variety/program/grading), `wineryBuilding`,
    `volume`, `loss` (`{volume, reason}`), `weight`, `bottlingDetails`, `cost` (CostBreakdown:
    total/average + fruit/overhead/storage/additive/bulk/packaging/operation/freight/other),
    `allocations[]`, `metrics[]` (AnalysisResult name/value), `composition[]` (vintage/variety/region/%/block).

### GET /barrel-treatments
Shipments created by **Treatment (barrel)** operations (barrel moves / dispatches).
- **Query:** `limit`, `offset`, `modifiedSince`, `modifiedBefore`, `treatment` (comma list of names, case-sensitive).
- **Response (`BarrelTreatmentData[]`):** base op fields (`id`, `workOrderNumber`, `jobNumber`,
  `occurredTime`, `modifiedTime`, `operator`, `reversed`) + `treatment` (id/name/description/`barrelState`
  SOUSED|WINE|OFFLINE|QC/`bolRequired`), `barrels[]` (id/name/capacity), `totalWeight`, `scale`, `carrier`,
  `party`, `source` (Winery), `reference`, `bolCode`, `freightCode`.

### POST /bookings
Upsert a **fruit booking** (planned harvest receival).
- **Body (`Booking`, required: bookingNumber, block, expectedTime, owner, vintage):** `bookingNumber`,
  `bookedBy`, `winery`, `block`, `grower`, `vineyard`, `variety`, `region`, `subRegion`, `appellations[]`,
  `vintage`, `growerContract`, `intendedProduct`, `expectedTime`, `expectedEndTime`,
  `expectedDurationInMinutes`, `expectedQuantity`, `bookingState`, `harvester`, `crusher`, `owner`,
  `carrier`, `receivingScales`, `receivingVessel`, `harvestMethod` (HAND|MACHINE), `pickTime`, `program`,
  `intendedUse`, `numberOfLoads`, `areaEstimate`, `deliveryType` (BINS|TIPPER|OTHER), `pmsRate`,
  `serviceOrder`, `grading`, `inactive`, `bulkBooking`, `lastBooking`.
- **Response:** `{data: Booking}` (echo with resolved ids).

### POST /bookings/{bookingId}/deactivation
Deactivate a booking. `bookingId` accepts vintrace id or booking number or `ext:<extId>`.
- **Response:** `{data: {inactive: true}}`.

### POST /fruit-intakes
Record a **fruit intake** (weigh-in / delivery of grapes) — 201 Created + `Location`.
- **Body (`FruitIntakeRequest`, required: net, vintage, scale, dateOccurred):** `block` (or `bookingNumber`),
  `vintage`, `owner`, `dateOccurred`, `timeIn`/`timeOut`, `weighTag`/`externalWeighTag`, `winery`, `scale`,
  `gross`/`tare`/`net` (Measurement, e.g. tn), `jobStatus`, `intendedProduct`, `unitPrice`
  (`{value, unit}` e.g. `$ / ton`), `metrics[]` (Brix/pH/TA/Temp/VA/MOG/NIRS as AnalysisResult),
  `harvestMethod`, `weighMasterText`, `carrier`, `consignmentNote`, `driverName`, `lastLoad`,
  `operatorNotes`, `truckRegistration`, `linkEarliestBooking`.
- **Response:** `{data: FruitIntake}`.

### PUT /fruit-intakes/{fruitIntakeId}/pricing
Update weights + unit price for an intake. `fruitIntakeId` accepts id or `ext:<externalWeighTag>`.
- **Body:** `{gross, tare, net, unitPrice}`. **Response:** `{data: {...}}`.

### PUT /fruit-intakes/{fruitIntakeId}/metrics
Replace analysis metrics on an intake.
- **Body:** `{metrics: AnalysisResult[]}`. **Response:** `{data: {metrics}}`.

### POST /bulk-intakes
Create a **bulk wine intake** (wine received into the cellar, real or virtual vessel) — 201 + `Location`.
- **Body (`BulkIntakeRequest`, required: occurredTime, wineDetails, composition, cost):**
  - `occurredTime`
  - `wineDetails` (WineDetailsInRequest): `vessel` (or `virtualVessel:true` + `winery`), `batch`,
    `ownership[]` (owner + %), `volume`, `fractionType` (FREE_RUN|PRESSINGS|MUST|LEES|SAIGNEE|…),
    `fermentState` / `malolacticState` (UNFERMENTED|STARTED|STOPPED), `beverageType`, `productType`
    (LIQUID|NEUTRAL_CONDENSATE), `reference`, `yieldRate`, `batchOwner`.
  - `composition[]` (Composition): `percentage`, `vintage`, and `block` OR (`region`/`subRegion`/`variety`).
  - `cost` (Cost): `amount`, `rate` (TOTAL|PER_LITRE|PER_GALLON_US), `freight`, `ttbDetails`
    (**TaxDetails**: `taxState` BONDED|TAXPAID|NON_DECLARED, `taxClass` w/ federal/state name, `bond`, `alcoholPercentage`).
  - `deliveryDetails` (DeliveryDetails): `purchaseOrder`, `receivedFrom`, `carrier`, `shippingRefNo`,
    `truckNo`, `driverName`, `sealNo`, `compartmentNo`, `cipNo`, `container`, `customsEntryNumber`,
    `purchaseReference`, `deliveryState` (IN_TRANSIT|ON_DOCK|RECEIVED).
  - `metrics[]`.
- **Response:** `{data: BulkIntake}` (adds `id`, `reversed`).

### GET /bulk-intakes
List bulk intake records.
- **Query:** `limit`, `offset`, `modifiedSince`, `modifiedBefore`, `purchaseReference` (`eq:<value>`).
- **Response:** `BulkIntake[]` (as above, incl. `reversed`).

### PATCH /bulk-intakes/{id}
Partial update (JSON-Patch style: `[{path, op, value}]`). Only some fields patchable
(e.g. `/deliveryDetails/deliveryState`). Returns **204**.

### GET /trial-blends
List **bench/trial blends** (planning artifacts, not real lots).
- **Query:** `limit`, `offset`, `modifiedSince`, `modifiedBefore`, `status`
  (DRAFT|FINAL|REQUEST_APPROVAL|APPROVED, comma list), `compositionSummaryBy` (variety,vintage,region,sub_region).
- **Response (`TrialBlend[]`):** `reference`, `name`, `description`, `year`, `winery`, `operator`,
  `trialDate`, `modifiedTime`, `cost`, `amount`, `sampleVolume`, `status`, `composition.summary[]`
  (per-type % elements).

### GET /work-orders
List **work orders** (scheduled/completed winery jobs) — the operation index.
- **Query:** `limit`, `offset`, `scheduledSince`, `scheduledBefore`, `status`
  (DRAFT|READY|IN_PROGRESS|SUBMITTED|COMPLETED|CANCELLED|REPLAY), `operationTypes` (e.g. `TIRAGE,BULK_DISPATCH`).
- **Response (`WorkOrder[]`):** `id`, `name`, `assignedTo`, `issuedBy`, `status`, `scheduledTime`,
  `summary`, `jobs[]` (WineryWorkOrderJob: `id`, `type`, `jobNumber`, `status`, `scheduledTime`,
  `finishedTime`, `operationType`, `link` — a `ResourceLink` to fetch the job details, e.g.
  `/operation/tirage/job:2323`).

### GET /tirage/{operationId}
Get one **tirage** (sparkling bottling) operation. `operationId` accepts a process id or `job:<jobId>`.
- **Response (`Tirage`):** base op fields + `groupName`, `sourceWine` (vessel/batch/designatedProduct/
  productionYear/winery/wineryBuilding), `outVolume`, `loss`, `package` (`quantity`, `tirageItem`,
  `tirageBatch`, `totalPackagedVolume`).
- **PATCH /tirage/{operationId}** — JSON-Patch partial update (e.g. `/package/quantity`, `/groupName`). 204.
- NOTE: tirage is the **only** individual operation-type read endpoint fully specced here; other
  operation types are reachable only as work-order `jobs[].link` (schema not defined in this spec).

### POST /barrels-movements
Record **barrel movement(s)** between storage areas (and optionally to a new batch) — 201 + `Location`.
- **Body (`MoveBarrels`, required: movements):** `occurredTime`, `operator`, `operatorNotes`,
  `documentIds[]`, `targetBatch`, `additionalInstructions`, `movements[]` (each: `vessel` (barrel or
  barrel group) + `newStorageAreas[]` with `vesselToMove`, `storageArea`, `aisle`, `stack`, `toStack`,
  `positions[]` (`level`, `orientation`)). Handles single barrel, barrel group, empty barrels, multi-move.
- **Response:** `{data: {...movements, id, occurredTime, modifiedTime, operator}}`.

### GET /wine-batches
List **wine batches** (the batch master — a batch groups vessels/liquid).
- **Query:** `limit`, `offset`, `ids` (VintraceEntityIds), `include` (`allocations,vessels`).
- **Response (`WineBatchData[]`):** `id`, `batchCode`, `batchNumber`, `description`, `productionYear`,
  `owner`, `grading`, `program`, `designatedRegion`/`SubRegion`/`Variety`, `winery`, `category`,
  `designatedProduct`, `costsTrackedPercentage`, `ageOfSpirits`, `serviceOrder`, `fractionType`,
  `inactive`, `vessels[]` (id/name/type TANK|BIN|BARREL|BARREL_GROUP|BIN_GROUP|PRESS|TANKER + `amount`),
  `allocations[]`.

### POST /wine-batches
Create a wine batch (required: batchCode, vintage, winery, owner) — 201 + `Location`. Body = WineBatchData.

### PUT /operation/documents
Attach uploaded documents to an operation/process.
- **Body:** `{processId, documentIds[]}`. **Response:** `{documents[], process:{id, type}}` where
  `type` is one of ~50 process kinds (EXTRACTION, BLEND, ADDITION, RACKING, RACK_AND_RETURN, BOTTLING/
  PACKAGING_RUN, BULK_DISPATCH, BULK_INTAKE, TIRAGE, PRESS_CYCLE, MEASUREMENT, ANALYSIS, CHANGE_OWNER, …).

---

## Key schemas

- **WineBatch** (`WineBatchData`): the batch master — the closest analog to our **Lot** identity +
  designated product/variety/region/program/owner/grading + current vessel occupancy (`vessels[]`) and
  `allocations[]`. `productionYear` = vintage; `fractionType`; `costsTrackedPercentage`. No lineage,
  no fermentation-state vectors, no full operation history embedded.
- **Vessel** (as `wineBatch.vessels[]` / `receivingVessel` refs): `id`, `name`, `type`
  (TANK|BIN|BARREL|BARREL_GROUP|BIN_GROUP|PRESS|TANKER), `amount` (current volume). There is **no
  standalone vessel-list or vessel-master endpoint in this Operation module** (see the separate
  `vessel-api-v7.yaml`); vessels here appear only as occupancy on a batch or as move/treatment targets.
- **FruitIntake**: grape weigh-in — `net/gross/tare` weights, `unitPrice`, `block`/`bookingNumber`,
  `vintage`, `owner`, `scale`, `metrics[]`, harvest/logistics metadata. Maps to our HarvestPick + intake.
- **Booking**: planned harvest (grower/vineyard/block/variety/region/appellations/contract/expected qty).
- **BulkIntake / WineDetails / Composition / Cost / TaxDetails / DeliveryDetails**: wine-received record
  with volumetric + composition + **cost (with TTB tax-class/tax-state)** + delivery/PO metadata.
- **ShipmentData / ShipmentWineDetails / CostBreakdown**: wine-dispatched record with per-component
  cost breakdown, allocations, metrics, composition, loss.
- **WorkOrder / WorkOrderJob / WineryWorkOrderJob / ResourceLink**: the scheduled-job index; jobs link
  out to per-type operation reads.
- **TrialBlend / CompositionSummary**: planning blends with summarized composition.
- **AnalysisResult** (metrics), **Measurement** (`{value, unit}`), **AllocationSlice**,
  **GradingValue**, entity-ref shapes (Identifiable / ExtIdentifiable / Coded).

### Notable gaps in THIS module (relevant for migration)
- **No inventory / stock-level read** (case goods / bottled inventory / on-hand): see `stock-api-v7.yaml`.
- **No standalone operation-history feed** for racks / additions / transfers as a single ledger — those
  are only reachable per-work-order-job (and most job schemas aren't defined here). Only shipments,
  barrel-treatments, bulk-intakes, tirage are directly listable/readable.
- **No parties/master-data endpoints** (grower, buyer, carrier, vendor, product, region are referenced
  as `{id,name,extId}` but not enumerable here): see `account-api-v7.yaml` / `identity-api-v7.yaml`.
- **No compliance/TTB report read** (only tax-class metadata rides on cost): see `report-api-v7.yaml`.
- **No COGS/cost read endpoint** (cost appears embedded on shipments/intakes only): see `costs-api-v7.yaml`.
- **No purchase-order or sales-order endpoint** (PO appears only as a ref inside delivery details).
- **No blocks/vineyard master-data** (blocks referenced by `extId` on bookings/intakes only).
