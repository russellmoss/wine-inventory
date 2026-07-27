---
title: Tenant-configurable unit display preferences (°C/°F, L/hL/gal, mm/in, ha/acres, m/ft, kg/lb)
type: feat
status: completed
date: 2026-07-26
branch: claude/cellarhand-unit-preferences-939c4f
depth: deep
units: 12
council: docs/plans/council-feedback-098-tenant-unit-preferences.md
---

> **Council-reviewed 2026-07-26** (Codex gpt-5.4 + Gemini 3.1 Pro; synthesis in
> [council-feedback-098](council-feedback-098-tenant-unit-preferences.md)). Material
> changes vs draft: (1) the per-vineyard backfill-to-NULL is REPLACED by a split
> migration + audited hoist-if-uniform (council C1); (2) reads carry override AND
> resolved values so "Auto" is representable (C2); (3) legacy lowercase unions are
> bridged, not renamed (C3); (4) hL added as a volume option; (5) U9 (inputs) promoted
> to MUST with inline unit adornment + dirty-check conversion; (6) WO execution view
> shows the total-to-add in the tenant's weight unit (rates stay mg/L); (7) stale
> °F-TTS task removed (speech.ts:77 already handles it); (8) per-unit verification
> gates added. User decisions 2026-07-26: volume = L|hL|gal three-way; dosing =
> total-to-add only; U9 = MUST; weather-card toggle stays coarse 3-state.

## Overview

Wineries in Europe, AU/NZ, South Africa, the US, and Canada all run Cellarhand, and each
expects to see its own units: an Oregon winery wants "73 °F" and "1,250 gal", a Marlborough
winery wants "23 °C" and "4,700 L". Today unit choice is fragmented (two per-vineyard
columns with incompatible casings, one ephemeral page toggle, and ~60 hardcoded " L"
call sites) and the assistant ignores it entirely. This plan adds a winery-level unit
preference on `AppSettings`, one canonical display-conversion module, and threads the
preference through every display surface including the assistant runtime — exactly the
way `timeZone` was done in #473.

## Problem Frame

The user's own transcript shows the failure: they asked the assistant for a forecast on
an Oregon vineyard and got "a high around 23" — Celsius, for a US site. The web weather
card meanwhile honors a per-vineyard `unitSystem` that the assistant tool loads and then
silently drops (`src/lib/assistant/tools/query-climate.ts:92`). Vineyard geometry has its
own, differently-cased preference. Tank volumes have no preference at all and render
litres unconditionally, which makes the cellar screens effectively unusable for a US
winery. If we do nothing, every non-metric tenant reads half the app in the wrong units
and the assistant sounds foreign on its own data.

The premise is right; the one reframing worth naming: this is **not** a unit-*storage*
problem. Canonical storage is already metric everywhere (°C, mm, L, kg, metres —
confirmed at `src/lib/weather/providers/types.ts:31`, `prisma/schema.prisma:1361`,
`src/lib/vineyard/units.ts:1-15`, `src/lib/harvest/units.ts:1-3`) and one deliberate
exception (GDD normals curves are °F-native, `src/lib/weather/normals-core.ts:93`). The
entire feature is a display-edge + preference-resolution problem. Nothing stored changes.

## Requirements

- MUST: A winery admin can set display units in `/settings`: a one-click preset
  ("Metric (SI)" / "US customary") plus per-dimension choices — temperature (°C/°F),
  rainfall (mm/in), tank & lot volume (**L / hL / US gal** — hL is the EU/SA/AU bulk
  convention, council + user decision), area (ha/acres), length & spacing (m/ft),
  fruit weight (kg·t / lb·short tons). Wind speed and shoot length follow the
  master system.
- MUST: Weather/climate pages (GDD headline, Winkler, GST, frost/heat thresholds,
  rainfall, forecast strip, hourly + rainfall charts, GDD chart) render in the resolved
  preference; the per-vineyard toggle still works as an explicit override.
- MUST: Vineyard section (block area, row/vine spacing, elevation) renders in the
  resolved preference.
- MUST: Cellar read surfaces (vessels, bulk, lots, blend, bottling, dashboard) render
  volumes in the resolved preference.
- MUST: The assistant reports quantities in the tenant's units, in text and voice,
  without doing arithmetic in its head (tools emit display-ready values; the model's
  prompt already forbids mental conversion, `src/lib/assistant/prompt.ts:52`).
- MUST: Canonical storage stays metric. No stored value, ledger row, or audit record
  changes meaning.
- MUST-NOT (explicit exclusions): dosing/enological concentration RATES (mg/L, g/hL,
  g/L) stay metric; TTB compliance stays US gallons by law
  (`src/lib/compliance/gallons.ts`); spray PUR-filed quantities stay as-entered;
  vendor package units in inventory stay as-received (plan 075's custom-unit world is
  untouched); persisted audit/timeline prose stays canonical litres.
- MUST (promoted from SHOULD — council + user decision): Key cellar *inputs* (vessel
  capacity, transfer/rack volumes) accept the preferred unit and convert to canonical
  litres on save (the `toCanonicalSpacing`/`fromCanonicalSpacing` round-trip pattern,
  `src/app(app)/reference/VineyardSetup.tsx:83-84`), with the unit shown as an
  **inline non-editable adornment inside the input box** (not just a hint line) and
  **dirty-check-only conversion** (an untouched field never re-saves a re-converted
  value).
- MUST (new — council Gemini C3, user decision): the work-order **execution view**
  additionally shows the computed **total amount to physically add** in the tenant's
  weight unit (e.g. "add 1.98 lb") beside the canonical rate. Rates themselves stay
  mg/L / g/hL; no lbs-per-1000-gal rate conversion.
- SHOULD: Weather alert/notification prose honors the preference
  (today hardcoded °C — `src/lib/weather/alert-core.ts:47,262`).
- SHOULD: Known unit bugs fixed in passing: `NoteDetail.tsx:90` hardcoded "METRIC",
  `NoteDetail.tsx:183,187` hardcoded °C, `SatelliteMap.tsx:231` hardcoded ft scale
  bar. (~~speech.ts °F TTS~~ — stale claim, `speech.ts:77` already handles °F;
  verified during council review.)
- NICE: Per-user override (a `VoicePreference`-shaped table exists as precedent,
  `prisma/schema.prisma:2026-2044`). Deferred — see Key Decisions.

## Scope Boundaries

**In scope:**
- `AppSettings` columns + migration; per-vineyard columns relaxed to nullable overrides
- One canonical display module `src/lib/units/display.ts` + resolution chain
- Settings card UI, `UnitsProvider` client context
- Display rewiring: weather, vineyard geometry, cellar volumes, harvest weights,
  ferment temp charts
- Assistant threading (route → runAssistant opts → system prompt → ToolContext → tools)
- Volume inputs on the main vessel/transfer forms

**Out of scope (and why):**
- Dosing, TTB, spray-legal, vendor-package units, audit prose — correctness/legal
  no-touch zones listed above.
- Per-user unit override — the winery is a shared physical operation; two cellar hands
  reading the same tank in different units is a communication hazard. Tenant-level
  matches the `timeZone` philosophy ("winery wins", #473). Revisit if a real tenant asks.
- Localized *number* formatting (decimal commas) — separate concern; all formatters
  keep `en-US` grouping for now.
- UK imperial gallons — no UK tenants; `winemaking-calc` keeps its GAL_UK for the
  calculator only.
- Rewriting the °F-native GDD normals pipeline (`normals-core.ts` `cumF`) — display
  conversion at the edge is enough; the pipeline is internally consistent.

## Research Summary

### Codebase Patterns

**The `timeZone` precedent (#473) — copied verbatim by this plan:**
- Column: nullable, no default, one-line ALTER
  (`prisma/migrations/20260723040000_app_settings_time_zone/migration.sql`). NULL means
  "not configured → today's behavior". `app_settings` already has tenantId + FORCE RLS;
  new columns are covered automatically, no RLS work.
- Read: `getWineryTimeZone()` in `src/lib/settings/data.ts:68` (server-only,
  re-validates on read).
- Write: `setWineryTimeZone` in `src/lib/settings/actions.ts:74-99` — `adminAction` +
  `runInTenantTx` + `upsert by tenantId` + `writeAudit` + `revalidatePath("/settings")`
  + `revalidatePath("/", "layout")`.
- UI: `WineryTimeZoneCard.tsx` mounted at `SettingsClient.tsx:350` under the "Winery"
  eyebrow; server page batches reads in one `Promise.all` (`settings/page.tsx:18-31`).
- App-wide client context: `WineryTimeZoneProvider` / `CurrencyProvider` pair pushed
  once from `src/app/(app)/layout.tsx:33,50`.
- Assistant: resolved in `src/app/api/assistant/route.ts:120-134` (comment: "Resolved
  HERE rather than inside runAssistant so the loop stays free of DB reads"), passed as
  a `runAssistant` opt (`run.ts:56-59,109`), injected into the system prompt
  (`prompt.ts:8-13`), threaded into every tool via `ToolContext`
  (`registry.ts:15-29`, `run.ts:179`).
- Layered resolution precedent: `resolveSiteTimeZone` — "config → winery AppSettings →
  viewer → UTC" (`src/lib/weather/site-time-core.ts:16-22`).

**Existing unit machinery (what we generalize, not rebuild):**
- `src/lib/weather/units-core.ts` — declared single conversion authority for weather:
  `UnitSystem = "METRIC"|"IMPERIAL"`, `cToF/fToC/mmToInches/kphToMph/gddCToF/gddFToC`,
  `formatTemp/formatPrecip/formatSpeed/formatGdd`. Header forbids inline ×1.8 anywhere
  else. Tested in `test/weather-units.test.ts`.
- `src/lib/vineyard/units.ts` — geometry math + formatters, but a *lowercase* union
  `"imperial"|"metric"`. `src/lib/harvest/units.ts` — kg/lb/t/short-ton with rollup.
  `src/lib/phenology/units.ts:1-8` — documented deviation (cm/in) waiting to be folded
  into a shared home.
- Gaps: **no volume (L→gal) display formatter exists anywhere**; no length/distance
  (m→ft, km→mi) formatter in the weather module.

**The three fragmented preference scopes to reconcile:**
1. `VineyardWeatherConfig.unitSystem` (`prisma/schema.prisma:955`, NOT NULL default
   METRIC, geo-seeded by `defaultUnitSystemFor(lat,lon)` at ingest,
   `src/lib/weather/us-coverage.ts:32`), user-writable via the WeatherCard toggle
   (`src/lib/weather/actions.ts:414-425`).
2. `VineyardDetail.defaultUnit` (`prisma/schema.prisma:560`, NOT NULL default
   "imperial", lowercase), read by vineyard modal/setup and the assistant's entity
   editor (`src/lib/assistant/entities.ts:199,390`).
3. Ephemeral `useState<Unit>("metric")` harvest toggles
   (`HarvestDashboard.tsx:268`, `HarvestManagerView.tsx:87`).

**Display-surface inventory (full file:line detail in the research transcript):**
- Weather: `WeatherCard.tsx` (incl. hand-branched secondary GDD at :215 and base-unit
  label at :210), `GddChart.tsx` (takes NO unit prop, hardwired °F-left/°C-right),
  `ForecastStrip.tsx`, `ForecastDayModal.tsx`, `HourlyChart.tsx`, `RainfallChart.tsx`,
  `RainfallSection.tsx`; metric leaks at `WeatherCard.tsx:328-329` (station km /
  elevation m) and `alert-core.ts:47,49,262-263` (°C notification prose).
- Vineyard: `VineyardModal.tsx` (local `elevationText()` duplicate),
  `BlockDetails.tsx:33-55`, `VineyardSetup.tsx` (canonical round-trip pattern),
  `SatelliteMap.tsx:231` (hardcoded ft scale bar), `SoilUnitPanel.tsx:12-13` (own
  inline area formatter, "ac" label), `MapLegend.tsx`.
- Cellar volumes: ~60 call sites across 25+ files hardcode " L"
  (`VesselsClient.tsx:95-148`, `BulkClient.tsx`, `LotsClient.tsx`,
  `LotDetailClient.tsx`, `BlendBuilderClient.tsx`, bottling, en-tirage, work-order
  task forms, `CostPanel.tsx` $/L, dashboard `page.tsx:48`). Only pseudo-formatter is
  `timeline.ts:158` `formatL` (bare number).
- Temps elsewhere: `FermentMonitor.tsx:342,438`, `FermentChart.tsx:169,197` hardcode
  °C display; the analyte registry already accepts °F at *entry* and normalizes to °C
  at write (`src/lib/chemistry/analytes.ts:66-75`) — entry is fine, display isn't.
- Assistant: `query-climate.ts` emits raw metric with unit-suffixed keys and drops the
  loaded `unitSystem` (:92); `speech.ts:76` TTS handles only °C.

### Prior Learnings

- rstack learnings: none (0 entries). Context-ledger: no relevant precedents.
- Auto-memory: "new `*-core.ts` fails `verify:ai-native` until wired to an assistant
  tool" → the new module is deliberately named `src/lib/units/display.ts`, NOT
  `display-core.ts`, because it is a pure formatter library, not a domain core.
- Windows enum rule (AGENTS.md): no new Postgres enums needed — all new columns are
  plain nullable TEXT, so the isolated-ALTER-TYPE dance doesn't apply.
- Live-tenant rule: additive nullable columns only; the two existing per-vineyard
  columns are *relaxed* (NOT NULL → NULL), never tightened — no backfill-then-enforce
  cycle required.
- Assistant DoD rule: unit preference setting is desk-with-coffee admin config → GUI
  satisfies coverage; no new write tool required. `query_climate`'s golden evals
  (`test/evals/assistant-read-tools.golden.ts:169-217`) must be extended instead.

### External Research

Not needed — no new frameworks or APIs. Incumbent note: both Vintrace and InnoVint
carry a winery-level unit preference (metric/US), so tenant-level is the coalesced
shape per `docs/architecture/data_model_coalescence.md` §parties/settings.

## Key Decisions

| Decision | Choice | Alternatives Considered | Rationale |
|----------|--------|------------------------|-----------|
| Preference scope | Per-tenant on `AppSettings` | Per-user (VoicePreference-shaped table); per-vineyard only | A winery is one physical operation; mixed units between coworkers on the same tank is a hazard. Matches timeZone "winery wins" (#473). Per-vineyard stays as an *override* for weather (a tenant can farm in two countries). |
| Preference shape | Master `unitSystem` + per-dimension nullable overrides (`unitTemperature` C\|F, `unitPrecipitation` MM\|IN, `unitVolume` **L\|HL\|GAL**, `unitArea` HA\|ACRES, `unitLength` M\|FT, `unitWeight` KG\|LB) | Single binary toggle; JSON blob column | Mixed regimes are real (Canadian wineries: °C + gallons; US: °Brix + gal but °C ferments). Explicit columns match every existing AppSettings field. hL added per council (EU/SA/AU bulk convention) + user decision. Master resolves per-dimension via ONE explicit resolver contract (Codex DQ3): `dimensionUnit = override ?? masterMapping[dimension] ?? metricDefault`; speed and shoot length have no override column and always take the master mapping. |
| Canonical type | Canonical `"METRIC" \| "IMPERIAL"` (+ per-dimension unions) lives in the NEW display layer; legacy lowercase unions (`vineyard/units.ts`, assistant entity enums) are **bridged at the boundary, not renamed** (council C3) | Rename everything to one casing | The lowercase unions are input contracts with many construction sites and tests; renaming is churn disguised as cleanup. Bridge fns (`normalizeUnitSystem`-style) convert at the seam. |
| Column types | Nullable TEXT (string unions), NOT Prisma enums; `getUnitPrefs()` is the ONLY reader and parses raw strings into precise unions before anything downstream sees them (council mitigation) | Prisma enums | Repo precedent: `coverageState`/`unitSystem` are deliberately "NOT a Prisma enum" (Windows enum-migration rule). The single-parser rule closes the `string \| null` drift Codex flagged. |
| Where formatters live | New `src/lib/units/display.ts` = the ONE display-unit authority. `weather/units-core.ts` delegates/re-exports (imports stay valid); `vineyard/units.ts` keeps geometry *math*, its formatters take the canonical type; `phenology/units.ts` folds in | Grow `weather/units-core.ts` in place | Volumes/weights/lengths aren't "weather"; the module's own header says exactly one owner may exist, so promote the pattern to `src/lib/units/` where `measure.ts` (canonical-unit registry) already lives. Named without `-core` to dodge the `verify:ai-native` core→tool guard. |
| Resolution chain (weather) | `VineyardWeatherConfig.unitSystem` (explicit override, relaxed to nullable) → `AppSettings` → `defaultUnitSystemFor(lat,lon)` | Tenant always wins; config always wins | Mirrors `resolveSiteTimeZone`. Card toggle becomes 3-state (°F/in · °C/mm · Auto=NULL) — **coarse by design**, overriding the whole system per vineyard (user decision; tenant granularity handles mixed-unit cases). Reads carry BOTH `unitSystemOverride` AND the resolved value so Auto is representable (council C2). |
| Legacy-value migration | **Split migrations + audited hoist-if-uniform** (council C1 — REPLACES the draft's blanket backfill-to-NULL): Migration A = additive AppSettings columns only; readers/writers go null-safe; Migration B (separate, after a tenant-data audit) relaxes both per-vineyard columns and, per tenant, hoists a uniform value to the tenant master, NULLing only rows matching the hoisted value. Non-uniform rows are PRESERVED as explicit overrides. | Blanket `UPDATE … SET NULL` (draft); leave columns NOT NULL forever | Both columns are user-writable today (`weather/actions.ts:414-423`, `VineyardModal.tsx:60,76`, `entities.ts:390`) — provenance can't be proven and blanket NULL destroys intent irreversibly. One live tenant + demo makes the hoist script small and checkable. |
| Resolution chain (vineyard geometry) | `VineyardDetail.defaultUnit` (nullable via Migration B) → `AppSettings` → legacy `"imperial"` | Leave column NOT NULL | Same shape as weather. All editors of `defaultUnit` (VineyardModal toggle, assistant entity enum) gain an explicit "Auto / winery default" option (council C2). |
| Assistant seam | Resolve prefs in `route.ts` beside timeZone; pass via `runAssistant` opts → system-prompt line + `ToolContext.units` (optional field so intermediate states compile); tools emit **display-ready formatted strings as the PRIMARY fields, with raw metric values namespaced under a `metric` subobject** (council Gemini SF4, adapted) | Let the model convert from raw metric; drop raw values entirely | `prompt.ts:52` already forbids mental conversion ("NEVER convert units in your head", the #311 lesson) — so the tool must do it. Namespacing the raw keys prevents "25 °F" hallucinations from a °C field while keeping evals/back-compat. |
| Storage | Untouched — metric canonical everywhere | — | D8 (litres), analyte °C-at-write, kg, metres are all load-bearing; this is display-only. |
| Number locale | Keep `en-US` grouping | Full Intl locale prefs | Separate feature; don't couple. |

## Implementation Units

### Unit 1: Schema Migration A — AppSettings unit columns (additive ONLY)

**Goal:** Add the seven tenant preference columns; touch nothing else (council C1 phase split).
**Files:** `prisma/schema.prisma`, new migration `prisma/migrations/<ts>_app_settings_unit_prefs/migration.sql`
**Approach:** Mirror `20260723040000_app_settings_time_zone` exactly: nullable TEXT columns, no defaults, comment block explaining NULL = not-configured. Columns on `AppSettings`: `unitSystem` ("METRIC"|"IMPERIAL"), `unitTemperature` ("C"|"F"), `unitPrecipitation` ("MM"|"IN"), `unitVolume` ("L"|"HL"|"GAL"), `unitArea` ("HA"|"ACRES"), `unitLength` ("M"|"FT"), `unitWeight` ("KG"|"LB"). The two per-vineyard columns are NOT touched here — their relaxation + hoist is Migration B (Unit 6), which ships only after readers are null-safe and a tenant-data audit has run. No new tables → Phase-12 RLS checklist does not apply; existing FORCE RLS covers new columns. No enums (Windows enum rule; string unions per `coverageState` precedent).
**Tests:** `npx prisma validate`; migration applies cleanly on the shadow DB.
**Depends on:** none
**Patterns to follow:** `prisma/migrations/20260723040000_app_settings_time_zone/migration.sql`
**Verification:** `npm run db:generate` + `npx prisma migrate diff` shows no drift. GATE: nothing in this unit changes existing behavior for any tenant.

### Unit 2: The canonical display module — `src/lib/units/display.ts`

**Goal:** One pure module owning display-unit types, resolution, and every formatter.
**Files:** `src/lib/units/display.ts` (new), `src/lib/weather/units-core.ts` (delegate/re-export), `src/lib/vineyard/units.ts` (formatters take canonical type), `src/lib/phenology/units.ts` (fold in, keep re-export shim), `test/units-display.test.ts` (new)
**Approach:** Define `UnitSystem`, per-dimension value types, `UnitPrefs` (resolved, non-null per dimension), `resolveUnitPrefs(settingsRow | null)` implementing the ONE explicit resolver contract (council DQ3): `dimensionUnit = override ?? masterMapping[dimension] ?? metricDefault` — speed and shoot length have no override column and always take the master mapping. Plus `DEFAULT_METRIC_PREFS` / `DEFAULT_IMPERIAL_PREFS`. Move/absorb: temp, precip, speed, GDD (from weather/units-core — which becomes a re-export so its single-owner header stays true), spacing/area labels+formatters (vineyard — legacy lowercase union is BRIDGED at the boundary, never renamed, council C3), weight rollup (harvest), shoot length (phenology). Add the missing formatters: `formatVolume(liters, pref)` for **L | hL | US gal** (hL = L/100, standard for metric bulk; gal rounding: whole ≥100, 1dp below), `formatLength`/`formatDistance` (m↔ft, km↔mi for station distance/elevation), `formatCostPerVolume` (converted rate at 3 significant decimals — display-only, reconciliation stays canonical $/L), and `formatWeightToAdd(grams, pref)` for the dosing total-to-add readout (g/kg ↔ oz/lb rollup). Constants come from the existing single sources (`LITERS_PER_US_GALLON` value from `compliance/gallons.ts`, `FT_PER_M` from vineyard/units) — no new duplicate constants.
**Tests:** Port `test/weather-units.test.ts` cases + new: volume rounding all three units, hL rollup, resolution chain (override beats master beats default; no-override dimensions follow master), casing normalization (`"imperial"` → `IMPERIAL`), null-safety (`—` for null), **round-trip stability** (1000 gal → 3785.41 L → "1,000 gal"; council C5), cost-per-volume decimals.
**Depends on:** none (types only; Unit 1 parallel-safe)
**Patterns to follow:** `src/lib/weather/units-core.ts` header discipline + NBSP formatting
**Verification:** `npx vitest run test/units-display.test.ts test/weather-units.test.ts test/vineyard-units.test.ts`

### Unit 3: Settings read/write plumbing

**Goal:** `getUnitPrefs()` and `setUnitPrefs` beside their timeZone siblings.
**Files:** `src/lib/settings/data.ts`, `src/lib/settings/actions.ts`, `test/settings-unit-prefs.test.ts` (new, if a settings action test pattern exists — else covered by Unit 2's resolver tests + Unit 12 e2e)
**Approach:** `getUnitPrefs(): Promise<UnitPrefs>` — `getAppSettings()` then `resolveUnitPrefs` (read-side permissive: unknown stored value → ignored, like `isRealTimeZone`). `setUnitPrefs` — `adminAction`, strict write-side validation of every dimension value, `runInTenantTx` upsert by tenantId, `writeAudit` (entityType "AppSettings", summary naming changed dimensions), `revalidatePath("/settings")` + `revalidatePath("/", "layout")`. One action accepting the full pref object (the card saves atomically), mirroring `setWineryTimeZone`'s shape at `actions.ts:74-99`.
**Tests:** validation rejects junk dimension values; audit summary includes changed fields.
**Depends on:** Units 1, 2
**Verification:** `npm run lint` + targeted vitest.

### Unit 4: Settings UI — UnitPreferencesCard

**Goal:** The admin-facing config surface.
**Files:** `src/app/(app)/settings/UnitPreferencesCard.tsx` (new), `src/app/(app)/settings/SettingsClient.tsx`, `src/app/(app)/settings/page.tsx`
**Approach:** Card modeled on `WineryTimeZoneCard.tsx` (Card/Eyebrow, useState + useTransition, direct action call): a preset row ("Metric (SI)" / "US customary" buttons that fill all six dropdowns) above six per-dimension native `<select>`s, each with a "Winery default" summary line when master covers it. "Not set" state mirrors timeZone's "— not set —". Load via the existing `Promise.all` in `page.tsx:18`; mount beside `<WineryTimeZoneCard/>` under the "Winery" eyebrow (`SettingsClient.tsx:350`). Tokens only per DESIGN.md.
**Tests:** none beyond lint (repo has no jsdom/RTL — assistant-design memory); manual QA in Unit 12.
**Depends on:** Unit 3
**Verification:** `/settings` renders; saving persists and survives reload (Demo Winery).

### Unit 5: UnitsProvider client context

**Goal:** Push resolved prefs once from the server layout so client components never re-fetch.
**Files:** `src/components/units/UnitsProvider.tsx` (new), `src/app/(app)/layout.tsx`
**Approach:** Clone `src/components/time/WineryTimeZoneProvider.tsx` / `CurrencyProvider.tsx`: server layout awaits `getUnitPrefs()` (add to its existing settings reads at `layout.tsx:33`), provider exposes `useUnitPrefs()` returning the resolved `UnitPrefs`. Default context value = metric prefs (safe for any unmounted-provider usage in tests).
**Tests:** none (pure context); consumers verified per-surface.
**Depends on:** Units 2, 3
**Verification:** A client component under `(app)` reads the pref set in Unit 4.

### Unit 6: Migration B + weather surfaces honor the chain

**Goal:** Relax the per-vineyard weather column safely, then make every weather/climate display resolve config-override → tenant → geo default.
**Files:** new migration `prisma/migrations/<ts>_relax_vineyard_unit_columns/migration.sql`, `scripts/audit-unit-prefs-hoist.ts` (new, one-off), `src/lib/weather/read-core.ts`, `src/lib/weather/ingest-core.ts`, `src/lib/weather/actions.ts`, `src/app/(app)/vineyards/weather/WeatherCard.tsx`, `GddChart.tsx`, `ForecastStrip.tsx`, `ForecastDayModal.tsx`, `HourlyChart.tsx`, `RainfallChart.tsx`, `RainfallSection.tsx`, `src/lib/weather/alert-core.ts`
**Approach:** FIRST the audit gate (council C1): a read-only `runAsSystem` script reports, per tenant, the distinct values of BOTH per-vineyard unit columns. THEN Migration B: DROP NOT NULL + DROP DEFAULT on `VineyardWeatherConfig.unitSystem` AND `VineyardDetail.defaultUnit`; per tenant, hoist a uniform value to `AppSettings.unitSystem` (only where the tenant's master is still NULL) and NULL only rows matching the hoisted value; non-uniform rows keep their values as explicit overrides. Then code: pure `resolveWeatherUnitSystem(configOverride, tenantPrefs, lat, lon)` beside the read path (`read-core.ts:229`); `ClimateSummary` carries **both** `unitSystemOverride: UnitSystem | null` and the resolved `unitSystem` (council C2) — enumerated contract changes: `read-core.ts:64-65,229`, `weather/actions.ts:335` and `:414-423` (`setVineyardUnitSystem` accepts null = Auto), `ForecastDayModal.tsx:75`. Kill the hand-branched inline conversions in `WeatherCard.tsx:210,215`; convert the metric leaks at :328-329 via `formatDistance`. Give `GddChart` a `unitSystem` prop: preferred system on the LEFT axis, the other on the right (data stays °F-native internally; conversion at the edge — the clamp commutes with ×1.8, verified against Gemini's objection). Card toggle becomes 3-state (°F/in · °C/mm · Auto), Auto writing NULL. Fix `alert-core.ts` prose to format via the display module with the site's resolved system.
**Tests:** resolver tests including **override-vs-Auto and null states** (council gate); existing weather goldens/fixtures stay green (`npx vitest run test/weather-*.test.ts` and the alert/digest tests).
**Depends on:** Units 1, 2, 3, 5
**Patterns to follow:** `resolveSiteTimeZone` (`src/lib/weather/site-time-core.ts:16-22`)
**Verification:** Audit script output reviewed BEFORE Migration B runs. Demo Winery: set tenant IMPERIAL → an Auto vineyard's weather card flips; explicit per-vineyard toggle still overrides; Auto returns it.

### Unit 7: Vineyard geometry surfaces

**Goal:** Area/spacing/elevation honor vineyard-override → tenant chain; kill local formatter duplicates.
**Files:** `src/lib/vineyard/data.ts`, `src/app/(app)/reference/VineyardModal.tsx`, `BlockDetails.tsx`, `VineyardSetup.tsx`, `src/components/ui/SatelliteMap.tsx`, `src/components/ui/MapLegend.tsx`, `src/app/(app)/vineyards/maps/SoilUnitPanel.tsx`, `src/app/(app)/vineyards/field-notes/NoteDetail.tsx`, `src/lib/assistant/entities.ts`
**Approach:** Resolution helper `resolveGeometryUnit(detailOverride, tenantPrefs)` in the display module; serialization in `vineyard/data.ts:72,83,129` carries **both the raw override and the resolved value** (council C2) so the modal can render an "Auto / winery default" state. `VineyardModal`'s unit toggle and the assistant's `defaultUnit` entity enum (`entities.ts:390`) each gain the explicit Auto option (writes NULL). Replace `VineyardModal.elevationText()` and `SoilUnitPanel`'s inline area formatter with display-module calls (fixes the "ac" label inconsistency). `SatelliteMap.tsx:231` scale bar uses the resolved unit. Fix `NoteDetail.tsx:90` (hardcoded "METRIC" shoot length) and :183,187 (hardcoded °C) to use resolved prefs.
**Tests:** `test/vineyard-units.test.ts` extended for the resolver incl. Auto/null states; existing suite green.
**Depends on:** Units 1, 2, 5, 6 (Migration B relaxes `defaultUnit`)
**Verification:** Tenant METRIC + vineyard unset → modal shows ha/m; setting vineyard override to imperial flips only that vineyard.

### Unit 8: Cellar volume display sweep

**Goal:** Read-only volume displays render via `formatVolume`.
**Files:** `src/app/(app)/vessels/VesselsClient.tsx`, `src/app/(app)/bulk/BulkClient.tsx`, `GroupActions.tsx`, `src/app/(app)/lots/LotsClient.tsx`, `src/app/(app)/lots/[id]/LotDetailClient.tsx`, `src/app/(app)/blend/BlendBuilderClient.tsx`, `src/app/(app)/bottling/page.tsx`, `src/app/(app)/cellar/en-tirage/EnTirageClient.tsx`, `src/app/(app)/page.tsx`, `src/components/vessel/VesselTimeline.tsx`, `src/components/cost/CostPanel.tsx`, work-order execute task forms (`BottlingTaskForm.tsx`, `CrushTaskForm.tsx`, `PressTaskForm.tsx`, `GroupRackTaskForm.tsx`, `new/VesselMultiSelect.tsx`)
**Approach:** Mechanical: each hardcoded `` `${n} L` `` display site becomes `formatVolume(n, prefs.volume)` via `useUnitPrefs()` (client) or a threaded prop (server components pass the resolved pref). Chart axis labels ("Liters" in `LotDetailClient.tsx:332,342`) branch on pref. `CostPanel`'s $/L becomes $/gal with the *rate converted too* (cost-per-gal = cost-per-L × 3.785…) — the one arithmetic subtlety in the sweep; keep it in the display module (`formatCostPerVolume`). DO NOT touch: persisted audit prose builders (`timeline.ts`, `group-apply.ts`, `nl-resolve.ts`, `proposal-readiness.ts`, server action strings), compliance, dosing readouts (`DoseForm` shows "× N L" — canonical by design since the dose math is per-litre).
**Tests:** `formatCostPerVolume` unit tests (3 significant decimals, display-only); visual QA in Unit 12.
**Depends on:** Units 2, 5
**Execution note:** big-but-mechanical; do it as one focused pass, grep-driven (`" L"`, `"(L)"`, `"Litres"`).
**Verification:** Demo Winery set to US customary: /vessels, /bulk, /lots, dashboard all read gallons; audit timeline still says litres. GATE (council): a final grep for residual hardcoded litre renders across `src/app` and `src/components` — every remaining hit must be on the explicit no-touch list.

### Unit 9: Cellar volume inputs (MUST — promoted per council + user decision)

**Goal:** Vessel capacity and transfer/rack volume entry accept the preferred unit, safely.
**Files:** `src/app/(app)/vessels/VesselsClient.tsx` (create/edit forms), `src/app/(app)/bulk/BulkClient.tsx` (volume inputs), `src/components/cellar/forms/{RackForm,ToppingForm,FiltrationForm}.tsx`
**Approach:** The `VineyardSetup` round-trip pattern (`fromCanonical` on load, `toCanonical` on save, `VineyardSetup.tsx:83-84,173-174`), hardened per council: (1) the unit renders as an **inline non-editable adornment inside the input box** (Gemini SF2 — a misread unit on a transfer overflows a real tank), plus the canonical equivalent as a hint line; (2) **dirty-check-only conversion** (council C5) — form hydration rounds via `fromCanonical` to unit-appropriate precision, and only user-touched fields are converted on submit, so an untouched field never re-saves a re-converted value; (3) server contracts unchanged — actions still receive litres.
**Tests:** round-trip stability tests live in Unit 2; form-level manual QA (enter, save, reopen, save-untouched → byte-identical DB value).
**Depends on:** Unit 8
**Verification:** Enter "500" with pref=gal → DB row shows 1892.71 L → renders back as "500 gal"; reopening and saving without touching the field leaves the row unchanged.

### Unit 10: Harvest weights, ferment temps + dosing total-to-add

**Goal:** Seed the ephemeral harvest toggles from tenant pref; ferment charts honor temp pref; the WO execution view shows the physical amount to add in the tenant's weight unit.
**Files:** `src/app/(app)/vineyards/harvest/admin/HarvestDashboard.tsx`, `manager/HarvestManagerView.tsx`, `HarvestRecordForm.tsx`, `src/components/ferment/FermentMonitor.tsx`, `FermentChart.tsx`, `src/components/cellar/forms/DoseForm.tsx`, the WO addition execution view (`src/app/(app)/work-orders/[id]/execute/` addition task surface)
**Approach:** Harvest: `useState<Unit>` initial value comes from `useUnitPrefs().weight` instead of hardcoded "metric"; the in-page toggle stays (a scale reads what it reads). Ferment: display-only — chart axis/tooltip and the readings table render via `formatTemp` with the pref; storage and hard-bounds validation stay °C (analyte registry already handles °F entry and normalizes at write, `analytes.ts:75`); the input placeholder reflects the preferred unit and passes the matching `unit` to the existing write path. Dosing (council Gemini C3, user decision): the computed **total** from `computeAdditionTotal` gains a secondary readout via `formatWeightToAdd` — e.g. "900 g **(1.98 lb)**" — on `DoseForm` and the WO execution addition view. The RATE stays mg/L / g/hL untouched; no lbs-per-1000-gal rate math anywhere.
**Tests:** `formatWeightToAdd` covered in Unit 2; existing ferment/harvest suites green.
**Depends on:** Units 2, 5
**Verification:** Imperial tenant: harvest dashboard opens in lb/short tons; ferment chart axis reads °F while the DB reading row stays °C; a 240 mg/L dose into 3,785 L shows "908 g (2.00 lb)" on the execution view.

### Unit 11: Assistant threading (text + voice)

**Goal:** The assistant reports in tenant units without mental conversion, both modes.
**Files:** `src/app/api/assistant/route.ts`, `src/lib/assistant/run.ts` (opts at :56-59, tool-call construction at :179), `src/lib/assistant/prompt.ts`, `src/lib/assistant/registry.ts` (`ToolContext` at :15-29), `src/lib/assistant/tools/query-climate.ts`, `test/assistant-run-loop.test.ts` (:84-89), `test/assistant-run-loop-draft.test.ts` (:62-67, :153-158), `test/evals/assistant-read-tools.golden.ts`
**Approach:** Copy the timeZone seam line-for-line: `route.ts` resolves `unitPrefs = await getUnitPrefs()` in the same best-effort try/catch block as `getWineryTimeZone()` (:126-131) and passes `units` into `runAssistant`; `run.ts` accepts the opt (documented "ALREADY-RESOLVED — no DB reads here"), adds one system-prompt line via `buildSystemPrompt` ("This winery displays temperatures in °F, rainfall in inches, volumes in US gallons… State quantities in these units; tool results include display-ready strings — use them verbatim, never convert arithmetic yourself"), and threads `units` into `ToolContext` so `run.ts:179` hands it to every tool. **`units?: UnitPrefs` is optional on the seam and the DB-free loop tests are updated in this same unit** (council C4) — intermediate states must compile. `query-climate.ts`: stop dropping the loaded `unitSystem` — resolve per-site system (config override → ctx.units → geo, the Unit 6 chain; the tool's direct settings read is legitimate, only the loop is DB-free) and restructure the payload per council SF4: **display-formatted strings become the primary fields; raw metric values move under a `metric` subobject** (evals/back-compat keep exact values, the model can't grab a °C number for a °F sentence). Voice + text clients need no change (tenant-level pref; nothing viewer-supplied; `speech.ts:77` already pronounces °F — stale task removed).
**Tests:** run-loop tests construct `runAssistant` with a `units` opt (no DB); extend the `query_climate` goldens (:169-217) with TWO cases (council gate): imperial-tenant (°F/inches in payload) and **auto-inherit** (vineyard override NULL → tenant pref flows through). D26/H8 golden gate stays green.
**Depends on:** Units 2, 3, 6
**Verification:** `npm run` golden evals; manual: ask the dock for the WV Oregon forecast with tenant=US customary → reply in °F/inches; voice speaks "degrees Fahrenheit".

### Unit 12: End-to-end QA + docs

**Goal:** Prove the whole chain on Demo Winery and leave the registers honest.
**Files:** `docs/architecture/ux-principles.md` (if a units-display principle is worth one line), `NOW.md`, `test/` greens
**Approach:** Full manual pass on Demo Winery (in-app browser, QA-* fixtures where writes are needed, per the QA rules): settings card → weather card (+ 3-state toggle) → vineyard modal → vessels/bulk/lots → harvest → ferment chart → assistant text + voice. DB proof via a `runAsTenant("org_demo_winery", …)` read-back for the settings row. Run `npm run verify:naming` before/after, full `npx vitest run`, `npm run build` in the MAIN checkout (worktrees lack .env). Clean up QA fixtures.
**Tests:** the whole suite.
**Depends on:** all
**Verification:** checklist in the QA notes; all greens recorded.

## Test Strategy

**Unit tests:** All new pure logic (formatters, resolvers, cost-per-volume) in
`test/units-display.test.ts` following `test/weather-units.test.ts` / `test/vineyard-units.test.ts`
patterns (vitest, node environment). Assistant run-loop opt covered in the existing
DB-free run-loop tests.
**Integration tests:** `query_climate` golden evals gain an imperial-tenant case — this
is the hard CI gate (D26/H8) so the assistant behavior is pinned, not hoped-for.
**Manual verification:** Unit 12's Demo Winery pass; the settings write proven by DB
read-back script, per the repo's "browser proves the UI, script proves the DB" rule.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Migration B mishandles a genuinely chosen per-vineyard value | LOW | MED | Council C1 redesign: audit script reviewed before running; hoist-if-uniform only NULLs rows matching the hoisted value; non-uniform rows preserved as overrides; migration split from the additive one so rollback is clean. |
| The ~60-site volume sweep misses call sites or converts a no-touch zone | MED | MED | Grep-driven checklist in Unit 8; explicit no-touch list (audit prose, compliance, dosing, spray) written into the unit; review pass greps for remaining `" L"` renders. |
| `$/L` → `$/gal` conversion done wrong somewhere ad-hoc | LOW | HIGH (money display) | Single `formatCostPerVolume` in the display module; no inline rate math allowed (same rule as units-core's header). |
| Assistant regression on the golden gate | LOW | HIGH (CI) | Additive payload fields only (raw metric keys untouched); goldens extended, not rewritten. |
| GddChart °F-native data + axis swap introduces off-by-one-scale bugs | MED | MED | GDD deltas convert by ×1.8 only (no +32) — already encoded in `gddCToF`/`gddFToC`; chart uses only those helpers; visual QA against known Winkler values (4,634 °F ≈ 2,574 °C). |
| Migration on live tenant | LOW | LOW | Purely additive nullable columns + constraint *relaxations*; nothing enforced, nothing backfilled into a NOT NULL. |

## Success Criteria

- [ ] A US tenant sets "US customary" once and sees °F, inches, gallons, acres, feet,
      lb/short-tons across weather, vineyards, vessels, bulk, lots, harvest, ferment —
      and can ENTER volumes in gallons (round-trip stable).
- [ ] A European tenant can choose hL and see bulk volumes in hectolitres.
- [ ] The Oregon-forecast assistant transcript from the problem statement answers in °F.
- [ ] A metric tenant sees zero change with the pref unset (NULL = today's behavior).
- [ ] Per-vineyard weather toggle still overrides; "Auto" follows the winery; the
      audit script ran before Migration B and no non-uniform value was NULLed.
- [ ] The WO execution view shows the dose total-to-add in the tenant's weight unit;
      dose RATES (mg/L, g/hL), TTB gallons, spray-legal, vendor package units, audit
      prose: byte-identical to before.
- [ ] Golden evals, `verify:naming`, full vitest, prod build: green.
- [ ] All tests pass / no regressions.
