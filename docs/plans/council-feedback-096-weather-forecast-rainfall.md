# Council Feedback — Plan 096: Weather Forecast + Rainfall Time-Series

**Date**: 2026-07-26
**Plan**: `docs/plans/2026-07-26-096-feat-weather-forecast-rainfall-plan.md`
**Reviewers**: Codex gpt-5.4 (types + data layer + migrations), Gemini 3.1 Pro (product logic + viticulture + UX)
**Adjudication**: each finding verdicted ACCEPT / PARTIAL / REFUTE with mechanism. Accepted fixes are folded into the plan file (rev 2).

---

## Critical Issues (accepted)

### C1 — Replace-upsert leaves stale future rows (Codex → U15) — ACCEPT
Upsert on `(tenantId,vineyardId,providerKey,targetDate)` is NOT replace-not-accumulate: if a later
response shortens the horizon or omits a day, the orphaned future row survives and the strip,
assistant, and alert logic keep reading it. **Fix folded**: inside the same `runInTenantTx`,
delete the managed forward horizon for that `(vineyard, provider)` (targetDate ≥ siteToday) before
the bulk insert. Delete-then-insert, atomic.

### C2 — Alert emit races between cron and on-view refresh (Codex → U21) — ACCEPT
Both paths can read the same pre-escalation state, both emit, then both upsert. **Fix folded**:
claim-first state advance — `INSERT … ON CONFLICT … DO UPDATE SET notifiedTier = EXCLUDED.notifiedTier
WHERE vineyard_weather_alert_state."notifiedTier" < EXCLUDED."notifiedTier" RETURNING id` — emit
notifications ONLY when the claim won rows. Same claim-first idiom as the NDVI derivative cache.

### C3 — Alerts must be scoped to the displayed primary series (Codex → U15/U21/U23) — ACCEPT
"Next-72h rows" unscoped would alert from the secondary provider too — a never-blend violation.
**Fix folded**: one shared `selectPrimaryForecastSeries` in `forecast-read-core`; U16 (display),
U21 (notify), U23 (badges), U25 (assistant) all consume that exact selector.

### C4 — NWS banner "stored copy" had no storage (Codex → U22) — ACCEPT
Nothing in the schema held the verbatim alert between refreshes. **Fix folded**: Phase 3 migration
adds `activeAlertsJson Json?` + `activeAlertsFetchedAt DateTime?` on `VineyardWeatherConfig`
(small bounded array: event, headline, severity, ends??expires, url). U22 writes at refresh,
reads for render. Multiple simultaneous alerts: render ALL, severity-desc (also answers Codex DQ2).

### C5 — Sustained-heat undetectable inside a 72 h horizon (Gemini → U15/U20/U21) — ACCEPT
A 3-consecutive-day event cannot be seen in a 72-hour look-ahead until it has effectively begun.
**Fix folded**: tier CLASSIFICATION always runs over the full 7-day primary series; the
notification horizon stays 72 h for single-day frost/heat tiers but SUSTAINED_HEAT notifies as
soon as the run is detected anywhere in the 7-day window (heat prep is multi-day planning).

### C6 — No de-escalation / "all clear" (Gemini → U21) — ACCEPT
Forecasts oscillate; a grower who mobilized frost crews off a Hard Freeze warning must be told
when the forecast improves, or the silence costs real money. **Fix folded**: when a previously
notified `(vineyardId, targetDate, alertType)` at WARNING-or-worse drops below WATCH on a later
run, emit ONE "forecast improved / alert cleared" notification and record `clearedAt` on the
state row (no re-alert flapping: a re-crossing after a clear is treated as a fresh escalation
from cleared state).

### C7 — Nullable forecast fields must be explicit end-to-end (Codex → U10/U11/U12/U16) — ACCEPT (clarification)
The spec's TS contract already declares `tmaxC/tminC/precipMm/precipProbabilityPct/windMaxKph`
as `number | null`; folded the explicit mirror into U11: all five DB columns nullable, CHECK
constraints null-tolerant, and U16's day-1-no-high card asserted in the read-core test.

## Should-Fix (accepted)

### S1 — Enum migration isolation ≠ one file in a big PR (Codex → U18) — PARTIAL
Codex wants a separate deploy. The proven repo pattern (Phase 14 `SEMIMONTHLY`) is: **own
migration file, first in the phase, no other statement in it** — Prisma runs each migration in
its own transaction, so a later migration in the same deploy may use the value. Folded: U18 stays
in the Phase 3 PR but MUST be the first migration and the PR description must state the ordering;
if CI/deploy ever batches migrations differently, escalate before merging.

### S2 — `unitSystem` default keyed off legacy `coverageState` misses AK/HI (Codex → U1) — ACCEPT
AK/HI/territories are `GLOBAL_COARSE` under the CONUS bbox yet are US users. **Fix folded**: the
IMPERIAL default derives from the NEW NWS forecast-coverage bboxes (Unit 10), not
`coverageState`. Backfill in U1 uses the same predicate (a tiny lat/lon helper shared with U10).

### S3 — 13–24-month rainfall coverage decays over time (Codex → U6/U7) — ACCEPT
The rolling 400-day window plus a one-time backfill leaves a growing hole between 400 days and
3 years as the calendar advances. **Fix folded**: the daily sweep re-runs the (idempotent,
one-request-per-provider) 3-year full-year backfill **monthly per vineyard** (stamp
`lastHistoryTopUpAt` on config; run when > 30 days old). The manual U7 script remains only the
one-time seed for existing vineyards.

### S4 — Config cache writes must be explicit + transactional (Codex → U12/U13/U15) — ACCEPT
Folded into U15: persisting `timeZone`, `nwsGridId/X/Y` (and OM-captured tz) is an explicit step
inside the ingest tx, with a first-ingest persistence test. Otherwise `siteToday` silently falls
back and the one-today guarantee quietly dies.

### S5 — Overnight-low date semantics (Gemini → U12/U21) — ACCEPT (copy + convention, not re-keying)
Every consumer forecast product shows "Mon 24°/−2°" where the low is Monday NIGHT (physically
Tuesday ~5 a.m.) — growers expect that card shape, so pairing and `targetDate` keep the card
date. But alert COPY must name the night unambiguously: "night of Mon Apr 3 → Tue Apr 4".
Folded into U20/U21 copy requirements + a test asserting the two-date phrasing.

### S6 — QPF midnight pro-rata invents precision (Gemini → U12) — ACCEPT
Pro-rata splitting a 6-h bucket assumes uniform rain — fake data under the section's own honesty
rules. **Fix folded**: assign each QPF interval to the civil day in which the interval ENDS
(climatological norm). Simpler code, honest number, fixture updated.

### S7 — Migration ordering hygiene (Codex → U1) — ACCEPT (process note)
Folded into the phase-gate checklist: rebase each phase branch onto current main before merge and
run `prisma migrate status` there; timestamps re-checked at that point (parallel-lane rule).

### S8 — Unit toggle needs a surface (Gemini DQ1 → U3) — ACCEPT
"Defaults only" was the user's answer for ALERT THRESHOLDS, not units; an override action with no
UI is a dead end. **Fix folded**: a minimal °F/°C toggle in the existing "Where this estimate
comes from" panel (same idiom as the provider-override selector). One control, no settings page.

## Refuted (with mechanism)

### R1 — "Year-round ingest contaminates GDD/Winkler" (Gemini C3) — REFUTED
The math cores filter at COMPUTE time: `composeClimateSummaryCore` → `filterToSeason` /
`seasonWindowFor` before any GDD accumulation, and U6 explicitly leaves every one of those call
sites untouched — stored off-season rows never enter the season math. The two regression-gate
test files run on the real cores. Gemini's scenario requires a filter that doesn't exist in the
compute path. **Belt added anyway** (cheap): one new test asserting season GDD over a rows-set
containing winter days equals the same computation over season-only rows.

### R2 — Mobile strip crushing (Gemini DQ2) — ALREADY IN PLAN
U16 already specifies horizontal scroll on mobile / grid on desktop; folded the `snap-x` detail.

## Design Decisions taken (were council questions)

1. **SUSTAINED_HEAT identity** (Codex DQ1): `targetDate` = first day of the consecutive run;
   a shifted run start creates a new key (acceptable re-notify — it IS a different event window).
   Documented in U20.
2. **Multiple simultaneous NWS alerts** (Codex DQ2): render all, severity-desc, each verbatim —
   folded into C4's storage shape.
3. **Official vs computed conflict** (Gemini DQ3): NO suppression in either direction. The
   official banner is authoritative-voice and visually distinct; computed badges are mechanical
   threshold statements. One line of microcopy on the badge legend ("Cellarhand computed —
   official advisories shown above when issued") prevents the contradiction reading as a bug.
   NWS knows dormancy/climatology; our badges deliberately don't gate on it (they modify
   severity) — both statements are true and labeled.

## Design Questions — RESOLVED by Russell (2026-07-26)

1. **Alert digest grouping** (Gemini S2): **CONFIRMED — digest per (night, tier)**. One
   notification listing affected vineyards ("Hard Freeze warning, night of Tue→Wed — 8
   vineyards: …"); per-vineyard dedup state unchanged underneath.
2. **De-escalation notification** (C6): **CONFIRMED — send all-clears**. One "forecast improved /
   alert cleared" emit when a WARNING-or-worse alert drops below watch; re-crossing escalates
   fresh from cleared state.

---

## Raw Response — Codex (gpt-5.4)

**CRITICAL**
- U15: `INSERT ... ON CONFLICT` on `(tenantId, vineyardId, providerKey, targetDate)` is not "replace-not-accumulate". If a later provider response shortens the horizon or omits a day, the old future row survives and will still be read by the strip, assistant, and alert logic because `issuedAt` is just a column, not part of identity. Fix: in the same `runInTenantTx`, delete the managed horizon for that `(tenantId, vineyardId, providerKey)` before bulk insert, or delete rows not present in the incoming `targetDate` set.
- U21: the alert-state write does not actually make notification emit idempotent under concurrency. Cron and on-view refresh can race, both read the same pre-escalation state, both call `emitNotificationTx`, and only then upsert the same `vineyard_weather_alert_state` row. Fix: make the state advance the claim step with a single `INSERT ... ON CONFLICT ... DO UPDATE ... WHERE notifiedTier < newTier RETURNING` or use a serializable transaction with retry; only emit when this tx won the state transition.
- U15/U21/U23: the plan stores every covering provider's forecast, but U21 says "next-72h rows" without scoping to the displayed primary series. That will emit alerts from the secondary provider or from both providers, which breaks the repo's existing never-blend contract. Fix: add one shared "select primary forecast series" core and make U21, U23, and U25 all consume that exact selector.
- U22: "render stored copy between" has no storage unit behind it. Repo ground truth says there is no persisted weather-alert log today, and U11/U19 add nothing for active NWS banners, so there is nowhere to store the verbatim alert copy, timestamps, or link. Fix: add persisted alert-banner storage in schema phase, then have U22 read/write it.
- U10/U12/U16: the forecast contract is internally inconsistent. U12 explicitly produces `tmaxC = null` for evening NWS fetches, and U16 explicitly renders "—" for missing highs, but U10 defines `ForecastDailyRecord` as if `tmaxC`/`tminC` are required fields. Fix: make nullable fields explicit in the TypeScript contract and DB schema, then update every constructor/read path to handle them without sentinels or casts.

**SHOULD FIX**
- U18 and phase map: the enum migration is not actually isolated if Phase 3 is one PR containing U18–U23. On a live shared DB, "committed before referencing code" is not the same as "deployed before referencing code", and this is exactly the enum lane-ordering problem the plan claims to mitigate. Fix: ship U18 as its own PR/deploy, then land U19–U23 after the value exists everywhere.
- U1/U3/U10: `unitSystem` default/backfill is keyed off legacy `coverageState='US_HIGH_RES'`, but U10 explicitly says forecast NWS coverage is broader than that legacy coverage logic. AK/HI/territory vineyards can land on NWS forecast coverage while still defaulting to METRIC. Fix: derive unit defaults from explicit geography or the new forecast coverage decision, not from coverageState.
- U6/U7/U8: the 24-month rainfall feature depends on a manual script. Normal ingest only widens to rolling 400 days; everything older relies on `scripts/backfill-weather-offseason.ts` being run "from MAIN checkout", which is not an enforceable production path. Fix: either schedule that job or fold the 3-year retention refresh into the regular ingest path, and add a gate that proves January and July 24-month windows are complete.
- U12/U13/U15/U2: timezone/grid-cache persistence is described, but no unit makes it an explicit transactional step. U12/U13 say "capture/persist", yet U15 only specifies forecast-row upserts; if config cache writes are omitted or done outside the ingest tx, siteToday() falls back to AppSettings/UTC and the "one today definition" guarantee is gone. Fix: make config cache updates explicit inside U15's transaction and add a first-ingest persistence test.
- U1: "Timestamp must sort after everything migrate status shows as applied" is not a safe migration-ordering rule for parallel lanes. Hand-sorting migration names does not prove the branch applies cleanly atop main. Fix: require rebase onto current main before merge and a scratch `prisma migrate deploy` gate against a prod-like DB for each phase PR.

**DESIGN QUESTIONS**
- U20/U21: what is targetDate for SUSTAINED_HEAT? A 3-day run is not a single-day event, but the dedup key is `(tenantId, vineyardId, targetDate, alertType)`. Pick a canonical identity now, or you will either spam one event multiple times or suppress a new event as the window slides.
- U22: how do you render multiple simultaneous NWS active alerts for one point? The plan says "headline verbatim + link" in the singular, but the endpoint can return multiple active alerts. Define ordering/aggregation before the UI and storage shape harden.

## Raw Response — Gemini (3.1 Pro)

### CRITICAL
**1. Sustained Heat Horizon Paradox (U15, U20, U21)** — You defined sustained heat as "3+ consecutive ≥35°C" (U20) but set the notification look-ahead horizon to 72 hours (U15, U21). A 72-hour (3-day) window cannot reliably detect a 3-day consecutive forecast. If the heatwave starts tomorrow (Day 1), Day 3 falls outside the 72-hour rolling window at today's cron run. The system will either alert too late (on the day the heatwave starts) or miss it entirely due to hour offsets. Fix: Extend the notification look-ahead horizon in U15/U21 to 5 days (120 hours) specifically so the pure-core can evaluate 3 future days before the first day begins.
**2. Missing De-escalation / "All Clear" UX (U21)** — The plan relies on "escalation-only re-notification... repetition is silent" (U21). Weather forecasts oscillate. If a Monday forecast predicts a Hard Freeze (−2°C) and issues an alert, but Tuesday's NWS update warms the forecast to 3°C (no alert), the system stays silent. The grower will mobilize wind machines and night crews (costing thousands of dollars) for a freeze that is no longer predicted. Fix: U21 must implement a "De-escalation / Alert Cleared" path. If a previously alerted (vineyardId, targetDate) drops out of the threshold in a subsequent cron run, emit an explicit "Forecast Improved / Alert Cleared" notification.
**3. GDD / Winkler Math Contamination via Year-Round Ingest (U6)** — U6 introduces "year-round ingest" and relies on the regression gate that "existing GDD/Winkler outputs [are] byte-identical." Winkler (base 10°C / 50°F) is strictly a growing-season metric (Apr-Oct NH). Historically, off-season data might have been missing. If you feed year-round data into the existing Winkler math, warm winter weeks will artificially accumulate GDD, inflating the season total and ruining agronomic correctness. The test fixtures might pass if they only contain seasonal data, masking a production disaster. Fix: U6 must ensure the ingest adapter explicitly masks/filters dormant-season dates to null or 0 GDD accumulation before passing to the GDD pure-core, enforcing the calendar boundaries explicitly.

### SHOULD FIX
**1. NWS "Tonight" Target Date Mismatch (U12, U19)** — Frost damages vines in the early morning (e.g., 5 AM Tuesday), but NWS forecast periods attribute the overnight low to the "Tonight" block of the previous civil date (e.g., Monday Night). If U12 pairs these and U19 keys the targetDate as Monday, the UI/notifications will warn of a frost on "Monday." Growers record and reason about frost on the morning it happens. Fix: U12's day/night pairing logic must explicitly anchor the overnight low to the civil date of the morning it occurs (Tuesday).
**2. Regional Alert Spam Multiplier (U21)** — "ALL active tenant members receive... [alerts]". Bhutan Wine Co operates 8 vineyards. If a high-altitude cold front drops temps across the region, all 8 vineyards cross the Watch, then Warning, then Hard Freeze thresholds. That is 24 distinct notifications per tenant member in a single night. This trains users to immediately route Cellarhand to their spam folder. Fix: U21 must group and debounce notifications at the Tenant + targetDate + alertType level. Send a single digest: "Hard Freeze Warning for 8 vineyards on [Date]."
**3. QPF Midnight-Straddle Fake Precision (U12)** — NWS often issues QPF in 6-hour blocks (e.g., 18z to 00z). Midnight PST is 08z. U12 dictates a "midnight-straddle split." Splitting a 6-hour NWS rain block precisely at civil midnight mathematically assumes uniform rain distribution. This invents fake data and explicitly violates the "not your rain gauge" honesty mandate. Fix: Drop the linear interpolation. U12 should assign the entire QPF amount to the civil day in which the NWS reporting period ends, matching standard climatological norms.

### DESIGN QUESTIONS
**1. Unit Override UX Dead End (U1, U3)** — "Bhutan defaults METRIC... US-coverage defaults IMPERIAL... user-overridable server action, no UI beyond that." If the Bhutanese winemaker acquires a US test vineyard, the app provisions it in Imperial. Since you specified "no UI beyond that," there is literally no way for the user to invoke the override action to view their US vineyard in Celsius. Fix: Are we requiring support staff to manually trigger this via API for cross-border users, or did you forget to include a minimal toggle (e.g., in Vineyard Settings) in U1?
**2. Mobile Viewport Crushing (U16)** — U16 mounts a "7-card forecast strip on top" of the existing WeatherCard. A phone screen is narrow. If these 7 cards stack vertically or flex-wrap, they will consume the entire viewport, pushing the critical daily GDD, map, and current conditions entirely below the fold for a farmer in the field. Fix: Does U16 mandate a horizontal, native overflow-x-auto (swipeable) layout with snap-x to preserve vertical screen real estate?
**3. Official vs. Computed Alert Conflicts (U22, U23)** — U22 renders NWS active alerts verbatim; U23 renders computed badges. NWS issues a "Frost Advisory" based on climatology/season status, not just a hard ≤36°F line. If the temp drops to 37°F, NWS might issue an advisory, but your computed badge is silent. Conversely, it drops to 30°F, generating a computed "Hard Freeze" badge, but NWS issues nothing because it's officially the dormant season. The UI will contradict itself. Fix: What is the resolution matrix? If an official NWS alert exists, does it suppress the U23 computed badge to prevent conflicting directives to the grower?
