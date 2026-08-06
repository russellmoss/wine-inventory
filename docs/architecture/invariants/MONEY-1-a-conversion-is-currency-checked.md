---
id: MONEY-1
group: money
severity: high
enforcedBy: app-code
verify: "npm run verify:money-fx"
decision: "Data-layer workstream B, FX stage (2026-08-06)"
status: guarded
appliesTo:
  - src/lib/money/
  - src/lib/ingest/ingest-invoice-core.ts
tags:
  - invariant
---

# MONEY-1 — a currency conversion is currency-checked

> [!warning] Invariant (high, app-code)
> An FX conversion goes through `FxQuote`, which knows BOTH currencies and refuses an `Amount` that isn't in the quote's foreign currency. And `src/lib/money/**` computes money with `Prisma.Decimal`, never float rounding. The bare-number `convertToBase` cannot make either guarantee and has no callers outside the money module.

**Guarded by:** `npm run verify:money-fx`
**Decision:** Data-layer workstream B, FX stage (2026-08-06) — see [[INVARIANTS]].
**Applies to:** `src/lib/money/`, `src/lib/ingest/ingest-invoice-core.ts`

## Two defects, and only one of them was arithmetic

### 1. The float defect — measured, not assumed

`convertToBase` was `round2(amountForeign * rate)`. Swept over **1,400,000** realistic pairs (cent-scale
amounts 0.01–2000.00 × seven real ECB rates), the float path disagrees with exact decimal on **447 of
them — 0.032%, about 1 in 3,100** — always by exactly one cent, always downward:

| | float | exact |
| --- | --- | --- |
| `11 × 1.085` (= 11.935 on the nose) | 11.93 | **11.94** |
| `15 × 1.085` | 16.27 | **16.28** |
| `950 × 0.6231` | 591.94 | **591.95** |

The binary product lands a hair below the half, and `Math.round` then rounds *down* a value that was
exactly on it. This is the **"cents" grain** — the one that has to tie out to QuickBooks, because
Σ(base line amounts) is reconciled against QBO's derived home GL debit. One line in 3,100 off by a cent
is an A/P reconciliation that silently fails to balance.

> [!note] Stated honestly: the unit grain was NOT broken
> The same sweep found **0 of 1,400,000** disagreements at the `round8` per-stock-unit grain. The
> `Math.round(n * 1e8)` MAX_SAFE_INTEGER hazard is real but needs `n` above ~90,000,000 to bite, and a
> per-unit cost of ninety million dollars is not a thing. `round8` was converted for uniformity, not
> because a defect was observed in it. Do not cite it as one.

The old code also did `import { round2 } from "@/lib/bottling/draw"` — money was borrowing the **volume**
rounding helper. That import was the tell, and the guard now forbids it.

### 2. The structural defect — the one the type exists for

`convertToBase(amount: number, rate: number, grain)` cannot tell what currency the amount is in. Nothing
stopped converting an already-base figure a second time, or applying a NZD→USD rate to a EUR one. **The
result of either is a plausible number**, so nothing downstream notices — no exception, no bad total, just
a wrong one. As the accounting and cost-accounting modules grow, that is the failure mode that will not
announce itself.

So the unit of conversion is a `FxQuote`: base, foreign, an exact `Decimal` rate, the quote date, and the
source. `convert` refuses anything that isn't in `foreign`, and names the double-conversion case
specifically because that is the likely one:

```
FxQuote.convert: this value is already in USD (the base side of a EUR->USD quote).
Converting it again would apply the rate twice.
```

## Consequences worth knowing

**An unsupported currency throws instead of defaulting to USD.** `coerceCurrency`'s forgiveness is right
for a display symbol and wrong for arithmetic — silently mapping an OCR'd "CHF" to USD books a foreign
amount 1:1 at a fabricated rate, which `ingest-invoice-core.ts` had to gate against by hand. The new
`requireCurrency` makes that structural, and `Amount.fromStored` / `Rate.fromStored` now use it too.

**A same-currency quote must be exactly 1.** A feed round-trip really does return values like
`0.99999998` for X→X; applying one shaves value off a domestic amount for no reason. Use
`FxQuote.identity()`, which is a genuine pass-through (same object back, nothing to round). That is what
lets the ingest call site drop its `isForeign ?` ternary — and identity is not a wildcard, so dropping the
branch is safe rather than lucky.

**Σ round(line) ≠ round(Σ line), and that is accounting, not a bug.** `convert` settles per line;
`convertUnsettled` keeps precision for a single final settle. `0.10 × 0.05` three times is `0.03` per line
and `0.02` as one total. The A/P path converts per line deliberately, because each base line amount posts
individually and must tie to its own foreign line. The type makes the choice visible instead of implicit.

**`inverse()` is for display only, and the numbers say why.** Over 20,000 cent-scale amounts per rate:

| rate | round trips wrong |
| --- | --- |
| 1.085 | 0 of 20,000 |
| 0.6231 (an ordinary USD-per-NZD) | **7,538 of 20,000** |
| 0.00654 | **19,870 of 20,000** — small amounts convert to `0.00` and are *gone* |

It is exact at some rates and creates or destroys cents at others, so "it worked when I tried it" proves
nothing. To keep an original, keep the original — which is why the ingest path stores `foreignUnitCost`
alongside the base figure rather than deriving it back.

## What the guard does NOT prove

It is a tripwire on the FX boundary, not a proof that all money math is decimal. `src/lib/cost/`,
`src/lib/ingest/landed-cost.ts` and `src/lib/accounting/` remain float. Widening this guard's scope with
a large allow-list would make it *read* as covered when it isn't.

> [!warning] Correction, 2026-08-06 — an earlier version of this section was wrong
> It said `src/lib/cost/` was "the bigger fish" because "accumulation is where drift compounds", and that
> `landed-cost.ts` was "a direct swap" for `Amount.allocateByWeights`. **Both claims were assumptions
> carried over from the FX work, and measurement contradicts them.** Sweeps found no material drift
> anywhere in the cost path:
>
> | path | result |
> | --- | --- |
> | `rollupCost`, N-way split (3 → 200 children) | conserved to ~1e-13; parent keeps ~1e-8 dust |
> | `planDepletion` FIFO, 800 cases | **0** disagreements with exact decimal |
> | `allocateLandedCost`, adversarial charges | **exact** at the cent grain, every case |
> | `bottlingCostPerBottle` | recomposes **exactly** |
>
> The FX defect was real and measured (447 of 1,400,000 pairs a cent light). The cost defect was
> extrapolated from it and does not exist. `landed-cost.ts`'s hand-rolled residual sweep is *correct*;
> swapping it would be a style change on a critical path.
>
> What the cost path actually needed was **enforcement**, not decimals — see
> [[COST-1-cost-conservation]], whose only pure conservation check turned out to be a tautology.

The `convertToBase` allow-list is shrink-only and currently **empty** — the one historical call site was
migrated in the same change. The guard also fails on a stale entry, so the ratchet can only tighten.

## Related

[[LEDGER-9-decimal-safe-math]] is the same rule for **volume** (centilitre-integer / `Decimal` helpers,
never raw IEEE-754). MONEY-1 is its money-side counterpart, and the two were tangled: FX rounding was
importing the volume helper. See also [[COST-4-inventory-cost-in-base-currency]], which is what makes
conversion happen at ingest at all.
