# P0 — statistics validation vs exactextract (DECISION GATE, Unit 9)

**Date:** 2026-07-24 · **Oracle:** exactextract 0.3.0
**Script:** `scripts/gis-p0-validate-stats.ts` · **Run:** `npm run verify:gis-stats`

## What the oracle is allowed to arbitrate

| statistic | validated against | why |
|---|---|---|
| coverage-weighted mean | **exactextract** | one correct answer |
| effective pixel count | **exactextract** | its `count` IS sum-of-coverage (probed and confirmed) |
| min / max | **exactextract** | extremes, unambiguous |
| **p10/p25/median/p75/p90** | **analytic fixtures ONLY** | see below |

### Why quantiles are excluded, deliberately

Weighted quantiles are DEFINITION-dependent. exactextract has its own generalisation; Unit 6
pinned the midpoint form after the weighted-type-7 form was shown to ignore its weights entirely
(it returned a median of 50.5 for `[value 1 weight 9, value 100 weight 1]`). Comparing the two
would surface a disagreement that is nobody's bug and would contaminate the clipper verdict with
a definitional difference. Quantiles are therefore pinned by analytic fixtures in
`test/gis-zonal.test.ts`. This separation was a council requirement (Codex) and is enforced by
simply not asking the oracle the question.

## Results

The raster is a deterministic gradient `value(col,row) = col + 100*row`, defined identically on
both sides. A constant raster would make a weighted mean trivially equal to the constant and
prove nothing.

| fixture | weighted mean | effective count | min | max |
|---|---|---|---|---|
| known-coverage planting | 2.21e-9 | 3.89e-9 | 0.00e+0 | 0.00e+0 |
| block west | 4.01e-10 | 5.73e-10 | 0.00e+0 | 0.00e+0 |
| block east | 3.50e-9 | 7.57e-9 | 0.00e+0 | 0.00e+0 |
| planting with hole | 0.00e+0 | 0.00e+0 | 0.00e+0 | 0.00e+0 |
| narrow block | 2.83e-16 | 1.49e-8 | 0.00e+0 | 0.00e+0 |
| high-vertex block (2000) | 8.06e-10 | 5.21e-10 | 0.00e+0 | 0.00e+0 |

Tolerances are relative, floored at 4x the oracle's float32 spacing — the precision limit
established in Unit 5, where every exactextract value proved exactly float32-representable.

## Verdict: **PASS**

The coverage-weighted statistics agree with exactextract on every quantity the oracle can arbitrate.
