# Vintrace v7 — Vessel API

OpenAPI 3.0.3 reference for the **vessel** module, oriented at a current-state
migration into Cellarhand. Source: `specs/vessel-api-v7.yaml`.

- **Base URL (prod):** `https://oz50.vintrace.net/vinx2/api/v7/vessel`
- **Base URL (sandbox):** `https://sandbox.vintrace.net/vinx2demo/api/v7/vessel`
- **Auth:** HTTP `bearer` token (see Vintrace "Manage and create API tokens").
- **Common:** every request accepts an optional `correlation-id` header (UUID) and
  echoes it back on the response; `{id}` path params are the integer Vintrace vessel id.
- **Response envelope:** all GETs return `{ "data": <object> }`.

> **Scope caveat (read this first).** This module is the vessel **equipment registry**
> only — the physical containers (tanks, barrels, barrel groups, tankers, bins) and their
> asset/config metadata. It does **not** expose the wine inside a vessel (no current
> volume, no batch/lot contents, no working volume), operation history, additions,
> analyses, or stock. Those live in the operation / stock / harvest / cost / report
> modules (separate specs in this folder). The only write here is create-a-tank; the
> other vessel kinds are read-only. There is **no list/search endpoint** — you fetch by
> id, so a migration must enumerate ids from another source.

---

## Endpoints

### `GET /barrels/{id}` — Get a barrel
- **Path:** `id` (integer). **Query:** none. **Header:** `correlation-id?`.
- **Returns:** `Barrel` (a `Vessel` + barrel-specific cooperage fields).
- **Key response fields:** `id`, `name`, `capacity {value,unit}`, `owner`, `wineryBuilding`;
  cooperage: `cooper`, `forest`, `oakType` (FRENCH/AMERICAN/…), `barrelType` (BARREL/KEG/GLASS),
  `toasting`, `toastedHeads`, `grain`, `seasoning` (KILN/NATURAL/…), `seasoningMonths`, `year`,
  `constructionMaterial`; `barrelCategory`, `barrelGroups[]` (short refs), `location`
  (`StackCoordinates`: storageArea/aisle/stack/positions), `lastContained`, `dspAccount`,
  `lastFilledDate` (epoch ms), `recount`, `usageCounter`, `grading`, `sanitationState`,
  `inactive`, `assetId`, `rfid`, `currentBillOfLadingDetails`.

### `GET /barrel-groups/{id}` — Get a barrel group
- **Path:** `id` (integer).
- **Returns:** `BarrelGroup`.
- **Key response fields:** `id`, `name`, `barrels[]` (short refs w/ resource link),
  `locations[]` (`StackCoordinates`), `instructions`, `beenUsed`, `currentBillOfLadingDetails`,
  `lastFilledDate`. (A group is a named set of barrels for fan-out; no per-group wine volume.)

### `POST /tanks` — Create a tank
- **Body:** `TankCreateRequest` (= `Tank`). Required (from `Vessel`): `name`, `owner`,
  `capacity`, `wineryBuilding`.
- **Notable body fields:** `name`, `brand`, `capacity {value,unit}`, `wineryBuilding {name|id}`,
  `owner {id}`, `tankCategory`, `dspAccount`, `constructionMaterial`, thermal/config flags
  (`isRefrigerated`, `isFermenter`, `isInsulated`, `isHeated`, `hasThermostat`,
  `thermostatSetting`, `temperature`, `headspace`, `diameter`, `hasAgitator`, `allowStaves`,
  `containsStaves`), asset/finance (`assetId`, `rfid`, `purchaseDate`, `purchasedUsed`,
  `firstUsedDate`, `deliveredDate`, `depreciationStartDate/EndDate`, `purchaseOrderNumber`,
  `accountsReference`, `financialReference`, `vendor`), `sanitationState`, `grading`,
  `usageCounter`, `inactive`, `recount`.
- **Returns:** `201` + `Location: /tanks/{newId}` + `TankSuccessResponse` (the created `Tank`).

### `GET /tanks/{id}` — Get a tank
- **Path:** `id` (integer). **Returns:** `Tank`.
- **Key response fields:** all `Vessel` fields + `headspace`, `temperature`, `hasThermostat`,
  `thermostatSetting`, `diameter`, `isRefrigerated`, `isFermenter`, `isInsulated`, `isHeated`,
  `constructionMaterial`, `tankCategory`, `dspAccount`, `allowStaves`, `containsStaves`,
  `hasAgitator`, `recount`, finance fields (see create), `vendor`, and
  `dipTables[]` (calibration: `tickResolution`, `volumeResolution`, `dipMeasurementType`
  WET/DRY, `default`).

### `GET /tankers/{id}` — Get a tanker
- **Path:** `id` (integer). **Returns:** `Tanker`.
- **Key response fields:** `Vessel` fields + `truckNumber`, `sealNumber`, `compartmentNumber`,
  `cleanInPlaceNumber`, `currentBillOfLadingDetails`. (A mobile transport vessel.)

### `GET /bins/{id}` — Get a bin
- **Path:** `id` (integer). **Returns:** `Bin`.
- **Key response fields:** `Vessel` fields + `tareWeight` (`Measurement`), `commonTare`,
  `commonTareCertificateNumber`, `canAdjustTare`, `maxBottles`, `bottlesInUse`,
  `stackMultiplier`, `location` (`StackCoordinates`), `dspAccount`. (A fruit/harvest bin.)

---

## Key schemas

### `Vessel` (base for all vessel kinds)
The shared shape; `vesselType` discriminator maps to barrel / barrelGroup / bin / tank / tanker.
- **Required:** `id`, `name`, `owner`, `capacity`, `wineryBuilding`.
- **Identity/asset:** `name`, `brand`, `assetId`, `rfid`, `controlId`, `miscellaneousInfo`.
- **Physical:** `capacity` (`Measurement` `{value,unit}`), `dimensions {length,width,height}`,
  `position {x,y}`.
- **Org/ownership:** `owner` (external-id entity), `wineryBuilding`.
- **State/lifecycle:** `inactive`, `usageCounter`, `sanitationState`
  (TO_BE_CLEANED / READY_FOR_USE / OFFLINE_FOR_CLEANING), `lastSanitation`, `grading`
  (scale+value), `alertState`.
- **Dates (epoch ms):** `purchaseDate`, `purchasedUsed`, `firstUsedDate`, `deliveredDate`.
- **Note:** there is **no wine content / current volume / batch** field anywhere on `Vessel`.
  `capacity` is nominal capacity, not fill level.

### `Barrel`
`Vessel` + cooperage: `cooper`, `forest`, `oakType`, `barrelType`, `toasting`, `toastedHeads`,
`grain`, `seasoning`, `seasoningMonths`, `year`, `barrelCategory`, `constructionMaterial`,
`location` (`StackCoordinates`), `barrelGroups[]`, `dspAccount`, `recount`, `lastFilledDate`,
`currentBillOfLadingDetails`.

### `Tank`
`Vessel` + thermal/fermentation config (`isFermenter`, `isRefrigerated`, `isInsulated`,
`isHeated`, `hasThermostat`, `thermostatSetting`, `temperature`, `headspace`, `diameter`,
`hasAgitator`, `allowStaves`, `containsStaves`), `tankCategory`, `dspAccount`,
finance (`vendor`, `depreciationStartDate/EndDate`, `purchaseOrderNumber`, `accountsReference`,
`financialReference`), and `dipTables[]` (volume-calibration tables).

### `Bin`
`Vessel` + `tareWeight`, `commonTare(+certificateNumber)`, `canAdjustTare`, `maxBottles`,
`bottlesInUse`, `stackMultiplier`, `location`, `dspAccount`. Harvest/fruit bin.

### `BarrelGroup`
`{ id, name, barrels[], locations[], instructions, beenUsed, currentBillOfLadingDetails,
lastFilledDate }`. A named collection of barrels (for grouped operations).

### `DspAccount` (enum)
US TTB Distilled-Spirits-Plant tax bucket carried on the vessel:
`PROCESSING | PRODUCTION | STORAGE | TAXPAID | STORAGE_IMPORTED`. (Wineries: informational tax
bucketing on the container; the actual wine tax class is derived elsewhere.)

### `StackCoordinates` (shared)
Physical storage location of a barrel/bin: `storageArea {id,name,code}`, `aisle`, `stack`,
`toStack`, `positions[] {level, orientation}`.

### `DipTable`
Tank volume-calibration: `id`, `version`, `tickResolution`, `volumeResolution`,
`dipMeasurementType` (WET/DRY), `default`.
