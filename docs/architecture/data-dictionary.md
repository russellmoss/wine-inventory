# Data dictionary

> **Generated — do not edit.** `npm run docs:data-dictionary` rebuilds this from
> `prisma/schema.prisma` and `prisma/fk-registry.json`. Diagrams: [[erd]].

**188 tables · 2588 columns · 439 foreign keys**

Descriptions come from the comments already in the schema. **A blank description means the
schema has no comment for that column** — that is a gap to fill in `schema.prisma`, not something
this generator should invent.

`Key` column: 🔑 primary key · 🔗 foreign key (per `pg_constraint`, including the composite ones
Prisma cannot express) · ∪ unique.

## Identity & access

_Who can sign in, which winery they belong to, and what they may reach._ — 12 tables.

### `account`

_Prisma model: `Account`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `id` | String | no | 🔑 |  |  |
| `accountId` | String | no |  |  |  |
| `providerId` | String | no |  |  |  |
| `userId` | String | no | 🔗 |  |  |
| `accessToken` | String | yes |  |  |  |
| `refreshToken` | String | yes |  |  |  |
| `idToken` | String | yes |  |  |  |
| `accessTokenExpiresAt` | DateTime | yes |  |  |  |
| `refreshTokenExpiresAt` | DateTime | yes |  |  |  |
| `scope` | String | yes |  |  |  |
| `password` | String | yes |  |  |  |
| `createdAt` | DateTime | no |  | `now()` |  |
| `updatedAt` | DateTime | no |  |  |  |

**References**

- `(userId)` → `user(id)` · ON DELETE CASCADE

### `app_settings`

A singleton winery-level settings row (the app is single-tenant). Read/created via getAppSettings(). `sparklingEnabled` gates the ENTIRE traditional-method UI/nav (K14, default off) — backend enums/cores ship regardless and are inert when unused.

_Prisma model: `AppSettings`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` | Phase 12 tenant scope (nullable U2 -> backfill U3 -> NOT NULL U5); FK+RLS at DB level |
| `id` | String | no | 🔑 | `cuid()` | Phase 12: per-org now (K10). One row per tenant (@@unique([tenantId])); read/written by tenantId, not the old "singleton" id. id is a plain cuid so a 2nd org's row can't collide. |
| `sparklingEnabled` | Boolean | no |  | `false` |  |
| `customCrushEnabled` | Boolean | no |  | `false` | Plan 093 follow-on: gates the custom-crush surfaces (Owners/Clients setup + the Weigh-tags nav). Default off — inert until a winery opts in (mirror sparklingEnabled/K14). |
| `pushVendorsToQbo` | Boolean | no |  | `false` | Plan 077: opt-in — eagerly create a QBO vendor when one is created in Cellarhand (off = author vendors in QBO, Slice 1's pull covers it) |
| `currency` | String | no |  | `"USD"` | Phase 8 (D5, D9, D17): per-tenant costing policy. `currency` (ISO code, default USD) heads every cost row. `costingMethod` + `costingMethodEffectiveAt` set depletion order (WA default \| FIFO); the method actually used is STAMPED on each SupplyConsumption at write time so recompute is stable. Capitalization toggles decide which components fold into capitalized cost — MATERIAL + DOSAGE_LIQUEUR are ALWAYS capitalized (no toggle); the rest are recorded regardless and only the toggle gates whether they roll up. `costingPolicyVersion` stamps every derived row so a toggle/method change never re-values closed history (D17). |
| `timeZone` | String | yes |  |  | The winery's OPERATING clock (IANA zone, e.g. "America/Los_Angeles"). Work is planned where the wine is: a 9am pumpover means the crew's 9am, not the reader's — so a due time is entered, stored, and displayed against this zone, and the assistant's "today" follows it too. NULLABLE on purpose: unset means "not configured", and every reader falls back to the VIEWER's browser zone, which is exactly the behaviour before this column existed. See src/lib/work-orders/due-at.ts. |
| `unitSystem` | String | yes |  |  | Plan 098 — tenant display-unit preferences. Storage stays canonical metric everywhere; these columns steer DISPLAY only. `unitSystem` is the master ("METRIC" \| "IMPERIAL"); the six per-dimension columns are explicit overrides (NULL = follow the master; master NULL = metric, i.e. today's behavior). String unions, NOT Prisma enums, per the coverageState/unitSystem precedent (Windows enum-migration rule). Parsed into precise unions ONLY by resolveUnitPrefs (src/lib/units/display.ts) — nothing downstream sees raw strings. "METRIC" \| "IMPERIAL" |
| `unitTemperature` | String | yes |  |  | "C" \| "F" |
| `unitPrecipitation` | String | yes |  |  | "MM" \| "IN" |
| `unitVolume` | String | yes |  |  | "L" \| "HL" \| "GAL" |
| `unitArea` | String | yes |  |  | "HA" \| "ACRES" |
| `unitLength` | String | yes |  |  | "M" \| "FT" |
| `unitWeight` | String | yes |  |  | "KG" \| "LB" |
| `costingMethod` | CostingMethod | no |  | `WEIGHTED_AVG` |  |
| `costingMethodEffectiveAt` | DateTime | yes |  |  |  |
| `capitalizeFruit` | Boolean | no |  | `true` |  |
| `capitalizeBarrel` | Boolean | no |  | `true` |  |
| `capitalizeLabor` | Boolean | no |  | `false` |  |
| `capitalizeOverhead` | Boolean | no |  | `false` |  |
| `capitalizePackaging` | Boolean | no |  | `true` |  |
| `costingPolicyVersion` | Int | no |  | `1` |  |
| `apInventoryAccount` | String | yes |  |  | Phase 15 Unit 10 — supply-receipt A/P Bill accounts (winery-wide, not per-component): a receipt posts DR inventory-asset / CR accounts-payable. Both unset → AP export is withheld (never posted). |
| `apPayableAccount` | String | yes |  |  |  |
| `apFixedAssetAccount` | String | yes |  |  | Plan 080 U5 (council C3): a MIXED invoice codes each line to its OWN account — a pump is a fixed asset, a clamp is an expense, a case of merch is inventory. Posting all three to apInventoryAccount corrupts the balance sheet. NULLABLE on purpose: an unconfigured account WITHHOLDS the invoice (needsAck) instead of silently miscoding, and the accountant confirms this map before go-live. capitalized equipment |
| `apSuppliesExpenseAccount` | String | yes |  |  | consumables / spare parts (expensed, not capitalized) |
| `apPaymentBankAccount` | String | yes |  |  | Plan 076 — the pay-from accounts a BillPayment draws on when an invoice is marked Paid: a check/bank payment credits the bank account; a company-card payment credits the credit-card LIABILITY account (moves the debt from the vendor to the card). Either may be unset until first used. |
| `apPaymentCardAccount` | String | yes |  |  |  |
| `dtcRevenueAccount` | String | yes |  |  | Phase 16 Unit 1 — DTC (Commerce7) sales accounts (winery-wide, like AP): a settled DTC sale posts DR undeposited-funds clearing / CR revenue + CR sales-tax-payable + CR shipping-income, with a discount contra line. Revenue + clearing unset → the sales export is WITHHELD (never posted). Both nullable + additive. |
| `dtcTaxAccount` | String | yes |  |  |  |
| `dtcShippingAccount` | String | yes |  |  |  |
| `dtcClearingAccount` | String | yes |  |  |  |
| `dtcDiscountAccount` | String | yes |  |  |  |
| `assistantFeedbackMode` | FeedbackAutomationMode | no |  | `AGENTIC_FIX` |  |
| `bugReportMode` | FeedbackAutomationMode | no |  | `REPORT_ONLY` |  |
| `featureRequestMode` | FeedbackAutomationMode | no |  | `REPORT_ONLY` |  |
| `updatedAt` | DateTime | no |  |  |  |

**References**

- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT

### `invitation`

_Prisma model: `Invitation`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `id` | String | no | 🔑 | `cuid()` |  |
| `organizationId` | String | no | 🔗 |  |  |
| `email` | String | no |  |  |  |
| `role` | String | yes |  |  | invited org role |
| `status` | String | no |  | `"pending"` | pending \| accepted \| rejected \| canceled |
| `expiresAt` | DateTime | yes |  |  |  |
| `inviterId` | String | no | 🔗 |  |  |
| `createdAt` | DateTime | no |  | `now()` |  |

**References**

- `(inviterId)` → `user(id)` · ON DELETE CASCADE
- `(organizationId)` → `organization(id)` · ON DELETE CASCADE

### `member`

_Prisma model: `Member`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `id` | String | no | 🔑 | `cuid()` |  |
| `organizationId` | String | no | 🔗 |  |  |
| `userId` | String | no | 🔗 |  |  |
| `role` | String | no |  | `"member"` | owner \| admin \| member (org-level) |
| `createdAt` | DateTime | no |  | `now()` |  |

**References**

- `(organizationId)` → `organization(id)` · ON DELETE CASCADE
- `(userId)` → `user(id)` · ON DELETE CASCADE

### `organization`

_Prisma model: `Organization`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `id` | String | no | 🔑 | `cuid()` |  |
| `name` | String | no |  |  |  |
| `slug` | String | no | ∪ |  |  |
| `logo` | String | yes |  |  |  |
| `metadata` | String | yes |  |  | Better Auth stores org metadata as a JSON string here |
| `createdAt` | DateTime | no |  | `now()` |  |
| `updatedAt` | DateTime | yes |  |  |  |

### `owner`

Plan 093 (custom-crush data foundation) — the first-class party that OWNS wine. Replaces the scalar `LotOwnership` enum (kept as a mirror until Unit 3 cuts the 11 readers over and drops it). Facility's OWN wine = NO Owner row (ownerId NULL everywhere), so `kind` needs no ESTATE value — a NULL ownerId on a LOT means "Estate (facility)" (the load-bearing convention behind the cost predicate + verify). SCALAR ownership (one Owner per lot); a future `LotOwnershipShare(ownerId, lotId, pct)` is the additive fractional extension — do NOT build it, but Owner is shaped so adding it later is non-breaking.

_Prisma model: `Owner`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` | Phase 12 tenant scope; FK+RLS at DB level (AGENTS.md 9-step) |
| `id` | String | no | 🔑 | `cuid()` |  |
| `name` | String | no |  |  | the client/proprietor name (per-tenant unique) |
| `kind` | String | no |  |  | kind: the OwnerKind TS union ("CUSTOM_CRUSH_CLIENT" \| "AP_PROPRIETOR"), stored as TEXT + validated in owner-core (NOT a Prisma/Postgres enum — mirrors ChangeOfTaxClassEvent's WineTaxClass string, dodging the Postgres enum-migration pain; a new kind is a code change, not an ALTER TYPE). |
| `isActive` | Boolean | no |  | `true` |  |
| `createdAt` | DateTime | no |  | `now()` |  |
| `updatedAt` | DateTime | no |  |  |  |

**References**

- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT

### `session`

_Prisma model: `Session`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `id` | String | no | 🔑 |  |  |
| `expiresAt` | DateTime | no |  |  |  |
| `token` | String | no |  |  |  |
| `createdAt` | DateTime | no |  | `now()` |  |
| `updatedAt` | DateTime | no |  |  |  |
| `ipAddress` | String | yes |  |  |  |
| `userAgent` | String | yes |  |  |  |
| `userId` | String | no | 🔗 |  |  |
| `impersonatedBy` | String | yes |  |  |  |
| `activeOrganizationId` | String | yes |  |  | Multi-tenancy (K2): the tenant the session is currently acting in. Set by the Better Auth organization plugin on login (see auth.ts session hook); re-validated against `member` each request in getCurrentUser (K13). Plain string, no FK — matches the plugin's schema. |

**References**

- `(userId)` → `user(id)` · ON DELETE CASCADE

### `user`

_Prisma model: `User`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `id` | String | no | 🔑 |  |  |
| `name` | String | no |  |  |  |
| `email` | String | no |  |  |  |
| `emailVerified` | Boolean | no |  | `false` |  |
| `image` | String | yes |  |  |  |
| `createdAt` | DateTime | no |  | `now()` |  |
| `updatedAt` | DateTime | no |  |  |  |
| `role` | String | yes |  |  |  |
| `banned` | Boolean | yes |  | `false` |  |
| `banReason` | String | yes |  |  |  |
| `banExpires` | DateTime | yes |  |  |  |
| `mustChangePassword` | Boolean | yes |  | `false` |  |
| `passwordChangedAt` | DateTime | yes |  |  |  |

### `user_vineyard`

D9 RBAC: a user's vineyard MEMBERSHIP set, replacing the single User.assignedVineyardId. A manager can manage N vineyards; a blended lot spans many. Added here (dual-read); assignedVineyardId is dropped in Unit 3 after the backfill is verified.

_Prisma model: `UserVineyard`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` | Phase 12 tenant scope (nullable U2 -> backfill U3 -> NOT NULL U5); FK+RLS at DB level |
| `id` | String | no | 🔑 | `cuid()` |  |
| `userId` | String | no | 🔗 |  |  |
| `vineyardId` | String | no | 🔗 |  |  |
| `createdAt` | DateTime | no |  | `now()` |  |

**References**

- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT
- `(userId)` → `user(id)` · ON DELETE CASCADE
- `(vineyardId)` → `vineyard(id)` · ON DELETE CASCADE

### `verification`

_Prisma model: `Verification`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `id` | String | no | 🔑 |  |  |
| `identifier` | String | no |  |  |  |
| `value` | String | no |  |  |  |
| `expiresAt` | DateTime | no |  |  |  |
| `createdAt` | DateTime | no |  | `now()` |  |
| `updatedAt` | DateTime | no |  |  |  |

### `voice_preference`

_Prisma model: `VoicePreference`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` |  |
| `id` | String | no | 🔑 | `cuid()` |  |
| `userId` | String | no | 🔗 |  |  |
| `defaultFocusMode` | VoiceFocusDefaultMode | no |  | `OPEN` |  |
| `audioIsolationEnabled` | Boolean | no |  | `false` |  |
| `wakeWordEnabled` | Boolean | no |  | `false` |  |
| `createdAt` | DateTime | no |  | `now()` |  |
| `updatedAt` | DateTime | no |  |  |  |

**References**

- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT
- `(userId)` → `user(id)` · ON DELETE CASCADE

### `voice_profile`

_Prisma model: `VoiceProfile`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` |  |
| `id` | String | no | 🔑 | `cuid()` |  |
| `userId` | String | no | 🔗 |  |  |
| `status` | VoiceProfileStatus | no |  | `ACTIVE` |  |
| `provider` | VoiceProfileProvider | no |  | `LOCAL_VOICEPRINT` |  |
| `providerRef` | String | yes |  |  |  |
| `embeddingCt` | String | yes |  |  |  |
| `dekWrapped` | String | yes |  |  |  |
| `modelVersion` | String | no |  |  |  |
| `threshold` | Float | no |  | `0.82` |  |
| `enrollmentQuality` | Float | yes |  |  |  |
| `consentAcceptedAt` | DateTime | yes |  |  |  |
| `consentVersion` | String | yes |  |  |  |
| `lastVerifiedAt` | DateTime | yes |  |  |  |
| `createdAt` | DateTime | no |  | `now()` |  |
| `updatedAt` | DateTime | no |  |  |  |

**References**

- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT
- `(userId)` → `user(id)` · ON DELETE CASCADE

## Weather & climate

_Observed and forecast weather per vineyard, plus provider quota tracking._ — 6 tables.

### `vineyard_climate_daily`

───────────────────────── VI-P8: Weather & Climate spine (Release 4A) ───────────────────────── The AUTHORITATIVE daily climate series (council R1): ONE row per (tenant, vineyard, localDate, providerKey) — a raw per-provider daily observation, metrics wide. There is NO mutable snapshot / CURRENT-SUPERSEDED machine; rows are UPSERTED on the unique key (recent days PROVISIONAL→FINAL as gridMET/CFSv2 finalize), so there is no supersede race. `localDate` is the canonical vineyard-LOCAL civil day normalized AT INGEST (council R2 obs-time shift — Tmax→date−1 for AM-obs stations, grids UTC/midnight converted); it is NEVER a raw provider date. Every row is strictly SINGLE-PROVIDER — `providerKey` IS the source (no metricSource column). Gap-fill + spread are computed ON READ from these pure rows (council confirmatory gate): there is deliberately NO filledFromProvider column. Numeric-sanity CHECKs (tminC≤tmaxC, RH 0..100, precip≥0) in the migration.

_Prisma model: `VineyardClimateDaily`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` | Phase 12 tenant scope; FK+RLS at DB level (AGENTS.md 9-step) |
| `id` | String | no | 🔑 | `cuid()` |  |
| `vineyardId` | String | no | 🔗 |  | composite FK → vineyard(tenantId, id) (raw SQL, K11) |
| `providerKey` | String | no |  |  | the SINGLE source of this row: "gridmet" \| "daymet" \| "nasa_power" \| "rcc_acis" \| "noaa_cdo" |
| `localDate` | DateTime `Date` | no |  |  | canonical vineyard-local civil day (obs-time normalized at ingest, R2) |
| `tmaxC` | Decimal `Decimal(6, 3)` | yes |  |  | daily max temp °C (nullable — a provider may not carry a metric) |
| `tminC` | Decimal `Decimal(6, 3)` | yes |  |  | daily min temp °C |
| `precipMm` | Decimal `Decimal(8, 3)` | yes |  |  | daily precipitation mm |
| `rhMaxPct` | Decimal `Decimal(6, 3)` | yes |  |  | daily max relative humidity % (grids only; stored for 4B disease inputs) |
| `rhMinPct` | Decimal `Decimal(6, 3)` | yes |  |  | daily min relative humidity % |
| `dataStatus` | String | no |  | `"PROVISIONAL"` | String union (no enum): "PROVISIONAL" \| "FINAL" |
| `provenance` | Json | no |  |  | { fetchedAt, sourceUrl, obsConvention, sourceDate, units, resolutionM, attribution } |
| `createdAt` | DateTime | no |  | `now()` |  |
| `updatedAt` | DateTime | no |  |  |  |

**References**

- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT
- `(tenantId, vineyardId)` → `vineyard(tenantId, id)` · ON DELETE CASCADE _(composite — invisible to Prisma)_

### `vineyard_forecast_daily`

Plan 096 Phase 2 (U11) — the 7-day forecast, per-provider per-target-day. REPLACED, never accumulated: ingest deletes the forward horizon for a (vineyard, provider) then bulk-inserts (council C1 — a shortened horizon can't strand a stale future row); the natural key is the upsert identity and `issuedAt` is a COLUMN (staleness label), not part of the key. All five value columns are NULLABLE end-to-end (council C7 — an evening NWS fetch's day-1 has a low and no high; that's a first-class row, never a zero). Never-blend: one row per provider; display/ alerts/assistant all consume ONE primary series via selectPrimaryForecastSeries. Past targetDates are pruned by the daily sweep (no unbounded growth); forecast-vs-actual accuracy history is a deliberate LATER (needs its own append-only table).

_Prisma model: `VineyardForecastDaily`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` | Phase 12 tenant scope; FK+RLS at DB level |
| `id` | String | no | 🔑 | `cuid()` |  |
| `vineyardId` | String | no | 🔗 |  | composite FK → vineyard(tenantId, id) |
| `providerKey` | String | no |  |  | "nws" \| "open_meteo" (String union — no enum) |
| `targetDate` | DateTime `Date` | no |  |  | vineyard-local civil day this row forecasts |
| `issuedAt` | DateTime | no |  |  | when the provider issued/we fetched this forecast (staleness label) |
| `tmaxC` | Decimal `Decimal(6, 3)` | yes |  |  |  |
| `tminC` | Decimal `Decimal(6, 3)` | yes |  |  |  |
| `precipMm` | Decimal `Decimal(8, 3)` | yes |  |  |  |
| `precipProbabilityPct` | Decimal `Decimal(6, 3)` | yes |  |  |  |
| `conditionCode` | String | no |  | `"UNKNOWN"` | ConditionCode union (condition-core) |
| `windMaxKph` | Decimal `Decimal(7, 2)` | yes |  |  |  |
| `provenance` | Json | no |  |  |  |
| `createdAt` | DateTime | no |  | `now()` |  |
| `updatedAt` | DateTime | no |  |  |  |

**References**

- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT
- `(tenantId, vineyardId)` → `vineyard(tenantId, id)` · ON DELETE CASCADE _(composite — invisible to Prisma)_

### `vineyard_forecast_hourly`

Plan 097 (U3) — hourly forecast slots for the day-detail modal. One row per (provider, hourStartUtc); REPLACED like the daily table (delete forward horizon then insert, same ingest tx — C1). localDate/localHour are computed AT INGEST from the vineyard tz and never re-derived at read. precipDurationH carries the NATIVE amount interval (1 = per-hour Open-Meteo; 3/6 = an NWS raw-gridpoint QPF bucket starting at this hour) — the chart draws bars at that width (S6: no invented uniform rain). Value columns nullable (C7 — NWS precip-only bucket rows have null temps). Volume ≈ 13 vineyards × ≤168 h × ≤2 providers ≈ 4.4k rows fleet-wide, pruned daily.

_Prisma model: `VineyardForecastHourly`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` | Phase 12 tenant scope; FK+RLS at DB level |
| `id` | String | no | 🔑 | `cuid()` |  |
| `vineyardId` | String | no | 🔗 |  | composite FK → vineyard(tenantId, id) |
| `providerKey` | String | no |  |  | "nws" \| "open_meteo" (String union — no enum) |
| `hourStartUtc` | DateTime | no |  |  | the slot's UTC instant — the replace identity |
| `localDate` | DateTime `Date` | no |  |  | vineyard-local civil day (modal slicing key) |
| `localHour` | Int | no |  |  | 0–23 in the vineyard tz |
| `tempC` | Decimal `Decimal(6, 3)` | yes |  |  |  |
| `popPct` | Decimal `Decimal(6, 3)` | yes |  |  |  |
| `precipMm` | Decimal `Decimal(8, 3)` | yes |  |  |  |
| `precipDurationH` | Int | no |  | `1` | native amount-interval width in hours |
| `conditionCode` | String | no |  | `"UNKNOWN"` |  |
| `windKph` | Decimal `Decimal(7, 2)` | yes |  |  |  |
| `issuedAt` | DateTime | no |  |  | staleness label, mirrors the daily table |
| `createdAt` | DateTime | no |  | `now()` |  |
| `updatedAt` | DateTime | no |  |  |  |

**References**

- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT
- `(tenantId, vineyardId)` → `vineyard(tenantId, id)` · ON DELETE CASCADE _(composite — invisible to Prisma)_

### `vineyard_weather_alert_state`

Plan 096 Phase 3 (U19) — the escalation-dedup state that makes "notify once, escalate once, never repeat on the 6-hourly cron" survive restarts AND concurrency. The claim is a single conditional upsert (INSERT … ON CONFLICT DO UPDATE … WHERE "notifiedRank" < EXCLUDED."notifiedRank" RETURNING) — only the tx that WON the rank advance emits notifications (council C2; cron × on-view refresh race → one send). `notifiedRank` is the INTEGER tier order the SQL claim compares; `notifiedTier` is the display name. De-escalation (council C6): a WARNING+ key dropping below watch claims `clearedAt` the same way and emits ONE all-clear; a later re-crossing escalates fresh from rank 0 (no flapping). alertType families: FROST | HEAT | SUSTAINED_HEAT (identity = first day of the run, Codex DQ1).

_Prisma model: `VineyardWeatherAlertState`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` | Phase 12 tenant scope; FK+RLS at DB level |
| `id` | String | no | 🔑 | `cuid()` |  |
| `vineyardId` | String | no | 🔗 |  | composite FK → vineyard(tenantId, id) |
| `targetDate` | DateTime `Date` | no |  |  | the forecast night/day this alert is about (card date) |
| `alertType` | String | no |  |  | "FROST" \| "HEAT" \| "SUSTAINED_HEAT" (String union) |
| `notifiedTier` | String | yes |  |  | display tier last notified ("FROST_WATCH" … "HARD_FREEZE"); null = none/cleared |
| `notifiedRank` | Int | no |  | `0` | the claim comparator (0 none; family-relative order) |
| `lastNotifiedAt` | DateTime | yes |  |  |  |
| `clearedAt` | DateTime | yes |  |  | set by the all-clear claim; reset on re-escalation |
| `createdAt` | DateTime | no |  | `now()` |  |
| `updatedAt` | DateTime | no |  |  |  |

**References**

- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT
- `(tenantId, vineyardId)` → `vineyard(tenantId, id)` · ON DELETE CASCADE _(composite — invisible to Prisma)_

### `vineyard_weather_config`

Replaces the mutable snapshot (council R1): EXACTLY ONE row per vineyard (1:1), so the "one current config" invariant is STRUCTURAL — no partial index, no status flag. Holds the resolved primary provider + the grower override (effectivePrimary = primaryProviderOverride ?? primaryProviderKey, R14 — one shared helper so ingest and every read agree), the chosen reference station + station-vs-site elevation delta that explains the gap, and the coverage state (US_HIGH_RES via gridMET/Daymet | GLOBAL_COARSE via NASA POWER for non-US like Bhutan | UNAVAILABLE — never a blank). Attribution + last-refresh for the offline-rendered card.

_Prisma model: `VineyardWeatherConfig`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` | Phase 12 tenant scope; FK+RLS at DB level |
| `id` | String | no | 🔑 | `cuid()` |  |
| `vineyardId` | String | no | 🔗 |  | composite FK → vineyard(tenantId, id); 1:1 per vineyard |
| `primaryProviderKey` | String | no |  |  | resolved default primary (nearest quality station, else grid) |
| `primaryProviderOverride` | String | yes |  |  | grower's explicit choice; effectivePrimary = override ?? primaryProviderKey (R14) |
| `stationOverrideId` | String | yes |  |  | grower-chosen ACIS station sid (map pick); when set, ingest uses THIS station, not the auto-nearest |
| `stationId` | String | yes |  |  | active reference station id (RCC-ACIS / NOAA) — the override if chosen, else the auto-nearest |
| `stationName` | String | yes |  |  |  |
| `stationDistanceM` | Decimal `Decimal(12, 2)` | yes |  |  | station→site distance (m) |
| `stationElevationDeltaM` | Decimal `Decimal(10, 2)` | yes |  |  | station elevation − site elevation (m); explains any gap |
| `siteElevationM` | Decimal `Decimal(10, 2)` | yes |  |  | vineyard site elevation (USGS EPQS) |
| `primarySourceElevationM` | Decimal `Decimal(10, 2)` | yes |  |  | The elevation the PRIMARY daily series actually describes, as the provider itself reports it (NASA POWER publishes its grid-cell elevation; the Open-Meteo archive echoes its downscale target). primarySourceElevationM − siteElevationM is the fidelity delta that gates the temperature-derived CLASSIFICATIONS (source-fidelity-core): a coarse cell 1.8 km above a Bhutan vineyard read 9.7 °C cold and showed Winkler Region I at a Region V site. NULL = the provider does not publish it. |
| `coverageState` | String | no |  | `"UNAVAILABLE"` | String union: "US_HIGH_RES" \| "GLOBAL_COARSE" \| "UNAVAILABLE" |
| `attribution` | String | yes |  |  | combined provider attribution for the card |
| `lastRefreshAt` | DateTime | yes |  |  | last successful ingest |
| `timeZone` | String | yes |  |  | IANA zone, provider-reported (NWS points.timeZone / Open-Meteo timezone=auto); null = not yet resolved. Site-local "today" chain: this → AppSettings.timeZone → UTC (site-time-core) |
| `unitSystem` | String | yes |  |  | String union: "METRIC" \| "IMPERIAL" \| NULL (like coverageState — NOT a Prisma enum). Display-edge only; storage stays metric. Plan 098 Migration B: NULL = "Auto" — resolveWeatherUnitSystem chains override → winery prefs → geo default (us-coverage); a non-null value is the grower's explicit per-vineyard override. |
| `lastHistoryTopUpAt` | DateTime | yes |  |  | last monthly 3-yr full-year history top-up (sweep; council S3 — keeps the 13–24-month rainfall window from decaying) |
| `nwsGridId` | String | yes |  |  | NWS /points grid cache (plan 096 U11) — the mapping never changes for a fixed coordinate |
| `nwsGridX` | Int | yes |  |  |  |
| `nwsGridY` | Int | yes |  |  |  |
| `frostWatchC` | Decimal `Decimal(6, 3)` | no |  | `2` | Plan 096 U19 — per-vineyard alert thresholds (metric-stored; 36/32/28/95/100 °F equivalents). Defaults ONLY — no editing UI (user decision 2026-07-26); display converts via units-core. radiational cooling routinely undershoots the forecast min |
| `frostWarnC` | Decimal `Decimal(6, 3)` | no |  | `0` | damage to green tissue begins |
| `hardFreezeC` | Decimal `Decimal(6, 3)` | no |  | `-2` | severe shoot loss |
| `heatWatchC` | Decimal `Decimal(6, 3)` | no |  | `35` | photosynthesis shutdown (the 95 °F ask) |
| `extremeHeatC` | Decimal `Decimal(6, 3)` | no |  | `38` | sunburn / raisining on exposed fruit |
| `activeAlertsJson` | Json | yes |  |  | Plan 096 U22 (council C4) — the persisted NWS active-alerts banner: bounded array of {event, headline, severity, endsAt, url}, rendered verbatim between 6-hourly refreshes. |
| `activeAlertsFetchedAt` | DateTime | yes |  |  |  |
| `createdAt` | DateTime | no |  | `now()` |  |
| `updatedAt` | DateTime | no |  |  |  |

**References**

- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT
- `(tenantId, vineyardId)` → `vineyard(tenantId, id)` · ON DELETE CASCADE _(composite — invisible to Prisma)_

### `weather_provider_usage`

Per-tenant/DAY per-provider request counter (council R1/Codex#4): the enforcement key is DAILY (`dayKey @db.Date`) because NOAA CDO's cap is 10k/DAY (5 req/s) — a monthly key would mis-enforce it. Counts BILLABLE provider attempts (success or fail). Drives the sweep's headroom gate. Atomic upsert increments (usage-core).

_Prisma model: `WeatherProviderUsage`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` | Phase 12 tenant scope; FK+RLS at DB level |
| `dayKey` | DateTime `Date` | no |  |  | the daily billing bucket (UTC civil day) — the CDO daily-cap enforcement key |
| `provider` | String | no |  |  | "gridmet" \| "daymet" \| "nasa_power" \| "rcc_acis" \| "noaa_cdo" \| "usgs_epqs" |
| `requestCount` | Int | no |  | `0` | billable provider requests that day (success or fail) |
| `lastError` | String | yes |  |  |  |
| `updatedAt` | DateTime | no |  |  |  |

**References**

- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT

## Spray & pest

_The pesticide corpus, tenant product facts, and the append-only spray chain._ — 24 tables.

### `latent_infection_event`

_Prisma model: `LatentInfectionEvent`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` | Phase 12 tenant scope; FK+RLS at DB level |
| `id` | String | no | 🔑 | `cuid()` | immutable row identity, one per append |
| `logicalEventId` | String | no |  |  | the event STREAM (council C4) |
| `seq` | Int | no |  |  | 1-based append ordinal; unique per stream, so MAX(seq) is race-safe |
| `blockId` | String | no | 🔗 |  | composite FK → vineyard_block(tenantId, id) (raw SQL, K11) |
| `pathogen` | InfectionPathogen | no |  |  |  |
| `hostOrgan` | InfectionHostOrgan | no |  |  | first-class discriminator, not a detail (KD-3a) |
| `status` | InfectionEventStatus | no |  |  | the state THIS append asserts; no SUPERSEDED value — that is derived |
| `resolutionKind` | InfectionResolutionKind | no |  |  |  |
| `infectionOccurredOn` | DateTime `Date` | no |  |  |  |
| `symptomExpectedAt` | DateTime `Date` | yes |  |  | KD-3b — "visible" and "infectious" are different states and only one is what a scout sees. Each carries its own projection kind: NEVER encode epistemic state in a null (council C7). |
| `symptomProjectionKind` | InfectionProjectionKind | no |  |  |  |
| `symptomBasis` | String | yes |  |  |  |
| `infectiousExpectedAt` | DateTime `Date` | yes |  |  |  |
| `infectiousProjectionKind` | InfectionProjectionKind | no |  |  |  |
| `infectiousBasis` | String | yes |  |  |  |
| `latentShortDays` | Int | yes |  |  | FIXED_WINDOW arm. KD-4: the two bounds are used in OPPOSITE directions on purpose — latentShortDays projects infectiousExpectedAt (assuming later under-warns), latentLongDays drives expiresOn (closing earlier declares a block clean prematurely). Never averaged. |
| `latentLongDays` | Int | yes |  |  |  |
| `expiresOn` | DateTime `Date` | yes |  |  |  |
| `resolvedOn` | DateTime `Date` | yes |  |  |  |
| `resolutionNote` | String | yes |  |  |  |
| `supersedesRowId` | String | yes | 🔗 |  | self-FK NO ACTION (SET NULL would fire the immutability trigger mid-purge) |
| `reversesRowId` | String | yes | 🔗 |  |  |
| `evidenceSource` | InfectionEvidenceSource | no |  |  |  |
| `observationRef` | String | yes |  |  | opaque id only — no personal data ever enters this payload (D19) |
| `commandId` | String | no |  |  | idempotency: same commandId + same hash returns the original row (C5) |
| `requestHash` | String | no |  |  |  |
| `enteredById` | String | yes |  |  |  |
| `enteredByEmail` | String | no |  |  |  |
| `enteredAt` | DateTime | no |  | `now()` |  |
| `createdAt` | DateTime | no |  | `now()` |  |

**References**

- `(tenantId, blockId)` → `vineyard_block(tenantId, id)` · ON DELETE CASCADE _(composite — invisible to Prisma)_
- `(tenantId, reversesRowId)` → `latent_infection_event(tenantId, id)` _(composite — invisible to Prisma)_
- `(tenantId, supersedesRowId)` → `latent_infection_event(tenantId, id)` _(composite — invisible to Prisma)_
- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT

### `legacy_spray_mapping`

The human-confirmed name→product mapping for legacy FieldNote.spraysApplied entries (KD-9, council S11). Suggestion is a DETERMINISTIC normalized-name match — never an LLM, never a fuzzy score (rule §3.2); a human confirms. Even a CONFIRMED mapping yields confidence LOW (a field note has no timestamp and no rate — usable for rotation identity, never for residual). MUTABLE (status transitions) — deliberately NOT covered by the append-only trigger.

_Prisma model: `LegacySprayMapping`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` | Phase 12 tenant scope; FK+RLS at DB level |
| `id` | String | no | 🔑 | `cuid()` |  |
| `normalizedName` | String | no |  |  | via the existing normalizeInputKey |
| `displayName` | String | no |  |  |  |
| `epaRegistrationNumber` | String | yes |  |  |  |
| `productName` | String | yes |  |  |  |
| `status` | LegacySprayMappingStatus | no |  | `SUGGESTED` |  |
| `suggestionBasis` | String | no |  |  | deterministic rule name — never an LLM |
| `confirmedById` | String | yes |  |  |  |
| `confirmedByEmail` | String | yes |  |  |  |
| `confirmedAt` | DateTime | yes |  |  |  |
| `note` | String | yes |  |  |  |
| `createdAt` | DateTime | no |  | `now()` |  |
| `updatedAt` | DateTime | no |  |  |  |

**References**

- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT

### `pesticide_active_ingredient`

The AI dictionary. `name` is VERBATIM from APPRIL — normalization never rewrites identity (K5/G5); the salt/ester/hydrate collapse is expressed as parentActiveIngredientId (curated, cited in ai-normalization.json) and applied only for resistance-code assignment, never for identity. Hand-added in migration: partial UNIQUE on pcCode WHERE NOT NULL.

_Prisma model: `PesticideActiveIngredient`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `id` | String | no | 🔑 | `cuid()` |  |
| `pcCode` | String | yes |  |  | durable EPA PC code; partial unique WHERE NOT NULL (hand-added) |
| `casNumber` | String | yes |  |  |  |
| `name` | String | no |  |  | verbatim APPRIL string — identity, never rewritten |
| `normalizedName` | String | no |  |  | lowercased/whitespace-collapsed for exact-normalized joins |
| `parentActiveIngredientId` | String | yes | 🔗 |  | curated salt/ester/copper collapse target (G5) — assignment only |
| `lastSeenRevisionId` | String | yes |  |  |  |
| `createdAt` | DateTime | no |  | `now()` |  |
| `updatedAt` | DateTime | no |  |  |  |

**References**

- `(parentActiveIngredientId)` → `pesticide_active_ingredient(id)` · ON DELETE RESTRICT

### `pesticide_data_revision`

One ingest/derivation run. apprilAsOf/cdprAsOf come from the sources' Last-Modified; the artifact sha256 pins which curated resistance-codes.json produced the assignments. Together these four form the composite factsAsOf every lookup returns (K8 — a single scalar would be a false contract).

_Prisma model: `PesticideDataRevision`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `id` | String | no | 🔑 | `cuid()` |  |
| `status` | PesticideRevisionStatus | no |  | `RUNNING` |  |
| `startedAt` | DateTime | no |  | `now()` |  |
| `completedAt` | DateTime | yes |  |  |  |
| `apprilAsOf` | DateTime | yes |  |  |  |
| `cdprAsOf` | DateTime | yes |  |  |  |
| `resistanceArtifactSha256` | String | yes |  |  |  |
| `summary` | Json | yes |  |  |  |

### `pesticide_pest_category`

Spray S2b Unit 7b — the CODED PEST VOCABULARY (council GQ1), ingested from CA DPR's `target_pest.dat` in the SAME directory S2 already pulls. Tenant-GLOBAL reference data. ⚠️ THIS IS A CATEGORY, NOT A SPECIES, and nothing may present it as one. The probe (phases/S2b-cdpr-interval-probe.md) established that EPA APPRIL carries no target pest at all (`PEST_CAT` is the PRODUCT category) and DPR publishes exactly 41 coarse buckets — `C0 FUNGI`, `E0 INSECTS`, `J0 MITES/TICKS`. There is no public source for "powdery mildew". So the grower's free-text `spray_application.targetPest` stays the truth of record and this only ever rides alongside it as an optional coded companion, human-confirmed, never inferred.

_Prisma model: `PesticidePestCategory`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `code` | String | no | 🔑 |  | the 2-char DPR code: "C0", "E9", "M1" |
| `name` | String | no |  |  | "FUNGI", "BEETLES-COLEOPTERA (WEEVIL, BORER, WIREWORM)" |
| `sourceUrl` | String | no |  |  |  |
| `sourceAsOf` | DateTime | no |  |  |  |
| `revisionId` | String | yes |  |  | K14 mark-and-sweep watermark |
| `createdAt` | DateTime | no |  | `now()` |  |
| `updatedAt` | DateTime | no |  |  |  |

### `pesticide_product`

One row per registered product. epaRegNumber is the CANONICAL "COMPANY-PRODUCT[-DISTRIBUTOR]" string from parseRegistrationNumber (K6 — exact match only, never fuzzy). caRegNumber is schema room for S2b's CA-state-only products (adjuvants, FIFRA 25(b)) — G4: a NOT NULL epaRegNumber would make a legally-required tank component permanently unrepresentable. S2 ingests only EPA-numbered products. Hand-added in migration: partial UNIQUE on each reg number WHERE NOT NULL (Postgres treats NULLs as distinct) + CHECK that at least one is present.

_Prisma model: `PesticideProduct`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `id` | String | no | 🔑 | `cuid()` |  |
| `epaRegNumber` | String | yes |  |  | canonical form; partial unique WHERE NOT NULL (hand-added) |
| `caRegNumber` | String | yes |  |  | S2b schema room; partial unique WHERE NOT NULL (hand-added) |
| `productName` | String | no |  |  |  |
| `companyName` | String | yes |  |  |  |
| `labelDate` | DateTime | yes |  |  | attribute only — S2b owns product versioning; this is NOT a version key (C13) |
| `registrationStatus` | String | yes |  |  | raw source status string (APPRIL) — never interpreted, only displayed |
| `sourceStatus` | PesticideSourceStatus | no |  | `ACTIVE` | K14 sweep target |
| `labelNames` | String[] | no |  | `[]` |  |
| `pestCategoryRaw` | String | yes |  |  | raw PEST_CAT; NULL means UNKNOWN, not "no category" — 317 grape rows are blank |
| `lastSeenRevisionId` | String | yes |  |  |  |
| `createdAt` | DateTime | no |  | `now()` |  |
| `updatedAt` | DateTime | no |  |  |  |

### `pesticide_product_condition`

Environmental / tank-mix limits. Council S7 moved adjuvant requirement here because the real rule is conditional. brief §8.1: sulfur ≥85 °F during or immediately after application is the hard stop; §8.3: copper is the inverse (cool, humid, slow-drying).

_Prisma model: `PesticideProductCondition`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `id` | String | no | 🔑 | `cuid()` |  |
| `factsId` | String | no | 🔗 |  |  |
| `conditionKind` | PesticideConditionKind | no |  |  |  |
| `threshold` | Decimal `Decimal(10, 2)` | yes |  |  |  |
| `thresholdUnit` | String | yes |  |  |  |
| `severity` | PesticideConditionSeverity | no |  |  |  |
| `appliesWhen` | String | yes |  |  | "fruit present", "on stressed vines" — verbatim |
| `detail` | String | yes |  |  |  |

**References**

- `(factsId)` → `pesticide_product_facts(id)` · ON DELETE CASCADE

### `pesticide_product_facts`

Spray S2b Unit 2 — one curated FACT GROUP for one product label version. KD-1: keyed (epaRegNumber, factGroup, labelVersionKey) where labelVersionKey is the label date the REVIEWER read — NOT the upstream mutable labelDate (S2 council C13 withdrew that as a version key). Resolution is single-row BY CONSTRUCTION: a partial unique on supersededAt IS NULL guarantees at most one ACTIVE row per (reg, group), because the frozen ProductFactsKey carries no version selector and "pick the latest" would destroy the point of KD-1 (council C1).

_Prisma model: `PesticideProductFacts`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `id` | String | no | 🔑 | `cuid()` |  |
| `epaRegNumber` | String | no |  |  | canonical form, the durable natural key (never an FK — a fact must survive de-registration) |
| `factGroup` | PesticideFactGroup | no |  |  |  |
| `labelVersionKey` | String | no |  |  | the label date the reviewer actually read, ISO date string |
| `supersededAt` | DateTime | yes |  |  | NULL = the one ACTIVE row for this (reg, group). Superseded rows stay for replay. |
| `worstCasePhiDays` | Int | yes |  |  | ── REGULATORY group ─────────────────────────────────────────────────────── Scalars for the whole-product answers. PHI/REI live in the condition relations (KD-12); the scalars below are the WORST-CASE statutory bound the frozen scalar port must be fed, never an allowance. NULL everywhere means "the reviewer could not determine it" — never zero. max across phiConditions; what the scalar port receives |
| `worstCaseReiHours` | Int | yes |  |  | max across reiConditions; what the scalar port receives |
| `minRepeatIntervalDays` | Int | yes |  |  |  |
| `maxApplicationsPerSeason` | Int | yes |  |  |  |
| `maxAiPerSeasonAmount` | Decimal `Decimal(12, 4)` | yes |  |  |  |
| `maxAiPerSeasonUnit` | String | yes |  |  | e.g. "LB_AI_PER_ACRE" |
| `requiresBulletinCheck` | Boolean | yes |  |  | EPA Bulletins Live! Two — S2b records the FLAG; performing the check is Later |
| `adjuvantRequirement` | PesticideAdjuvantRequirement | yes |  |  |  |
| `rainfastHours` | Int | yes |  |  | ── AGRONOMIC group ──────────────────────────────────────────────────────── |
| `mobilityClass` | SprayMobilityClass | yes |  |  |  |
| `agronomicClass` | String[] | no |  | `[]` | KD-14: "Horticultural Oil", "Fixed Copper", "Elemental Sulfur" |
| `sourceUrl` | String | no |  |  | ── Provenance — MANDATORY, per group (KD-11 + rule §3.1) ────────────────── |
| `sourceTitle` | String | no |  |  |  |
| `sourceAsOf` | DateTime | no |  |  |  |
| `reviewedBy` | String | yes |  |  | NULL = a PROPOSAL (e.g. the CDPR seed), not yet a curated fact |
| `reviewedAt` | DateTime | yes |  |  |  |
| `reviewDueAt` | DateTime | no |  |  | KD-10: past due -> this group's fields degrade to UNKNOWN, siblings unaffected |
| `reviewNote` | String | yes |  |  |  |
| `revisionId` | String | yes |  |  | the PesticideDataRevision that last touched this row (K14 watermark) |
| `createdAt` | DateTime | no |  | `now()` |  |
| `updatedAt` | DateTime | no |  |  |  |

### `pesticide_product_ingredient`

_Prisma model: `PesticideProductIngredient`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `productId` | String | no | 🔗 |  |  |
| `activeIngredientId` | String | no | 🔗 |  |  |
| `percent` | Decimal `Decimal(8, 4)` | yes |  |  | label percent; null when APPRIL omits it |

**References**

- `(activeIngredientId)` → `pesticide_active_ingredient(id)` · ON DELETE RESTRICT
- `(productId)` → `pesticide_product(id)` · ON DELETE RESTRICT

### `pesticide_product_pest`

product → pest-category mapping from DPR's `prod_target_pest.dat`. Used to PROPOSE a code for a spray record's free-text target pest; a human confirms it (the trade-name-map pattern — never LLM-auto-applied, rule §3.2).

_Prisma model: `PesticideProductPest`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `id` | String | no | 🔑 | `cuid()` |  |
| `epaRegNumber` | String | no |  |  |  |
| `pestCode` | String | no | 🔗 |  |  |
| `revisionId` | String | yes |  |  |  |

**References**

- `(pestCode)` → `pesticide_pest_category(code)` · ON DELETE RESTRICT

### `pesticide_product_phi_condition`

KD-12 — PHI varies by rate and crop state, so the condition is free text the reviewer wrote and S7a renders verbatim. `isDefault` marks the unconditional label PHI.

_Prisma model: `PesticideProductPhiCondition`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `id` | String | no | 🔑 | `cuid()` |  |
| `factsId` | String | no | 🔗 |  |  |
| `days` | Int | no |  |  |  |
| `condition` | String | no |  |  | "at rates above 2 lb/A", "table grapes", "" for the default |
| `isDefault` | Boolean | no |  | `false` |  |

**References**

- `(factsId)` → `pesticide_product_facts(id)` · ON DELETE CASCADE

### `pesticide_product_rei_condition`

KD-12 — REI by activity. GENERAL is the label baseline; HAND_LABOR is the one that collides with the work-order calendar and the one a scalar would hide.

_Prisma model: `PesticideProductReiCondition`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `id` | String | no | 🔑 | `cuid()` |  |
| `factsId` | String | no | 🔗 |  |  |
| `activity` | PesticideEntryActivity | no |  |  |  |
| `hours` | Int | no |  |  |  |
| `note` | String | yes |  |  |  |

**References**

- `(factsId)` → `pesticide_product_facts(id)` · ON DELETE CASCADE

### `pesticide_resistance_assignment`

One assignment per (subject, scheme). `codes` is an ARRAY because the partial uniques allow exactly one row per subject per scheme and premix products legitimately carry several codes (Switch 9+12, Pristine 7+11, Zampro 45+40) — a scalar would force "9 alone", the exact K4 failure. K2's CHECK becomes (resolution = 'CODED') = (cardinality(codes) > 0): an empty array can never read as CODED, and a CODED row can never be empty. Hand-added in migration: 1. chk_pra_coded_has_codes — (resolution = 'CODED') = (cardinality(codes) > 0) (K2) 2. chk_pra_subject_exactly_one — exactly one of activeIngredientId/productId, matching subjectKind 3. chk_pra_product_not_ai_keyed — NOT (subjectKind = 'PRODUCT' AND derivedFrom = 'AI_KEYED_TABLE') (K4) 6. two partial uniques, one per subjectKind (C3 — @@unique over nullables does not dedupe)

_Prisma model: `PesticideResistanceAssignment`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `id` | String | no | 🔑 | `cuid()` |  |
| `subjectKind` | ResistanceSubjectKind | no |  |  |  |
| `activeIngredientId` | String | yes | 🔗 |  | set iff subjectKind = ACTIVE_INGREDIENT (CHECK 2) |
| `productId` | String | yes | 🔗 |  | set iff subjectKind = PRODUCT (CHECK 2) |
| `scheme` | ResistanceScheme | no |  |  |  |
| `resolution` | ResistanceResolution | no |  |  |  |
| `codes` | String[] | no |  | `[]` | non-empty ⟺ CODED (CHECK 1); e.g. ["9","12"] |
| `siteType` | ResistanceSiteType | no |  |  | required (K3) — rotation engines key off THIS, not code presence |
| `derivedFrom` | ResistanceDerivedFrom | no |  |  |  |
| `sourceUrl` | String | yes |  |  |  |
| `sourceTitle` | String | yes |  |  |  |
| `sourceAsOf` | DateTime | yes |  |  |  |
| `reviewedBy` | String | yes |  |  |  |
| `reviewedAt` | DateTime | yes |  |  |  |
| `revisionId` | String | yes |  |  |  |
| `createdAt` | DateTime | no |  | `now()` |  |
| `updatedAt` | DateTime | no |  |  |  |

**References**

- `(activeIngredientId)` → `pesticide_active_ingredient(id)` · ON DELETE RESTRICT
- `(productId)` → `pesticide_product(id)` · ON DELETE RESTRICT

### `pesticide_separation_rule`

KD-2 — a separation rule ASSERTED BY the subject product ABOUT a target, in ONE direction. Never a pairwise product×product matrix (~5.8M cells, uncurateable) and never a category table keyed on "oil" (brief §8.2: do not inherit JMS's rules into every oil).

_Prisma model: `PesticideSeparationRule`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `id` | String | no | 🔑 | `cuid()` |  |
| `factsId` | String | no | 🔗 |  | the SUBJECT's REGULATORY facts row |
| `targetKind` | PesticideSeparationTargetKind | no |  |  |  |
| `targetKey` | String | no |  |  | AI key, agronomic class tag, or EPA reg number depending on targetKind |
| `direction` | PesticideSeparationDirection | no |  |  |  |
| `minDays` | Int | no |  |  |  |
| `fruitPresentOnly` | Boolean | no |  | `false` |  |
| `condition` | String | yes |  |  | free text the reviewer wrote; rendered verbatim, never parsed |

**References**

- `(factsId)` → `pesticide_product_facts(id)` · ON DELETE CASCADE

### `pesticide_site_registration`

One row per (product, site string) from APPRIL. isGrape is the /\bGrapes?\b(?!fruit)/ discrimination; siteModifier is K11's bearing/non-bearing parse — a bare "Grapes" is UNSPECIFIED, never BEARING.

_Prisma model: `PesticideSiteRegistration`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `id` | String | no | 🔑 | `cuid()` |  |
| `productId` | String | no | 🔗 |  |  |
| `siteCodeRaw` | String | yes |  |  |  |
| `siteNameRaw` | String | no |  |  | verbatim APPRIL site string |
| `isGrape` | Boolean | no |  | `false` |  |
| `siteModifier` | PesticideSiteModifier | no |  | `UNSPECIFIED` |  |
| `lastSeenRevisionId` | String | yes |  |  |  |

**References**

- `(productId)` → `pesticide_product(id)` · ON DELETE RESTRICT

### `pesticide_state_registration`

K12: state registration is a required conjunct of legality — federal alone is never a clearance. S2 ships only CA (CDPR). siteCode "" = the state-level row (NOT NULL so the upsert key dedupes; Postgres would treat NULL site codes as distinct).

_Prisma model: `PesticideStateRegistration`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `id` | String | no | 🔑 | `cuid()` |  |
| `productId` | String | no | 🔗 |  |  |
| `state` | String | no |  |  | "CA" in S2 |
| `status` | PesticideStateRegStatus | no |  |  |  |
| `siteCode` | String | no |  | `""` | CDPR site code; "" = state-level row |
| `lastSeenRevisionId` | String | yes |  |  |  |

**References**

- `(productId)` → `pesticide_product(id)` · ON DELETE RESTRICT

### `pesticide_use_restriction`

Structured, non-binary restriction (Unit 7): kind + counties + the 24(c) SLN carve-out, with the label sentence VERBATIM so the citation is the source, not our paraphrase. A restriction we could not resolve is itself disqualifying (composition rule 3).

_Prisma model: `PesticideUseRestriction`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `id` | String | no | 🔑 | `cuid()` |  |
| `productId` | String | no | 🔗 |  |  |
| `state` | String | no |  |  |  |
| `counties` | String[] | no |  | `[]` |  |
| `kind` | String | no |  |  | e.g. "county-prohibition" \| "aerial-application-prohibited" |
| `exception` | String | yes |  |  | "24c-sln" \| null — Luna's carve-out is not a plain ban |
| `quote` | String | no |  |  | verbatim label sentence (the citation) |
| `lastSeenRevisionId` | String | yes |  |  |  |

**References**

- `(productId)` → `pesticide_product(id)` · ON DELETE RESTRICT

### `planned_harvest_date_event`

Planned harvest date per block-vintage-pass as an AUDITED EVENT STREAM (KD-8, Shape D — the VineyardGeometryVersion closed-interval pattern; council D4). One open row per (tenant, block, vintage, passLabel) via a partial unique index (raw SQL); ZERO open rows is legal and is how "no planned date" is represented — retraction closes without a successor (council C3). Split picks are ordinary viticulture (council G4): harvestPassLabel keys them. The stream IS the outbox: S7a consumes plannedHarvestChangesSince(cursor) as a watermark read (council C4 — no in-process listener to lose on a crash). Trigger allowlists only effectiveTo + status. plannedDate crosses every boundary as an ISO YYYY-MM-DD string (KD-13/C6).

_Prisma model: `PlannedHarvestDateEvent`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` | Phase 12 tenant scope; FK+RLS at DB level |
| `id` | String | no | 🔑 | `cuid()` |  |
| `blockId` | String | no | 🔗 |  | composite FK -> vineyard_block(tenantId,id) RESTRICT, raw SQL (K11) |
| `vintageYear` | Int | no |  |  |  |
| `harvestPassLabel` | String | no |  | `"main"` | council G4 — split picks |
| `plannedDate` | DateTime `Date` | no |  |  | written via toISODateUTC only (KD-13) |
| `version` | Int | no |  |  |  |
| `effectiveFrom` | DateTime | no |  | `now()` |  |
| `effectiveTo` | DateTime | yes |  |  | NULL = current/open |
| `status` | PlannedHarvestStatus | no |  | `ACTIVE` |  |
| `reason` | String | yes |  |  |  |
| `enteredById` | String | yes |  |  |  |
| `enteredByEmail` | String | no |  |  |  |
| `enteredAt` | DateTime | no |  | `now()` |  |

**References**

- `(tenantId, blockId)` → `vineyard_block(tenantId, id)` · ON DELETE RESTRICT _(composite — invisible to Prisma)_
- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT

### `spray_application`

The pass header — one physical spray pass, lifted from the real work-order template (docs/spray orders/Spray work order template.xlsx). APPEND-ONLY content: a mistake is corrected by appending a new revision (KD-1), never an in-place edit; the DB trigger allowlists only `status` + `supersededByApplicationId` (bookkeeping, writable once, NULL → value only). Cross-site passes are ALLOWED (KD-12 / council G6): vineyardId is the PRIMARY site; block lines may span vineyards and PUR grouping resolves per block line at read time.

_Prisma model: `SprayApplication`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` | Phase 12 tenant scope; FK+RLS at DB level |
| `id` | String | no | 🔑 | `cuid()` |  |
| `vineyardId` | String | no | 🔗 |  | primary site (defaulted from the first block line); composite FK -> vineyard(tenantId,id) RESTRICT, raw SQL (K11) |
| `applicatorUserId` | String | yes |  |  | Applicator (durable snapshots — the FieldNote.userEmail pattern; PUR needs all three ids, council G8) |
| `applicatorName` | String | no |  |  |  |
| `applicatorLicense` | String | yes |  |  |  |
| `operatorIdNumber` | String | yes |  |  | CA PUR Operator Identification Number (council G8) |
| `countyPermitNumber` | String | yes |  |  | the site's county permit (council G8) |
| `applicationMethod` | SprayApplicationMethod | no |  |  | The pass |
| `startedAt` | DateTime | no |  |  | UTC instant; PHI/REI day boundaries resolve in the winery operating tz at read (KD-13) |
| `finishedAt` | DateTime | yes |  |  |  |
| `targetPest` | String | yes |  |  | entered free text |
| `targetPestCode` | String | yes |  |  | nullable slot for a coded DPR/EPA pest — table is S2b's, export is Phase 20's (council GQ1) |
| `rowPattern` | SprayRowPattern | yes |  |  |  |
| `dilutionMode` | SprayDilutionMode | yes |  |  |  |
| `sprayVolumePerHaL` | Decimal `Decimal(18, 8)` | yes |  |  | Coverage inputs (brief §12) — canonical metric (KD-5) |
| `groundSpeedKph` | Decimal `Decimal(10, 2)` | yes |  |  |  |
| `tankVolumeL` | Decimal `Decimal(18, 8)` | yes |  |  | tank SIZE — not the carrier volume used |
| `carrierWaterVolumeL` | Decimal `Decimal(18, 8)` | yes |  |  | council GQ3 — the water actually in the tank |
| `sprayWaterPh` | Decimal `Decimal(4, 2)` | yes |  |  | brief §8.5 — alkaline water hydrolyzes OPs/carbamates |
| `airTempC` | Decimal `Decimal(10, 2)` | yes |  |  | Weather at application (council S5 — distinct columns, never a blob) |
| `windSpeedKph` | Decimal `Decimal(10, 2)` | yes |  |  |  |
| `windDirection` | SprayWindDirection | yes |  |  | the entered truth (KD-15) |
| `windDirectionDeg` | Int | yes |  |  | measured/sensor only, never operator-typed; CHECK 0–359 in migration |
| `relHumidityPct` | Decimal `Decimal(10, 2)` | yes |  |  |  |
| `weatherObservedAt` | DateTime | yes |  |  |  |
| `weatherSource` | SprayWeatherSource | yes |  |  |  |
| `sprayRigName` | String | yes |  |  | Phase 20 seam — plain columns now; Phase 20 adds equipment FKs beside them and backfills |
| `tractorName` | String | yes |  |  |  |
| `gearSetting` | String | yes |  |  |  |
| `status` | SprayRecordStatus | no |  | `ACTIVE` | Correction chain (KD-1) — at-most-once via @@unique([tenantId, supersedesApplicationId]); both pointers are raw-SQL composite self-FKs (council C9) |
| `revision` | Int | no |  | `1` |  |
| `supersedesApplicationId` | String | yes | 🔗 |  | content: set at insert, immutable |
| `supersededByApplicationId` | String | yes | 🔗 |  | bookkeeping: writable once, NULL -> value only (trigger-enforced) |
| `correctionKind` | SprayCorrectionKind | yes |  |  |  |
| `correctionReason` | String | yes |  |  |  |
| `enteredById` | String | yes |  |  | Provenance |
| `enteredByEmail` | String | no |  |  |  |
| `enteredAt` | DateTime | no |  | `now()` |  |
| `captureMethod` | CaptureMethod | no |  | `MANUAL` |  |
| `commandId` | String | yes |  |  | client idempotency key; retry semantics via requestHash (council C8) |
| `requestHash` | String | yes |  |  | hash of the payload — uniqueness is not idempotency |
| `notes` | String | yes |  |  |  |

**References**

- `(tenantId, supersededByApplicationId)` → `spray_application(tenantId, id)` _(composite — invisible to Prisma)_
- `(tenantId, supersedesApplicationId)` → `spray_application(tenantId, id)` _(composite — invisible to Prisma)_
- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT
- `(tenantId, vineyardId)` → `vineyard(tenantId, id)` · ON DELETE RESTRICT _(composite — invisible to Prisma)_

### `spray_block_line`

One block × one segment of one pass — THE TABLE S6/S7a/S8 READ. treatedAreaHa is a SNAPSHOT at entry (KD-6), never re-derived — block acreage is spacing-derived and changes on replant, and a past rate/acre must not silently change. Per-block startedAt/finishedAt are what the REI and residual clocks read; a null finishedAt resolves them to UNKNOWN and NEVER falls back to the header timestamp (council G2/C14 — a fallback clears a block still under restricted entry). segmentNo: the same block can legitimately appear twice in one pass (council G7 — breakdown, flush, resume). APPEND-ONLY content; the three driedBeforeRain* columns are DERIVED (KD-2, recomputable — allowlisted in the trigger); the human override lives in spray_drying_override.

_Prisma model: `SprayBlockLine`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` | Phase 12 tenant scope; FK+RLS at DB level |
| `id` | String | no | 🔑 | `cuid()` |  |
| `applicationId` | String | no | 🔗 |  | composite FK -> spray_application(tenantId,id) CASCADE, raw SQL (K11) |
| `blockId` | String | no | 🔗 |  | composite FK -> vineyard_block(tenantId,id) RESTRICT — a block with spray history cannot be deleted |
| `segmentNo` | Int | no |  | `1` |  |
| `blockLabelSnapshot` | String | no |  |  | Snapshots (KD-6 / council CQ2) |
| `treatedAreaHa` | Decimal `Decimal(18, 8)` | no |  |  |  |
| `treatedAreaSource` | SprayAreaSource | no |  |  |  |
| `treatedAreaNote` | String | yes |  |  |  |
| `startedAt` | DateTime | yes |  |  | Per-block timing (council S4) — nullable ON PURPOSE: forcing NOT NULL makes operators type a fake time |
| `finishedAt` | DateTime | yes |  |  |  |
| `tankBatchRef` | String | yes |  |  | Tanks (Phase 20 columns — S3a reads them only to compute a rate basis) |
| `estTanks` | Decimal `Decimal(10, 2)` | yes |  |  |  |
| `tanksUsed` | Decimal `Decimal(10, 2)` | yes |  |  |  |
| `volumeUsedL` | Decimal `Decimal(18, 8)` | yes |  |  |  |
| `computedVolumePerHaL` | Decimal `Decimal(18, 8)` | yes |  |  | Computed carrier rate (KD-7 — material rate is derived on demand by materialRatePerHa, never stored) |
| `rateBasis` | SprayRateBasis | no |  |  |  |
| `depositionMethod` | SprayDepositionMethod | yes |  |  | Deposition evidence (council S4 — S6's confidence legitimately falls when none exists) |
| `depositionAdequate` | Boolean | yes |  |  |  |
| `depositionCheckedAt` | DateTime | yes |  |  |  |
| `depositionNote` | String | yes |  |  |  |
| `driedBeforeRainDerived` | Boolean | yes |  |  | DERIVED (KD-2) — recomputable at will, carries its own basis + timestamp; never self-reported |
| `driedBeforeRainBasis` | SprayDriedBasis | yes |  |  |  |
| `driedBeforeRainDerivedAt` | DateTime | yes |  |  |  |
| `snapshotJurisdictionCountry` | String | yes |  |  | Spray S2b Unit 1 (KD-9, council C3) — the jurisdiction SNAPSHOT, resolved per BLOCK LINE at record time. Two defects this closes, both found in review: 1. A pass spans blocks in DIFFERENT vineyards, so one application-level jurisdiction is simply wrong for some block lines. The block is the only correct granularity. 2. vineyard_detail.regulatoryState is MUTABLE. Reading it later means an admin editing the vineyard silently changes what a PAST decision meant — a direct violation of rule §3.8 (decisions replay under facts-as-of-then). Downstream legality reads consume THIS, never the live vineyard row. NULL = the vineyard had no confirmed jurisdiction when this was recorded -> cannot-determine, never a clearance (rule §3.6). |
| `snapshotJurisdictionState` | String | yes |  |  |  |
| `createdAt` | DateTime | no |  | `now()` |  |

**References**

- `(tenantId, applicationId)` → `spray_application(tenantId, id)` · ON DELETE CASCADE _(composite — invisible to Prisma)_
- `(tenantId, blockId)` → `vineyard_block(tenantId, id)` · ON DELETE RESTRICT _(composite — invisible to Prisma)_
- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT

### `spray_drying_override`

An attributed human override of the driedBeforeRain derivation (KD-2). Its OWN append-only table — never a mutable column. Latest by (enteredAt, id) wins; the whole history is retained because an override changes a residual estimate and must replay. The trigger allowlists NOTHING on this table (council C5).

_Prisma model: `SprayDryingOverride`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` | Phase 12 tenant scope; FK+RLS at DB level |
| `id` | String | no | 🔑 | `cuid()` |  |
| `blockLineId` | String | no | 🔗 |  | composite FK -> spray_block_line(tenantId,id) CASCADE, raw SQL (K11) |
| `value` | Boolean | no |  |  |  |
| `reason` | String | no |  |  |  |
| `observedAt` | DateTime | no |  |  |  |
| `enteredById` | String | yes |  |  |  |
| `enteredByEmail` | String | no |  |  |  |
| `enteredAt` | DateTime | no |  | `now()` |  |

**References**

- `(tenantId, blockLineId)` → `spray_block_line(tenantId, id)` · ON DELETE CASCADE _(composite — invisible to Prisma)_
- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT

### `spray_material_line`

One material in the tank for one pass. Product identity is a STRING key (no FK to S2 — KD-10); the facts-as-of snapshot (KD-4, rule §3.8) freezes what the registry said at entry so the record replays under facts-as-of-then. A correction COPIES the snapshot verbatim (KD-14) unless this line's own product identity changed. APPEND-ONLY: no column is ever updated. `[]` with known=false means "we do not know"; `[]` with known=true is impossible (DB CHECK, council C7 — the most important finding in the review; invariant SPRAY-3).

_Prisma model: `SprayMaterialLine`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` | Phase 12 tenant scope; FK+RLS at DB level |
| `id` | String | no | 🔑 | `cuid()` |  |
| `applicationId` | String | no | 🔗 |  | composite FK -> spray_application(tenantId,id) CASCADE, raw SQL (K11) |
| `lineNo` | Int | no |  |  |  |
| `productName` | String | no |  |  | Product identity (KD-10 — nullable EPA number, Bhutan is a live tenant) |
| `epaRegistrationNumber` | String | yes |  |  |  |
| `tenantProductRef` | String | yes |  |  |  |
| `productIdentitySource` | SprayProductIdentitySource | no |  |  |  |
| `materialRole` | SprayMaterialRole | no |  |  | Role (council C9) |
| `adjuvantClass` | SprayAdjuvantClass | yes |  |  | set iff materialRole = ADJUVANT (DB CHECK) |
| `quantityEntered` | Decimal `Decimal(18, 8)` | no |  |  | Quantity (KD-5) — stored AS ENTERED (the legally-filed number) AND canonically |
| `quantityUnit` | SprayQuantityUnit | no |  |  |  |
| `quantityBasis` | SprayQuantityBasis | no |  |  | council G3 — required; never guessed |
| `quantityCanonical` | Decimal `Decimal(18, 8)` | no |  |  |  |
| `quantityDimension` | SprayQuantityDimension | no |  |  |  |
| `enteredReiHours` | Int | yes |  |  | As written on the form (template C7/F7/G7) — a divergence from the snapshot is a data-quality signal |
| `enteredPhiDays` | Int | yes |  |  |  |
| `enteredActiveIngredient` | String | yes |  |  |  |
| `snapshotPhiDays` | Int | yes |  |  | Facts-as-of snapshot (KD-4 — the BottlingCostSnapshot pattern) |
| `snapshotReiHours` | Int | yes |  |  |  |
| `snapshotRainfastHours` | Decimal `Decimal(10, 2)` | yes |  |  |  |
| `snapshotMobilityClass` | SprayMobilityClass | yes |  |  |  |
| `snapshotResistanceGroups` | String[] | no |  |  | scheme-prefixed ("FRAC:7","FRAC:11"); GIN index in migration (council C12) |
| `resistanceGroupsKnown` | Boolean | no |  | `false` | council C7 — [] must never read as "no groups used" |
| `snapshotActiveIngredientKeys` | String[] | no |  |  | normalized AI keys ("SULFUR"); GIN index in migration |
| `activeIngredientsKnown` | Boolean | no |  | `false` |  |
| `snapshotActiveIngredients` | Json | yes |  |  | [{ name, percentByWeight, casNumber }] — human-readable decomposition |
| `factsPublishedRevisionId` | String | yes |  |  | The facts-as-of watermark is a COMPOSITE, not a scalar — it mirrors S2's frozen `PesticideFactsAsOf` contract verbatim (docs/spray_assistant/phases/S2-S3a-factsAsOf-contract.md). One legality lookup spans four sources on different cadences (EPA APPRIL publishes when it publishes, CDPR nightly, the curated resistance artifact only when a human commits it, plus the revision row); a single scalar would falsely imply they all moved together. A NULL component means "we have never published that source" — render unknown, never "current" (rule §3.6). S2's PesticideDataRevision cuid (NOT an Int — that was the S3a↔S2 seam defect) |
| `factsApprilAsOf` | DateTime | yes |  |  | EPA APPRIL dump's own Last-Modified |
| `factsCdprAsOf` | DateTime | yes |  |  | CA DPR product.dat's own Last-Modified |
| `factsResistanceArtifactSha256` | String | yes |  |  | sha256 of the committed resistance-codes.json |
| `factsProductFactsArtifactSha256` | String | yes |  |  | S2b Unit 4 axis A — THE FIFTH SOURCE. The curated product-facts artifact moves on its own cadence (a human commits it), so per the contract's change rule it gets its OWN component rather than overloading one of S2's four. Additive, and cheap ONLY while this table holds zero rows. |
| `factsProductFactsAsOf` | DateTime | yes |  |  |  |
| `factsAsOf` | DateTime | yes |  |  | Display/staleness convenience ONLY — the newest non-null component above. Never the key an engine compares on; compare the component that matters to the question being asked. |
| `factsSource` | SprayFactsSource | no |  | `NONE` |  |
| `factsCompleteness` | SprayFactsCompleteness | no |  | `UNKNOWN` |  |
| `regulatorySource` | SprayFactsSource | no |  | `NONE` | S2b Unit 4 axis B — FACT-GROUP PROVENANCE (KD-11). A DIFFERENT question from "which registry generation": these say which SOURCE each group's values came from and how fresh each was AT WRITE TIME, so a record read months later still reports that its agronomic half was already stale when the grower acted. Conflating this with the registry watermark above is exactly how the scalar-vs-composite defect happened, so they are deliberately separate columns. |
| `regulatoryAsOf` | DateTime | yes |  |  |  |
| `regulatoryStaleAtWrite` | Boolean | no |  | `false` |  |
| `agronomicSource` | SprayFactsSource | no |  | `NONE` |  |
| `agronomicAsOf` | DateTime | yes |  |  |  |
| `agronomicStaleAtWrite` | Boolean | no |  | `false` |  |
| `createdAt` | DateTime | no |  | `now()` |  |

**References**

- `(tenantId, applicationId)` → `spray_application(tenantId, id)` · ON DELETE CASCADE _(composite — invisible to Prisma)_
- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT

### `spray_mix_order_line`

The pour sequence — separate from material lines because mixing order is a COMPATIBILITY rule (brief §8.5: water → compatibility agent → WDG → WP → SC → EC → surfactant/oil last). Water and compatibility agents are mix-order lines with a null materialLineId. APPEND-ONLY.

_Prisma model: `SprayMixOrderLine`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` | Phase 12 tenant scope; FK+RLS at DB level |
| `id` | String | no | 🔑 | `cuid()` |  |
| `applicationId` | String | no | 🔗 |  | composite FK -> spray_application(tenantId,id) CASCADE, raw SQL (K11) |
| `sequence` | Int | no |  |  |  |
| `materialDescription` | String | no |  |  |  |
| `amountPerTankEntered` | Decimal `Decimal(18, 8)` | yes |  |  |  |
| `amountPerTankUnit` | SprayQuantityUnit | yes |  |  |  |
| `materialLineId` | String | yes | 🔗 |  | composite FK (tenantId, applicationId, materialLineId) -> spray_material_line(tenantId, applicationId, id) — council C10 |
| `createdAt` | DateTime | no |  | `now()` |  |

**References**

- `(tenantId, applicationId)` → `spray_application(tenantId, id)` · ON DELETE CASCADE _(composite — invisible to Prisma)_
- `(tenantId, applicationId, materialLineId)` → `spray_material_line(tenantId, applicationId, id)` _(composite — invisible to Prisma)_
- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT

### `tenant_product_facts`

Spray S2b Unit 5 — the GROWER-SUPPLIED facts override. TENANT-SCOPED and RLS-isolated (full AGENTS.md Phase-12 checklist) — this is the ONE S2b table that is NOT global, and it must NOT be added to GLOBAL_MODELS. Built once, serves two cases (council C6 + P1): the non-US tenant that has no EPA registry at all (rule §3.9 — Bhutan is LIVE and the app must never brick outside the US), and the US grower overriding a product our registry cannot resolve. ⚠️ KD-4: reads of this table are NOT behind isPesticideSourceEnabled. The entitlement gate exists to protect a data source WE ship; gating data the grower typed in themselves would re-brick the non-US tenant through the back door. ⚠️ KD-3: precedence is per GROUP and whole-group. A tenant AGRONOMIC override leaves the registry REGULATORY group live and still receiving label updates. Never blended within a group.

_Prisma model: `TenantProductFacts`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` | Phase 12 tenant scope; FK -> organization(id) RESTRICT + RLS at DB level |
| `id` | String | no | 🔑 | `cuid()` |  |
| `productRef` | String | no |  |  | The tenant's own product handle — normalized, and the join key when there is no EPA number. |
| `productName` | String | no |  |  |  |
| `epaRegistrationNumber` | String | yes |  |  | OPTIONAL by design: a Bhutanese product has none |
| `factGroup` | PesticideFactGroup | no |  |  |  |
| `worstCasePhiDays` | Int | yes |  |  |  |
| `worstCaseReiHours` | Int | yes |  |  |  |
| `minRepeatIntervalDays` | Int | yes |  |  |  |
| `maxApplicationsPerSeason` | Int | yes |  |  |  |
| `rainfastHours` | Int | yes |  |  |  |
| `mobilityClass` | SprayMobilityClass | yes |  |  |  |
| `agronomicClass` | String[] | no |  | `[]` |  |
| `adjuvantRequirement` | PesticideAdjuvantRequirement | yes |  |  |  |
| `enteredBy` | String | no |  |  | Attribution is mandatory (rule §3.9: "grower-supplied, not registry-verified"). There is no reviewedBy here — the grower IS the source, and the resolver stamps provenance "grower-supplied" + source TENANT_DEFINED so no surface can mistake this for registry data. |
| `enteredAt` | DateTime | no |  | `now()` |  |
| `note` | String | yes |  |  |  |
| `createdAt` | DateTime | no |  | `now()` |  |
| `updatedAt` | DateTime | no |  |  |  |

**References**

- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT

## The land

_Vineyards, blocks, plantings, and the geospatial layers over them._ — 20 tables.

### `block_soil_snapshot`

───────────────────────── Vineyard Intelligence P4: soil documentation (NRCS SSURGO) ───────────────────────── Brief Release 1C. One server-side SDA clip pull per reviewed US block polygon → a dated, sourced, per-map-unit soil snapshot. Cards-first (NO map components). SDA is public/keyless — no env secret; the only wiring is the outbound host allowlist. Follows the AGENTS.md Phase-12 checklist like the P2 tables: tenantId + RLS + composite (tenantId, blockId)→vineyard_block(tenantId, id) FK (K11 raw-SQL, no @relation). SUPERSEDE-NOT-DELETE: exactly one CURRENT row per block (partial unique on supersededAt IS NULL, declared in the migration — Prisma can't express a partial index), superseded rows retained (correction-as-event; a sourced soil claim can end up on a label). A boundary edit does NOT delete — the UI compares the block's current fingerprint to `polygonFingerprint` and shows a stale badge; a re-pull supersedes. NO BLENDED PROPERTIES (the whole point): `components` is one entry per map unit with each property cited to its mukey at NRCS's published level; area % is the only value we aggregate. `coverageState`/`class` are String unions, not enums (Windows enum-ordering trap; dodges an ALTER TYPE serialization vs the P8 lane).

_Prisma model: `BlockSoilSnapshot`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` | Phase 12 tenant scope; FK+RLS at DB level |
| `id` | String | no | 🔑 | `cuid()` |  |
| `blockId` | String | no | 🔗 |  | composite FK → vineyard_block(tenantId, id) (raw-SQL K11) |
| `vineyardId` | String | no | 🔗 |  | denormalised for per-vineyard reads; part of the WIDENED block key |
| `pulledAt` | DateTime | no |  | `now()` | (tenantId, blockId, vineyardId) -> vineyard_block(tenantId, id, vineyardId) — cannot drift. |
| `supersededAt` | DateTime | yes |  |  | null = the one CURRENT snapshot; set = retained history |
| `surveyAreaSymbol` | String | yes |  |  | NRCS sacatalog areasymbol(s) covering the block (may be null pre-resolve) |
| `surveyAreaVersion` | String | yes |  |  | sacatalog.saverest — SSURGO is revised annually; a filed claim must be reproducible |
| `polygonFingerprint` | String | no |  |  | frame-stable canonical fingerprint (geometry-meta) — staleness signal + cache key |
| `geometryVersion` | Int | no |  |  | the block geometryVersion this snapshot was computed against |
| `coveredPct` | Decimal `Decimal(9, 6)` | no |  |  | Σ(clipped area)/block area; may exceed 1 (over-coverage anomaly) |
| `coverageState` | String | no |  |  | "covered" \| "partial" \| "over" \| "none" (String union, not an enum) |
| `blockAreaSqM` | Decimal `Decimal(16, 2)` | no |  |  | geodesic block area (local), the display denominator [council C3] |
| `components` | Json | no |  |  | validated-on-read array; one entry per map unit (mukey + class + share + cited properties) |
| `displayGeometry` | Json | yes |  |  | OPTIONAL block-clipped display geometry (FeatureCollection, per-mukey) for the map overlay — NOT authoritative (design §13.6); null until a pull returns renderable geometry |
| `processingVersion` | String | no |  |  | query/algorithm version for provenance |
| `attribution` | String | yes |  |  | NRCS attribution string |
| `createdBy` | String | yes |  |  |  |
| `createdAt` | DateTime | no |  | `now()` |  |

**References**

- `(tenantId, blockId, vineyardId)` → `vineyard_block(tenantId, id, vineyardId)` · ON DELETE CASCADE _(composite — invisible to Prisma)_
- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT

### `block_spatial_metric`

An IMMUTABLE per-block statistics snapshot (council Q1). Permanently bound to the geometryVersion it was computed against — geometryVersion is IN the uniqueness key so a v3 and a v4 reading coexist and history is never overwritten. A boundary edit ANNOTATES via geometry-version.markStaleFor, never hides/invalidates these rows. Below the 0.5 valid floor (council Q3) the summary stats are null + qualityFlags carries INSUFFICIENT_VALID_COVERAGE (counts + coverage still recorded — never a biased partial-coverage mean).

_Prisma model: `BlockSpatialMetric`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` | Phase 12 tenant scope; FK+RLS at DB level |
| `id` | String | no | 🔑 | `cuid()` |  |
| `blockId` | String | no | 🔗 |  | composite FK → vineyard_block(tenantId, id) |
| `datasetId` | String | no | 🔗 |  | composite FK → spatial_dataset(tenantId, id) |
| `vineyardId` | String | no | 🔗 |  | denormalised for per-vineyard reads. NOT unconstrained: it is part of the |
| `metric` | SpatialMetric | no |  | `NDVI` | WIDENED block key (tenantId, blockId, vineyardId) -> vineyard_block(tenantId, id, vineyardId), so it cannot disagree with the block's vineyard. No extra cascade path — the block FK just got wider. |
| `acquiredAt` | DateTime | no |  |  | copied from the dataset's scene (the analysis axis) |
| `min` | Decimal `Decimal(8, 5)` | yes |  |  | ZonalStats (P0) — Decimal, NULLABLE (null below the valid floor). |
| `p10` | Decimal `Decimal(8, 5)` | yes |  |  |  |
| `p25` | Decimal `Decimal(8, 5)` | yes |  |  |  |
| `median` | Decimal `Decimal(8, 5)` | yes |  |  |  |
| `mean` | Decimal `Decimal(8, 5)` | yes |  |  |  |
| `p75` | Decimal `Decimal(8, 5)` | yes |  |  |  |
| `p90` | Decimal `Decimal(8, 5)` | yes |  |  |  |
| `max` | Decimal `Decimal(8, 5)` | yes |  |  |  |
| `stdDev` | Decimal `Decimal(8, 5)` | yes |  |  |  |
| `intersectingPixelCount` | Int | no |  |  | pixels whose footprint intersects the block |
| `validPixelCount` | Int | no |  |  | intersecting pixels that survived the SCL mask |
| `effectivePixelCount` | Decimal `Decimal(14, 4)` | no |  |  | S4: Σcoverage weights — the weighted-mean denominator |
| `validFraction` | Decimal `Decimal(7, 6)` | no |  |  | validPixelCount / intersectingPixelCount, [0,1] |
| `coveredAreaM2` | Decimal `Decimal(16, 2)` | no |  |  | Σcoverage × pixelArea |
| `mixedPixelShare` | Decimal `Decimal(7, 6)` | no |  |  | share of partial-coverage (edge) pixels, [0,1] |
| `qualityFlags` | Json | no |  |  | e.g. ["INSUFFICIENT_VALID_COVERAGE"] |
| `processingVersion` | String | yes |  |  | provenance passthrough |
| `geometryVersion` | Int | no |  |  | Q1: the block geometry version these stats were computed against (IN the unique key) |
| `geometryFingerprint` | String | no |  |  | Q1: the canonical-form fingerprint of that geometry |
| `createdAt` | DateTime | no |  | `now()` |  |

**References**

- `(tenantId, blockId, vineyardId)` → `vineyard_block(tenantId, id, vineyardId)` · ON DELETE CASCADE _(composite — invisible to Prisma)_
- `(tenantId, datasetId)` → `spatial_dataset(tenantId, id)` · ON DELETE CASCADE _(composite — invisible to Prisma)_
- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT

### `cdse_usage_counter`

Per-tenant/month CDSE quota + blob-egress telemetry (mirror WeighTagCounter's one-row-per-key shape). Counts BILLABLE PROVIDER ATTEMPTS, not successful datasets (S6) — a failed fetch still spends a request/PU. Drives the visible quota counter + the DARK auto-add headroom gate (rule §2.8). Atomic upsert increments.

_Prisma model: `CdseUsageCounter`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` | Phase 12 tenant scope; FK+RLS at DB level |
| `yearMonth` | String | no |  |  | "YYYY-MM" (the tenant's billing bucket) |
| `requestCount` | Int | no |  | `0` | billable provider requests (success or fail) |
| `processingUnits` | Decimal `Decimal(14, 4)` | no |  | `0` | CDSE PU consumed |
| `blobEgressBytes` | BigInt | no |  | `0` | raster bytes read out of blob |
| `updatedAt` | DateTime | no |  |  |  |

**References**

- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT

### `field_input`

Master list of sprays/fertilizers. `normalizedKey` (strip-all-non-alphanumeric UPPERCASE) dedupes "NEEM OIL" / "NEEM-OIL" to one row; `name` keeps the label.

_Prisma model: `FieldInput`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` | Phase 12 tenant scope (nullable U2 -> backfill U3 -> NOT NULL U5); FK+RLS at DB level |
| `id` | String | no | 🔑 | `cuid()` |  |
| `type` | String | no |  |  | SPRAY \| FERTILIZER |
| `name` | String | no |  |  | display, cleaned UPPERCASE |
| `normalizedKey` | String | no |  |  | dedup key, strip-all-non-alphanumeric UPPERCASE |
| `isActive` | Boolean | no |  | `true` |  |
| `createdAt` | DateTime | no |  | `now()` |  |

**References**

- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT

### `field_note`

───────────────────────── Vineyard operations: field notes ───────────────────────── One canonical weekly field report per vineyard (Friday-anchored). JSON columns hold the LLM-friendly weather / inputs / per-block status payloads; vineyard + manager stay real FKs for querying. `userEmail` snapshots provenance (mirror BottlingRun) so deleting the manager (SetNull) never erases who logged it.

_Prisma model: `FieldNote`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` | Phase 12 tenant scope (nullable U2 -> backfill U3 -> NOT NULL U5); FK+RLS at DB level |
| `id` | String | no | 🔑 | `cuid()` |  |
| `vineyardId` | String | no | 🔗 |  |  |
| `userId` | String | yes | 🔗 |  | manager who logged it; SetNull so user delete doesn't cascade |
| `userEmail` | String | no |  |  | durable provenance snapshot |
| `weekOf` | DateTime `Date` | no |  |  | Friday anchor, written via the canonical UTC helper |
| `weatherData` | Json | no |  |  | { rainfallMm, maxTempC, minTempC } |
| `spraysApplied` | Json | no |  |  | [{ name, scope: "WHOLE"\|"BLOCKS", blockIds: [] }] |
| `fertilizersApplied` | Json | no |  |  | same shape as spraysApplied |
| `blockLevelStatuses` | Json | no |  |  | { [blockId]: BlockStatus } |
| `schemaVersion` | Int | no |  | `1` | JSON shape version |
| `generalNotes` | String | yes |  |  |  |
| `aiSummary` | String | yes |  |  |  |
| `aiSummaryStatus` | String | no |  | `"PENDING"` | PENDING \| READY \| FAILED |
| `aiSummaryAt` | DateTime | yes |  |  |  |
| `createdAt` | DateTime | no |  | `now()` |  |
| `updatedAt` | DateTime | no |  |  |  |

**References**

- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT
- `(userId)` → `user(id)` · ON DELETE SET NULL
- `(vineyardId)` → `vineyard(id)` · ON DELETE CASCADE

### `grower`

Plan 093 Unit 8 (custom-crush intake): a first-class GROWER — the party that farmed the fruit. Replaces the free-text `VineyardDetail.manager` (kept as legacy; NOT auto-parsed). Strongest un-built both-incumbent gap. Distinct from Owner (who OWNS the wine): a grower sells fruit that a client then owns. `isEstate` flags the winery's own vineyards. Full AGENTS.md 9-step (tenant_isolation RLS, etc.).

_Prisma model: `Grower`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` | Phase 12 tenant scope; FK+RLS at DB level (AGENTS.md 9-step) |
| `id` | String | no | 🔑 | `cuid()` |  |
| `name` | String | no |  |  | grower / farm name (per-tenant unique) |
| `company` | String | yes |  |  | legal entity, if different from the display name |
| `contact` | String | yes |  |  | LEGACY free-text contact (phone/email/person). Plan 095 backfills this into the |
| `contactName` | String | yes |  |  | structured fields below and stops writing it; kept for provenance, never a new-data target. Plan 095: Vendor-parity contact fields. phone/email/contactName are REQUIRED in the setup UI but stay nullable at the DB so the backfill + non-UI paths (assistant, seed) never hard-error (mirrors Vendor). primary contact person |
| `phone` | String | yes |  |  | primary phone |
| `email` | String | yes |  |  | primary email |
| `address` | String | yes |  |  |  |
| `vendorId` | String | yes | 🔗 |  | Plan 095: a THIRD-PARTY grower is paid like a vendor, so it links to a Vendor row (auto-created + QBO-synced) via this plain ref — composite FK -> vendor(tenantId,id) in raw SQL (K11), NO Prisma relation (mirrors Vineyard.growerId). NULL for estate growers (isEstate) — you don't pay yourself. |
| `isEstate` | Boolean | no |  | `false` | the winery's own vineyard (estate fruit), vs a third-party grower |
| `isActive` | Boolean | no |  | `true` |  |
| `createdAt` | DateTime | no |  | `now()` |  |
| `updatedAt` | DateTime | no |  |  |  |

**References**

- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT
- `(tenantId, vendorId)` → `vendor(tenantId, id)` · ON DELETE RESTRICT _(composite — invisible to Prisma)_

### `grower_contact`

Plan 095: additional contacts attached to a grower (0..N, beyond the grower's own primary contact), mirroring VendorContact. Tenant-scoped + RLS-forced (Phase 12). `growerId` is a PLAIN ref pinned by a composite (tenantId, growerId) FK in raw SQL (K11) — NO Prisma relation.

_Prisma model: `GrowerContact`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` |  |
| `id` | String | no | 🔑 | `cuid()` |  |
| `growerId` | String | no | 🔗 |  | plain ref → grower.id (composite-tenant FK in raw SQL, K11) |
| `name` | String | no |  |  |  |
| `role` | String | yes |  |  | e.g. "Vineyard manager", "Owner", "Accounts" |
| `phone` | String | yes |  |  |  |
| `mobile` | String | yes |  |  |  |
| `email` | String | yes |  |  |  |
| `isPrimary` | Boolean | no |  | `false` | at most one primary per grower (enforced in the core) |
| `createdAt` | DateTime | no |  | `now()` |  |
| `updatedAt` | DateTime | no |  |  |  |

**References**

- `(tenantId, growerId)` → `grower(tenantId, id)` · ON DELETE CASCADE _(composite — invisible to Prisma)_
- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT

### `location`

_Prisma model: `Location`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` | Phase 12 tenant scope (nullable U2 -> backfill U3 -> NOT NULL U5); FK+RLS at DB level |
| `id` | String | no | 🔑 | `cuid()` |  |
| `name` | String | no |  |  |  |
| `isSystem` | Boolean | no |  | `false` | "Winery" = true |
| `isActive` | Boolean | no |  | `true` |  |
| `kind` | String | yes |  |  | plan 053 B9: classification (cellar/warehouse/crush_pad/lab/bottling/external/other); validated string, nullable = unclassified |
| `createdAt` | DateTime | no |  | `now()` |  |
| `updatedAt` | DateTime | no |  |  |  |

**References**

- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT

### `spatial_analysis_job`

The cron-driven claim-first outbox row (mirror AccountingDelivery). One job per (tenant, idempotencyKey). `sceneId`/`datasetId` are lifecycle pointers filled as the job progresses (soft refs, no hard FK — the outbox precedent). `withheldReason`/`faultClass` are typed-in-code String unions (mirror AccountingDelivery.withheldReason String) so a new reason never needs an ALTER TYPE.

_Prisma model: `SpatialAnalysisJob`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` | Phase 12 tenant scope; FK+RLS at DB level |
| `id` | String | no | 🔑 | `cuid()` |  |
| `vineyardId` | String | no | 🔗 |  | composite FK → vineyard(tenantId, id) |
| `kind` | SpatialJobKind | no |  | `NDVI_SCENE` |  |
| `status` | SpatialJobStatus | no |  | `PENDING` |  |
| `idempotencyKey` | String | no |  |  | per-tenant idempotent (e.g. ndvi:${vineyardId}:${providerSceneId}:${recipeHash}) |
| `sceneId` | String | yes |  |  | set once the scene is selected/created (soft ref) |
| `datasetId` | String | yes |  |  | set once the dataset is materialized (soft ref) |
| `params` | Json | no |  |  | the top-3 ranked candidates + requestedDateTarget + AOI (the auto-advance payload, C4) |
| `attemptCount` | Int | no |  | `0` |  |
| `claimedAt` | DateTime | yes |  |  |  |
| `leaseExpiresAt` | DateTime | yes |  |  | set > 300 s + slack (CDSE took 135 s live; no heartbeat infra) so a long fetch isn't reclaimed |
| `withheldReason` | String | yes |  |  | typed union: "quota-exhausted" \| "selection-miss" \| "low-coverage" \| "mask-breaking" \| "no-candidates" |
| `faultClass` | String | yes |  |  | typed union from classifyFault: "quota" \| "rate_limit" \| "validation" \| "transient" |
| `lastError` | String | yes |  |  |  |
| `processingVersion` | String | yes |  |  | the STAC/Process processing version observed |
| `createdAt` | DateTime | no |  | `now()` |  |
| `updatedAt` | DateTime | no |  |  |  |

**References**

- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT
- `(tenantId, vineyardId)` → `vineyard(tenantId, id)` · ON DELETE CASCADE _(composite — invisible to Prisma)_

### `spatial_dataset`

The stored NDVI raster: bytes in @vercel/blob (private, tenant-namespaced, deterministic key from the identity), metadata + typed geotransform here (mirrors IngestedInvoice's "bytes in blob, key in Postgres"). `datasetIdentity` = hash(vineyardId, providerSceneId, recipeHash) where recipeHash = harmonizeValues + maskPolicy + resampling + algorithmVersion (council C1). The INFLIGHT placeholder lands on this unique BEFORE the fetch; the blob key is derived from the identity (NOT the sha256) so materialization is idempotent.

_Prisma model: `SpatialDataset`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` | Phase 12 tenant scope; FK+RLS at DB level |
| `id` | String | no | 🔑 | `cuid()` |  |
| `vineyardId` | String | no | 🔗 |  | composite FK → vineyard(tenantId, id) |
| `sceneId` | String | no | 🔗 |  | composite FK → spatial_scene(tenantId, id) |
| `datasetIdentity` | String | no |  |  | hash(vineyardId, providerSceneId, recipeHash) — the up-front idempotency key (C1) |
| `kind` | SpatialDatasetKind | no |  | `RASTER` |  |
| `metric` | SpatialMetric | no |  | `NDVI` |  |
| `status` | SpatialDatasetStatus | no |  | `INFLIGHT` | INFLIGHT placeholder → READY on store → FAILED terminal |
| `algorithmVersion` | String | no |  |  | the NDVI algorithm version baked into recipeHash (provenance + identity) |
| `blobUrl` | String | yes |  |  | private Vercel Blob URL (null until READY) |
| `blobKey` | String | yes |  |  | deterministic key derived from datasetIdentity (null until READY) |
| `blobSha256` | String | yes |  |  | content hash of the stored raster (audit; null until READY) |
| `byteSize` | Int | yes |  |  | stored raster size in bytes (null until READY) |
| `crsEpsg` | Int | yes |  |  | raster CRS (metric UTM zone) |
| `originX` | Decimal `Decimal(14, 4)` | yes |  |  | Typed geotransform (NOT loose Json — the clipper depends on it, council S-decision). grid origin easting (m) |
| `originY` | Decimal `Decimal(14, 4)` | yes |  |  | grid origin northing (m) |
| `pixelSizeM` | Decimal `Decimal(10, 4)` | yes |  |  | pixel size (m); 10 m native |
| `gridWidth` | Int | yes |  |  | raster width (px) |
| `gridHeight` | Int | yes |  |  | raster height (px) |
| `axisYSign` | Int | yes |  |  | +1 (y-up, lower-left origin) or -1 (y-down); PixelGrid rebuild depends on it |
| `harmonizeValues` | Boolean | no |  | `false` | Radiometric provenance (runbook §2.13 — the pinned contract, recorded, never re-derived). MUST be false (harmonize fabricates NDVI=1.0) |
| `sclResampling` | String | yes |  |  | "NEAREST" (20 m SCL → 10 m grid) |
| `maskDilation` | Int | no |  | `0` | S3: SCL halo honesty — 0 = no dilation |
| `processingUnits` | Decimal `Decimal(12, 4)` | yes |  |  | CDSE PU billed for the fetch |
| `processingBaseline` | String | yes |  |  | ESA baseline snapshot (also on the scene; carried for a self-contained provenance) |
| `attribution` | String | yes |  |  | Copernicus attribution |
| `createdAt` | DateTime | no |  | `now()` |  |
| `updatedAt` | DateTime | no |  |  |  |

**References**

- `(tenantId, sceneId)` → `spatial_scene(tenantId, id)` · ON DELETE CASCADE _(composite — invisible to Prisma)_
- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT
- `(tenantId, vineyardId)` → `vineyard(tenantId, id)` · ON DELETE CASCADE _(composite — invisible to Prisma)_

### `spatial_dataset_derivative`

───────────────────────── Vineyard Intelligence P3: NDVI display (viz half of Release 1B) ───────────────────────── Two NEW tenant-scoped tables (AGENTS.md Phase-12 checklist). Additive only. The pure render math (color/render/ smooth/overlay) already shipped in P2 — P3 adds the DISPLAY caching + saved styles + a serving route + browser wiring. A cached, versioned DERIVATIVE of a SpatialDataset raster (council fix #3 — a first-class table, NOT a pointer column: one column can't carry display+smoothed+versions). DISPLAY_NDVI = source NDVI warped to a north-up EPSG:3857 grid (fix #1) and Int16-quantized (×`quantScale`, `-32768` = no-data — NaN doesn't fit Int16; the SOURCE Float32 stays authoritative, fix #6). Blob-stored (mirror SpatialDataset). `recipeVersion` is IN the unique key + the serving-route ETag/cache key (fix #7 — never bare `immutable`). Idempotent claim-first materialization (P2 C1).

_Prisma model: `SpatialDatasetDerivative`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` | Phase 12 tenant scope; FK+RLS at DB level |
| `id` | String | no | 🔑 | `cuid()` |  |
| `datasetId` | String | no | 🔗 |  | composite FK → spatial_dataset(tenantId, id) |
| `vineyardId` | String | no | 🔗 |  | denormalised for per-vineyard reads; part of the WIDENED dataset key |
| `kind` | SpatialDerivativeKind | no |  | `DISPLAY_NDVI` | (tenantId, datasetId, vineyardId) -> spatial_dataset(tenantId, id, vineyardId) — cannot drift. |
| `recipeVersion` | Int | no |  |  | bump when the warp/quantize recipe changes (IN the unique key + the serve ETag) |
| `status` | SpatialDatasetStatus | no |  | `INFLIGHT` | INFLIGHT placeholder → READY on store → FAILED terminal |
| `blobUrl` | String | yes |  |  | private Vercel Blob URL (null until READY) |
| `blobKey` | String | yes |  |  | deterministic key derived from (datasetId, kind, recipeVersion) |
| `blobSha256` | String | yes |  |  | content hash of the stored derivative (audit; null until READY) |
| `byteSize` | Int | yes |  |  | stored derivative size in bytes (null until READY) |
| `crsEpsg` | Int | yes |  |  | Warped display geotransform (EPSG:3857, north-up: axisYSign = -1, origin = NW corner). 3857 (web-mercator display grid) |
| `originX` | Decimal `Decimal(14, 4)` | yes |  |  | 3857 easting of the NW corner (m) |
| `originY` | Decimal `Decimal(14, 4)` | yes |  |  | 3857 northing of the NW corner (m) |
| `pixelSizeM` | Decimal `Decimal(10, 4)` | yes |  |  | 3857 pixel size (m) |
| `gridWidth` | Int | yes |  |  | warped raster width (px) |
| `gridHeight` | Int | yes |  |  | warped raster height (px) |
| `axisYSign` | Int | yes |  |  | -1 (north-up, y-down) for the display grid |
| `wgs84Bbox` | Json | yes |  |  | WGS84 bbox for Leaflet imageOverlay bounds ([minLon, minLat, maxLon, maxLat]) — exact once warped north-up. [minLon, minLat, maxLon, maxLat] |
| `quantScale` | Int | no |  | `10000` | Int16 quantization: stored = round(ndvi × quantScale) |
| `noDataSentinel` | Int | no |  | `-32768` | the Int16 no-data value (NaN doesn't fit Int16) |
| `recipeHash` | String | yes |  |  | hash(warp recipe + quantScale) — provenance |
| `createdAt` | DateTime | no |  | `now()` |  |
| `updatedAt` | DateTime | no |  |  |  |

**References**

- `(tenantId, datasetId, vineyardId)` → `spatial_dataset(tenantId, id, vineyardId)` · ON DELETE CASCADE _(composite — invisible to Prisma)_
- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT

### `spatial_scene`

An immutable satellite scene selected for a vineyard "around a date". Provenance-complete: the STAC processing baseline (NOT the Process API serviceVersion), the requested-vs-acquired date drift (S2), and Copernicus attribution all live here. Keyed on (tenant, vineyard, providerSceneId) — the same scene is selected once. `provider`/`collection`/`processingLevel`/`processingBaseline` are provenance strings.

_Prisma model: `SpatialScene`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` | Phase 12 tenant scope; FK+RLS at DB level (AGENTS.md 9-step) |
| `id` | String | no | 🔑 | `cuid()` |  |
| `vineyardId` | String | no | 🔗 |  | composite FK → vineyard(tenantId, id) (raw SQL, K11) |
| `provider` | String | no |  |  | "CDSE" (Copernicus Data Space Ecosystem) |
| `collection` | String | no |  |  | STAC collection, e.g. "sentinel-2-l2a" |
| `providerSceneId` | String | no |  |  | the STAC item id (e.g. S2A_MSIL2A_...) |
| `requestedDateTarget` | DateTime | no |  |  | S2: the "around this date" target the user asked for |
| `acquiredAt` | DateTime | no |  |  | S2: the scene's real acquisition datetime (the analysis axis; offset is derived) |
| `bounds` | Json | no |  |  | AOI/scene footprint used (GeoJSON bbox/polygon, WGS84) |
| `sceneCloudCover` | Decimal `Decimal(6, 3)` | no |  |  | STAC eo:cloud_cover % (coarse rank, 0–100) |
| `processingBaseline` | String | no |  |  | ESA processing baseline from the CDSE STAC processing:version (runbook §2.13) |
| `processingLevel` | String | no |  |  | e.g. "L2A" |
| `selectionReason` | String | no |  |  | why this scene won (footprint-contained + lowest-cloud, auto-advance rank, etc.) |
| `attribution` | String | no |  |  | Copernicus attribution string (copernicusAttribution(year)) |
| `createdBy` | String | yes |  |  | actor userId who selected it (null for cron auto-add) |
| `createdAt` | DateTime | no |  | `now()` |  |

**References**

- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT
- `(tenantId, vineyardId)` → `vineyard(tenantId, id)` · ON DELETE CASCADE _(composite — invisible to Prisma)_

### `spatial_style`

A saved NDVI color STYLE (palette + domain mode + custom stops). SYSTEM presets (vineyardId NULL) + per-VINEYARD saved defaults (Q3; TENANT scope deferred). One-off styles ride URL params and are NEVER persisted here. council fix #2: SYSTEM uniqueness needs a PARTIAL unique index (WHERE vineyardId IS NULL) because Postgres treats every NULL as distinct; the scope↔vineyardId invariant is a DB CHECK. Both live in the hand-written migration (Prisma's schema DSL can't express partial indexes or CHECK), so they are documented but not @@unique here.

_Prisma model: `SpatialStyle`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` | Phase 12 tenant scope; FK+RLS at DB level |
| `id` | String | no | 🔑 | `cuid()` |  |
| `scope` | SpatialStyleScope | no |  | `SYSTEM` |  |
| `vineyardId` | String | yes | 🔗 |  | NULL for SYSTEM; set for VINEYARD (composite FK → vineyard(tenantId, id); DB CHECK ties it to scope) |
| `metric` | SpatialMetric | no |  | `NDVI` |  |
| `name` | String | no |  |  | human label; unique per (tenant, scope-bucket, metric) via the partial indexes |
| `mode` | String | no |  |  | ColorScaleMode union (String, not enum — mirrors withheldReason/faultClass typed-in-code unions) |
| `paletteId` | String | no |  |  | "vigor-classic" \| "purple-green" \| "color-vision-safe" |
| `reverse` | Boolean | no |  | `false` |  |
| `customStops` | Json | yes |  |  | CUSTOM mode: [{ value, color: [r,g,b] }] (null otherwise) |
| `percentileLow` | Decimal `Decimal(4, 3)` | yes |  |  | relative-mode low percentile (e.g. 0.050); null for fixed modes |
| `percentileHigh` | Decimal `Decimal(4, 3)` | yes |  |  | relative-mode high percentile (e.g. 0.950) |
| `fixedMin` | Decimal `Decimal(6, 4)` | yes |  |  | ABSOLUTE/CUSTOM domain min (null otherwise) |
| `fixedMax` | Decimal `Decimal(6, 4)` | yes |  |  | ABSOLUTE/CUSTOM domain max (null otherwise) |
| `createdBy` | String | yes |  |  | actor userId (null for seeded SYSTEM presets) |
| `createdAt` | DateTime | no |  | `now()` |  |
| `updatedAt` | DateTime | no |  |  |  |

**References**

- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT
- `(tenantId, vineyardId)` → `vineyard(tenantId, id)` · ON DELETE CASCADE _(composite — invisible to Prisma)_

### `variety`

_Prisma model: `Variety`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` | Phase 12 tenant scope (nullable U2 -> backfill U3 -> NOT NULL U5); FK+RLS at DB level |
| `id` | String | no | 🔑 | `cuid()` |  |
| `name` | String | no |  |  |  |
| `abbreviation` | String | yes |  |  | 2–4 uppercase code for lot codes (PN, CS). Nullable→backfilled; Postgres unique allows multiple NULLs. |
| `isActive` | Boolean | no |  | `true` |  |
| `color` | String | yes |  |  | canonical per-variety map color (hex), consistent across vineyards |
| `clone` | String | yes |  |  | Optional REFERENCE/presentation attributes (ticket #308). Descriptive only: they are never part of variety identity (name + abbreviation), never feed a lot code, and are not read by the ledger/cost/compliance paths. All nullable so every pre-existing variety keeps its exact historical shape — NAMING-2 provenance. e.g. "Dijon 115", "FPS 04" |
| `rootstock` | String | yes |  |  | e.g. "101-14", "3309C", "own-rooted" |
| `nursery` | String | yes |  |  | source nursery the vine material came from |
| `berryColor` | BerryColor | yes |  |  | black or white — see BerryColor, distinct from `color` |
| `species` | VineSpecies | yes |  |  |  |
| `clusterCompactness` | ClusterCompactness | yes |  |  | S4/D12: the DEFAULT cluster compactness for this variety. A per-block override lives on VineyardBlock. NULL = not recorded → resolves to `unknown`, never to a default (rule §3.6). |
| `createdAt` | DateTime | no |  | `now()` |  |

**References**

- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT

### `vineyard`

_Prisma model: `Vineyard`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` | Phase 12 tenant scope (nullable U2 -> backfill U3 -> NOT NULL U5); FK+RLS at DB level |
| `id` | String | no | 🔑 | `cuid()` |  |
| `name` | String | no |  |  |  |
| `growerId` | String | yes | 🔗 |  | Plan 093 Unit 8: the grower that farms this vineyard (composite FK -> grower(tenantId,id), raw-SQL K11). NULL = unassigned/legacy. |
| `abbreviation` | String | yes |  |  | 2–4 uppercase code for lot codes (GS, NT). Nullable→backfilled; Postgres unique allows multiple NULLs. |
| `isActive` | Boolean | no |  | `true` |  |
| `plantingMigratedAt` | DateTime | yes |  |  | VI-P1: set when the vineyard's blocks were migrated into planting areas (all-or-nothing gate). NULL = not migrated. |
| `ndviAutoAdd` | Boolean | no |  | `false` | VI-P2: DARK per-vineyard flag — cron auto-enqueues the best new clear NDVI scene ONLY when true (rule §2.8, default off) |
| `weatherAutoRefresh` | Boolean | no |  | `false` | VI-P8: DARK per-vineyard flag — cron auto-refreshes the daily weather series ONLY when true (default off, mirrors ndviAutoAdd) |
| `createdAt` | DateTime | no |  | `now()` |  |

**References**

- `(tenantId, growerId)` → `grower(tenantId, id)` · ON DELETE RESTRICT _(composite — invisible to Prisma)_
- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT

### `vineyard_block`

A planted block within a vineyard. All fields optional; nothing required to save. Acreage is NOT stored — it is derived from rowSpacing * vineSpacing * vineCount.

_Prisma model: `VineyardBlock`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` | Phase 12 tenant scope (nullable U2 -> backfill U3 -> NOT NULL U5); FK+RLS at DB level |
| `id` | String | no | 🔑 | `cuid()` |  |
| `vineyardId` | String | no | 🔗 |  |  |
| `growerId` | String | yes | 🔗 |  | Plan 093 Unit 8: block-level grower override (else inherits the vineyard's). Composite FK -> grower(tenantId,id), raw-SQL K11. |
| `blockLabel` | String | yes |  |  | e.g. "Block 1", "A" |
| `code` | String | yes |  |  | short token for lot codes (e.g. "1", "A"); falls back to a normalized blockLabel |
| `numRows` | Int | yes |  |  | informational (drives optional vines/row readout) |
| `rowSpacingM` | Decimal `Decimal(10, 4)` | yes |  |  | canonical metric |
| `vineSpacingM` | Decimal `Decimal(10, 4)` | yes |  |  | canonical metric |
| `varietyId` | String | yes | 🔗 |  |  |
| `clone` | String | yes |  |  |  |
| `rootstock` | String | yes |  |  |  |
| `vineCount` | Int | yes |  |  |  |
| `yearPlanted` | Int | yes |  |  |  |
| `irrigated` | Boolean | yes |  |  |  |
| `polygon` | Json | yes |  |  | VI-P1: canonical block analysis boundary (GeoJSON Polygon; was "illustrative"). Spacing-based acreage is still the productive-area authority (units.ts). |
| `plantingAreaId` | String | yes | 🔗 |  | VI-P1: parent planting area. Composite FK -> planting_area(tenantId,id), raw-SQL K11. NULL until the vineyard is migrated (all-or-nothing). |
| `geometryVersion` | Int | no |  | `1` | VI-P1: mirrors the open VineyardGeometryVersion row for this block |
| `geometryFingerprint` | String | yes |  |  | VI-P1: canonical-form hash of the current polygon (null until first versioned write) |
| `color` | String | yes |  |  | optional per-block polygon color override (hex) |
| `trellisSystem` | TrellisSystem | yes |  |  | S4: durable canopy architecture — the trellis half of "a leaf-pulled VSP canopy" (council S6). The leaf-pulled half is a weekly FieldNote observation; this half never changes week to week. |
| `clusterCompactness` | ClusterCompactness | yes |  |  | S4/D12: per-block OVERRIDE of Variety.clusterCompactness (clone/site differences are real). NULL = fall back to the variety default; both NULL = `unknown`, never a default (rule §3.6). |
| `sortOrder` | Int | no |  | `0` |  |
| `createdAt` | DateTime | no |  | `now()` |  |
| `updatedAt` | DateTime | no |  |  |  |

**References**

- `(tenantId, growerId)` → `grower(tenantId, id)` · ON DELETE RESTRICT _(composite — invisible to Prisma)_
- `(tenantId, plantingAreaId)` → `vineyard_planting_area(tenantId, id)` · ON DELETE RESTRICT _(composite — invisible to Prisma)_
- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT
- `(varietyId)` → `variety(id)` · ON DELETE SET NULL
- `(vineyardId)` → `vineyard(id)` · ON DELETE CASCADE

### `vineyard_detail`

───────────────────────── Vineyard details + blocks ───────────────────────── Sparse, optional per-vineyard metadata (1:1 with Vineyard, created lazily). Spacing/elevation are stored canonically in METRIC; the UI converts for display.

_Prisma model: `VineyardDetail`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` | Phase 12 tenant scope (nullable U2 -> backfill U3 -> NOT NULL U5); FK+RLS at DB level |
| `id` | String | no | 🔑 | `cuid()` |  |
| `vineyardId` | String | no | 🔗 ∪ |  |  |
| `gpsLat` | Decimal `Decimal(9, 6)` | yes |  |  |  |
| `gpsLng` | Decimal `Decimal(9, 6)` | yes |  |  |  |
| `elevationM` | Decimal `Decimal(8, 2)` | yes |  |  |  |
| `soilType` | String | yes |  |  |  |
| `manager` | String | yes |  |  |  |
| `defaultUnit` | String | yes |  |  | "imperial" \| "metric" \| NULL. Plan 098 Migration B: NULL = "Auto" — geometry displays follow the winery's unit prefs (resolveSpacingUnit/resolveAreaUnit); a non-null value is this vineyard's explicit override. |
| `regulatoryCountry` | String | yes |  |  | Spray S2b Unit 1 (KD-9) — the REGULATORY jurisdiction this vineyard is farmed in. Pesticide legality is geographic: a federal registration is never a clearance (S2 council G2), so every legality read takes a jurisdiction and outside the US the honest answer is `jurisdiction-unsupported` (rule §3.9 — Bhutan is a live tenant). NULLABLE and NEVER DEFAULTED. There is no fallback to AppSettings and no derivation from gpsLat/gpsLng, because a default or an inference is a silent path from "nobody said" to "permitted". The UI may PROPOSE a jurisdiction from the GPS pin, but the stored value is always one a human confirmed — an unconfirmed proposal does not resolve (council S6 + rule §3.2). ISO 3166-1 alpha-2, e.g. "US". Anything non-US -> jurisdiction-unsupported. |
| `regulatoryState` | String | yes |  |  | US state code, e.g. "CA". Required for a clearance; missing -> state-registration-unknown. |
| `jurisdictionConfirmedAt` | DateTime | yes |  |  | set only on explicit human confirmation; NULL = proposed/unset, never resolves |
| `jurisdictionConfirmedBy` | String | yes |  |  | User.id of the confirmer (attribution, rule §3.1) |
| `createdAt` | DateTime | no |  | `now()` |  |
| `updatedAt` | DateTime | no |  |  |  |

**References**

- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT
- `(vineyardId)` → `vineyard(id)` · ON DELETE CASCADE

### `vineyard_geometry_version`

VI-P1: append-only geometry history for planting areas AND blocks. One open row per subject (effectiveTo IS NULL, enforced by a partial unique index). A shape change closes the open row and appends the next version; the moat is that the OLD geometry stays retrievable (brief §2.3 / runbook §6).

_Prisma model: `VineyardGeometryVersion`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` | Phase 12 tenant scope; FK+RLS at DB level |
| `id` | String | no | 🔑 | `cuid()` |  |
| `subjectType` | GeometrySubjectType | no |  |  |  |
| `subjectId` | String | no |  |  | planting-area id or block id (both are (tenantId,id)-unique in their tables) |
| `version` | Int | no |  |  |  |
| `geometry` | Json | no |  |  | the geometry AS OF this version (WGS84) |
| `fingerprint` | String | no |  |  |  |
| `canonicalAnchor` | Json | no |  |  | frame used for this version's fingerprint |
| `effectiveFrom` | DateTime | no |  | `now()` |  |
| `effectiveTo` | DateTime | yes |  |  | NULL = current/open version |
| `iouFromPrev` | Decimal `Decimal(6, 5)` | yes |  |  | IoU vs the previous version (null for v1) |
| `reason` | String | yes |  |  |  |
| `createdBy` | String | yes |  |  |  |
| `createdAt` | DateTime | no |  | `now()` |  |

**References**

- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT

### `vineyard_planting_area`

VI-P1 (brief §14 VineyardPlantingArea): the canonical analysis mask — one continuous set of planted rows — sitting between Vineyard and VineyardBlock. Blocks are management units INSIDE a planting area. Geometry is versioned via VineyardGeometryVersion (append-only); a boundary edit that changes the shape (IoU ≤ 0.98) mints a new version and marks dependents stale, never silently rewrites history (brief §2.3).

_Prisma model: `VineyardPlantingArea`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` | Phase 12 tenant scope; FK+RLS at DB level (AGENTS.md 9-step) |
| `id` | String | no | 🔑 | `cuid()` |  |
| `vineyardId` | String | no | 🔗 |  |  |
| `name` | String | no |  |  | per-(tenant,vineyard) unique display name |
| `code` | String | yes |  |  | optional short token |
| `sortOrder` | Int | no |  | `0` |  |
| `geometry` | Json | no |  |  | canonical GeoJSON Polygon \| MultiPolygon (WGS84) |
| `geometryVersion` | Int | no |  | `1` | current version (mirrors the open VineyardGeometryVersion row) |
| `geometryFingerprint` | String | no |  |  | canonical-form hash (frame-pinned) — staleness key, shared with soil (P4) |
| `canonicalAnchor` | Json | no |  |  | pinned recenter origin {epsg, originX, originY} used to compute the fingerprint |
| `effectiveFrom` | DateTime | no |  | `now()` |  |
| `source` | PlantingAreaSource | no |  |  |  |
| `excludedHoleNote` | String | yes |  |  | free-text note about intentional non-vine holes |
| `reviewStatus` | PlantingReviewStatus | no |  | `PROPOSED` |  |
| `areaProjectedM2` | Decimal `Decimal(14, 2)` | yes |  |  | internal cross-check only |
| `areaGeodesicM2` | Decimal `Decimal(14, 2)` | yes |  |  | "Boundary footprint" shown to users |
| `createdBy` | String | yes |  |  |  |
| `createdAt` | DateTime | no |  | `now()` |  |
| `updatedAt` | DateTime | no |  |  |  |

**References**

- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT
- `(vineyardId)` → `vineyard(id)` · ON DELETE CASCADE

### `vineyard_subblock`

A geographic sub-division of a block (e.g. "A"/"B") for differential picks / experiments. `code` is the short token that appears in a lot code between BLOCK and VARIETY.

_Prisma model: `VineyardSubblock`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` | Phase 12 tenant scope (nullable U2 -> backfill U3 -> NOT NULL U5); FK+RLS at DB level |
| `id` | String | no | 🔑 | `cuid()` |  |
| `blockId` | String | no | 🔗 |  |  |
| `code` | String | no |  |  | short uppercase token for lot codes (e.g. "A") |
| `label` | String | yes |  |  | optional human label |
| `sortOrder` | Int | no |  | `0` |  |
| `createdAt` | DateTime | no |  | `now()` |  |

**References**

- `(blockId)` → `vineyard_block(id)` · ON DELETE CASCADE
- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT

## Harvest

_Picks, weigh tags, and Brix readings coming off the vineyard._ — 6 tables.

### `brix_log`

───────────────────────── Vineyard operations: harvest ledger ───────────────────────── Per-block Brix readings logged repeatedly across the ripening window. `vineyardId` denormalized for clean aggregates; block delete is Restricted so ripening history is never erased by a block edit. DB CHECK enforces 0..40.

_Prisma model: `BrixLog`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` | Phase 12 tenant scope (nullable U2 -> backfill U3 -> NOT NULL U5); FK+RLS at DB level |
| `id` | String | no | 🔑 | `cuid()` |  |
| `blockId` | String | no | 🔗 |  |  |
| `vineyardId` | String | no | 🔗 |  | denormalized FK for aggregates |
| `brixValue` | Decimal `Decimal(4, 1)` | no |  |  |  |
| `recordedAt` | DateTime | no |  | `now()` |  |
| `createdById` | String | yes |  |  |  |
| `createdByEmail` | String | no |  |  | provenance snapshot |
| `note` | String | yes |  |  |  |

**References**

- `(blockId)` → `vineyard_block(id)` · ON DELETE RESTRICT
- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT
- `(vineyardId)` → `vineyard(id)` · ON DELETE RESTRICT

### `harvest_pick`

Each pick pass against a HarvestRecord. Vineyards pick a block in multiple passes; the total auto-rolls up from these rows.

_Prisma model: `HarvestPick`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` | Phase 12 tenant scope (nullable U2 -> backfill U3 -> NOT NULL U5); FK+RLS at DB level |
| `id` | String | no | 🔑 | `cuid()` |  |
| `harvestRecordId` | String | no | 🔗 |  |  |
| `pickDate` | DateTime `Date` | no |  |  |  |
| `weightKg` | Decimal `Decimal(12, 3)` | no |  |  | canonical kg |
| `brixAtPick` | Decimal `Decimal(4, 1)` | yes |  |  | optional Brix the fruit came off at |
| `phAtPick` | Decimal `Decimal(4, 2)` | yes |  |  | optional field pH (analyte registry: 2.5–4.5) |
| `taAtPick` | Decimal `Decimal(4, 1)` | yes |  |  | optional field titratable acidity, g/L tartaric (registry: 0–20) |
| `createdById` | String | yes |  |  |  |
| `createdByEmail` | String | no |  |  |  |
| `note` | String | yes |  |  |  |
| `weighTagLineId` | String | yes | 🔗 |  | Plan 093 Unit 9: the weigh-tag bin-line this pick came off (its owner/grower/block source). Composite FK -> weigh_tag_line(tenantId,id), onDelete Restrict (K11, raw-SQL). |
| `sold` | Boolean | no |  | `false` | Plan 093 Unit 10: fruit sold OUT (not crushed here) → TTB Part IV fruit removal |
| `createdAt` | DateTime | no |  | `now()` |  |

**References**

- `(harvestRecordId)` → `harvest_record(id)` · ON DELETE CASCADE
- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT
- `(tenantId, weighTagLineId)` → `weigh_tag_line(tenantId, id)` · ON DELETE RESTRICT _(composite — invisible to Prisma)_

### `harvest_record`

One record per (block, vintage): holds the pre-harvest estimate and parents the pick passes. `totalWeightKg` is NOT stored — it is the sum of `picks`.

_Prisma model: `HarvestRecord`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` | Phase 12 tenant scope (nullable U2 -> backfill U3 -> NOT NULL U5); FK+RLS at DB level |
| `id` | String | no | 🔑 | `cuid()` |  |
| `blockId` | String | no | 🔗 |  |  |
| `vineyardId` | String | no | 🔗 |  | denormalized FK for aggregates |
| `vintageYear` | Int | no |  |  |  |
| `yieldEstimateKg` | Decimal `Decimal(12, 3)` | yes |  |  | pre-harvest estimate, canonical kg |
| `createdById` | String | yes |  |  |  |
| `createdByEmail` | String | no |  |  |  |
| `updatedByEmail` | String | yes |  |  |  |
| `note` | String | yes |  |  |  |
| `createdAt` | DateTime | no |  | `now()` |  |
| `updatedAt` | DateTime | no |  |  |  |

**References**

- `(blockId)` → `vineyard_block(id)` · ON DELETE RESTRICT
- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT
- `(vineyardId)` → `vineyard(id)` · ON DELETE RESTRICT

### `weigh_tag`

_Prisma model: `WeighTag`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` | Phase 12 tenant scope; FK+RLS at DB level (AGENTS.md 9-step) |
| `id` | String | no | 🔑 | `cuid()` |  |
| `tagNumber` | Int | no |  |  | per-tenant monotonic, gap-free certificate number (allocated via WeighTagCounter) |
| `issuedAt` | DateTime | no |  | `now()` |  |
| `weighmaster` | String | yes |  |  | who weighed it in |
| `truck` | String | yes |  |  | truck / hauler identifier |
| `grossKg` | Decimal `Decimal(12, 3)` | yes |  |  |  |
| `tareKg` | Decimal `Decimal(12, 3)` | yes |  |  |  |
| `netKg` | Decimal `Decimal(12, 3)` | yes |  |  |  |
| `voidedAt` | DateTime | yes |  |  | void-not-delete (mirror LotTreatment); a voided tag stays visible + numbered |
| `voidedReason` | String | yes |  |  |  |
| `createdAt` | DateTime | no |  | `now()` |  |
| `updatedAt` | DateTime | no |  |  |  |

**References**

- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT

### `weigh_tag_counter`

Plan 093 Unit 9 (custom-crush intake): weigh-tags. A weigh-tag is a per-TRUCK scale ticket (gross/tare/net), NOT per-pick — one flatbed carries many bins from multiple growers for multiple owners. The tag number is a gap-free, per-tenant, monotonic certificate; a tag is VOIDED, never deleted. Owner/grower/block attach at the LINE (bin) level. The per-tenant gap-free tag-number allocator (council: a counter row + SELECT ... FOR UPDATE, NOT MAX(tagNumber)+1 which bounces/gaps under SERIALIZABLE + PgBouncer). One row per tenant.

_Prisma model: `WeighTagCounter`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔑 🔗 |  | one row per tenant (the tenant IS the key) |
| `nextNumber` | Int | no |  | `1` |  |

**References**

- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT

### `weigh_tag_line`

_Prisma model: `WeighTagLine`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` | Phase 12 tenant scope; FK+RLS at DB level |
| `id` | String | no | 🔑 | `cuid()` |  |
| `weighTagId` | String | no | 🔗 |  | composite (tenantId, weighTagId) -> weigh_tag(tenantId, id), raw-SQL K11 |
| `binOrGroup` | String | yes |  |  | the bin / group label on the ticket |
| `growerId` | String | yes | 🔗 |  | the grower that farmed this bin (composite FK -> grower) |
| `ownerId` | String | yes | 🔗 |  | the owner of this bin's fruit (composite FK -> owner); NULL + needsOwnerAssignment=false = Estate |
| `blockId` | String | yes | 🔗 |  | the vineyard block (composite FK -> vineyard_block) |
| `netKg` | Decimal `Decimal(12, 3)` | yes |  |  |  |
| `needsOwnerAssignment` | Boolean | no |  | `false` | Plan 093 Unit 9: receive-now-assign-later. A NULL ownerId is AMBIGUOUS (estate vs unkeyed); this flag disambiguates — true = unresolved (must be assigned before a pick from it can carry ownership to a lot; crush refuses it, Unit 10). The scale never blocks on a missing owner. |
| `createdAt` | DateTime | no |  | `now()` |  |
| `updatedAt` | DateTime | no |  |  |  |

**References**

- `(tenantId, blockId)` → `vineyard_block(tenantId, id)` · ON DELETE RESTRICT _(composite — invisible to Prisma)_
- `(tenantId, growerId)` → `grower(tenantId, id)` · ON DELETE RESTRICT _(composite — invisible to Prisma)_
- `(tenantId, ownerId)` → `owner(tenantId, id)` · ON DELETE RESTRICT _(composite — invisible to Prisma)_
- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT
- `(weighTagId)` → `weigh_tag(id)` · ON DELETE CASCADE

## Vendors & ingest

_Vendors and the invoice/document ingestion staging tables._ — 8 tables.

### `ingested_invoice`

───────────────────────── Plan 072: invoice / document ingestion (staging + provenance) ───────────────────────── Tenant-scoped, RLS-forced (Phase-12 pattern). A dropped pile of supplier docs is OCR/LLM-extracted into these STAGING rows, human-reviewed on one screen, then applied through the existing material/vendor cores (createStockMaterialCore / receiveSupplyCore / findOrCreateVendorCore) — nothing here touches the ledger directly. Cross-tenant-risk refs (vendorId, materialId, supplyLotId, ingestedInvoiceId) are COMPOSITE (tenantId, refId)→(tenantId, id) FKs in the migration raw SQL (K11) — plain String cols, NO Prisma relation (mirrors ap_export_event.vendorId + the inbox tables; children queried explicitly). Money is Decimal(18,8) (D9); NULL cost = UNKNOWN (D14), never $0. One ingested document (header). docType routes it: only `invoice` (+ a landed `proforma`) is a receipt; `coa`/`other` are stored for provenance but never intaken. `status` drives the apply state machine (pending → applying → applied | discarded | held); the pending→applying compare-and-set is the concurrency claim (one apply at a time, ChatGPT #4). `extractedJson` is the raw structured extraction (audit + reload).

_Prisma model: `IngestedInvoice`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` |  |
| `id` | String | no | 🔑 | `cuid()` |  |
| `batchId` | String | no |  |  | ingestion session id — scopes same-session COA↔invoice matching (Unit 10) |
| `blobUrl` | String | no |  |  | private Vercel Blob URL of the source document |
| `fileName` | String | no |  |  |  |
| `mimeType` | String | no |  |  |  |
| `fileSha256` | String | yes |  |  | exact-file duplicate guard (alongside vendor+invoice#); the blob helper computes it |
| `docType` | String | no |  |  | invoice \| proforma \| coa \| other |
| `status` | String | no |  | `"pending"` | pending \| applying \| applied \| discarded \| held |
| `currency` | String | yes |  |  | one currency per document (mixed-currency rejected upstream) — the invoice/foreign currency |
| `baseCurrency` | String | yes |  |  | Plan 073: the FX rate applied at apply time (editable pre-apply on the review screen; locked once applied — council #3). the tenant base currency the lines were converted TO (snapshot at apply) |
| `fxRate` | Decimal `Decimal(18, 8)` | yes |  |  | base per 1 foreign (manual override or the resolved ECB rate) |
| `fxRateDate` | DateTime | yes |  |  | the rate date used |
| `fxRateSource` | String | yes |  |  | "ECB via Frankfurter" \| "manual override" |
| `vendorId` | String | yes | 🔗 |  | composite-tenant FK → vendor (raw SQL, K11); resolved on apply |
| `vendorNameRaw` | String | yes |  |  | extracted vendor name before match/create |
| `vendorInvoiceNumber` | String | yes |  |  | supplier invoice # — duplicate-upload guard on (vendor, invoice#) |
| `invoiceTotal` | Decimal `Decimal(18, 8)` | yes |  |  | extracted grand total — the reconciliation-gate target (Unit 7) |
| `taxTotal` | Decimal `Decimal(18, 8)` | yes |  |  | extracted tax — surfaced in the gate, excluded from capitalized landed cost |
| `landedReceipt` | Boolean | yes |  |  | proforma gate answer: true = goods physically received IN FULL → intake as a receipt |
| `paymentStatus` | ApPaymentStatus | yes |  |  | Plan 076: A/P payment status chosen on the review screen (required before confirm) and carried to the aggregate A/P event → QBO. PAID records a BillPayment from paidFromAccount; OUTSTANDING posts the Bill only. null until the human picks (gate blocks confirm) |
| `paidFromAccount` | String | yes |  |  | the QBO account the payment came from (required when PAID) |
| `paidAt` | DateTime | yes |  |  | when marked paid (app-side or read back from QBO) |
| `extractedJson` | Json | no |  |  | full structured extraction result (audit + review reload) |
| `createdBy` | String | no |  |  | actor userId who uploaded/ingested |
| `createdAt` | DateTime | no |  | `now()` |  |
| `updatedAt` | DateTime | no |  |  |  |
| `appliedAt` | DateTime | yes |  |  |  |

**References**

- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT
- `(tenantId, vendorId)` → `vendor(tenantId, id)` · ON DELETE SET NULL _(composite — invisible to Prisma)_

### `ingested_invoice_line`

_Prisma model: `IngestedInvoiceLine`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` |  |
| `id` | String | no | 🔑 | `cuid()` |  |
| `ingestedInvoiceId` | String | no | 🔗 |  | composite-tenant FK → ingested_invoice (raw SQL, K11) |
| `lineNo` | Int | no |  |  |  |
| `descriptionRaw` | String | no |  |  |  |
| `vendorItemCodeRaw` | String | yes |  |  |  |
| `qty` | Decimal `Decimal(18, 6)` | yes |  |  |  |
| `unitRaw` | String | yes |  |  | invoice UOM (e.g. "25 kg", "case") — normalized to the material's stock unit at apply (Unit 5) |
| `unitPrice` | Decimal `Decimal(18, 8)` | yes |  |  | per invoice unit (NULL = unknown, D14 — never a fabricated $0) |
| `lineTotal` | Decimal `Decimal(18, 8)` | yes |  |  | extracted line extended total (charge-allocation basis) |
| `lotNoRaw` | String | yes |  |  | supplier lot no. (→ SupplyLot.lotCode; the COA match key) |
| `allocatedUnitCost` | Decimal `Decimal(18, 8)` | yes |  |  | per-stock-unit landed cost after charge allocation + UOM normalize (Unit 5) |
| `matchDecision` | String | yes |  |  | new \| existing \| skip (human dedup decision; null = undecided) |
| `matchedMaterialId` | String | yes | 🔗 |  | existing/backfill target — composite-tenant FK → cellar_material (raw SQL, K11) |
| `resolvedKind` | String | yes |  |  | material family for a `new` line |
| `resolvedCategory` | String | yes |  |  | material category for a `new` line (EQUIPMENT for parts) |
| `createdSupplyLotId` | String | yes | 🔗 |  | audit: the SupplyLot this line created (set inside the atomic apply tx) |
| `targetKind` | String | yes |  |  | Plan 080 U5 — where this line's goods GO. NULLABLE with NO default (council C2): a null target is a hard needsAck at apply, never a silent MATERIAL assumption, because guessing mis-posts real money. CHECK-constrained in SQL to {MATERIAL, EQUIPMENT_ASSET, FINISHED_GOOD}. |
| `wineSkuTargetId` | String | yes | 🔗 |  | Finished-goods target, resolved at REVIEW time — apply-time auto-create is irreversible (council S11). Exactly one may be set, and only when targetKind = FINISHED_GOOD (CHECK-constrained). composite-tenant FK → wine_sku(tenantId,id) (raw SQL, K11) |
| `finishedGoodTargetId` | String | yes | 🔗 |  | composite-tenant FK → finished_good(tenantId,id) (raw SQL, K11) |
| `createdAt` | DateTime | no |  | `now()` |  |
| `updatedAt` | DateTime | no |  |  |  |

**References**

- `(tenantId, finishedGoodTargetId)` → `finished_good(tenantId, id)` · ON DELETE RESTRICT _(composite — invisible to Prisma)_
- `(tenantId, wineSkuTargetId)` → `wine_sku(tenantId, id)` · ON DELETE RESTRICT _(composite — invisible to Prisma)_
- `(tenantId, createdSupplyLotId)` → `supply_lot(tenantId, id)` · ON DELETE SET NULL _(composite — invisible to Prisma)_
- `(tenantId, ingestedInvoiceId)` → `ingested_invoice(tenantId, id)` · ON DELETE CASCADE _(composite — invisible to Prisma)_
- `(tenantId, matchedMaterialId)` → `cellar_material(tenantId, id)` · ON DELETE SET NULL _(composite — invisible to Prisma)_
- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT

### `ingested_invoice_line_created_asset`

One extracted line of an ingested invoice (editable staging). `matchDecision` (new|existing|skip) + the resolved fields carry the human's dedup + classification choices; `createdSupplyLotId` is a belt-and-suspenders audit link written INSIDE the atomic apply tx (the apply is all-or-nothing via an injected tx, NOT resumed off this marker — the marker-outside-tx design was unsound, council P1). Plan 080 U5 (council C5) — an invoice line for 2 pumps creates TWO EquipmentAssets, and a single FK on the line cannot represent N of them. This append-only join records every asset a line minted, so the line→assets provenance survives and a reversal knows exactly what to undo.

_Prisma model: `IngestedInvoiceLineCreatedAsset`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` |  |
| `id` | String | no | 🔑 | `cuid()` |  |
| `lineId` | String | no | 🔗 |  | composite-tenant FK → ingested_invoice_line(tenantId,id) |
| `equipmentAssetId` | String | no | 🔗 |  | composite-tenant FK → equipment_asset(tenantId,id) |
| `createdAt` | DateTime | no |  | `now()` |  |

**References**

- `(tenantId, equipmentAssetId)` → `equipment_asset(tenantId, id)` · ON DELETE RESTRICT _(composite — invisible to Prisma)_
- `(tenantId, lineId)` → `ingested_invoice_line(tenantId, id)` · ON DELETE RESTRICT _(composite — invisible to Prisma)_
- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT

### `lot_document`

Provenance join: links a created SupplyLot to its source document(s). A lot can carry its INVOICE plus one-or-more COAs (role distinguishes). Powers the tenant-scoped "view source PDF" on the lot/material history (Unit 10). Both refs are composite-tenant FKs (raw SQL, K11).

_Prisma model: `LotDocument`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` |  |
| `id` | String | no | 🔑 | `cuid()` |  |
| `supplyLotId` | String | no | 🔗 |  | composite-tenant FK → supply_lot (raw SQL, K11) |
| `ingestedInvoiceId` | String | no | 🔗 |  | composite-tenant FK → ingested_invoice (raw SQL, K11) |
| `role` | String | no |  |  | INVOICE \| COA |
| `createdAt` | DateTime | no |  | `now()` |  |

**References**

- `(tenantId, ingestedInvoiceId)` → `ingested_invoice(tenantId, id)` · ON DELETE CASCADE _(composite — invisible to Prisma)_
- `(tenantId, supplyLotId)` → `supply_lot(tenantId, id)` · ON DELETE CASCADE _(composite — invisible to Prisma)_
- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT

### `vendor`

_Prisma model: `Vendor`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` |  |
| `id` | String | no | 🔑 | `cuid()` |  |
| `name` | String | no |  |  |  |
| `currency` | String | no |  | `"USD"` | Plan 073: informational "currency we usually bill this vendor in" (backfilled USD). NOT the posting authority — the A/P bill's currency comes from ApExportEvent.currency, and the QBO vendor is resolved currency-scoped from THAT (currency-suffixed DisplayName + CurrencyRef), so one Vendor row can source bills in several currencies without a unique-key change (council #4 handled QBO-side). |
| `terms` | String | yes |  |  | payment terms, e.g. "Net 30" (drives Bill DueDate — U10) + "Pay at purchase" |
| `externalVendorId` | String | yes |  |  | QBO Vendor.Id cache (find-or-create — U10). PII stays here, never in events (D19) |
| `syncStatus` | String | no |  | `"synced"` | Plan 077: synced \| pending \| conflict — eager QBO-push state. 'synced' = linked or doesn't need a push (existing rows); 'pending' = created, QBO push not yet done (offline → retry sweep); 'conflict' = the push hit the (tenantId, externalVendorId) unique. |
| `phone` | String | yes |  |  | Plan 069: first-class vendor management. Contact + purchasing metadata, columns-only (RLS-neutral — the existing vendor tenant_isolation policy covers new columns). phone/email are REQUIRED in the setup UI but stay nullable at the DB so backfill + non-UI paths (A/P find-or-create, assistant) never hard-error. primary phone |
| `email` | String | yes |  |  | primary email |
| `contactName` | String | yes |  |  | primary contact person |
| `accountNumber` | String | yes |  |  | our account number with this vendor |
| `poRequired` | Boolean | no |  | `false` | does this vendor require a PO? |
| `url` | String | yes |  |  | vendor website / product URL — autofills the expendables vendor-URL field |
| `notes` | String | yes |  |  |  |
| `isActive` | Boolean | no |  | `true` |  |
| `createdAt` | DateTime | no |  | `now()` |  |
| `updatedAt` | DateTime | no |  |  |  |

**References**

- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT

### `vendor_contact`

Plan 069: additional contacts attached to a vendor (0..N, beyond the vendor's own core contact info). Tenant-scoped + RLS-forced (Phase 12). `vendorId` is a PLAIN ref pinned by a composite (tenantId, vendorId) FK in raw SQL (K11/K12) — NO Prisma relation (mirrors ap_export_event.vendorId / equipment_asset.locationId).

_Prisma model: `VendorContact`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` |  |
| `id` | String | no | 🔑 | `cuid()` |  |
| `vendorId` | String | no | 🔗 |  | plain ref → vendor.id (composite-tenant FK in raw SQL, K11) |
| `name` | String | no |  |  |  |
| `role` | String | yes |  |  | e.g. "Sales rep", "Accounts payable" |
| `phone` | String | yes |  |  |  |
| `mobile` | String | yes |  |  |  |
| `email` | String | yes |  |  |  |
| `isPrimary` | Boolean | no |  | `false` | at most one primary per vendor (enforced in the core) |
| `createdAt` | DateTime | no |  | `now()` |  |
| `updatedAt` | DateTime | no |  |  |  |

**References**

- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT
- `(tenantId, vendorId)` → `vendor(tenantId, id)` · ON DELETE CASCADE _(composite — invisible to Prisma)_

### `vendor_import_candidate`

Plan 075 (QBO vendor sync, Slice 1): the review queue for QBO vendors pulled in but not yet resolved to a local Vendor. Every pulled QBO vendor is matched (by externalVendorId, else the Plan 074 fuzzy matcher); an unmatched one lands here for a human to accept / reject / merge-into-existing. Currency-variant QBO records ("Acme" / "Acme (EUR)", Plan 073) collapse into ONE candidate keyed on the stripped base name — the extra QBO ids ride along in currencyVariantIds. Tenant-scoped + RLS (Phase 12); a composite (tenantId, suggestedVendorId) FK pins any suggested match to a same-tenant vendor (K11). REJECTED rows are suppression tombstones (kept so a re-pull doesn't re-surface them); accepted/merged candidates are DELETED (the link lives on Vendor.externalVendorId).

_Prisma model: `VendorImportCandidate`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` |  |
| `id` | String | no | 🔑 | `cuid()` |  |
| `externalVendorId` | String | no |  |  | QBO Vendor.Id — the canonical/base id of a collapsed currency-variant group |
| `name` | String | no |  |  | the collapsed base DisplayName (Plan 073 " (CUR)" suffix stripped) |
| `suggestedVendorId` | String | yes | 🔗 |  | a HIGH local match, if any (plain ref → vendor.id; composite FK in raw SQL, K11) |
| `status` | String | no |  | `"PENDING"` | PENDING \| REJECTED (no enum — sidesteps the Windows ALTER TYPE rule) |
| `currencyVariantIds` | String[] | no |  |  | every QBO id collapsed into this candidate (base + its " (CUR)" variants) |
| `firstSeenAt` | DateTime | no |  | `now()` |  |
| `updatedAt` | DateTime | no |  |  |  |

**References**

- `(tenantId, suggestedVendorId)` → `vendor(tenantId, id)` · ON DELETE SET NULL _(composite — invisible to Prisma)_
- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT

### `vendor_material_code`

Vendor-scoped supplier item-code → material mapping (the re-order learning loop). The SAME material bought from two vendors has two codes, so a code is unique per (tenant, vendor, code) — NEVER global. Backfilled only on a human-confirmed `existing` match (Unit 7) so one bad OCR code can't poison future dedup. Both refs are composite-tenant FKs (raw SQL, K11).

_Prisma model: `VendorMaterialCode`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` |  |
| `id` | String | no | 🔑 | `cuid()` |  |
| `vendorId` | String | no | 🔗 |  | composite-tenant FK → vendor (raw SQL, K11) |
| `materialId` | String | no | 🔗 |  | composite-tenant FK → cellar_material (raw SQL, K11) |
| `code` | String | no |  |  | supplier's item/catalog code for this material |
| `createdAt` | DateTime | no |  | `now()` |  |
| `updatedAt` | DateTime | no |  |  |  |

**References**

- `(tenantId, materialId)` → `cellar_material(tenantId, id)` · ON DELETE CASCADE _(composite — invisible to Prisma)_
- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT
- `(tenantId, vendorId)` → `vendor(tenantId, id)` · ON DELETE CASCADE _(composite — invisible to Prisma)_

## Lots & the operation ledger

_THE CORE. A lot is identity; its volume is the FOLD of an append-only operation ledger. vessel_lot and lot_vineyard are maintained projections, not source of truth._ — 15 tables.

### `lot`

A batch of wine with a durable identity (VISION §1–3). Vintage is an ATTRIBUTE, not part of identity (D3). Origin columns are provenance snapshots (no FK — the authoritative tuple lives in legacySnapshot for legacy lots). Provenance metadata is immutable after the first operation (enforced in the service layer).

_Prisma model: `Lot`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` | Phase 12 tenant scope (nullable U2 -> backfill U3 -> NOT NULL U5); FK+RLS at DB level |
| `ownerId` | String | yes | 🔗 |  | Plan 093 Unit 2: owner-scope; nullable (Estate=NULL); maintained per Unit 4; composite FK -> owner(tenantId,id) in the migration (K11) |
| `id` | String | no | 🔑 | `cuid()` |  |
| `code` | String | no |  |  |  |
| `displayName` | String | yes |  |  | Phase 1 (identity presentation): a MUTABLE, NON-unique free-text human label. Deliberately NO @@unique. Backfilled/left NULL; the presentation layer coalesces `displayName ?? code` (plan Q12), so a `code` rename never leaves a stale displayName. Identity stays on `id`; `code` is the mutable unique-per-tenant human code; see NAMING-1/2. |
| `form` | LotForm | no |  | `WINE` | form is MUTABLE over the lot's life (D4) but ONLY via the Phase 6 domain transitions (crush→MUST, press/saignée→JUICE, AF-dry→WINE) — direct writes are banned; every change records a LotStateEvent. origin*/code/provenance stay immutable. |
| `afState` | AlcoholicFermState | no |  | `NONE` | Phase 6: the two orthogonal fermentation vectors (council C1). The physical `form` is the third vector. A legal form×afState×mlfState matrix is validated in the domain layer (Unit 5). STUCK is DERIVED from the Brix trend (council C3), never stored here. |
| `mlfState` | MalolacticState | no |  | `NONE` |  |
| `originVineyardId` | String | yes |  |  |  |
| `originBlockId` | String | yes |  |  |  |
| `originSubblockId` | String | yes |  |  |  |
| `originVarietyId` | String | yes |  |  |  |
| `vintageYear` | Int | yes |  |  |  |
| `status` | String | no |  | `"ACTIVE"` | ACTIVE \| DEPLETED \| ARCHIVED \| CORRECTED |
| `isLegacy` | Boolean | no |  | `false` |  |
| `productType` | ProductType | no |  | `WINE` | Phase 14 (Fork 2A): TTB tax-class derivation inputs. Defaults keep grape-first behavior; d/f are reachable via the review-screen override. `taxAbvOverride` is the optional per-lot tax ABV used when no ALCOHOL AnalysisReading exists as-of the taxable event (abv resolver, Unit 2). |
| `carbonation` | CarbonationMethod | no |  | `NONE` |  |
| `taxAbvOverride` | Decimal `Decimal(5, 2)` | yes |  |  |  |
| `ownership` | LotOwnership | no |  | `ESTATE` | Phase 8 (D19): who owns this wine. ESTATE (default) capitalizes cost to the winery's inventory asset; CUSTOM_CRUSH_CLIENT suppresses fruit/wine cost and bills supplies back (routing = Unit 16). |
| `provenanceComplete` | Boolean | no |  | `true` | Phase 5: false when this lot's source-vineyard set may be incomplete (a blend with a parent of unknown provenance). Contagious: a blend with any incomplete parent is itself incomplete (council C6). Drives the "admin-only-visible" NULL-source bucket. |
| `legacySnapshot` | Json | yes |  |  |  |
| `sublotTag` | String | yes |  |  | optional human variant tag in the lot code (experiments / differential picks) |
| `note` | String | yes |  |  |  |
| `createdAt` | DateTime | no |  | `now()` |  |
| `updatedAt` | DateTime | no |  |  |  |

**References**

- `(tenantId, ownerId)` → `owner(tenantId, id)` · ON DELETE RESTRICT _(composite — invisible to Prisma)_
- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT

### `lot_code_event`

Phase 1 (identity presentation) — the append-only SOURCE OF TRUTH for in-app renames (NAMING-2). A rename appends one row here and NEVER rewrites a LotOperationLine snapshot; historical-code search reads fromValue/toValue. `commandId` is the idempotency key, scoped per tenant (checklist step 4). `field` is CHECK-constrained to ('code','displayName') in raw SQL (a fixed domain — plan Q4). Composite FK + RLS in raw SQL.

_Prisma model: `LotCodeEvent`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` |  |
| `ownerId` | String | yes | 🔗 |  | Plan 093 Unit 2: owner-scope; nullable (Estate=NULL); maintained per Unit 4; composite FK -> owner(tenantId,id) in the migration (K11) |
| `id` | String | no | 🔑 | `cuid()` |  |
| `lotId` | String | no | 🔗 |  |  |
| `field` | String | no |  |  | code \| displayName (CHECK-constrained in migration) |
| `fromValue` | String | yes |  |  |  |
| `toValue` | String | no |  |  |  |
| `actorUserId` | String | yes |  |  |  |
| `actorEmail` | String | yes |  |  | email snapshot (provenance), mirrors the ledger actor shape |
| `observedAt` | DateTime | no |  | `now()` |  |
| `commandId` | String | no |  |  | idempotency; UNIQUE per tenant (see @@unique below) |
| `createdAt` | DateTime | no |  | `now()` |  |

**References**

- `(tenantId, ownerId)` → `owner(tenantId, id)` · ON DELETE RESTRICT _(composite — invisible to Prisma)_
- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT
- `(tenantId, lotId)` → `lot(tenantId, id)` · ON DELETE RESTRICT _(composite — invisible to Prisma)_

### `lot_cost_state`

A LAZY, VERSIONED cache of a lot's rolled-up cost (D4) — NOT an invariant projection. The DAG recompute (Unit 4) is the AUTHORITY; this row is refreshed on read when the lot's max cost-affecting opId exceeds `computedThroughOpId` (the watermark). NEVER eagerly fanned out from the write chokepoint. 1:1 with Lot (lotId @id), deleted-at-zero like VesselLot. `basisVersion` tracks the costing-policy version the cache reflects so a policy bump invalidates it.

_Prisma model: `LotCostState`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` |  |
| `lotId` | String | no | 🔑 🔗 |  |  |
| `totalCost` | Decimal `Decimal(18, 8)` | no |  |  |  |
| `volumeL` | Decimal `Decimal(10, 2)` | no |  |  |  |
| `costPerL` | Decimal `Decimal(18, 8)` | yes |  |  | totalCost / volumeL; NULL at zero volume (D9) |
| `basisCompleteness` | CostBasisCompleteness | no |  | `UNKNOWN` |  |
| `computedThroughOpId` | Int | no |  | `0` | watermark: max cost-affecting opId folded in |
| `basisVersion` | Int | no |  | `1` |  |
| `componentBreakdown` | Json | yes |  |  | { MATERIAL: n, FRUIT: n, … } cached decomposition |
| `updatedAt` | DateTime | no |  |  |  |

**References**

- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT
- `(tenantId, lotId)` → `lot(tenantId, id)` · ON DELETE CASCADE _(composite — invisible to Prisma)_

### `lot_harvest_source`

───────────────────────── Phase 6: state transforms & fermentation ───────────────────────── The crush linkage: which harvest pick(s) were consumed (in part or full) into which lot. SINGLE SOURCE OF TRUTH for pick consumption (council S8) — "remaining = weightKg − Σ consumedKg" is DERIVED from these rows, never also stored on the pick. NO unique on harvestPickId: a big pick is legitimately split across several fermenters; the crush tx enforces Σ consumedKg ≤ HarvestPick.weightKg. kg never enters a ledger line (D8) — it is op metadata; the measured output liters is the only balanced line.

_Prisma model: `LotHarvestSource`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` | Phase 12 tenant scope (nullable U2 -> backfill U3 -> NOT NULL U5); FK+RLS at DB level |
| `ownerId` | String | yes | 🔗 |  | Plan 093 Unit 2: owner-scope; nullable (Estate=NULL); maintained per Unit 4; composite FK -> owner(tenantId,id) in the migration (K11) |
| `id` | String | no | 🔑 | `cuid()` |  |
| `lotId` | String | no | 🔗 |  |  |
| `harvestPickId` | String | no | 🔗 |  |  |
| `consumedKg` | Decimal `Decimal(12, 3)` | no |  |  |  |
| `createdAt` | DateTime | no |  | `now()` |  |

**References**

- `(tenantId, ownerId)` → `owner(tenantId, id)` · ON DELETE RESTRICT _(composite — invisible to Prisma)_
- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT
- `(tenantId, harvestPickId)` → `harvest_pick(tenantId, id)` · ON DELETE RESTRICT _(composite — invisible to Prisma)_
- `(tenantId, lotId)` → `lot(tenantId, id)` · ON DELETE CASCADE _(composite — invisible to Prisma)_

### `lot_identifier`

Phase 1 (identity presentation) — external/source identifiers for a lot: the current human `code` (a convenience projection kept in sync on rename), legacy incumbent codes imported in Phase 3, spreadsheet aliases, TTB labels. This is the cross-identifier SEARCH index AND the Phase-3 idempotent re-import key. Rename HISTORY lives in LotCodeEvent, NOT here (plan Q13): the app rename path never writes a `prior-code` row — it updates the single `current-code` row's value in place; `prior-code` is reserved for Phase-3 imported incumbent labels. Tenant checklist: composite FK (tenantId,lotId)->lot(tenantId,id); RLS + the null-safe re-import partial uniques + the single-`current-code`-per-lot partial unique live in raw SQL (Prisma can't express partial uniques). `kind` stays an open String (Phase-3 adapters add kinds without an ALTER TYPE) — plan Q4.

_Prisma model: `LotIdentifier`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` |  |
| `ownerId` | String | yes | 🔗 |  | Plan 093 Unit 2: owner-scope; nullable (Estate=NULL); maintained per Unit 4; composite FK -> owner(tenantId,id) in the migration (K11) |
| `id` | String | no | 🔑 | `cuid()` |  |
| `lotId` | String | no | 🔗 |  |  |
| `kind` | String | no |  |  | current-code \| source-system-id \| spreadsheet-alias \| ttb-label \| prior-code(Phase-3 imports only) |
| `sourceSystem` | String | yes |  |  | e.g. "innovint" \| "vintrace" \| null for app-native identifiers |
| `sourceObjectType` | String | yes |  |  |  |
| `value` | String | no |  |  |  |
| `validFrom` | DateTime | yes |  |  |  |
| `validTo` | DateTime | yes |  |  |  |
| `isCurrent` | Boolean | no |  | `false` |  |
| `createdAt` | DateTime | no |  | `now()` |  |
| `updatedAt` | DateTime | no |  |  |  |

**References**

- `(tenantId, ownerId)` → `owner(tenantId, id)` · ON DELETE RESTRICT _(composite — invisible to Prisma)_
- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT
- `(tenantId, lotId)` → `lot(tenantId, id)` · ON DELETE RESTRICT _(composite — invisible to Prisma)_

### `lot_lineage`

Parent→child lineage edges for splits/blends (structure-only in Phase 1; blends are Phase 5). `fraction` is the parent's share of the child where meaningful.

_Prisma model: `LotLineage`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` | Phase 12 tenant scope (nullable U2 -> backfill U3 -> NOT NULL U5); FK+RLS at DB level |
| `id` | String | no | 🔑 | `cuid()` |  |
| `parentLotId` | String | no | 🔗 |  |  |
| `childLotId` | String | no | 🔗 |  |  |
| `fraction` | Decimal `Decimal(6, 5)` | yes |  |  |  |
| `kind` | String | no |  |  | SPLIT \| BLEND \| TOPPING |
| `createdAt` | DateTime | no |  | `now()` |  |

**References**

- `(tenantId, childLotId)` → `lot(tenantId, id)` · ON DELETE CASCADE _(composite — invisible to Prisma)_
- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT
- `(tenantId, parentLotId)` → `lot(tenantId, id)` · ON DELETE RESTRICT _(composite — invisible to Prisma)_

### `lot_operation`

One immutable ledger event. The autoincrement `id` IS the monotonic fold order (deterministic ordering; `observedAt` can collide / drift — D14). `correctsOperationId` is unique so any op can be corrected at most once (kills the double-correction race).

_Prisma model: `LotOperation`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` | Phase 12 tenant scope (nullable U2 -> backfill U3 -> NOT NULL U5); FK+RLS at DB level |
| `id` | Int | no | 🔑 | `autoincrement()` |  |
| `type` | OperationType | no |  |  |  |
| `observedAt` | DateTime | no |  | `now()` |  |
| `enteredAt` | DateTime | no |  | `now()` |  |
| `actorUserId` | String | yes |  |  |  |
| `enteredBy` | String | no |  |  | email snapshot (provenance) |
| `captureMethod` | CaptureMethod | no |  | `MANUAL` |  |
| `note` | String | yes |  |  |  |
| `correctsOperationId` | Int | yes | 🔗 ∪ |  |  |
| `batchId` | String | yes |  |  | Phase 3: groups the per-vessel ops of one group fan-out (D13) |
| `commandId` | String | yes | ∪ |  | Phase 6: client-generated idempotency key for mutating transforms (crush/press/saignée). UNIQUE so a double-tap on a flaky crush-pad network is a no-op success, not a duplicate lot (council S4). Nullable: pre-Phase-6 ops have none; Postgres allows many NULLs. |
| `metadata` | Json | yes |  |  |  |
| `createdAt` | DateTime | no |  | `now()` |  |

**References**

- `(correctsOperationId)` → `lot_operation(id)` · ON DELETE RESTRICT
- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT

### `lot_operation_line`

A signed volumetric line. `vesselId = null` is the external counter-account that keeps each operation balanced (seed-in, loss-out, bottle-out). `lotCode`/`vesselCode` are durable snapshots so history reads survive later renames/deletes.

_Prisma model: `LotOperationLine`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` | Phase 12 tenant scope (nullable U2 -> backfill U3 -> NOT NULL U5); FK+RLS at DB level |
| `ownerId` | String | yes | 🔗 |  | Plan 093 Unit 2: owner-scope; nullable (Estate=NULL); maintained per Unit 4; composite FK -> owner(tenantId,id) in the migration (K11) |
| `id` | Int | no | 🔑 | `autoincrement()` |  |
| `operationId` | Int | no | 🔗 |  |  |
| `lotId` | String | no | 🔗 |  |  |
| `vesselId` | String | yes | 🔗 |  | null = "outside the cellar" |
| `deltaL` | Decimal `Decimal(10, 2)` | no |  |  | signed; CHECK(deltaL <> 0) in migration |
| `reason` | String | yes |  |  |  |
| `bucket` | LedgerBucket | no |  | `EXTERNAL` | Phase 7 (K3): the explicit account this leg touches. VESSEL (vesselId set) \| EXTERNAL (left the cellar) \| BOTTLE_STORAGE (wine-in-bottle). A BOTTLE_STORAGE leg carries BOTH deltaL and bottleDelta; every other leg has bottleDelta NULL. The pairing is enforced by a DB CHECK (bucket='BOTTLE_STORAGE' ⇔ bottleDelta IS NOT NULL). Backfilled on existing rows: VESSEL where vesselId is set, else EXTERNAL. |
| `bottleDelta` | Int | yes |  |  | signed bottle-count change on a BOTTLE_STORAGE leg (else NULL) |
| `lotCode` | String | no |  |  |  |
| `vesselCode` | String | yes |  |  |  |
| `sourceBondId` | String | yes | 🔗 |  | Phase 2 (BOND-1): line-level, time-aware bond affiliation. A bond-moving op (TRANSFER_IN_BOND, RETURN_TO_BOND) stamps these with an EXPLICIT, non-null, source≠dest bond (enforced in the core, not the schema). Legacy/origination lines leave them NULL and the bond derives to the tenant's primary bond (OQ-3). The authoritative bond of a position is DERIVED point-in-time from these (deriveBond), never a mutable Lot column. Composite (tenantId, bondId) → bond(tenantId, id) FKs live in raw SQL (M2) — no Prisma @relation (Phase-1 Surprise 1: composite relations blow TS depth). |
| `destBondId` | String | yes | 🔗 |  |  |

**References**

- `(operationId)` → `lot_operation(id)` · ON DELETE CASCADE
- `(tenantId, ownerId)` → `owner(tenantId, id)` · ON DELETE RESTRICT _(composite — invisible to Prisma)_
- `(tenantId, destBondId)` → `bond(tenantId, id)` · ON DELETE RESTRICT _(composite — invisible to Prisma)_
- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT
- `(tenantId, lotId)` → `lot(tenantId, id)` · ON DELETE RESTRICT _(composite — invisible to Prisma)_
- `(tenantId, sourceBondId)` → `bond(tenantId, id)` · ON DELETE RESTRICT _(composite — invisible to Prisma)_
- `(tenantId, vesselId)` → `vessel(tenantId, id)` · ON DELETE SET NULL _(composite — invisible to Prisma)_

### `lot_state_event`

A recorded transition of one of the three orthogonal state vectors (form / AF / MLF). Form is mutable only through these (direct writes banned). Ordering (council/Codex): when a transition is caused by a transform it carries the triggering `operationId` (shares the ledger's monotonic fold order); standalone changes use a per-lot optimistic version check. `commandId` UNIQUE makes a phase mutation idempotent (duplicate-as-success, council S4).

_Prisma model: `LotStateEvent`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` | Phase 12 tenant scope (nullable U2 -> backfill U3 -> NOT NULL U5); FK+RLS at DB level |
| `ownerId` | String | yes | 🔗 |  | Plan 093 Unit 2: owner-scope; nullable (Estate=NULL); maintained per Unit 4; composite FK -> owner(tenantId,id) in the migration (K11) |
| `id` | String | no | 🔑 | `cuid()` |  |
| `lotId` | String | no | 🔗 |  |  |
| `vesselId` | String | yes | 🔗 |  | snapshot context (the vessel the lot sat in at the transition) |
| `kind` | String | no |  |  | FORM \| AF \| MLF — which vector changed (validated in code) |
| `fromValue` | String | no |  |  | the prior enum value as text (durable across enum edits) |
| `toValue` | String | no |  |  | the new enum value as text |
| `observedAt` | DateTime | no |  |  |  |
| `enteredAt` | DateTime | no |  | `now()` |  |
| `enteredById` | String | yes |  |  | actor id snapshot (no FK; matches LotOperation.actorUserId) |
| `enteredByEmail` | String | no |  |  | durable provenance snapshot |
| `captureMethod` | CaptureMethod | no |  | `MANUAL` |  |
| `note` | String | yes |  |  |  |
| `operationId` | Int | yes | 🔗 |  | set when a transform (crush/press/saignée/AF-dry) drove this transition |
| `commandId` | String | yes | ∪ |  | idempotency for a standalone phase mutation (duplicate=success) |
| `createdAt` | DateTime | no |  | `now()` |  |

**References**

- `(lotId)` → `lot(id)` · ON DELETE CASCADE
- `(operationId)` → `lot_operation(id)` · ON DELETE SET NULL
- `(tenantId, ownerId)` → `owner(tenantId, id)` · ON DELETE RESTRICT _(composite — invisible to Prisma)_
- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT
- `(vesselId)` → `vessel(id)` · ON DELETE SET NULL

### `lot_tasting_note`

A structured tasting note on a lot. Free-text search (NICE) is a `contains` over notes/aroma/flavor — no tsvector this phase (avoids the search_vector migration gotcha).

_Prisma model: `LotTastingNote`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` | Phase 12 tenant scope (nullable U2 -> backfill U3 -> NOT NULL U5); FK+RLS at DB level |
| `ownerId` | String | yes | 🔗 |  | Plan 093 Unit 2: owner-scope; nullable (Estate=NULL); maintained per Unit 4; composite FK -> owner(tenantId,id) in the migration (K11) |
| `id` | String | no | 🔑 | `cuid()` |  |
| `lotId` | String | no | 🔗 |  |  |
| `vesselId` | String | yes | 🔗 |  |  |
| `observedAt` | DateTime | no |  |  |  |
| `enteredAt` | DateTime | no |  | `now()` |  |
| `enteredById` | String | yes |  |  |  |
| `enteredByEmail` | String | no |  |  |  |
| `captureMethod` | CaptureMethod | no |  | `MANUAL` |  |
| `appearance` | String | yes |  |  |  |
| `aroma` | String | yes |  |  |  |
| `flavor` | String | yes |  |  |  |
| `tannin` | Int | yes |  |  | 1–5 structure scores |
| `acidity` | Int | yes |  |  |  |
| `body` | Int | yes |  |  |  |
| `finish` | Int | yes |  |  |  |
| `score` | Int | yes |  |  |  |
| `scoreScale` | TastingScoreScale | yes |  |  |  |
| `readiness` | TastingReadiness | yes |  |  |  |
| `notes` | String | yes |  |  |  |
| `clientRequestId` | String | yes | ∪ |  |  |
| `voidedAt` | DateTime | yes |  |  |  |
| `voidedById` | String | yes |  |  |  |
| `createdAt` | DateTime | no |  | `now()` |  |

**References**

- `(lotId)` → `lot(id)` · ON DELETE RESTRICT
- `(tenantId, ownerId)` → `owner(tenantId, id)` · ON DELETE RESTRICT _(composite — invisible to Prisma)_
- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT
- `(vesselId)` → `vessel(id)` · ON DELETE SET NULL

### `lot_treatment`

───────────────────────── Cellar operations (Phase 3) ───────────────────────── Detail rows for cellar operations that ride ON TOP of a LotOperation. A volume-NEUTRAL op (addition, fining, cap management) is a LotOperation with NO volumetric lines + one of these treatment rows; a volume-CHANGING op (filtration, loss, topping) carries lines AND, where it has material/medium detail, a treatment. The lot timeline UNIONs lot_operation_line.lotId with lot_treatment.lotId so neutral ops still appear. Material/rate/total + the volume SNAPSHOT used are stored, never recomputed (VISION D14). Corrected/voided via voidedByOperationId (stays visible).

_Prisma model: `LotTreatment`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` | Phase 12 tenant scope (nullable U2 -> backfill U3 -> NOT NULL U5); FK+RLS at DB level |
| `ownerId` | String | yes | 🔗 |  | Plan 093 Unit 2: owner-scope; nullable (Estate=NULL); maintained per Unit 4; composite FK -> owner(tenantId,id) in the migration (K11) |
| `id` | String | no | 🔑 | `cuid()` |  |
| `operationId` | Int | no | 🔗 |  |  |
| `lotId` | String | no | 🔗 |  |  |
| `vesselId` | String | yes | 🔗 |  | the vessel the op happened in (snapshot context) |
| `kind` | String | no |  |  | ADDITION \| FINING \| FILTRATION \| PUMPOVER \| PUNCHDOWN |
| `materialId` | String | yes | 🔗 |  | optional catalog link |
| `materialName` | String | yes |  |  | durable snapshot of the material name |
| `rateValue` | Decimal `Decimal(12, 4)` | yes |  |  |  |
| `rateBasis` | String | yes |  |  | G_HL \| MG_L \| G_L \| ML_L (validated in code, not a DB enum) |
| `computedTotal` | Decimal `Decimal(12, 3)` | yes |  |  |  |
| `computedUnit` | String | yes |  |  | g \| mL |
| `volumeLAtAddition` | Decimal `Decimal(10, 2)` | yes |  |  | vessel volume used for the math (snapshot) |
| `durationMin` | Int | yes |  |  | cap management duration |
| `medium` | String | yes |  |  | filtration medium (e.g. "pad", "membrane") |
| `micron` | Decimal `Decimal(8, 2)` | yes |  |  | filtration nominal micron |
| `note` | String | yes |  |  |  |
| `voidedByOperationId` | Int | yes | 🔗 |  | set when a CORRECTION op voids this treatment (D6/D15) |
| `createdAt` | DateTime | no |  | `now()` |  |

**References**

- `(lotId)` → `lot(id)` · ON DELETE RESTRICT
- `(materialId)` → `cellar_material(id)` · ON DELETE SET NULL
- `(operationId)` → `lot_operation(id)` · ON DELETE CASCADE
- `(tenantId, ownerId)` → `owner(tenantId, id)` · ON DELETE RESTRICT _(composite — invisible to Prisma)_
- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT
- `(vesselId)` → `vessel(id)` · ON DELETE SET NULL
- `(voidedByOperationId)` → `lot_operation(id)` · ON DELETE SET NULL

### `lot_vineyard`

───────────────────────── Phase 5: blends, lineage source-set & RBAC ───────────────────────── A lot's source-vineyard SET. A single-origin lot has one row; a blend has the UNION of its parents' full sets (materialized at the BLEND write, inductively transitive — council C6). Populated at SEED from originVineyardId and backfilled for existing lots. The scoping/lens query is "lots whose source vineyard ∈ my set" → index on vineyardId.

_Prisma model: `LotVineyard`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` | Phase 12 tenant scope (nullable U2 -> backfill U3 -> NOT NULL U5); FK+RLS at DB level |
| `ownerId` | String | yes | 🔗 |  | Plan 093 Unit 2: owner-scope; nullable (Estate=NULL); maintained per Unit 4; composite FK -> owner(tenantId,id) in the migration (K11) |
| `id` | String | no | 🔑 | `cuid()` |  |
| `lotId` | String | no | 🔗 |  |  |
| `vineyardId` | String | no | 🔗 |  |  |
| `createdAt` | DateTime | no |  | `now()` |  |

**References**

- `(tenantId, ownerId)` → `owner(tenantId, id)` · ON DELETE RESTRICT _(composite — invisible to Prisma)_
- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT
- `(tenantId, lotId)` → `lot(tenantId, id)` · ON DELETE CASCADE _(composite — invisible to Prisma)_
- `(tenantId, vineyardId)` → `vineyard(tenantId, id)` · ON DELETE RESTRICT _(composite — invisible to Prisma)_

### `naming_template`

Phase 1 (identity presentation) — a per-tenant, versioned tokenized naming scheme. Mirrors the WorkOrderTemplate/Version clone-on-customize pattern: the header points at currentVersion; each edit inserts a new immutable NamingTemplateVersion. The built-in default (isSystem+isDefault) reproduces today's buildLotCode output byte-for-byte (the renderer delegates to it). Single active default per tenant is a raw-SQL partial unique. Composite FK + RLS in raw SQL.

_Prisma model: `NamingTemplate`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` |  |
| `id` | String | no | 🔑 | `cuid()` |  |
| `code` | String | no |  |  | per-tenant stable key |
| `name` | String | no |  |  |  |
| `isSystem` | Boolean | no |  | `false` |  |
| `isDefault` | Boolean | no |  | `false` |  |
| `clonedFromId` | String | yes |  |  | lineage of a clone-on-customize |
| `currentVersion` | Int | no |  | `1` | naked pointer, matching WorkOrderTemplate precedent |
| `archivedAt` | DateTime | yes |  |  |  |
| `createdAt` | DateTime | no |  | `now()` |  |
| `updatedAt` | DateTime | no |  |  |  |

**References**

- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT

### `naming_template_version`

An immutable version snapshot of a NamingTemplate's tokenized spec. Editing a template creates a new version, never mutating an old one (WO-template parity). Composite tenant FK to the header.

_Prisma model: `NamingTemplateVersion`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` |  |
| `id` | String | no | 🔑 | `cuid()` |  |
| `templateId` | String | no | 🔗 |  |  |
| `version` | Int | no |  |  |  |
| `spec` | Json | no |  |  | the tokenized pattern (ordered typed segments + blend-variant flag) |
| `createdAt` | DateTime | no |  | `now()` |  |
| `createdById` | String | yes |  |  |  |
| `createdByEmail` | String | yes |  |  |  |

**References**

- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT
- `(tenantId, templateId)` → `naming_template(tenantId, id)` · ON DELETE CASCADE _(composite — invisible to Prisma)_

### `vessel_lot`

The materialized current-state projection: how much of one lot sits in one vessel. Always equals the fold of the ledger (INVARIANT #7). CHECK(volumeL > 0) in migration; a row at functional zero is deleted, never stored at 0.

_Prisma model: `VesselLot`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` | Phase 12 tenant scope (nullable U2 -> backfill U3 -> NOT NULL U5); FK+RLS at DB level |
| `ownerId` | String | yes | 🔗 |  | Plan 093 Unit 2: owner-scope; nullable (Estate=NULL); maintained per Unit 4; composite FK -> owner(tenantId,id) in the migration (K11) |
| `id` | String | no | 🔑 | `cuid()` |  |
| `vesselId` | String | no | 🔗 |  |  |
| `lotId` | String | no | 🔗 |  |  |
| `volumeL` | Decimal `Decimal(10, 2)` | no |  |  |  |
| `updatedAt` | DateTime | no |  |  |  |

**References**

- `(tenantId, ownerId)` → `owner(tenantId, id)` · ON DELETE RESTRICT _(composite — invisible to Prisma)_
- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT
- `(tenantId, lotId)` → `lot(tenantId, id)` · ON DELETE RESTRICT _(composite — invisible to Prisma)_
- `(tenantId, vesselId)` → `vessel(tenantId, id)` · ON DELETE CASCADE _(composite — invisible to Prisma)_

## Vessels, analysis & trials

_Tanks and barrels, what is dissolved in them, lab readings, and blend trials._ — 14 tables.

### `analysis_panel`

A panel HEADER groups one batch of readings observed together (a bench reading is a 1-child panel). The header owns observedAt + provenance + the optional sample link + voidedAt (so a panel voids ATOMICALLY — void the header, all readings drop). A returned lab result is a panel with `sampleId` set. SO₂ pairing happens WITHIN one panel only.

_Prisma model: `AnalysisPanel`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` | Phase 12 tenant scope (nullable U2 -> backfill U3 -> NOT NULL U5); FK+RLS at DB level |
| `ownerId` | String | yes | 🔗 |  | Plan 093 Unit 2: owner-scope; nullable (Estate=NULL); maintained per Unit 4; composite FK -> owner(tenantId,id) in the migration (K11) |
| `id` | String | no | 🔑 | `cuid()` |  |
| `lotId` | String | no | 🔗 |  |  |
| `vesselId` | String | yes | 🔗 |  | snapshot context (the vessel the lot sat in when measured) |
| `sampleId` | String | yes | 🔗 |  | set when this panel is a returned result for a Sample |
| `observedAt` | DateTime | no |  |  | when the wine was sampled/measured (time axis for trends) |
| `enteredAt` | DateTime | no |  | `now()` |  |
| `enteredById` | String | yes |  |  | actor id snapshot (no FK; matches LotOperation.actorUserId) |
| `enteredByEmail` | String | no |  |  | durable provenance snapshot |
| `captureMethod` | CaptureMethod | no |  | `MANUAL` |  |
| `note` | String | yes |  |  |  |
| `clientRequestId` | String | yes | ∪ |  | idempotency: a double-submit is a no-op (= the offline "panel" command key) |
| `deviceObservedAt` | DateTime | yes |  |  | Phase 6 offline capture (council S2/S5/S6): a Round row's Brix+temp commit as ONE atomic panel. `deviceObservedAt` is the tablet clock at capture; `serverReceivedAt` is set on insert; the stuck detector buckets by winery-tz. `occupancyToken` is the vessel's resident-lot version at capture — validated against vessel-lot history as of observedAt so a late offline sync can't attach a reading to the wrong lot. All nullable (chemistry panels created online leave them null). |
| `serverReceivedAt` | DateTime | yes |  |  |  |
| `occupancyToken` | String | yes |  |  |  |
| `vesselReadingGroupId` | String | yes |  |  | Plan 060 fan-out: when ONE physical reading is taken on a multi-lot vessel (co-ferment), it writes one panel per co-resident lot, ALL sharing this id (VISION D2 intact — each panel still attaches to exactly one lot). Vessel-scoped views dedup by coalesce(vesselReadingGroupId, id); lot-scoped views are unaffected so each lot keeps its curve. NULL = ordinary single-lot reading. Derived deterministically from the capture's stable clientRequestId so retries/offline re-sync land the same group. The @@unique below makes fan-out idempotent + blocks divergent same-(group,lot) rows. |
| `voidedAt` | DateTime | yes |  |  |  |
| `voidedById` | String | yes |  |  |  |
| `createdAt` | DateTime | no |  | `now()` |  |

**References**

- `(lotId)` → `lot(id)` · ON DELETE RESTRICT
- `(tenantId, ownerId)` → `owner(tenantId, id)` · ON DELETE RESTRICT _(composite — invisible to Prisma)_
- `(sampleId)` → `sample(id)` · ON DELETE SET NULL
- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT
- `(vesselId)` → `vessel(id)` · ON DELETE SET NULL

### `analysis_reading`

One analyte reading inside a panel. `analyte` is a code-validated string (the TS registry in src/lib/chemistry/analytes.ts — a new analyte is a config edit, not a migration). Trends query readings by `analyte` joined to the non-voided parent panel; the panel's `observedAt` is the time axis.

_Prisma model: `AnalysisReading`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` | Phase 12 tenant scope (nullable U2 -> backfill U3 -> NOT NULL U5); FK+RLS at DB level |
| `id` | String | no | 🔑 | `cuid()` |  |
| `panelId` | String | no | 🔗 |  |  |
| `analyte` | String | no |  |  | registry key (PH, FREE_SO2, …) — validated in code, not a DB enum |
| `value` | Decimal `Decimal(12, 4)` | no |  |  |  |
| `unit` | String | no |  |  | the unit the value was entered in (registry-allowed) |
| `captureId` | String | yes | ∪ |  | Phase 6 offline idempotency (council S1): a client-minted UUID per analyte reading. UNIQUE + ON CONFLICT DO NOTHING on insert; a duplicate sync is treated as SUCCESS. A captured reading is immutable — an edit mints a NEW captureId, never reuses one. Nullable: online chemistry readings have none. |
| `createdAt` | DateTime | no |  | `now()` |  |

**References**

- `(panelId)` → `analysis_panel(id)` · ON DELETE CASCADE
- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT

### `blend_trial`

An OFF-LEDGER bench trial — a throwaway small-scale blend experiment (component lots + proportions/volumes + a tasting outcome). Zero ledger impact until PROMOTED, when the chosen ratios prefill the blend builder and a real BLEND op runs (promotedToLotId links the result). Reuses the Phase 4 tasting enums. CHECK (score-with-scale together-or-neither) in migration.

_Prisma model: `BlendTrial`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` | Phase 12 tenant scope (nullable U2 -> backfill U3 -> NOT NULL U5); FK+RLS at DB level |
| `id` | String | no | 🔑 | `cuid()` |  |
| `name` | String | no |  |  |  |
| `targetWine` | String | yes |  |  | intent — what this trial aims at; groups DRAFTs (council S9) |
| `note` | String | yes |  |  |  |
| `baseVolume` | Decimal `Decimal(12, 3)` | yes |  |  | bench base size |
| `baseUnit` | String | yes |  |  | mL \| L (validated in code) |
| `status` | BlendTrialStatus | no |  | `DRAFT` |  |
| `score` | Int | yes |  |  |  |
| `scoreScale` | TastingScoreScale | yes |  |  |  |
| `readiness` | TastingReadiness | yes |  |  |  |
| `tastingNotes` | String | yes |  |  |  |
| `chosenAt` | DateTime | yes |  |  |  |
| `promotedToLotId` | String | yes | 🔗 |  |  |
| `enteredAt` | DateTime | no |  | `now()` |  |
| `enteredById` | String | yes |  |  | actor id snapshot (no FK; matches LotOperation.actorUserId) |
| `enteredByEmail` | String | no |  |  | durable provenance snapshot |
| `createdAt` | DateTime | no |  | `now()` |  |
| `updatedAt` | DateTime | no |  |  |  |

**References**

- `(promotedToLotId)` → `lot(id)` · ON DELETE SET NULL
- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT

### `blend_trial_component`

One component of a bench trial: a lot + its share (proportion ∈ (0,1]) or absolute volume. CHECK (proportion ∈ (0,1]) in migration.

_Prisma model: `BlendTrialComponent`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` | Phase 12 tenant scope (nullable U2 -> backfill U3 -> NOT NULL U5); FK+RLS at DB level |
| `id` | String | no | 🔑 | `cuid()` |  |
| `trialId` | String | no | 🔗 |  |  |
| `lotId` | String | no | 🔗 |  |  |
| `proportion` | Decimal `Decimal(6, 5)` | yes |  |  | share of the base, (0,1] |
| `volume` | Decimal `Decimal(12, 3)` | yes |  |  |  |
| `unit` | String | yes |  |  | mL \| L |
| `createdAt` | DateTime | no |  | `now()` |  |

**References**

- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT
- `(tenantId, lotId)` → `lot(tenantId, id)` · ON DELETE RESTRICT _(composite — invisible to Prisma)_
- `(tenantId, trialId)` → `blend_trial(tenantId, id)` · ON DELETE CASCADE _(composite — invisible to Prisma)_

### `cellar_material`

Light material catalog (SO₂, nutrients, acids, tannins, fining agents) upserted on first use, deduped by normalizedKey within a kind (mirrors FieldInput). Carries a default dose basis + optional %active; cost/inventory is deferred to Phase 8.

_Prisma model: `CellarMaterial`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` | Phase 12 tenant scope (nullable U2 -> backfill U3 -> NOT NULL U5); FK+RLS at DB level |
| `id` | String | no | 🔑 | `cuid()` |  |
| `name` | String | no |  |  | display label |
| `normalizedKey` | String | no |  |  | dedup key (strip-non-alphanumeric, UPPERCASE) |
| `kind` | String | no |  |  | load-bearing family (cost/dosing/identity): YEAST \| MLF \| SO2 \| NUTRIENT \| ACID \| SUGAR \| TANNIN \| FINING \| BENTONITE \| CHITOSAN \| ENZYME \| CLEANING \| SANITIZER \| PACKAGING \| OTHER |
| `subcategory` | String | yes |  |  | Phase 034: optional user-defined subcategory (organizational only). Retired from UI in Phase 036 (family = kind); column kept dormant. NOT part of identity. |
| `category` | String | yes |  |  | Phase 036: STORED main category (cost-safety authority: isDoseableCategory) + a richer purchase record. `category` is one of ADDITIVE\|CLEANING_SANITIZING\|PACKAGING\|OTHER (validated in code); nullable with a categoryOf(kind) fallback so legacy rows keep working. All organizational/display/purchase-metadata — NONE are part of identity (@@unique stays kind+normalizedKey). stored main category (Phase 036); fallback = categoryOf(kind) |
| `genericName` | String | yes |  |  | e.g. "Bentonite" |
| `brand` | String | yes |  |  | manufacturer, e.g. "Lallemand" |
| `brandName` | String | yes |  |  | product/brand name, e.g. "EC-1118" |
| `preferGeneric` | Boolean | no |  | `false` | display toggle: show generic name instead of brand name |
| `vendor` | String | yes |  |  | LEGACY free-text "where purchased" (Plan 069: superseded by vendorId; kept for read-compat) |
| `vendorUrl` | String | yes |  |  | LEGACY free-text supplier/product URL (Plan 069: superseded by Vendor.url; kept for read-compat) |
| `vendorId` | String | yes | 🔗 |  | Plan 069: managed vendor — composite-tenant FK → vendor(tenantId,id) (raw SQL, K11) |
| `packageAmount` | Decimal `Decimal(18, 6)` | yes |  |  | purchase package size AMOUNT (e.g. 100 for a 100-gallon drum) |
| `packageUnit` | String | yes |  |  | purchase package UNIT of measure (e.g. gal, lb, mL — see src/lib/units/measure.ts) |
| `defaultBasis` | String | yes |  |  | G_HL \| MG_L \| G_L \| ML_L |
| `percentActive` | Decimal `Decimal(6, 3)` | yes |  |  | %active (material property, not a dose basis) |
| `isActive` | Boolean | no |  | `true` |  |
| `packagingSize` | Decimal `Decimal(18, 6)` | yes |  |  | Phase 8 (Unit 1): stock + cost tracking, all additive. `stockUnit` is the canonical unit stock is held/consumed in (g \| mg \| kg \| mL \| L \| unit — validated in code); `packagingSize` is how much of stockUnit one purchased package holds (informational, for receive-by-package UX). `isStockTracked` opts a material into stock draw-down; a free-text/untracked material still doses (cost unknown, D14). |
| `stockUnit` | String | yes |  |  |  |
| `isStockTracked` | Boolean | no |  | `false` |  |
| `createdAt` | DateTime | no |  | `now()` |  |

**References**

- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT
- `(tenantId, vendorId)` → `vendor(tenantId, id)` · ON DELETE RESTRICT _(composite — invisible to Prisma)_

### `press_cycle`

A reusable, named press program (e.g. "Champagne cycle", "delicate white", "hard press"). Optional metadata on a PRESS op — the name is stamped into LotOperation.metadata.pressCycle; this table is just the pick-list the press form offers so cycles can be reused across pressings.

_Prisma model: `PressCycle`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` | Phase 12 tenant scope (nullable U2 -> backfill U3 -> NOT NULL U5); FK+RLS at DB level |
| `id` | String | no | 🔑 | `cuid()` |  |
| `name` | String | no |  |  |  |
| `createdAt` | DateTime | no |  | `now()` |  |

**References**

- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT

### `sample`

A lab/bench sample with a lifecycle (PULLED → SENT → PENDING → RESULT_RETURNED → ATTACHED, plus CANCELLED). 1→many AnalysisPanel: a returned result is a panel linked here. Transitions go through guarded core fns that set status + the matching timestamp together. The sample's `lotId` is captured AT PULL and inherited by its result panels (never re-resolved from the current vessel — backdated/late-resulted readings must not be misattributed). D2.

_Prisma model: `Sample`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` | Phase 12 tenant scope (nullable U2 -> backfill U3 -> NOT NULL U5); FK+RLS at DB level |
| `ownerId` | String | yes | 🔗 |  | Plan 093 Unit 2: owner-scope; nullable (Estate=NULL); maintained per Unit 4; composite FK -> owner(tenantId,id) in the migration (K11) |
| `id` | String | no | 🔑 | `cuid()` |  |
| `lotId` | String | no | 🔗 |  |  |
| `vesselId` | String | yes | 🔗 |  |  |
| `status` | SampleStatus | no |  | `PULLED` |  |
| `source` | String | yes |  |  | free text, e.g. "Barrel A3" |
| `lab` | String | yes |  |  | outside lab name (e.g. "ETS") |
| `pulledAt` | DateTime | no |  | `now()` | the sample's observed time |
| `sentAt` | DateTime | yes |  |  |  |
| `expectedAt` | DateTime | yes |  |  |  |
| `resultedAt` | DateTime | yes |  |  | when the lab ran it (metadata, not the reading's observed time) |
| `attachedAt` | DateTime | yes |  |  |  |
| `cancelledAt` | DateTime | yes |  |  |  |
| `enteredById` | String | yes |  |  |  |
| `enteredByEmail` | String | no |  |  |  |
| `captureMethod` | CaptureMethod | no |  | `MANUAL` |  |
| `note` | String | yes |  |  |  |
| `clientRequestId` | String | yes | ∪ |  |  |
| `createdAt` | DateTime | no |  | `now()` |  |
| `updatedAt` | DateTime | no |  |  |  |

**References**

- `(lotId)` → `lot(id)` · ON DELETE RESTRICT
- `(tenantId, ownerId)` → `owner(tenantId, id)` · ON DELETE RESTRICT _(composite — invisible to Prisma)_
- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT
- `(vesselId)` → `vessel(id)` · ON DELETE SET NULL

### `vessel`

_Prisma model: `Vessel`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` | Phase 12 tenant scope (nullable U2 -> backfill U3 -> NOT NULL U5); FK+RLS at DB level |
| `id` | String | no | 🔑 | `cuid()` |  |
| `code` | String | no |  |  | barrels: "Barrel #"; tanks: code. Unique per type (see @@unique below). |
| `type` | VesselType | no |  |  |  |
| `capacityL` | Decimal `Decimal(10, 2)` | no |  |  |  |
| `isActive` | Boolean | no |  | `true` |  |
| `blendName` | String | yes |  |  | optional label for the current blend in this vessel |
| `oakOrigin` | String | yes |  |  | Barrel-only metadata (null for tanks). Volume = capacityL (not duplicated here). The barrel's "Barrel #" is its `code` above — no separate number column. e.g. French, American, Hungarian |
| `cooperageYear` | Int | yes |  |  | year the barrel was made |
| `cooperage` | String | yes |  |  | barrel maker, e.g. Seguin Moreau |
| `toastLevel` | String | yes |  |  | e.g. Light, Medium, Medium+, Heavy |
| `createdAt` | DateTime | no |  | `now()` |  |
| `updatedAt` | DateTime | no |  |  |  |

**References**

- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT

### `vessel_activity_event`

Phase 9.1 (Unit 3) — the VESSEL-ACTIVITY lane. A lotless, vessel-scoped event for temperature setpoints and maintenance (cleaning / sanitizing / steaming / gas). NOT a wine operation: it writes NO LotOperation, no CostLine, no SupplyConsumption, and never enters the Phase-8 wine cost roll-up (WORKORDER-3). It works on an EMPTY, PARTIAL, or FULL vessel (A6). Any overhead supply it consumes is recorded as an append-only VesselActivitySupplyUse child (A1) — the physical depletion record, outside the wine cost DAG. Built to the Phase-12 checklist; migrations 20260703020000_vessel_activity_enums + _schema + _rls. External refs (vesselId / materialId) + the cluster edge (taskId) are COMPOSITE (tenantId, refId)→(tenantId, id) in raw SQL.

_Prisma model: `VesselActivityEvent`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` |  |
| `id` | String | no | 🔑 | `cuid()` |  |
| `vesselId` | String | no | 🔗 |  | the vessel the activity is on (composite-FK'd to vessel) |
| `kind` | VesselActivityKind | no |  |  |  |
| `taskId` | String | yes | 🔗 |  | the WO task that recorded it (composite-FK'd; null if recorded outside a WO) |
| `attemptId` | String | yes |  |  | the attempt that recorded it (plain scalar, mirrors WorkOrderTask.currentAttemptId) |
| `targetValue` | Decimal `Decimal(18, 6)` | yes |  |  | TEMP_SETPOINT target (e.g. 4.0) |
| `targetUnit` | String | yes |  |  | °C \| °F for TEMP_SETPOINT; the gas (Ar/N₂/CO₂/dry ice) for GAS |
| `achievedValue` | Decimal `Decimal(18, 6)` | yes |  |  | dec 4b: the actual reading captured at completion (e.g. current tank temp) |
| `achievedUnit` | String | yes |  |  |  |
| `materialId` | String | yes | 🔗 |  | the cleaning/sanitizer/gas supply consumed, if any (composite-FK'd) |
| `note` | String | yes |  |  |  |
| `observedAt` | DateTime | no |  | `now()` |  |
| `enteredById` | String | yes |  |  |  |
| `enteredByEmail` | String | no |  |  |  |
| `commandId` | String | no | ∪ |  | idempotency on the immutable event (mirrors the attempt) |
| `voidedAt` | DateTime | yes |  |  | A2: set when the activity is reversed/undone (its supply uses are restored) |
| `createdAt` | DateTime | no |  | `now()` |  |

**References**

- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT
- `(tenantId, materialId)` → `cellar_material(tenantId, id)` · ON DELETE RESTRICT _(composite — invisible to Prisma)_
- `(tenantId, taskId)` → `work_order_task(tenantId, id)` · ON DELETE RESTRICT _(composite — invisible to Prisma)_
- `(tenantId, vesselId)` → `vessel(tenantId, id)` · ON DELETE RESTRICT _(composite — invisible to Prisma)_

### `vessel_activity_supply_use`

Phase 9.1 (Unit 3, A1) — the append-only overhead depletion ledger: one row per SupplyLot drawn down by a vessel activity (FIFO across N lots). This is the PHYSICAL depletion record for cleaning/sanitizer/gas use; it is deliberately OUTSIDE SupplyConsumption / CostLine / the wine cost roll-up (WORKORDER-3) because a sanitizer isn't a cost of any specific wine — it's overhead. A reversal (A2) increments the SupplyLot back and appends a negating row (reversalOfSupplyUseId → the original). Never mutated.

_Prisma model: `VesselActivitySupplyUse`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` |  |
| `id` | String | no | 🔑 | `cuid()` |  |
| `vesselActivityEventId` | String | no | 🔗 |  | parent event (composite-FK'd to vessel_activity_event) |
| `supplyLotId` | String | no | 🔗 |  | the depleted lot (composite-FK'd to supply_lot) |
| `materialId` | String | no | 🔗 |  | the material (composite-FK'd to cellar_material) |
| `qty` | Decimal `Decimal(18, 6)` | no |  |  | qty drawn from this lot (stock unit); negative on a reversal row |
| `unit` | String | no |  |  |  |
| `unitCost` | Decimal `Decimal(18, 8)` | yes |  |  | per stock unit; NULL = unknown cost (D14) |
| `extendedCost` | Decimal `Decimal(18, 8)` | yes |  |  | qty × unitCost; NULL when the rate is unknown |
| `reversalOfSupplyUseId` | String | yes |  |  | set on a negating row that restores another use (A2 identity reversal) |
| `createdAt` | DateTime | no |  | `now()` |  |

**References**

- `(tenantId, vesselActivityEventId)` → `vessel_activity_event(tenantId, id)` · ON DELETE CASCADE _(composite — invisible to Prisma)_
- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT
- `(tenantId, materialId)` → `cellar_material(tenantId, id)` · ON DELETE RESTRICT _(composite — invisible to Prisma)_
- `(tenantId, supplyLotId)` → `supply_lot(tenantId, id)` · ON DELETE RESTRICT _(composite — invisible to Prisma)_

### `vessel_component`

_Prisma model: `VesselComponent`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` | Phase 12 tenant scope (nullable U2 -> backfill U3 -> NOT NULL U5); FK+RLS at DB level |
| `id` | String | no | 🔑 | `cuid()` |  |
| `vesselId` | String | no | 🔗 |  |  |
| `varietyId` | String | no | 🔗 |  |  |
| `vineyardId` | String | no | 🔗 |  |  |
| `vintage` | Int | no |  |  |  |
| `volumeL` | Decimal `Decimal(10, 2)` | no |  |  |  |
| `createdAt` | DateTime | no |  | `now()` |  |
| `updatedAt` | DateTime | no |  |  |  |

**References**

- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT
- `(varietyId)` → `variety(id)` · ON DELETE RESTRICT
- `(vesselId)` → `vessel(id)` · ON DELETE CASCADE
- `(vineyardId)` → `vineyard(id)` · ON DELETE RESTRICT

### `vessel_group`

A named set of vessels (e.g. a barrel group) so one operation can fan out to its members (D13). Structure-only in Phase 1; the fan-out UI/logic landed in Phase 3; Cellarhand v2 Phase 7 (RFC-001) made it a configurable operational object.

_Prisma model: `VesselGroup`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` | Phase 12 tenant scope (nullable U2 -> backfill U3 -> NOT NULL U5); FK+RLS at DB level |
| `id` | String | no | 🔑 | `cuid()` |  |
| `name` | String | no |  |  |  |
| `note` | String | yes |  |  |  |
| `isActive` | Boolean | no |  | `true` | `status` is AUTHORITATIVE; `isActive` survives as a legacy mirror because live read paths still filter on it (listGroups -> resolveGroupByName -> the whole work-order NL group resolver). A DB CHECK + BEFORE trigger (20260730110100_vessel_group_structure) make the two impossible to drift, so this is a compatibility mirror rather than a second source of truth. |
| `type` | VesselGroupType | no |  | `OPERATIONAL` |  |
| `status` | VesselGroupStatus | no |  | `ACTIVE` |  |
| `locationId` | String | yes | 🔗 |  | D4: the hall/room is a real Location; the RACK is not (Location.kind is cellar/warehouse/crush_pad/lab/bottling/external/other — racks are not modelled there). Composite tenant FK (tenantId, locationId) -> location(tenantId, id), raw SQL (K11). |
| `rackLabel` | String | yes |  |  |  |
| `settings` | Json | yes |  |  | RFC-001 §4.4 group settings: topping interval + source, keg preset, SO2 target, sampling rule, default crew, default WO template. DEFAULTS FOR GENERATED WORK ORDERS, never a live constraint. Json because the set is explicitly open and none of it is queried. |
| `createdAt` | DateTime | no |  | `now()` |  |
| `updatedAt` | DateTime | yes |  |  |  |

**References**

- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT
- `(tenantId, locationId)` → `location(tenantId, id)` · ON DELETE RESTRICT _(composite — invisible to Prisma)_

### `vessel_group_member`

_Prisma model: `VesselGroupMember`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` | Phase 12 tenant scope (nullable U2 -> backfill U3 -> NOT NULL U5); FK+RLS at DB level |
| `id` | String | no | 🔑 | `cuid()` |  |
| `groupId` | String | no | 🔗 |  |  |
| `vesselId` | String | no | 🔗 |  |  |
| `position` | Int | no |  | `0` | RFC-001 §4.3: per-group, contiguous, reorderable walk order ("barrel 10 of 22"). 0 is the "caller didn't say" sentinel — a BEFORE INSERT trigger assigns MAX+1 so legacy createMany() call sites that pass only {groupId, vesselId} still get a deterministic order. |
| `groupType` | VesselGroupType | no |  | `OPERATIONAL` | DENORMALISED from VesselGroup.type, and NEVER written by app code — a BEFORE INSERT OR UPDATE trigger overwrites whatever is supplied with the group's real type. It exists because GROUP-1's partial unique index is `WHERE groupType = 'OPERATIONAL'` and a partial index predicate cannot reference another table. The trigger is what makes the denormalisation safe to enforce on. |

**References**

- `(groupId)` → `vessel_group(id)` · ON DELETE CASCADE
- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT
- `(tenantId, groupId)` → `vessel_group(tenantId, id)` · ON DELETE CASCADE _(composite — invisible to Prisma)_
- `(tenantId, vesselId)` → `vessel(tenantId, id)` · ON DELETE CASCADE _(composite — invisible to Prisma)_
- `(vesselId)` → `vessel(id)` · ON DELETE CASCADE

### `vessel_transfer`

One racking / wine transfer between two vessels. `volumeL` is the volume drawn OUT of the source; `lossL` is what was lost to lees (volume INTO the destination = volumeL - lossL). `components` is a JSON snapshot of the moved breakdown ([{ varietyName, vineyardName, vintage, volumeL }]) so history reads correctly even for multi-lot (tank) racks and survives later vessel edits. Vessel codes are snapshotted so a deleted vessel (FK SetNull) still shows in history.

_Prisma model: `VesselTransfer`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` | Phase 12 tenant scope (nullable U2 -> backfill U3 -> NOT NULL U5); FK+RLS at DB level |
| `id` | String | no | 🔑 | `cuid()` |  |
| `fromVesselId` | String | yes | 🔗 |  |  |
| `toVesselId` | String | yes | 🔗 |  |  |
| `fromVesselCode` | String | no |  |  |  |
| `toVesselCode` | String | no |  |  |  |
| `volumeL` | Decimal `Decimal(10, 2)` | no |  |  |  |
| `lossL` | Decimal `Decimal(10, 2)` | no |  | `0` |  |
| `components` | Json | no |  |  |  |
| `note` | String | yes |  |  |  |
| `actorUserId` | String | yes |  |  |  |
| `actorEmail` | String | no |  |  |  |
| `rackedAt` | DateTime | no |  | `now()` |  |
| `revertedAt` | DateTime | yes |  |  | Revert tracking (LEGACY undo path). Phase 1 (D6/D15) replaces row-reversion with a CORRECTION ledger op; "reverted" is derived from a correction's existence. These columns remain for the pre-cutover history read and are dropped in a later cleanup. |
| `revertsId` | String | yes | 🔗 |  |  |
| `lotOperationId` | Int | yes | 🔗 ∪ |  | Phase 1: a RACK is a derived read-model of one ledger operation. Unique 1:1 link; written only by the ledger writer. |

**References**

- `(fromVesselId)` → `vessel(id)` · ON DELETE SET NULL
- `(lotOperationId)` → `lot_operation(id)` · ON DELETE SET NULL
- `(revertsId)` → `vessel_transfer(id)` · ON DELETE SET NULL
- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT
- `(toVesselId)` → `vessel(id)` · ON DELETE SET NULL

## Materials & equipment

_Consumables, supply lots, barrels, and tracked equipment assets._ — 8 tables.

### `barrel_asset`

Phase 8b (Unit 8, D7) — a barrel-as-depreciating-asset sidecar (1:1 with a BARREL Vessel). Barrel carrying cost amortizes over its useful life measured in FILLS, accelerated by fill number (first fill imparts the most oak character → the most cost). `currentFillNumber` is the running fill counter bumped when wine enters an empty barrel. Optional: a barrel with no BarrelAsset simply accrues no barrel cost (physical tracking unaffected). Not the tank's concern — tanks never get one.

_Prisma model: `BarrelAsset`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` |  |
| `id` | String | no | 🔑 | `cuid()` |  |
| `vesselId` | String | no | 🔗 ∪ |  | the BARREL vessel this asset describes (1:1) |
| `purchaseCost` | Decimal `Decimal(18, 8)` | no |  |  |  |
| `currency` | String | no |  | `"USD"` |  |
| `usefulLifeFills` | Int | no |  | `4` | fills over which the barrel fully depreciates |
| `currentFillNumber` | Int | no |  | `0` | running counter; ++ when wine enters the empty barrel |
| `acquiredAt` | DateTime | no |  | `now()` |  |
| `createdAt` | DateTime | no |  | `now()` |  |
| `updatedAt` | DateTime | no |  |  |  |

**References**

- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT
- `(tenantId, vesselId)` → `vessel(tenantId, id)` · ON DELETE CASCADE _(composite — invisible to Prisma)_

### `barrel_fill`

Phase 8b (Unit 8, D7) — one barrel-residency interval: a lot occupying a barrel over [startedAt, endedAt]. `fillNumber` picks the accelerated-depreciation slice; `fillDepreciation` is the $ that slice allocates ($ = purchaseCost × slice-fraction). While OPEN (endedAt null) the roll-up derives an accrue-to-date BARREL cost event (days-so-far); when the lot leaves the barrel the fill CLOSES and an immutable BARREL CostLine is materialized on the close op (so the snapshot can freeze it and the on-read derivation stops double-counting it). Volume is snapshotted at fill open (v1). Two lots in one barrel each get their own fill row → cost splits by volume×time.

_Prisma model: `BarrelFill`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` |  |
| `ownerId` | String | yes | 🔗 |  | Plan 093 Unit 2: owner-scope; nullable (Estate=NULL); maintained per Unit 4; composite FK -> owner(tenantId,id) in the migration (K11) |
| `id` | String | no | 🔑 | `cuid()` |  |
| `barrelAssetId` | String | no | 🔗 |  |  |
| `lotId` | String | no | 🔗 |  |  |
| `fillNumber` | Int | no |  |  |  |
| `volumeL` | Decimal `Decimal(10, 2)` | no |  |  | resident volume at fill open |
| `capacityL` | Decimal `Decimal(10, 2)` | no |  |  | barrel capacity snapshot |
| `purchaseCostSnapshot` | Decimal `Decimal(18, 8)` | no |  |  | barrel purchase cost at fill open (D17-stable) |
| `fillDepreciation` | Decimal `Decimal(18, 8)` | no |  |  | $ this fill amortizes = purchaseCost × slice |
| `startedAt` | DateTime | no |  |  |  |
| `endedAt` | DateTime | yes |  |  |  |
| `openOpId` | Int | no | 🔗 |  | the op that opened this fill |
| `closeOpId` | Int | yes |  |  | the op that closed it (materialized the CostLine) |
| `materializedCostLineId` | String | yes |  |  | the BARREL CostLine written at close (null while open) |
| `policyVersion` | Int | no |  | `1` |  |
| `createdAt` | DateTime | no |  | `now()` |  |

**References**

- `(tenantId, ownerId)` → `owner(tenantId, id)` · ON DELETE RESTRICT _(composite — invisible to Prisma)_
- `(tenantId, barrelAssetId)` → `barrel_asset(tenantId, id)` · ON DELETE CASCADE _(composite — invisible to Prisma)_
- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT
- `(tenantId, lotId)` → `lot(tenantId, id)` · ON DELETE RESTRICT _(composite — invisible to Prisma)_
- `(tenantId, openOpId)` → `lot_operation(tenantId, id)` · ON DELETE RESTRICT _(composite — invisible to Prisma)_

### `custom_unit`

Plan 075: user-defined measurement units, per tenant. A custom unit is structurally identical to a built-in (src/lib/units/measure.ts): a `dimension` (mass|volume|count) + a `perCanonical` factor — how many canonical base units (g / mL / count) one of this unit is worth. Weight/volume units MUST carry a real factor because portions get consumed via convert(); count units default to 1. Custom units live at the INTAKE/display boundary ONLY — stored stock stays canonical (g/mL/unit), so the cost core and coerceStockUnit are untouched. Tenant-scoped + RLS-forced (Phase 12). `normalizedName` is the lowercased de-dupe/lookup key. No cross-table FK (units aren't referenced by id — materials store the unit STRING).

_Prisma model: `CustomUnit`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` |  |
| `id` | String | no | 🔑 | `cuid()` |  |
| `name` | String | no |  |  | as the user typed it, e.g. "drum", "tote", "roll" |
| `normalizedName` | String | no |  |  | lowercased/trimmed lookup + de-dupe key |
| `dimension` | String | no |  |  | "mass" \| "volume" \| "count" (MeasureDimension) |
| `perCanonical` | Decimal | no |  |  | canonical base units per 1 of this unit (g / mL / count); always > 0 |
| `label` | String | yes |  |  | optional display label (defaults to name in the UI) |
| `createdBy` | String | yes |  |  | user id who created it (audit; nullable for backfill / non-UI paths) |
| `createdAt` | DateTime | no |  | `now()` |  |
| `updatedAt` | DateTime | no |  |  |  |

**References**

- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT

### `equipment_asset`

Plan 053 B10: a simple equipment registry (presses, filters, pumps…). Tenant-scoped + RLS-isolated. `kind`/`status` are validated strings (no enum). Referenced by work-order tasks as ADVISORY required equipment (WorkOrderTaskEquipment) — surfaced, never blocks (WORKORDER-2). Maintenance stays record-only.

_Prisma model: `EquipmentAsset`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` |  |
| `id` | String | no | 🔑 | `cuid()` |  |
| `name` | String | no |  |  |  |
| `kind` | String | no |  |  | press / filter / pump / tank-accessory / other (validated string) |
| `status` | String | no |  | `"available"` | available / in_use / maintenance / retired |
| `locationId` | String | yes |  |  | plain ref → location.id (K11/K12) |
| `notes` | String | yes |  |  |  |
| `isActive` | Boolean | no |  | `true` |  |
| `purchaseCostBase` | Decimal `Decimal(18, 8)` | yes |  |  | Plan 080 U3: acquisition cost + invoice provenance (all nullable — existing assets stay uncosted; a capitalized asset is a FIXED ASSET, never dosed: EQUIPMENT stays non-doseable, WORKORDER-7). `purchaseCostBase` is ALWAYS the tenant BASE currency (the roll-up basis, COST-4); the foreign quintet below mirrors SupplyLot exactly — immutable historical provenance (IAS 21), audit only, never revalued. |
| `currency` | String | yes |  | `"USD"` | the BASE currency stamp for purchaseCostBase |
| `foreignPurchaseCost` | Decimal `Decimal(18, 8)` | yes |  |  | the price in the invoice (foreign) currency |
| `foreignCurrency` | String | yes |  |  | e.g. "EUR" |
| `fxRate` | Decimal `Decimal(18, 8)` | yes |  |  | base per 1 foreign at purchase (base == foreign × fxRate) |
| `fxRateDate` | DateTime | yes |  |  | the ECB quote date the rate was for |
| `fxRateSource` | String | yes |  |  | e.g. "ECB via Frankfurter" \| "manual override" |
| `purchaseDate` | DateTime | yes |  |  |  |
| `vendorId` | String | yes | 🔗 |  | Plan 069/080: composite-tenant FK → vendor(tenantId,id) (raw SQL, K11) |
| `createdAt` | DateTime | no |  | `now()` |  |
| `updatedAt` | DateTime | no |  |  |  |

**References**

- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT
- `(tenantId, vendorId)` → `vendor(tenantId, id)` · ON DELETE RESTRICT _(composite — invisible to Prisma)_

### `material_movement`

Plan 080 U1: append-only per-location movement ledger for consumables (mirrors StockMovement for wine). Every RECEIVE / ADJUST / TRANSFER / CONSUME of a material at a location writes one row. `deltaQty` is SIGNED (negative for a draw / the out-leg of a transfer). A transfer pairs its two legs via `transferGroupId`. Tenant-scoped + RLS (Phase-12). Composite-tenant FKs (tenantId,materialId)/(tenantId,locationId)/(tenantId,supplyLotId) in raw SQL (K11 — council S3); `kind` is a validated string CHECK-constrained to the four values.

_Prisma model: `MaterialMovement`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` |  |
| `id` | String | no | 🔑 | `cuid()` |  |
| `createdAt` | DateTime | no |  | `now()` |  |
| `createdById` | String | yes |  |  |  |
| `createdByEmail` | String | no |  |  |  |
| `materialId` | String | no | 🔗 |  |  |
| `locationId` | String | no | 🔗 |  |  |
| `kind` | String | no |  |  | RECEIVE \| ADJUST \| TRANSFER \| CONSUME (CHECK-constrained in SQL) |
| `deltaQty` | Decimal `Decimal(18, 6)` | no |  |  | signed |
| `supplyLotId` | String | yes | 🔗 |  | the lot drawn/created, when applicable |
| `transferGroupId` | String | yes |  |  | pairs the two legs of a transfer |
| `reason` | String | yes |  |  |  |

**References**

- `(tenantId, locationId)` → `location(tenantId, id)` · ON DELETE RESTRICT _(composite — invisible to Prisma)_
- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT
- `(tenantId, materialId)` → `cellar_material(tenantId, id)` · ON DELETE RESTRICT _(composite — invisible to Prisma)_
- `(tenantId, supplyLotId)` → `supply_lot(tenantId, id)` · ON DELETE SET NULL _(composite — invisible to Prisma)_

### `stock_movement`

_Prisma model: `StockMovement`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` | Phase 12 tenant scope (nullable U2 -> backfill U3 -> NOT NULL U5); FK+RLS at DB level |
| `ownerId` | String | yes | 🔗 |  | Plan 093 Unit 2: owner-scope; nullable (Estate=NULL); maintained per Unit 4; composite FK -> owner(tenantId,id) in the migration (K11) |
| `id` | String | no | 🔑 | `cuid()` |  |
| `createdAt` | DateTime | no |  | `now()` |  |
| `createdById` | String | yes |  |  |  |
| `createdByEmail` | String | no |  |  |  |
| `itemKind` | ItemKind | no |  |  |  |
| `wineSkuId` | String | yes | 🔗 |  |  |
| `finishedGoodId` | String | yes | 🔗 |  |  |
| `locationId` | String | no | 🔗 |  |  |
| `kind` | MovementKind | no |  |  |  |
| `deltaUnits` | Int | no |  |  | bottles (wine) or each (goods); signed |
| `reason` | String | yes |  |  |  |
| `transferGroupId` | String | yes |  |  | pairs the out/in legs of a TRANSFER |
| `bottlingRunId` | String | yes | 🔗 |  |  |

**References**

- `(bottlingRunId)` → `bottling_run(id)` · ON DELETE SET NULL
- `(finishedGoodId)` → `finished_good(id)` · ON DELETE RESTRICT
- `(locationId)` → `location(id)` · ON DELETE RESTRICT
- `(tenantId, ownerId)` → `owner(tenantId, id)` · ON DELETE RESTRICT _(composite — invisible to Prisma)_
- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT
- `(wineSkuId)` → `wine_sku(id)` · ON DELETE RESTRICT

### `supply_consumption`

Physical + cost depletion of supply stock (D11). One consume op → many rows (multi-lot depletion under WA/FIFO). `methodUsed` is stamped at write so recompute is stable (D17). Reversal negates by identity and restores exact qty (Unit 11) via `reversalOfConsumptionId`.

_Prisma model: `SupplyConsumption`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` |  |
| `id` | String | no | 🔑 | `cuid()` |  |
| `operationId` | Int | no | 🔗 |  |  |
| `supplyLotId` | String | no | 🔗 |  |  |
| `qty` | Decimal `Decimal(18, 6)` | no |  |  |  |
| `unitCost` | Decimal `Decimal(18, 8)` | yes |  |  | snapshot of the supply lot's unit cost (NULL = unknown, D14) |
| `extendedCost` | Decimal `Decimal(18, 8)` | yes |  |  | qty × unitCost (NULL when unitCost unknown) |
| `methodUsed` | CostingMethod | no |  |  |  |
| `basisCompleteness` | CostBasisCompleteness | no |  | `KNOWN` |  |
| `policyVersion` | Int | no |  | `1` |  |
| `reversalOfConsumptionId` | String | yes |  |  | set on the negation row that reverses another consumption (Unit 11) |
| `createdAt` | DateTime | no |  | `now()` |  |

**References**

- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT
- `(tenantId, operationId)` → `lot_operation(tenantId, id)` · ON DELETE RESTRICT _(composite — invisible to Prisma)_
- `(tenantId, supplyLotId)` → `supply_lot(tenantId, id)` · ON DELETE RESTRICT _(composite — invisible to Prisma)_

### `supply_lot`

───────────────────────── Phase 8: supply stock + cost roll-up (D16 separated concerns) ───────────────────────── All six tables are tenant-scoped + RLS-isolated per the AGENTS.md Phase-12 checklist (tenantId @default("") + @@index([tenantId]) + FK→organization ON DELETE RESTRICT + RLS ENABLE+FORCE+ tenant_isolation, kept OUT of GLOBAL_MODELS). Cross-tenant-risk FKs to the ledger (operation/lot/ supplyLot/run/sku) are COMPOSITE (tenantId, refId)→(tenantId, id) at the DB level (K11) — added in the migration raw SQL; Prisma relations stay single-column referencing id, matching the repo's existing composite-FK convention. Money is Decimal(18,8) internally (D9); volumes stay Decimal(10,2). Migrations: 20260702000000_cost_enums (enum types), 20260702000100_cost_schema (these tables + extensions), 20260702000200_cost_rls (RLS). NONE deployed until the operator runs migrate deploy. A costed receipt of a stock-tracked supply (Unit 1). One row per purchase/opening balance; the current on-hand for a material is Σ qtyRemaining over its non-depleted lots. `unitCost` is per stockUnit; NULL cost = UNKNOWN (D14), never $0. WA/FIFO depletion draws these down (Unit 3).

_Prisma model: `SupplyLot`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` |  |
| `id` | String | no | 🔑 | `cuid()` |  |
| `materialId` | String | no | 🔗 |  |  |
| `qtyReceived` | Decimal `Decimal(18, 6)` | no |  |  |  |
| `qtyRemaining` | Decimal `Decimal(18, 6)` | no |  |  |  |
| `stockUnit` | String | no |  |  | snapshot of the unit these quantities are held in (g \| kg \| mL \| L \| unit …) |
| `unitCost` | Decimal `Decimal(18, 8)` | yes |  |  | per stockUnit; NULL = unknown cost (D14). Plan 073: ALWAYS in the tenant BASE currency — the roll-up basis; a foreign invoice is converted at receipt (never revalued). |
| `currency` | String | no |  | `"USD"` | Plan 073: the BASE currency (== tenant base); the foreign figures live below for audit only |
| `foreignUnitCost` | Decimal `Decimal(18, 8)` | yes |  |  | Plan 073: immutable foreign-invoice provenance (historical cost, IAS 21 — stored for audit/reversal, NEVER enters the roll-up). All null for a base-currency receipt. per stockUnit in the invoice (foreign) currency |
| `foreignCurrency` | String | yes |  |  | the invoice currency (e.g. "EUR") |
| `fxRate` | Decimal `Decimal(18, 8)` | yes |  |  | base per 1 foreign at receipt (unitCost == foreignUnitCost × fxRate) |
| `fxRateDate` | DateTime | yes |  |  | the ECB publication date the rate was for |
| `fxRateSource` | String | yes |  |  | e.g. "ECB via Frankfurter" or "manual override" |
| `receivedAt` | DateTime | no |  | `now()` |  |
| `lotCode` | String | yes |  |  | supplier lot / PO reference |
| `supplierNote` | String | yes |  |  |  |
| `expiresAt` | DateTime | yes |  |  | Plan 072: batch/lot expiry (attached from a COA by lot no.); nullable, RLS-neutral column add |
| `vendorId` | String | yes | 🔗 |  | Plan 069: per-purchase vendor — composite-tenant FK → vendor(tenantId,id) (raw SQL, K11) |
| `locationId` | String | no | 🔗 |  | Plan 080: physical location of this lot. CONTRACTED to NOT NULL in U13a (20260719180000_supplylot_location_not_null) once every writer — app paths AND the verify/seed scripts — stamped it and the backfill reached 0 nulls across all tenants. Composite-tenant FK (tenantId,locationId)→location(tenantId,id) in raw SQL (K11), NO Prisma relation (mirrors vendorId) so Location's back-relations stay untouched. |
| `splitFromLotId` | String | yes |  |  | Plan 080 U1: transfer lineage. When a transfer SPLITS a lot, the destination lot points back at the source lot here; provenance (LotDocument/expiry) is derived TRANSITIVELY through this edge (council S2 — never row-copy). |
| `policyVersion` | Int | no |  | `1` | costing-policy version at receipt (D17) |
| `createdAt` | DateTime | no |  | `now()` |  |
| `updatedAt` | DateTime | no |  |  |  |

**References**

- `(tenantId, locationId)` → `location(tenantId, id)` · ON DELETE RESTRICT _(composite — invisible to Prisma)_
- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT
- `(tenantId, materialId)` → `cellar_material(tenantId, id)` · ON DELETE RESTRICT _(composite — invisible to Prisma)_
- `(tenantId, vendorId)` → `vendor(tenantId, id)` · ON DELETE RESTRICT _(composite — invisible to Prisma)_

## Work orders

_The human process layer — tasks, attempts, templates, reservations._ — 11 tables.

### `calculation_log`

Append-only, tenant-scoped audit of every winemaking-calculator run (page + assistant). If a bad cellar addition happens, we can pull up exactly what was entered and what the engine returned — which almost always proves the calculator was right and the entry was user error, but makes it PROVABLE either way. `engineVersion` (CALC_ENGINE_VERSION) makes it forensic across formula fixes. Phase-12 checklist: tenantId NOT NULL from creation (new table, no backfill dance), FK → organization ON DELETE RESTRICT, RLS ENABLE+FORCE+tenant_isolation, app_rls grant. DB-ENFORCED APPEND-ONLY: the migration REVOKEs UPDATE + DELETE on this table from app_rls (INSERT + SELECT only) — a tamper-resistant audit, with no edit/delete code path either. PII-free by construction: inputs/outputs are numeric bench values + unit choices; the only identity is userId + userEmail.

_Prisma model: `CalculationLog`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` | Phase 12 tenant scope; FK+RLS at DB level |
| `id` | String | no | 🔑 | `cuid()` |  |
| `userId` | String | no |  |  | who ran it (FK-free by design — userEmail snapshot survives user delete/rename) |
| `userEmail` | String | no |  |  | snapshot at calc time (no join needed to render history; survives rename) |
| `calculatorId` | String | no |  |  | the registry descriptor id, e.g. "so2-kmbs" |
| `formulaId` | String | no |  |  | the formula used (currently mirrors calculatorId; room for sub-formula granularity) |
| `section` | String | no |  |  | the calculator's section label, e.g. "SO₂ Additions" |
| `inputs` | Json | no |  |  | the (normalized) input record |
| `output` | Json | no |  |  | the CalcResult values array |
| `unitsUsed` | Json | no |  |  | the unit selections in play (subset of inputs, kept explicit for querying) |
| `source` | CalculationSource | no |  |  |  |
| `engineVersion` | String | no |  |  | CALC_ENGINE_VERSION at calc time — proves code-bug vs user-error after a fix |
| `advisory` | Boolean | no |  | `false` |  |
| `danger` | Boolean | no |  | `false` |  |
| `createdAt` | DateTime | no |  | `now()` |  |

**References**

- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT

### `reservation`

A soft, advisory, expiring hold (WORKORDER-2). ACTIVE holds count against available-to-promise; hard capacity + SupplyLot decrements at commit remain the real guarantee. Exactly one target column is set per `kind`. A9: MATERIAL_QTY holds at materialId (on-hand level), never a specific SupplyLot. A10: validUntil is SEPARATE from the task/WO dueAt and defaults well past due — a past-due WO does NOT auto-expire its holds (harvest would double-book otherwise).

_Prisma model: `Reservation`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` |  |
| `id` | String | no | 🔑 | `cuid()` |  |
| `workOrderId` | String | no | 🔗 |  |  |
| `taskId` | String | yes | 🔗 |  |  |
| `kind` | ReservationKind | no |  |  |  |
| `status` | ReservationStatus | no |  | `ACTIVE` |  |
| `lotId` | String | yes | 🔗 |  | LOT_VOLUME target (composite-FK'd in raw SQL) |
| `vesselId` | String | yes | 🔗 |  | VESSEL_CAPACITY target |
| `materialId` | String | yes | 🔗 |  | MATERIAL_QTY target (A9) |
| `qty` | Decimal `Decimal(18, 6)` | no |  |  | liters (lot/vessel) or stock qty (material) |
| `unit` | String | yes |  |  | snapshot of the qty unit |
| `validUntil` | DateTime | no |  |  | A10: hold horizon, independent of dueAt |
| `releasedAt` | DateTime | yes |  |  |  |
| `createdAt` | DateTime | no |  | `now()` |  |
| `updatedAt` | DateTime | no |  |  |  |

**References**

- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT
- `(tenantId, lotId)` → `lot(tenantId, id)` · ON DELETE RESTRICT _(composite — invisible to Prisma)_
- `(tenantId, materialId)` → `cellar_material(tenantId, id)` · ON DELETE RESTRICT _(composite — invisible to Prisma)_
- `(tenantId, taskId)` → `work_order_task(tenantId, id)` · ON DELETE CASCADE _(composite — invisible to Prisma)_
- `(tenantId, vesselId)` → `vessel(tenantId, id)` · ON DELETE RESTRICT _(composite — invisible to Prisma)_
- `(tenantId, workOrderId)` → `work_order(tenantId, id)` · ON DELETE CASCADE _(composite — invisible to Prisma)_

### `work_order`

── Work Order tables (Phase-12 checklist verbatim; migrations 20260703010100_work_order_schema + _work_order_rls). tenantId + @@index, per-tenant uniques, @@unique([tenantId, id]) targets, and RLS. Cluster relations (WO↔task↔attempt↔template↔version↔reservation) are declared single-column here; their composite (tenantId, refId)→(tenantId, id) FKs live in the migration raw SQL (repo convention, K11). External refs (lotId/vesselId/materialId/operationId) are PLAIN SCALARS — no Prisma relation, so Lot/Vessel/CellarMaterial/LotOperation stay untouched; their composite FKs are also raw SQL. Do NOT add these models to GLOBAL_MODELS. Money/qty Decimal(18,6); volumes fit within it too. ── The work-order shell: issue → assign → schedule → execute → approve → finalize. Status is the single source of truth for approval state (A5 — no separate approvalStatus column); timestamps + *ById/*ByEmail carry provenance. `autoFinalize` = decision-2 config (admin approves; self-executed auto-finalizes).

_Prisma model: `WorkOrder`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` |  |
| `id` | String | no | 🔑 | `cuid()` |  |
| `number` | Int | no |  |  | per-tenant human WO number (assigned on issue) |
| `title` | String | no |  |  |  |
| `status` | WorkOrderStatus | no |  | `DRAFT` |  |
| `templateVersionId` | String | yes | 🔗 |  | the version snapped onto this instance at issue (immutable thereafter) |
| `instructions` | String | yes |  |  | order-level notes (Unit 9) |
| `assigneeId` | String | yes |  |  | Canonical query columns (A6) — the WO's default assignee + schedule; JSON stays a snapshot only. |
| `assigneeEmail` | String | yes |  |  |  |
| `dueAt` | DateTime | yes |  |  |  |
| `dueAtHasTime` | Boolean | no |  | `false` | Did the requester ask for a TIME OF DAY, or just a date? `dueAt` is an instant either way, so the stored value alone can't tell "the 23rd" from "the 23rd at midnight" — and midnight work is real during harvest, so it can't be inferred. Every legacy row was date-only, hence the `false` default. |
| `scheduledFor` | DateTime | yes |  |  |  |
| `priority` | String | yes |  |  | Plan 053 B8: ERP planning fields (data capture only; no auto-scheduling). priority is a validated string (LOW/NORMAL/HIGH/URGENT — no enum, Windows ALTER TYPE hazard); scheduledStart/End are a window. |
| `estimatedDurationMin` | Int | yes |  |  |  |
| `scheduledStart` | DateTime | yes |  |  |  |
| `scheduledEnd` | DateTime | yes |  |  |  |
| `locationId` | String | yes |  |  | plan 053 B9: where the work happens (plain ref → location.id, resolved at runtime; K11/K12) |
| `autoFinalize` | Boolean | no |  | `false` | auto-finalize self-executed work (decision 2) |
| `issuedAt` | DateTime | yes |  |  |  |
| `issuedById` | String | yes |  |  |  |
| `issuedByEmail` | String | yes |  |  |  |
| `startedAt` | DateTime | yes |  |  | D5 live claim ("in progress by …") |
| `startedById` | String | yes |  |  |  |
| `startedByEmail` | String | yes |  |  |  |
| `completedAt` | DateTime | yes |  |  |  |
| `approvedAt` | DateTime | yes |  |  |  |
| `approvedById` | String | yes |  |  |  |
| `approvedByEmail` | String | yes |  |  |  |
| `cancelledAt` | DateTime | yes |  |  |  |
| `createdAt` | DateTime | no |  | `now()` |  |
| `updatedAt` | DateTime | no |  |  |  |

**References**

- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT
- `(tenantId, templateVersionId)` → `work_order_template_version(tenantId, id)` · ON DELETE RESTRICT _(composite — invisible to Prisma)_

### `work_order_dependency`

Plan 053 A5: cross-order dependency ("finish WO-A before you start WO-B"). A directed edge: the dependent `workOrderId` is WARNED at task start and HARD-BLOCKED from completion until every `dependsOnWorkOrderId` (predecessor) is worker-complete (all its tasks worker-completed). Tenant-scoped + RLS-isolated (Phase 12). Both endpoints carry a composite cross-tenant FK to work_order(tenantId, id) in RAW SQL (K11 — no Prisma @relation), so an edge can never span tenants; ON DELETE CASCADE clears a deleted WO's edges. Cycle prevention is enforced in the same tx as the insert (SF6).

_Prisma model: `WorkOrderDependency`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` |  |
| `id` | String | no | 🔑 | `cuid()` |  |
| `workOrderId` | String | no | 🔗 |  | the dependent WO (blocked by the predecessor) |
| `dependsOnWorkOrderId` | String | no | 🔗 |  | the predecessor WO that must finish first |
| `createdAt` | DateTime | no |  | `now()` |  |
| `createdById` | String | yes |  |  |  |
| `createdByEmail` | String | yes |  |  |  |

**References**

- `(tenantId, dependsOnWorkOrderId)` → `work_order(tenantId, id)` · ON DELETE CASCADE _(composite — invisible to Prisma)_
- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT
- `(tenantId, workOrderId)` → `work_order(tenantId, id)` · ON DELETE CASCADE _(composite — invisible to Prisma)_

### `work_order_task`

One task in a work order. OPERATION tasks write a real immutable ledger op on completion (via an attempt); OBSERVATION tasks write to the measurement store and go straight to DONE. `plannedPayload` snapshots the planned inputs incl. the target RATE + basis (A3 — the amount is computed at open time from the vessel's then-current volume, never frozen at issue). Canonical columns (A6) mirror the JSON for querying + composite FKs. `currentAttemptId` is the attempt owning the task's live op (A4); it is a plain scalar (no FK) to avoid a cluster relation cycle — always set in the same tx as the attempt.

_Prisma model: `WorkOrderTask`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` |  |
| `id` | String | no | 🔑 | `cuid()` |  |
| `workOrderId` | String | no | 🔗 |  |  |
| `seq` | Int | no |  |  | display + execution order within the WO |
| `groupSeq` | Int | no |  | `0` | plan 053 A3: sequential-group index. Tasks share a group (run in parallel); a task may complete only once every task in a LOWER group is worker-completed. Positional → reject/reissue-safe, no task-dep edge table. |
| `kind` | WorkOrderTaskKind | no |  |  |  |
| `status` | WorkOrderTaskStatus | no |  | `PENDING` |  |
| `title` | String | no |  |  |  |
| `opType` | OperationType | yes |  |  | set for OPERATION tasks (RACK/ADDITION/TOPPING/…); null for OBSERVATION |
| `observationType` | String | yes |  |  | set for OBSERVATION tasks (e.g. "BRIX", "TASTING"); null for OPERATION |
| `activityType` | String | yes |  |  | A3: set for MAINTENANCE tasks (TEMP_SETPOINT/CLEAN/SANITIZE/STEAM/GAS); validated String mirror of VesselActivityKind |
| `instructions` | String | yes |  |  | task-level notes (Unit 9) |
| `sourceVesselId` | String | yes | 🔗 |  | Canonical query columns (A6) extracted from plannedPayload; composite-FK'd in raw SQL. |
| `destVesselId` | String | yes | 🔗 |  |  |
| `lotId` | String | yes | 🔗 |  |  |
| `materialId` | String | yes | 🔗 |  |  |
| `blockId` | String | yes | 🔗 |  | plan 039: vineyard-block target for a HARVEST_WEIGH_IN observation (composite-FK'd in raw SQL) |
| `assigneeId` | String | yes |  |  |  |
| `assigneeEmail` | String | yes |  |  |  |
| `dueAt` | DateTime | yes |  |  |  |
| `priority` | String | yes |  |  | Plan 053 B8: per-task planning fields (data capture only). priority is a validated string. |
| `estimatedDurationMin` | Int | yes |  |  |  |
| `scheduledStart` | DateTime | yes |  |  |  |
| `scheduledEnd` | DateTime | yes |  |  |  |
| `locationId` | String | yes |  |  | plan 053 B9: where this task happens (plain ref → location.id; K11/K12) |
| `vesselGroupId` | String | yes | 🔗 |  | ── Cellarhand v2 Phase 7 (RFC-001 / ADR 0014 / GROUP-3). ALL THREE NULLABLE — work_order_task holds 106 live rows, so a SET NOT NULL here fails on deploy after CI passes (plan 106 F2). `vesselGroupId` is the group this task's member list CAME FROM, and it is the prerequisite F3 exposed: without it a DRAFT has nothing to re-resolve from and issue has nothing to snapshot. Null means the members were always a literal list (a range like B101-B110, or a comma list) — that case needs no snapshot because the payload list IS the frozen list. Composite tenant FK (tenantId, vesselGroupId) -> vessel_group(tenantId, id), ON DELETE SET NULL (raw SQL, K11) — deleting a group must never delete work-order history. |
| `memberSnapshot` | Json | yes |  |  | The frozen list, written ONCE inside the same transaction as the DRAFT->ISSUED flip. Non-null `memberSnapshotAt` IS the "frozen" flag; a DB CHECK keeps the pair honest. Json rather than a join table per D1 — ADR 0014 explicitly decided this does not need to be queryable, and a member table drifts toward the parallel ledger GROUP-2 forbids. |
| `memberSnapshotAt` | DateTime | yes |  |  |  |
| `plannedPayload` | Json | no |  |  | snapshot of the planned inputs (target rate + basis, note, etc.) |
| `currentAttemptId` | String | yes |  |  | A4: the attempt currently owning this task's ledger op (plain scalar, no FK) |
| `completionNote` | String | yes |  |  |  |
| `deviationReason` | String | yes |  |  |  |
| `startedAt` | DateTime | yes |  |  | D5 claim |
| `startedById` | String | yes |  |  |  |
| `startedByEmail` | String | yes |  |  |  |
| `createdAt` | DateTime | no |  | `now()` |  |
| `updatedAt` | DateTime | no |  |  |  |

**References**

- `(tenantId, blockId)` → `vineyard_block(tenantId, id)` · ON DELETE RESTRICT _(composite — invisible to Prisma)_
- `(tenantId, destVesselId)` → `vessel(tenantId, id)` · ON DELETE RESTRICT _(composite — invisible to Prisma)_
- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT
- `(tenantId, lotId)` → `lot(tenantId, id)` · ON DELETE RESTRICT _(composite — invisible to Prisma)_
- `(tenantId, materialId)` → `cellar_material(tenantId, id)` · ON DELETE RESTRICT _(composite — invisible to Prisma)_
- `(tenantId, sourceVesselId)` → `vessel(tenantId, id)` · ON DELETE RESTRICT _(composite — invisible to Prisma)_
- `(tenantId, vesselGroupId)` → `vessel_group(tenantId, id)` · ON DELETE SET NULL _(composite — invisible to Prisma)_
- `(tenantId, workOrderId)` → `work_order(tenantId, id)` · ON DELETE CASCADE _(composite — invisible to Prisma)_

### `work_order_task_attempt`

A1 (P0): each execution of a task is an append-only ATTEMPT. The commandId (idempotency key on the IMMUTABLE event) lives here, not on the mutable task. An attempt links to the real ledger op it wrote; a rejected attempt records the reversal (correctionOperationId) and a resubmit is a NEW attempt.

_Prisma model: `WorkOrderTaskAttempt`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` |  |
| `id` | String | no | 🔑 | `cuid()` |  |
| `taskId` | String | no | 🔗 |  |  |
| `seq` | Int | no |  |  | attempt number within the task (1-based) |
| `commandId` | String | no | ∪ |  | idempotency on the immutable event |
| `status` | WorkOrderTaskAttemptStatus | no |  | `PENDING_APPROVAL` |  |
| `actualPayload` | Json | no |  |  | the worker's actuals merged over the planned payload |
| `operationId` | Int | yes | 🔗 |  | the immutable ledger op this attempt wrote (composite-FK'd in raw SQL) |
| `correctionOperationId` | Int | yes | 🔗 |  | the reversal op if this attempt was rejected (raw-SQL composite FK) |
| `completionNote` | String | yes |  |  |  |
| `deviationReason` | String | yes |  |  |  |
| `rejectedReason` | String | yes |  |  |  |
| `completedAt` | DateTime | no |  | `now()` |  |
| `completedById` | String | yes |  |  |  |
| `completedByEmail` | String | yes |  |  |  |
| `reviewedAt` | DateTime | yes |  |  |  |
| `reviewedById` | String | yes |  |  |  |
| `reviewedByEmail` | String | yes |  |  |  |
| `createdAt` | DateTime | no |  | `now()` |  |

**References**

- `(tenantId, correctionOperationId)` → `lot_operation(tenantId, id)` · ON DELETE RESTRICT _(composite — invisible to Prisma)_
- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT
- `(tenantId, operationId)` → `lot_operation(tenantId, id)` · ON DELETE RESTRICT _(composite — invisible to Prisma)_
- `(tenantId, taskId)` → `work_order_task(tenantId, id)` · ON DELETE CASCADE _(composite — invisible to Prisma)_

### `work_order_task_equipment`

Plan 053 B10: ADVISORY link from a work-order task to the equipment it needs. Append-only join; never blocks completion. Composite cross-tenant FKs (raw SQL) to work_order_task + equipment_asset (K11).

_Prisma model: `WorkOrderTaskEquipment`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` |  |
| `id` | String | no | 🔑 | `cuid()` |  |
| `taskId` | String | no | 🔗 |  |  |
| `equipmentId` | String | no | 🔗 |  |  |
| `createdAt` | DateTime | no |  | `now()` |  |

**References**

- `(tenantId, equipmentId)` → `equipment_asset(tenantId, id)` · ON DELETE CASCADE _(composite — invisible to Prisma)_
- `(tenantId, taskId)` → `work_order_task(tenantId, id)` · ON DELETE CASCADE _(composite — invisible to Prisma)_
- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT

### `work_order_task_type`

Plan 053 C11: a tenant-authored "Custom Log" task type. RECORD-ONLY by construction — there is NO kind/ opType column, so it can never be anything but a NOTE (assertUserTaskTypeSafe re-checks on every resolve). fieldsJson is a CustomLogFieldSpec[] (type/options/required/dimension/stage). `code` is the per-tenant key used in specs/taskBuilds. Tenant-scoped + RLS-isolated (Phase 12).

_Prisma model: `WorkOrderTaskType`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` |  |
| `id` | String | no | 🔑 | `cuid()` |  |
| `code` | String | no |  |  | per-tenant task-type key (e.g. "BARREL_WEIGH") |
| `label` | String | no |  |  |  |
| `fieldsJson` | Json | no |  |  | CustomLogFieldSpec[] |
| `archivedAt` | DateTime | yes |  |  |  |
| `createdAt` | DateTime | no |  | `now()` |  |
| `updatedAt` | DateTime | no |  |  |  |

**References**

- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT

### `work_order_task_type_overlay`

Plan 053 C12: a tenant's DISPLAY customization of a BUILT-IN task type (hide/relabel/reorder fields). Display + template-authoring only — never changes kind/opType and can only hide fields on a per-opType HIDEABLE allowlist (assertOverlaySafe), so a governed core never loses a field it needs. One per built-in.

_Prisma model: `WorkOrderTaskTypeOverlay`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` |  |
| `id` | String | no | 🔑 | `cuid()` |  |
| `baseTaskType` | String | no |  |  | a built-in TASK_VOCABULARY key (e.g. "RACK") |
| `hiddenFields` | String[] | no |  |  |  |
| `relabels` | Json | no |  | `"{}"` | Record<fieldKey, label> |
| `fieldOrder` | String[] | no |  |  |  |
| `archivedAt` | DateTime | yes |  |  |  |
| `createdAt` | DateTime | no |  | `now()` |  |
| `updatedAt` | DateTime | no |  |  |  |

**References**

- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT

### `work_order_template`

A reusable template. System defaults ship seeded (isSystem); a tenant clones-on-customize (clonedFromId lineage). Issuing snaps the CURRENT version onto the instance so later edits never rewrite history. Recurring config is stored; generation is Unit 15.

_Prisma model: `WorkOrderTemplate`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` |  |
| `id` | String | no | 🔑 | `cuid()` |  |
| `code` | String | no |  |  | per-tenant stable key |
| `name` | String | no |  |  |  |
| `description` | String | yes |  |  |  |
| `category` | String | yes |  |  |  |
| `isSystem` | Boolean | no |  | `false` |  |
| `clonedFromId` | String | yes |  |  | lineage of a clone-on-customize (plain scalar) |
| `recurringCadence` | String | yes |  |  | Unit 15 config: null \| "WEEKLY" \| "BIWEEKLY" \| "MONTHLY" (generation deferred) |
| `currentVersion` | Int | no |  | `1` |  |
| `archivedAt` | DateTime | yes |  |  |  |
| `createdAt` | DateTime | no |  | `now()` |  |
| `updatedAt` | DateTime | no |  |  |  |

**References**

- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT

### `work_order_template_version`

An immutable version snapshot of a template's typed-field spec (tasks + fields). Issuing a WO references exactly one version; editing a template creates a new version, never mutating an old one.

_Prisma model: `WorkOrderTemplateVersion`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` |  |
| `id` | String | no | 🔑 | `cuid()` |  |
| `templateId` | String | no | 🔗 |  |  |
| `version` | Int | no |  |  |  |
| `spec` | Json | no |  |  | the validated typed-field vocabulary snapshot (task list + fields) |
| `createdAt` | DateTime | no |  | `now()` |  |
| `createdById` | String | yes |  |  |  |
| `createdByEmail` | String | yes |  |  |  |

**References**

- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT
- `(tenantId, templateId)` → `work_order_template(tenantId, id)` · ON DELETE CASCADE _(composite — invisible to Prisma)_

## Bottling & finished goods

_Bottling runs, SKUs, and finished-goods inventory._ — 10 tables.

### `bottled_inventory`

_Prisma model: `BottledInventory`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` | Phase 12 tenant scope (nullable U2 -> backfill U3 -> NOT NULL U5); FK+RLS at DB level |
| `ownerId` | String | yes | 🔗 |  | Plan 093 Unit 2: owner-scope; nullable (Estate=NULL); maintained per Unit 4; composite FK -> owner(tenantId,id) in the migration (K11) |
| `id` | String | no | 🔑 | `cuid()` |  |
| `wineSkuId` | String | no | 🔗 |  |  |
| `locationId` | String | no | 🔗 |  |  |
| `totalBottles` | Int | no |  | `0` |  |
| `updatedAt` | DateTime | no |  |  |  |

**References**

- `(locationId)` → `location(id)` · ON DELETE RESTRICT
- `(tenantId, ownerId)` → `owner(tenantId, id)` · ON DELETE RESTRICT _(composite — invisible to Prisma)_
- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT
- `(wineSkuId)` → `wine_sku(id)` · ON DELETE RESTRICT

### `bottled_lot_state`

Phase 7 (K1/K2): the 1:1 continuable-bottle projection for a lot in BOTTLED_IN_PROCESS form. Holds a bottle COUNT and a VOLUME, both DETERMINISTIC FOLDS of the ledger's BOTTLE_STORAGE legs, materialized INSIDE the writeLotOperation chokepoint (never by cores after it — council CRITICAL #1). Deleted at functional zero (FINISH closes both to ~0), exactly like a VesselLot row. CHECK(bottleCount >= 0) and CHECK(volumeL >= 0) in migration.

_Prisma model: `BottledLotState`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` | Phase 12 tenant scope (nullable U2 -> backfill U3 -> NOT NULL U5); FK+RLS at DB level |
| `ownerId` | String | yes | 🔗 |  | Plan 093 Unit 2: owner-scope; nullable (Estate=NULL); maintained per Unit 4; composite FK -> owner(tenantId,id) in the migration (K11) |
| `lotId` | String | no | 🔑 🔗 |  |  |
| `bottleCount` | Int | no |  |  |  |
| `nominalFillMl` | Int | no |  | `750` |  |
| `volumeL` | Decimal `Decimal(10, 2)` | no |  |  |  |
| `method` | SparklingMethod | no |  |  | TRADITIONAL \| PETNAT (TANK never gets a state) |
| `stage` | BottleStage | no |  |  |  |
| `tirageAt` | DateTime | no |  |  | materialized + backdatable (months-on-lees + legacy seed) |
| `locationId` | String | yes | 🔗 |  | physical bin (nullable; no bin-CRUD in Phase 7 — K12) |
| `tirageSugarAddedGpl` | Decimal `Decimal(6, 2)` | yes |  |  | Descriptive attributes set by the cores (not folded from lines): liqueur de tirage sugar (Unit 5) → ABV-bump advisory |
| `disgorgedAt` | DateTime | yes |  |  | set on a disgorged (child) lot (Unit 7) |
| `disgorgementRunId` | String | yes |  |  | groups tranches peeled in one disgorgement run (K4/Unit 7) |
| `dosageStyle` | DosageStyle | yes |  |  | EU sweetness style after dosage (Unit 8) |
| `dosageGramsPerL` | Decimal `Decimal(6, 2)` | yes |  |  | actual dosage sugar g/L → carried to BottlingRun (Unit 8) |
| `updatedAt` | DateTime | no |  |  |  |

**References**

- `(locationId)` → `location(id)` · ON DELETE SET NULL
- `(lotId)` → `lot(id)` · ON DELETE CASCADE
- `(tenantId, ownerId)` → `owner(tenantId, id)` · ON DELETE RESTRICT _(composite — invisible to Prisma)_
- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT

### `bottling_cost_snapshot`

FROZEN, immutable COGS per bottling run + line (D15, D18). Bottling is a bill-of-materials: totalRunCost = liquid + dry goods (+ labor/oh later); costPerBottle = totalRunCost / ACTUAL good bottles. ALL Phase-15 export-seam columns ship here in 8a (D21) so Units 6/13/14 populate, never re-migrate: postingKey (idempotency), sourceSnapshotId / reversalOfSnapshotId (lineage), postedAt, externalSystemId. componentBreakdown is the {component: amount} decomposition frozen at file time.

_Prisma model: `BottlingCostSnapshot`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` |  |
| `id` | String | no | 🔑 | `cuid()` |  |
| `runId` | String | no | 🔗 |  |  |
| `skuId` | String | no | 🔗 |  |  |
| `taxClass` | String | yes |  |  | derived tax class snapshot (Phase 14 union as text) |
| `bottledAt` | DateTime | no |  |  |  |
| `goodBottles` | Int | no |  |  |  |
| `totalRunCost` | Decimal `Decimal(18, 8)` | no |  |  |  |
| `costPerBottle` | Decimal `Decimal(18, 2)` | no |  |  | rounded to cents at snapshot (D9) |
| `currency` | String | no |  | `"USD"` |  |
| `costBasisAsOfOperationId` | Int | yes |  |  | the max cost-affecting opId the basis reflects (D4 watermark) |
| `componentBreakdown` | Json | no |  |  | { MATERIAL: n, FRUIT: n, PACKAGING: n, … } frozen decomposition |
| `basisCompleteness` | CostBasisCompleteness | no |  | `KNOWN` |  |
| `policyVersion` | Int | no |  | `1` |  |
| `postingKey` | String | yes |  |  | Phase 15 export seam (D18) — all shipped in 8a, populated by 8b Unit 14. idempotency key for an accounting export event |
| `sourceSnapshotId` | String | yes |  |  | the snapshot this one was derived/re-stated from |
| `reversalOfSnapshotId` | String | yes |  |  | set on a snapshot that reverses another |
| `postedAt` | DateTime | yes |  |  |  |
| `externalSystemId` | String | yes |  |  | id assigned by the external accounting system on post |
| `createdAt` | DateTime | no |  | `now()` |  |

**References**

- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT
- `(tenantId, runId)` → `bottling_run(tenantId, id)` · ON DELETE RESTRICT _(composite — invisible to Prisma)_
- `(tenantId, skuId)` → `wine_sku(tenantId, id)` · ON DELETE RESTRICT _(composite — invisible to Prisma)_

### `bottling_run`

_Prisma model: `BottlingRun`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` | Phase 12 tenant scope (nullable U2 -> backfill U3 -> NOT NULL U5); FK+RLS at DB level |
| `ownerId` | String | yes | 🔗 |  | Plan 093 Unit 2: owner-scope; nullable (Estate=NULL); maintained per Unit 4; composite FK -> owner(tenantId,id) in the migration (K11) |
| `id` | String | no | 🔑 | `cuid()` |  |
| `date` | DateTime | no |  |  |  |
| `wineSkuId` | String | no | 🔗 |  |  |
| `bottlesProduced` | Int | no |  |  |  |
| `volumeConsumedL` | Decimal `Decimal(10, 2)` | no |  |  |  |
| `destinationLocationId` | String | no | 🔗 |  |  |
| `createdById` | String | yes |  |  | soft-deleted users; snapshot below survives |
| `createdByEmail` | String | no |  |  |  |
| `createdAt` | DateTime | no |  | `now()` |  |
| `disgorgedAt` | DateTime | yes |  |  | Phase 7: sparkling BATCH facts belong on the run, not the catalog SKU (council CRITICAL #5). One BottlingRun per finalize; multiple disgorgement tranches → multiple runs / SKU. |
| `dosageGramsPerL` | Decimal `Decimal(6, 2)` | yes |  |  |  |
| `bottledAbv` | Decimal `Decimal(5, 2)` | yes |  |  | Phase 14 (Fork 1A): the ABV stamped at bottling — required for still wine (validated at the action), resolved at FINISH for sparkling (base ABV + tirage bump). Nullable in the DB so historical runs backfill; the tax-ABV resolver reads it as the as-of-bottling authority. |

**References**

- `(destinationLocationId)` → `location(id)` · ON DELETE RESTRICT
- `(tenantId, ownerId)` → `owner(tenantId, id)` · ON DELETE RESTRICT _(composite — invisible to Prisma)_
- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT
- `(wineSkuId)` → `wine_sku(id)` · ON DELETE RESTRICT

### `bottling_source`

_Prisma model: `BottlingSource`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` | Phase 12 tenant scope (nullable U2 -> backfill U3 -> NOT NULL U5); FK+RLS at DB level |
| `ownerId` | String | yes | 🔗 |  | Plan 093 Unit 2: owner-scope; nullable (Estate=NULL); maintained per Unit 4; composite FK -> owner(tenantId,id) in the migration (K11) |
| `id` | String | no | 🔑 | `cuid()` |  |
| `bottlingRunId` | String | no | 🔗 |  |  |
| `vesselId` | String | yes | 🔗 |  | Phase 7 (K13, extended): origin columns are NULLABLE. A blended / multi-vintage sparkling (or blended still-wine) lot has NO single variety/vineyard/vessel origin — the honest provenance is `lotId` (required for lot-sourced runs) + the lineage DAG. Historically `applyBottling` wrote `?? ""`, which inserts an invalid FK and would blow up finalize against Restrict — a latent bug this fixes. `vesselId` is nullable too: a finalized bottle lot has no vessel. Still-wine bottling always sets all three, so no behavior change there. |
| `varietyId` | String | yes | 🔗 |  |  |
| `vineyardId` | String | yes | 🔗 |  |  |
| `vintage` | Int | yes |  |  |  |
| `volumeConsumedL` | Decimal `Decimal(10, 2)` | no |  |  |  |
| `lotId` | String | yes | 🔗 |  |  |

**References**

- `(bottlingRunId)` → `bottling_run(id)` · ON DELETE CASCADE
- `(tenantId, ownerId)` → `owner(tenantId, id)` · ON DELETE RESTRICT _(composite — invisible to Prisma)_
- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT
- `(tenantId, lotId)` → `lot(tenantId, id)` · ON DELETE SET NULL _(composite — invisible to Prisma)_
- `(varietyId)` → `variety(id)` · ON DELETE RESTRICT
- `(vesselId)` → `vessel(id)` · ON DELETE RESTRICT
- `(vineyardId)` → `vineyard(id)` · ON DELETE RESTRICT

### `finished_good`

_Prisma model: `FinishedGood`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` | Phase 12 tenant scope (nullable U2 -> backfill U3 -> NOT NULL U5); FK+RLS at DB level |
| `id` | String | no | 🔑 | `cuid()` |  |
| `name` | String | no |  |  |  |
| `categoryId` | String | no | 🔗 |  |  |
| `msrp` | Decimal `Decimal(18, 2)` | yes |  |  | Plan 080 U7: list PRICE (see the note on WineSku.msrp — price, never cost). |
| `isActive` | Boolean | no |  | `true` |  |
| `createdAt` | DateTime | no |  | `now()` |  |

**References**

- `(categoryId)` → `finished_good_category(id)` · ON DELETE RESTRICT
- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT

### `finished_good_category`

_Prisma model: `FinishedGoodCategory`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` | Phase 12 tenant scope (nullable U2 -> backfill U3 -> NOT NULL U5); FK+RLS at DB level |
| `id` | String | no | 🔑 | `cuid()` |  |
| `name` | String | no |  |  |  |
| `isActive` | Boolean | no |  | `true` |  |
| `createdAt` | DateTime | no |  | `now()` |  |

**References**

- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT

### `finished_good_inventory`

_Prisma model: `FinishedGoodInventory`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` | Phase 12 tenant scope (nullable U2 -> backfill U3 -> NOT NULL U5); FK+RLS at DB level |
| `id` | String | no | 🔑 | `cuid()` |  |
| `finishedGoodId` | String | no | 🔗 |  |  |
| `locationId` | String | no | 🔗 |  |  |
| `quantity` | Int | no |  | `0` |  |
| `updatedAt` | DateTime | no |  |  |  |

**References**

- `(finishedGoodId)` → `finished_good(id)` · ON DELETE RESTRICT
- `(locationId)` → `location(id)` · ON DELETE RESTRICT
- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT

### `finished_good_receipt`

───────────────────────── Finished goods (merch) ───────────────────────── Plan 080 U7 (council C4) — the PURCHASED-cost layer for finished goods. Append-only receipts; on-hand valuation is the WEIGHTED AVERAGE over them, never a mutable `unitCogs` column on the SKU (that would be a second source of truth with no history) and never last-cost (which whipsaws COGS). Scope is deliberately narrow: this covers 3rd-party / merchandise / externally-purchased wine only. INTERNALLY-BOTTLED wine keeps its specific-lot COGS from the frozen BottlingCostSnapshot and is NOT touched here (COST-3 — that snapshot is immutable). A library buy-back of your own wine IS a purchase and legitimately gets a receipt (council DQ1: lock only when the provenance is an internal bottling run). Exactly ONE of wineSkuId / finishedGoodId is set (CHECK-constrained). `unitCostBase` is ALWAYS the tenant base currency (COST-4); the foreign quintet mirrors SupplyLot as immutable audit provenance (IAS 21).

_Prisma model: `FinishedGoodReceipt`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` |  |
| `id` | String | no | 🔑 | `cuid()` |  |
| `wineSkuId` | String | yes | 🔗 |  | composite-tenant FK -> wine_sku(tenantId,id) (raw SQL, K11) |
| `finishedGoodId` | String | yes | 🔗 |  | composite-tenant FK -> finished_good(tenantId,id) (raw SQL, K11) |
| `qty` | Int | no |  |  | units received on this receipt (> 0, CHECK-constrained) |
| `unitCostBase` | Decimal `Decimal(18, 8)` | no |  |  | per unit, tenant BASE currency — the valuation basis |
| `currency` | String | no |  | `"USD"` | the BASE currency stamp |
| `foreignUnitCost` | Decimal `Decimal(18, 8)` | yes |  |  | Immutable foreign-invoice provenance (all null for a base-currency purchase) — audit only, never revalued. |
| `foreignCurrency` | String | yes |  |  |  |
| `fxRate` | Decimal `Decimal(18, 8)` | yes |  |  |  |
| `fxRateDate` | DateTime | yes |  |  |  |
| `fxRateSource` | String | yes |  |  |  |
| `locationId` | String | no | 🔗 |  | where the units landed — composite-tenant FK -> location(tenantId,id) |
| `receivedAt` | DateTime | no |  | `now()` |  |
| `vendorId` | String | yes | 🔗 |  | composite-tenant FK -> vendor(tenantId,id) |
| `sourceInvoiceLineId` | String | yes |  |  | provenance when this came from an invoice line (Wave 3 / U5) |
| `note` | String | yes |  |  |  |
| `createdById` | String | yes |  |  |  |
| `createdByEmail` | String | no |  |  |  |
| `createdAt` | DateTime | no |  | `now()` |  |

**References**

- `(tenantId, finishedGoodId)` → `finished_good(tenantId, id)` · ON DELETE RESTRICT _(composite — invisible to Prisma)_
- `(tenantId, locationId)` → `location(tenantId, id)` · ON DELETE RESTRICT _(composite — invisible to Prisma)_
- `(tenantId, wineSkuId)` → `wine_sku(tenantId, id)` · ON DELETE RESTRICT _(composite — invisible to Prisma)_
- `(tenantId, vendorId)` → `vendor(tenantId, id)` · ON DELETE RESTRICT _(composite — invisible to Prisma)_
- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT

### `wine_sku`

_Prisma model: `WineSku`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` | Phase 12 tenant scope (nullable U2 -> backfill U3 -> NOT NULL U5); FK+RLS at DB level |
| `ownerId` | String | yes | 🔗 |  | Plan 093 Unit 2: owner-scope; nullable (Estate=NULL); maintained per Unit 4; composite FK -> owner(tenantId,id) in the migration (K11) |
| `id` | String | no | 🔑 | `cuid()` |  |
| `name` | String | no |  |  |  |
| `vintage` | Int | yes |  |  | Phase 7 (K11): NULLABLE for NV / multi-vintage sparkling; isNonVintage marks a true NV SKU (no lying sentinel). Because Postgres treats NULLs as distinct, the old compound @@unique breaks for NV — replaced with TWO partial unique indexes added by hand in the Unit 2 migration: UNIQUE(name,vintage,bottleSizeMl) WHERE vintage IS NOT NULL, and UNIQUE(name,bottleSizeMl) WHERE isNonVintage. Finalize uses find-or-create, not upsert. |
| `isNonVintage` | Boolean | no |  | `false` |  |
| `bottleSizeMl` | Int | no |  | `750` |  |
| `method` | SparklingMethod | yes |  |  | Phase 7: sparkling metadata on the catalog SKU (batch facts like disgorgedAt / actual dosage g/L live on BottlingRun, not here — council CRITICAL #5). |
| `dosageStyle` | DosageStyle | yes |  |  |  |
| `msrp` | Decimal `Decimal(18, 2)` | yes |  |  | Plan 080 U7: list PRICE. Safe as a mutable SKU column — it is what you SELL for, not what it COST. COGS deliberately does NOT live here (council C4: a mutable cost column is a second source of truth with no history); purchased cost lives in FinishedGoodReceipt, bottled cost in BottlingCostSnapshot. |
| `isActive` | Boolean | no |  | `true` |  |
| `createdAt` | DateTime | no |  | `now()` |  |
| `categoryId` | String | yes | 🔗 |  |  |

**References**

- `(categoryId)` → `finished_good_category(id)` · ON DELETE SET NULL
- `(tenantId, ownerId)` → `owner(tenantId, id)` · ON DELETE RESTRICT _(composite — invisible to Prisma)_
- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT

## Cost & accounting

_Cost roll-up, variance, A/P export, FX, and the accounting connection._ — 15 tables.

### `account_mapping`

Phase 8b (Unit 14, D18) — the per-tenant (component, tax-class) → debit/credit account map. A null taxClass is the default row for that component; an exact tax-class match wins over it. This is the ONLY tenant-specific knob Phase 15 needs to turn cost export events into postable journal lines.

_Prisma model: `AccountMapping`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` |  |
| `id` | String | no | 🔑 | `cuid()` |  |
| `component` | CostComponent | no |  |  |  |
| `taxClass` | String | no |  | `"*"` | Phase 15 (council C7): the DEFAULT row uses the sentinel '*' (never NULL). Postgres treats NULLs as distinct, so a NULL default could not be uniquely enforced (two "defaults" per component). '*' matches the pure seam's accountKey(component, null) => `${component}\|*`, so resolveAccounts' fallback still finds it. An exact tax-class row (e.g. 'WINE_UNDER_16') wins. |
| `debitAccount` | String | no |  |  |  |
| `creditAccount` | String | no |  |  |  |
| `createdAt` | DateTime | no |  | `now()` |  |
| `updatedAt` | DateTime | no |  |  |  |

**References**

- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT

### `accounting_connection`

_Prisma model: `AccountingConnection`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` |  |
| `id` | String | no | 🔑 | `cuid()` |  |
| `provider` | AccountingProvider | no |  |  |  |
| `status` | ConnectionStatus | no |  | `DISCONNECTED` |  |
| `environment` | String | no |  |  | "sandbox" \| "production" — keys + realm are env-split |
| `externalRealmId` | String | yes |  |  | canonical company id derived from Intuit, NOT the callback param (SEC-C2) |
| `refreshTokenCt` | String | yes |  |  | AEAD ciphertext — present only when CONNECTED (SEC-S5 DB CHECK) |
| `dekWrapped` | String | yes |  |  | the wrapped per-record DEK (SEC-C4) — present only when CONNECTED |
| `refreshTokenExpiresAt` | DateTime | yes |  |  | Nov-2025 refresh-token absolute expiry |
| `scope` | String | yes |  |  |  |
| `tokenVersion` | Int | no |  | `0` | CAS guard for serialized refresh (SEC-N4) |
| `homeCurrency` | String | yes |  |  | QBO company home currency (multi-currency withhold — U6/U7) |
| `multiCurrencyEnabled` | Boolean | yes |  |  | Plan 073: Preferences.CurrencyPrefs.MultiCurrencyEnabled, read at connect (council #2). null = unknown/not-yet-read. A foreign Bill needs this true. |
| `companyName` | String | yes |  |  | display only ("Connected to <company>") — non-secret, from CompanyInfo |
| `connectedAt` | DateTime | yes |  |  | when the current CONNECTED link was established (display) |
| `createdAt` | DateTime | no |  | `now()` |  |
| `updatedAt` | DateTime | no |  |  |  |

**References**

- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT

### `accounting_delivery`

_Prisma model: `AccountingDelivery`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` |  |
| `id` | String | no | 🔑 | `cuid()` |  |
| `connectionId` | String | no | 🔗 |  | composite-tenant FK -> accounting_connection (raw SQL) |
| `costExportEventId` | String | yes | 🔗 |  | composite-tenant FK -> cost_export_event (exactly-one-of-three — CHECK in SQL) |
| `apExportEventId` | String | yes | 🔗 |  | composite-tenant FK -> ap_export_event |
| `salesExportEventId` | String | yes | 🔗 |  | Phase 16: composite-tenant FK -> sales_export_event (DTC revenue delta) |
| `status` | DeliveryStatus | no |  | `PENDING` |  |
| `objectType` | String | yes |  |  | "JournalEntry" \| "Bill" (A2 — ONE poster, typed by object) |
| `attemptCount` | Int | no |  | `0` |  |
| `requestId` | String | yes |  |  | deterministic QBO RequestId (idempotency) |
| `externalId` | String | yes |  |  | QBO object Id once posted |
| `postingDate` | DateTime | yes |  |  | GL posting date (current open period for reversals — U11) |
| `withheldReason` | String | yes |  |  |  |
| `lastError` | String | yes |  |  |  |
| `claimedAt` | DateTime | yes |  |  |  |
| `leaseExpiresAt` | DateTime | yes |  |  |  |
| `verifiedAt` | DateTime | yes |  |  |  |
| `createdAt` | DateTime | no |  | `now()` |  |
| `updatedAt` | DateTime | no |  |  |  |

**References**

- `(tenantId, apExportEventId)` → `ap_export_event(tenantId, id)` · ON DELETE RESTRICT _(composite — invisible to Prisma)_
- `(tenantId, connectionId)` → `accounting_connection(tenantId, id)` · ON DELETE RESTRICT _(composite — invisible to Prisma)_
- `(tenantId, costExportEventId)` → `cost_export_event(tenantId, id)` · ON DELETE RESTRICT _(composite — invisible to Prisma)_
- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT
- `(tenantId, salesExportEventId)` → `sales_export_event(tenantId, id)` · ON DELETE RESTRICT _(composite — invisible to Prisma)_

### `ap_export_event`

_Prisma model: `ApExportEvent`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` |  |
| `id` | String | no | 🔑 | `cuid()` |  |
| `postingKey` | String | no |  |  | `ap:${supplyLotId}` (:rev) — or Plan 076 `apinv:${ingestedInvoiceId}` for a whole-invoice aggregate bill — per-tenant idempotent |
| `supplyLotId` | String | yes |  |  | the receipt this AP event came from (traceability; no hard FK) |
| `ingestedInvoiceId` | String | yes |  |  | Plan 076: set on an AGGREGATE per-invoice event (one Bill per invoice); traceability, no hard FK (mirrors supplyLotId) |
| `billLinesJson` | Json | yes |  |  | Plan 076: the QBO Bill's multiple lines for an aggregate event — [{ debitAccount, amount, description }] in the document currency (null = single-line legacy per-lot bill) |
| `paymentStatus` | ApPaymentStatus | yes |  |  | Plan 076: OUTSTANDING (owed) \| PAID (a BillPayment recorded). null on legacy events. |
| `paidFromAccount` | String | yes |  |  | Plan 076: the QBO account the payment came from (bank or credit-card liability) — drives BillPayment |
| `paidAt` | DateTime | yes |  |  | Plan 076: when marked paid (app-side or read back from QBO) |
| `paymentExternalId` | String | yes |  |  | Plan 076: the QBO BillPayment Id once posted (idempotency + reversal guard) |
| `vendorInvoiceNumber` | String | yes |  |  | Plan 072: supplier invoice # — carried to the QBO Bill's PrivateNote memo (searchable; per-lot bills stay separate). NOT a grouping/idempotency key. RLS-neutral column add. |
| `vendorId` | String | yes | 🔗 |  | composite-tenant FK -> vendor (raw SQL) |
| `amount` | Decimal `Decimal(18, 8)` | no |  |  | Plan 073: the FOREIGN (document-currency) amount for a foreign bill — QBO derives the home GL = amount × exchangeRate (council #1, decoupled from SupplyLot base cost). Home-currency bills: amount == home amount, exchangeRate null. |
| `debitAccount` | String | yes |  |  | Inventory Asset (resolved at emit; null => withheld) |
| `creditAccount` | String | yes |  |  | Accounts Payable |
| `currency` | String | no |  | `"USD"` | the bill/document currency (EUR for a foreign bill) |
| `exchangeRate` | Decimal `Decimal(18, 8)` | yes |  |  | Plan 073: HOME per 1 FOREIGN (USD per 1 EUR) — the QBO Bill ExchangeRate. null when currency == home (council #5 direction). |
| `receivedAt` | DateTime | no |  |  |  |
| `dueDate` | DateTime | yes |  |  |  |
| `reversalOfApExportEventId` | String | yes |  |  |  |
| `basisCompleteness` | CostBasisCompleteness | no |  | `KNOWN` |  |
| `createdAt` | DateTime | no |  | `now()` |  |

**References**

- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT
- `(tenantId, vendorId)` → `vendor(tenantId, id)` · ON DELETE RESTRICT _(composite — invisible to Prisma)_

### `billable_wine_consumed`

Plan 093 Unit 6 (council C2): a cross-owner blend is ALLOWED (refusing it deadlocks the daily topping op). The receiving owner dominates the scalar result; the CONSUMED minority owner's fraction records a pending BILLABLE_WINE_CONSUMED entry so the commercial side is captured (the facility bills the client for topping wine, or a JV reconciles) — NEVER blocking the physical cellar work. One row per consumed (minority) lot per blend op. Append-only in spirit; a blend reversal voids the row (status VOID).

_Prisma model: `BillableWineConsumed`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` | Phase 12 tenant scope; FK+RLS at DB level (AGENTS.md 9-step) |
| `id` | String | no | 🔑 | `cuid()` |  |
| `operationId` | Int | no | 🔗 |  | the BLEND op that consumed the wine |
| `sourceLotId` | String | no | 🔗 |  | the consumed (minority-owner) lot |
| `consumedOwnerId` | String | yes | 🔗 |  | the minority owner whose wine was consumed (NULL = facility topping wine) |
| `receivingOwnerId` | String | yes | 🔗 |  | the dominant/receiving owner of the result (NULL = facility) |
| `volumeL` | Decimal `Decimal(12, 4)` | no |  |  |  |
| `status` | String | no |  | `"PENDING"` | PENDING \| INVOICED \| RECONCILED \| VOID |
| `createdAt` | DateTime | no |  | `now()` |  |
| `updatedAt` | DateTime | no |  |  |  |

**References**

- `(tenantId, consumedOwnerId)` → `owner(tenantId, id)` · ON DELETE RESTRICT _(composite — invisible to Prisma)_
- `(tenantId, sourceLotId)` → `lot(tenantId, id)` · ON DELETE RESTRICT _(composite — invisible to Prisma)_
- `(operationId)` → `lot_operation(id)` · ON DELETE RESTRICT
- `(tenantId, receivingOwnerId)` → `owner(tenantId, id)` · ON DELETE RESTRICT _(composite — invisible to Prisma)_
- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT

### `commerce7_connection`

Per-tenant Commerce7 link. NO token columns (the app Secret Key is env-global). status uses the shared ConnectionStatus incl. PENDING_CONFIRM (nonce-verified but awaiting admin confirm). The poll watermark (updatedAt, id) lives here so the reconciler advances only past a fully-drained page.

_Prisma model: `Commerce7Connection`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` |  |
| `id` | String | no | 🔑 | `cuid()` |  |
| `provider` | CommerceProvider | no |  | `COMMERCE7` |  |
| `status` | ConnectionStatus | no |  | `DISCONNECTED` |  |
| `environment` | String | no |  |  | "sandbox" \| "production" |
| `externalTenantId` | String | yes |  |  | the Commerce7 tenant slug (naming the winery in the `tenant:` header) |
| `scopes` | String[] | no |  |  |  |
| `installedByUserId` | String | yes |  |  |  |
| `webhookId` | String | yes |  |  | the registered Commerce7 webhook id (for delete/recreate — U8) |
| `webhookConfiguredAt` | DateTime | yes |  |  |  |
| `lastWebhookAt` | DateTime | yes |  |  | last inbound webhook hint (webhook-health chip; stale → recreate) |
| `lastPolledAt` | DateTime | yes |  |  |  |
| `pollCursorUpdatedAt` | DateTime | yes |  |  | (updatedAt, id) composite poll watermark with overlap |
| `pollCursorId` | String | yes |  |  |  |
| `driftSummary` | Json | yes |  |  | Phase 16 U6 — the inventory cron writes a read-only DRIFT SUMMARY here (ERP on-hand vs C7 available per mapped variant). Surfaced in the dashboard for human review; NEVER auto-corrects C7 inventory. |
| `driftCheckedAt` | DateTime | yes |  |  |  |
| `companyName` | String | yes |  |  | display only ("Connected to <winery>") — non-secret |
| `connectedAt` | DateTime | yes |  |  |  |
| `createdAt` | DateTime | no |  | `now()` |  |
| `updatedAt` | DateTime | no |  |  |  |

**References**

- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT

### `commerce7_install_state`

Short-lived, single-use install nonce (reuses the OAuthState shape). Bound to the initiating admin + workspace so an unauthenticated install callback cannot link a victim's Commerce7 tenant (P0 fix).

_Prisma model: `Commerce7InstallState`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` |  |
| `id` | String | no | 🔑 | `cuid()` |  |
| `nonceHash` | String | no |  |  | SHA-256 of the random nonce; the raw nonce is never stored |
| `userId` | String | no |  |  | the admin who initiated; re-checked at confirm time |
| `sessionId` | String | no |  |  |  |
| `expiresAt` | DateTime | no |  |  |  |
| `createdAt` | DateTime | no |  | `now()` |  |

**References**

- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT

### `commerce7_order`

The MUTABLE order projection (NO PII). Keyed by the stable Commerce7 order id. `normalizedSnapshot` is the last-known economic snapshot (sku+qty+cents+tax+discount, no PII) we diff against; `dirty` is the webhook hint. `lastSeenUpdatedAt` + id back the poll watermark. `withheldReason` records a still-un-emitted order (unmapped SKU/account) so the dashboard can surface it.

_Prisma model: `Commerce7Order`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` |  |
| `id` | String | no | 🔑 | `cuid()` |  |
| `commerce7OrderId` | String | no |  |  | stable Commerce7 order UUID |
| `commerce7OrderNumber` | String | yes |  |  |  |
| `commerce7CustomerId` | String | yes |  |  | opaque Commerce7 id ONLY — never a name/email (D19) |
| `channel` | String | yes |  |  | DTC / club / POS (kept allocation-ready) |
| `paymentStatus` | String | yes |  |  | Paid \| Authorized \| Cancelled \| … |
| `fulfillmentStatus` | String | yes |  |  |  |
| `normalizedSnapshot` | Json | yes |  |  | last-known PII-free economic snapshot (the diff base) |
| `lastDeltaSeq` | Int | no |  | `0` |  |
| `dirty` | Boolean | no |  | `false` |  |
| `withheldReason` | String | yes |  |  |  |
| `lastSeenUpdatedAt` | DateTime | yes |  |  |  |
| `occurredAt` | DateTime | yes |  |  |  |
| `createdAt` | DateTime | no |  | `now()` |  |
| `updatedAt` | DateTime | no |  |  |  |

**References**

- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT

### `commerce7_sku_map`

SKU mapping: a Commerce7 (variant, inventory-location) ↔ our (WineSku, Location). Match, never silently create (respect the NV partial-unique split). `lastPushedMovementAt`/`lastPushedMovementId` is the OUTBOUND (createdAt, id) watermark for additive inventory push (StockMovement has no numeric seq, so the watermark is the same composite cursor shape the poller uses). wineSkuId is a composite-tenant FK (SQL); locationId is a plain ref (resolved at runtime).

_Prisma model: `Commerce7SkuMap`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` |  |
| `id` | String | no | 🔑 | `cuid()` |  |
| `externalProductId` | String | no |  |  |  |
| `externalVariantId` | String | no |  |  |  |
| `externalSku` | String | no |  |  |  |
| `externalInventoryLocationId` | String | no |  |  |  |
| `wineSkuId` | String | yes | 🔗 |  | composite-tenant FK -> wine_sku (raw SQL) |
| `locationId` | String | yes |  |  | our finished-goods Location (plain ref) |
| `lastPushedMovementAt` | DateTime | yes |  |  | outbound watermark (createdAt of the last pushed movement) |
| `lastPushedMovementId` | String | yes |  |  | …with id as the tiebreak, so the push is idempotent |
| `active` | Boolean | no |  | `true` |  |
| `createdAt` | DateTime | no |  | `now()` |  |
| `updatedAt` | DateTime | no |  |  |  |

**References**

- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT
- `(tenantId, wineSkuId)` → `wine_sku(tenantId, id)` · ON DELETE SET NULL _(composite — invisible to Prisma)_

### `cost_export_event`

Phase 8b (Unit 14, D18) — an immutable, idempotent, reversible accounting export LINE. One per capitalized component of a COGS snapshot (or variance event). `postingKey` is unique per tenant so a re-emit is a no-op; `reversalOfExportEventId` links a negated reversal line back to its original. Phase 15 posts these as-is (debit/credit + amount); `postedAt` + `externalSystemId` are stamped when it does. Incomplete-basis sources are never emitted (D14). Reading these IS the per-SKU/per-run export view.

_Prisma model: `CostExportEvent`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` |  |
| `id` | String | no | 🔑 | `cuid()` |  |
| `postingKey` | String | no |  |  | per-line idempotency (source postingKey : component [: rev]) |
| `sourceType` | String | no |  |  | SNAPSHOT \| VARIANCE |
| `sourceSnapshotId` | String | yes |  |  |  |
| `sourceVarianceEventId` | String | yes |  |  |  |
| `reversalOfExportEventId` | String | yes |  |  |  |
| `runId` | String | yes |  |  |  |
| `skuId` | String | yes |  |  |  |
| `taxClass` | String | yes |  |  |  |
| `component` | CostComponent | no |  |  |  |
| `amount` | Decimal `Decimal(18, 8)` | no |  |  |  |
| `debitAccount` | String | yes |  |  | null = WITHHELD (component unmapped or basis not KNOWN) — never posted (U7) |
| `creditAccount` | String | yes |  |  |  |
| `currency` | String | no |  | `"USD"` |  |
| `basisCompleteness` | CostBasisCompleteness | no |  | `KNOWN` |  |
| `policyVersion` | Int | no |  | `1` |  |
| `postedAt` | DateTime | yes |  |  |  |
| `externalSystemId` | String | yes |  |  |  |
| `createdAt` | DateTime | no |  | `now()` |  |

**References**

- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT

### `cost_line`

Direct absorbed cost on an op, tagged by component (D2, D16). The append-only money artifact the roll-up sums. `lotId` is the lot the cost lands on (null for a run-level packaging line resolved via the op). `reversalOfCostLineId` links an identity-negation row (Unit 11). Never mutated.

_Prisma model: `CostLine`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` |  |
| `ownerId` | String | yes | 🔗 |  | Plan 093 Unit 2: owner-scope; nullable (Estate=NULL); maintained per Unit 4; composite FK -> owner(tenantId,id) in the migration (K11) |
| `id` | String | no | 🔑 | `cuid()` |  |
| `operationId` | Int | no | 🔗 |  |  |
| `lotId` | String | yes | 🔗 |  |  |
| `component` | CostComponent | no |  |  |  |
| `amount` | Decimal `Decimal(18, 8)` | no |  |  |  |
| `currency` | String | no |  | `"USD"` |  |
| `basisCompleteness` | CostBasisCompleteness | no |  | `KNOWN` |  |
| `policyVersion` | Int | no |  | `1` |  |
| `reversalOfCostLineId` | String | yes |  |  | set on the negation row that reverses another CostLine (Unit 11) |
| `note` | String | yes |  |  |  |
| `createdAt` | DateTime | no |  | `now()` |  |

**References**

- `(tenantId, ownerId)` → `owner(tenantId, id)` · ON DELETE RESTRICT _(composite — invisible to Prisma)_
- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT
- `(tenantId, lotId)` → `lot(tenantId, id)` · ON DELETE SET NULL _(composite — invisible to Prisma)_
- `(tenantId, operationId)` → `lot_operation(tenantId, id)` · ON DELETE RESTRICT _(composite — invisible to Prisma)_

### `cost_variance_event`

Phase 8b (Unit 13, D12/D17) — an explicit, auditable post-bottling cost variance. When a backdated correction changes a bottled lot's cost basis after its snapshot froze, the snapshot stays immutable and THIS row records the delta, split across sold (→ period COGS variance) and on-hand (→ inventory value) bottles. Append-only; one event per (snapshot, triggering op) — idempotent re-detection.

_Prisma model: `CostVarianceEvent`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` |  |
| `id` | String | no | 🔑 | `cuid()` |  |
| `snapshotId` | String | no | 🔗 |  | the frozen BottlingCostSnapshot this varies (never mutated) |
| `triggeringOpId` | Int | no |  |  | the correction op that changed the basis |
| `runId` | String | no |  |  |  |
| `skuId` | String | no |  |  |  |
| `oldCostPerBottle` | Decimal `Decimal(18, 2)` | no |  |  |  |
| `newCostPerBottle` | Decimal `Decimal(18, 2)` | no |  |  |  |
| `goodBottles` | Int | no |  |  |  |
| `onHandBottles` | Int | no |  |  |  |
| `soldBottles` | Int | no |  |  |  |
| `soldDelta` | Decimal `Decimal(18, 8)` | no |  |  | → period COGS variance (shipped bottles) |
| `unsoldDelta` | Decimal `Decimal(18, 8)` | no |  |  | → on-hand inventory-value adjustment |
| `totalDelta` | Decimal `Decimal(18, 8)` | no |  |  |  |
| `currency` | String | no |  | `"USD"` |  |
| `basisCompleteness` | CostBasisCompleteness | no |  | `KNOWN` |  |
| `policyVersion` | Int | no |  | `1` |  |
| `note` | String | yes |  |  |  |
| `createdAt` | DateTime | no |  | `now()` |  |

**References**

- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT
- `(tenantId, snapshotId)` → `bottling_cost_snapshot(tenantId, id)` · ON DELETE RESTRICT _(composite — invisible to Prisma)_

### `fx_rate`

Plan 073: GLOBAL FX-rate cache — NOT tenant-scoped. ECB reference rates are identical for every tenant, so this is a shared reference/lookup table (like a currency list): NO tenantId, NO RLS, NOT wrapped by the tenant extension. It is added to GLOBAL_MODELS (src/lib/tenant/models.ts + the mirror in scripts/verify-tenant-isolation.ts) so the extension passes it through untouched and the RLS coverage guard skips it (a deliberate non-auth global — the only one besides the Better-Auth core). One row per (base, quote, rateDate). `rate` is quote-per-1-base — HOME per 1 FOREIGN when fetched base=foreign, quote=home (the QBO ExchangeRate convention, council #5), so no inversion anywhere. Money precision Decimal(18,8) (D9). `rateDate` is the ECB publication day the feed actually used (may be a prior business day for a weekend/holiday) — @db.Date so a late-day PST ingest can't create a "tomorrow" row.

_Prisma model: `FxRate`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `id` | String | no | 🔑 | `cuid()` |  |
| `base` | String | no |  |  | the currency being priced (e.g. "EUR") |
| `quote` | String | no |  |  | the currency it is priced in (e.g. "USD") — rate is quote per 1 base |
| `rateDate` | DateTime `Date` | no |  |  | the CET effective date this rate is used for (cache key); the rate value is the latest ECB publication on/before it. The true ECB quote date is returned by the service + stored on SupplyLot.fxRateDate for audit. |
| `rate` | Decimal `Decimal(18, 8)` | no |  |  | quote per 1 base |
| `source` | String | no |  |  | provenance, e.g. "ECB via Frankfurter" |
| `fetchedAt` | DateTime | no |  | `now()` |  |

### `operation_cost_transfer`

Immutable lot→lot inherited-cost artifact for a blend/split (D10). Cost moved = parentTotalCost × transferredVolumeL / parentPreOpVolumeL — an UNAMBIGUOUS transferred-volume basis, NOT the lineage `fraction` (council C2). Conservation is asserted per op. Reversal via `reversalOfTransferId` (Unit 11).

_Prisma model: `OperationCostTransfer`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` |  |
| `id` | String | no | 🔑 | `cuid()` |  |
| `operationId` | Int | no | 🔗 |  |  |
| `fromLotId` | String | no | 🔗 |  |  |
| `toLotId` | String | no | 🔗 |  |  |
| `transferredVolumeL` | Decimal `Decimal(10, 2)` | no |  |  |  |
| `parentPreOpVolumeL` | Decimal `Decimal(10, 2)` | no |  |  |  |
| `transferredCost` | Decimal `Decimal(18, 8)` | no |  |  |  |
| `currency` | String | no |  | `"USD"` |  |
| `policyVersion` | Int | no |  | `1` |  |
| `reversalOfTransferId` | String | yes |  |  |  |
| `createdAt` | DateTime | no |  | `now()` |  |

**References**

- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT
- `(tenantId, fromLotId)` → `lot(tenantId, id)` · ON DELETE RESTRICT _(composite — invisible to Prisma)_
- `(tenantId, operationId)` → `lot_operation(tenantId, id)` · ON DELETE RESTRICT _(composite — invisible to Prisma)_
- `(tenantId, toLotId)` → `lot(tenantId, id)` · ON DELETE RESTRICT _(composite — invisible to Prisma)_

### `sales_export_event`

IMMUTABLE append-only revenue DELTA (NO PII), mirroring cost_export_event/ap_export_event. Each is the DIFFERENCE for one order edit; `postingKey = sale:${orderId}:v${deltaSeq}` is per-tenant unique so a replay is a no-op. Accounts are resolved + frozen at emit (null → withheld, never posted). `reversalOfSalesExportEventId` links a REFUND/REVERSAL back to what it reverses.

_Prisma model: `SalesExportEvent`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` |  |
| `id` | String | no | 🔑 | `cuid()` |  |
| `postingKey` | String | no |  |  | sale:${orderId}:v${deltaSeq} |
| `commerce7OrderId` | String | no |  |  |  |
| `deltaSeq` | Int | no |  |  |  |
| `kind` | SalesDeltaKind | no |  |  |  |
| `currency` | String | no |  | `"USD"` |  |
| `channel` | String | yes |  |  | carried from the order projection (allocation-ready margin) |
| `revenueDelta` | Decimal `Decimal(18, 8)` | no |  |  |  |
| `salesTaxDelta` | Decimal `Decimal(18, 8)` | no |  | `0` |  |
| `shippingDelta` | Decimal `Decimal(18, 8)` | no |  | `0` |  |
| `discountDelta` | Decimal `Decimal(18, 8)` | no |  | `0` |  |
| `lineDeltas` | Json | no |  |  | [{ skuRef, qtyDelta }] — no PII |
| `revenueAccount` | String | yes |  |  |  |
| `clearingAccount` | String | yes |  |  |  |
| `taxAccount` | String | yes |  |  |  |
| `shippingAccount` | String | yes |  |  |  |
| `discountAccount` | String | yes |  |  |  |
| `reversalOfSalesExportEventId` | String | yes |  |  |  |
| `accountingDate` | DateTime | no |  |  | the sale's winery-local business date (period matching) |
| `occurredAt` | DateTime | no |  |  |  |
| `createdAt` | DateTime | no |  | `now()` |  |

**References**

- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT

## Compliance & tax

_TTB reporting, bond isolation, tax class, and reminders._ — 6 tables.

### `bond`

───────────────────────── Phase 2: Bond + tax-class model (line-scoped, time-aware) ───────────────────────── Both tables are tenant-scoped + RLS-isolated per the AGENTS.md Phase-12 checklist (tenantId @default("") + @@index([tenantId]) + FK→organization ON DELETE RESTRICT + per-tenant uniques + RLS ENABLE+FORCE+tenant_isolation, kept OUT of GLOBAL_MODELS). Composite cross-tenant FKs (line→bond, report→bond, event→lot) are RAW SQL (tenantId, refId)→(tenantId, id) at the DB level (K11 / Phase-1 Surprise 1) — NO Prisma @relation (composite relations blow TS type-instantiation depth). Migrations: _bond_taxclass_enums (OperationType + status ADD VALUE), _bond_taxclass_schema (these tables + line/report columns + RLS), _bond_taxclass_backfill (primary bond + report.bondId). A TTB bond instrument. The winery's wine sits "in bond" under exactly one bond at a time; a cross-bond movement (TRANSFER_IN_BOND) posts symmetric removed/received-in-bond to both bonds' 5120.17 chains (BOND-1). Bonds are tenant-editable self-serve (ux-principle 9) — never a support ticket. The authoritative bond of a position is DERIVED from the ledger line, never a mutable Lot column; this table is the registry, not the per-lot source of truth.

_Prisma model: `Bond`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` | Phase 12 tenant scope; FK+RLS at DB level |
| `id` | String | no | 🔑 | `cuid()` |  |
| `registryNumber` | String | no |  |  | TTB bond registry number (per-tenant unique) |
| `penalSum` | Decimal `Decimal(12, 2)` | yes |  |  |  |
| `premises` | String | yes |  |  | bonded-premises address/description |
| `ownerId` | String | yes | 🔗 |  | Plan 093: the Owner this bond belongs to (an AP proprietor's own bond). Composite (tenantId, ownerId) → owner(tenantId, id), enforced raw-SQL (K11). NULL = the tenant's own/primary bond. |
| `isPrimary` | Boolean | no |  | `false` | the tenant's default bond (exactly one; created at backfill) |
| `createdAt` | DateTime | no |  | `now()` |  |
| `updatedAt` | DateTime | no |  |  |  |

**References**

- `(tenantId, ownerId)` → `owner(tenantId, id)` · ON DELETE RESTRICT _(composite — invisible to Prisma)_
- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT

### `change_of_tax_class_event`

A dated, append-only Change-Of-Tax-Class event (TAXCLASS-1). Tax class stays DERIVED (never a stored Lot column); this event is the point-in-time OVERRIDE the winemaker sets to intentionally declare/correct a class. It carries NO volume (so it is NOT a ledger op — a zero-volume line would violate LEDGER-2); instead `volumeAtEvent` snapshots the lot's on-hand volume as-of `observedAt` at write time, and the 5120.17 fold posts §A 10/24/25 from it. `resolveClassesForLots` reads the latest in-scope event before falling back to ABV derivation. Append-only: a correction is a new event.

_Prisma model: `ChangeOfTaxClassEvent`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` | Phase 12 tenant scope; FK+RLS at DB level |
| `id` | String | no | 🔑 | `cuid()` |  |
| `lotId` | String | no | 🔗 |  | composite (tenantId, lotId) → lot(tenantId, id) FK in raw SQL (M2) |
| `fromClass` | String | yes |  |  | WineTaxClass (TS union); null = previously derived/undeclared |
| `toClass` | String | no |  |  | WineTaxClass the lot is declared into as-of observedAt |
| `volumeAtEvent` | Decimal `Decimal(10, 2)` | yes |  |  | on-hand liters as-of observedAt, stamped at write |
| `observedAt` | DateTime | no |  |  | the dated point-in-time change (drives §A 10/24/25 in the period fold) |
| `actor` | String | yes |  |  | actor email snapshot |
| `reason` | String | yes |  |  |  |
| `commandId` | String | yes |  |  | idempotency (double-submit → no-op); NULLs distinct per Postgres |
| `createdAt` | DateTime | no |  | `now()` |  |

**References**

- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT
- `(tenantId, lotId)` → `lot(tenantId, id)` · ON DELETE RESTRICT _(composite — invisible to Prisma)_

### `compliance_profile`

Per-tenant compliance profile (like AppSettings): the filer identity that heads the form.

_Prisma model: `ComplianceProfile`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` | Phase 12 tenant scope; FK+RLS at DB level |
| `id` | String | no | 🔑 | `cuid()` |  |
| `ein` | String | yes |  |  |  |
| `registryNumber` | String | yes |  |  |  |
| `operatedByName` | String | yes |  |  |  |
| `operatedByAddress` | String | yes |  |  | Composed single-line address (kept in sync from the structured parts below) — the value printed on the Form 5120.17 header. The structured parts drive the settings/compliance UI. |
| `operatedByStreet1` | String | yes |  |  |  |
| `operatedByStreet2` | String | yes |  |  |  |
| `operatedByCity` | String | yes |  |  |  |
| `operatedByState` | String | yes |  |  |  |
| `operatedByZip` | String | yes |  |  |  |
| `operatedByPhone` | String | yes |  |  |  |
| `defaultCadence` | ReportCadence | no |  | `MONTHLY` |  |
| `defaultReturnCadence` | ReportCadence | no |  | `SEMIMONTHLY` | plan-026: the wine EXCISE-return cadence (27 CFR 24.271), separate from the ops defaultCadence. Defaults to SEMIMONTHLY (the fallback cadence when annual liability > $50k); the generate screen seeds from it. isEftPayer flips the September triple-split boundaries (council C1). |
| `isEftPayer` | Boolean | no |  | `false` |  |
| `updatedAt` | DateTime | no |  |  |  |

**References**

- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT

### `compliance_reminder_log`

Idempotent send log: at most one email per (tenant, form, period, mark, recipient). The daily cron inserts PENDING → sends → marks SENT; a stale PENDING is retried (council S2). recipientEmail is a durable snapshot so a later user deletion doesn't orphan the audit row (no FK on recipientUserId).

_Prisma model: `ComplianceReminderLog`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` |  |
| `id` | String | no | 🔑 | `cuid()` |  |
| `form` | String | no |  |  | "5120.17" \| "5000.24" |
| `periodKey` | String | no |  |  | deadlines.ts periodKey, e.g. "5120.17:2026-06-30" |
| `dueDate` | DateTime | no |  |  |  |
| `mark` | String | no |  |  | WEEK \| TWO_DAY \| DAY_OF |
| `recipientUserId` | String | no |  |  |  |
| `recipientEmail` | String | no |  |  |  |
| `status` | String | no |  | `"PENDING"` | PENDING \| SENT |
| `sentAt` | DateTime | yes |  |  |  |
| `createdAt` | DateTime | no |  | `now()` |  |
| `updatedAt` | DateTime | no |  |  |  |

**References**

- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT

### `compliance_reminder_preference`

───────────────────────── plan-027: compliance filing-deadline reminders ───────────────────────── Two tenant-scoped, RLS-isolated tables (Phase-12 checklist). Deadlines themselves are DERIVED (a pure function of cadence + filed-status), never stored; the only persisted state is the per-user opt-in + the idempotent send log. Per-user opt-in for reminder EMAILS, per tenant (admin-managed in User Management). userId is the global Better-Auth user id; the pref is tenant-scoped so the same person can opt in per winery.

_Prisma model: `ComplianceReminderPreference`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` |  |
| `id` | String | no | 🔑 | `cuid()` |  |
| `userId` | String | no | 🔗 |  |  |
| `remindersEnabled` | Boolean | no |  | `false` |  |
| `updatedAt` | DateTime | no |  |  |  |

**References**

- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT
- `(userId)` → `user(id)` · ON DELETE CASCADE

### `compliance_report`

───────────────────────── Phase 14: TTB 5120.17 compliance reporting ───────────────────────── Both tables are tenant-scoped + RLS-isolated per the AGENTS.md Phase-12 checklist: tenantId + index + FK→organization ON DELETE RESTRICT, per-tenant uniques, RLS ENABLE+FORCE+tenant_isolation (USING + WITH CHECK on current_setting('app.tenant_id', true)), app_rls DML grant, isolation test. A generated Report of Wine Premises Operations for one period + version. FILED rows are IMMUTABLE (eng-review E1): regeneration/amendment always writes a NEW row. `computed`/`overrides`/`onHandEnd` are snapshots; audit backing is re-derived on demand for DRAFTs and frozen into `computed` at FILE (E2). `onHandEnd` is the S3 carry-forward source for the next period's on-hand-beginning.

_Prisma model: `ComplianceReport`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` | Phase 12 tenant scope; FK+RLS at DB level |
| `id` | String | no | 🔑 | `cuid()` |  |
| `periodStart` | DateTime | no |  |  | inclusive |
| `periodEnd` | DateTime | no |  |  | inclusive |
| `cadence` | ReportCadence | no |  | `MONTHLY` |  |
| `formType` | ComplianceFormType | no |  | `TTB_5120_17` | plan-026 Fork 1A: which form this row is. Defaults to the 5120.17 so existing rows read as operations reports; the excise generator sets TTB_5000_24. formType scopes every report query. |
| `status` | ComplianceReportStatus | no |  | `DRAFT` |  |
| `version` | ComplianceReportVersion | no |  | `ORIGINAL` |  |
| `taxDollars` | Decimal `Decimal(12, 2)` | yes |  |  | plan-026: the net wine excise tax (amount to pay) for a TTB_5000_24 row; null for 5120.17. Display/query mirror of computed.summary.amountToPay — the worksheet Json remains authoritative. |
| `isFinalBusinessReport` | Boolean | no |  | `false` | S4: "Final" is a one-time business-closing flag, separate from status + version. |
| `amendsReportId` | String | yes | 🔗 |  | the ORIGINAL this row amends (version AMENDED) |
| `bondId` | String | yes | 🔗 |  | Phase 2 (BOND-1 / per-bond scoping): the bond this 5120.17 chain files for. NULL = legacy single-bond (pre-Phase-2 rows, backfilled to the tenant's primary bond). Carry-forward chains per (formType, bondId) so per-bond filing chains never cross. Composite (tenantId, bondId) → bond(tenantId, id) FK in raw SQL (M2). The 5000.24 excise return stays bond-agnostic (NULL). |
| `filerSnapshot` | Json | yes |  |  | Phase 2 (OQ-2, council Codex-DESIGN2): filer identity resolved bond-first (else the tenant ComplianceProfile) and SNAPSHOTTED at FILE, so an amended reprint never drifts if the Bond/ profile is later edited. NULL on DRAFT (resolved live); frozen at markReportFiled. |
| `onHandEnd` | Json | no |  |  | per section/column/sub gallons — the S3 carry-forward source |
| `computed` | Json | no |  |  | full §A/§B line snapshot (frozen at FILE; re-derived for DRAFT — E2) |
| `overrides` | Json | no |  |  | saved per-lot tax-class overrides applied at generation |
| `remarks` | String | no |  | `""` | Part X |
| `generatedAt` | DateTime | no |  | `now()` |  |
| `filedAt` | DateTime | yes |  |  |  |
| `filedByEmail` | String | yes |  |  |  |
| `createdAt` | DateTime | no |  | `now()` |  |
| `updatedAt` | DateTime | no |  |  |  |

**References**

- `(amendsReportId)` → `compliance_report(id)` · ON DELETE RESTRICT
- `(tenantId, bondId)` → `bond(tenantId, id)` · ON DELETE RESTRICT _(composite — invisible to Prisma)_
- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT

## Assistant & feedback

_The AI assistant's conversations, confirmations, and the feedback loop._ — 10 tables.

### `assistant_confirmation`

───────────────────────── Assistant (chat) ───────────────────────── Single-use guard for the assistant's confirm-before-write flow. A write tool returns a signed, short-TTL proposal token; on confirm we insert the token's nonce here (unique) BEFORE committing, so a replayed/double-submitted confirm can never double-apply a change (critical for inventory deltas).

_Prisma model: `AssistantConfirmation`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` | Phase 12 tenant scope (nullable U2 -> backfill U3 -> NOT NULL U5); FK+RLS at DB level |
| `id` | String | no | 🔑 | `cuid()` |  |
| `nonce` | String | no | ∪ |  |  |
| `tool` | String | no |  |  |  |
| `actorEmail` | String | no |  |  |  |
| `usedAt` | DateTime | no |  | `now()` |  |

**References**

- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT

### `assistant_conversation`

A persisted assistant chat. Scoped to the owning user (personal history, not vineyard data). `title` is auto-generated from the first user message. Messages cascade-delete with the conversation.

_Prisma model: `AssistantConversation`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` | Phase 12 tenant scope (nullable U2 -> backfill U3 -> NOT NULL U5); FK+RLS at DB level |
| `id` | String | no | 🔑 | `cuid()` |  |
| `ownerUserId` | String | no | 🔗 |  |  |
| `title` | String | no |  |  |  |
| `createdAt` | DateTime | no |  | `now()` |  |
| `updatedAt` | DateTime | no |  |  |  |

**References**

- `(ownerUserId)` → `user(id)` · ON DELETE CASCADE
- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT

### `assistant_feedback`

User feedback on assistant replies (thumbs up/down + optional "what was wrong"). `conversation` snapshots the transcript so the feedback-fix agent has context. `status` tracks the improvement loop: NEW -> TRIAGED (agent opened a PR) -> ...

_Prisma model: `AssistantFeedback`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` | Phase 12 tenant scope (nullable U2 -> backfill U3 -> NOT NULL U5); FK+RLS at DB level |
| `id` | String | no | 🔑 | `cuid()` |  |
| `createdAt` | DateTime | no |  | `now()` |  |
| `rating` | String | no |  |  | "up" \| "down" |
| `comment` | String | yes |  |  | free-text "what was wrong" (UNTRUSTED input) |
| `conversation` | Json | no |  |  | [{ role, content }] transcript for context |
| `conversationId` | String | yes |  |  |  |
| `ratedMessageId` | String | yes |  |  |  |
| `debugContext` | Json | yes |  |  |  |
| `actorUserId` | String | yes |  |  |  |
| `actorEmail` | String | no |  |  |  |
| `status` | String | no |  | `"NEW"` | NEW \| TRIAGED \| RESOLVED \| DISMISSED |
| `prUrl` | String | yes |  |  |  |
| `notes` | String | yes |  |  |  |
| `modeAtSubmission` | FeedbackAutomationMode | no |  | `AGENTIC_FIX` |  |
| `automationStatus` | FeedbackAutomationStatus | no |  | `NOT_REQUESTED` |  |
| `severity` | FeedbackSeverity | yes |  |  |  |
| `githubIssueUrl` | String | yes |  |  |  |
| `githubRunUrl` | String | yes |  |  |  |
| `planMarkdown` | String | yes |  |  |  |
| `planTitle` | String | yes |  |  |  |
| `planGeneratedAt` | DateTime | yes |  |  |  |
| `resolvedAt` | DateTime | yes |  |  |  |
| `resolvedByUserId` | String | yes |  |  |  |
| `developerNotes` | String | yes |  |  |  |
| `developerNotesVersion` | Int | no |  | `1` |  |
| `triageClass` | FeedbackTriageClass | yes |  |  | Plan 059: disposition assigned by the bug-triage goalie (null = untriaged) |
| `currentAutomationRunId` | String | yes |  |  | Plan 079: the run whose status this row mirrors (multiple runs can exist across clarification rounds) |

**References**

- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT

### `assistant_message`

One persisted text turn in a conversation. Only "user"/"assistant" text turns are stored (ephemeral write-proposal cards are not). `search_vector` is a Postgres generated tsvector column (added in the migration, not managed by Prisma) backing full-text search; it is intentionally absent from this model.

_Prisma model: `AssistantMessage`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` | Phase 12 tenant scope (nullable U2 -> backfill U3 -> NOT NULL U5); FK+RLS at DB level |
| `id` | String | no | 🔑 | `cuid()` |  |
| `conversationId` | String | no | 🔗 |  |  |
| `role` | String | no |  |  | "user" \| "assistant" |
| `content` | String `Text` | no |  |  |  |
| `metadata` | Json | yes |  |  |  |
| `createdAt` | DateTime | no |  | `now()` |  |

**References**

- `(conversationId)` → `assistant_conversation(id)` · ON DELETE CASCADE
- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT

### `assistant_tool_call`

Plan 107 Unit 1a — one APPEND-ONLY row per tool dispatch, written BEFORE the tool runs. Why this exists rather than mining `AssistantMessage.metadata.trace`: that trace is written only after the whole run completes, is capped at MAX_TOOL_CALLS=40 (trace.ts), and has no attempted-turn denominator — so a zero there can never mean "unused", and it cannot support retiring a tool. This table can, because the row lands before dispatch. ⛔ PII BOUNDARY, ENFORCED STRUCTURALLY: no column here may hold user free text. No arguments, no results, no utterance. `sanitizeTraceValue` redacts by key NAME only, so anything argument-shaped can carry a person's name — which is exactly why the trace is unsafe to aggregate directly. `test/assistant-tool-call-schema.test.ts` fails if a PII-capable column is ever added. `conversationId` is deliberately a PLAIN STRING, not an FK: an FK would let a logging write break a chat turn, and its cascade delete would silently rewrite usage history when a conversation is removed. Mirrors CalculationLog's FK-free userId/userEmail snapshot for the same reason.

_Prisma model: `AssistantToolCall`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` | Phase 12 tenant scope; FK + RLS at the DB level |
| `id` | String | no | 🔑 | `cuid()` |  |
| `conversationId` | String | yes |  |  | plain string by design — see above; null when a turn has no conversation |
| `userId` | String | no |  |  |  |
| `userEmail` | String | no |  |  | snapshot at call time; survives a rename/delete without a join |
| `toolName` | String | no |  |  | registry name, e.g. "query_cellar_contents" |
| `toolKind` | String | no |  |  | "read" \| "write" — snapshot, so a later kind change doesn't rewrite history |
| `modelTurn` | Int | no |  |  | which model round-trip inside the user's turn (0-based) |
| `createdAt` | DateTime | no |  | `now()` |  |

**References**

- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT

### `automation_run`

_Prisma model: `AutomationRun`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` |  |
| `id` | String | no | 🔑 | `cuid()` |  |
| `sourceType` | FeedbackAutomationSource | no |  |  |  |
| `sourceId` | String | no |  |  |  |
| `assistantFeedbackId` | String | yes | 🔗 |  |  |
| `ticketId` | String | yes | 🔗 |  |  |
| `kind` | FeedbackAutomationKind | no |  |  |  |
| `attempt` | Int | no |  | `1` |  |
| `status` | FeedbackAutomationStatus | no |  | `QUEUED` |  |
| `idempotencyKey` | String | no |  |  |  |
| `approvedByUserId` | String | yes |  |  |  |
| `approvedAt` | DateTime | yes |  |  |  |
| `claimedAt` | DateTime | yes |  |  |  |
| `completedAt` | DateTime | yes |  |  |  |
| `workflowRunId` | String | yes |  |  |  |
| `githubIssueNumber` | Int | yes |  |  |  |
| `githubPrNumber` | Int | yes |  |  |  |
| `githubUrl` | String | yes |  |  |  |
| `error` | String | yes |  |  |  |
| `createdAt` | DateTime | no |  | `now()` |  |
| `updatedAt` | DateTime | no |  |  |  |

**References**

- `(tenantId, assistantFeedbackId)` → `assistant_feedback(tenantId, id)` · ON DELETE CASCADE _(composite — invisible to Prisma)_
- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT
- `(tenantId, ticketId)` → `feedback_ticket(tenantId, id)` · ON DELETE CASCADE _(composite — invisible to Prisma)_

### `feedback_attachment`

_Prisma model: `FeedbackAttachment`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` |  |
| `id` | String | no | 🔑 | `cuid()` |  |
| `ticketId` | String | yes | 🔗 |  |  |
| `assistantFeedbackId` | String | yes | 🔗 |  |  |
| `filename` | String | no |  |  |  |
| `contentType` | String | no |  |  |  |
| `byteSize` | Int | no |  |  |  |
| `width` | Int | yes |  |  |  |
| `height` | Int | yes |  |  |  |
| `sha256` | String | no |  |  |  |
| `blobUrl` | String | no |  |  |  |
| `annotatedBlobUrl` | String | yes |  |  |  |
| `captureSource` | FeedbackAttachmentCaptureSource | no |  |  |  |
| `createdAt` | DateTime | no |  | `now()` |  |

**References**

- `(tenantId, assistantFeedbackId)` → `assistant_feedback(tenantId, id)` · ON DELETE CASCADE _(composite — invisible to Prisma)_
- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT
- `(tenantId, ticketId)` → `feedback_ticket(tenantId, id)` · ON DELETE CASCADE _(composite — invisible to Prisma)_

### `feedback_clarification`

Plan 079: one clarification round asked of a bug reporter when a report is too thin to act on. Polymorphic over both feedback source types (mirrors AutomationRun / FeedbackAttachment). The DB adds (raw SQL in the migration): a partial unique so at most ONE clarification is OPEN per source (council C-1), and a CHECK that exactly one of ticketId/assistantFeedbackId is set and matches sourceType.

_Prisma model: `FeedbackClarification`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` |  |
| `id` | String | no | 🔑 | `cuid()` |  |
| `sourceType` | FeedbackAutomationSource | no |  |  |  |
| `sourceId` | String | no |  |  |  |
| `ticketId` | String | yes | 🔗 |  |  |
| `assistantFeedbackId` | String | yes | 🔗 |  |  |
| `automationRunId` | String | yes |  |  | the run this clarification parked (workflow-retry idempotency via the unique below) |
| `round` | Int | no |  | `1` | clarification round, distinct from AutomationRun.attempt (council C-3.3) |
| `ref` | String | no |  |  | short human-facing token in the DM, e.g. "BUG-7Q2F" (council C-1 reply routing) |
| `reporterUserId` | String | no |  |  | who we asked (denormalized for listing + reply fallback) |
| `dmThreadId` | String | yes |  |  |  |
| `dmMessageId` | String | yes |  |  |  |
| `questions` | String | no |  |  | the questions we asked (may be UNTRUSTED once answered) |
| `askedByUserId` | String | no |  |  | the Cellarhand Support sender |
| `askedAt` | DateTime | no |  | `now()` |  |
| `status` | FeedbackClarificationStatus | no |  | `OPEN` |  |
| `answerBody` | String | yes |  |  | the reporter's reply (UNTRUSTED) |
| `answeredAt` | DateTime | yes |  |  |  |
| `answeredByUserId` | String | yes |  |  |  |
| `createdAt` | DateTime | no |  | `now()` |  |
| `updatedAt` | DateTime | no |  |  |  |

**References**

- `(tenantId, assistantFeedbackId)` → `assistant_feedback(tenantId, id)` · ON DELETE CASCADE _(composite — invisible to Prisma)_
- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT
- `(tenantId, ticketId)` → `feedback_ticket(tenantId, id)` · ON DELETE CASCADE _(composite — invisible to Prisma)_

### `feedback_linear_link`

_Prisma model: `FeedbackLinearLink`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` |  |
| `id` | String | no | 🔑 | `cuid()` |  |
| `ticketId` | String | yes | 🔗 |  |  |
| `assistantFeedbackId` | String | yes | 🔗 |  |  |
| `linearIssueKey` | String | no |  |  |  |
| `linearIssueUrl` | String | no |  |  |  |
| `linkedByUserId` | String | no |  |  |  |
| `linkedAt` | DateTime | no |  | `now()` |  |
| `version` | Int | no |  | `1` |  |
| `createdAt` | DateTime | no |  | `now()` |  |
| `updatedAt` | DateTime | no |  |  |  |

**References**

- `(tenantId, assistantFeedbackId)` → `assistant_feedback(tenantId, id)` · ON DELETE CASCADE _(composite — invisible to Prisma)_
- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT
- `(tenantId, ticketId)` → `feedback_ticket(tenantId, id)` · ON DELETE CASCADE _(composite — invisible to Prisma)_

### `feedback_ticket`

_Prisma model: `FeedbackTicket`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` |  |
| `id` | String | no | 🔑 | `cuid()` |  |
| `kind` | FeedbackTicketKind | no |  |  |  |
| `title` | String | no |  |  |  |
| `body` | String | no |  |  |  |
| `pageUrl` | String | yes |  |  |  |
| `userAgent` | String | yes |  |  |  |
| `debugContext` | Json | yes |  |  |  |
| `actorUserId` | String | yes |  |  |  |
| `actorEmail` | String | no |  |  |  |
| `modeAtSubmission` | FeedbackAutomationMode | no |  |  |  |
| `automationStatus` | FeedbackAutomationStatus | no |  | `NOT_REQUESTED` |  |
| `status` | FeedbackItemStatus | no |  | `NEW` |  |
| `severity` | FeedbackSeverity | yes |  |  |  |
| `githubIssueUrl` | String | yes |  |  |  |
| `githubRunUrl` | String | yes |  |  |  |
| `prUrl` | String | yes |  |  |  |
| `planMarkdown` | String | yes |  |  |  |
| `planTitle` | String | yes |  |  |  |
| `planGeneratedAt` | DateTime | yes |  |  |  |
| `resolvedAt` | DateTime | yes |  |  |  |
| `resolvedByUserId` | String | yes |  |  |  |
| `developerNotes` | String | yes |  |  |  |
| `developerNotesVersion` | Int | no |  | `1` |  |
| `triageClass` | FeedbackTriageClass | yes |  |  | Plan 059: disposition assigned by the bug-triage goalie (null = untriaged) |
| `currentAutomationRunId` | String | yes |  |  | Plan 079: the run whose status this row mirrors (multiple runs across clarification rounds) |
| `createdAt` | DateTime | no |  | `now()` |  |
| `updatedAt` | DateTime | no |  |  |  |

**References**

- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT

## Knowledge base

_The crawled corpus behind the assistant's domain answers._ — 9 tables.

### `candidate_source`

_Prisma model: `CandidateSource`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `id` | String | no | 🔑 | `cuid()` |  |
| `domain` | String | no | ∪ |  | discovered but not allowlisted — queued for human promotion |
| `discoveredFromUrl` | String | no |  |  |  |
| `firstSeenAt` | DateTime | no |  | `now()` |  |
| `lastSeenAt` | DateTime | no |  | `now()` |  |
| `timesSeen` | Int | no |  | `1` |  |
| `status` | String | no |  | `"pending"` | pending \| promoted \| rejected |

### `knowledge_blob`

_Prisma model: `KnowledgeBlob`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `id` | String | no | 🔑 | `cuid()` |  |
| `contentHash` | String | no | ∪ |  | sha256 of the fetched bytes |
| `contentType` | String | no |  |  |  |
| `byteSize` | Int | no |  |  |  |
| `blobUrl` | String | yes |  |  | private Vercel Blob snapshot for audit / re-extract |
| `firstSeenAt` | DateTime | no |  | `now()` |  |

### `knowledge_chunk`

_Prisma model: `KnowledgeChunk`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `id` | String | no | 🔑 |  | deterministic: sha256(documentId + revision + ordinal + text) |
| `documentId` | String | no | 🔗 |  |  |
| `revision` | Int | no |  |  |  |
| `ordinal` | Int | no |  |  |  |
| `sectionPath` | String | no |  |  | breadcrumb, e.g. "Winemaking > Brett > Sanitation" |
| `text` | String `Text` | no |  |  |  |
| `tokenCount` | Int | no |  |  |  |
| `embeddingModel` | String | yes |  |  | e.g. "voyage-4" |
| `embeddingDim` | Int | yes |  |  | 1024 (committed v1) |
| `embeddedAt` | DateTime | yes |  |  |  |
| `createdAt` | DateTime | no |  | `now()` |  |

**References**

- `(documentId)` → `knowledge_document(id)` · ON DELETE CASCADE

### `knowledge_document`

_Prisma model: `KnowledgeDocument`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `id` | String | no | 🔑 | `cuid()` |  |
| `sourceId` | String | no | 🔗 |  |  |
| `canonicalUrl` | String | no |  |  |  |
| `blobId` | String | yes | 🔗 |  |  |
| `canonicalTitle` | String | yes |  |  |  |
| `publisher` | String | no |  |  |  |
| `tier` | Int | no |  |  |  |
| `license` | String | no |  |  |  |
| `contentType` | String | no |  |  |  |
| `sitemapLastmod` | DateTime | yes |  |  |  |
| `publishedAt` | DateTime | yes |  |  |  |
| `etag` | String | yes |  |  |  |
| `lastModifiedHttp` | String | yes |  |  |  |
| `status` | String | no |  | `"active"` | active \| withdrawn (tombstoned, kept for audit) |
| `activeRevision` | Int | no |  | `0` | retrieval reads only chunks at this revision |
| `indexedContentHash` | String | yes |  |  | contentHash the active chunk-set was built from (idempotency: skip re-embed if unchanged) |
| `withdrawnAt` | DateTime | yes |  |  |  |
| `firstSeenAt` | DateTime | no |  | `now()` |  |
| `lastSeenAt` | DateTime | no |  | `now()` |  |
| `lastVerifiedAt` | DateTime | no |  | `now()` |  |
| `retrievedAt` | DateTime | no |  | `now()` |  |

**References**

- `(blobId)` → `knowledge_blob(id)` · ON DELETE SET NULL
- `(sourceId)` → `knowledge_source(id)` · ON DELETE RESTRICT

### `knowledge_source`

_Prisma model: `KnowledgeSource`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `id` | String | no | 🔑 | `cuid()` |  |
| `key` | String | no | ∪ |  | stable slug, e.g. "awri" |
| `publisher` | String | no |  |  | display name, e.g. "AWRI" |
| `homeDomain` | String | no | ∪ |  | e.g. "awri.com.au" |
| `tier` | Int | no |  |  | 1 = peer-reviewed / official extension, 2 = reputable trade, 3 = other |
| `license` | String | no |  |  | reuse/provenance note (we store paraphrasable text + a link back) |
| `seedRoots` | String[] | no |  |  | sitemap/section roots to crawl |
| `allowPrefixes` | String[] | no |  |  | path prefixes permitted |
| `denyPrefixes` | String[] | no |  |  | path prefixes refused (e.g. paywalled sections) |
| `crawlCadence` | String | no |  | `"weekly"` |  |
| `defaultEnabled` | Boolean | no |  | `true` | tenants get this unless a subscription row overrides |
| `active` | Boolean | no |  | `true` |  |
| `createdAt` | DateTime | no |  | `now()` |  |
| `updatedAt` | DateTime | no |  |  |  |

### `knowledge_source_subscription`

TENANT-scoped (full Phase-12 RLS): which GLOBAL sources are active in a winery's assistant. Absent row => fall back to KnowledgeSource.defaultEnabled. sourceId FK is a plain FK to the global knowledge_source.

_Prisma model: `KnowledgeSourceSubscription`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` | Phase 12 tenant scope; FK + RLS at the DB level |
| `id` | String | no | 🔑 | `cuid()` |  |
| `sourceId` | String | no | 🔗 |  |  |
| `enabled` | Boolean | no |  | `true` |  |
| `createdAt` | DateTime | no |  | `now()` |  |
| `updatedAt` | DateTime | no |  |  |  |

**References**

- `(sourceId)` → `knowledge_source(id)` · ON DELETE CASCADE
- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT

### `knowledge_url_observation`

_Prisma model: `KnowledgeUrlObservation`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `id` | String | no | 🔑 | `cuid()` |  |
| `documentId` | String | no | 🔗 |  |  |
| `url` | String | no | ∪ |  |  |
| `firstSeenAt` | DateTime | no |  | `now()` |  |
| `lastSeenAt` | DateTime | no |  | `now()` |  |

**References**

- `(documentId)` → `knowledge_document(id)` · ON DELETE CASCADE

### `oauth_state`

_Prisma model: `OAuthState`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` |  |
| `id` | String | no | 🔑 | `cuid()` |  |
| `nonceHash` | String | no |  |  | SHA-256 of the random state nonce — the raw nonce is never stored (SEC-C1) |
| `userId` | String | no |  |  | the admin who initiated; admin is re-checked at consume time (SEC-C1) |
| `sessionId` | String | no |  |  |  |
| `provider` | AccountingProvider | no |  |  |  |
| `redirectUri` | String | no |  |  |  |
| `pkceVerifier` | String | no |  |  | PKCE code_verifier (SEC-S1) |
| `expiresAt` | DateTime | no |  |  |  |
| `createdAt` | DateTime | no |  | `now()` |  |

**References**

- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT

### `trusted_domain`

_Prisma model: `TrustedDomain`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `id` | String | no | 🔑 | `cuid()` |  |
| `domain` | String | no | ∪ |  | crawler follows links only INTO these domains |
| `sourceKey` | String | yes |  |  | optional link to a KnowledgeSource.key |
| `note` | String | yes |  |  |  |
| `createdAt` | DateTime | no |  | `now()` |  |

## Inbox

_Per-user notifications and direct messages. NOTE: per-USER row security on top of per-tenant — a tenant-only read returns zero rows._ — 4 tables.

### `direct_message`

_Prisma model: `DirectMessage`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` |  |
| `id` | String | no | 🔑 | `cuid()` |  |
| `threadId` | String | no | 🔗 |  |  |
| `senderUserId` | String | no | 🔗 |  |  |
| `senderEmail` | String | no |  |  |  |
| `body` | String | no |  |  |  |
| `createdAt` | DateTime | no |  | `now()` |  |

**References**

- `(senderUserId)` → `user(id)` · ON DELETE CASCADE
- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT
- `(tenantId, threadId)` → `direct_message_thread(tenantId, id)` · ON DELETE CASCADE _(composite — invisible to Prisma)_

### `direct_message_attachment`

Mirrors FeedbackAttachment fields. blobUrl is SERVER-ONLY — never sent to the client; downloads go through the authed proxy route /api/inbox/attachments/[id] (council amendment 1).

_Prisma model: `DirectMessageAttachment`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` |  |
| `id` | String | no | 🔑 | `cuid()` |  |
| `messageId` | String | no | 🔗 |  |  |
| `filename` | String | no |  |  |  |
| `contentType` | String | no |  |  |  |
| `byteSize` | Int | no |  |  |  |
| `width` | Int | yes |  |  |  |
| `height` | Int | yes |  |  |  |
| `sha256` | String | no |  |  |  |
| `blobUrl` | String | no |  |  |  |
| `createdAt` | DateTime | no |  | `now()` |  |

**References**

- `(tenantId, messageId)` → `direct_message(tenantId, id)` · ON DELETE CASCADE _(composite — invisible to Prisma)_
- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT

### `direct_message_thread`

1:1 DM thread. Two participants stored directly (v1). Sorted-pair convention userAId < userBId (enforced by DB CHECK in the schema migration — amendment 9) makes resolveOrCreateThread idempotent.

_Prisma model: `DirectMessageThread`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` |  |
| `id` | String | no | 🔑 | `cuid()` |  |
| `subject` | String | yes |  |  |  |
| `createdByUserId` | String | no | 🔗 |  |  |
| `userAId` | String | no | 🔗 |  |  |
| `userAEmail` | String | no |  |  |  |
| `userBId` | String | no | 🔗 |  |  |
| `userBEmail` | String | no |  |  |  |
| `lastMessageAt` | DateTime | no |  |  |  |
| `createdAt` | DateTime | no |  | `now()` |  |

**References**

- `(createdByUserId)` → `user(id)` · ON DELETE CASCADE
- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT
- `(userAId)` → `user(id)` · ON DELETE CASCADE
- `(userBId)` → `user(id)` · ON DELETE CASCADE

### `inbox_notification`

One discrete, read/unread-tracked event per row. `readAt IS NULL AND archivedAt IS NULL` = unread (drives the avatar badge). `sourceId` is POLYMORPHIC (WO / ticket / DM thread) so it carries NO FK — the reader must tombstone a dangling / no-longer-accessible source (council amendment 6).

_Prisma model: `InboxNotification`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` |  |
| `id` | String | no | 🔑 | `cuid()` |  |
| `recipientUserId` | String | no | 🔗 |  |  |
| `recipientEmail` | String | no |  |  |  |
| `category` | InboxCategory | no |  |  |  |
| `kind` | InboxKind | no |  |  |  |
| `title` | String | no |  |  |  |
| `snippet` | String | no |  |  |  |
| `sourceType` | String | no |  |  |  |
| `sourceId` | String | no |  |  |  |
| `actorUserId` | String | yes | 🔗 |  |  |
| `actorEmail` | String | yes |  |  |  |
| `readAt` | DateTime | yes |  |  |  |
| `archivedAt` | DateTime | yes |  |  |  |
| `createdAt` | DateTime | no |  | `now()` |  |

**References**

- `(actorUserId)` → `user(id)` · ON DELETE SET NULL
- `(recipientUserId)` → `user(id)` · ON DELETE CASCADE
- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT

## Migration & audit

_Cutover import staging and the immutable audit log._ — 10 tables.

### `audit_log`

_Prisma model: `AuditLog`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` | Phase 12 tenant scope (nullable U2 -> backfill U3 -> NOT NULL U5); FK+RLS at DB level |
| `id` | String | no | 🔑 | `cuid()` |  |
| `createdAt` | DateTime | no |  | `now()` |  |
| `actorUserId` | String | yes |  |  |  |
| `actorEmail` | String | no |  |  |  |
| `action` | AuditAction | no |  |  |  |
| `entityType` | String | no |  |  |  |
| `entityId` | String | yes |  |  |  |
| `changes` | Json | yes |  |  |  |
| `summary` | String | no |  |  |  |
| `ipAddress` | String | yes |  |  |  |
| `userAgent` | String | yes |  |  |  |

**References**

- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT

### `legacy_operation`

_Prisma model: `LegacyOperation`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` |  |
| `id` | String | no | 🔑 | `cuid()` |  |
| `importBatchId` | String | no | 🔗 |  |  |
| `sourceSystem` | String | no |  |  |  |
| `sourceDataset` | String | yes |  |  |  |
| `sourceObjectType` | String | yes |  |  |  |
| `sourceActionId` | String | no |  |  |  |
| `sourceActionType` | String | no |  |  |  |
| `subjectType` | String | yes |  |  |  |
| `occurredAt` | DateTime | yes |  |  |  |
| `sourceLotKey` | String | yes |  |  |  |
| `lotId` | String | yes | 🔗 |  |  |
| `lotCode` | String | yes |  |  |  |
| `sourceVesselKey` | String | yes |  |  |  |
| `vesselId` | String | yes | 🔗 |  |  |
| `vesselCode` | String | yes |  |  |  |
| `volume` | Decimal `Decimal(18, 6)` | yes |  |  |  |
| `volumeUnit` | String | yes |  |  |  |
| `canonicalVolumeL` | Decimal `Decimal(10, 2)` | yes |  |  |  |
| `costAmount` | Decimal `Decimal(18, 8)` | yes |  |  |  |
| `costCurrency` | String | yes |  |  |  |
| `actorName` | String | yes |  |  |  |
| `note` | String | yes |  |  |  |
| `evidenceRef` | String | yes |  |  |  |
| `normalizedPayload` | Json | yes |  |  |  |
| `rawEvidence` | Json | yes |  |  |  |
| `publishedAt` | DateTime | yes |  |  |  |
| `createdAt` | DateTime | no |  | `now()` |  |
| `updatedAt` | DateTime | no |  |  |  |

**References**

- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT
- `(tenantId, importBatchId)` → `migration_import_batch(tenantId, id)` · ON DELETE CASCADE _(composite — invisible to Prisma)_
- `(tenantId, lotId)` → `lot(tenantId, id)` · ON DELETE RESTRICT _(composite — invisible to Prisma)_
- `(tenantId, vesselId)` → `vessel(tenantId, id)` · ON DELETE RESTRICT _(composite — invisible to Prisma)_

### `migration_analysis_panel`

_Prisma model: `MigrationAnalysisPanel`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` |  |
| `id` | String | no | 🔑 | `cuid()` |  |
| `importBatchId` | String | no | 🔗 |  |  |
| `sourcePanelKey` | String | no |  |  |  |
| `seedLotId` | String | no | 🔗 |  |  |
| `sourceVesselKey` | String | yes |  |  |  |
| `vesselId` | String | yes | 🔗 |  |  |
| `observedAt` | DateTime | no |  |  |  |
| `enteredByEmail` | String | yes |  |  |  |
| `note` | String | yes |  |  |  |
| `publishedPanelId` | String | yes | 🔗 |  |  |
| `createdAt` | DateTime | no |  | `now()` |  |
| `updatedAt` | DateTime | no |  |  |  |

**References**

- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT
- `(tenantId, importBatchId)` → `migration_import_batch(tenantId, id)` · ON DELETE CASCADE _(composite — invisible to Prisma)_
- `(tenantId, publishedPanelId)` → `analysis_panel(tenantId, id)` · ON DELETE RESTRICT _(composite — invisible to Prisma)_
- `(tenantId, seedLotId)` → `migration_seed_lot(tenantId, id)` · ON DELETE CASCADE _(composite — invisible to Prisma)_
- `(tenantId, vesselId)` → `vessel(tenantId, id)` · ON DELETE RESTRICT _(composite — invisible to Prisma)_

### `migration_analysis_reading`

_Prisma model: `MigrationAnalysisReading`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` |  |
| `id` | String | no | 🔑 | `cuid()` |  |
| `importBatchId` | String | no | 🔗 |  |  |
| `panelId` | String | no | 🔗 |  |  |
| `sourceReadingKey` | String | yes |  |  |  |
| `analyte` | String | no |  |  |  |
| `value` | Decimal `Decimal(12, 4)` | no |  |  |  |
| `unit` | String | no |  |  |  |
| `createdAt` | DateTime | no |  | `now()` |  |
| `updatedAt` | DateTime | no |  |  |  |

**References**

- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT
- `(tenantId, importBatchId)` → `migration_import_batch(tenantId, id)` · ON DELETE CASCADE _(composite — invisible to Prisma)_
- `(tenantId, panelId)` → `migration_analysis_panel(tenantId, id)` · ON DELETE CASCADE _(composite — invisible to Prisma)_

### `migration_entity_mapping`

_Prisma model: `MigrationEntityMapping`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` |  |
| `id` | String | no | 🔑 | `cuid()` |  |
| `sourceSystem` | String | no |  |  |  |
| `sourceDataset` | String | no |  |  |  |
| `formatVersion` | String | yes |  |  |  |
| `sourceObjectType` | String | no |  |  |  |
| `sourceKey` | String | no |  |  |  |
| `targetType` | String | no |  |  |  |
| `targetId` | String | yes |  |  |  |
| `targetCode` | String | yes |  |  |  |
| `resolution` | Json | yes |  |  |  |
| `confirmedById` | String | yes |  |  |  |
| `confirmedByEmail` | String | yes |  |  |  |
| `createdAt` | DateTime | no |  | `now()` |  |
| `updatedAt` | DateTime | no |  |  |  |

**References**

- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT

### `migration_field_mapping`

_Prisma model: `MigrationFieldMapping`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` |  |
| `id` | String | no | 🔑 | `cuid()` |  |
| `sourceSystem` | String | no |  |  |  |
| `sourceDataset` | String | no |  |  |  |
| `formatVersion` | String | yes |  |  |  |
| `sourceObjectType` | String | no |  |  |  |
| `sourceField` | String | no |  |  |  |
| `targetField` | String | no |  |  |  |
| `transform` | Json | yes |  |  |  |
| `confirmedById` | String | yes |  |  |  |
| `confirmedByEmail` | String | yes |  |  |  |
| `createdAt` | DateTime | no |  | `now()` |  |
| `updatedAt` | DateTime | no |  |  |  |

**References**

- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT

### `migration_import_batch`

_Prisma model: `MigrationImportBatch`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` |  |
| `id` | String | no | 🔑 | `cuid()` |  |
| `sourceSystem` | String | no |  |  |  |
| `sourceName` | String | yes |  |  |  |
| `formatVersion` | String | yes |  |  |  |
| `status` | String | no |  | `"DRAFT"` |  |
| `cutoverAt` | DateTime | no |  |  |  |
| `sourceManifest` | Json | no |  |  |  |
| `mappingSnapshot` | Json | yes |  |  |  |
| `reconciliationSnapshot` | Json | yes |  |  |  |
| `createdById` | String | yes |  |  |  |
| `createdByEmail` | String | yes |  |  |  |
| `signedOffById` | String | yes |  |  |  |
| `signedOffByEmail` | String | yes |  |  |  |
| `signedOffAt` | DateTime | yes |  |  |  |
| `publishedById` | String | yes |  |  |  |
| `publishedByEmail` | String | yes |  |  |  |
| `publishedAt` | DateTime | yes |  |  |  |
| `discardedAt` | DateTime | yes |  |  |  |
| `createdAt` | DateTime | no |  | `now()` |  |
| `updatedAt` | DateTime | no |  |  |  |

**References**

- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT

### `migration_reconciliation_item`

_Prisma model: `MigrationReconciliationItem`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` |  |
| `id` | String | no | 🔑 | `cuid()` |  |
| `importBatchId` | String | no | 🔗 |  |  |
| `kind` | String | no |  |  |  |
| `subjectType` | String | no |  |  |  |
| `subjectKey` | String | no |  |  |  |
| `label` | String | no |  |  |  |
| `expectedValue` | Decimal `Decimal(18, 6)` | yes |  |  |  |
| `actualValue` | Decimal `Decimal(18, 6)` | yes |  |  |  |
| `deltaValue` | Decimal `Decimal(18, 6)` | yes |  |  |  |
| `unit` | String | yes |  |  |  |
| `severity` | String | no |  |  |  |
| `status` | String | no |  | `"OPEN"` |  |
| `message` | String | no |  |  |  |
| `acceptedReason` | String | yes |  |  |  |
| `acceptedById` | String | yes |  |  |  |
| `acceptedByEmail` | String | yes |  |  |  |
| `acceptedAt` | DateTime | yes |  |  |  |
| `createdAt` | DateTime | no |  | `now()` |  |
| `updatedAt` | DateTime | no |  |  |  |

**References**

- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT
- `(tenantId, importBatchId)` → `migration_import_batch(tenantId, id)` · ON DELETE CASCADE _(composite — invisible to Prisma)_

### `migration_seed_lot`

_Prisma model: `MigrationSeedLot`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` |  |
| `id` | String | no | 🔑 | `cuid()` |  |
| `importBatchId` | String | no | 🔗 |  |  |
| `sourceLotKey` | String | no |  |  |  |
| `sourceSystemId` | String | yes |  |  |  |
| `code` | String | no |  |  |  |
| `displayName` | String | yes |  |  |  |
| `form` | String | no |  |  |  |
| `productType` | String | yes |  |  |  |
| `carbonation` | String | yes |  |  |  |
| `declaredTaxClass` | String | yes |  |  |  |
| `vintageYear` | Int | yes |  |  |  |
| `originVineyardName` | String | yes |  |  |  |
| `originBlockName` | String | yes |  |  |  |
| `originVarietyName` | String | yes |  |  |  |
| `legacySnapshot` | Json | yes |  |  |  |
| `status` | String | no |  | `"READY"` |  |
| `resolvedCode` | String | yes |  |  |  |
| `resolvedExistingLotId` | String | yes |  |  |  |
| `createdAt` | DateTime | no |  | `now()` |  |
| `updatedAt` | DateTime | no |  |  |  |

**References**

- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT
- `(tenantId, importBatchId)` → `migration_import_batch(tenantId, id)` · ON DELETE CASCADE _(composite — invisible to Prisma)_

### `migration_seed_position`

_Prisma model: `MigrationSeedPosition`._

| Column | Type | Null | Key | Default | Description |
| --- | --- | :-: | :-: | --- | --- |
| `tenantId` | String | no | 🔗 | `""` |  |
| `id` | String | no | 🔑 | `cuid()` |  |
| `importBatchId` | String | no | 🔗 |  |  |
| `seedLotId` | String | no | 🔗 |  |  |
| `sourcePositionKey` | String | no |  |  |  |
| `sourceVesselKey` | String | no |  |  |  |
| `vesselId` | String | yes | 🔗 |  |  |
| `vesselCode` | String | no |  |  |  |
| `accountType` | String | no |  | `"VESSEL"` |  |
| `volumeL` | Decimal `Decimal(10, 2)` | no |  |  |  |
| `bondId` | String | yes | 🔗 |  |  |
| `costAmount` | Decimal `Decimal(18, 8)` | yes |  |  |  |
| `costCurrency` | String | yes |  |  |  |
| `costCompleteness` | String | no |  | `"UNKNOWN"` |  |
| `publishedOperationId` | Int | yes | 🔗 |  |  |
| `createdAt` | DateTime | no |  | `now()` |  |
| `updatedAt` | DateTime | no |  |  |  |

**References**

- `(tenantId, bondId)` → `bond(tenantId, id)` · ON DELETE RESTRICT _(composite — invisible to Prisma)_
- `(tenantId)` → `organization(id)` · ON DELETE RESTRICT
- `(tenantId, importBatchId)` → `migration_import_batch(tenantId, id)` · ON DELETE CASCADE _(composite — invisible to Prisma)_
- `(tenantId, publishedOperationId)` → `lot_operation(tenantId, id)` · ON DELETE RESTRICT _(composite — invisible to Prisma)_
- `(tenantId, seedLotId)` → `migration_seed_lot(tenantId, id)` · ON DELETE CASCADE _(composite — invisible to Prisma)_
- `(tenantId, vesselId)` → `vessel(tenantId, id)` · ON DELETE RESTRICT _(composite — invisible to Prisma)_

