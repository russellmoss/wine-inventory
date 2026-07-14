---
title: Fix the SO₂/KMBS ledger under-depletion — apply the active fraction when booking stock
type: fix
status: draft
date: 2026-07-14
branch: claude/so2-kmbs-ledger-active-fraction
depth: deep
units: 5
---

## Overview

When a winemaker books a "14 ppm SO₂" addition dosed from KMBS, the ledger depletes and costs
**grams of SO₂**, not grams of KMBS. KMBS is only 57.6% SO₂, so every SO₂ addition **draws down
and costs ~1.74× too little KMBS** (1 / 0.576). Inventory drifts high, COGS reads low. The
execution view already *shows* the correct KMBS mass (Plan 065); this plan makes the **booked
ledger** match it. Governed money/ledger change — eng-review, never auto-merge.

## Problem Frame

The reported bug ("SO2 work order unclear", now RESOLVED for the UX) had a deeper defect underneath:
the money is wrong. Dose 40 ppm into 450 L and the system draws **18 g** of KMBS stock and costs it
as 18 g. The physical truth is 18 g *of SO₂*, which requires **≈31.25 g of KMBS** (18 / 0.576). So:
- **Inventory:** KMBS on-hand is overstated — a winery reorders late, risks running out mid-ferment.
- **Cost:** SO₂ addition COGS is ~1.74× understated — every batch's cost is quietly wrong.
- **Wine safety framing:** the operator following the *booked* number under-adds; Plan 065 fixed the
  displayed number, but the ledger is the system of record.

Who/why: the winemaker (accurate inventory + reorder) and the accountant (accurate COGS). Doing
nothing leaves a standing money error on every SO₂ addition, compounding across a vintage.

**Right problem?** Yes. This is a correctness bug in the money path, not a proxy. The simpler-framing
temptation (just scale the dose) is *wrong* — it would corrupt the recorded treatment (see Decisions).

## Requirements

- MUST: booking an SO₂ addition dosed by a **rate** (ppm / mg/L) from an SO₂-kind material depletes +
  costs the **stock mass of the SO₂ source** (KMBS grams = delivered-SO₂ grams ÷ active fraction),
  not the raw SO₂ grams.
- MUST: the recorded **`LotTreatment.computedTotal` stays grams of SO₂ delivered** (physical truth of
  the addition is unchanged — only the stock draw/cost is corrected).
- MUST: the active fraction is sourced from `CellarMaterial.percentActive` when set (>0), else the
  canonical `KMBS_SO2_FRACTION` (0.576) for SO₂-kind — never a bare literal at the call site.
- MUST: **only** the rate-based SO₂ case is corrected. An **absolute** SO₂ dose ("add 30 g KMBS") is
  already stock grams — no correction. All non-SO₂ additions and packaging depletion are byte-for-byte
  unchanged.
- MUST: `verify:cost` updated to assert the corrected reality and pass end-to-end; a unit
  characterization test locks the stock-draw math.
- MUST: WORKORDER-3 boundary preserved — maintenance SO₂ (overhead, no `SupplyConsumption`) is untouched.
- SHOULD: past (already-booked) SO₂ additions are **not** retroactively rewritten (correction-as-event
  moat); surface a one-time advisory count of affected historical ops, don't auto-fix.
- SHOULD: an ADR recording the active-fraction booking rule.

## Scope Boundaries

**In scope:**
- Thread an optional active fraction into `consumeMaterialCore` (governed cost module) and apply it to
  the stock-draw quantity.
- Have the addition core pass that fraction for rate-based SO₂ doses; keep the recorded treatment as
  delivered SO₂.
- Update `verify:cost` + add a `cost-consume` unit characterization test.
- ADR + historical-impact advisory (read-only count).

**Out of scope:**
- Retroactively correcting historical SO₂ additions (explicitly not — moat is correction-as-event).
- The rest of old "Plan 062" (Units 2/5/etc.): a durable per-material SO₂-source subtype, inventory
  pull-vs-calculate at execute, molecular targeting. Separate.
- Any UI change — Plan 065 already covers the execute-view display.
- Liquid-SO₂-solution *booking* nuance beyond percentActive (a solution's own percentActive drives it;
  no new schema).

## Research Summary

### Codebase Patterns (booking path, verified)
- **Completion dispatch:** `src/lib/work-orders/execute.ts:159-176` routes `ADDITION`/`FINING` →
  `recordNeutralDoseTx(...)` (`execute.ts:174`). `solutionPercentKmbs` is NOT read here (display-only).
  Material pre-resolved at `execute.ts:349`; WORKORDER-3 doseable gate at `execute.ts:361-372`.
- **Grams computed:** `src/lib/cellar/addition.ts:101-107` `recordNeutralDoseTx`. `totalDose` at
  `addition.ts:139-159`; the rate (ppm/mg/L) branch is `addition.ts:141`
  `computeAdditionTotal(amount, basis, rateVolume)` → **grams of SO₂**, no KMBS correction. Recorded on
  the `LotTreatment` at `addition.ts:196`; passed to consumption at `addition.ts:209-214`.
- **Stock draw + cost:** `src/lib/cost/consume.ts:98` `consumeMaterialCore(tx, input)`;
  `input` = `{operationId, materialId, doseUnit, perLot:{lotId,amount}[]}` (`consume.ts:78-84`).
  `qtyInStock` computed at **`consume.ts:118`** (`totalAmount * factor`) → `depleteSupplyLotsTx`
  (`consume.ts:45`) decrements `SupplyLot.qtyRemaining`, writes `SupplyConsumption` + a `MATERIAL`
  `CostLine`. Today `consumeMaterialCore` fetches only `{isStockTracked, stockUnit}` (`consume.ts:102`).
- **The single fix point:** `consume.ts:118` `qtyInStock` — divide by the active fraction. `consume.ts`
  **is governed** (brain-context hook `HOT` list). `src/lib/cellar/` is **not** governed, so keep the
  money correction in `consume.ts`; `addition.ts` only *supplies* the fraction.

### Material model
- `CellarMaterial.kind` (String; `"SO2"` among `MATERIAL_KINDS`, `additions-math.ts:24-41`).
- **`CellarMaterial.percentActive Decimal? @db.Decimal(6,3)`** already exists (`schema.prisma:1961`) —
  "%active, a material property". Currently display/metadata only (read in `materials.ts`/pickers,
  never in `consume.ts`/`addition.ts`). Perfect driver: KMBS → percentActive 57.6 → fraction 0.576.
- `KMBS_SO2_FRACTION = 0.576` lives once, `src/lib/winemaking-calc/so2.ts:15`. `resolveSo2Dose`
  (`src/lib/cellar/so2-dose.ts`) already returns `kmbsGrams = so2Grams/0.576` and is on main.

### Guards
- **`verify:cost`** (`scripts/verify-cost.ts:133-158`) ALREADY drives a KMBS material and **asserts the
  buggy 18 g / $0.90** (dose 40 ppm into 450 L). This is the characterization baseline to FLIP to
  ≈31.25 g / ≈$1.56. It runs live against `org_demo_winery` (Neon).
- **`test/cost-consume.test.ts`** — in-memory `Prisma.TransactionClient` stub capturing
  `supplyLot.update`/`supplyConsumption.create`/`costLine.create`. The model for the unit test.
- **COST-1** (`INVARIANTS.md:101-104`, register + `verify:cost`) — conservation; note it will NOT
  catch this (Σ still balances; it's a wrong-*input* bug), so the verify-cost numbers are the real gate.
- **WORKORDER-3** (`INVARIANTS.md:170-178`; `verify:work-orders-enhancements`) — maintenance SO₂ is
  overhead (no `SupplyConsumption`). The fix must not blur addition-capitalizes vs maintenance-overhead.

### Prior Learnings
- `[[plan062-so2-solution-dosing]]` — the ×0.576 gotcha; this is its Unit 3 (the money core).
- `[[plan065-addition-execution-view-clarity]]` — display fixed, ledger explicitly deferred to here.
- `[[build-in-main-checkout-not-worktrees]]`, `[[main-repo-has-env-verify-runs]]` — build on main
  checkout; `verify:cost` hits Neon there. `[[gitguardian-ci-cred-false-positive]]`.
- No RTL/jsdom → unit-test the pure/stubbed cost math; the e2e proof is `verify:cost`.

### External Research
None — internal chemistry constant + internal ledger.

## Key Decisions

| Decision | Choice | Alternatives | Rationale |
|----------|--------|--------------|-----------|
| Where to correct | In `consume.ts` at the `qtyInStock` computation (governed money module) | Scale in `addition.ts` | Keeps the money correction in the governed cost path (hook-injected, `verify:cost`-gated). `addition.ts` isn't governed. |
| Don't scale the dose total | `LotTreatment.computedTotal` stays delivered-SO₂ grams; only the stock draw is ÷fraction | Scale `totalDose` at `addition.ts:141` | Scaling corrupts the recorded treatment (the wine truly got 18 g SO₂, not 31.25). Delivered ≠ stock mass — they legitimately diverge. |
| How consume knows | Caller passes an optional `activeFraction?` on `ConsumeInput`; when set, `qtyInStock /= activeFraction` | Have consume infer from material kind alone | Only the caller knows the dose *basis* (rate SO₂ vs absolute stock). A rate SO₂ dose is active-basis; "add 30 g KMBS" is not. An optional param defaults to today's behavior → all other callers untouched. |
| Fraction source | `percentActive/100` when set (>0), else `KMBS_SO2_FRACTION` (0.576) for `kind==="SO2"` | Hardcode 0.576 | Supports non-KMBS SO₂ sources via their own `percentActive`; 0.576 is the safe default for unset KMBS. No new schema. |
| History | Forward-only; surface an advisory count of past under-booked SO₂ ops, do NOT rewrite | Backfill-correct past ops | Correction-as-event is the moat; silently rewriting ledger history is the thing we never do. |

## Implementation Units

### Unit 1: Apply the active fraction to the stock draw in `consumeMaterialCore`

**Goal:** `consumeMaterialCore` can divide the stock-draw quantity by a supplied active fraction.
**Files:** `src/lib/cost/consume.ts`, `test/cost-consume.test.ts`.
**Approach:** Add optional `activeFraction?: number` to `ConsumeInput` (`consume.ts:78-84`). When set and
`>0 && <=1`, compute `qtyInStock = round8(totalAmount * factor / activeFraction)` at `consume.ts:118`
(guard against 0/NaN → treat as 1). Everything downstream (`depleteSupplyLotsTx`, `SupplyConsumption`,
`CostLine`) then reflects the true stock mass automatically. No other consumer passes it → unchanged.
**Tests:** `test/cost-consume.test.ts` (stubbed tx): (a) SO₂ material, 18 g dose, `activeFraction 0.576`
→ SupplyLot drawn ≈31.25 g, `SupplyConsumption` qty ≈31.25, `CostLine` cost = 31.25 × unit; (b) no
`activeFraction` → identical to today (regression guard); (c) `activeFraction` undefined/0 → no
correction (safety).
**Depends on:** none
**Execution note:** test-first (write the 31.25 g expectation, then implement).
**Patterns to follow:** `consume.ts:98-133`; `test/cost-consume.test.ts` makeTx stub.
**Verification:** `npx vitest run test/cost-consume.test.ts` green; `npx tsc --noEmit`.

### Unit 2: Supply the fraction for rate-based SO₂ doses from the addition core

**Goal:** Rate-based SO₂ additions pass the active fraction to consumption; the recorded treatment stays
delivered-SO₂ grams.
**Files:** `src/lib/cellar/addition.ts` (+ a tiny helper for the fraction, e.g. in
`src/lib/cellar/so2-dose.ts` or `additions-math.ts`).
**Approach:** In `recordNeutralDoseTx`, when the dose is the **rate** branch (`addition.ts:141`) AND the
resolved material `kind === "SO2"`, compute `activeFraction = percentActive>0 ? percentActive/100 :
KMBS_SO2_FRACTION` and pass it on the `consumeMaterialCore` call (`addition.ts:209-214`). Leave
`LotTreatment.computedTotal` (`addition.ts:196`) as `totalDose` (delivered SO₂). Absolute-unit and
non-SO₂ branches pass nothing. `recordNeutralDoseTx` already has the material; ensure it has
`kind`+`percentActive` (thread from `resolveDoseMaterial` at `execute.ts:349` if not already selected).
**Tests:** a characterization/behavior test (stub or a focused `verify:cost`-style path) asserting: rate
SO₂ dose → `LotTreatment.computedTotal` = delivered SO₂ (e.g. 18 g) AND `consumeMaterialCore` received
`activeFraction 0.576`; absolute SO₂ dose → no `activeFraction`; non-SO₂ → no `activeFraction`.
**Depends on:** Unit 1
**Execution note:** characterization-first (record current delivered-grams behavior, then add the pass-through).
**Patterns to follow:** `addition.ts:139-214`; fraction default from `winemaking-calc/so2.ts:15`.
**Verification:** unit test green; `npx tsc --noEmit`.

### Unit 3: Flip `verify:cost` to the corrected reality

**Goal:** The live e2e cost proof asserts the true KMBS stock draw + cost.
**Files:** `scripts/verify-cost.ts`.
**Approach:** Update the Unit-3 KMBS block (`verify-cost.ts:133-158`): a 40 ppm dose into 450 L →
`LotTreatment.computedTotal` still **18 g SO₂**, but SupplyLot draws **≈31.25 g** (1000 → ≈968.75),
one `SupplyConsumption` ≈31.25 g, `MATERIAL` `CostLine` ≈ 31.25 × unit cost (≈$1.56 at $0.05/g). Set the
test material's `percentActive = 57.6` so the assertion is explicit (and exercises the percentActive
path, not just the fallback). Keep tolerances tight (round to cents / 2 dp).
**Depends on:** Units 1-2
**Verification:** `npm run verify:cost` green against Neon (from the main checkout with `.env`).

### Unit 4: percentActive default + historical advisory + ADR

**Goal:** SO₂ materials have a sensible active fraction, past errors are surfaced (not rewritten), and the
rule is recorded.
**Files:** `scripts/` (a read-only advisory script), `docs/architecture/decisions/` (new ADR),
optionally a one-time backfill of `percentActive=57.6` on KMBS SO₂ materials (data, not schema).
**Approach:** (a) Advisory script: count historical completed SO₂ rate additions and report the
KMBS under-booked (Σ delivered-SO₂ that would now draw /0.576) — read-only, prints, writes nothing.
(b) Optional backfill: set `percentActive=57.6` where `kind="SO2"` and null (Demo + Bhutan), so future
bookings use the explicit value; the 0.576 fallback covers any still-null. (c) ADR: "SO₂ additions book
KMBS stock at the active fraction; treatment records delivered SO₂; history is not rewritten."
**Depends on:** Units 1-2
**Verification:** advisory script runs read-only; ADR present; if backfill run, `verify:cost` still green.

### Unit 5: Full verification + governed-change docs

**Goal:** Prove the whole change and record it for the eng-review PR.
**Files:** `NOW.md`, memory, plan status; no product code.
**Approach:** Full `npx vitest run`, `npm run verify:cost`, `verify:work-orders-enhancements` (WORKORDER-3
intact), `verify:invariants`, `npx next build`. Manual Demo-Winery sanity: complete a QA SO₂ addition,
confirm SupplyLot draws the KMBS mass (~/0.576) and the CostLine matches, then reverse/clean up. Write
the memory + NOW.md; mark plan complete.
**Depends on:** Units 1-4
**Verification:** all gates green; QA proof captured.

## Test Strategy

**Unit:** `test/cost-consume.test.ts` (stubbed tx — the stock-draw ÷fraction math, regression for
non-SO₂/absolute), plus the addition-core pass-through behavior test.
**Integration / e2e:** `npm run verify:cost` (live Neon) is the money gate — flipped to the corrected
numbers. `verify:work-orders-enhancements` guards WORKORDER-3.
**Manual (Demo Winery sandbox, QA-prefixed, cleaned up):** author + complete a QA SO₂ addition; read the
`SupplyLot`/`SupplyConsumption`/`CostLine` back via `runAsTenant` script; confirm KMBS ≈ SO₂/0.576 and
cost matches; reverse the op + delete the QA fixture.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Double-correcting an absolute SO₂ dose ("add 30 g KMBS") | MED | HIGH | Only the rate branch passes `activeFraction`; absolute branch never does. Unit-2 test asserts this. |
| Corrupting the recorded treatment by scaling the dose | MED | HIGH | Decision: `LotTreatment.computedTotal` stays delivered SO₂; correction lives only in the stock draw. Unit-3 asserts computedTotal unchanged (18 g). |
| Breaking a non-SO₂ / packaging consumer of `consumeMaterialCore` | LOW | HIGH | `activeFraction` is optional, default undefined → identical behavior. Regression test (b) + full `verify:cost`/packaging tests. |
| `verify:cost` flip masks a real regression | LOW | MED | Change only the KMBS block's expected numbers to the arithmetically-derived truth (31.25 g = 18/0.576); leave every other assertion. |
| Neon unreachable → can't run `verify:cost` locally | MED | MED | Retry; else rely on CI's `verify:cost` (required check). Note in the PR. |
| Historical rows now inconsistent with the new rule | HIGH | LOW | By design — forward-only; advisory count surfaces the gap; ADR documents it. No rewrite. |

## Success Criteria

- [ ] Rate-based SO₂ (KMBS) addition depletes + costs the KMBS stock mass (delivered-SO₂ ÷ active
      fraction), while `LotTreatment.computedTotal` stays delivered-SO₂ grams (Units 1-2).
- [ ] Active fraction from `percentActive` (else 0.576); absolute-unit + non-SO₂ + packaging unchanged.
- [ ] `test/cost-consume.test.ts` green (corrected case + regression + safety); `verify:cost` flipped
      and green; `verify:work-orders-enhancements` green (WORKORDER-3 intact).
- [ ] Historical advisory count produced; no ledger history rewritten; ADR added.
- [ ] Full vitest + `verify:invariants` + `npx next build` green.
- [ ] **Opened as an eng-review PR — NOT auto-merged** (governed money/ledger change).
