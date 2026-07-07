# Vintrace v7 — Harvest API reference

OpenAPI 3.0.3. Source: `vintrace-api/specs/harvest-api-v7.yaml` (title "Vintrace Harvest API").

- **Server base URL (prod):** `https://oz50.vintrace.net/vinx2/api/v7/harvest`
- **Server base URL (sandbox):** `https://sandbox.vintrace.net/vinx2demo/api/v7/harvest`
- **Auth:** HTTP `bearer` (API token). See Vintrace token-management docs.
- **Common headers:** optional `correlation-id` (UUID, request/response echo) on every path.
- **Pagination:** list endpoints use `limit` (1–200, default ~10) + `offset` (>=0) and return a page
  envelope (`totalResults`, `offset`, `limit`, `first`/`previous`/`next`/`last`, `results[]`).
- **Time:** all timestamps are epoch **milliseconds** (int64).
- **Entity refs:** most nested entities are lookup refs — `{ id, name, extId? }` (an
  `IdentifiableEntity` / `ExtIdentifiableEntity`). `extId` is the external-system id; block/vineyard
  lookups accept `ext:` prefixed ids in the path.
- **Errors:** `default` response = `{ errors: [{ code, message, detail }] }` (400/401/403/404 shapes).

> Scope note for migration: this is the **harvest / viticulture** slice. It is **write-oriented**
> (upsert blocks, vineyards, assessments, maturity samples) with **read** access to blocks and
> assessments. There is **no** endpoint here for wine batches, vessels, operation history, stock,
> compliance, cost, or sales — those live in other Vintrace API modules (see gaps below).

---

## Endpoints

### POST `/blocks` — Upsert a vineyard block
Create or update a block (keyed by `extId`). Body = **Block** (see Key schemas).
- **Required:** `extId`, `name`, `vineyard` (`{name, grower}`), `variety`.
- **Key fields:** viticulture detail — `area`, `noOfVines`, `noOfRows`, `rowNumbers`, `rootStock`,
  `clone`, `vineSpacing`/`rowSpacing`, `trellis`, `aspect`, `pruningType`, `plantedTime`,
  `graftedDate`, `organic`+`organicCertifiedTime`, `irrigationType`/`emitterRate`/`emitterSize`,
  `soilProfile`, `averageGradient`, `frostProtection`, `defaultHarvestMethod` (HAND|MACHINE),
  `intendedUse`, `vineStructure`, geo/admin codes (`township`/`range`/`section`/`countyCode`/
  `districtCode`/`regionalAdminCode`/`siteId`), `inactive`, `comments`.
- **Response:** `BlockResponse` `{ data: Block }` + `Location: /blocks/{extId}` header.

### GET `/blocks` — List all blocks
Returns blocks matching query params. **Default fields:** `id, code, name, description, grower,
vineyard, region, subRegion, varietal, rowNumbers, estate, intendedUse, grading, externalId, inactive`.
- **Params:** `limit`, `offset`, `id` (VintraceEntityIds filter), `include=fruitPlacements`
  **combined with** `vintage=<year>` to embed the block's bulk-stock fruit placement for that vintage.
- **Response:** page of **BlockData** (adds `grading`, and — when requested — `fruitPlacement` →
  `bulkStocks[]` of `{ batchId, batchName, totalVolume, equivalentVolume, equivalentWeight,
  compWeighting, percentageOfFruit, grading }`). This is the one place the harvest API surfaces the
  **block → wine-batch link**, but it is a thin projection, not the batch itself.

### PATCH `/blocks/{blockId}` — Partial block update
JSON-Patch-style body (`[{ path, op: REPLACE, value }]`). Only some fields support PATCH (e.g.
`/ratePerTonne`). `blockId` accepts a vintrace id or `ext:<extId>`.
- **Response:** `204 No Content`.

### POST `/blocks/{blockId}/assessments` — Upsert a block assessment (per vintage)
Body = **BlockAssessment**. Pre-harvest crop assessment / forecast for a block+vintage.
- **Required:** `vintage`, `assessmentTime`.
- **Key fields:** `producingForecast`/`availableForecast` (Measurement, e.g. tonnes), `harvestMethod`
  (HAND|MACHINE), `expectedHarvestTime`, `earliestHarvestTime`, `sprayReportReceivedTime`,
  `cropInspectedTime`, `quarantineStatus`/`clearQuarantineStatus`, `diseaseStatus`
  (APPROVED|DISEASE_ASSESSMENT|REJECTED), `grading`, `intendedProduct`, `intendedUse`,
  `expectedProgram`, `contract`, `expectedCrushSite`, `capitalBlock`/`capitalProjectNumber`,
  `locationDetails` (lat/lng/formattedAddress), `comments`.
- **Response:** `BlockAssessmentResponse` `{ data: BlockAssessment }` + `Location` header.

### GET `/assessments` — List all block assessments
Cross-block list of assessments. **Default fields:** `id, block, vintage, assessedBy,
assessmentTime, producingForecast, availableForecast`.
- **Params:** `limit`, `offset`, `assessedBy` (`eq:`/`ne:` id or `ext:`), `createdSince`,
  `createdBefore` (epoch ms), `extraFields` (comma list, e.g. `cropInspected,comments,locationDetails`).
- **Response:** page of **BlockAssessmentOverview** (each has `createdAt`). Supports incremental pulls
  via `createdSince`/`createdBefore` — useful for migration windowing.

### POST `/vineyards` — Upsert a vineyard
Body = **Vineyard**. Keyed by `extId`.
- **Required:** `name` (unique), `grower`.
- **Key fields:** `code`, `region`, `subRegion` (must belong to region), `adminAgridDivision`.
- **Response:** `VineyardResponse` `{ data: Vineyard }` + `Location` header.

### POST `/maturity-samples` — Create a maturity (ripeness) sample
Body = **MaturitySample**. Field brix/ripeness sampling against a block+vintage. **Create only** (no
GET, no update).
- **Required:** `occurredTime`, `vintage`, `block`, `metrics` (>=1).
- **Key fields:** `type` (BUNCH|BERRY), `analysisTemplate`, `laboratory`, `operator`, `reference`,
  `rows`/`vines`/`area`, and `metrics[]` = `AnalysisResult` (`{ name, value }`, e.g. Brix/Temp).
  Response echoes resolved `grower`, `region`, `variety` for the block.
- **Response:** `MaturitySampleResponse` `{ data: MaturitySample }` + `Location` header.

---

## Key schemas

- **Block** — the vineyard block (sub-vineyard unit). Identity `extId`+`id`; `vineyard`+`variety`
  refs; full viticulture attribute set (see POST `/blocks` above). This is the richest object in the
  module.
- **BlockData** — read projection of a block for GET `/blocks`; adds `grading` (scale/value) and the
  optional `fruitPlacement.bulkStocks[]` (block → wine-batch volumes for a vintage).
- **Vineyard** — `{ id, extId, name (unique), code, grower, region, subRegion, adminAgridDivision }`.
  Grower is a ref only (the API does not model grower parties as a first-class resource here).
- **BlockAssessment / BlockAssessmentOverview** — per-vintage crop forecast + harvest-planning
  record for a block. Forecasts are `Measurement` (value+unit). Assessment carries harvest timing,
  disease/quarantine status, contract, intended product/use/program, crush-site.
- **MaturitySample** — a field ripeness sample tied to block+vintage with a metrics array
  (`AnalysisResult`); type BUNCH/BERRY; optional lab + analysis template.
- **FruitPlacement / BulkStock / BatchInfo** — the block's fruit-in-tank projection: `vintage` +
  `bulkStocks[]` with `batchId`/`batchName`, `totalVolume`, `equivalentVolume`, `equivalentWeight`,
  `compWeighting`, `percentageOfFruit`, `grading`. Read-only, embedded in GET `/blocks`.
- **Measurement** (`{ value, unit }`), **AnalysisResult** (`{ name, value }`), **Grading**
  (`{ scale, value }`), **IdentifiableEntity** (`{ id, name }`), **ExtIdentifiableEntity**
  (`+ extId`) — shared refs from `common-schemas.yaml`.
