---
title: S0 — two invariants named, to be REGISTERED BY S1 with their guards
type: phase-artifact
phase: S0
unit: 8
date: 2026-07-26
status: named, not yet registered
---

# Two invariants S0 named, for S1 to register

Plan Unit 8 asked S0 to **name** the pruning invariant for `docs/architecture/invariants/` with its
`verify:` guard. Both are named here, in register-ready form
([WEATHER-1](./s0-invariant-WEATHER-1.md), [WEATHER-2](./s0-invariant-WEATHER-2.md)) and in
[ADR 0011](../../architecture/decisions/0011-hourly-weather-retention-and-replay.md) §6.

## Why they are HERE and not in the live register

They were written into `docs/architecture/invariants/` first, and `npm run verify:invariants`
immediately went red:

```
✗ MISSING  WEATHER-1  critical → npm run verify:weather-series-kind
✗ MISSING  WEATHER-2  critical → npm run verify:weather-pruning
✗ 2/41 invariant(s) have a MISSING guard (95% covered).
```

That is the checker **working correctly**. Its own header states the rule: *"A missing guard is a live
safety hole (an invariant nobody checks), so this exits 1."* S0 ships no production code, so neither
guard can exist yet — and a `status: planned` frontmatter field does not help, because the checker
(rightly) does not read one.

There were two ways out and only one of them is honest:

- **Teach the checker a `planned` status.** S0's lane boundary permits touching `scripts/`, so this
  was *allowed*. It was rejected anyway: weakening a repo-wide safety checker, from inside a spike,
  to make the spike's own two notes go green, is exactly the kind of change that should never happen
  quietly. It would also be a semantic change every other lane inherits.
- **Register the note together with its guard.** Which is what the register was designed for, and
  what S1 will do.

So the notes live here until S1 implements the guards, at which point they move to
`docs/architecture/invariants/` **in the same commit as the guard**. Coverage stayed at
**100 % (39/39)**.

## What stops S1 forgetting

Three independent places, so it is not resting on this document:

1. **ADR 0011 §6** names both invariants and their guards.
2. **The runbook's S0 outcome block** (§9, "read this before planning S1") carries them.
3. **WEATHER-2 *is* S1's acceptance test.** The runbook already requires S1 to prove the retention
   job prunes *without breaking replay* — that requirement predates S0 and now has a concrete test
   behind it.

## The two invariants, in one line each

| | Statement | Guard S1 must write |
|---|---|---|
| **WEATHER-1** | A forecast row never satisfies a historical read | `verify:weather-series-kind` — asserts every historical read filters `seriesKind`, **and** that the filtered query is not materially slower than the unfiltered one |
| **WEATHER-2** | Pruning may not break replay: a cited row is retained regardless of age | `verify:weather-pruning` — seed a decision record citing a row older than the horizon, prune, assert the row survives and the decision still replays |

⚠️ **WEATHER-2 did not exist before S0.** The runbook nominated only WEATHER-1, which says nothing
about **deletion** — so it permits a prune job to delete a cited row while every read stays correctly
filtered and correctly returns nothing. Silent, and only discovered when an audit needs the row.
