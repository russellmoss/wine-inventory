# NOW

> The working-set spine. The ONE file that answers "where was I?" on resume.
> Long-horizon lives in `ROADMAP.md`; parked ideas in `TODOS.md`; decisions in the
> context-ledger. This file is only **today / in-flight**. Keep it short — if it grows
> past a screen, something belongs in TODOS.md or the roadmap instead.

## 🎯 Current objective  (ONE thing)

**SPRAY INTELLIGENCE — Wave 1 LANDING: S0 complete · S2 built · S3a SHIPPED · S4 built.
S3a's record cores are MERGED (2026-07-26) -> Wave 2 (S7a · S8 · S6 · S7b) can start.**

🟩 **S0 (lane A — the weather-lane spike): COMPLETE. Gate answered, and S1 is NARROWED.**
[report](docs/spray_assistant/phases/S0-report.md) · [QA](docs/spray_assistant/qa/S0-qa-report.md) ·
ADR [0011](docs/architecture/decisions/0011-hourly-weather-retention-and-replay.md) (retention/replay) +
[0012](docs/architecture/decisions/0012-leaf-wetness-estimator-bands-and-refusal.md) (LWD bands/refusal).
No production code, as scoped. 11 units, 100 committed fixtures (566,400 site-hours), 28 goldens,
800 fixture assertions, 7 defects found and fixed.

⛔ **The two-arm gate DID NOT PASS and the pre-committed no-go TRIGGERED — the deliverable is the
narrowing.** Arm B (input validation, the arm council C1 added because Arm A can pass on correlated
error) splits **by regime, cleanly and physically**: dew-point-depression MAE vs station is
**1.22 °C Stoney Hill / 1.72 °C Monticello VA** but **3.18 °C Russian River / 5.07 °C Madera**, against
a 1.85 °C tolerance = half CART's own 3.7 °C node. Both failures are regimes that are **sub-grid at
25 km** (marine-layer boundary, irrigated valley floor). **Two live Demo sites are in the failing set.**
→ **Build S1 for eastern sites on fixed-model reanalysis; California needs station-blending first.**

⚠️ **Five findings that change other lanes — do NOT re-derive:**
1. **The irreversibility is in FORECAST, not OBSERVED** — the reverse of the plan's premise. Observed
   hourly IS backfillable (NCEI ISD + keyless IEM ASOS, past 2005) and the NWS live window is **7 days**,
   not 1–2. What's unrecoverable is *what the forecast said when a grower acted on it*. Also: **REANALYSIS
   is revisable**, so a stored copy can drift from the live archive — a replay hazard nobody had named.
2. **Archive model choice moves 50.6% of infection-event classifications** (`era5` vs Open-Meteo
   `default`). "Best match" is unusable for anything replayed. **ERA5-Land carries NO wind at any site** —
   and wind is a **hard input to the S7b legality gate**, not just a CART input.
3. **Brief §7's pathogen table is materially wrong → S5b's scope GROWS.** Botrytis (Broome 1995) and
   phomopsis (Erincik 2003) ARE LWD × temperature models. ⚠️ Both papers are **paywalled**, so S0 could
   only run coarsened renderings that carried **no gate weight** — S5b must obtain them.
4. **Madera inverted its own purpose**: lowest refusal rate in the set (0.6%) and the worst inputs
   (5.07 °C). Confidence keyed on input **availability** reports its highest value exactly where the
   answer is least trustworthy → the band must carry **provider-vs-station agreement**.
5. **S4 must collect a per-block `canopyManagement` OBSERVATION with a timestamp** (not a static
   attribute — an August decision must ask what the canopy was in July). Liftable paragraph in
   [s0-lwd-estimator-decision.md](docs/spray_assistant/phases/s0-lwd-estimator-decision.md) §4.

⚠️ **Two things still Russell's**: (a) accept the two-zone canopy model (S0 recommends yes — cheap now,
expensive to retrofit, and the one-zone version is anatomically wrong); (b) **how long must a lot's
residue flag stay explicable?** — the one input to ADR 0011 that is inferred rather than stated.

🟩 **S3a (lane C — spray record + planned harvest): SHIPPED.** PR1 [#523](https://github.com/russellmoss/wine-inventory/pull/523) + PR2 [#524](https://github.com/russellmoss/wine-inventory/pull/524) merged; PR3 [#527](https://github.com/russellmoss/wine-inventory/pull/527) **browser-QA'd GREEN** same day (2 findings — area provenance + correction datetime shift — found, fixed `d11c38d8`, re-proven). QA report: `docs/spray_assistant/qa/S3a-qa-report.md`.

🟩 **S2 (registration + resistance master): ALL 12 UNITS BUILT, 3 PRs.**
[PR-1 #522 MERGED](https://github.com/russellmoss/wine-inventory/pull/522) (schema slice, 8 GLOBAL
models + the CHECKs/partial-uniques that make the safety rules uninsertable) ·
[PR-2 #525](https://github.com/russellmoss/wine-inventory/pull/525) **CI green, awaiting merge**
(reg-number gate, APPRIL parse+ingest, lookup service, CA DPR layer, restrictions, source toggle) ·
**PR-3 open** (resistance derivation + coverage report, monthly re-derivation, `verify:pesticide` +
8 boundary guards + PEST-1/PEST-2 invariants).
**Live data in prod tables:** 2,420 active grape registrations · 833 CA-registered on grapes ·
361 AIs with **zero unclassified** (35 CODED / 1 NO_CODE_EXISTS / 325 GAP; fungicide-scoped 153 →
35/1/117). Golden proofs: Switch **9+12** (never 9 alone), Pristine 7+11, captan M 04/MULTI,
Gavel + Fusilade both CA-registered on `GRAPES, WINE`.
⚠️ **Zampro resolves GAP, not 45/40** — plan 086's measured free-source miss, now VISIBLE in the
coverage report rather than silently wrong. Closing it is a Cornell purchase decision;
`biologicalsShareOfGap: 59` is the number to decide against.
⚠️ **The plan's grape regex had a hole** — `/\bGrapes?\b(?!fruit)/` matches "Grape-Ivy" (hyphen is a
word boundary). Fixed + tested. ⚠️ **`exceljs` cannot read the APPRIL dump at all** (fails on the
zip's data-descriptor entries) → unzip-entry + SAX is the primary path (366k rows, ~15 s, ~134 MB).
Cross-lane: the composite `factsAsOf` shape is FROZEN in
[S2-S3a-factsAsOf-contract.md](docs/spray_assistant/phases/S2-S3a-factsAsOf-contract.md) — **S3a
consumes it, does not re-derive it.**
QA: [S2-qa-report.md](docs/spray_assistant/qa/S2-qa-report.md) — one row deferred (the settings-card
click-through needs the main checkout + a user login).

🟩 **S4 (lane D — phenology + growth): SHIPPED. Merged, live on Vercel, browser QA GREEN.**
[plan v2](docs/spray_assistant/phases/S4-phenology-growth-model-plan.md) ·
[council](docs/spray_assistant/phases/S4-council-feedback.md) ·
[QA report](docs/spray_assistant/qa/S4-qa-report.md) ·
[phase report](docs/spray_assistant/phases/S4-report.md).
**PR 1 (schema slice) = [#521](https://github.com/russellmoss/wine-inventory/pull/521), MERGED**,
migrations live in the DB. **PR 2 (Units 3–10, the feature)** on
`claude/s4-phenology-feature-e9b928`. 135 new tests; full suite 4386 pass / 0 fail; `verify:phenology`
24/24; `verify:tenant-isolation`, `verify:naming` (before AND after), `verify:ai-native` (no new tool,
no allowlist entry) all green. Lane boundary held **mechanically** — zero files touched under
`src/lib/{weather,spray,pesticide}`, and the two weather regression tests pass byte-unmodified.
The five council findings that had to survive the build all did: the **STAGNANT leaf-expansion tail**
(a stagnant tip still dilutes at day 7 — v1 would have reported a diluted canopy as fully protected),
**biofix-anchored GDD** (two Bhutan goldens: a February bud break, and accumulation past Oct 31),
**bands never yield a point rate** (range or unknown; the ≥10 cm answer stays exact),
**`undefined` ≠ `false` ≠ `0`** through all five projections (which also fixed a *pre-existing*
`diseasePestSpotted: false` bug), and **`NOT_ASSESSED` ≠ `NONE` ≠ `null`** as a contract test.

✅ **The QA gate closed.** The blocker was not the RLS theory it was first written up as: `field-notes/page.tsx` was the only one of the four vineyard pages gating on a raw `role === "admin"` instead of `isTenantAdminLike` (which already treats a developer as admin-like), so a developer got the admin view on harvest/maps/weather but the manager empty state on field notes. One-line fix in [#529](https://github.com/russellmoss/wine-inventory/pull/529). Browser QA then ran clean: the stage gate fires in all three states (no stage / FRUIT_SET / VERAISON), `shootLengthCm: 0` + `hedgedThisWeek: false` + `clusterDamage: NOT_ASSESSED` all survived UI → action → DB, read-back renders the gap and the clean result as two different sentences in two different tones, bulk-apply refused to copy damage, and mobile 375×812 has no overflow with every control ≥36 px.

📉 **Recorded because it is unflattering, not despite it:** the rolling-4-week scouting coverage —
S5b's sour-rot gate input — is **0/0**. No live block reached `FRUIT_SET` in the window, so the
denominator is EMPTY. **That is "not yet measurable", NOT 0 % and NOT a failed gate**; runbook §9 S5b
now says so explicitly. Re-run `npm run verify:phenology` when S5b is planned.

🏛️ **COUNCIL RE-SHAPED THE PROGRAM** — [RUNBOOK-council-feedback.md](docs/spray_assistant/RUNBOOK-council-feedback.md)
(Codex structure/data-layer + Gemini domain/liability; 10 CRITICAL, 11 SHOULD-FIX, 1 pushed back).
Three genuine defects in the first draft: **(1)** no phase produced the rainfast/mobility/PHI/REI
facts that S6+S7 gates REQUIRE → **new S2b product-facts master** (curated top-60 AIs = 86.5% of
occurrences, free sources; Russell chose curated over buying CDMS/Agrian); **(2)** the dependency
graph was WRONG — S7 secretly needed hourly weather (sulfur×temp, copper×slow-dry) and phenology
(fruit-present), S5 needed S4 (3-10 rule wants shoots ≥10cm) → **split S7→S7a/S7b and S5→S5a/S5b**;
**(3)** one hourly table conflated OBSERVED/FORECAST/REANALYSIS → `seriesKind` + a contract test that
a forecast row can never satisfy a historical read. ⚡ **Russell's call: front-load the deterministic
engine** — Wave 2 now ships legality+rotation (S7a) + the lot-residue moat (S8) + daily powdery
(S5a) with **ZERO dependency on hourly weather**; speculative modeling moves to Wave 3.
⛔ **Best catch (Gemini C8), previously missed entirely: PHI is not a one-time gate.** Plan Oct-10
pick → spray 14-day-PHI Sept 20 (legal) → pull pick to Sept 30 = **retroactive violation, fruit
unsellable, system silent**. Any harvest-date mutation must re-evaluate the trailing PHI window.
⛔ **C6, promoted to CRITICAL: rule "gap→unknown→refuse" + a US-only registry BRICKS the live Bhutan
tenant.** Non-US manual product-facts path is now standing rule §3.9 (same mechanism serves the US
tenant-override case). Other folded: adjuvants invisible to interlocks (captan+organosilicone);
`driedBeforeRain` must be DERIVED not self-reported; protection output is CATEGORICAL not a % (false
precision); wind speed+**direction** distinct columns (CA PUR); facts-as-of snapshot on every spray
(else a monthly refresh silently rewrites past decisions); entitlement moves tool→service layer
(S9/S10 are server components, they'd bypass it); LWD blind to canopy architecture + needs a grower
"calibrate wetness" override; **sour rot CUT** (needs berry-wound + vinegar-fly telemetry we don't
collect → new rule §3.7 "a model may not depend on data the system does not collect"). Export MRLs →
Later, documented. QA safety cases 17→**23**.
New program folder `docs/spray_assistant/` (mirrors `docs/GIS/`):
[SPRAY_ASSISTANT_RUNBOOK.md](docs/spray_assistant/SPRAY_ASSISTANT_RUNBOOK.md) (phases, waves, gates,
ledger) · [discovery brief](docs/spray_assistant/spray-decision-discovery-brief.md) (domain +
honesty + math contracts) · [data-sources design](docs/spray_assistant/spray-data-sources-design.md) ·
[qa/QA-PROTOCOL.md](docs/spray_assistant/qa/QA-PROTOCOL.md) (**standing in-browser gate after EVERY
phase, 15 program-wide safety cases**) · `phases/README.md` (artifact naming + lifecycle).

Goal: a grower talks to the assistant about a spray decision and gets an **inspectable decision
record** — risk, current protection, hard stops, legal windows, application window, and what we
don't know. S0–S11 + SKB in 5 waves, **4 file-disjoint parallel lanes in Wave 1 and 4 in Wave 2**.

📋 **Spray RECORD + PLAN are in scope and are the spine — S3a/S3b, Wave 1 lane C** (Russell asked
2026-07-26). S6/S7/S8 and half of S9 all read the record, so **S3a lands as its own PR and opens
Wave 2; S3b (season program) follows and blocks nothing.** Field inventory transcribed from the real
`docs/spray orders/Spray work order template.xlsx` into brief §17.3 — it is **header + 3 line
tables** (header / materials+REI+PHI / mixing order / per-block acres+times+tanks), and the
**header-line split is load-bearing**: Phase 20 needs "enter once, attribute to N blocks", the
residual model needs per-block facts, compliance keys off the pass. ⚠️ **A plan is intent, NEVER
evidence** — a planned application must never deplete a residual, satisfy a rotation, start a PHI
clock, or enter a compliance record; enforce by TYPE separation, not a boolean (a flag gets read
wrong silently). ⚠️ **ROADMAP Phase 20's note that the template "omits REI + applicator license" is
half wrong** — REI (F7) and PHI (G7) ARE there; only applicator license (+ target pest, weather at
application) is missing. Phase 20 keeps cost/equipment (tractor, rig, gear, tanks/gal, labor, PUR)
and becomes an authoring surface over S3a's row, never a second table.

⛔ **Three findings that shape everything — do NOT re-derive:**
1. **We have NO humidity, NO dew point, NO hourly data, NO leaf wetness.** `VineyardClimateDaily`'s
   `rhMaxPct`/`rhMinPct` are plumbed end-to-end and **every provider writes null** (all 5 declare
   `capabilities:["tmax","tmin","precip"]`; gridMET-via-ACIS grid 21 has no `rmax`/`rmin`). Every
   pathogen model except temperature-only Gubler-Thomas is currently unbuildable. **S0/S1 is the unlock.**
2. **The cheap win:** `forecast-nws.ts` ALREADY calls `/gridpoints/{o}/{x},{y}` for QPF — that same
   response carries **hourly `relativeHumidity`, `dewpoint`, `temperature`** (verified live). One
   parse away from the CART leaf-wetness inputs. Open-Meteo `hourly=` covers non-US + ERA5-Land history.
3. **Structured label values (rates/PHI/REI) are NOT freely machine-readable** — PPLS gives metadata
   + a PDF link; CDMS/Agrian sell the structured layer. Registration + resistance ARE free (EPA
   APPRIL + CA DPR + UC IPM derivation). This is why plan 086 deferred label extraction, correctly.

🔗 **Absorbs [plan 086](docs/plans/2026-07-20-086-feat-us-pesticide-registration-plan.md)** (→ S2 + seeds S3)
and **supersedes VI runbook P9** (weather disease → S5); S0 resolves P9's own "spike an hourly source"
decision gate. Adjacent-not-absorbed: ROADMAP Phase 20 owns the spray *work order*; S3 owns the *record*
it will write — draw that line in S3's plan so we don't build two tables.

<details><summary>✅ PLAN 097 — HOURLY forecast modal (SHIPPED + LIVE #520, 2026-07-26)</summary>

**PLAN 097 — HOURLY forecast modal: SHIPPED + LIVE ([#520](https://github.com/russellmoss/wine-inventory/pull/520) → `4bae9ab6`, deploy success, 2026-07-26).**
Tap a day card → modal graphing that day's hourly temp line + rain bars (NATIVE interval width —
OM per-hour, NWS 3/6h QPF buckets), frost/heat threshold reference lines (crossing hour visible +
in words: "reaches 95 °F around 4 PM"), site-local hours, now-marker, °F/°C per vineyard.
`vineyard_forecast_hourly` (isolation 148 tables) replaced in the same ingest tx; assistant
answers "what time will it freeze tonight?" (crossingTimes). ⚠️ **The modal SELF-HEALS missing
hourly rows** (refresh-once-on-open — Russell's live find on Stoney Hill; a fresh daily forecast
never trips the on-view refresh). Plan `docs/plans/2026-07-26-097-…` (completed). Live proofs:
Madera "reaches 95 °F ~4 PM"; Stoney Hill 1.66 in incl. a real past-midnight bucket; Paro monsoon
rain 13:00–20:00.
</details>

<details><summary>✅ PLAN 096 — Weather forecast + rainfall: ALL 5 PHASES SHIPPED + LIVE IN PROD (2026-07-26)</summary>

**PLAN 096 — Weather forecast + rainfall time-series: ALL 5 PHASES SHIPPED + LIVE IN PROD (2026-07-26, deploy `bcd70e29` success).**
PRs [#514](https://github.com/russellmoss/wine-inventory/pull/514) (P0 foundations) ·
[#515](https://github.com/russellmoss/wine-inventory/pull/515) (P1 rainfall) ·
[#516](https://github.com/russellmoss/wine-inventory/pull/516) (P2 forecast) ·
[#517](https://github.com/russellmoss/wine-inventory/pull/517) (P3 warnings+notifications) ·
[#518](https://github.com/russellmoss/wine-inventory/pull/518) (P4 observability+goldens) ·
[#519](https://github.com/russellmoss/wine-inventory/pull/519) (**deploy fix: the `10 */6` cron
failed EVERY prod deploy from #516 — Vercel Hobby rejects sub-daily crons at DEPLOY time, invisible
to CI/local build; forecast cron is DAILY 15:10 UTC, on-view refresh >6h carries intra-day
freshness; restore 6-hourly only on Pro**). Plan `docs/plans/2026-07-26-096-…` (completed) ·
council `council-feedback-096-…` (Codex+Gemini, 13 folded, 1 refuted). **The forecast strip sits at
the TOP of /vineyards/weather** (Russell: most actionable info first). 7-day NWS (US) / Open-Meteo
(Bhutan, elevation-downscaled to the true site), tiered frost/heat badges + claim-first digest
notifications to all members + all-clears, official NWS banner verbatim, rainfall bars+cumulative
with a 30d/7d/custom range that works in January (year-round ingest, 13,152 rows seeded).
⚠️ Standing gotchas: ONE site-local "today" (site-time-core — never re-add a UTC today);
delete-horizon-then-insert is what "replace" means for forecasts; ai-native's coverage doc goes
stale on ANY core-export change (`verify:ai-native -- --write` before push — it failed #517's CI once).
</details>

<details><summary>✅ Vineyard Intelligence P3 — NDVI DISPLAY (SHIPPED + LIVE #498, 2026-07-26)</summary>

All 11 units, reviewed (4 specialists) + fixed. Plan `docs/GIS/phases/phase-3-ndvi-display-plan.md` (completed) · report
`phase-3-report.md`. ⚠️ **The P3 plan + council files were LOST (never saved) — reconstructed from memory at build time.**
</details>

<details><summary>✅ Vineyard Intelligence P3 — NDVI display (viz half) — SHIPPED + LIVE 2026-07-26 (#498)</summary>

Schema (`SpatialDatasetDerivative` + `SpatialStyle`, RLS applied to live DB, `verify:tenant-isolation` 141 tables) ·
`warp.ts` UTM→north-up-3857 (council #1, **sub-pixel registration test is the merge gate**) · `resolveDomain` +
min-spread clamp (#4) · NDVI value histogram · Int16×10000/−32768 derivative cache (#6, idempotent claim-first) ·
serving route (zero-dep `node:zlib` PNG + ETag/must-revalidate #7) · `SatelliteMap` raster arm · map UI (6 modes,
palette, legend+badges) · locked-domain side-by-side comparison + saved styles · `compare_ndvi_dates` tool.
- **Proven:** registration gate (synthetic + real fixture), `verify:ndvi-display` 20/20, `verify:ndvi`/`ai-native`
  green, 103 gis tests, tsc+eslint clean. Browser-QA'd Demo Winery (`qa_ndvi_display_vy`): overlay registers on
  block outlines, modes re-domain live, nearest→pixelated, styles apply, 2-date locked comparison renders.
- ⚠️ **Gotchas:** (1) UTM raster on a 3857 basemap misregisters ~10 m — **WARP first**, only the registration test
  catches it; (2) `SpatialStyle` SYSTEM uniqueness needs PARTIAL indexes (Postgres NULL ≠ NULL); (3) `@vercel/blob`
  now needs `allowOverwrite:true` for deterministic-key idempotent writes (latent P2 bug, fixed); (4) Leaflet
  `imageOverlay.getElement()` is null before onAdd — set `image-rendering` AFTER `addTo(map)`.
- **Deferred (documented):** pixel B−A diff MAP (per-block delta ships via the tool); analytical 3×3 stored
  smoothing; polygon-exact display clip (v1 = estate AOI masked to valid pixels); TENANT-scope styles.
</details>

**⚡ P4 soil (Wave 1 lane B) — ✅ BUILT + LIVE-QA'd on `feat/vi-p4-soil`, PR #502 MERGING (2026-07-26).**
All 9 units committed (8 feat commits + planning). Migration `20260725140000_soil_snapshot` **applied to prod**
(additive, Bhutan untouched). Gates: tsc 0, **vitest 4024/0**, **`verify:soil` 23/23** (e2e DB, injected SDA),
`verify:tenant-isolation` (+soil RLS), `verify:invariants` 39/39 (SOIL-1), `verify:ai-native`, `verify:naming` 25/25.
**Live browser QA PASSED** (in-app pane, Demo): pulled a real Finger Lakes block through the UI → live NRCS →
6 soil cards (Mardin 39% pH 6.6, Volusia 26%, Valois 18%…) + "Other (4 slivers <1%)" with Water folded+retained,
100% covered, survey NY123; DB read-back matched (9 comps, geodesic areaSqM 912,832). Plan:
[phase-4-soil-documentation-plan.md](docs/GIS/phases/phase-4-soil-documentation-plan.md) · council (11 findings folded):
[phase-4-council-feedback.md](docs/GIS/phases/phase-4-council-feedback.md).
✅ **SOIL MAP OVERLAY ADDED (2026-07-26)** — the deferred Wave-4 item, de-risked by a live geom spike (clipped
`STIntersection.Reduce.STAsText` = ~10 KB/block). Best-effort 3rd SDA call stores block-clipped display
geometry (`displayGeometry` column, migration `20260726120000`); pure WKT→GeoJSON + per-map-unit **colored
vector overlays via P1's `overlays` prop (ZERO SatelliteMap-internals change)**; **"Soil layer" toggle + color
legend on `/vineyards/maps`**. Live browser QA: toggling painted **18 soil polygons inside the block** (paths 1→19),
Water in a distinct blue, legend "39% Mardin / 26% Volusia / …". `verify:soil` 24/24 (+geometry stored, EMPTY
dropped); 30 overlay unit tests. ⚠️ QA fixture "QA-Soil Overlay Vineyard" left in Demo for viewing — clean up after.

▶️ **PR OPEN → [#502](https://github.com/russellmoss/wine-inventory/pull/502)** (soil docs + map overlay + click-panel + labels). Merged `main` (P3 #498) in. Post-merge + follow-on gates green (vitest **4060/0**, verify:soil 25/25, invariants/ai-native/tenant-isolation).
✅ **SOIL AUTO-PULLED FOR EVERY US VINEYARD BLOCK (2026-07-26).** Soil was on-demand only → most US vineyards
were empty. Now a `runSoilSweep` (idempotent `pullBlockSoil` per block: cached no-op/non-US skip/missing pull,
capped per run) + daily cron `/api/cron/soil-sweep` (CRON_SECRET, mirrors ndvi-poll) + `npm run backfill:soil`.
Backfill ran: **all 13 Demo US blocks now have soil** (WV Oregon, Oakville, RRR…); Bhutan's 5 skipped (non-US).
✅ **TWO MAP PAGES FOLDED INTO ONE "Map Explorer" at `/vineyards/maps` (2026-07-26).** The old NDVI console
(`/vineyards/ndvi`) + block-summary map merged into a single layer-stack explorer: blocks + NDVI + soil,
toggle + reorder + click-inspect. **The map now renders even with no NDVI scene** (NDVI is one optional layer)
so a soil-only vineyard still gets a map. `/vineyards/ndvi` → permanent redirect (links/bookmarks/assistant
navigate keep working); single nav entry; old `MapsClient` modal retired (block details + soil cards still on
`/reference`). Live QA: /maps=explorer, /ndvi redirects, RRR shows NDVI+soil, no-scene vineyard shows map+soil.
✅ **SOIL LAYER ON THE NDVI MAP (2026-07-26)** — `NdviMapPanel` now stacks NDVI + soil via a `MapLayerControl`
(per-layer visibility toggle + up/down reorder, top-of-map-first) → ordered `overlays` painted bottom→top.
**Live QA on Russian River Ranch: NDVI raster + soil polygons render together** (labels FaD/HtC/GdE), toggle
each on/off, reorder flips the stack (verified NDVI↔Soil top swap), click a polygon → tabbed panel. The user's
"don't see it" was because soil was only on `/vineyards/maps`, not the `/vineyards/ndvi` page — now fixed there.
✅ **CLICK-TO-INSPECT + LABELS ADDED** — click a soil polygon → tabbed detail panel (Overview/Chemistry/Physical/Source via `Tabs`); map-unit symbol (`musym`, e.g. "MdB") fetched+stored per unit and painted centered in each polygon (permanent center tooltip). `SatelliteMap` extended additively (`onOverlayFeatureClick` + overlay `label`) — no fork. **Live QA: labels render (62B/68B/152B/77B… centered in polygons); click-panel is code+unit-test verified** but the flaky in-app pane unmounts the modal between JS calls so the live click screenshot couldn't be captured (user can click it). ⚠️ QA fixture "QA-Soil Overlay Vineyard" + dev server left up for viewing — clean up after.
⚠️ Shares `prisma/schema.prisma` + the shared prisma CLIENT
with the parallel P3/P8 lanes — **`prisma generate` gets clobbered by their generates; regenerate right before any
tsc/verify/dev-server run.** P3 display migrations (`..._ndvi_display_*`) are already in prod but not on this branch (fine).

<details><summary>✅ VI P8 — Weather & Climate spine — SHIPPED + LIVE to main (#500–#511, 2026-07-26)</summary>

`docs/GIS/phases/phase-8-weather-climate-spine-plan.md` (BUILT) · report `phase-8-report.md`. **All merged + live in prod.**
**Migration `20260725150000_weather_schema` is APPLIED to prod**
(bumped past the parallel P3 `ndvi_display` + P4 `soil_snapshot` slices already in the DB).

**Post-spine follow-ons shipped (all live):**
- **Station/source selector + clickable Leaflet station map** (#504) — grower picks which station reports.
- **Winkler long-term normal (10/20-yr selectable) + WSU-style cumulative GDD chart** (#505–#508) — °F, base 50°F,
  April–Oct, 5 comparison lines (longterm/cool/hot/last/current), interactive crosshair scrub + zoom (±/pinch/drag-pan).
- **#509 — "No tenant context" fix**: server actions now wrap ingest in `runAsTenant()` (`requireTenant()` helper);
  dataless-primary fallback in `read-core` + `selectPrimaryCore` skips completeness-0 stations (Madera read 0 → fixed).
- **#510 — non-US vineyards (Bhutan) get weather**: `resolveVineyardCentroid` fallback chain adds the grower's **GPS pin**
  (`VineyardDetail.gpsLat/gpsLng`); `backfill-core` uses **NASA POWER** (global, keyless) where gridMET has no coverage.
  Manually primed 7 of 8 Bhutan vineyards (Gelephu has no pin yet).
- **#511 — durable sweep auto-prime**: the daily cron (`/api/cron/weather-poll`, 15:40 UTC) now enumerates ALL active
  vineyards and primes any located-but-empty one (current season + 20yr backfill + `weatherAutoRefresh` on), capped 30/run.
  ➡️ **Gelephu will self-populate on the next cron run once its GPS pin lands** — no manual step needed.

**Proven with REAL live data** (Russian River Ranch + Bhutan) + a deterministic fixture gate:
- 3 tenant tables (fact-table `vineyard_climate_daily` + 1:1 `vineyard_weather_config` + daily-keyed
  `weather_provider_usage`); 6-provider registry (gridMET-via-ACIS, RCC-ACIS station, NASA POWER, USGS EPQS
  LIVE; Daymet+CDO fixture-tested); ingest (344 rows/4.7s, obs-shift visible); `query_climate` tool (R9
  freshness fallback + operating-tz-beats-viewer both proven live); grower card (browser-rendered real data:
  GDD 656.5, Winkler I, GST 18.42 Warm, **3-source spread 499–656**).
- Gates: `verify:weather` 12/12, `verify:tenant-isolation` ✓, `verify:ai-native` ✓, 46 weather unit tests, +4 goldens.
- ⚠️ **Isolated worktree Prisma client** (copied @prisma into worktree + generated) so DB/dev-server work here
  never touched the P4 session's main-checkout client. `.env` copied into worktree (gitignored).

**Follow-ons (small):** alert INBOX EMIT stubbed (detection done); explicit weather case in
`verify-tenant-isolation.ts`; gridMET RH needs a direct adapter (4B); doc weave (brief §13/§14 + runbook
ledger); **merge the code PR after P3/P4 slices settle** (Unit 1 migration already in prod).
</details>

<details><summary>✅ Vineyard Intelligence P2 — NDVI core (data half) — SHIPPED + LIVE IN PROD 2026-07-25</summary>

All 11 units merged: schema slice **[#495](https://github.com/russellmoss/wine-inventory/pull/495)** + feature units
**[#496](https://github.com/russellmoss/wine-inventory/pull/496)** (squash-merged to main; prod deploy `B6D8Lm9H` success).
Plan `docs/GIS/phases/phase-2-ndvi-core-plan.md` (completed) · report `phase-2-report.md`.

- 5 tenant-scoped tables (`spatial_scene`/`spatial_dataset`/`spatial_analysis_job`/`block_spatial_metric`/`cdse_usage_counter`)
  + `vineyard.ndviAutoAdd`; `geotiff.js` decoder (bit-exact vs P0 tifffile); C1 idempotent-materialization outbox;
  block metrics (mask gate + Y-FLIP + 0.5 floor); sweep+cron (DARK auto-add); quota; `process_ndvi`/`query_ndvi_stats`
  assistant tools; thin console `/vineyards/ndvi`.
- **PROVEN via `verify:ndvi` (DB e2e) + TWO browser-QA passes** (Claude-in-Chrome, Demo login): per-block NDVI means land
  in the DB (0.591/0.768/0.670; live Oakville 0.443 in UTM 10N), full provenance, C1 idempotency, WITHHELD/low-coverage.
- ⚠️ **NEW gotchas (see [[vineyard-intelligence-p2-plan]]):** (1) CDSE non-square pixels → `buildProcessRequest` snaps UTM
  bbox to 10 m; (2) the Y-FLIP (`rasterRow = H-1-gridRow`); (3) the adopt path must persist COMPLETED to the JOB ROW,
  not just return it (browser QA caught the IN_FLIGHT leak — `verify:ndvi` now asserts the row); (4) console all-access =
  `isTenantAdminLike` (admin OR developer), not `role==="admin"`; (5) scripts driving the adapter need `--conditions=react-server`.
</details>

<details><summary>Grower module → Vendor parity (plan 095, #489) — SHIPPED (PR #493, live in prod)</summary>

<details><summary>Grower module → Vendor parity (plan 095, #489) — SHIPPED (PR #493, live in prod)</summary>

Third-party growers auto-link to a QBO-synced Vendor, estate growers don't. Schema + 2 migrations, write core,
`create_grower` tool, `/setup/growers` UI, isolation cases. ⚠️ Deploy was blocked ~20h by a PRE-EXISTING
`.vercelignore` bug (shipped `scripts/` not `test/`) — see [[vercelignore-scripts-test-build-break]]. **CI green ≠
Vercel build green when `.vercelignore` strips files.**
</details>

<details><summary>Vineyard Intelligence P0 — GO verdict (done, unshipped)</summary>

**P0 COMPLETE — VERDICT: GO on the no-worker architecture.** All 16 units on
`spike/vi-p0-no-worker` (pushed, **no PR yet**). Runbook §7 ledger flipped to 🟩.
[ADR 0009](docs/architecture/decisions/0009-vineyard-intelligence-no-worker-architecture.md) ·
[phase report](docs/GIS/phases/phase-0-report.md). 3891 tests green.

At realistic scale (~50 ha, 20 blocks): **390 ms** compute, **451 MB** peak RSS, against
pre-committed limits of 5000 ms / 512 MB. Clipping sub-quadratic in vertices (10×→5.3×), nearly flat
in blocks (10×→1.5×). Coverage validated **cell-by-cell** vs `exactextract` (292 cells, max 2.95e-8,
every non-zero diff explained by the ORACLE's float32). Live scene: 342×342 px, 767 KB, 2153 ms,
0.892 PU, 80.8% valid, block NDVI means 0.281–0.709.

⛔ **Five things not to re-derive** (all now corrected in runbook rule §2.13 itself):
1. **`harmonizeValues` is BACKWARDS.** Baseline guard is `units:"REFLECTANCE"`; the flag only clamps
   negatives, and clamping fabricates `NDVI = 1.0`. Pin it **false**.
2. **Baseline is NOT in the Process API** — needs a CDSE **STAC** `processing:version` call.
3. **`resx:10` under CRS84 = 10 DEGREES** → "3504.23 m/px exceeds 1500". Needs a METRIC CRS.
4. **SCL must be `DN`**, in a `units` ARRAY parallel to `bands`. Two input objects → "Dataset with
   id: 1 not found".
5. **Weighted type-7 quantiles IGNORE their weights** (median 50.5 for `[1×9, 100×1]`). Pinned the
   midpoint form instead.

⚠️ **Constraint is MEMORY, not time** — 451/512 MB. Scale-register tripwire at 400 MB or ~2M px.
⚠️ Free tier binds on **REQUESTS** (10k/mo), not PU → one estate-wide raster, clipped N ways.
Dev-only Python tools: `pip install exactextract numpy tifffile`. Runtime deps 22→23 (`proj4` only).

▶️ **NEXT:** `/review` then `/ship` the P0 branch (16 units, no PR yet). Then Wave 1 opens:
**P1 planting geometry ⚡ P4 soil cards ⚡ POF offline** — P4 and POF never depended on this verdict.

✅ **P1 SHIPPED TO PR — [#494](https://github.com/russellmoss/wine-inventory/pull/494) open (branch merged w/ main, CI running). Runbook §7 → 🟪 QA.**
[phase-1 plan](docs/GIS/phases/phase-1-planting-geometry-plan.md) · [council](docs/GIS/phases/phase-1-council-feedback.md) ·
[phase report](docs/GIS/phases/phase-1-report.md). tsc 0, **172 GIS/assistant tests green**,
**`verify:planting-geometry` 13/13** on the real Demo tenant (create→blade-split zero-lost-area→IoU
version→migration byte-identical), `verify:tenant-isolation` + `verify:ai-native` green. Additive migration
`20260724120000_planting_geometry` APPLIED to prod (new tables + nullable cols; Bhutan untouched).
✅ **Browser QA PASSED** (2026-07-24, via Claude-in-Chrome on the user's real browser — the in-app browser
refuses the HTTP localhost origin here). Russian River Ranch: migration proposed **2 separate plantings**
(not bridged), confirmed all-or-nothing → 2 DERIVED areas + yellow boundary overlay + migrated badge;
assistant answered structure Q&A. ⚠️ **RRR is now migrated in Demo (real QA write)** — revert available. ⚠️ **`next dev` regenerated a STALE Prisma client** (dropped
the new models, tsc 0→60) — stop the dev server before `prisma generate`; regen after adding models.
⚠️ **Standing P2 obligation:** warn-only topology means P2 must RE-VALIDATE the mask before NDVI stats.
Council changed two architecture calls before any code:
1. **Boolean geometry kernel = `jsts`, NOT `polyclip-ts`.** Recentring to UTM fixes OUR arithmetic but NOT
   the martinez family's internal coincident-edge failure P0 rejected — it's a precision-model problem, not
   a coordinate-scale one. JSTS `GeometryPrecisionReducer` + `OverlayNG` + native line-splitter.
2. **Split = true line-split ("blade"), NOT buffer-and-corridor.** Corridor-difference destroyed the shared
   row-middle boundary and minted a permanent gap = unassigned area. Blade produces adjacent blocks sharing a
   mathematically identical edge, zero lost area.
Russell's four decisions: **JSTS** · **IoU-gated versioning** (IoU>0.98 = trace correction in place, no stale
cascade; ≤0.98 = new version + mark stale) · **all-or-nothing per-vineyard migration** (`Vineyard.plantingMigratedAt`
gate) · **warn-only topology** (chose the non-recommended option — saves never blocked; **consequence: P2 must
re-validate the mask before computing stats**, carried to the P2 plan + registers).
Also folded: pinned+persisted canonicalization anchor in the fingerprint (else the same shape hashes two ways);
version-bump concurrency = subject row-lock + partial-unique on the open row + stale-write guard; migration
pre-flight topology (never silently heal overlaps, strict <1 m grouping so it can't bridge a road); area shown
as "Productive area" (spacing) primary + "Boundary footprint" (geodesic) secondary.
▶️ **NEXT:** browser-QA `/vineyards/planting-setup` on Demo (user logs in), then `/review` + `/ship` the branch (schema-slice commit can be its own PR). P2 (NDVI core) unblocks once P1 lands.

<details><summary>Planning + council + repo cleanup (done)</summary>

**Vineyard Intelligence P0 — plan 094 WRITTEN + COUNCIL-REVIEWED, not yet built.**
Plan: [2026-07-24-094-…](docs/plans/2026-07-24-094-spike-vineyard-intelligence-p0-plan.md) (16 units).
Council: [council-feedback-094](docs/plans/council-feedback-094-vineyard-intelligence-p0.md).
P0 is the Wave-0 solo gate — `P1←P0`, `P2←P0+P1` — proving or killing the **no-worker** architecture.

Both reviewers **confirmed** the load-bearing claim (fractional coverage is polygon ∩ *convex* rect,
so hand-rolled Sutherland–Hodgman is exact, zero deps) and both said the first draft's *instrument*
would have blessed a wrong architecture. Six structural fixes folded in; Russell chose all three
recommended options (add `proj4` for the spike · estate-wide fetch · prove the canvas paint in P0).

⛔ **Five things not to re-derive:**
1. **`harmonizeValues` does the OPPOSITE of what runbook §2.13 says.** In REFLECTANCE units the BOA
   offset is applied *regardless*; the flag only clamps negatives to zero → clamped `B04=0` yields a
   fabricated `NDVI = 1.0`. Real guard = pin `units: "REFLECTANCE"` + `harmonizeValues: **false**`.
   **Runbook §2.13 + §5 need correcting (Unit 15).**
2. **The processing baseline is NOT in the Process API response.** `inputMetadata.serviceVersion` is
   Sentinel Hub's service version, not the ESA baseline. Use the CDSE **STAC** `processing:version`.
3. **Free tier binds on REQUESTS (10k/mo), not PU** — a 50 ha request is ~0.038 PU. Per-block fetching
   burns 50 requests per look; **one estate-wide raster = 1 request**. Hence the fetch-shape decision.
4. **S-H exactness has a ULP precondition.** Clipping must *assign* the exact edge scalar
   (`intersect.x = pixel_max_x`), never lerp it — else U-shape bridges stop cancelling and area leaks
   **silently**. And Unit 1 must *reject* self-touching/self-intersecting rings: signed area is
   algebraic, not geometric, for those.
5. **`polyclip-ts` is the WRONG fallback** (was in the first draft). `setPrecision` is process-global
   with never-reset snap trees, 3–5× slower when set, and a *larger* epsilon can make failures worse.
   Fallback is **`jsts`** (real `PrecisionModel` + snap-rounding).

✅ **Unit 0 credentials CLEARED + verified live (2026-07-24).** CDSE `client_credentials` grant works
(~0.6–1.2 s); 📌 **`expires_in = 1800 s` (30 min)**, confirmed against the JWT `exp − iat` — CDSE does
not document this, so it is a measured fact, and Unit 10's 120 s skew is 6.7% of it.
`BLOB_READ_WRITE_TOKEN` already existed in Vercel (store connected 9 d ago) and was pulled into local
`.env` append-only after a `.env.bak-<ts>` backup (47 → 48 vars). 🎯 **The research's one UNVERIFIED
item is now CONFIRMED: private blob + `Range` → HTTP 206** (put 464 ms, ranged GET 4 B in 327 ms, probe
deleted) — so a range-indexed raster layout on Blob is viable and Unit 12 shrinks to latency only.

✅ **Unit 0 fully CLEARED (2026-07-24).** Three commits on `claude/vineyard-intelligence-phase-defad5`,
**not yet pushed / no PR**:
`931595b0` docs/GIS tracked · `eb09ecf8` plan 094 + council · `7a5647ea` proj4.
`npm ci` restored this worktree (688 pkgs; leaflet/@geoman-io/@turf/polyclip-ts/@types/geojson were in
the lockfile but absent from disk). `proj4@2.20.9` + `@types/proj4` added — round-trip error **0.00 mm
(UTM 18N) / 1.46e-6 mm (UTM 46N)**, and recentring headroom measured at **ULP 1.57e-10 m @ 705 km
easting vs ~2.2e-14 m recentred** (the ~4 digits Unit 2 claims). `tsc --noEmit` clean;
**3,660 tests green**, 0 failures.

⚠️ **`docs/GIS/` was committed to THIS BRANCH, not `main`** — the main checkout is in **DETACHED HEAD**
at `6082be2a` (a commit there would dangle), and `main` is checked out in the
`virginia-fruit-ipm-knowledge-8ba0f8` worktree. The detached HEAD is pre-existing and worth fixing.
Also: `.env.bak-20260724-081051` holds secrets — gitignored, delete when comfortable.

▶️ **NEXT:** push + PR the three commits, then `/work` the plan. P4 (soil) and POF (offline) do **not**
depend on P0's verdict and can start anytime.

</details>

</details>

<details><summary>Previous objective — /bug-triage merged-sweep fix (done, live on main)</summary>

**`/bug-triage` re-offered SHIPPED code as new work — FIXED and LIVE on `main` ([PR #478](https://github.com/russellmoss/wine-inventory/pull/478), squash `0b649b74`).**
New **Merged Sweep** phase + boilerplate-plan-issue detection. `.claude/workflows/` is outside the
auto-fix fence, so #478 took an owner merge rather than the automation.
⚠️ **A worktree only picks this up on a fresh checkout** — sibling worktrees still carry the OLD
`bug-triage.js`. Run `/bug-triage` from a checkout at `origin/main`.

</details>

<details><summary>Previous objective — PLAN 091 voice pronunciation (done, in prod)</summary>

**PLAN 091 — voice pronunciation. DONE. #464 RESOLVED, in prod (#474 + #477, squash `b2dcd70e`).**
Russell's verdict on the phoneme build: "WAY better than what we had."
Plan: [2026-07-23-091-…](docs/plans/2026-07-23-091-feat-voice-pronunciation-lexicon-plan.md).
Audit: [docs/kb-eval/pronunciation-lexicon-audit.md](docs/kb-eval/pronunciation-lexicon-audit.md).

Landed: TTS switched to `eleven_flash_v2` (honours inline `<phoneme>` tags, **same ~75ms**
as v2_5, English-only which this app already is); 11 CMU-Arpabet phoneme rules + the
EC-1118 expansion; the matcher, the miner, and the rejected screen as a negative result.
3,653 tests green.

⛔ **Three things not to re-derive:**
1. **`eleven_flash_v2_5` SILENTLY IGNORES phoneme tags.** Accepts them, changes nothing,
   no error. Plan 091 ruled phonemes out on this basis and wrongly assumed any model
   change cost latency — it doesn't, and that mistake cost a whole wasted build round.
2. **The TTS→STT screen does NOT work, structurally.** STT outputs the word you MEANT
   regardless of pronunciation — exactly the signal being measured. It passed Syrah and
   Saccharomyces (both wrong) and flagged a correct `cellar` as *seller*. Ear only.
3. **A model switch re-rolls EVERY word, not just tagged ones.** `bâtonnage` had no rule,
   passed on v2_5, regressed on v2. Re-listen to the whole batch after a model change.

▶️ **NEXT — Pronunciation Settings (Russell asked for it, not yet planned).** Type a word,
record yourself saying it, pick the matching playback; developer entries global, tenant
overrides on top (mirror `KnowledgeSource` — resolve globals at READ time, do NOT copy
into tenants, or you repeat the SYSTEM_TEMPLATES gap). Speech→phoneme is the risky step:
propose candidates, let the ear confirm. Also: `toSpeakable` runs client-side too, so
per-tenant rules mean moving lexicon application into the speak route only.

</details>

🟩 **S5a (lane C — powdery index + latent-infection ledger): LEDGER BUILT AND VERIFIED; the index is
a NO-GO.** [phase report](docs/spray_assistant/phases/S5a-report.md)
[probe report](docs/spray_assistant/phases/S5a-diurnal-fidelity-probe.md) ·
[plan v2](docs/spray_assistant/phases/S5a-powdery-index-latent-ledger-plan.md) ·
[council](docs/spray_assistant/phases/S5a-council-feedback.md)

⛔ **The pre-committed no-go TRIGGERED again — all 8 sites failed.** Gubler-Thomas point deltas were
scored from Felber et al. 2018 reconstructions against **genuine station hourly METAR** (IEM ASOS,
6 seasons/site, Wilson CIs), not ERA5 — council C2's methodological fix. The failure is **structural,
not tuning**, on four independent lines: a sawtooth control performs as well as the calibrated model;
our sites violate its shape assumptions *far less* than the sites it was calibrated on (0.2–1.4% vs
Felber's own 27%); consecutive-hours-in-band MAE is **2.2–3.4 h against a rule thresholded at 6 h**;
and Savalkar's monthly-station-statistics mitigation lifted no station-oracle site (it made Stoney
Hill *worse*) because that >75% error reduction was for a smooth accumulator and this is a
narrow-window threshold counter — plan §1.2 confirmed by measurement.

**The error runs in the crop-loss direction:** G1 unsafe-miss breaches its 2% bar at six of eight
sites, worst **13.6% at Madera** — the same site S0 flagged for reporting its highest confidence on
its worst inputs. **Unlike ADR 0012 there is no regime split to narrow to:** the best oracle in the
fleet (Russian River, 3.7 km) scored *worse* than a 9.8 km one.

→ **S5a ships the LEDGER ONLY. The powdery index moves to S5b behind S1, which is now load-bearing
for powdery mildew and not only for leaf wetness.** Units 3–4 (`diurnal-core`, `powdery-core`) do
not ship as a risk engine.

✅ **The ledger is BUILT, migrated to prod, and verified.** Units 1, 2, 5, 6, 7, 8, 9, 10, 11 all
landed: `latent_infection_event` (append-only, RLS, 7 CHECKs), the resolution rules, the read seam,
`query_spray_decision` **thin + hard-refusing** (first `SPRAY_CONTRIBUTORS` entry), 26 unit tests,
and **`verify:latent-infection` — 43 assertions green against the live DB**. `verify:invariants`
49/49, `verify:tenant-isolation` green incl. 6 new cases, `verify:ai-native` green, build green.

⚠️ **The append-only trap, worth remembering repo-wide:** `GRANT SELECT, INSERT` does NOT make a
table append-only — `ALTER DEFAULT PRIVILEGES` already granted `app_rls` full DML on every new
table, so a narrow GRANT changes nothing. It needs an explicit **`REVOKE UPDATE, DELETE, TRUNCATE`**.
Caught only by test-applying the migration to a disposable Neon branch; `prisma validate` checks the
Prisma schema, not the SQL. See [[append-only-needs-revoke-not-grant]].

✅ **Bhutan's 8–9 °C weather gap — ESCALATED FROM S5a AND NOW FIXED (PR #536).** It was elevation,
and it was resolvable. NASA POWER publishes the elevation of the grid cell it answers with
(`geometry.coordinates[2]`) and the adapter was discarding it: **Bajo's cell sits at 3,038 m against
a vineyard at 1,229 m.** Re-sampling ERA5 at POWER's own cell elevation collapsed the bias from
**−9.71 °C to +1.80 °C** across all 8 sites at a 4.7–6.1 °C/km lapse rate. Two parts, because either
alone would be wrong: an **ERA5 archive provider passing `elevation=`** (POWER rows are deliberately
NOT lapse-corrected at ingest — that would put a derived number in a column contracted as "the
SINGLE source of this row"), plus **`source-fidelity-core`**, which WITHHOLDS hard-boundary
classifications when the source's own reported elevation is >300 m off the site, while still
rendering the raw series, GDD and GST. Winkler classes are ~278 °C-days wide — 1 °C moves the label,
so there is no "approximately right" region. Live: Bajo Region I "too cool" + fabricated April
frosts → **Region V "very hot", 0 frosts**; three sites that read identically are now distinct.
`nasa_power` rows kept as a second source, so it is reversible. **The guard proved itself
mid-backfill** — Open-Meteo 429'd on Paro, ingest fell back to POWER, and the card withheld Paro's
classifications instead of showing the old wrong ones.
⚠️ **This does NOT reopen S5a's index NO-GO** — Bhutan was `consistency_only` tier, the gate is
per-site and never averaged, and the six US sites failed independently against genuine station METAR.
🪝 **Left alone, found in passing:** Gortshalu / Lingmethang / Norzinthang have NO forecast rows at
all (`vineyard_forecast_daily` empty for them). Separate issue.


## 🔭 Also in flight

**SPRAY INTELLIGENCE S3a (lane C) — plan written + council-reconciled, READY FOR `/work`
(2026-07-26).** Branch `claude/s3a-spray-application-record-2572f2`. The spray application record
(header + material / mixing-order / block lines) + planned harvest date as an audited event stream.
**Blocks Wave 2** (S7a, S8, S6, S7b, S9). Plan:
[phases/S3a-spray-record-plan.md](docs/spray_assistant/phases/S3a-spray-record-plan.md) · council:
[phases/S3a-council-feedback.md](docs/spray_assistant/phases/S3a-council-feedback.md).
3 PRs: schema slice first → domain cores (**this is what unblocks Wave 2**; the UI is NOT on the
critical path) → minimal surface + QA. Council reversed one decision: **a correction COPIES the
facts snapshot, never re-resolves it** (re-resolving would repaint a July spray with November's
registration data — rule §3.8). Open for Russell: D1 canonical-metric storage for a US regulatory
record · D2 assistant allowlist tier · D3 the 24 h segment-gap threshold.
⚠️ Three sibling lanes are planning concurrently — `prisma/schema.prisma` and the runbook ledger are
shared; schema slices serialize.

**PLAN 090 — UNITS 1-10 DONE (18 commits, NOT pushed). RE-INDEX COMPLETE (606 docs), DIFF JUDGED.**
Plan: [2026-07-22-090-…](docs/plans/2026-07-22-090-fix-kb-rag-retrieval-quality-plan.md).
Verdict: [docs/kb-eval/DIFF-090.md](docs/kb-eval/DIFF-090.md). `verify:knowledge-base` **21/0**.

**IVES Technical Reviews — LIVE and MERGED (#465).** 209 docs / 3,316 chunks, default-ON for both
tenants, **209/209 dated (100%)** vs ~31% corpus-wide. Default-on is the MEASURED position: staged
`false` → crawled → enabled for Demo alone → `verify:kb-register` vs the pre-IVES baseline →
**4/120 slots moved (3%, cap 25%)**, 17 of 20 questions untouched. Baseline re-captured so the
accepted state is the new reference.

⛔ **The licensing ADR (0009) is DECLINED — Russell, 2026-07-22. Do NOT re-propose it.** Facts live in
each `KnowledgeSource.license`. IVES is the ONLY source with a real CC BY grant; every other rests on
an absence of objection. VT asserts copyright with no licence (accepted risk).

⚠️ **Two bugs their smoke test caught while reporting `5 docs / 70 chunks / 0 errors` — read the rows
back, never trust the tally:** `indexDocument` writes `publishedAt`/`canonicalTitle` **unconditionally
including null** (so all 209 would have been undated — fixed by re-applying OAI metadata AFTER
indexing), and an OAI record carries one `<dc:title>` **per language**, so first-match filed English
articles under German titles.

🔗 **Their filed-not-fixed breadcrumb issue is the SAME defect plan 090 fixes**, and their note that
"fixing the code does NOT fix the corpus — it needs a re-crawl per source" is exactly right. Plan 090
supplies that re-crawl (`npm run reindex:knowledge`) and has now run it across **all 1,378 PDF
documents**. IVES itself is HTML, so it is NOT covered by that pass and still carries the polluted
title — it needs the same treatment.

✅ **On the three re-indexed sources (osu-owri, wbi, lvwo):** avg breadcrumbs **1.00 → 3.0/3.6/20.1**;
avg max breadcrumb **200 → 71/84/108** chars (worst anywhere = 140, the cap, exactly); titles
**0/606 → 606/606**; dates **~5/606 → 606/606**; mojibake **7 docs → 0**; **0 HTML docs disturbed**
(exactly what `deriveIndexHash(…, isPdf)` was designed to guarantee).

🎯 **The masthead is dead.** On "best nutrients to add to Pinot noir fermentation" the 2015 newsletter
masthead fell **rank 1 → 7**; rank 1 is now real data ("194 samples… alpha-amino acid content"); dates
went 2/8 → 7/8. All 9 moved queries judged individually; both rejection cases still reject.

🔻 **MY ROOT CAUSE WAS HALF WRONG, and this is the part to remember.** I recorded the nutrient gap as
"OWRI PDFs dominate via the 192-char prefix". That explains the MASTHEAD and nothing else. **AWRI is not
in the TOP 40 for that phrasing — zero AWRI passages in 40.** It was never being crowded out of the last
slot; it is nowhere near contention. The same doc ranks **#1** on "ideal YAN concentration for a white
must". The gap is **VOCABULARY** (nutrient vs "Yeast Assimilable Nitrogen"), needs synonym expansion or
query rewriting, and **does not belong to plan 090**. The eval case's `knownFailing` note now says so.

🔄 **IN FLIGHT: re-index of the remaining 790 PDF docs** (awri 424, wine-australia 228, cornell 64,
wsu 38, chambre-gironde 17, vt-enology 7, icvv 5, incavi/scott-labs 2, mapa/enartis/laffort 1).
`--pdf-only` (HTML index hashes are unchanged by plan 090, so re-fetching them can only reach
"unchanged" after a wasted round trip). Resume with the SAME command — `--stale-before` makes it cheap.

⚠️ **A PARALLEL SESSION IS WORKING THE SAME SUBSYSTEM AND THE SAME PRODUCTION CORPUS.**
Branch `claude/kb-paraphrase-citation-copyright-355aa9` shipped **IVES Technical Reviews live and
default-on** (209 docs / 3,316 chunks, 100% dated, first seen 16:27 on 2026-07-22). 8 commits, unpushed.
- ✅ My Unit 10 verdict is UNAFFECTED — IVES appears **zero** times in `snapshot.json`, so it never
  reached top-8 on any of the 20 eval queries. That was luck, not design.
- 🔻 **THE REAL COUPLING IS TWO BASELINE FILES, NOT CODE.** Source overlap is only `NOW.md` +
  `package.json`. But they maintain `docs/kb-register-baseline.json` and I maintain
  `docs/kb-eval/snapshot.json`, and BOTH are stale the moment the 790-run lands. Re-capture **both
  together, after the corpus stops moving** — re-capturing one leaves the other reporting permanent
  drift, which is exactly how a gate teaches people to ignore it.
- 🔎 **The two instruments are COMPLEMENTARY, keep both.** Theirs (`verify:kb-register`) is a CI GATE on
  publisher-slot occupancy with a hard 25% cap — deliberately coarse because "which publisher won a slot
  is an objective fact". Mine (`kb:snapshot`) is an EVIDENCE artifact at document/rank granularity,
  deliberately NOT gated because a movement is not automatically a regression. We independently found
  the SAME defect in `verify-knowledge-base.ts` (it scores recall, never inspects the other slots).
  👉 **Durable fix: ONE `npm run kb:baseline` that captures both**, or the forgotten one rots.
- 📥 **Handoff owed to me:** their filed-not-fixed "chunk breadcrumbs carry the polluted HTML title" is
  MY layer. My 140-char cap bounds it but does not fix a wrong-but-short title — the real fix is
  ordering: their metadata correction must land BEFORE chunking inside `indexDocument`.
- **Recommended order:** push/open their PR now → let the 790-run finish → re-capture BOTH baselines in
  one commit → merge both → add `kb:baseline`.

⏭️ **NEXT — and the residual junk proves the fix works:** every remaining bad passage in the top-8 (AWRI
copyright page, Scott Labs handbook masthead) is from a source **not yet re-indexed**. Extend the
re-index to the other ~798 PDF docs (awri, scott-labs, cornell-grapes, wine-australia, wsu, icvv,
incavi, mapa, chambre-gironde, laffort, enartis, vt-enology-notes). Then Unit 11 (deferred decisions),
then AJEV.

🐛 **Two small real bugs in the new code, filed not fixed:** running headers that vary slightly per page
slip past `dropRunningHeaders`; an extensionless filename stem ("VitEnoTechNwsltr-mar2016-Danielle
Fianl") slipped past `cleanPdfTitle`.

🔎 **ROOT CAUSE: `chunkMarkdown` is heading-driven but `extractPdf` emits headingless text.** So for
**893 PDF documents / 11,051 chunks (42% of the corpus)** the section breadcrumb degenerates to the
first ~192 chars of page one — `chunk.ts:36-90` builds it from a heading stack that stays empty, and
`chunk.ts:130` prepends it into `text`, which is embedded AND backs the GENERATED `search_vector`. A
query matching that slab matches **every chunk of that document equally**, on the prefix alone.

Measured (Neon, 2026-07-22): corpus **26,253 chunks / 3,120 docs / 22 sources**. PDFs avg
`sectionPath` **192 chars** vs HTML **96**. `publishedAt` present on **14% of PDFs**;
`canonicalTitle` NULL on **95% of ALL docs** → `citation.ts` renders a bare publisher name with no
document title. Ligature mojibake (`NewsleƩer`) is real but small: **113 chunks / 7 docs**.

🔻 **Three of my own estimates were wrong, and measurement caught each.** The suspected VA coverage
hole does not exist (AWRI's VA page is excellent — enzymatic / Cash-still / HPLC as separate
passages, and it's HTML so its breadcrumbs survive). Ligature damage was ~6% of my guess. And
`mmr.ts` is NOT buggy — the "duplicate chunks" were the shared 192-char prefix. **Do not
re-investigate MMR.**

⚠️ **The eval suite is green through all of this** — `verify-knowledge-base.ts` only asserts "expected
doc in top-k + facts present", so it sees 3 of 8 slots. On the *passing* YAN control case, 4 of 8
returned passages are junk (a copyright page, a website announcement, an off-topic VT passage).
**Unit 1 is the ranked-snapshot instrument; nothing else may land before the baseline is captured.**

⛔ **AJEV import is DEFERRED, not dropped** — research is preserved in the plan's Scope Boundaries
(full OA since 2025-01-01 under CC BY 4.0, stock-Drupal robots with `Crawl-delay: 7`, ~150 OA papers
growing ~55/yr, pre-2025 paywalled). Do not re-research it. Rejected in passing: an AI relevance
gate (deletes the explanatory layer; false negatives are invisible) and AI-written summary chunks
(`topK=6` is a fixed slot budget, so "in addition to" is false in retrieval, and it breaks the
citation contract).

_(Backlog was cleared 2026-07-21 by a full `/bug-triage` run: 26 → 0 active, 18 issues → 10 kept,
one real bug found and fixed (#324) + a `beforeSend` dev-noise filter (#456). ⚠️ A **Sentry-side
inbound filter** is still Russell's to add — #456 drops events only after they're sent and counted.)_

⛔ **MSU (`msu-grapes`) stays DORMANT — do not retry.** Imperva refuses this crawler from every
network available. `npm run verify:msu` is the probe: if it ever reports **live PASS**, un-dormant
both flags + re-seed.

## 🔭 Also in flight

**PLAN 086 — US pesticide registration + resistance-group coverage. ABSORBED INTO SPRAY INTELLIGENCE
(2026-07-26) — do not work it standalone.** Units 1–3, 5–7, 9, 11 → **S2**; Unit 10 (spray record) seeds
**S3**; Unit 8 (assistant tool) → **S11** so the program ships ONE composite tool, not two. Its Key
Decisions, measured Unit-4 de-risk, and Risks tables carry over verbatim — read it before planning S2/S3.
See [SPRAY_ASSISTANT_RUNBOOK.md](docs/spray_assistant/SPRAY_ASSISTANT_RUNBOOK.md) §2.
Plan: [2026-07-20-086-…](docs/plans/2026-07-20-086-feat-us-pesticide-registration-plan.md) (Deep, 11 units).
Numbered 086 because this session's 085 collided with the MSU plan above — `ls docs/plans/` was
checked and came back clean, but their file was still branch-only. **The check is only sound against
`git log --all`, not the working tree.**

Answers three questions the app cannot answer today: is a product legally registered on grapes in
my state, what resistance group is it, and does my spray history actually rotate modes of action.
**No spray-application record exists** — `FieldNote.spraysApplied` is a JSON array of names with no
date, rate, or product identity. Building from zero.

- **Registration data goes in RELATIONAL TABLES, not the embedding corpus.** "Is X registered on
  grapes in CA" is a `WHERE` clause, not a similarity search. Avoids +12,500 chunks and sidesteps
  **`knowledge_chunk.embedding` having NO ANN index** (zero `hnsw`/`ivfflat` in any migration — every
  dense query is a seq scan; scale-register tripwire ~10k chunks). EPA still registers as a
  `KnowledgeSource` row purely to borrow the shipped per-tenant toggle + citation plumbing.
- ⚠️ **Do NOT ingest label PDFs via `extractPdf`.** `chunk.ts:140-145` only guarantees markdown
  pipe-tables are never split; `extract/pdf.ts` emits no pipes and no headings, so a label becomes ONE
  segment. A dose row (`Grapes 14 2 56 14`) separates from its headers ~40-45% of the time, with
  **zero overlap** — `tailForOverlap` splits on `[.!?]` and numeric runs have none. Synthesize tables.
- ⚠️ **Licensing.** FRAC and HRAC both reserve commercial use ("may not be… stored in a retrieval
  system"). Codes are DERIVED from extension sources already in the corpus, each row cited.
- 🔎 **Unit 4 de-risked (measured):** UC IPM vs Cornell Table 3.2.1 = 6/14 match, **2/14 systematic
  conflict on multi-site compounds** (Cornell `N/A` vs UC IPM `M 04` — both right, different
  questions), 6/14 miss (4 biologicals). So `siteType` must be modeled separately from the code, and
  a trade-name→code join from an AI-keyed source is UNSAFE (`Switch` sits under `cyprodinil (9)` but
  is 9/12 — a naive join silently drops a mode of action).
- **Phase 2 deferred:** rate/PHI/REI label extraction. Most of the effort, nearly all the liability.
  Also blocked on a **planned** harvest date — `HarvestPick.pickDate` is actual-only.

**PLAN 087 — Cornell Fruit Resources. SUPERSEDED, do not work it.** The source shipped instead via
#411 (a parallel session had already built it) reconciled onto main as #424. The plan file describes
a Unit 1 date-normalizer that no longer applies — main's seam now does strict ISO -> non-ISO salvage
-> month-name -> label-anchored body scan, plus PDF metadata dates. Cornell's reference pages did
land undated as the plan predicted (71/95 dated), but the PDFs carry real dates (64/64) so the
sitemap-lastmod recovery it proposed was never needed.
⚠️ Cornell's Pest Management Guidelines remain **paid + unreachable**, so this does NOT close 086's
biologicals gap.

**PLAN 082 — assistant vineyard/block coverage. SHIPPED (#397, `12e330f2`), plan file `status:
completed`.** The entry above was stale — it said "PR NOT YET OPENED" when the work had merged at
11:30 UTC and the branch was deleted. (Same trap the footer warns about; caught by `gh pr list`.)
Residual follow-ups flagged AT MERGE and not obviously closed since — leave here until confirmed:

- ⚠️ **Not verified at merge:** the `runAsTenant` DB read-back for U6, the LLM half of the evals
  (needs an API key; the 3 new cases had no pre-change baseline), and browser QA on Demo.
- 🔎 **`Vessel` has the identical create/edit drift** (5 cooperage fields update-only for no recorded
  reason) — labelled `UNDECIDED_DRIFT`, left unchanged, → TODOS.
- ⚠️ **Open product question:** block/vineyard elevation inherits the form's `min: 0`, refusing real
  sub-sea-level sites (Death Valley, Dead Sea). Preserved rather than changed.


**Plan 080 is fully merged** — Waves 1-4 all landed (#351, #376, #392, #395). What it left behind
is two decisions that are Russell's, not code:

- ⛔ **Phantom-stock unwind NOT APPLIED.** `scripts/unwind-phantom-opening-stock.ts` dry-runs
  clean with **6 real candidates, one of them in `org_bhutan_wine_co` (PRODUCTION)**. The script
  was corrected to unwind the SPECIFIC phantom lot rather than take a FIFO draw (#396). Running
  `--apply` is Russell's call, not an agent's.
- 💰 **Accountant sign-off still pending** on the Wave 3 category→GL account map before go-live.
  Also flagged there: an unmapped GL account now ROLLS THE APPLY BACK (it used to book the goods
  anyway). Scoped by `reasonCode`, so A/P-less tenants are unaffected.
- ⚠️ **ONE DATABASE.** `.env` and prod are the SAME Neon instance, holding the real Bhutan
  tenant. Every migration plan 080 deployed is already live.

## 🧵 Tangent stack  (LIFO — push when you detour, pop when done)

0. ✅ **POPPED 2026-07-27 — both PRs MERGED, PNW Handbooks is chunked + embedded + gated in the KB.**
   [#544](https://github.com/russellmoss/wine-inventory/pull/544) (chunker fix) +
   [#545](https://github.com/russellmoss/wine-inventory/pull/545) (PNW source) both merged to main.
   **59 documents / 142 chunks live**, KB-1-audited clean (2 table-shaped pages correctly refused at
   ingest, 0 stored chunks, confirmed not a leak). Both Unit 11 gates passed: displacement 0/120
   slots changed (`verify:kb-register`), cross-region 0/40 PNW passages leaked into Bhutan on
   generic queries with no subscription row. `defaultEnabled: false` globally; enabled for **Demo
   Winery only** via one subscription row — same staged shape as `ives-technical-reviews`.
   🎯 **ONE DECISION LEFT for Russell: flip `defaultEnabled: true` globally (Bhutan included), or
   leave it Demo-only?** Both required gates are clean, so the plan's own criteria are satisfied —
   but flipping exposes the live Bhutan tenant to Oregon-specific extension content for the first
   time, which is a product call about a real customer, not a technical one, so it was left explicit
   rather than auto-flipped.
   ⚠️ **Merging #544 has a cost side effect**: `CHUNKER_VERSION` is folded into `deriveIndexHash`
   unconditionally, so the monthly sweep now progressively re-indexes (and re-embeds) every document
   it re-fetches. That is the repair mechanism working as designed, but it is real embedding spend.
   🔴 **~630 of 3,299 corpus documents are corrupted — about one in five.** Measured read-only by
   re-fetch + byte diff (Unit 3): heuristic candidates 44/64 confirmed (69%), random NON-candidates
   **16/90 confirmed (18.2%, 95% CI ±8.1pp)** → ~590 more across the 3,235 unflagged, CI ~330–850.
   **The heuristic had ~7% recall**, so the stale set is effectively the whole corpus — which
   retires the plan's original "re-index only the confirmed" scoping and vindicates council C3.
   Confirmed in 13 of 14 candidate sources: `uc-ipm` herbicide table `0.5 → 5`, `awri` `15.5 → 5`,
   `cornell-grapes` Wilcox guide `4.0 → 0`, `wsu` VEEN `0.0005 → 0005`.
   Shipped: `splitIntoSentences` (lossless scanner, boundary rule deliberately unchanged);
   `findDroppedNumericTokens` wired into `indexDocument` as a fail-closed `skipped:"numeric-loss"`;
   `deriveIndexHash` moved to a payload object with **`CHUNKER_VERSION` folded in unconditionally**
   (so the monthly sweep now progressively repairs every document it re-fetches) and
   `rawContentHash` documented as RAW bytes, never filtered HTML. 19 new tests, full suite
   **395 files / 4,696 tests / 0 failures**, tsc clean, lint 0 errors.
   ⚠️ **NOT run: the repair campaign** (~630 docs re-fetched + re-embedded = real spend + a live
   corpus mutation). Needs Russell's go-ahead. Also still open: PR B + PR C, both blocked on the
   SKB/KB-1 merge.
   Prior state: **RECON + PLAN + COUNCIL DONE; 5 design questions answered by Russell 2026-07-27
   ("accept all recommendations").**
   [plan 099](docs/plans/2026-07-26-100-fix-kb-text-integrity-and-pnw-handbooks-plan.md) (12 units,
   4 PRs) · [council](docs/plans/council-feedback-100-kb-text-integrity-pnw-handbooks.md).
   🔴 **The headline is no longer the ingestion — it is a LIVE silent text-loss bug in our own
   chunker.** `splitBySentences` (`src/lib/knowledge/chunk.ts:115`) uses `String.match(/g)` with a
   regex that cannot match a decimal point, and `match(/g)` **SKIPS** unmatched spans instead of
   failing: `"abc. 0.5 def"` → `["abc. ", "5 def"]`. The `0.` is deleted with no error.
   `tailForOverlap` (:131) shares the regex, so overlap tails carry the loss too. Fires on any block
   over `MAX_TOKENS` (700) that force-splits. Live result in EM 8413: `0.5–1 lb ai` indexed as
   `5–1 lb ai` — **a citable 10× dose error in a pesticide guide.** Root-caused from first
   principles; Defuddle is exonerated. Council's Gemini arm made the severity point sharply: a
   corrupted rate is often *agronomically plausible* (5 lb/A of sulfur is normal; 5 lb/A of a Group 3
   DMI is catastrophic and illegal), so nobody catches it — the citation makes it look authoritative.
   🔴 **Second architectural find: the KB-1 gate reads the WHOLE raw page** (`index-documents.ts:106`)
   while the section filter does not run until :190 — so an enforcing gate drops a PNW disease page
   **wholesale, biology and all**, before the filter can strip `Chemical control`. Council's Codex arm
   gave a better fix than the plan's (keep the gate where it is; make the filter a **pure projection**
   feeding it; one centralized clear path) **and** caught that the idempotency hash must stay a
   fingerprint of the **raw** bytes — hashing filtered HTML makes changes inside dropped sections
   invisible forever.
   🔴 **Third: Gemini changed a design decision.** Stripping the whole `Chemical control` section
   discards the fungicide **resistance-management prose** (FRAC 3/11 resistance documented in OR/WA;
   alternate groups; ≤2 sprays per group) — tier B, and the best content on the page. The cut must be
   **block-level within** the section: keep the `<p>` preambles, drop the `<ul>`/`<table>` product rows.
   Same applies to `Biological`/`Cultural control`, which also name products.
   Also corrected: the cross-region test was designed backwards — MMR contaminates **generic** queries,
   not regional ones, because `mmrSelect(…, 0.7)` actively rewards dissimilarity.
   Original recon (measured, do not re-litigate):
   • **EM 8413 IS ALREADY IN THE CORPUS AND IT IS A DEFECT, NOT A WIN.** `osu-extension` doc
   `/catalog/em-8413-…`, 47 chunks. Its rate tables are **Airtable `<iframe>` embeds** (3) — the
   substance never arrived, only the empty tag got indexed (chunks 4, 14). 2 raw `<table>` blobs
   survived Defuddle unconverted → chunks 7–9 + 16–23 are raw `<td headers="table-cell-413816-…">`
   garbage. **Numeric corruption in a pesticide-rate document**: `0.5–1 lb ai` indexed as `5–1 lb ai`,
   `0.5 lb ai` → `5 lb ai`, `0.5 inch` → `5 inch` (leading `0.` eaten, markdown ordered-list read).
   That is a citable 10× dose error. Mojibake `Temperature (В°C)`. `publishedAt` = **2014-12-18** while
   the page links the **2026** PDF → freshness scoring believes an annually-revised safety document is
   12 years old. The real content is the PDF
   (`/sites/extd8/files/documents/donnelja/pest-management-guide-for-wine-grapes-in-oregon-2026.pdf`),
   which `crawl-osu-extension.ts` never discovers (it reads links from the 2 hubs + sitemap, never from
   a catalog page body).
   • **PNW Handbooks (`pnwhandbooks.org`) is NOT in the registry and is technically an easy add.**
   robots `*` = `Allow: /`, `Crawl-delay: 10`, Content-Signal `search=yes, ai-train=no, use=reference`
   — **identical posture to the `osu-extension` source already in the registry** (OSU hosts both). Our
   UA is NOT on the named blocklist (ClaudeBot/GPTBot/CCBot are). One flat sitemap, 4,999 locs, clean.
   **71 pages in scope**: 27 `/plantdisease/host-disease/grape-vitis-spp-` (== the user's list exactly)
   + 1 cultivar table + 17 `/insect/small-fruit/grape` + 9 `/weed/…/vineyard-grape` + 16
   `/pesticide-safety`. ⚠️ **Exact-prefix `grape-vitis-spp-` is load-bearing**: a naive `/grape|vine/`
   regex also takes 4 `oregon-grape-berberis-aquifolium-*` pages (*Mahonia*, an ornamental shrub — NOT
   a grapevine), `ivy-boston-grape`, 3 tree-fruit `*-grape-mealybug`, `puncturevine`,
   `blackberry-vines`, `garlic-wild-allium-vineale`, `cucurbit-vine`, `potato-vine-kill` — 27 false
   positives. Extraction is excellent (Defuddle: 3,836 clean words on powdery mildew, no `<table>` at
   all). Per-page `Last-Modified` exists but is **Varnish-generated (all "today") → useless**; content
   hash is the seam. Metadata `published` is the Drupal node-create date (2015) — same freshness lie as
   EM 8413.
   • ⛔ **THE BLOCKER: this collides head-on with the KB-1 tier-C rule Russell set 2026-07-26**
   (TABULAR product→fact = never in the corpus). Measured product-signal line density: `/pesticide-safety`
   **0%** (pure PPE/WPS/spill/pollinator prose — unambiguously safe and valuable); insect pages **22%**;
   disease pages **30%**; `/weed/…/vineyard-grape` **46% and effectively 100% tier C** (`dichlobenil
   (Casoron 4G) / Rate 4 to 6 lb ai/A / Site of action Group 20 / Chemical family Nitrile`) — and the
   weed pages are the part the user asked for by name. **The boundary runs THROUGH the middle of every
   disease and insect page, not between pages**: `Chemical control` is a bulleted product list carrying
   rate + PHI + FRAC group + REI (`Abound at 10 to 15.5 fl oz/A … Group 11 fungicide. 4-hr reentry.`).
   So this needs a **`sectionFilter`, like `vt-enology-notes` — and PNW splits on body headings, not
   `<a name>` anchors, so the existing `"anchor-heading"` strategy does NOT fit.**
   • ⛔ **And the KB-1 gate is NOT ON MAIN** — `src/lib/knowledge/boundary/` lives only on the unmerged
   `claude/skb-knowledge-sources-plan-bd36b7` (9 commits). Ingesting PNW first puts 71 pages of
   product/rate/REI text in with **no gate at all**, and per the SKB build log the gate must run
   **before** the idempotency short-circuit or already-indexed tier-C chunks stay retrievable forever.
   → **Russell decides the scope before any build.** Recommended order: land SKB/KB-1 → fix EM 8413 →
   then PNW prose-only. Full write-up in `TODOS.md`.

1. ✅ **POPPED — UC IPM knowledge source + corpus dates + stale-guidance warning. MERGED (#405,
   `77edb7a8`), branch deleted.** Source #19 `uc-ipm` (ipm.ucanr.edu grape PMGs): 87 docs / 667 chunks,
   `autoCrawl: true` so the monthly sweep takes it with no workflow edit. robots.txt ALLOWS
   `/agriculture/grape/` — no bypass used or needed. What it uncovered, in order of importance:
   • **`publishedAt` was dead corpus-wide** — READ by `retrieve.ts:111` and shown as the citation date,
   but NEVER written. Fixed (`extract/published-date.ts`, label-anchored, refuses to guess) + a backfill
   script, because `indexDocument` short-circuits on unchanged contentHash so a re-crawl would never
   re-extract. **869/2,781 dated (31.2%)**; of those, 270 stale / 245 aging / 354 current.
   • **`osu-owri` is the oldest source in the corpus, not uc-ipm** — 266 docs, oldest **1993**. Only 2%
   dated, so its 18.2y average is a 5-doc sample and must NOT be quoted as fact; the oldest stamp is the
   solid part. → Worth its own pass. awri: 55% dated, oldest 2011.
   • **578 docs are robots-blocked from re-fetch though already IN the corpus** — the crawler fails OPEN
   on a robots error, the backfill fails CLOSED. Permanently `unknown`; re-running won't help, it needs a
   decision. UMC also 429-rate-limited us.
   • **Assistant now warns on age** (`passage-age.ts`): `ageWarning` per passage + `currencyWarning` per
   set, computed server-side rather than as a prompt line. ⚠️ **Read the ablation note in
   `assistant-currency-warning.golden.ts` before trusting the green eval** — with the warning fields
   STRIPPED the stale case still scores 5/5, because Opus already caveats from the bare `date`. The suite
   guards the BEHAVIOUR; it is NOT evidence the age plumbing is load-bearing (that stands as a backstop
   for weaker models, long context, and the undated case).
   🔻 **MY ERROR, worth not repeating: I wrote a PR "deploy note" saying `seed:knowledge-sources` still
   had to run against prod. Wrong — and the ⚠️ ONE DATABASE line in this very file already said so.**
   Everything (crawl, embeds, backfill, seed) hit production live as it ran. PR body corrected.
1. **OPEN — #387 is merged but NOT browser-verified.** Russell asked for "merge #387 and verify
   'delete Block 1' in the browser". The merge happened (`de889cc1`); the browser check did not.
   Needs the interactive logged-in pane. **Do not tell Mike anything until it runs** — a fix has
   now twice been reported that the eval liked and production didn't. Pop when "delete Block 1"
   is confirmed to show a picker on screen in Demo.
2. POPPED — NRCS SSURGO soil-per-block: designed via /office-hours, spike ran and cleared it to
   `/plan`, then **deliberately parked to finish 082**. Full detail in `TODOS.md`. Detour closed
   cleanly; nothing half-done, no branch touched (`claude/usgs-soil-maps-vineyard-eabe6c` is
   still empty).
3. ⚠️ **OPEN — branch collision with a parallel session (2026-07-20).** Another agent working feedback
   `cmrsrs02` (tasting-note-by-vessel) created and checked out `assistant-fix/cmrsrs02` **in the main
   checkout, mid-session**, so my two U2 commits landed on THEIR branch on top of an unrelated
   `[create-pull-request]` commit. Recovered by cherry-picking onto `claude/assistant-vineyard-coverage`
   from a throwaway worktree (never touching the shared checkout again). **`assistant-fix/cmrsrs02` still
   carries duplicates of `6be7146e` + `037aefa4`** — if that branch PRs as-is it ships the U2 refactor
   twice. Needs a `git reset` on that branch by whoever owns it. Pop when it's clean.
   Two hard lessons: the git **index is shared** across `.claude/worktrees/*` and the main checkout
   (a plain `git commit` swept their staged files into mine — `git commit --only <paths>` is the
   safe form), and a parallel `prisma generate` **poisons vitest's resolution cache** with a stale
   "Cannot find package '@prisma/client'" that survives the package being restored (`--no-cache` clears it).
4. **PLAN 083 BUILT — assistant write-narration root cause (feedback `cmrsrs02`), all 6 units, on
   `fix/assistant-history-tool-replay` (7 commits, rebased onto main, NOT pushed).** PR #391 fixed the
   wrong thing: its premise measures 10/10 cold pre-fix. Real cause is `history.ts:16` dropping
   `tool_use`/`tool_result` from replayed history, so the model saw its own turns claiming cards with no
   tool call attached and completed that pattern — 0/8 on the real transcript, 8/8 with blocks restored.
   Fix is `src/lib/assistant/replay.ts` (server rebuilds history from the DB; clients unchanged). Also:
   row-boundary windowing so a tool_use can never be orphaned, and the over-claim guard now gets ONE
   repair turn to actually perform the write before apologising. Re-measured plan 081's own repro under
   history: 4/5, below threshold — its cold 3/3 overstated that fix, correction appended to plan 081.
   ⚠️ NOT browser-verified against Demo. Pop when it is QA'd and merged.
   (Re item 3 above: `assistant-fix/cmrsrs02` on ORIGIN never carried the duplicate U2 commits — the
   golden-case fix was cherry-picked onto origin's tip from a throwaway worktree, so #391 merged clean.)
5. **PLAN 083 SHIPPING — assistant write-narration root cause (feedback `cmrsrs02`), PR #404.**
   PR #391 fixed the wrong thing: its premise measures 10/10 cold pre-fix, and re-measured AFTER #391
   merged the bug still reproduces 0/5. Real cause is `history.ts` dropping `tool_use`/`tool_result`
   from replayed history, so the model saw its own turns claiming cards with no tool call attached and
   completed that pattern — 0/8 on the real transcript, 8/8 with blocks restored. Fix is
   `src/lib/assistant/replay.ts` (server rebuilds history from the DB; clients unchanged), plus
   row-boundary windowing so a tool_use can never be orphaned, and ONE over-claim repair turn.
   Browser-QA'd on Demo with a DB read-back. Plan 081's cold 3/3 overstated its fix (4/5 under
   history); correction appended there. Pop when #404 merges.
6. ✅ **POPPED — PLAN 084 LIVE. Merged #406 + #409; corpus populated and verified.** VT *Enology Notes* into the assistant KB with section-level
   filtering. `enology.fst.vt.edu` puts rot chemistry and a $3,200 study-tour ad on the SAME url,
   which path-prefix filtering structurally cannot separate — so this adds the crawler's FIRST
   section-level content filter. robots.txt: there is none (404), nothing bypassed.
   ⚠️ Numbered 084 because a PARALLEL session took 083 (#404) — `ls docs/plans/` before picking.
   Load-bearing facts: **(a)** Defuddle destroys `<a name>` anchors (12 in EN-166 source, 0 in
   markdown) → split raw HTML pre-extraction. **(b)** one-doc-per-URL is enforced 3× → strip in
   place, NEVER per-anchor rows (now recorded in ADR 0007). **(c)** `/technical/i` is semantically
   INVERTED here; same trap for `/review/i`, `/sustainable/i`, bare `/available/i` — all four have
   anti-regression tests.
   ⚠️ **`SECTION_FILTER_VERSION`** must be bumped whenever a drop pattern changes; it folds into
   `indexedContentHash`, and without a bump the re-crawl short-circuits to `unchanged` FOREVER,
   silently. Bumped 3× during this work alone.
   **Review found 4 real bugs** (2 in the original code, 2 regressions in the fixes — re-reviewing
   the fixes paid off): silent data loss from a zero-length slice that emitted `<article></article>`
   while reporting the section KEPT; a quadratic split measuring 14s on a 1MB page (~1h at the 15MB
   cap); an over-masking regression; and a number-strip regression that broke case-insensitive
   arabic the corpus actually uses. One finding was REFUTED not applied — masking past `-- >` is
   correct, verified against linkedom.
   **LIVE, and the DB proof RAN** (the gap that had been left for a human): seeded, then crawled
   174 urls → **173 documents / 858 chunks**, 0 errors, 0 skippedRedirect. Corpus **2,850 → 3,023**.
   Acceptance query against the real corpus: **zero announcement text leaks from any
   section-filterable page.** The 3 remaining hits are the two paths that are unfiltered BY DESIGN
   and documented — 1 PDF (no anchors) and T1 #17/#21 (anchorless fail-open). 34 T1 fail-open pages
   observed vs ~40 predicted for #1-40; 119 pages filtered with correct reasons.
   🔎 **The live acceptance test earned its keep** — it caught a config inconsistency the offline
   gate could not: I denied the 14 year pages as "navigation, not content" and then seeded
   `/EN/index.html`, which is also navigation (indexed as 2 chunks of pure link dump). Worse, it
   links to five alphabetical index pages that match the `/EN/` allow-prefix — `crawl:source` does
   not follow links but the MONTHLY sweep's `crawlWithFollowing` does, so they would have arrived
   silently on the 1st. Fixed in **#409** (one `/EN/index` prefix covers all six); the stale doc was
   deleted from the corpus.
   ⚠️ Also learned: `recrawl-knowledge` reads sources from the **DB**, not config — merging a
   source does NOTHING until `seed:knowledge-sources` runs. Easy to miss.
   Gates: tsc 0, eslint 0, **vitest 2985/0**, verify:invariants 36/36, verify:vt-enology PASS.
7. ✅ **POPPED — assistant VOICE MODE is conversational and LIVE IN PROD. Merged #439
   (`9cc51cd8`) then #441 (`e516248a`); live-verified on a real device by Russell.** Two rounds:
   • **#439 — "oscillates, never speaks."** Barge-in used the SAME 0.04 RMS threshold as normal
   listening, so while the assistant spoke the mic heard its own playback past echo-cancellation
   (or a table bang) and interrupted itself → listen→transcribe→think→(cut off)→loop, no audio ever.
   Landed in the Jul-8 "voice focus" commit `75d20d5b`. Diagnosed by ELIMINATION, which is the
   reusable part: reaching "thinking" proves STT works (an empty transcript never gets that far), and
   hitting ElevenLabs directly proved TTS works — leaving barge as the only thing between "has audio"
   and "never plays it." Also hardened `transcribe/route.ts` so the per-utterance voice-settings read
   + audio-isolation can NEVER 502 a turn (that coupling was the latent "stops hearing us").
   • **#441 — the over-correction, and the real lesson.** #439 raised the bar to 0.15/600ms, which
   then ignored a real "yeah, I got it" (ticket `cmrtzeh63`). ⚠️ **A single fixed loudness threshold
   structurally cannot work**: low enough to hear the user is low enough to hear the assistant's own
   echo; high enough to reject echo is too high for real speech. Fix is a DYNAMIC bar —
   `echoAdjustedLevel()` subtracts a fraction of the assistant's own live output from the mic level,
   so the bar rises while it talks and drops in the gaps (0.09 / 400ms).
   • Also in #441: a voice-ONLY prompt seam (`VOICE_STYLE_PROMPT`, appended only when `voice: true`,
   so text chat + goldens are byte-identical); citations are **written but never spoken**
   (`/kb/source/` links dropped from speech, captions now render markdown so they stay clickable);
   units spoken as words (mg/L, g/L, ppm, SO₂ — `mg/L` must match before `g/L`, and `SO₂` needs a
   lookahead because U+2082 is not a word char so `\b` never matches); a "thinking" earcon; and
   ElevenLabs voice `UgBBYS2sOqTuMpoF3BR0` / `eleven_flash_v2_5`.
   🔎 **Two silent bugs found en route:** `style` + `use_speaker_boost` were never sent in the TTS
   request body at all (setting them did nothing), and `proxy.ts` auth-gated `.mp3` so the earcon
   would have died on a lapsed session.
   ✅ **Vercel needs NO env change** — verified all 44 prod vars: `ELEVENLABS_API_KEY` is the only
   `ELEVENLABS_*` set, so the new voice/model ship as code defaults with nothing overriding them.
   ⚠️ **Still open:** feedback tickets `cmrtzeh630001jx04e92nzf2b` (Demo) and
   `cmrm5xew80004l204ssuducfc` (Bhutan) are NOT closed — both have an `AGENTIC_FIX` run stuck in
   `RUNNING`, and `closeFeedbackItemCore` refuses to close while one is running, so the stuck run
   must be neutralized first.
8. **OPEN — multi-lot-in-one-vessel is a MODELING defect, not a UX one (assistant thumbs-down
   `cmruoc3yk0000jf0491y8hety`, 2026-07-21).** Russell: "if we say we are going to rack a tank and
   there are multiple lots in the tank, you can't choose which lot, you're doing the whole tank."
   The auto-fix agent already opened **PR #444** — but it only touches
   `src/lib/assistant/tools/record-tasting-note.ts` (whole-tank tasting notes), i.e. a sliver.
   Investigation done, blast radius mapped, competitor docs read. Findings:
   • **The rack CORE is already right** (`vessels/rack-core.ts` draws proportionally across every
   resident lot; `rack_wine` takes vessels only). The pickers live in the *other* ops.
   • **Only ONE write site creates co-residence**: `ledger/write.ts:264-266` (the projection fold).
   That is the chokepoint an invariant would sit on.
   • **Live data (read-only audit, 2026-07-21): 5 vessels currently hold >1 lot** — incl.
   `org_bhutan_wine_co` BARREL 18 (3 lots, PRODUCTION). Creating ops: RACK 8, SEED 5, CRUSH 5,
   CORRECTION 2, PRESS 1.
   • **InnoVint and Vintrace both forbid it.** InnoVint's own "How to Split a Lot" says you must
   round-trip through a *phantom vessel* — proof a vessel cannot hold two lots. Every movement
   resolves identity at the moment of the move (retain / combine-with-existing / create-new), and
   drain-and-press "assumes all weight… is homogenized (the composition is blended)". Vintrace
   attaches a **batch** per vessel and tracks blend % as a **composition** on the batch.
   • **We already own all three primitives** — CRUSH `mode:"ADD"`, `decideRackRoute` GROW_EXISTING /
   NEW_LOT, `blendLotsCore` — they are just not universal, and `decideRackRoute` bails when the
   destination already holds >1 lot.
   ✅ **PLAN 088 WRITTEN + HARDENED** —
   [2026-07-21-088-…](docs/plans/2026-07-21-088-refactor-one-lot-per-vessel-plan.md), Deep, 19 units,
   **2 branches** (1-13 = the rule + cleanup + DB constraint; 14-19 = delete the pickers + vessel UI).
   Reviewed by council (Codex + Gemini →
   [council-feedback-088-…](council-feedback-088-one-lot-per-vessel.md)), `/plan-eng-review`, and
   `/plan-design-review`. Four findings worth remembering:
   • 🔎 **`write.ts:379` drops composition for BLEND lots** — `origin*` is NULL by construction
   (`blend-core.ts:215` says so), so the fold's "can't form a tuple" `continue` silently skips them.
   Cosmetic today; this plan makes blend lots the norm, so the tank readout Unit 18 rests on would
   decay. Fix reuses `composeRollup` ancestor attribution — but `composeLeaves` must be extracted
   first, because separate marginals (byVariety/byVineyard/byVintage) cannot rebuild the JOINT tuple
   `VesselComponent` needs.
   • 🔎 **ABSORB must REFUSE across tax class / ownership** — inheriting the resident's class is a
   TTB 5120.17 lines 5/20 filing error. InnoVint documents this exact hazard in its blend FAQ.
   • ⚠️ **Unit 10 collided with UX Principle 12 ("no phantom vessels")** — requiring real destination
   vessels for split children pushes users to invent fake ones, regressing a principle this app built
   a first-class op to satisfy. Resolved with trial TAGS on the capture records instead.
   • ⚠️ **3 in-flight WO tasks** reference lots the collapse would absorb; **0 dust rows** (so a plain
   UNIQUE is safe — Gemini's partial-index objection refuted by reading `foldLines`); Bhutan B18 is
   Day-Zero data entry (3 same-day SEEDs summing to exactly 225/225 L), and **Russell accepted a
   uniform collapse** — he'll re-account it by hand.
   Pop when branch 1 merges. **PR #444 closes as superseded**; the whole-tank-tasting-note TODO is
   marked SUPERSEDED (it was the 3rd instance-level answer to this class-level defect).

   ✅ **Units 1-12 + 12b committed (16 commits, not pushed). Demo T5 COLLAPSED AND VERIFIED
   (op #4580): one lot, 6,995 L, composition Syrah 6,370 + Cabernet 625.**
   • ✅ **COMPOSITION BUG FIXED (Unit 12b)** — found by verifying the rehearsal rather than
     trusting it. THREE pre-existing defects, none previously tested:
     (1) the fold never consulted lineage for a lot that HAS an origin, so a single-origin lot
     absorbing another credited the incoming wine to its own variety (Unit 5 fixed only the
     mirror case, origin-LESS blend children);
     (2) `GROW_EXISTING` recorded the parent's share of the INCOMING wine (0.99999) not of the
     RESULT (0.08935) — now `resident + incoming`, with earlier parents re-scaled on each grow so
     a twice-absorbed lot can't drift past 1. ⚠️ the denominator MUST be read BEFORE
     `writeLotOperation` or it counts the new wine twice;
     (3) attribution has to be **DIRECTIONAL and op-type-gated**: arriving wine takes the consumed
     lots' makeup (BLEND/CRUSH/PRESS/SAIGNEE only), returning wine in a CORRECTION takes the
     receiver's, everything else its own. Without this a revert drew the resident down
     proportionally and a **revert→re-apply silently LOST the Cabernet**.
   • 🔎 **`vessel_component` folds INCREMENTALLY — self-healing for volume, self-CORRUPTING for
     attribution.** Once an op books a delta against the wrong variety no later op takes it back,
     so fixing the code did not fix the data. New **`rebuild:vessel-composition`** recomputes it
     directly from occupancy + lineage + origins (idempotent, no replay). Across all 38 occupied
     vessels only **2 had drifted**; unattributable shares are REPORTED, never folded into another
     variety.
   • ✅ **The real check: after the rebuild + re-collapse, a fresh recomputation reports ZERO
     drift against the incremental fold.** Round trip proven on live data — reverted, rebuilt,
     re-collapsed, verified.
   • ✅ **ZERO VIOLATIONS — `verify:one-lot-per-vessel` PASSES across 38 vessels / 8 tenants**, and
     `rebuild:vessel-composition` reports ZERO drift. Demo T5 #4580, B4 #4731, B5 #4732, T7 #4733;
     Bhutan Barrel 18 #4858.
   • 🔎 **BHUTAN BARREL 18 — I had it backwards, and the truth matters.** NOT a data-entry error.
     Its lots came from `system@day-zero-migration`, note *"Day-Zero legacy seed from
     **vessel_component**"*: the OLD model was a COMPOSITION table (vessel, variety, vineyard,
     vintage, volume) — Vintrace's shape — and the migration turned each component row into its
     own LOT. The barrel is ONE three-variety Bordeaux blend (100 Merlot + 75 Cab Franc, both
     Bajo, + 50 Cab Sauv, Gortshalu = 225 L in a 225 L barrel). **Barrel 18 is the fossil of the
     exact modelling error this plan fixes.** I read round numbers as suspicious when they were a
     recorded composition; the three lots existed in no other vessel and every single-component
     barrel migrated cleanly. Collapsing it RESTORED the source data rather than inventing a wine.
     Done as **`2025-BL-BJB`** via the new `--new-blend=<vesselId>=<TOKEN>` mode — a genuine blend
     must not be called "Merlot". Composition identical to the source rows; fractions
     0.44444/0.33333/0.22222; the three originals kept DEPLETED as its parents.
     ⚠️ First run passed `vintage: null` → coded **NV**-BL-BJB for an all-2025 blend; vintage is
     now derived from the parents when they agree. The reverted NV lot survives as a CORRECTED
     zero-volume row (append-only, LEDGER-10) — debris from my run, not worth row surgery.
   • ✅ **UNIT 13 DONE — LEDGER-12 IS ON, IN CODE AND IN THE DATABASE.** Migration
     `20260721160000_one_lot_per_vessel` applied to prod: `UNIQUE (tenantId, vesselId)` on
     `vessel_lot`. Proven live — a direct INSERT of a second lot is refused with **23505**, no row
     left behind. Invariant note `LEDGER-12`; `verify:invariants` 37/37, frontmatter 38/38.
   • 🔎 **The chokepoint rule is MONOTONE on purpose** (`assertNoWorsenedCoResidence`): it refuses
     an op that leaves a vessel with MORE lots than it started with, not one that merely isn't
     perfect. "Must be exactly one" would refuse every op on a mis-recorded vessel **including the
     rack that would empty it** — freezing a barrel nobody can fix through the app.
   • ⚠️ **The migration is HAND-WRITTEN.** `prisma migrate diff` against this schema emits a huge
     phantom diff (enum rebuilds, FK drops) — the known trap. Write the one statement yourself.
   • ⚠️ **CI cannot run the cross-tenant sweep** — CI has no DB by design. The CI guarantee is the
     unit tests + the DB constraint; `verify:one-lot-per-vessel` is the OPERATIONAL check around a
     migration or repair. The invariant note says so rather than claiming a gate that doesn't exist.
   • 🔎 **Turning it on immediately found two fixtures encoding the old model** — which is the point
     of a real guard: `verify-chemistry` seeded 2 lots in a tank to exercise the plan-060 fan-out
     (now unbuildable; asserts the replacement behaviour instead), and `verify-bond` shared one
     vessel across two bond-A lots.
   • 🔎 **A THIRD defect surfaced only because B4/B5/T7 absorbed the SAME parent three times**
     (once per vessel). A lineage edge is one row per (parent, child), so each absorb OVERWROTE
     the fraction with just its own draw: 0.25627 recorded vs 0.27711 true — B4+B5's 125.53 L
     vanished from the lot's makeup. **The folded composition stayed correct**, so nothing looked
     wrong; it only appeared by diffing the fold against an independent recomputation. A parent's
     share now ACCUMULATES: (prior contribution + arriving gross) / new total.
   • 🔎 **The fold is MORE precise than the recomputation.** The fold adds real line volumes; the
     rebuild multiplies a `Decimal(6,5)` fraction, so it carries ~1e-5 relative error (0.02 L on a
     5,572 L tank). The rebuild therefore compares with a TOLERANCE — rewriting the exact folded
     number with the approximation would be a downgrade and would report drift forever.
   • ✅ **Evidence, on live data:** composition **byte-identical** before/after (collapsing lot
     identity does not change what is in the tank) · **12,225.00 L conserved exactly** ·
     **B6/T2/T4 untouched** at 500/1500/4200 L, proving the vessel-scoped draw for a lot spread
     over SIX vessels · **ZERO drift across all 38 vessels in all 8 tenants** ·
     `--rewrite-tasks` exercised (the blocking approved WO re-pointed; `verify:work-orders` 43).

   _(build detail)_ **Units 1-11 of 13 committed, 13 commits, not pushed.**
   Units 6-11 (`2e92586e` rack · `365f0e5b` topping · `33052e62` seed · `f98e4ba6` crush/press ·
   `14773134` split · `5db974f4` deferred WO destination). **Full suite green: 293 files / 3264
   tests / 0 failures**; the guard still reports the 5 pre-existing violations Unit 12 will collapse.
   Worth remembering from that stretch:
   • 🔎 **The split guard had to be stricter than the plan said.** The plan (and my first cut) only
     compared children to each other. The existing verifier split 60 L off a 200 L parent and left
     the child beside the parent's own **115 L remainder** — two lots in one vessel. Real rule: a
     child may stay in the source ONLY when the parent is fully drawn out of it.
   • 🔎 **`mergeIntoLotId` already existed on press fractions** and IS the absorb. My first press
     guard was too blunt and `verify:reverse-transform` caught it.
   • 🔎 **`runtimeInputs` already modelled "let cellar staff choose"** — CRUSH used it for its
     destination, RACK just didn't. Unit 11 was 11 lines.
   • ⚠️ **Trial tags deferred.** The design review's answer to the split refusal was a *filterable*
     tag on capture records; that needs a migration, and migrations reach production here. Grouped
     with Units 12/13. The refusal points at the existing free-text note meanwhile.
   • 🔻 **Fixed two real bugs in `verify-cellar-ops` en route** — it deleted ops before their
     cost_line children (P2003) and scrubbed vessels/lots from in-process arrays, so every failed
     run left junk in the production DB and broke the NEXT run. Now child→parent and by-pattern.
     It still fails LATER on a pre-existing issue: it edits `rateValue`, which `edit-policy.ts:18`
     fences. Unrelated to 088.

   _(earlier)_ **Units 1-5, 6 commits.**
   `6a1a6bcd` LEDGER-12 pure guard · `eb41a084` verify:one-lot-per-vessel · `511e9675`
   audit:co-residence · `896cc56e` decideCombineRoute · `dd37f4e3` **the P1 composition fix** ·
   `c7a3168f` loadCombineState.
   • **The P1 is fixed and PROVEN on the live DB** — `verify:vessel-composition`, 13 assertions on
     Demo with QA- fixtures. A blend vessel now gets a component row per ancestor leaf (it produced
     **zero** rows before); racking 400 L of a 70/30 blend carries 280/120; a blend-of-a-blend
     multiplies down the chain; composition always sums to actual vessel volume.
   • 🔎 **The fix needed a second mechanism nobody predicted:** a lot being CREATED by the very op
     being folded has **no lineage rows yet** — cores write their edges AFTER `writeLotOperation`
     (blend-core: op at :255, lineage at :295). So the fold also reads the op's OWN lines: the lots
     it consumed ARE the parentage, each then expanded through its own lineage. That avoided
     reordering blend-core's reversal-sensitive sequence.
   • 🔎 **The Unit 3 audit turned council C1 from a maybe into a certainty:** **all 6** non-survivor
     lots also occupy other vessels (one of them 5 others). A lot-keyed deplete during the collapse
     would have drained wine from vessels nobody was repairing. Collapse must be **vessel-scoped**.
     Also corrected the in-flight WO count: **1** task, not 3.
   • ⚠️ **OPEN, needs a decision:** `absorbIntoResidentTx` as a *Tx-form* wrapper. `blendLotsCore`
     owns its own `runLedgerWrite` and there is no `blendLotsTx`, so a tx-composable absorb means
     refactoring a reversal-sensitive core. `rackVesselCore` already calls `blendLotsCore` non-tx,
     so **Unit 6 is unblocked without it** — only WO-completion composition needs the Tx form.
   • ⚠️ **Units 12 + 13 touch PRODUCTION** (the 5-vessel collapse, then the DB unique index) and are
     deliberately NOT started: Unit 12's dry-run needs Russell's eyes, and Unit 13 closes the
     rollback window the moment it lands.
   • 🔻 3 test files fail on this box — `assistant-commit-tenant-context` (10s `beforeAll` hook
     timeout), `compliance-fill-pdf`, `verify-ai-native` (30s). **All three verified PRE-EXISTING**
     by reverting the changes and re-running at HEAD; all pass standalone. Load flakes, not regressions.
9. ← you are here

## 🪝 Off-path — do NOT do now

All detail moved to `TODOS.md` (2026-07-20). One line each:

- **Plan 081 follow-ups (a–h)** — brix-write rate, unproven Draft rendering, the
  `wo-vague-target` eval artifact, absent-vs-wrong assignee, canonicalizer throws, must-on-skins
  rule, in-place Draft resolution, `verify:work-orders-transform` red. → TODOS.
- **NRCS SSURGO soil composition per block** — designed, **spike RAN 2026-07-20: cleared to
  plan.** It's NRCS not USGS; do NOT area-weight properties. SDA clips server-side in ONE
  ~180ms call, so no turf/PostGIS. Finger Lakes blocks return 2–3 map units (Napa floor: 1).
  ⚠️ Spike found two things the design missed: **"Water" is a map unit** (a block drawn on a
  lake reports "97.8% Water" at 100% coverage, not a gap), and mukey count overstates
  meaningfulness (Walla Walla = 99.7/0.2/0.1 — needs a share floor). → TODOS.
- **Plan 062 U2/U5 liquid SO₂-solution booking** — feature gap, not the money bug. Do NOT
  `/work` plan 062 as written; it would double-apply 0.576. → TODOS.
- **Break Mode: Sentry server-side scrubbing** — ⚠️ blocker before any real-tenant use. → TODOS.
- **VI Release 4 — Weather & Climate (runbook phases P8 climate spine + P9 disease; NOT "Phase 4" — that's
  soil/P4)** — design brief `docs/GIS/vineyard-weather-climate-design.md` + **4A plan written**
  `docs/GIS/phases/phase-8-weather-climate-spine-plan.md` (12 units) + woven into the brief (Release 4,
  §13.7, §14) and runbook (P8/P9, ledger). Gridded terrain-aware point value (gridMET live / Daymet history
  / POWER global) beside nearest station + elevation delta; **no worker/blob**; spread-not-blend;
  one-estimate-per-vineyard; `query_climate` timezone-correct. **Council-reviewed + owner-decided**
  (`docs/GIS/phases/phase-8-council-feedback.md`; revisions R1–R16 folded — daily-fact-table-authoritative
  schema, obs-time tz normalized at ingest, per-source-with-completeness aggregates, hemisphere/SeasonYear,
  primary-source-model, vulnerable-window frost, vineyard-root card). **Do AFTER P3 ships** (independent, can
  parallel). Next: register CDO token + run the ~45-min point-API spike (de-risks the providers), then `/work`.

## ✅ Done recently

- **✅ Cornell NY/PA Grape Guide is LIVE in the KB (2026-07-27) + the breadcrumb defect it exposed.
  Plan 099, [#543](https://github.com/russellmoss/wine-inventory/pull/543) MERGED (`64db4cd9`),
  crawled, measured, `defaultEnabled:true` for all tenants.**
  Owner asked to ingest the [2025 Grape Guide preview PDF](https://cropandpestguides.cce.cornell.edu/Preview/2025/2025_Grape_Guide_Preview.pdf).
  **Three blockers were surfaced and the owner decided to proceed anyway (2026-07-27):** plan 087 lists
  that host as "paid. Do not crawl." (the *unreachable* half of that note is stale — it serves 200); the
  preview is a 25-page sampler of a 166-page **paid** book spanning all 8 chapters, so pages 22-24 are
  tier-C product × rate × REI/PHI tables; and it carries "© 2025 Cornell University. All rights reserved."
  with no grant. Decision: ingest, **paraphrase + cite rather than reproduce, withdraw on request** — the
  same posture `vt-enology-notes` already runs under. Posture is recorded in the source's `license` string
  so takedown is `active:false` + `reset:knowledge-source`.
  **The bigger half was a corpus-wide defect this forced out.** The guide extracts *cleanly* (56 headings,
  confidence gate passes) yet collapsed to **11 distinct breadcrumbs across 77 chunks, 75 truncated** — the
  68-char title plus a 63-char cover-title H1 ate 134 of the 140-char budget and the cap truncated the
  *tail*, deleting every real heading. Fixed in `chunk.ts` (drop a heading restating the root; elide the
  MIDDLE, never the leaf) → **46 distinct breadcrumbs, 19/77 elided, 0 over cap.** Closes the long-open
  `TODOS.md` breadcrumb entry for the duplication half. ⚠️ **NOTHING self-heals** — review killed the
  claim that PDFs would: `PDF_EXTRACT_VERSION` → `"2"` changes only the index hash, but the sweep 304s
  before `indexDocument` runs, 16 of 26 sources are `autoCrawl:false` and not in the sweep at all, and
  `crawl:curated` doesn't pass `ignoreValidators`. **`reindex:knowledge` is the only lever**, deferred
  (~23.5k chunks of Voyage spend) and tripwired. Also corrected `scale-register.md`: the KB entry claimed
  🟢 while its own ~10k-chunk tripwire had been crossed at ~23.5k.
  ✅ **Unit 6 COMPLETE — LIVE for all tenants 2026-07-27.** 1 doc / **82 chunks** / 46 distinct
  breadcrumbs; `publishedAt` 2025-04-30; displacement **1/120 slots (1%)** vs a 25% gate;
  `verify:knowledge-base` 21/21, `kb-subscriptions`, `kb-register`, `kb-boundary` all green.
  🔻 **THE GATE FIRED, AND IT WAS RIGHT.** The FIRST crawl produced a **corrupt** document and was
  thrown away — only 10/20 active ingredients and **6/24 trade names** survived, and chapter 8 stored a
  table *header* plus `... EPA Reg. 5TG 3, 21 1 year 12 hr 62719-175` where the PDF says
  `^Snapshot **2.5TG** …`. A rate table that looks authoritative and is wrong. Source was hard-closed
  (`active:false`) — no tenant ever had it on. **Cause: it ran one commit before [#544 / plan 100 PR A]**,
  where `splitBySentences`'s `String.match(/g)` silently DELETED spans it couldn't match (`0.5`→`5`),
  firing on any block over `MAX_TOKENS` — i.e. exactly a 3-page pesticide table. Re-crawled on the fixed
  chunker (`CHUNKER_VERSION` 2 + `reset:knowledge-source`): **20/20 AIs, 24/24 trade names, 10/10
  decimals, 8/8 EPA reg numbers, 5/5 page-22 rows verbatim**, zero corruption signatures.
  ⚠️ **`verify:kb-boundary` says `product-table 0` for this source and that is NOT safety evidence** —
  it is the PDF blindness in `TODOS.md`. The numeric spot check cleared this document, not the gate.
  🔑 **Both crawls printed `documents:1, errors:0`.** Only comparing stored cells against the PDF told
  them apart. A version bump plus a green run proves nothing about content.
- **🟩 SKB PR 1 + Unit 5 BUILT (2026-07-27) — the boundary is now REAL, so the source units are
  unblocked.** Branch `claude/skb-knowledge-sources-plan-bd36b7`, 3 commits, **not yet PR'd**.
  Plan: [SKB-knowledge-sources-plan.md](docs/spray_assistant/phases/SKB-knowledge-sources-plan.md).
  Units **1, 2, 3, 5 of 11**. 82 new tests, full suite green, `tsc` clean, `verify:invariants` 49/49.
  - **KB-1 invariant + detector + INLINE gate** (`src/lib/knowledge/boundary/`). A product→fact table
    never reaches the corpus for an enforcing source. Three mechanics, none optional: the detector reads
    **raw HTML / PDF pre-chunk lines, never post-extraction text**; the gate is inline in
    `index-documents.ts` **before extraction AND before the idempotency short-circuit**, signalling by
    **returned field, never a throw** (a throw there is read by the re-crawl tombstone pass as "page
    removed" and would mass-tombstone a source); and `uncertain` **skips for enforcing, is admitted and
    counted for report-only**. Enforcement is the DEFAULT — the 25 incumbents are a frozen report-only
    census whose **deletion** is how D3's grandfather clause closes.
  - **The legality refusal** — `search_knowledge_base` stops advertising "compliance" and refuses the
    **verdict, not the query**: a handler-level classifier prepends a non-certification preamble while
    still surfacing the retrieved agronomic context. 12 NEGATIVE classifier cases + a negative golden,
    because a caveat that fires on everything is caveat fatigue.
  - **`allowPaths`** — exact-path allowlist with the canonicalization contract tested per clause.
  - ✅ **QA'd 2026-07-27** — [report](docs/spray_assistant/qa/SKB-qa-report.md). Full suite 396 files /
    4,733 tests green, `tsc` clean, lint 0 errors, all pure guards green. **4 defects found, 3 of them
    invisible to the unit tests:** the detector vs 10 REAL pages went 6/10 → 8/10 (markup density beat
    the table header window — VT's **29-row** GrapePestEfficacy table read as PROSE); and
    `verify:kb-boundary`'s first-ever run found **`virginia-fruit`: 69 docs, 260 chunks,
    `defaultEnabled=true`, NO config entry, silently ENFORCING**. Live browser QA (port 3005, never
    :3000) proved the captan case refuses the verdict, keeps the cited context, and issues neither a
    clearance nor a self-authored prohibition; the biology negative control draws no caveat.
  - 🔴 **Unit 7 needs REWRITING before it is built:** `virginia-fruit` IS `virginiafruit.ento.vt.edu`
    — already partly in the corpus and already `defaultEnabled=true`. It is a RECONCILIATION, not a
    greenfield add, and the plan's staged dark rollout does not describe the real starting state.
  - 🔴 **UC IPM carries tier-C content TODAY** (verified by hand: a `Common name | Amount per acre |
    R.E.I. | P.H.I. | MODE-OF-ACTION GROUP` table). **D3 census floor = 19** flagged docs, and that is
    a severe under-count — the chunk-text arm scores uc-ipm at 0 while a live fetch finds a 21-row table.
  - ⚠️ **Plan assumption that did NOT hold: `knowledge_blob.blobUrl` is NULL corpus-wide**, so
    `verify:kb-boundary` cannot re-read stored bytes. Enforcing sources are audited by **live re-fetch**
    (the correct seam); the report-only census reads chunk text and is reported as an **approximate
    FLOOR**, worst on PDFs. Units 4 and 6–11 remain — all of them need `.env`, live crawls, or an
    operator-gated network probe.
- 🔴→🟩 **Bhutan weather elevation bias FOUND AND FIXED (2026-07-26, branch
  `claude/weather-elevation-fidelity`, PR #536)** — a LIVE-tenant data-quality defect surfaced by the S5a
  Unit 0 probe. NASA POWER answers with its ~50 km cell's MEAN elevation, **1.0–1.8 km above** each Bhutan
  vineyard, so the series ran **4.8–9.7 °C cold**: the card showed **Winkler Region I at Region V sites**,
  Jones "Too cool" at a subtropical valley, **frost events on nights that were ~12 °C**, and Bajo (1,230 m)
  identical to Ser Bhum (2,773 m). Fix = an elevation-downscaled ERA5 archive provider (the same
  `elevation=` correction the FORECAST path already had) + `source-fidelity-core`, which **withholds the
  hard-boundary classifications** when the source's own reported elevation is >300 m off the site (§3.6)
  rather than mislabelling them. Migration applied + all 8 vineyards re-ingested on the live tenant;
  observed and forecast now agree to the decimal. POWER rows kept as a second source (reversible).
  Report: `docs/analysis/bhutan-nasa-power-elevation-bias.md`.
- **/bulk composition-editor phantom ADJUST fixed (2026-07-26, PR #534):** `updateComponentVolume`
  targeted the lot-tuple total while the editor displayed the component PROJECTION — on a blend (Demo T5,
  2026-SY-2: 6995 L tuple vs 6370 L Syrah share) saving the untouched value drew 625 L. Now: untouched
  save = no-op, blend-share edits refused with guidance, single-origin edits unchanged. Pure plan fn +
  regression test (`src/lib/bulk/component-adjust.ts`). Server-side only — composes with plan 098's
  unit-input work (merged #533).
- **Plan 098 tenant unit preferences BUILT (2026-07-26, branch `claude/tenant-unit-preferences-78472c`;
  merged to main as #533)** —
  all 12 units done: 7 nullable AppSettings unit columns (Migration A) + the audited hoist-if-uniform
  Migration B (Demo hoisted IMPERIAL; Bhutan's disagreeing weather/geometry values preserved — zero
  behavior change, both migrations APPLIED to the live DB); `src/lib/units/display.ts` is the ONE
  display-unit authority (weather/units-core + phenology/units are re-export shims); settings card +
  UnitsProvider; weather/vineyard/cellar/harvest/ferment display sweeps; volume INPUTS with inline
  adornment + dirty-check round-trip; assistant threads units through route → runAssistant →
  ToolContext → query_climate display strings (the Oregon-forecast °C bug fixed). Full vitest green,
  verify:naming/invariants/ai-native green. **Remaining: interactive browser QA on Demo Winery
  (needs the user's pane login) + /review + /ship.**

- **🔴 RELEASE BLOCKER FOUND + FIXED (2026-07-26): `AppUser.vineyardIds` was ALWAYS `[]` under
  `app_rls`.** Surfaced during S4 browser QA (it blocked the pass) but pre-existing and unrelated to S4.
  **[PR #530](https://github.com/russellmoss/wine-inventory/pull/530)** (branch
  `claude/relaxed-bardeen-5cfae9`). Complementary to #529, NOT superseded by it — see the S4 entry below.
  **Root cause — the GLOBAL-parent / RLS-child read seam:** `userSelect` in `src/lib/dal.ts` selected
  `vineyardMemberships`. `User` is a GLOBAL model, so the tenant extension passes `prisma.user.*`
  **straight through** and never opens its `set_config('app.tenant_id', …)` tx; `user_vineyard` is
  RLS-FORCED, so the nested join was evaluated with **no tenant GUC** and fail-closed to zero rows —
  silently, no error. Reproduced deterministically against the live DB (`app_rls` `rolbypassrls=false`:
  nested read `[]`, same read with the GUC set returns the row).
  **Blast radius (every non-admin manager):** field notes unreachable; the vineyard-scoped assistant
  dead (`assistant/scope.ts`, `query-brix`, `query-recent-harvests`, `db-create`/`db-update`); `/lots`
  lens off; and on `/users` **silent DATA LOSS** — checkboxes render from those ids and
  `setUserVineyards` REPLACES the set, so ticking one vineyard dropped every existing membership.
  ⚠️ **Local `DATABASE_URL` is ALREADY `app_rls`** (owner URL kept as `DATABASE_URL_OWNER_POOLED_BACKUP`).
  **Vercel's `DATABASE_URL` is UNCONFIRMED — Russell must check.** If prod still connects as
  `neondb_owner` (BYPASSRLS) this was latent and would have become total at the app_rls cutover.
  **Fix:** membership set moved to `src/lib/users/vineyard-memberships.ts`
  (`loadVineyardMembershipIds` / `…ByUser`), read AFTER `getCurrentUser` resolves the effective tenant
  (support org → active org), with `tenantId` as an EXPLICIT arg (K12-safe, can't recurse via
  `resolveTenantFromSession`). `toAppUser` now REQUIRES `vineyardIds`. All 3 call sites fixed
  (`dal.ts`, `users/actions.ts`, `(app)/users/page.tsx`).
  **Guards:** `test/global-model-tenant-relation-select.test.ts` (static, DMMF-driven — proven
  non-vacuous by reintroducing the bug) + 4 new `verify:tenant-isolation` checks that pin BOTH the empty
  pass-through read and the correct scoped one. tsc/eslint clean, `verify:tenant-isolation` ALL PASSED.
  ⛔ **Trap found in passing — do NOT re-derive:** `runAsTenant(id, () => prisma.x.op(…))` with a
  NON-async arrow **does not work**. Prisma returns a LAZY thenable, so `$allOperations` runs after
  `store.run()` has exited → "Tenant context required", or worse, silently the OUTER tenant. Must be
  `async () => await …`. ~6 pre-existing sites still have the broken shape (masked today) — logged in
  the security register's watch list + a task chip.
  ℹ️ The DB holds exactly **ONE** `user_vineyard` row (`awerth@gmail.com` → Demo Winery) — the row the
  QA report attributed to `russellmoss87@gmail.com` (id `50d97614-…`) is **not there**.

- **TENANT-3 — the lazy-`PrismaPromise` tenancy bug class: SWEPT + CLOSED STRUCTURALLY**
  (branch `claude/silly-goldwasser-d2aedf`, 2026-07-26). `runAsTenant(t, () => prisma.x.op())` with a
  **non-async** arrow BUILDS the query inside the ALS scope and **runs it after the scope exits** —
  the tenant extension's hook then reads the store from outside. With no ambient context it throws;
  with an ambient **outer** `runAsTenant` live it silently uses the **outer** tenant. AST sweep found
  exactly **8** sites (the 8 known ones — no others). Fixed on two fences: (1) *structural* —
  `runAsTenant`/`runWithTenantContext` now wrap the callback in `async () => await fn()`, so the
  thenable is forced inside the scope however the callback is written; (2) *shape* — all 8 call sites
  rewritten `async () => await …`, guarded by a new AST scan `npm run verify:tenant-callbacks` (wired
  into CI). Pinned by `test/tenant-context-lazy.test.ts` (9 cases incl. the nested outer-tenant one;
  4 fail if the wrapper is removed). Registered as invariant **TENANT-3** + a security-register entry.
  🔎 **`npm run verify:reminders` was RED on `main` because of this** — it died at the step-2
  `ComplianceReport.create`. Now green end-to-end (15 assertions) for the first time; that unmasked a
  second, unrelated bug in the script itself (the badge assertion compared a **30**-day count to a
  **60**-day one), also fixed. Gates: tsc 0, eslint 0 errors, **vitest 4482/0**,
  `verify:tenant-isolation` / `raw-sql` / `invariants` (45/45) / `tripwires` / `parity` / `ai-native` /
  `work-orders` / `feedback` / `naming` all green.
  🔻 **TWO CORRECTIONS to what #531 originally claimed — believe these, not the PR description.**
  (1) #531 said `src/lib/users/vineyard-memberships.ts` and the security-register section
  "GLOBAL model may never select a relation to a tenant-scoped table" existed on no branch. **Wrong.**
  They are on **[#530](https://github.com/russellmoss/wine-inventory/pull/530)** (`claude/relaxed-bardeen-5cfae9`),
  which was still OPEN — the sweep searched local refs before that branch carried the work. #530 is the
  real fix for the sibling bug (CI green: `check` + `tenant-isolation` + `review`).
  (2) #531 then re-graded the GLOBAL-model/RLS-child seam to LOW-MED, following #529's note. **Also
  wrong** — #530 browser-proved it side by side on `/users` (unfixed server: Aaron Werth `[]`; fixed:
  `["WV Oregon"]`). #529's `isTenantAdminLike` gate is a real fix but only routes **admin-like** roles
  away; a genuine `role:"user"` manager still gets `vineyardIds: []`, and #529 never touches `/users`,
  where the checkboxes render from those ids and `setUserVineyards` REPLACES the set — **a silent
  membership WIPE**. Invisible while the runtime connects as owner (BYPASSRLS); **total the moment
  `DATABASE_URL` is `app_rls`.** So it IS an app_rls-activation blocker. See
  [[global-model-rls-child-read-seam]]. ✅ `main` has since been merged INTO #530 (TENANT-3 + both
  corrections included), so the `NOW.md` / `security-register.md` overlap is resolved.
- **Spray Intelligence S3a — record + planned harvest: SHIPPED (2026-07-26). PR1 [#523](https://github.com/russellmoss/wine-inventory/pull/523) + PR2 [#524](https://github.com/russellmoss/wine-inventory/pull/524) MERGED → WAVE 2 UNBLOCKED (S7a, S8, S6, S7b start against the merged cores); PR3 [#527](https://github.com/russellmoss/wine-inventory/pull/527) browser-QA'd GREEN.**
  Seven append-only tables (DB triggers + at-most-once correction incl. VOID), facts-as-of
  snapshots (copied verbatim on correction — KD-14), knownness CHECKs (SPRAY-3), planned-harvest
  event stream with the `plannedHarvestChangesSince` watermark, legacy field-note seam.
  `verify:spray-record` = 14/14 on Demo. In-browser QA caught 2 real bugs, both fixed in-phase
  (`d11c38d8`): untouched prefill area provenance, and the correction-prefill UTC→datetime-local
  shift (+4 h on every instant). QA report `docs/spray_assistant/qa/S3a-qa-report.md`;
  ADR 0010 (facts-as-of replay); S7a/S2b/S6 constraints written into runbook §9.

- **Spray S2 — registration + resistance master BUILT (all 12 units, 2026-07-26).** PR-1
  [#522](https://github.com/russellmoss/wine-inventory/pull/522) merged (schema slice landed alone
  and first, as planned, so the three sibling lanes serialize behind it); PR-2
  [#525](https://github.com/russellmoss/wine-inventory/pull/525) CI green; PR-3 open. Live in the
  prod tables: 2,420 active grape registrations, 833 CA-registered, 361 AIs bucketed with zero
  unclassified, `verify:pesticide` 31/31, `verify:invariants` 42/42, 4,330 unit tests green.

- **S4 (Spray Intelligence lane D) — phenology precision + the growth-dilution model: SHIPPED.**
  [#521](https://github.com/russellmoss/wine-inventory/pull/521) schema slice ·
  [#526](https://github.com/russellmoss/wine-inventory/pull/526) the feature ·
  [#529](https://github.com/russellmoss/wine-inventory/pull/529) QA close-out — all merged and live. Six new weekly
  block observations through all five projections, a biofix-anchored GDD phenology interpolator, a
  growth-dilution model with a post-stagnation leaf-expansion tail, a provenance-carrying read DTO,
  pure honesty labels, the authoring UI, the assistant payload, and `verify:phenology`. 135 new
  tests. Two *pre-existing* bugs fixed in passing: falsy values (`false`/`0`) silently dropped from
  the write-confirmation card, and `markRemainingHealthy`'s `JSON.stringify` comparison that adding
  any `BlockStatus` key would have broken. **Browser QA GREEN**: the scouting stage gate fires in
  all three states, `shootLengthCm: 0` / `hedgedThisWeek: false` / `clusterDamage: NOT_ASSESSED`
  all survived UI → action → DB, and read-back renders a gap and a checked-clean as two different
  sentences. The blocker turned out to be a one-line `isTenantAdminLike` gate on the field-notes
  page (#529) — that fix is correct and is what unblocked this QA.
  ⚠️ **CORRECTION to this entry's original "not the RLS theory / re-graded LOW-MED" call: that
  re-grade was wrong.** #529 only routes ADMIN-LIKE roles away from the manager branch; a genuine
  `role: "user"` manager still reads `vineyardIds: []`, and #529 does not touch `/users`, where the
  silent membership WIPE lives. The RLS seam is real, measured, and fixed separately in **PR #530**
  (see the entry above) — the two changes are complementary, not alternatives.

- **CI flake killed: `test/compliance-fill-pdf.test.ts` vs. the 5s vitest default** — **MERGED to
  `main`** ([PR #492](https://github.com/russellmoss/wine-inventory/pull/492), squash `896fec40`;
  branch + worktree deleted). The TTB round-trip parses the 3.1 MB
  fillable AcroForm twice + saves once; it ran ~4.2s standalone and timed out at 5380ms under
  full-suite load. Root cause of the slowness: **pdf-lib's default `parseSpeed` is `Slow`** (yield to
  the event loop every 10 objects — a browser default), ~350ms per parse of this form.
  Fix = `parseSpeed: ParseSpeeds.Medium` in `fill-pdf.ts` (prod gets the speedup too, still yields)
  + `Fastest` on the test's own loads + an explicit **30s** per-test timeout. Assertions untouched.
  ✅ Verified neutral: all **621** field names/values round-trip identically at every parse speed
  (the residual ~4-byte jitter inside a compressed object stream happens run-to-run at a FIXED speed
  too — pre-existing, not from this change). Round-trip 1032→413ms standalone, **1139ms under full
  parallel load** (was 5380ms); full suite 312 files / 3660 tests green; tsc + eslint clean.
  ⚠️ `npm run verify:ttb` was NOT run (it needs `.env`/DB and the worktree had none). CI's `check` +
  `tenant-isolation` were green and the unit round-trip asserts the same field mapping, so this is a
  belt-and-braces gap only — run it from the MAIN checkout next time `fill-pdf.ts` is touched.
- **`/bug-triage` re-offered PRODUCTION CODE as new work — FIXED, LIVE on `main` ([PR #478](https://github.com/russellmoss/wine-inventory/pull/478), squash `0b649b74`).**
  Ticket `cmrwdgt2u…` ("assistant should read a vessel's/lot's operation history") was ranked the
  run's ONE actionable plan-ready item, pointing at plan issue #466 — a day AFTER the work shipped in
  #468 (`query-operations.ts`, `operation-history.ts`, 30 tests, 7 goldens).
  🔎 **Three facts had to combine:** (1) #468 was **hand-built by a parallel session**, so nothing
  stamped the PR on the ticket — `prNumber` stayed null; (2) **Reconcile only closes items that HAVE
  a resolved fix PR**, so a null prNumber is never even a candidate; (3) **the PR sweep lists only
  `--state open`**, so a PR that merged BEFORE the run is invisible and the `linkedFeedbackId`
  body-extraction (which already works for sweep-merged PRs) never ran on it.
  Fix = a new **Merged Sweep** phase: scan recently-merged PRs, pull cuid-shaped ids out of the PR
  BODY by **shape + proximity** to feedback/ticket wording (phrasings differ — ``Closes the feedback
  item `<id>` `` vs ``Automated fix from bug ticket `<id>` ``), validate via the read-only
  `triage:lookup`, reconcile to RESOLVED **only if `isOpen`**, fan out to cluster duplicates.
  ⚠️ **Permissive extraction is safe because `triage:lookup` is a TOTAL VALIDATOR** — a bogus id
  comes back `missing`, so the DB is the gate, not the regex. Bounded by `maxMergedScan` (50) + a
  `mergedAt` cutoff from the `today` arg (workflow scripts **cannot call `Date.now()`**, so no
  `today` = count cap only).
  🔻 **Anything reconciled is pulled OUT of the run's own action lists AND build waves** — enforced
  in JS after the build planner returns, because "the prompt said not to" is not enforcement, and
  handing a builder shipped work was the actual defect.
  🔻 **Second bug in the same area: every `feedback: plan` issue is a TEMPLATE STUB.**
  `scripts/feedback-plan-agent.ts` emits identical boilerplate for every run and nothing ever writes
  `planMarkdown` back, so "plan-ready" routinely means an empty issue — and the build planner was
  emitting `/work <planUrl> — build the plan as written` for it. Now judged by a boilerplate-coverage
  test (real/hand-edited plans respected; an unreadable issue is never downgraded) and stubs route to
  `/plan`.

- **`/bug-triage` `counts.reconciled` reported 390 for 1 item — FIXED (PR #459).** The Reconcile agent
  alone ran with a bare `{ additionalProperties: true }` schema, so `{ results: "<json string>" }`
  validated and the counts builder took `.length` of the STRING. Fixed at both altitudes:
  `RECONCILE_SCHEMA` types `results` as a real array (so StructuredOutput rejects a stringified answer
  and the model retries), plus an `asArray()` parse at the call site that falls back to the
  deterministic one-row-per-item list rather than a bogus count. Audited every sibling count — all
  other array-bearing agent fields are already typed arrays under `additionalProperties: false`, so
  Reconcile was the only loose contract.
  ⚠️ **`dryRun: true` gates the Reconcile agent out entirely**, so a dry run can NEVER exercise this
  path (it returns 0/0) — verify with a harness over the committed source, not a dry run. Proof:
  1 item → `counts.reconciled = 1`.
  🔎 **The `.gitattributes` LF pin this branch originally carried was DROPPED on rebase — #458
  (`ebf52f31`) already landed it on `main`.** Worth knowing why it looked missing: the pin only
  applies at CHECKOUT, so a worktree created BEFORE it landed still hands the Workflow tool CRLF and
  `/bug-triage` still refuses to launch there. Fix per-worktree with
  `perl -pi -e 's/\r\n/\n/g' .claude/workflows/bug-triage.js`, not with another pin.

- **The winery has its own CLOCK — `AppSettings.timeZone`** (follow-on to the due-TIME feature below,
  asked for by Russell: "is this timezone-aware, or is it a setting?"). It was neither: #472 resolved a
  requested wall clock against the **viewer's browser**, which is right for a crew standing in the
  winery and wrong for anyone reading from elsewhere. Work is planned where the wine is, so the winery
  now gets a configured zone that WINS over the reader's, for everything place-bound: WO due entry +
  display, the assistant's tools and its "today", the overdue/due-today lanes, and the ferment
  stall-detector's day bucketing (which had a `timeZone` param since Phase 6 that nobody ever passed).
  • **NULLABLE on purpose** — unset means "not configured" and every reader falls back to the viewer's
  own zone, i.e. exactly #472's behaviour. The migration changes nothing for any existing tenant.
  • 🔻 **A pre-existing UTC bug, now fixed:** `buckets.ts` computed day boundaries with
  `getFullYear/getMonth/getDate` = SERVER-local = UTC in prod. A WO due 9pm Eastern is 01:00Z the next
  day, so it read **"upcoming" on the very evening the crew had to do it.**
  • 🔻 **I caused a real regression and the test suite caught it, not the linter:** putting
  `getWineryTimeZone()` inside `runAssistant` added a DB read to the assistant's hot path and **tripled
  the suite's wall clock (31s → 96s)**, because that loop is deliberately DB-free so its tests can
  construct it without a database. Resolved in the ROUTE instead; suite back to 31s. If an assistant
  test starts timing out, look for a new await in `run.ts` before blaming the flake.
  • ⚠️ **`Intl.supportedValuesOf("timeZone")` omits bare `UTC` and the whole `Etc/*` family**, so the
  canonical list has to add UTC back or the resolver's own fallback is unstorable. And the write gate
  is stricter than the read gate for a reason: **`"EST"` formats fine and is a FIXED −5 with no daylight
  rule** — a winery that stored it would run an hour off for eight months. Only ids Intl enumerates.
  • ⚠️ **`react-hooks/set-state-in-effect` is an ERROR here** — it bit both the seeded-due localization
  and the settings card's live clock. Both became `useSyncExternalStore`; the clock's `getSnapshot` must
  return the time **rounded down to the tick**, since a raw `Date.now()` re-renders forever.
  Gates: tsc 0, eslint 0, **vitest 3583/0**, `verify:invariants` 37/37, `verify:naming` 25/25,
  `next build` clean. Browser-QA'd on Demo in the sharpest case — winery set to Los Angeles while the
  viewer sat in New York, on a night when the two were on **different calendar days**: the settings card
  showed both clocks, the builder defaulted to the winery's Jul 22 (not the viewer's Jul 23), the
  assistant resolved "tomorrow" on the winery's calendar, and both paths stored **16:00Z = 9:00 AM PDT**
  where the previous WO #62 sits at 13:00Z = 9am EDT. Demo restored to unset; QA WOs cancelled.

- **Work orders take a requested TIME of day, not just a date** (feedback `cmrwkmapf…`, Demo,
  FEATURE_REQUEST). Reporter was issuing a 30-min pumpover on T7 and wanted it "tomorrow at 9am":
  the duration was capturable, the clock time was not, and the cap-management flow took **no due
  date at all**. Fixed across every authoring path — builder + template form, the edit page, and
  all five assistant tools (`issue_cap_management_wo` gains `dueDate`/`dueTime` from zero;
  `create_work_order`, `issue_operation_wo`, `manage_work_order` schedule, `propose_work_order`).
  • 🔻 **`dueAt` was ALWAYS a DateTime — the column was never the blocker, every writer just fed it a
  date.** The genuinely new data is the requested PRECISION: an instant cannot distinguish "the 23rd"
  from "the 23rd at midnight", and midnight work is real at harvest, so it can't be inferred. Hence
  `work_order.dueAtHasTime` (migration `20260722030000_…`, additive, `false` default = correct for
  every legacy row). Without it, a date-only WO would render "12:00 AM" and read as real scheduling.
  • 🔻 **The load-bearing bug is TIMEZONE, and it would have shipped silently.** The server runs UTC,
  so resolving "9am" there puts a California crew's pumpover at 2am. The viewer's IANA zone is now
  threaded from both `/api/assistant` call sites → `ToolContext.timeZone`, the wall clock resolves to
  an instant **at propose time**, and the INSTANT is what the confirm token carries (the committer
  can't re-resolve it differently). Same fix corrects the prompt's "today", which was UTC-derived and
  already off by one for anyone west of Greenwich after ~5pm.
  • ⚠️ **`datetime-local` is the obvious control and it's WRONG here** — it rejects a date-only value
  (renders blank), so it cannot represent the WOs that already exist or let anyone clear a time set by
  mistake. Two controls; an empty time IS the date-only state.
  • 🔎 **Intl renders only the fields you name** — passing `hour`+`minute` alone to `toLocaleString`
  silently dropped the date, so the detail page read "Due 9:00 AM". Caught in the browser, not by tsc.
  Gates: tsc 0, eslint 0, **vitest 3571/0** (38 new), `verify:invariants` 37/37, `verify:naming` 25/25,
  `verify:ai-native` green, `next build` clean. Proven on Demo end-to-end BOTH ways — builder UI and
  the assistant card ("due 2026-07-23 at 9:00 AM") — with a DB read-back showing `13:00Z / hasTime=true`
  = 9:00 AM Eastern, beside the reporter's own WO #60 still at `dueAt=null`. QA fixtures cancelled.

- **Confirmed action cards no longer stick, and the next card actually comes up** (feedback
  `cmrwiky4p…`, Demo). Reporter issued two nutrient work orders in one turn (Day 1 Fermaid-O, Day 2
  DAP); confirming the first left it on screen at full height and the second never surfaced. **Three
  defects, only the first of which the ticket describes:**
  • a resolved card was immortal — the green state kept the whole card (preview + task table + cost +
  diff) forever. Now it lingers ~2.2s then folds to a one-line receipt, KEEPING the outcome message
  and the "View X →" link (deleting it would take away the user's only pointer to what was written).
  • 🔻 **the auto-follow switched itself off permanently, and this is the real reason the second card
  was unreachable.** `shouldStickToBottom(el)` was measured **inside the effect that runs AFTER React
  committed the new content**, so it asked "is the user near the bottom of a transcript that just grew
  by a 320px card?" — always no. One tall item in one render killed following for the rest of the
  session. In the dock (a ~180px scroller) the FIRST proposal card did it. The gate now reads a
  `stickRef` written only by real scroll events, i.e. where the user was BEFORE the content arrived.
  • ⚠️ **voice had a single card slot** — a second `proposal` event in one turn OVERWROTE the first, so
  an announced write became permanently unconfirmable. Now a queue, and a confirmed card retires
  instead of staying pinned above the composer for the rest of the session.
  🔎 **The reveal's first cut was subtly wrong and only measurement caught it:** bottom-align-if-below /
  top-align-if-above looks complete, but a 320px card in a 180px scroller that has scrolled off the TOP
  has its bottom edge above the fold too — so it took the top-align branch and "revealed" the card with
  Confirm just as unreachable as before (feedback #203 all over again). Anything taller than the
  viewport now gets its FOOT pinned.
  Gates: tsc 0, eslint 0, **vitest 3529/0**, `verify:naming` 25/25, `next build` clean. Browser-QA'd on
  Demo end-to-end in the dock (two cards → confirm → fold → next card's Confirm in view → confirm →
  none remain); QA work orders cleaned up with `scripts/qa-cards-clean.ts`.

- **The assistant can read a vessel's/lot's OPERATION history — MERGED + LIVE** (PR #468, squash
  `a9016c3f`, branch pruned; feedback `cmrwdgt2u…`, the ledger counterpart to #463's chemistry read). Nothing in the assistant surface touched `LotOperation` — `query_transfers`
  is RACK-only, `query_audit` is entity CRUD (cellar ops are not audit rows), `query_cellar_contents`
  is point-in-time — so "what additions did we make to T2" had no path. `query_operations` wraps the
  **same loaders the pages render from** (`getVesselTimeline` / `getLotDetail`), so it cannot drift
  from what the operator sees. Russell's two scope calls: a vessel question means the **current fill**
  (`allTime` opts out), and the sweep ships in v1 ("which tanks haven't been punched down in 3 days").
  Three ways this could have lied, all closed: neutral ops (ADDITION/FINING/CAP_MGMT) carry **no**
  ledger lines so every query UNIONs `lot_treatment`; a vessel with no matching op is returned in
  `neverInThisFill`, never dropped from an "overdue" answer; and a **pre-LEDGER-12 co-resident-lot
  fan-out** wrote one treatment row PER LOT, so an addition fanned across 3 lots reported the dose 3×
  — `dedupePhysicalTreatments` collapses it (8 such groups live in Demo; caught by reading real rows,
  not fixtures). 30 new tests, suite 3425 passing, `verify:ai-native` + lint + tsc green, verified
  read-only on Demo across 12 scenarios.

- **KB citation tombstone shows an EXCERPT, not the whole withdrawn document — MERGED + LIVE**
  (PR #462, squash `8f6099b5`, branch pruned). From Russell's copyright question: paraphrase-with-
  citation IS the right shape and `search-knowledge-base.ts` already does it, but **citation cures
  plagiarism, not infringement**. `renderTombstoneHtml` served up to 20,000 chars verbatim precisely
  when a publisher had pulled the page. Now `buildTombstoneExcerpt` caps at 600 chars on a word
  boundary, `take: 3` on the read, truncation disclosed, `noindex, noarchive`, plus a **retraction**
  warning (a safety point, not only a legal one). 10/10 tests. Not browser-verified — the tombstone
  only renders for a *withdrawn* document.

- **Voice mode no longer cuts the user off mid-thought (ticket `cmrvhj5b8…`) — MERGED (PR #460,
  squash `ddeeaaf8`).** Reporter, hands-free on a phone: *"it would maybe let me talk for like 30
  seconds before it would just start thinking."* **The 30 seconds was a red herring — there is no
  utterance cap anywhere**; `DEFAULT_VAD_OPTIONS.hangoverMs` was a FLAT 1200ms, so 30s was simply the
  first time he paused longer than that. People thinking out loud pause about that long constantly.
  Now adaptive (1600ms base → 3000ms cap, scaling with how long the speaker has held the floor) plus
  onset/release hysteresis (0.04 to start, 0.025 to stay), with a **"✓ Done talking"** control as the
  opt-out. ⚠️ **Barge-in stays deliberately FLAT** — lowering that bar lets the assistant's own echo
  sustain a run ([[voice-mode-barge-self-interrupt]]). Still needs Russell's phone re-test: the pure
  timing is tested, the *feel* can't be. ⚠️ The AGENTIC_FIX agent raced this ticket and its draft
  PR #457 changed **only the test file**, asserting a fix it never made to `vad.ts` — red CI from the
  first push, closed as superseded. `gh pr diff --name-only` before trusting a red auto-fix PR. Also:
  `closeFeedbackItemCore` does NOT neutralize a `PR_OPENED` run (only `QUEUED`/`AWAITING_APPROVAL`),
  so the ticket would have closed still advertising the dead PR.

- **Leaflet attribution teardown crash (Sentry #324) — MERGED (PR #455, squash `5c5b72fe`).** The one
  real production defect in an 18-issue pile. The Google copyright string refreshes on a 400ms
  debounce after `moveend`; the init effect's cleanup set `cancelled` and called `map.remove()` but
  never cleared that timer, and `refresh()` read `map.getBounds()` *before* checking cancellation — so
  a pending refresh ran against a torn-down pane. Only reachable with a Google Maps key set (the
  keyless Esri fallback never wires attribution), which is why the event count stayed low. Fixed with
  a pre-guard **plus** self-destruct on Leaflet's `unload`, because `addBasemap` is fire-and-forget and
  the caller holds no teardown handle. Logic extracted to `src/lib/map/attribution-refresh.ts` with a
  structural map type so it tests under `environment: "node"` — this repo has no jsdom. 🔎 **Lesson:
  verify a regression test actually regresses.** With the guard and `unload` removed, 3 of 7 cases
  fail with the literal production error; without checking that, a passing suite proves nothing.

- **Sentry dev-noise filter — MERGED (PR #456, squash `a764d85f`).** Drops events whose stack carries
  `.claude/worktrees/…` or `.next/dev/…` in `beforeSend`, across all three runtimes. Born from the
  triage finding that 5 of 6 open Sentry issues were one dev session. ⚠️ **Conservative by
  construction, and tested to be:** the suite pins that #324's own event shape is KEPT, that a
  production `.next/server` path is KEPT, and that `"development"` doesn't match — a filter that ate
  the real bug sitting next to the noise would be worse than the noise.

- **Inline voice mode in the assistant dock (plan 089) — SHIPPED (PR #451).** Retired the full-screen
  voice overlay; voice now runs inline in the dock so the page stays visible and clickable while the
  assistant navigates and talks. Triple-reviewed before building, which caught a P0 the plan itself
  created (a typed turn was invisible to the voice session's history → `appendHistory`) and two
  features about to be deleted by omission (`focusNotice`, the first-run hint). Details in memory.
- **One lot per vessel (LEDGER-12) — MERGED + LIVE (PR #445, squash `c9ea0ad9`).** 19 units, 29
  commits. From Russell's own P0 thumbs-down: *"you have 3 lots in one tank — which lot do you want
  to transfer?"* → **"stupid and physically impossible."** The picker was the symptom; the DATA MODEL
  permitting several `vessel_lot` rows per vessel was the bug. Reported 3x, answered 3x with
  instance-level fan-outs (#444 was the fourth — closed as superseded). Now a vessel holds ONE wine
  (a lot may still span many vessels), enforced at `writeLotOperation` + a `(tenantId, vesselId)`
  unique index, with identity decided at the moment of combination by one shared
  `decideCombineRoute`. Every "which lot?" picker deleted; plan 060's whole-tank fan-out with them.
  A tank now shows its makeup — Bhutan Barrel 18 reads `45% Merlot · 33% Cabernet Franc · 22%
  Cabernet Sauvignon`. Ticket RESOLVED via the canonical console path AFTER the prod deploy went
  green; Mike DMed. 🔎 **Lessons: the Bhutan "data entry error" was actually a Day-Zero migration
  fossil (component ROWS became LOTS) — investigate before writing something off; making composition
  load-bearing exposed a silent fold bug for blend lots; and pre-invariant verify FIXTURES
  (`chemistry`, `bond`, `naming`) each needed one vessel per lot.** ⚠️ Also: **the assistant LLM eval
  is NOISY — 9–12 failures across five runs on IDENTICAL code. Compare failure SETS, not counts.**
- **Cornell fruit resources KB source — CLOSED.** `cornell-grapes`: 96 documents / 948 chunks, 64
  PDFs, `verify:knowledge-base` 20/20 PASS. Merged #424 (source, reconciled) · #425 (crawl error
  visibility) · #426 (CDN) · #427 (title fix). Plan 085 (MSU) closed alongside it. 🔎 Lessons kept:
  main was FABRICATING publication dates (`new Date("Issue 2019")` → 2019-01-01, and sitemap
  `lastmod` made an undated 2009 page score `ageYears: 0`); a newly-allowlisted target is
  UNDISCOVERABLE by re-crawl (a 304 yields no links — after ANY scope change, reset THEN re-crawl);
  Cornell's files live on a SHARED CampusPress CDN, so host and path are separate gates and the
  `/blogs.cornell.edu/` prefix is the only thing bounding us to Cornell. ⛔ `msu-grapes` stays
  DORMANT — Imperva refuses this crawler from every available network; `npm run verify:msu` is the
  probe, un-dormant only if it ever reports a live PASS.
- **Consumable cost surfacing (#372 "pricing") — MERGED (PR #435, squash `b46cd30`).** Mike: "I don't see the
  price I entered" + "are we averaging across shipments?". The engine already captured both — each `SupplyLot`
  stores the receipt price; the material's unit cost is the weighted average across open priced lots — but the
  UI never surfaced the per-shipment price nor named the method. Now the detail view leads with a "Shipments &
  prices" panel (open by default) showing each shipment's "Paid $X/unit", plus an `InfoHint` + summary line
  explaining the Cost is the weighted average across priced shipments still in stock (unpriced excluded, never
  $0). Read-only (COST-3); a new pure `summarizeConsumableCost` **reuses** the engine's `weightedAvgUnitCost`
  (COST-1, single source of truth) + `test/cost-display.test.ts`. Browser-QA'd on Demo (100@$2 + 300@$6 →
  $5.00). Ticket RESOLVED (canonical console path) + Mike DMed. 🔎 **Lesson: resolve feedback via
  `closeFeedbackItemCore` from the start — a raw status write skips the structured outcome note + reporter
  notice and can't be re-closed cleanly (the #366 reopen/version-race trap).**
  **#374 "cost" + #373 "drop down" closed as REDUNDANT (no code):** #374 — the read-only per-unit cost on every
  consumable list row was the U16 fix already shipped in **PR #395**, completed by #372. #373 — the vendor
  free-text field is already a fuzzy `VendorPicker` over first-class vendors (persists the immutable vendorId,
  NAMING-1) in both the Add/Edit `MaterialForm` (Plan 069) and the Receive `MaterialMovePanel` (U17, **PR #395**);
  the old free-text lived in the ReceiveModal retired in **PR #433**. Both confirmed on main, DMed Mike, RESOLVED.
  That closes the ENTIRE Mike consumables-flow cluster (#377 → #366/#370 → #372 → #374 → #373).

- **Consumables receive-by-pack (#366/#370) — MERGED (PR #433, squash `3b13b6e`).** The receive machinery
  (`resolveReceiptQuantity`, location-aware `receiveConsumableCore`, the `MaterialMovePanel` unit selector +
  preview) had already shipped in **#395** (plan 080 U15); the reported bug was still reachable only because
  the legacy grams-only `ReceiveModal` was still wired to the detail modal's "Receive" button. Fix: retired
  that modal — "Receive" now opens the capable Move-stock panel (unit selector + `initialMode` prop), which
  resolves the pack size server-side and converts qty AND per-unit cost together (COST-1). Regression test in
  `test/material-stock.test.ts` (3 rolls of 500 → 1,500 @ $0.50). Browser-QA'd on Demo (1 roll @ $250 →
  500 units @ $0.50, base-unit still works). Both tickets (same reporter, Mike) DMed + RESOLVED. 🔎 **Lesson:
  when a clustered ticket's core already shipped, the remaining bug is often a leftover *reachable path* — grep
  for redundant callers before rebuilding.**

- **Plan 085 MSU Extension KB source + crawler hardening — MERGED (#415, `c49d42bc`).** 2 of 8 units
  added MSU; **the other 6 fixed crawler bugs MSU exposed that already affected all 20 sources.**
  WAF challenge pages were being indexed as real documents (HTTP **200** + `text/html`, so nothing
  refused them) and, because Imperva stamps a unique `incident_id` into each one, every fetch got a
  fresh content hash — the dedup never fired and the garbage would have **re-embedded every month
  forever**. The tombstone pass also read ANY fetch failure as "page removed"; now only 404/410
  means gone. `/review` then caught 3 more real bugs, the sharpest being that `findDarkSources`
  declared HEALTHY sources dark (`documents` counts only re-indexed pages; unchanged pages 304 into
  `notModified`, so a stable source legitimately ends a month at 0 — and the odds rose every month).
  Also: the workflow literally could not report its own failure (`bash -e` + `pipefail` aborted the
  step before the summary was written). 🔎 **Lesson worth keeping: two independent reviewers finding
  the same thing is the signal to trust** — that is how the 304 bug surfaced.

- **Feedback loop: class sweep + regression-test gate — built on `claude/determined-clarke-6d3e65`, PR not yet opened.**
  Backlog-process review, not a ticket. The data: ~40 PRs merged in 48h, PR queue near-empty — **throughput
  is not the bottleneck**. The defect is fix *altitude*: **#385** fixed one `resolveExactlyOne` ambiguity,
  **#386** swept the rest of the class by hand a day later. Ticket-driven fixing defaults to instance-level
  because the ticket *describes* an instance. Two changes to `scripts/bug-feedback-agent.ts` + CI:
  (1) **class sweep** — new `search_repo` tool (the agent had list_dir/read_file but **no grep**, so it
  structurally could not sweep) + `record_class_sweep`, enforced as a **deterministic tool-loop rejection**
  of `apply_fix` without a prior sweep, not a prompt rule. Sweep lands in the PR body as the review artifact.
  (2) **test gate** — new label-gated `feedback-test-gate` CI job; a code change with no `test/` change FAILS.
  Escape hatch is the human-applied `no-regression-test` label, deliberately not agent-settable. Composes with
  bug-triage's auto-merge for free (it already requires CI green). 🔎 **Found en route: `test` was missing from
  the fix workflow's `add-paths`** — the agent's test edits were being silently dropped from the commit, so the
  gate would have failed every PR for a test the agent actually wrote. Exactly the hand-synced-list drift the
  plan-052 comment warned about. tsc 0, eslint 0 errors, **vitest 2861/0**.
- **#387 assistant picker-vs-prose — MERGED (`de889cc1`).** "delete Block 1" answered in prose.
  The chip blamed tool descriptions; **so did I, and we were both wrong** — prepending guidance to
  six tools measured **1/6**. The cause was prompt **rule 44**, which literally instructed the
  behavior being debugged and contradicted rule 41. Rewriting it: **10/10**.
  **Second time a stale prompt rule was the root cause** (plan 081's rule-40/45 contradiction was
  the first). Rules left in place after the machinery beneath them changed. Nobody audits a
  15,000-char prompt the way we grep code — that may deserve a standing check.
  Only caught by measuring before *and* after each change.
- **Consumables "Total cost paid" denominator — MERGED (#388).** Display-only; the costing engine
  was already right. Label now names its own denominator.
- **Plan 080 Wave 2 — MERGED (#376).** Unified `/inventory`, per-location consumables UI, costed
  equipment, FG cost layer. Wave 1 #351.
- **Break Mode — MERGED (#345, #375).** Dev bug capture via Sentry Replay; never captures
  request/response bodies. ⚠️ see the Sentry scrubbing blocker above.
- **Plan 081 assistant Draft Card — MERGED (#354, #355).** A card was binary (valid or nothing),
  so a tool one field short fell back to prose. Added the missing middle. Repro **2/7 → 12/12**
  live on Demo. `asProposal` rebuilds the object so a draft can never carry a commit token.
  Residual gaps → TODOS. *(#355 merged still titled "WIP:" — cosmetic.)*
- **`/bug-triage` versioned in-repo — MERGED (#384).** Now `.claude/skills/bug-triage/`. Edit it
  in the repo, **not** in `~/.claude/`. Gotcha: git cannot re-include a file whose parent dir is
  excluded — the ignore rule had to widen to `workflows/*` before the `!` negation took effect.
- **Plan 079 winemaking KB RAG — COMPLETE** (#285 corpus, #289 re-crawl loop, #292 four sources,
  #293 subscription UI). Corpus 1,449 docs.
- **Plan 079 bug-report clarification loop — COMPLETE** (#276/#281/#277/#282, docs #283).
- **Plan 077 QBO vendor sync Slice 2 — MERGED (#252).** Completes the arc with #229, #231.
- **Add-variety duplicate guard — MERGED (#322).** `EntityConfig.findConflict`, case-insensitive
  (NAMING-1). The DB unique was case-SENSITIVE, so "syrah" beside "Syrah" silently duplicated.
- **Ticket #188 harvest-pick + block cascade — MERGED (#265).** Issue #328 (delete-block card
  error) is now CLOSED.
- **Demo Winery expendables data fill (data only).** 47 rows completed, 11 vendors. ⚠️ Gotcha:
  `deriveMaterialFields` derives name AND normalizedKey from `brandName`, so writing a supplier's
  real product name RENAMES and RE-KEYS the row. 4 junk rows refused deletion (3 hang off APPLIED
  invoices with live `ApExportEvent`; 1 is referenced by a historical `LotTreatment` whose FK is
  SetNull, so deleting would silently blank a real treatment's link). Those need a decision.

_Older shipped work lives in git history and `docs/plans/`. Roadmap phases in `ROADMAP.md`._

## ⏭️ Next up (candidates, not commitments)

- **Plan 086** (US pesticide registration) — planned, not started. The big one; read the plan file.
- Browser-verify "delete Block 1" on Demo, then close the loop with Mike (from the plan-082 residue).
- Confirm plan 082's noted-at-merge gaps (U6 read-back, eval LLM half, browser QA) or accept them.
- **Add a Sentry-side inbound filter** for `.claude/worktrees` / `.next/dev` (console, ~2 min). #456
  drops these in `beforeSend`, but only after they are sent and counted against quota.
- **The 10 kept issues are the real remaining queue** — 3 KB re-crawl reports (#420/#417/#325, two
  same-day duplicates), 4 hand-filed bugs (#414 flaky test, #413 soft-404 tombstones, #412 undated
  corpus sources, #408 the H8 eval drifting with CI never running it), 2 scale tripwires (#402, #91),
  and 1 orphaned plan issue (#365). None triaged in depth this run.

_Last updated: 2026-07-27 — **Plan 100 SHIPPED, both PRs merged** ([#544](https://github.com/russellmoss/wine-inventory/pull/544) chunker fix, [#545](https://github.com/russellmoss/wine-inventory/pull/545) PNW Handbooks source): the chunker was silently DELETING text (`splitBySentences` used `String.match(/g)`, which skips spans it cannot match, so `0.5 lb ai` indexed as `5 lb ai`). Fixed, with a lossless scanner + a standing ingest-time numeric-integrity guard + `CHUNKER_VERSION` folded unconditionally into `deriveIndexHash`. Measured read-only: **~630 of 3,299 corpus documents corrupted, about 1 in 5** (candidates 44/64; random non-candidates 16/90 = 18.2%) — the monthly sweep now progressively repairs what it re-fetches; a dedicated repair campaign for the rest is NOT run and needs a go-ahead. PNW Handbooks is live: 59 documents / 142 chunks, KB-1-clean, `defaultEnabled: false` with Demo Winery staged on — one decision (global flip, Bhutan included) left for Russell. Correction to the note below: **SKB PR 1 has since MERGED as #538**, so the KB-1 gate is on main. Also this date: **S5a Unit 0 gate ANSWERED: the powdery index is a NO-GO on reconstructed hourly (all 8 sites failed; consecutive-hours-in-band MAE 2.2–3.4 h against a rule thresholded at 6 h; unsafe-miss 13.6% at Madera). S5a ships the LEDGER ONLY; the index moves to S5b behind S1, which is now load-bearing for powdery mildew and not just leaf wetness. Bhutan's daily series may be 8–9 °C off vs ERA5 — escalated as its own investigation.** Also this date: plan 098 tenant unit preferences built (all 12 units; QA + ship pending); S2b product-facts FOUNDATION merged + live (#535), phase still open. And: **SKB PR 1 + Unit 5 BUILT AND QA'd on `claude/skb-knowledge-sources-plan-bd36b7` (units 1/2/3/5 of 11, not yet PR'd): the KB-1 tabular-vs-prose boundary is enforced INLINE at the pre-extraction seam, `search_knowledge_base` refuses the legality VERDICT rather than the query, and `allowPaths` exists. Units 4 + 6-11 all need .env / live crawls / an operator-gated probe.** Prior: **Spray Wave 1: S0 (weather-lane spike, lane A) COMPLETE — PR [#528](https://github.com/russellmoss/wine-inventory/pull/528): the gate is answered and S1 is NARROWED to eastern regimes (reanalysis inputs fail at coastal-fog and hot-arid-interior sites, both live Demo sites). No production code, 0 Neon branches left, all gates green.** **TENANT-3 swept + closed structurally: `runAsTenant` now forces its callback
inside the ALS scope, 8 call sites rewritten, `verify:tenant-callbacks` + `test/tenant-context-lazy.test.ts`
added, CI wired. `verify:reminders` recovered from red-on-`main` to 15/15.** Also this date: **S3a spray
record SHIPPED: PR1+PR2 merged (Wave 2 unblocked), PR3 browser-QA'd GREEN (2 findings found+fixed: prefill
area provenance, correction UTC→datetime-local shift). S2 (registration + resistance) BUILT — schema slice
merged (#522), Units 2-11 green (#525), 2,420 grape registrations + 361 AIs live with zero unclassified.
S4 (phenology + growth) SHIPPED — #521 + #526 + #529 merged and live, 135 new tests, browser QA GREEN (the
S4 blocker was a one-line isTenantAdminLike gate on the field-notes page); scouting coverage 0/0 = NOT YET
MEASURABLE, recorded as-is.** ⛔ **Do NOT read #529 as clearing the GLOBAL-model/RLS-child seam — that
re-grade was WRONG. It only routes admin-like roles; a real `role:"user"` manager still gets
`vineyardIds: []` and `/users` silently WIPES memberships the moment `DATABASE_URL` is `app_rls`.
[#530](https://github.com/russellmoss/wine-inventory/pull/530) is the fix — CI green (`check` +
`tenant-isolation` + `review`), `main` merged in, browser-QA'd on Demo, ready to land. ⚠️ Still open for
Russell: is Vercel's production `DATABASE_URL` `app_rls` or still `neondb_owner`? That decides whether
this was already live in prod or latent (the Vercel env page is blocked to the agent, prod needs a
login, and Neon telemetry is unavailable in this region).** Prior: **detour resolved and LIVE on `main`: the `compliance-fill-pdf` CI flake is
fixed** (PR #492, squash `896fec40`; branch + worktree deleted). pdf-lib's default `parseSpeed` is `Slow`;
`Medium` in `fill-pdf.ts` + `Fastest` + a 30s timeout in the test take the round-trip from 5380ms-under-
load to 1139ms with assertions untouched. `verify:ttb` never ran (no DB in a worktree); CI was green.
Objective unchanged →
**Vineyard Intelligence P0 planned + council-reviewed (plan 094, 16 units).**
Both reviewers confirmed the convex-window/Sutherland–Hodgman reframe and both rejected the first draft's
instrument; six fixes folded in. Three corrections not to re-derive: `harmonizeValues` is backwards in
runbook §2.13, the processing baseline needs a STAC call, and the free tier binds on requests not PU.
Blocked on Unit 0 — `docs/GIS/` is untracked, and there are no CDSE credentials or blob token in `.env`.
Prior: **`/bug-triage` reconcile blind spot closed and LIVE on `main` (PR #478,
squash `0b649b74`).** Triage ranked a ticket as the run's one actionable item a day after the work shipped in a
hand-built PR #468: nothing stamped the PR on the ticket, Reconcile needs a PR on the ticket, and the
PR sweep lists only OPEN PRs. New **Merged Sweep** scans merged PRs for a feedback id in the body,
validates it through `triage:lookup` (a bogus id comes back `missing` — the DB is the gate, not the
regex), and reconciles only if still open; reconciled items are stripped from the run's actions and
build waves in JS. Also: every `feedback: plan` issue is a static TEMPLATE STUB, so "plan-ready" now
routes stubs to `/plan` instead of `/work`. Prior: **`counts.reconciled` fixed (PR #459).** A count reported
390 for one reconciled item because the Reconcile agent's schema was bare enough
(`additionalProperties: true`) to accept a stringified array, so `.length` counted CHARACTERS. Fixed at
the schema AND the call site. ⚠️ `dryRun: true` gates the Reconcile agent out entirely, so a dry run can
NEVER exercise that path — verify with a harness over the committed source, not a dry run.
Prior: **PLAN 090 UNITS 1-9 DONE (12 commits, unpushed); the PRODUCTION RE-INDEX
IS RUNNING** (osu-owri + wbi + lvwo, 616 docs, ~4h at observed rate). Unit 10 (the before/after diff)
is blocked on it finishing. **The lesson of this plan is that the code fix was the easy part** — making
it reach the data took THREE separate silent no-ops, each of which would have produced a green,
successful-looking run that changed nothing: the index-hash short-circuit (Unit 8), the conditional-GET
304 (Unit 9), and robots refusing 350 of 616 documents because the re-index did not inherit the curated
`ignoreRobots` (Unit 9). Only the third was found by WATCHING a live run. Verified on production so far:
titles and dates now populate, breadcrumbs multiply where structure exists, the 140-char cap holds, zero
mojibake, and **0 HTML documents were disturbed** (exactly the targeted blast radius Unit 8 claimed).
Prior: **PLAN 090 UNITS 1/1b/2/3/4/5/6/7/8 DONE (8 commits, unpushed). All the
code is written and green; the only thing left is the PRODUCTION RE-INDEX (Unit 9), which needs a
go-ahead.** Measured across 34 real PDFs from 13 sources: 23 restructured, 11 safely fell back, 0
failures — scott-labs went from ONE breadcrumb to 437. Two things worth remembering: a CONFIDENCE GATE
was added after per-document heuristic tuning started overfitting, so a PDF that resists structure
falls back to exactly today's output rather than gaining junk breadcrumbs; and Unit 8 caught a silent
no-op that would have made the whole fix pointless (PDF index hashes carried no version, so unchanged
bytes could never re-extract). Prior: **PLAN 090 UNITS 1/1b/2/3 DONE (4 commits, unpushed): the eval instrument is built and the baseline captured.** Next is Unit 4 (PDF titles) then Unit 5 (PDF heading inference, the MEDIUM-confidence one). Building the instrument found a REAL PRODUCTION BUG: neither retrieval arm had a total ORDER BY, so tied ts_rank rows straddling the LIMIT cut changed which candidate survived and propagated through RRF+MMR into what users see (fixed with a `, c."id"` tiebreaker). It also FALSIFIED a plan premise — retrieval is NOT fully deterministic; ~1 query in 18 wobbled from an unidentified cause, so Unit 1b makes the snapshot measure its own stability and quarantine what it cannot vouch for. Prior: **plan 090 written: fix KB RAG retrieval quality before adding sources.**
Started as "should we add AJEV to the knowledge base"; measuring the corpus to answer that found
**42% of it is chunked wrong** (headingless PDFs starve the heading-driven chunker, so the breadcrumb
becomes a 192-char slab of page one, prepended to every chunk and embedded). Also found: 95% of docs
have no `canonicalTitle`, so citations name a publisher but not a document. The eval suite is green
throughout because it only sees 3 of 8 slots — Unit 1 fixes the instrument before anything else moves.
AJEV deferred with its research preserved. Prior: **the backlog is CLEAR: 0 active feedback items, 0 open PRs.** A full
Prior: **the assistant can finally read a tank's Brix back** (bug report
Prior: **the assistant can now read a vessel's/lot's operation history back**
(feedback `cmrwdgt2u…`) — the ledger counterpart to the chemistry read below. `query_operations`
reuses the vessel-History and lot-timeline loaders verbatim, defaults a vessel question to the
current fill, and sweeps a whole vessel type for "which tanks are overdue for a punchdown". The
load-bearing catch came from reading real Demo rows rather than trusting fixtures: **one physical
action on a pre-LEDGER-12 vessel wrote one treatment row per co-resident lot**, so a dose fanned
across 3 lots would have been reported 3×. Prior:_

_2026-07-22 — **the assistant can finally read a tank's Brix back** (bug report
`cmrw8s5ct…`, PR #463). It could write a chem panel and read current contents but had no read tool
for `AnalysisPanel`, so a tank-Brix question reached for the vineyard-block ripeness tool and
dead-ended in "open the lot page". `query_measurements` covers a lot, a vessel, a vessel range, or
every vessel of a type. **Russell's scope rule is the load-bearing part: never average across
vessels** — comparisons are per-vessel enumeration or a ranking sort, so "which tank is closest to
dry" names a tank instead of inventing a cellar-wide number. Guarded against the two ways a ranking
lies: readings of different ages (staleness warning; the live sweep hit a real 18.4-day spread) and
vessels with no data (reported, never dropped). 25 new tests, suite 3377/0, verified read-only on
Demo across 10 scenarios. Prior:_

_2026-07-22 — **the KB citation tombstone no longer re-serves a withdrawn document in
full.** From Russell's copyright question: paraphrase-with-citation IS the right shape and the
assistant already does it, but citation cures plagiarism, not infringement — and one path
(`renderTombstoneHtml`) served up to 20,000 chars verbatim precisely when a publisher had pulled the
page. Capped to a 600-char excerpt via a pure, tested `buildTombstoneExcerpt`, `take: 3` on the read,
truncation disclosed, `noindex, noarchive`, plus a retraction warning (safety, not only legal).
10/10 tests, tsc + eslint clean. MERGED as **#462** (`8f6099b5`); not browser-verified — the
tombstone only renders for a *withdrawn* document. Prior:_

_2026-07-22 — **voice mode no longer cuts the user off mid-thought** (ticket `cmrvhj5b8…`,
PR #460 MERGED `ddeeaaf8`, ticket RESOLVED, branch pruned). The listen VAD's flat 1200ms silence bar
became an adaptive 1600→3000ms one that scales with how long the speaker has held the floor, plus
onset/release hysteresis so a trailing syllable doesn't start the clock; a "Done talking" control is
the opt-out. The reported "30 seconds" was a red herring — there is no utterance cap, that was just the
first pause over 1.2s. tsc + eslint + 3338 tests green on main. ⚠️ The auto-fix agent raced this ticket
and its draft PR #457 changed ONLY the test file (red CI, tests for a fix it never made) — closed as
superseded. NOT browser-verified: the fix is about how a real pause FEELS, so Russell has to re-test on
a phone. Prior:_

_2026-07-21 — **the backlog is CLEAR: 0 active feedback items, 0 open PRs.** A full
`/bug-triage` goalie run (live, all sweeps) reconciled the queue and cleared the pile: 26 backlog items
→ 0 active, 1 open PR triaged + merged (#443), 18 open issues → 10 kept. It found exactly ONE real
production bug among 6 Sentry issues — **#324**, a Leaflet debounce that outlived `map.remove()` — now
fixed and merged (**#455**); the other five were a single dev-worktree session and are closed, with a
`beforeSend` filter (**#456**) so that class never files again. ⚠️ Two things left for Russell: a
**Sentry-side inbound filter** (console; #456 drops events only after they are sent and counted), and
the standing decisions below (phantom-stock unwind, accountant GL sign-off). Prior: **plan 089 (inline voice in the dock) SHIPPED (PR #451).** Planned,
then triple-reviewed (council Codex+Gemini → eng → design) before a line was written, which paid for
itself: the reviews found a P0 the plan itself created — letting the user type during a voice session
silently breaks the assistant's memory, because `historyRef` only ever sees voice turns — so it needed
one additive method on `VoiceSession` and was never a pure presentation swap. Also caught: deleting
`aria-modal` breaks the dock's Escape handoff (`AssistantDock.tsx:132`), and two features
(`focusNotice`, the first-run helper) were about to vanish by omission. 3 TODOs filed (touch-target
minimum, tablet auto-expand, dock keyboard shortcut). tsc 0, eslint 0, **vitest 3310/0**, next build ok.
Prior: **plan 088 (one lot per vessel) is MERGED AND LIVE IN PROD** (PR #445, squash `c9ea0ad9`,
Vercel Production `success`; migration already applied, branches pruned). A vessel holds ONE lot; a
lot may occupy MANY vessels (LEDGER-12), enforced at the single `vessel_lot` write site plus a
`(tenantId, vesselId)` unique index. Every "which lot?" picker is gone and a tank shows what it is
MADE of. Ticket `cmruoc3yk…` RESOLVED, PR #444 closed as superseded, Mike DMed. Only the 375px
browser pass remains (needs a human login).
Prior: **assistant VOICE MODE is conversational and LIVE IN PROD** (#439
`9cc51cd8` + #441 `e516248a`, live-verified on a real device). Barge-in is now ADAPTIVE: a single
fixed loudness threshold structurally cannot separate the user's voice from the assistant's own
echo, so `echoAdjustedLevel()` subtracts the assistant's live output from the mic level — the bar
rises while it talks, drops in the gaps. Plus a voice-ONLY prompt seam (text chat + goldens
byte-identical), citations WRITTEN but never SPOKEN, units spoken as words, a thinking earcon, and
the new ElevenLabs voice. Vercel needed NO env change (verified: `ELEVENLABS_API_KEY` is the only
`ELEVENLABS_*` set, so code defaults apply). tsc 0, eslint 0, **vitest 3219/0**. ⚠️ Feedback tickets
`cmrtzeh63…` (Demo) + `cmrm5xew8…` (Bhutan) still OPEN — each has an `AGENTIC_FIX` run stuck
`RUNNING`, which `closeFeedbackItemCore` refuses to close over until it's neutralized.
Prior: **#373 "drop down" closed as REDUNDANT** (no code): the consumable vendor field is
already a fuzzy `VendorPicker` over first-class vendors (persists vendorId, NAMING-1) in both the Add/Edit form
(Plan 069) and the Receive panel (U17, PR #395); free-text was retired in #433. Mike DMed + RESOLVED. **This
closes the ENTIRE Mike consumables-flow cluster: #377 → #366/#370 → #372 → #374 → #373.** Prior: **#374 "cost"
closed as REDUNDANT** (U16 in PR #395, completed by #372/#435); Mike DMed + RESOLVED. Prior: **#372 consumable cost
surfacing MERGED** (PR #435, `b46cd30`): the detail view now shows each shipment's "Paid $X/unit" + explains
the weighted-average method (InfoHint + summary); read-only, reuses the engine's weightedAvgUnitCost; ticket
RESOLVED + Mike DMed. Prior: **#366/#370 receive-by-pack
MERGED** (PR #433, `3b13b6e`): retired the grams-only ReceiveModal so "Receive" opens the pack-aware Move-stock
panel; both tickets DMed + RESOLVED (reporter Mike). Prior: **Cornell Fruit Resources LIVE** (96 docs / 948 chunks, verify:knowledge-base
20/20). Landed as #424 (reconciling a parallel session's #411), then #425 crawl-error visibility, #426
the CampusPress CDN, #427 the dropped canonicalTitle. En route: main was found to be FABRICATING
publication dates from junk metadata, and a newly-allowlisted crawl target proved undiscoverable
without a reset. Prior: plan 085 CLOSED, MSU unreachable and DORMANT (#422); the sweep fail-closed
fix (#418) that un-broke the monthly refresh for all 21 sources._
