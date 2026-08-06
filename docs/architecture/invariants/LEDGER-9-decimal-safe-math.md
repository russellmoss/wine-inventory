---
id: LEDGER-9
group: ledger-pure
severity: high
enforcedBy: pure-code
verify: "npm run verify:ledger-grain"
decision: "D14"
status: guarded
appliesTo:
  - src/lib/ledger/
  - src/lib/bottling/draw.ts
  - src/lib/transform/
tags:
  - invariant
---

# LEDGER-9 — decimal safe math

> [!danger] Invariant (high, pure-code)
> Every `deltaL` reaching a ledger line sits ON the `Decimal(10,2)` storage grain — integer centilitres — and an operation's lines conserve volume EXACTLY at that grain. Volume shares are allocated by `computeProportionalDraw` (centilitre-integer, largest-remainder), never by dividing floats.

**Guarded by:** `npm run verify:ledger-grain` (`test/ledger-storage-grain.test.ts`)
**Decision:** D14 — see [[INVARIANTS]] and [[system-map]].
**Applies to:** `src/lib/ledger/`, `src/lib/bottling/draw.ts`, `src/lib/transform/`

## What the storage grain has to do with conservation

Ledger volumes are `Decimal(10,2)`. Postgres rounds every `deltaL` to 2dp on insert, **cannot** enforce a
cross-row sum (a `CHECK` sees one row), and nothing re-reads the operation afterwards. So a planner that
emits finer precision leaves an operation that does not conserve — permanently, and silently:

```
lines  [3.3333, 3.3333, 3.3334, -10]  ->  Σ = 0        accepted
stored [3.33,   3.33,   3.33,   -10]  ->  Σ = -0.01 L  LEDGER-6 broken in the database
```

`assertBalanced` is the only thing standing there, which is why it now checks **two** things in order: every
`deltaL` is already at the grain, and the centilitre integers sum to exactly zero.

## Three corrections made 2026-08-06

This note previously overstated its own coverage in three ways. Recording them because each one is a way an
invariant register can lie while every gate stays green.

**1. The declared guard did not test the invariant.** `verify:` pointed at `npm run verify:reverse` — a
264-line **reversal-semantics** proof (LIFO unwind, append-only correction, dispatcher routing) with no
reference to rounding, decimals, balance or floats, and whose only fractional literals in the entire file
are `0.5` and `13.5`, both 1dp. It could not have failed this way. `npm run verify:invariants` checks only
that the named script **exists** — "detection only", as the register's own README says — so nothing noticed.
A guard that cannot fail is worse than a missing one, because it reads as coverage.

**2. The narrative credited the wrong helper.** [[INVARIANTS]] item 9 named
`computeProportionalDraw` **and `round2`** as "centiliter-integer / `Prisma.Decimal` helpers". `round2` is
`Math.round(n * 100) / 100` — plain IEEE-754, 287 call sites. The two do different jobs and only one is
exact:

| | what it is | what it does |
| --- | --- | --- |
| `computeProportionalDraw` | genuinely centilitre-integer, largest-remainder | splits N ways so shares sum EXACTLY to the draw |
| `round2` | float | **normalises to the storage grain** — necessary, but not exact arithmetic |

**3. The check was looser than the thing it protected.** `isBalanced` was `Math.abs(Σ deltaL) < 1e-6` —
four orders of magnitude looser than the `0.01` grain. It therefore could not catch a set that would fail
conservation once stored. It is now exact, in centilitre integers.

## The substance held, and that is worth stating plainly

The invariant was *true* when these corrections were made — it was the register that was wrong. A probe
asserting every `deltaL` arrives at ≤2dp, run across the full suite, produced **zero** trips in 5,992
tests: `computeProportionalDraw` really is exact, every N-way split in `ledger/math.ts` goes through it,
and the ~50 hand-written `round2` calls at the line-construction sites really do hold.

What was missing was **enforcement**, not correctness. LEDGER-6 rested on fifty call sites each remembering
to round, with no check at the chokepoint and no guard — so a fifty-first that forgot would have failed
silently. That is the same shape as [[MONEY-1-a-conversion-is-currency-checked]]'s structural defect, and
the same fix: make the discipline structural instead of remembered.

## Not in scope

`appliesTo` used to list `src/lib/cost/`, which is **float throughout** (`rollup.ts`'s
`round8 = Math.round(n * 1e8) / 1e8`). This invariant's own text is about *volume*, so that entry claimed a
directory it never governed. Money precision is [[MONEY-1-a-conversion-is-currency-checked]]'s remit, and
the cost roll-up is the open stage of that work.
