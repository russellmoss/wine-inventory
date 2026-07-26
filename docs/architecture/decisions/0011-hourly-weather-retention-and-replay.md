# ADR 0011 — Hourly weather: retention per series kind, and replay by ingest time

- **Date:** 2026-07-26
- **Status:** accepted
- **Plan:** `docs/spray_assistant/phases/S0-spike-hourly-lwd-retention-plan.md` · **Council:** `docs/spray_assistant/phases/S0-council-feedback.md`
- **Evidence:** `docs/spray_assistant/phases/s0-retention-economics.md` (measured) ·
  `s0-retention-decision.md` (decision) · `s0-observed-backfill.md` (Unit 0) ·
  `s0-hourly-field-inventory.md` (Unit 2)

## Context

S1 will add a tenant-scoped hourly weather table, and the runbook made two questions gate it: what
does hourly storage cost, and how long must it survive. Council S2 sharpened the second — *size
retention by replay horizon, not storage cost* — because pruning hourly data destroys the ability to
explain a past decision through harvest and after a correction event.

The plan's framing rested on a premise that measurement reversed. It assumed observed hourly data is
lost if not captured, and built the retention urgency on that irreversibility. **Unit 0 disproved
it**: NCEI ISD and the keyless Iowa Environmental Mesonet ASOS archive both serve past observed data
on demand, back past 2005, and the NWS live observations window is *seven* days rather than the one
or two the plan estimated.

Unit 2 then located where the irreversibility actually lives. The three series kinds are three
different acquisition modes — observe forward, forecast forward, reanalyze backward — and only one of
them is unrecoverable: **a past forecast issuance is gone the moment it is superseded**, and that is
precisely the decision-replay input. A reanalysis is not only re-fetchable but *revisable*, so a
stored copy can go staler than the source.

## Decision

**Retention is per series kind, and replay is satisfied by a decision snapshot rather than by raw
weather.**

**1. Three horizons, derived separately, satisfied by three different artifacts.** Council C13 was
right that the plan conflated them, and they do not agree:

| Horizon | Length | Artifact that satisfies it |
|---|---|---|
| Raw recomputation | ~18 months (current season + prior) | the raw hourly series |
| Decision replay | the life of the wine the fruit became | the decision record's own facts snapshot |
| Legal record | 3 years, and it constrains **content** | the spray application record, including wind at application |

Separating them is what makes bounded raw-weather retention safe: the unbounded horizon is not
carried by the thing being pruned. Council G-design-1 supplied the legal number — EPA WPS and state
rules require 2–3 year retention, and a year-three audit must show *why* a spray was legal, including
the wind at application.

**2. Per-kind policy.** OBSERVED: retain 18 months rolling, backfill beyond on demand. FORECAST:
retain the latest issuance plus every issuance a decision record actually cited. REANALYSIS: do not
retain as a primary; any stored copy is a cache carrying its fetch time.

**3. Replay keys on `ingestedAt`, not `providerIssuedAt`.** Replay asks what the system *knew* when
it composed a decision, and the system knew what it had ingested. A row issued at 06:00 but ingested
at 14:00 after a late cron was not available to a decision made at 12:00. `providerIssuedAt` is also
structurally unavailable for a whole provider — Open-Meteo exposes no issuance timestamp on either
endpoint — so it must be nullable, and a null must mean *"the provider does not tell us"* rather than
*"we failed to record it"*.

**4. Supersession and replay are different operations.** The brief contradicts itself (§4.3 says
actual weather replaces forecast weather; §17.3 says decisions replay under facts-as-of-then). Both
are right about different operations: supersession is forward-looking and governs what to do next,
replay is backward-looking and governs the audit trail. Supersession never rewrites a decision
record; it produces a new one. Amendments are drafted in `s0-retention-decision.md` §2.

**5. Two invariants.** WEATHER-1: a forecast row never satisfies a historical read — and its guard
must watch the *relative* cost of the filtered query, because if the safe query ever becomes the slow
query someone will optimise it away via a p95 chart. WEATHER-2: pruning may not break replay; a cited
row is retained regardless of age. WEATHER-2 is S1's acceptance test and the runbook had not
nominated it.

## Consequences

- S1 ships a bounded raw-weather retention job rather than an unbounded archive, and its gate is
  WEATHER-2's replay test.
- The decision record must carry a facts snapshot sufficient to replay without raw weather —
  mutually constraining with the proposed shape in `s0-decision-record-shape.md`.
- Measured storage is affordable: **5.51 MB/vineyard-year** for OBSERVED at the 5-year projection
  (659 B/row, 413 MB for 15 vineyards × 5 years), well inside the pre-committed 25 MB ceiling.
- Forecast replace-in-place is **not** free: 12 replace cycles left the table at **4.63× its
  steady-state size**, and that overhead scales with issuance cadence rather than data volume — the
  one cost dimension a row-count projection cannot see.
- Read latency breached its ceiling on one shape (**266 ms p95** for the S5b black-rot wet-run scan
  against 250 ms). Partial indexes per series kind fix it (152 ms) but degrade the cross-kind replay
  read 4.4× (42 → 184 ms), so S1 needs both partial indexes and a dedicated replay index.
- **NWS re-issuance cadence varies by ~9× BETWEEN GRIDPOINTS** — measured at exactly 60 min at
  Madera, 54–86 min at Russian River, 151 min at Monticello and 550 min at Stoney Hill. Against the
  measured 179 h retained horizon that is a **20×–179×** multiplier for a retain-every-issuance
  posture. A retention job sized on one gridpoint's cadence is wrong by an order of magnitude at
  another, so **S1 must size per gridpoint or measure cadence at ingest and adapt.**
- Two schema requirements, both found by the measurement failing rather than by reading it:
  `NULLS NOT DISTINCT` on the replace-identity index (a nullable `providerIssuedAt` otherwise makes
  the unique constraint enforce nothing for the rows where it is null, and an `ON CONFLICT` upsert
  silently inserts duplicates), and a surrogate id that is distinct per series kind.

## Tripwire

- **If a new consumer needs to recompute an index from raw weather older than 18 months**, the
  raw-recomputation horizon is wrong and this ADR reopens. The current bound comes from correction
  events, harvest-date re-evaluation and within-season model rebuilds — all within-season or shortly
  after.
- **If the decision record stops carrying a sufficient snapshot**, raw-weather pruning becomes unsafe
  immediately and silently. WEATHER-2's guard is what makes that loud.
- **If `ingestedAt` is ever backfilled or rewritten**, replay becomes fiction. It is a system-time
  column and must be write-once.
- **Open, and not measured:** how long a lot's residue flag must stay explicable. This ADR assumes
  "as long as the wine exists", inferred from S8's design rather than stated as a requirement.

## What this ADR does NOT decide

The cheaper physical key shape. Dropping the text cuid primary key and the `(tenantId, id)`
composite-FK guard measures **66 % smaller**, and that number is recorded in Unit 7 as a
non-decisionable side result only. Council C10: a storage spike is the wrong layer at which to reopen
a tenancy safety invariant, and the tenancy invariants were held fixed in every arm of the headline
measurement.
