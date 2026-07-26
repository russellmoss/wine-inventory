---
title: S0 Unit 8 — the retention decision: three horizons, one policy per series kind
type: phase-artifact
phase: S0
unit: 8
date: 2026-07-26
status: decided
gates: S1
---

# S0 Unit 8 — the retention decision

Runbook question 2 and council S2, in writing, plus the resolution of the brief's §4.3 / §17.3
contradiction. **Gate artifact.** Numbers from [s0-retention-economics.md](./s0-retention-economics.md)
(Unit 7), [s0-observed-backfill.md](./s0-observed-backfill.md) (Unit 0) and
[s0-hourly-field-inventory.md](./s0-hourly-field-inventory.md) (Unit 2).

---

## 0. The finding that reverses the plan's premise

Plan §1.3 built the retention urgency on observed data being lost if not captured. **Unit 0
disproved it**: NCEI ISD and the keyless IEM ASOS archive both serve past observed data on demand,
back past 2005. And the NWS live window is **seven days**, not "roughly a day or two" — bisected at
every intermediate offset.

Unit 2 then found where the irreversibility actually lives:

| Series kind | Direction | Re-fetchable after the fact? | Retention is therefore… |
|---|---|---|---|
| OBSERVED | observe forward | ✅ **yes** — two independent archives | a **convenience** decision |
| FORECAST | forecast forward | ❌ **no** — a past issuance is gone once superseded | the **only** irreversible one |
| REANALYSIS | reanalyze backward | ✅ yes, and it **improves** — reanalyses are revised | a **caching** decision |

> **The irreversibility sits with FORECAST, not with OBSERVED — the opposite of where the plan put
> it.** What cannot be recovered is *what the forecast said at the moment a grower acted on it*, which
> is precisely the decision-replay input. Every argument in the plan that ran from "observed data is
> lost forever" must be re-pointed at forecast issuances or dropped.

⚠️ And REANALYSIS being *revisable* is a hazard nobody had named: a stored ERA5 row can drift out of
agreement with the live archive, so a recomputation months later can legitimately produce a different
answer from identical code. That is a replay-integrity problem hiding in the kind that looks safest,
and §4 handles it.

---

## 1. Three horizons, derived separately (council C13)

The plan's first draft conflated them. They need not agree, and here they do not.

### 1.1 Raw-recomputation horizon — how far back must we be able to RECOMPUTE an index from raw weather?

Driven by the longest-lived derived quantity that can be invalidated and must be rebuilt. Three
things bound it:

- **Late spray-correction events** (rule §3.14) propagate to four consumers. A correction entered
  weeks after the fact re-opens residual, rotation, PHI and compliance for the corrected window.
- **Harvest-date re-evaluation** (council C8): moving a pick date re-evaluates the trailing PHI
  window, which re-evaluates the weather-dependent residual decay across it.
- Within-season model rebuilds — a corrected phenology biofix shifts every degree-day accumulation
  after it.

All three are **within-season or shortly after**. Nothing in this list reaches back across a dormant
season.

> **Raw-recomputation horizon: the current season plus the preceding one — call it 18 months.**

### 1.2 Decision-replay horizon — how far back must a past decision be EXPLICABLE?

This is the one a snapshot can satisfy without raw data, and it is much longer, because it is bounded
by the *product*, not by the model:

- the **lot-residue flag follows fruit into the cellar through blending** (S8) and therefore lives as
  long as the wine does — which for a bottled wine is years and for a library wine is decades;
- a compliance or liability question about a spray can arrive at any point while that wine exists.

> **Decision-replay horizon: the life of the wine the fruit became.** Unbounded in practice, which is
> exactly why it must NOT be satisfied by retaining raw hourly weather.

### 1.3 Legal-record horizon — how long must the underlying record survive independently?

⚠️ **Council G-design-1 supplies the first real number.** EPA Worker Protection Standard and state
rules (e.g. CA DPR) require pesticide application records retained **2–3 years**, and an audit in
year three must show **why a spray was legal — including the wind at application**.

> **Legal-record horizon: 3 years, and it constrains CONTENT as well as duration.**

That last clause is load-bearing and ties straight back to Unit 2's wind finding: **wind at
application must survive in the record**, so a retention policy that keeps a spray row but prunes the
weather that made it legal fails the audit while looking complete.

### 1.4 Which artifact each horizon governs

| Horizon | Length | Governs |
|---|---|---|
| Raw recomputation | 18 months | the raw hourly weather series |
| Decision replay | life of the wine | the **decision record's own facts snapshot** — never raw weather |
| Legal record | 3 years (content-constrained) | the spray application record, including wind at application |

**They are satisfied by three different artifacts. That is the whole point of separating them**, and
it is what makes a bounded raw-weather retention safe: the long horizon is not carried by the thing
being pruned.

> ⚠️ **Open, and Russell's to close:** how long must a lot's residue flag stay *explicable*? §1.2 says
> "as long as the wine exists", which is plausible but is an inference from S8's design rather than a
> stated requirement. It is the one input to this decision that is not measured or cited. Plan §8
> question 4.

---

## 2. Supersession and replay are two operations, not one

The brief contradicts itself, and S0 owns the contradiction:

- **§4.3:** *"Actual weather replaces forecast weather after the event — recalculate, never preserve
  the original recommendation."*
- **§17.3 (council C4):** *"Decisions replay under facts-as-of-then, with a visible flag where current
  facts differ."*

These are not reconcilable as written **because they describe different operations that the runbook
treats as one**:

| | Supersession (§4.3) | Replay (§17.3) |
|---|---|---|
| Question | *"what should I do now?"* | *"why did we do that then?"* |
| Direction | forward-looking | backward-looking |
| Correct data | the best CURRENT understanding — actual weather beats forecast | the facts AS THEY WERE at composition time |
| Reads | latest issuance / observed | the decision record's snapshot |
| Both are right | ✅ | ✅ |

### Draft amendment for the brief and the runbook

> **§4.3 amended:** *"For a LIVE recommendation, actual weather supersedes forecast weather after the
> event — recalculate, never preserve the original recommendation. This governs what the system tells
> a grower to do NEXT, and never governs the audit trail."*
>
> **§17.3 amended:** *"A past decision replays under the facts as of the moment it was composed, from
> the decision record's own snapshot, with a visible flag where current facts differ. Supersession
> (§4.3) never rewrites a decision record; it produces a new one."*
>
> **New standing rule:** *"Superseding a recommendation and replaying a decision are different
> operations with different data. A system that satisfies one by discarding the other has satisfied
> neither."*

This is load-bearing for S1's schema, not editorial: it is the difference between a mutable
"current weather" table and an append-only decision record, and getting it wrong is unrecoverable
once decisions have been made against it.

---

## 3. The replay timestamp: audit replay keys on `ingestedAt`

Council C4 required three timestamps and required this unit to name which one replay keys on.

| Timestamp | What it means | Why it is not the replay key |
|---|---|---|
| `validTime` | the hour the weather describes | the *subject* of the row, not a version of it |
| `providerIssuedAt` | when the provider issued the product | **unknowable for Open-Meteo** (Unit 2 — no issuance timestamp on either endpoint), so keying on it makes replay impossible for a whole provider |
| **`ingestedAt`** | **when WE captured the row** | ✅ **the replay key** |

**Reasoning.** Replay asks "what did the system know when it composed this decision?" — and the
system knew what it had *ingested*, not what the provider had *issued*. A row issued at 06:00 but
ingested at 14:00 because a cron ran late was **not available** to a decision made at 12:00, and an
`providerIssuedAt <= D` query would wrongly include it. Council C4 named exactly this: "a delayed cron
run, a QC revision, or a later provider revision of the same valid hour all break replay if you store
only provider issuance and valid time."

Two consequences:

- `providerIssuedAt` must be **nullable**, and a null must mean *"the provider does not tell us"*
  rather than *"we failed to record it"*. Two states a nullable column conflates unless the
  distinction is made explicit.
- Unit 7 measured the genuine bitemporal read (`DISTINCT ON (validTime) … ORDER BY validTime,
  ingestedAt DESC`) at **42 ms p95** on the single-table design — cheap, and notably *not* the slow
  read anyone feared. ⚠️ But on the partial-index design it is **184 ms**, 4.4× worse, because the
  per-kind partial indexes do not serve a query that spans kinds. That is a real trade S1 must make
  with its eyes open.

---

## 4. The council S2 fork, decided with numbers: **SPLIT ANSWER, per series kind**

Measured costs:

| | Measured |
|---|---|
| OBSERVED, append-only, 5-year projection | **5.51 MB/vineyard-year**, 659 B/row (413 MB for 15 vineyards × 5 y) |
| FORECAST, 12 replace cycles | **4.63× steady state** (5.48 MB → 25.38 MB); VACUUM FULL recovers to 4.02 MB |
| REANALYSIS, one revision pass | 3.97 MB → **7.84 MB**, and plain VACUUM does not shrink it |
| Worst read at projection scale | 266 ms p95 (black rot wet-run), **C7 BREACHED** (ceiling 250 ms) |

### The decision

| Series kind | Policy | Why |
|---|---|---|
| **OBSERVED** | **Retain 18 months rolling; backfill on demand beyond that** | 5.51 MB/vineyard-year is affordable and C6 passes with 4.5× headroom — but retention is no longer the *point*, because Unit 0 proved backfillability. Retain for latency and simplicity, prune without fear. |
| **FORECAST** | **Retain the LATEST issuance only, plus every issuance that a decision record actually cited** | The only irreversible kind, so it cannot be blanket-pruned — but blanket-retaining every issuance buys replay for decisions that were never made. Retaining cited issuances gets replay at a fraction of the cost. |
| **REANALYSIS** | **Do not retain as a primary. Backfill on demand, and treat any stored copy as a cache with a recorded fetch time** | Free, re-fetchable, and it *improves* — a stored copy can go staler than the source. |

### Why not blanket "retain every forecast issuance"

The plan's §1.4 argued this was two orders of magnitude more rows, and council C5 withdrew the
specific "~170×" multiplier as unmeasured and internally inconsistent. It is now measured.

⚠️ **This paragraph was written twice.** The first version — from a 30-minute sampling window that
caught **zero** re-issuances — concluded the multiplier was "far smaller than feared" and that this
"cuts against the plan's own argument." **A longer window disproved that, and the correction is
recorded rather than quietly swapped**, because the first version was wrong in the direction that
flattered the decision already taken.

Measured re-issuance gaps (Unit 2 addendum), against the measured 179 h retained horizon:

| Gridpoint | Observed gaps | Implied multiplier (179 h ÷ cadence) |
|---|---|---|
| Madera | **60 min, 60 min** — an exact hourly cadence | **~179×** |
| Russian River | 86 min, 54 min | ~125–199× |
| Monticello AVA | 151 min | ~71× |
| Stoney Hill | 550 min (9.2 h) | ~20× |

So the honest answer is not "smaller than feared" but **"it depends on the gridpoint, by an order of
magnitude"** — roughly **20× to 179×** — and the withdrawn "~170×" turns out to be a reasonable
*upper* estimate rather than an overestimate. Council C5 was still right to withdraw it: it was
asserted before measurement and happened to land near the top of a range nobody had established.

**The decision is unchanged, and now rests on firmer ground.** Retaining every issuance at an
hourly-updating gridpoint means ~1.6 M forecast rows per vineyard-year against 8,760 observed ones.
Cited-issuance retention is chosen on three converging grounds: that row count, the churn cost
(4.63× steady state, scaling with **issuance cadence** rather than data volume — the dimension a
row-count projection cannot see, and the dimension this table shows varies 9× between sites), and
the horizon separation in §1.

⚠️ **And the variance is itself an S1 requirement.** A retention job sized on one gridpoint's cadence
will be wrong by an order of magnitude at another. S1 must size per gridpoint, or measure cadence
per gridpoint at ingest and adapt.

### And it is a SNAPSHOT answer for replay

Because the decision-replay horizon is the life of the wine (§1.2), **no raw-weather retention policy
can satisfy it**, at any cost. Replay is satisfied by the decision record's own facts snapshot —
which is why Units 8 and 9 are mutually constraining and in the same phase.

---

## 5. The snapshot specification

If Unit 9's proposed record is adopted, it **is** the snapshot, and its field list must be sufficient
to replay the decision without the raw hourly series. Minimum contents, each traced to a finding:

| Field | Why | Source |
|---|---|---|
| every weather-derived input value actually used | replay without raw data | §1.2 |
| `seriesKind` per input | a forecast row must never satisfy a historical read | council C3, SAFE-21 |
| `validTime`, `providerIssuedAt` (nullable), `ingestedAt` per input | bitemporal replay | council C4, §3 |
| **provider key AND archive model variant** | `era5` vs `default` moves 50.6 % of classifications | Unit 5 |
| estimator identity and quality class | rule §3.5 | Unit 6 |
| **wind at application, with its measurement height** | the legal-record horizon requires it, and NASA POWER's wind is 2 m not 10 m | §1.3, Unit 2 |
| provider-vs-station agreement at composition time | the Madera inversion — confidence must carry agreement, not just completeness | Unit 6 §2 |
| refusal cause class where any input refused | a gap must never replay as an all-clear | council G9 |

Reuse the facts-as-of snapshot pattern council C4 already requires for product facts. **Do not invent
a second one.**

---

## 6. The pruning invariant

For `docs/architecture/invariants/`, per runbook §11.

### WEATHER-1 — a forecast row never satisfies a historical read

- **Statement:** any read that informs a *past* or *audit* question must exclude `seriesKind =
  'FORECAST'`, and no query may satisfy a historical read from forecast rows.
- **Severity:** CRITICAL — it is a correctness invariant wearing a performance question's clothes.
- **`verify:`** `npm run verify:weather-series-kind` — asserts that every historical read path filters
  `seriesKind`, and that the filtered query is not materially slower than the unfiltered one.
- **Why the second half matters:** Unit 7 measured the C3 contract read at **31.6 ms p95**, faster
  than the unfiltered black-rot scan at 266 ms. Good. But if that ever inverts, the safe query becomes
  the slow query and someone will "optimise" it away — not through malice, through a p95 chart. The
  guard must watch the *relative* cost, not just the presence of the filter.

### WEATHER-2 — pruning may not break replay

- **Statement:** raw hourly weather may be pruned to the raw-recomputation horizon **only** for
  (vineyard, valid-hour) rows that no decision record cites. A cited row is retained regardless of age.
- **Severity:** CRITICAL — the failure is silent and only discovered when an audit needs the row.
- **`verify:`** `npm run verify:weather-pruning` — seeds a decision record citing a row older than the
  horizon, runs the prune job, and asserts the cited row survives and the decision still replays.
- **This is the acceptance test S1's gate implements**, and it was only writable once this decision
  existed. The runbook requires S1 to prove the job prunes *without breaking replay*; that is the test.

⚠️ **A second invariant is needed and the runbook did not nominate it.** WEATHER-1 alone permits a
prune job to delete a cited row, because "a forecast row never satisfies a historical read" says
nothing about deletion. WEATHER-2 closes it.

---

## 7. Physical design, from Unit 7's numbers

**C7 BREACHED**: the S5b black-rot wet-run scan is **266 ms p95** against a 250 ms ceiling on the
single-table design at the 5-year projection. Per C7's pre-committed `breachMeaning`, that read shape
needs a physical design change before S1 builds against it — decided here, not deferred.

| Read shape | Arm A (single table) | Arm B (partial indexes per kind) |
|---|---|---|
| S5b black rot wet-run | 266 ms ❌ | **152 ms** ✅ |
| S5b downy night filter | 42 ms | 44 ms |
| S6 residual | 106 ms | 111 ms |
| S7b forward forecast | 39 ms | **29 ms** |
| **Replay (bitemporal)** | **42 ms** | **184 ms** ⚠️ |
| C3 contract read | 32 ms | 27 ms |
| Index footprint | 308 MB | 298 MB |

**Recommendation to S1: partial indexes per series kind, PLUS a dedicated index for the cross-kind
replay read.** Arm B fixes the breaching shape (266 → 152 ms) and is smaller, but it degrades replay
by 4.4× because per-kind partial indexes cannot serve a query that deliberately spans kinds. Neither
arm as measured is the right answer; the composition of the two is.

**This is a recommendation, not a decision S0 is entitled to make** — S1 owns the schema.

---

## 8. Two schema requirements this measurement discovered

Both were found by the Unit 7 script *failing*, not by reading it.

1. ⚠️ **`NULLS NOT DISTINCT` on the replace-identity index is load-bearing.** `providerIssuedAt` must
   be nullable (Open-Meteo exposes none; OBSERVED has no issuance concept). But Postgres treats
   `NULL != NULL` in a unique index by default, so a plain UNIQUE over a tuple containing a nullable
   column **enforces nothing for the rows where it is null** — every OBSERVED and REANALYSIS row could
   be duplicated without the constraint firing, and an `ON CONFLICT` upsert targeting it would INSERT
   a duplicate instead of updating. A silent correctness hole in the table the entire weather lane
   reads. Requires Postgres 15+.
2. **The surrogate id must be distinct per series kind**, or OBSERVED and FORECAST rows at the same
   (vineyard, hour, issuance) collide on the primary key.

---

## 9. Costed but NOT decisionable (council C10)

The natural composite key without the text cuid primary key and without the `(tenantId, id)`
composite-FK guard is **66 % smaller** (54.34 MB → 18.34 MB at 10 vineyard-years).

**S0 draws no conclusion from this and it appears in no gate.** Plan §1.7 measured that 41 % of the
daily table's index budget has never been scanned and that both zero-scan indexes are structural —
the cuid primary key and the Phase-12 checklist step-5 composite guard. Council C10 was explicit that
neither is S0's to relax: a storage spike is the wrong layer at which to reopen a tenancy safety
invariant. The number is recorded because a future tenancy-rules conversation will want it, and for
no other reason.

---

## 10. Summary of what S1 inherits

1. **OBSERVED**: retain 18 months rolling, backfill beyond. **FORECAST**: latest issuance plus every
   cited issuance. **REANALYSIS**: backfill on demand; any stored copy is a cache with a fetch time.
2. **Replay keys on `ingestedAt`.** `providerIssuedAt` is nullable and its null means "unknowable".
3. **Replay is satisfied by the decision record's snapshot, never by raw weather retention** — the
   horizon is the life of the wine.
4. **Supersession and replay are different operations.** Amendment drafted for brief §4.3 / §17.3.
5. **Two invariants**: WEATHER-1 (forecast never satisfies a historical read, with a *relative*
   performance guard) and WEATHER-2 (pruning may not break replay). WEATHER-2 is S1's acceptance test.
6. **Partial indexes per kind plus a cross-kind replay index.** C7's breach is real and fixable.
7. **`NULLS NOT DISTINCT`** on the replace identity, and a kind-distinct surrogate id.
8. **Wind at application must survive in the record**, with its measurement height.
