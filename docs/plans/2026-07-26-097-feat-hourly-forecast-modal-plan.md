---
title: Hourly forecast detail modal — click a day card, see the hour-by-hour graph
type: feat
status: completed (built + live-QA 2026-07-26; all 7 units)
branch: feat/weather-hourly-modal
depth: standard
units: 7
---

## Overview

Clicking a day card in the 7-day forecast strip (`/vineyards/weather`) opens a **modal with that
day's projected hourly temperature (line) and rainfall (bars)** — Russell's explicit spec. The
quiet win rides along for free: the vineyard's frost/heat threshold lines drawn on the temperature
axis turn "Tuesday may hit 28 °F" into "drops below 32 °F around 1 a.m." — the wind-machines
question, answered visually with zero extra features. Builds entirely on shipped plan 096
machinery; no new runtime dependencies.

## Problem Frame

The strip answers *whether* (frost Tuesday, rain Thursday); a grower planning a night of frost
protection or a spray window needs *when*. Hourly data exists free at both providers we already
call. Do nothing → growers keep a second weather app open for timing, and Cellarhand's forecast
stays a summary, not a planning tool.

Pressure-test: the modal-with-graph framing is right — it keeps the strip scannable and puts the
dense view one intent-revealing tap away. No simpler framing beats it (summary text lines were
considered earlier; Russell chose the graph).

## Requirements

- MUST: Click (and keyboard-activate) a day card → modal titled with that day, showing an hourly
  chart: temperature line + rainfall bars for that vineyard-local civil day.
- MUST: NWS for US, Open-Meteo elsewhere — the SAME primary series discipline as the strip
  (never-blend; `selectPrimaryForecastSeries` rank).
- MUST: Rain bars at their **native interval width** — Open-Meteo true per-hour bars; NWS amounts
  only exist as raw-gridpoint QPF buckets (PT3H/PT6H, live-verified), so NWS bars span their
  bucket (an hourly split would invent uniform rain — the same honesty rule as council S6).
- MUST: Threshold reference lines on the temp axis from the vineyard's stored tier columns
  (frostWatch/frostWarn/hardFreeze/heatWatch/extremeHeat), converted via units-core.
- MUST: Site-local hours (site-time-core tz), °F/°C + in/mm per vineyard `unitSystem`.
- MUST: Day 6–7 lower-confidence labeling carries into the modal.
- MUST: Modal = the shared `Modal` component (its #310 backdrop-origin guard + Escape + aria come
  free); store-then-read-offline (no provider fetch on modal open).
- MUST: Assistant coverage (repo definition of done) — the hourly core reachable from
  `query_climate`, plus a golden.
- SHOULD: "Now" marker line when the opened day is today; hover/touch crosshair readout
  (hour · temp · rain), matching the RainfallChart interaction.
- SHOULD: Probability shown subtly (e.g. a muted % row or bar opacity), never conflated with amount.
- NICE: Wind in the crosshair readout (both providers carry it hourly).

## Scope Boundaries

**In scope:** the 7 units below, one PR (`feat/weather-hourly-modal`).

**Out of scope:** hourly ALERTS/notifications (daily-tier alerting shipped in 096 stays the
notify surface); radar; multi-day hourly scrubbing across days (the modal is one day; arrows for
prev/next day are a NICE follow-on, not v1); focus-trap work in the shared Modal (a pre-existing
repo-wide gap — noted, not fixed here); restoring the 6-hourly cron (Vercel plan constraint,
#519 — hourly freshness rides the same on-view >6 h refresh).

## Research Summary

### Codebase Patterns (agent-verified, file:line)

- **Modal**: `src/components/ui/Modal.tsx` — the one shared dialog. Props `open/onClose/title/
  subtitle/maxWidth (default 600)/fullScreenOnMobile`. The **#310 drag-dismiss guard is built in**
  (`modal-dismiss.ts:16-23` predicate; pointerdown-origin ref at Modal.tsx:41,60-72) — using
  Modal means the guard needs no re-implementation. Escape + body scroll-lock + `role="dialog"`/
  `aria-modal`/`aria-labelledby` present; **no focus trap** (pre-existing gap, out of scope).
  Returns `null` when closed → the chart subtree never mounts until open (lazy for free; no
  `next/dynamic` needed).
- **Click-a-tile → detail-modal precedent to copy**: `ConsumablesSection.tsx` — row `onClick` →
  parent `detailId` state → `<MaterialDetailModal … onClose={() => setDetailId(null)}>`
  (`:86,:266,:293-301`). Async-data-inside-open-modal precedent: `TimelineEntryDetail.tsx:434`.
- **No chart has ever rendered inside a Modal** — this PR sets the precedent. The SVG charts use
  fixed viewBoxes (GddChart 680×360) → pick `maxWidth` ≈ 720 so the chart doesn't squash.
- **Card a11y gap**: clickable cards in this repo don't add `role="button"`/`tabIndex` — the strip
  cards must wire keyboard activation explicitly (or render as `<button>`).
- **Charts**: hand-rolled SVG only (GddChart/RainfallChart idioms — crosshair, tokens for chrome,
  semantic data colors). Threshold columns live on `VineyardWeatherConfig` (plan 096 U19).
  `zonedWallClockToUtc` + `zonedDateKey` exist in `due-at.ts` for local↔UTC hour math.

### External Research (live-verified 2026-07-26, agent report; raw JSON in scratchpad)

- **NWS `/gridpoints/{o}/{x},{y}/forecast/hourly`**: exactly **156 strictly-one-hour periods**,
  `startTime` ISO with local offset, `?units=si` works (°C), per-hour `probabilityOfPrecipitation`,
  `dewpoint`, `relativeHumidity`, `windSpeed` string. **NO per-hour precip AMOUNT** — amounts stay
  on the raw gridpoint `quantitativePrecipitation` (wmoUnit:mm, **PT3H/PT6H UTC duration
  buckets**), which plan 096's ingest ALREADY fetches. Payload ~158 KB (+194 KB gridpoint) — fine
  under the 8 MB cap.
- **Open-Meteo**: `hourly=temperature_2m,precipitation,precipitation_probability,weather_code`
  rides **the same request** as the existing `daily=` block (combined response ~6 KB);
  `forecast_days=7` → exactly **168 slots**; `timezone=auto` → `hourly.time` in LOCAL ISO
  (`2026-07-27T13:00`, no offset suffix); `hourly_units` °C/mm; **`elevation=` downscales the
  hourly temps too** (live-measured ≈ −9.7 °C at +1495 m — the lapse rate, i.e. Paro's hourly
  temps come out at 2,302 m).

### Prior Learnings (plan 096, this session)

Replace = delete-horizon-then-insert; config tz persists in the ingest tx; never-blend/one
primary selector; `verify:ai-native -- --write` before push; watch the MERGE COMMIT's Vercel
status; migration timestamps sort after `migrate status`; worktree `prisma generate` before tsc.

## Key Decisions

| Decision | Choice | Alternatives Considered | Rationale |
|----------|--------|------------------------|-----------|
| Storage | New `vineyard_forecast_hourly` RLS table, written in the SAME ingest tx as daily rows, same replace-horizon semantics | Fetch-on-modal-open | Repo convention is store-then-read-offline + the on-view >6 h refresh already exists; a modal open must never be a live provider call. Volume ≈ 13 vineyards × ≤168 h × ≤2 providers ≈ 4.4 k rows fleet-wide, replaced |
| Row grain | One row per slot keyed `(tenantId, vineyardId, providerKey, hourStartUtc)` with `localDate`/`localHour` computed AT INGEST via the vineyard tz, plus `precipMm` + `precipDurationH` (1 for OM; 3/6 for NWS QPF buckets attached at their start hour) | Separate bucket table; per-hour apportioning | One table, one grain; the chart draws each bar at `durationH` width — native-resolution honesty (the S6 rule) with no second schema |
| NWS rain amounts | Reuse the raw-gridpoint QPF series plan 096 already fetches; hourly endpoint contributes temp/PoP/condition/wind only | Apportion buckets to hours | Live-verified: NWS hourly has no amounts; splitting a PT6H bucket invents uniform rain |
| Modal | Shared `Modal`, `maxWidth ≈ 720`, day-card click sets `selectedDate` state in `ForecastStrip` (ConsumablesSection precedent) | URL-addressable selection (VineyardNoteModal idiom) | The modal is a glance, not a destination; no linkability requirement. State stays local |
| Day slice | Modal shows the vineyard-local civil day (site-time-core tz); a QPF bucket belongs to the day of its START hour, bar visually clipped at the day edge with a "continues" affordance | End-day assignment (daily S6 rule) | Daily totals keep S6; the HOURLY view is about timing, so a bucket renders where it starts; clipping is labeled, never silently truncated |
| Chart | New `HourlyChart` SVG (~680 viewBox): temp line (left axis) + rain bars (right axis, native widths) + threshold reference lines + crosshair + now-marker | Extending RainfallChart | Different axes/semantics; same idiom, separate component |
| Assistant | `query_climate` forecast block gains near-term crossing times ("first hour ≤ frostWarnC tonight") computed from the same hourly core + one golden | Allowlist deferral | Wiring beat allowlisting three times in plan 096; "when will it freeze tonight?" is the single best voice question this data answers |

## Implementation Units

### Unit 1: Hourly types + Open-Meteo hourly (same request)

**Goal:** `ForecastSeries` carries an optional hourly series; Open-Meteo fills it at zero extra requests.
**Files:** `src/lib/weather/providers/forecast-types.ts`, `src/lib/weather/providers/forecast-open-meteo.ts`, `test/weather-forecast-open-meteo.test.ts`
**Approach:** Add `ForecastHourlyRecord { hourStartUtc, localDate, localHour, tempC, popPct, precipMm, precipDurationH, conditionCode, windKph }` (all value fields nullable — the C7 rule) and `ForecastSeries.hourly?`. Open-Meteo request gains the `hourly=` vars; map the parallel arrays; local ISO strings + the response tz convert to UTC instants via `zonedWallClockToUtc` (due-at), `localDate`/`localHour` come straight off the string. `precipDurationH = 1`.
**Tests:** 168-slot mapping, local→UTC conversion at a ±offset, nulls stay null, elevation param unchanged, request still carries the daily block (one call).
**Depends on:** none
**Patterns to follow:** the existing `parseOpenMeteoDaily` normalizer shape.
**Verification:** adapter tests green.

### Unit 2: NWS hourly adapter arm

**Goal:** NWS contributes hourly temp/PoP/condition/wind + native-width QPF amounts.
**Files:** `src/lib/weather/providers/forecast-nws.ts`, `test/weather-forecast-nws.test.ts`
**Approach:** One added fetch `/forecast/hourly?units=si` (156 periods; °F defense as in U12-096); `startTime`'s offset gives the UTC instant, its date/hour give the local keys. QPF: reuse the raw-gridpoint series ALREADY fetched — each bucket becomes a record at its start hour with `precipDurationH` = parsed duration (the existing `parseIsoDurationHours`), temp fields null. Pure helpers exported for tests.
**Tests:** hourly parse + °F defense, QPF bucket → start-hour record with duration, a bucket straddling local midnight lands on its START day, wind parse reuse, fixture `fetchNwsForecast` returns `hourly` populated.
**Depends on:** Unit 1 (types)
**Patterns to follow:** `pairNwsPeriods`/`sumQpfToLocalDays` structure; `JsonFetcher` deps.
**Verification:** adapter tests green.

### Unit 3: Storage + ingest

**Goal:** Hourly rows persist with the same replace-horizon semantics, in the same tx.
**Files:** `prisma/schema.prisma`, new migration `…_forecast_hourly/migration.sql`, `src/lib/weather/forecast-ingest-core.ts`, `test/weather-forecast-ingest.test.ts` (extend)
**Approach:** `vineyard_forecast_hourly`: tenant template verbatim (TENANT-1 checklist, self-verifying DO block, app_rls grants), UNIQUE `(tenantId, vineyardId, providerKey, hourStartUtc)`, INDEX `(tenantId, vineyardId, localDate)`; nullable value columns + NULL-tolerant CHECKs (`precipMm>=0`, `popPct 0-100`, `precipDurationH>=1`). Ingest: per provider, delete `hourStartUtc >= min(incoming)` then `createMany` — inside the existing tx (C1 discipline). Daily sweep prune: `localDate < siteToday − 1`. Migration timestamp sorts after `migrate status`.
**Tests:** replace-on-shorter-horizon deletes orphans; both providers' rows land; prune boundary. Tenant-isolation auto-sweep picks the table up (+1).
**Depends on:** Units 1–2
**Patterns to follow:** `20260726170000_forecast_schema/migration.sql` verbatim.
**Verification:** `migrate status` clean; tenant-isolation sweep green.

### Unit 4: Read core + action

**Goal:** The modal's data: one vineyard-local day of the PRIMARY hourly series, with thresholds.
**Files:** new `src/lib/weather/forecast-hourly-read-core.ts`, `src/lib/weather/actions.ts`, new `test/weather-forecast-hourly-read.test.ts`
**Approach:** Pure `composeForecastHoursCore(rows, { targetDate, primaryProviderKey })` → ordered slots for that `localDate` + summary (min/max temp, total rain incl. bucket-clip note when a spanning bucket starts that day, first threshold-crossing hours given the tier thresholds). Action `loadVineyardForecastHours(vineyardId, targetDate)`: config (tz, unitSystem, thresholds) + rows for that localDate, primary via the SAME rank as `selectPrimaryForecastSeries` (C3 — never the secondary), Decimal coercion, returns slots + thresholds + unitSystem + issuedAt-style freshness.
**Tests:** day slicing, primary-only, crossing-hour derivation (first hour ≤ frostWarnC / ≥ heatWatchC), clip-note when `precipDurationH` spans midnight, empty day → null (honest).
**Depends on:** Unit 3
**Patterns to follow:** `forecast-read-core.ts` + `loadVineyardForecast` action shape.
**Verification:** new tests; ai-native handled in Unit 6 (wire, not allowlist).

### Unit 5: The modal + hourly chart

**Goal:** Russell's spec on screen: tap a day card, see the day's hourly graph.
**Files:** new `src/app/(app)/vineyards/weather/ForecastDayModal.tsx`, new `HourlyChart.tsx`, `ForecastStrip.tsx` (card click/keyboard + `selectedDate` state)
**Approach:** Strip cards become keyboard-accessible buttons (the Card a11y gap — wire `role`/`tabIndex`/Enter or render `<button>`); click sets `selectedDate`; `<Modal open onClose title={day name + date} subtitle={provider · issued · "lower confidence" when day 6–7} maxWidth={720}>` (the #310 guard is inherited). Modal body fetches via the Unit-4 action on open (async-inside-open-modal per TimelineEntryDetail) and renders `HourlyChart`: temp line (left axis, units-core), rain bars (right axis, bar width = `precipDurationH`, clip affordance at day edges), dashed threshold reference lines with small labels (only thresholds within the day's temp range ±few degrees — don't draw five lines on a mild day), hour ticks in site-local time, now-marker when the day is today, crosshair readout (hour · temp · rain · wind). Empty state: "hourly detail isn't in yet for this day."
**Tests:** none for components (repo convention) — scale/tick/threshold-visibility math lives in the Unit-4 core or a small pure helper in the chart file's test if extracted.
**Depends on:** Unit 4
**Patterns to follow:** `ConsumablesSection` open/close state; `RainfallChart` axes/crosshair; DESIGN.md tokens (real ones).
**Verification:** `npm run lint`; browser QA below.

### Unit 6: Assistant wire + golden

**Goal:** "When will it freeze tonight?" answerable; `verify:ai-native` green by wiring, not allowlisting.
**Files:** `src/lib/assistant/tools/query-climate.ts`, `test/evals/assistant-read-tools.golden.ts`, (`scripts/ai-native-allowlist.mjs` + `test/verify-ai-native.test.ts` only if a mirror entry is needed)
**Approach:** The forecast block gains `crossingTimes` for today+tomorrow from `composeForecastHoursCore` (first hour at/below frostWarn, at/above heatWatch — site-local, R11-honest when no hourly rows). Tool description mentions timing questions. One golden: "What time will it drop below freezing tonight at Paro?" → `query_climate`. Regenerate the coverage doc (`--write`) in the same commit.
**Tests:** golden selection case; deterministic eval suite green.
**Depends on:** Unit 4
**Patterns to follow:** the plan-096 rainfall/forecast wires in the same tool.
**Verification:** `npm run verify:ai-native`; `npm run eval:assistant`.

### Unit 7: E2E verify + browser QA

**Goal:** The loop proven offline and on screen.
**Files:** `scripts/verify-weather.ts` (extend the forecast fixtures with hourly arms)
**Approach:** Fixture NWS series gains hourly periods + QPF buckets (incl. one PT6H bucket), OM fixture gains 24 hourly slots; assert hourly rows written both providers, replace semantics, the day-slice read returns the right slots with the bucket at native width, prune. Browser QA (Demo, in-app pane): click Madera's Wednesday card → modal opens with temp line crossing the 95 °F reference line mid-afternoon, native rain bars (likely empty in July — check a rainy fixture day via the QA vineyard), Escape and backdrop close, drag-select inside doesn't dismiss (#310), keyboard: tab to a card, Enter opens. Live Bhutan proof from the main checkout: Paro's monsoon day shows hourly rain bars.
**Depends on:** Units 3–5
**Patterns to follow:** the existing verify-weather fixture style.
**Verification:** `npm run verify:weather`; QA transcript in the PR.

## Test Strategy

Unit tests on every pure piece (adapters' hourly parsing, the read core's slicing/crossings,
QPF-bucket native-width handling); the two 096 regression gates stay untouched;
`verify:weather` gains the hourly leg; `verify:tenant-isolation` +1 table; `verify:ai-native`
green via the Unit-6 wire; browser QA covers the modal interactions the unit tests can't
(backdrop guard, keyboard, visual threshold crossing).

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| NWS QPF buckets vs hourly grain confuses the chart | MED | MED | Native-width bars + duration stored per row + a labeled clip affordance at day edges; fixtures include PT6H and a midnight-straddler |
| Local↔UTC hour math drift (OM local strings vs NWS offset strings) | MED | HIGH | Both convert AT INGEST via the tested due-at helpers; localDate/localHour stored, never recomputed at read; adapter tests pin a ±offset case each |
| Payload growth (NWS hourly ~158 KB/vineyard/refresh) | LOW | LOW | Under the 8 MB cap; ~13 vineyards × 4 potential refreshes/day; usage metered |
| Chart squashed in the modal | LOW | LOW | `maxWidth ≈ 720` matched to the viewBox (the agent's explicit warning — no chart-in-modal precedent exists) |
| Modal keyboard access | MED | LOW | Cards wired as buttons in Unit 5; the shared Modal's missing focus trap stays a known repo-wide gap (out of scope, noted) |
| Deploy regression | LOW | HIGH | No vercel.json change this time; still: watch the MERGE COMMIT's Vercel status (the #516 lesson) |

## Success Criteria

- [ ] Clicking (or keyboard-activating) any of the 7 day cards opens the modal for that day
- [ ] The modal graphs that vineyard-local day's hourly temperature (line) and rainfall (bars) in
      the vineyard's units — Open-Meteo per-hour bars, NWS native bucket-width bars
- [ ] Threshold reference lines render, and a frost/heat day visibly shows the crossing hour
- [ ] Day 6–7 modals carry the lower-confidence label; empty hourly days say so honestly
- [ ] No provider fetch on modal open (stored rows only); on-view >6 h refresh keeps them fresh
- [ ] Drag-select inside the modal never dismisses it (#310 guard, inherited); Escape closes
- [ ] `verify:weather` hourly leg green; tenant-isolation +1 table; `verify:ai-native` green via
      the query_climate wire; goldens pass; both 096 regression-gate test files byte-unmodified
- [ ] Merge commit's Vercel deploy `success` (checked, not assumed)
