---
id: COST-1
group: cost
severity: critical
enforcedBy: pure-code
verify: "npm run verify:cost-conservation"
decision: "D10"
status: guarded
appliesTo:
  - src/lib/cost/
tags:
  - invariant
---

# COST-1 — cost conservation

> [!danger] Invariant (critical, pure-code)
> Cost conservation — across blend/split/loss/bottle/reversal, Σ(cost out) + stranded == cost removed from parents; nothing created or destroyed except explicit VARIANCE lines. Zero volume ⇒ zero cost.

**Guarded by:** `npm run verify:cost`
**Decision:** D10 — see [[INVARIANTS]] and [[system-map]].
**Applies to:** `src/lib/cost/`

This note is the machine-readable face of the invariant. The narrative lives in
[[INVARIANTS]]; the guard status is asserted by `npm run verify:invariants`; the
`applies-to` paths drive the auto-context hook that surfaces this rule before any
edit to the governed code.

## The identity, stated so it can be checked

```
Σ(DIRECT amounts capitalized)  ==  Σ(every lot's totalCost)  +  Σ(every lot's expensed)
```

Everything else is *movement*. A `TRANSFER` subtracts from a parent exactly what it adds to a child; an
`ABNORMAL_LOSS` moves cost from a lot's components into its `expensed` write-off. `stranded` is **not** a
separate term — it is a report of `totalCost` sitting on a ~zero-volume lot, already counted.

`costConservationResidual(events, result)` computes it, and `npm run verify:cost-conservation`
(`test/cost-conservation.test.ts`) asserts it over N-way splits, abnormal loss, and a 12-generation
split/merge chain.

## Two guard defects fixed 2026-08-06

**1. The only pure conservation check was a tautology.** `transferImbalance` computed `moved` once and
added it to *both* `movedOut` and `movedIn`, so the difference was zero by construction — **for any
input**, including a set of transfers taking 120% of a parent. The test asserting on it was titled
"transferImbalance — conservation invariant (D10)" and could not fail. Its doc comment also claimed
"used by tests + verify:cost"; `verify:cost` never called it.

It now measures the thing its name implies: the per-op **rounding residual**, `Σ(cost × fᵢ)` versus what
`round8` actually moves. Over-transfer is deliberately left to [[LEDGER-9-decimal-safe-math]] — that is a
*volume* defect caught exactly at its source, and re-deriving it from cost would be a weaker second
opinion on someone else's invariant.

**2. A critical invariant whose guard could not run in CI.** `verify:cost` is
`tsx --conditions=react-server --env-file=.env`, i.e. it needs a database — so it is absent from CI's
required `check` job and cannot run on a laptop without one. The new guard is pure, so COST-1 is now
enforced on every PR. `verify:cost` remains the fuller end-to-end proof and should keep being run where a
database exists.

## Precision: measured, and deliberately left as float

⚠️ **The fold is float, and the identity holds to ~1e-13 — not exactly, the way LEDGER-6 does.** The
guard's tolerance is `1e-9`, which is a real limit rather than a formality.

That was a decision driven by measurement, not preference. Sweeps found **no material drift anywhere in
the cost path**:

| path | result |
| --- | --- |
| `rollupCost`, N-way split (3 → 200 children) | conserved to ~1e-13; parent keeps ~1e-8 dust |
| `planDepletion` FIFO, 800 cases | **0** disagreements with exact decimal |
| `allocateLandedCost`, adversarial charges | **exact** at the cent grain, every case |
| `bottlingCostPerBottle` | recomposes **exactly** |

So converting this path to `Prisma.Decimal` would be churn on a critical path with nothing to show for
it. `allocateLandedCost`'s hand-rolled residual sweep in particular is *correct* — swapping it for
`Amount.allocateByWeights` would be a style change, not a fix. If a future change makes the residual
grow, the guard catches it.

Money **precision** at the cent grain is [[MONEY-1-a-conversion-is-currency-checked]]'s remit; this note
is about **conservation**.
