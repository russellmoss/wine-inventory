---
id: WEATHER-1
group: weather
severity: critical
enforcedBy: app-code
verify: "npm run verify:weather-series-kind"
decision: "ADR 0011"
status: planned
appliesTo:
  - src/lib/weather/
tags:
  - invariant
  - spray-intelligence
---

# WEATHER-1 — a forecast row never satisfies a historical read

> [!danger] Invariant (critical, app-code) — PLANNED (S1 implements the guard)
> Any read that informs a **past** or **audit** question must exclude `seriesKind = 'FORECAST'`. No query may satisfy a historical read from forecast rows. A residual must never be scored against rain that never fell.

**Guarded by:** `npm run verify:weather-series-kind` — asserts that every historical read path filters
`seriesKind`, **and** that the filtered query is not materially slower than the unfiltered one.

⚠️ **The second half of that guard is the part people drop, and it is why this invariant needs one at
all.** This is a correctness question wearing a performance question's clothes. S0 measured the
filtered contract read at **31.6 ms p95** against an unfiltered scan at 266 ms, so today the safe
query is also the fast one. If that ever inverts, somebody will "optimise" the filter away — not
through malice, through a p95 chart. The guard must watch the **relative** cost, not merely the
presence of the `seriesKind` predicate.

**Decision:** [[0011-hourly-weather-retention-and-replay]]. Origin: council C3; QA case SAFE-21.
**Applies to:** `src/lib/weather/`

**Measured evidence (S0 Unit 7):** `docs/spray_assistant/phases/s0-retention-economics.md` §4.

This note is the machine-readable face of the invariant. The narrative lives in [[INVARIANTS]];
the `appliesTo` paths drive the PreToolUse brain-context hook.
