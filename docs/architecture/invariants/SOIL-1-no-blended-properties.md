---
id: SOIL-1
group: vineyard-intelligence
severity: high
enforcedBy: app-code
verify: "npm run verify:soil"
decision: "P4 design — Key Insight"
status: guarded
appliesTo:
  - src/lib/soil/
tags:
  - invariant
---

# SOIL-1 — no blended block soil properties

> [!warning] Invariant (high, app-code) — GUARDED
> A block's soil snapshot invents NO property value. Area share (%) is the ONLY value we aggregate; every soil property (pH, drainage, AWC, restrictive depth) stays PER-MAP-UNIT, cited to its `mukey` at the level NRCS publishes it (`*Basis`). No block-level averaged pH / drainage class / AWC / restrictive depth exists anywhere.

**Why:** pH is logarithmic (arithmetic averaging is quietly wrong), drainage class is categorical (no midpoint), and averaging restrictive depth is actively dangerous — a block that is 50% bottomless and 50% hardpan at 40 cm is NOT "a block with a 70 cm restriction"; the 40 cm half is where the vines die. The use is documentation, not a cellar/irrigation decision, so the roll-up serves a decision nobody is making. We DO inherit NRCS's own published roll-ups (e.g. `muaggatt.drclassdcd` dominant-condition drainage) — but labelled as such via `drainageBasis`, never re-aggregated by us.

**Guarded by:** `npm run verify:soil` — asserts each soil map unit keeps its own cited pH (`ph` + `phBasis`), Water/non-soil units leave soil properties null, and the share floor retains every mukey rather than folding into a blended "other". This is NOT a lint ("an average of pH exists somewhere" is not lintable — the design says so); the guard proves the positive shape and this note + review checklist enforce the absence.
**Decision:** P4 soil design "Key Insight" (do not roll up) — see [[INVARIANTS]] and [[system-map]].
**Applies to:** `src/lib/soil/`

The narrative lives in [[INVARIANTS]] (§ Vineyard Intelligence invariants); the `appliesTo`
path drives the auto-context hook so any edit under `src/lib/soil/` re-surfaces this rule.
