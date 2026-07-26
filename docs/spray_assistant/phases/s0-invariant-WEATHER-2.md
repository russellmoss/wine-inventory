---
id: WEATHER-2
group: weather
severity: critical
enforcedBy: app-code
verify: "npm run verify:weather-pruning"
decision: "ADR 0011"
status: planned
appliesTo:
  - src/lib/weather/
tags:
  - invariant
  - spray-intelligence
---

# WEATHER-2 — pruning may not break replay

> [!danger] Invariant (critical, app-code) — PLANNED (S1 implements the guard; this IS S1's gate)
> Raw hourly weather may be pruned to the raw-recomputation horizon **only** for (vineyard, valid-hour) rows that **no decision record cites**. A cited row is retained regardless of age.

**Guarded by:** `npm run verify:weather-pruning` — seeds a decision record citing a row older than the
retention horizon, runs the prune job, and asserts (a) the cited row survives and (b) the decision
still replays.

⚠️ **This invariant did not exist until S0 wrote it, and the runbook had not nominated it.** The
runbook nominated only *"a forecast row never satisfies a historical read"* (WEATHER-1) — which says
nothing about **deletion**. WEATHER-1 alone permits a prune job to delete a cited row: the read that
would have used it is correctly filtered, and correctly returns nothing. The failure is **silent**
and is only discovered when an audit needs the row, which is the worst possible time.

**This is the acceptance test S1's gate implements.** The runbook requires S1 to prove the retention
job prunes *without breaking replay*, and that test was only writable once Unit 8's retention decision
existed.

**Decision:** [[0011-hourly-weather-retention-and-replay]] §6. Origin: S0 Unit 8; council S2 / C13.
**Applies to:** `src/lib/weather/`

**Related:** the decision-replay horizon is *the life of the wine* (ADR 0011 §1.2), which no
raw-weather retention policy can satisfy at any cost — replay is satisfied by the decision record's
own facts snapshot. WEATHER-2 is what keeps the two consistent when the raw series is pruned beneath
it.

This note is the machine-readable face of the invariant. The narrative lives in [[INVARIANTS]];
the `appliesTo` paths drive the PreToolUse brain-context hook.
