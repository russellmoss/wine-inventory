# Council Feedback — Release 4A Weather & Climate spine (P8)

**Date:** 2026-07-25
**Reviewers:** Codex gpt-5.4 (types + data layer), Gemini 3.1 Pro (agronomy + product + data quality)
**Plan:** [phase-8-weather-climate-spine-plan.md](phase-8-weather-climate-spine-plan.md)

## Synthesis — the load-bearing findings

Both reviewers converged on **two** issues and each surfaced its own critical set. The agronomy
findings are the reason the council was worth running — they're the kind of thing that ships wrong and
embarrasses you in front of a real grower.

### Converged (both reviewers)
1. **Timezone / observation-time shift is bigger than "use zonedDateKey."** Station COOP/ACIS data reports
   at a local obs time (often 7–8 am LST) representing the *prior* 24 h; grids run midnight-local or UTC.
   Joining providers on a raw `date` misaligns a frost by a day. **Fix: normalize each provider's source
   day into a canonical vineyard-local civil day AT INGEST** (`localDate`), applying the standard met shift
   for AM-obs stations (Tmax→date−1, Tmin→date). Query-side `zonedDateKey` is necessary but not sufficient.
2. **Schema: which is authoritative?** The plan made both the snapshot and the daily rows authoritative,
   and `metricSource` can't encode per-metric sourcing. **Fix (folded): the daily fact table is
   authoritative; the "snapshot" collapses to a per-vineyard config + a pull-log.**

### Codex (types + data layer) — critical
3. **Per-metric sourcing can't be a single `metricSource` column.** Restructure daily rows to **one row per
   (vineyard, localDate, providerKey)** — raw per-provider observation, metrics wide. Spread = compare rows;
   per-metric (RH-from-grid) = read RH from the grid provider's row; gap-fill = use another provider's row,
   stamped. This removes the mutable CURRENT/SUPERSEDED snapshot machine entirely.
4. **CDO daily cap can't be gated by a monthly counter.** `WeatherProviderUsage` needs a **daily key**
   (`@db.Date`) for rate-limit enforcement; keep monthly rollup for telemetry.
5. **No outbound fetch inside `runInTenantTx`.** Fetch/normalize/validate OUTSIDE the tx; the tx wraps only
   the short write set (usage increment, daily-row upsert, config upsert).
6. Idempotency: separate enqueue-idempotency from data identity; upsert daily rows on
   `(tenant, vineyard, localDate, providerKey)` (recent days are legitimately mutable: provisional→final as
   gridMET/CFSv2 finalizes) — no supersede race because there's no CURRENT flag to flip.
7. Missing validation gates: concurrent-duplicate ingest, numeric sanity (`tmin ≤ tmax`, RH 0–100,
   precip ≥ 0), SSRF redirect/allowlist. `date` must be `DateTime @db.Date`, not "YYYY-MM-DD or Date".
8. **Remove the "weekly season-aggregate recompute"** — it contradicts "compute on read." On-read is fine at
   vineyard scale; the *tool* (deterministic code) does the math, not the LLM.

### Gemini (agronomy + product) — critical
9. **Hemisphere/season hardcoding.** "April 1–Oct 31" is Northern-only. **Fix: derive the season window
   from latitude** (S. hemisphere Oct–Apr crosses the calendar year) and **group YoY by `SeasonYear`, not
   calendar year.** (Bhutan ≈ 27°N so NH, but build it right.)
10. **Gap-fill paradox.** A station GDD total silently gap-filled from the grid IS a blended metric —
    contradicts "spread not blend." **Fix: compute each aggregate strictly per-source with a completeness %**
    (`Station GDD 1450 (92% complete)` vs `Grid GDD 1520 (100%)`). Gap-filled continuous series, if shown, is
    a separate clearly-labeled derived view, never the headline aggregate.
11. **Daymet's 365-day calendar** drops Dec 31 in leap years → off-by-one on cross-provider daily joins.
    Handle at ingest (null-pad or interpolate Dec 31).
12. **GDD cap semantics + formula.** `MAX(0, MIN(30,(Tmax+Tmin)/2) − 10)` — cap the *average*, not Tmax.
    Document it (growers expecting Baskerville-Emin sine method will ask why numbers differ from UC Davis).
13. **Frost without phenology is agronomically meaningless.** A March frost is dormancy; a post-budbreak May
    frost is catastrophic. **Fix v1: "sub-0 °C events in a vulnerable window"** (lat-derived, e.g. Apr 1–Jun 15
    NH), distinguish 0 °C (light) vs −2 °C (killing). Real phenology is 4B.
14. **"Frost last night" latency.** At 6:30 am gridMET (14 h) and ACIS may not have last night yet. The tool
    must check freshness and say "I don't have last night's data yet, latest is [date]" — never fabricate.
15. **Precip framing:** call it "Regional Rainfall Estimate" + a "4 km average, not your gauge" tooltip.

### Design questions needing the owner's product judgment
- **Q1 — Primary-source model:** force the grower to pick ONE primary climate source (default nearest
  quality station, grid if none < ~10 mi), and have the **summary card + assistant speak only in that
  primary** (spread lives behind a "Compare sources / validation" tab)? This reconciles "simple for growers"
  with "spread not blend" — the grower sees one number; the spread is a data-trust view. (Both reviewers
  recommend this.) Alternative: show station and grid numbers equally at the top.
- **Q2 — Frost framing:** adopt the vulnerable-window "sub-0 events" framing (lat-derived window, 0 vs −2 °C)
  for v1 rather than raw "last spring/first fall frost"?
- **Q3 — Card placement:** vineyard-root page only for 4A (not the block page), to avoid two blocks showing
  identical numbers and eroding trust?

---

## Raw Response — Codex (gpt-5.4)

CRITICAL
- VineyardClimateDaily modeled as a snapshot child, but `@@unique([tenantId, vineyardId, date, metricSource])`
  makes overlapping re-pulls and superseded snapshots impossible without mutating history. Fix: immutable
  snapshot-bound rows with uniqueness on `(tenantId, snapshotId, date, providerKey)`, reads join the current
  snapshot only.
- Row shape can't represent per-metric sourcing. A single `metricSource` + `filledFromProvider?` can't encode
  "station for temp/precip, grid for RH". Fix: normalize to one row per metric OR wide row with per-metric
  provider fields.
- Idempotency/current-state under-specified. `(tenant,vineyard,primaryProvider,windowEnd)` insufficient; no DB
  invariant for one CURRENT snapshot. Fix: separate enqueue idempotency from snapshot identity; snapshot
  uniqueness ≥ windowStart+windowEnd+sourceFingerprint; partial unique index for one CURRENT per vineyard.
- WeatherProviderUsage keyed monthly but gates CDO's daily cap → mis-enforces. Fix: daily key (`@db.Date`);
  monthly telemetry separately.
- U5 permits outbound fetches inside runInTenantTx — wrong for Neon interactive tx. Fix: fetch/normalize/
  validate outside; tx only for the short write set.

SHOULD FIX
- `date (zone-local YYYY-MM-DD or @db.Date)` too loose → `DateTime @db.Date`, canonical vineyard-local civil day.
- Daily denormalizes vineyardId while FK'ing snapshot; enforce match or drop vineyardId / composite FK.
- "Compute on read" conflicts with "weekly recompute". Remove the recompute job; on-read fine at scale.
- Index too weak for spread/comparison reads; add covering index matching the real query path.
- Missing gates: concurrent dup ingest, single-current invariant, partial-provider semantics, SSRF allowlist,
  numeric sanity (tmin≤tmax, RH 0..100, precip≥0). Add an idempotency/concurrency verifier, not just verify:weather.

DESIGN QUESTIONS
- Canonical artifact: snapshot row or daily fact table? Plan makes both authoritative — root of the schema tension.
- "No fabricated weather": primary-fetch-fails-writes-nothing, or any-provider-fails-writes-nothing? Make explicit.
- On-read aggregates sound at this scale if reads stay vineyard-scoped; add a derived summary table only if
  org-wide dashboards / sweep-time alert fan-out arrive later.
- "Frost last night" correct only if each provider's source day is mapped into the vineyard tz BEFORE storage.

## Raw Response — Gemini (3.1 Pro)

CRITICAL
1. Hemisphere/season bug: "April 1–Oct 31" hardcodes NH. Mendoza/Otago/Stellenbosch are Oct–Apr; tropical
   high-altitude may be continuous. Fix: configurable/lat-inferred season; YoY groups by SeasonYear crossing
   the calendar year in SH.
2. Timezone & observation-time shift: can't join gridMET/Daymet/station on `date`. COOP reports AM LST for the
   prior 24 h; grids UTC/midnight-local. Fix: canonical Local_Date column; apply met shift for AM-obs (Tmax→
   date−1, Tmin→date).
3. Gap-fill paradox: "never blend" vs "gap-fill from grid" — a gap-filled seasonal GDD is a blended hybrid.
   Fix: aggregate strictly per-source with completeness %; don't cross-pollinate.
4. Daymet 365-day calendar drops Dec 31 in leap years → off-by-one. Fix: null-pad/interpolate Dec 31.

SHOULD FIX
1. GDD cap: MAX(0,...) and cap the AVERAGE `MIN(30,(Tmax+Tmin)/2)−10`, not Tmax; document (Baskerville-Emin
   sine method is what some expect).
2. Frost needs phenology. March frost = dormancy; post-budbreak = catastrophic. v1: "sub-0 events in vulnerable
   window" (Apr 1–Jun 15 NH), 0 °C light vs −2 °C killing.
3. Gridded precip distributes localized storms over 4 km. Rename "Regional Rainfall Estimate" + tooltip.
4. "Frost last night" latency: at 6:30 am data isn't in. If today's Tmin is NULL, hard-prompt the assistant to
   say it doesn't have the reading yet and point to physical gauges.

DESIGN QUESTIONS
1. Showing the spread may confuse a non-technical farmer ("am I Region III or IV?"). Force a Primary Climate
   Source at onboarding; summary + assistant speak only in the primary; spread behind a Compare/Validation tab.
2. Vineyard vs block granularity: two blocks at different elevations show identical numbers → lost trust. Put
   the card on the Vineyard root page only for 4A, or add a macro-climate banner on the block page.
3. YoY needs identical temporal axes. Expose a precomputed GDD_SeasonToDate; don't make the LLM do date math.
