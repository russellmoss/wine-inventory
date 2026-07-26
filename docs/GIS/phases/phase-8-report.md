---
title: Release 4A — Weather & Climate spine (P8) — build report
type: report
status: built (unmerged)
date: 2026-07-25
plan: docs/GIS/phases/phase-8-weather-climate-spine-plan.md
council: docs/GIS/phases/phase-8-council-feedback.md
branch: claude/distracted-edison-bcf259
---

# P8 Weather & Climate spine — build report

Built end-to-end in one session, on top of the council-reconciled plan (R1–R16). Verified with **real live
provider data** (Russian River Ranch + Bhutan) and a deterministic fixture gate. The whole vertical slice —
providers → ingest → read composition → assistant tool → grower card — is proven.

## Gate table

| Gate | Result |
|---|---|
| `prisma migrate deploy` (owner, prod) | ✅ applied `20260725150000_weather_schema` (bumped past parallel P3/P4 slices); RLS `DO $$` guard passed |
| `verify:tenant-isolation` | ✅ ALL ISOLATION CHECKS PASSED |
| `verify:ai-native` | ✅ every core reachable / internal (ingest + alert INTERNAL; read + source-selection via query_climate) |
| `verify:weather` (DB e2e, fixture) | ✅ 12/12 — known GDD, obs-shift, no-fabrication, spread, provenance |
| weather unit tests | ✅ 46/46 across 7 files (obs-time, math, selection, providers, card, alert, contract) |
| `query_climate` golden | ✅ 4 cases added; `REQUIRED_READ_TOOL_NAMES` updated |
| Browser QA (Demo, localhost) | ✅ card renders real data server-side (HTTP 200 authed) |

## Measurements (real data)

- **Ingest** (Russian River Ranch, season Apr–Jul 2026): 344 rows across gridMET (4km) + RCC-ACIS station +
  NASA POWER (50km), ~4.7s via the sweep. Primary auto-resolved to **"Santa Rosa Sonoma Co AP" (3.1 km, 18 m)**.
- **Read composition**: season-to-date GDD **656.5** (primary station), Winkler **I**, GST **18.42 °C "Warm"**,
  3 days ≥35 °C, 12.18 mm rain. **3-source spread 499.66–656.5 GDD** (the 50 km global grid reads cooler than
  the 4 km grid + station) — the "spread not blend" story, live.
- **Obs-time shift is visible**: the AM-obs station series starts a day earlier than the grids (Tmax→date−1).
- **`query_climate`**: `frostLastNight` correctly returned `not_in_yet` with the R9 freshness fallback (refused
  to infer a frost from missing data); the tool answered in the **operating tz** (America/New_York), not the
  viewer tz — operating-tz-beats-viewer (#473).
- **Bhutan**: NASA POWER only → `GLOBAL_COARSE`, never a blank.

## What shipped (Units 1–11)

1. Schema slice — `vineyard_climate_daily` (authoritative fact table) + `vineyard_weather_config` (1:1) +
   `weather_provider_usage` (daily key) + `vineyard.weatherAutoRefresh`. String unions, numeric CHECKs, RLS.
2. Provider registry + 6 adapters (gridMET via ACIS grid 21, RCC-ACIS station, NASA POWER, USGS EPQS live;
   Daymet + NOAA CDO fixture-tested) + obs-time-core + SSRF-guarded fetch.
3. Source selection + read-time gap-fill + spread (never blend).
4. Climate math: GDD (cap-the-average), Winkler, GST/Jones, vulnerable-window frost, heat, rainfall, season/SeasonYear.
5. Ingest (fetch outside tx, chunked bulk upsert, no fabrication).
6. Sweep + `weather-poll` cron.
7. Daily-keyed usage/quota.
8. `query_climate` read tool + read-core composition.
9. Frost/heat alert detection (pure).
10. Grower climate card + one nav entry (vineyard-root).
11. `verify:weather` + contract tests.

## Follow-ons (small, flagged not hidden)

- **Alert inbox emit**: detection is done + tested; the actual push to the notification core is stubbed in
  `sweep.ts` pending the notification-core API wiring.
- **Explicit weather case in `scripts/verify-tenant-isolation.ts`**: RLS is proven three ways (migration
  guard, smoke read, the general harness) but a dedicated 3-table case would match the P2 pattern exactly.
- **gridMET RH** (rmax/rmin): ACIS grid 21 doesn't expose it — a direct-gridMET adapter is the Later plug-in
  (needed for 4B disease inputs).
- **Doc weave**: brief §13/§14 + runbook ledger flip to reflect P8 built.
- **Merge**: this is the schema-slice-first lane — Unit 1's migration is already applied to prod; the code PR
  should land after P3/P4's slices settle.
