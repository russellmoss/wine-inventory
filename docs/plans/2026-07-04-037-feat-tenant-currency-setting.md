---
title: Tenant-wide currency setting + currency-symbol adornment on every cost field
type: feat
status: approved
date: 2026-07-04
branch: feat/tenant-currency
depth: standard
units: 7
---

## Overview

Let a tenant pick ONE currency for the whole app (USD, EUR, NZD, AUD, ZAR, GBP) in Settings, and show that
currency's SYMBOL as a fixed prefix on every cost field (input and display) so the operator just types the
number. The cost engine already stamps a `currency` on cost rows; this makes it (a) editable, (b) actually
stamped on `SupplyLot`, and (c) surfaced consistently as a symbol instead of a hardcoded `$`.

## Problem Frame

Today the intake modal's "Total cost paid" is a bare number field and the preview hardcodes `$` — a NZ or
EU winery has no idea whether to type a `$` and sees the wrong symbol on every cost readout. The backend
already carries `AppSettings.currency` (default USD) and stamps it on `CostLine`/`OperationCostTransfer`/
`BottlingCostSnapshot`, and the cost engine reads it — but there's **no way to set it** (`saveCostSettings`
hardcodes `"USD"`), `SupplyLot.currency` isn't stamped from it (falls to the column default), and the UI
hardcodes `$` in three places. So a non-USD tenant is both mislabeled and un-settable.

Job to be done: **"set my winery's currency once, then every cost field just shows my symbol and I type the number."**

Product note: this is a **label + default + symbol** feature, not FX. Changing the currency does not convert
existing amounts. That's the right scope for a single-currency-per-tenant winery; mixed-currency roll-ups
are explicitly out of scope (flagged below).

## Requirements

- MUST: A currency picker in Settings (the "Cost accounting" card) over the controlled set {USD, EUR, NZD, AUD, ZAR, GBP}; persists to `AppSettings.currency`. Does NOT bump `costingPolicyVersion` (currency is orthogonal to costing policy — confirmed D17).
- MUST: Every cost INPUT shows the tenant currency symbol as a fixed prefix (via `Input`'s `iconLeft`), so the user types only the number. Symbols: USD→$, EUR→€, NZD→NZ$, AUD→A$, ZAR→R, GBP→£.
- MUST: Every cost DISPLAY shows the same symbol (replace the hardcoded `$` in CostPanel, the accounting dashboard, the expendables intake preview, and the compliance excise label).
- MUST: `SupplyLot.currency` is stamped from the tenant currency on create/receive (close the existing gap so a non-USD tenant's lots are labeled correctly).
- MUST: A pure, client-safe `currencySymbol(code)` + `formatMoney(amount, code)` helper (+ `SUPPORTED_CURRENCIES` + `coerceCurrency`), replacing the 3 duplicated inline money fns.
- SHOULD: A tenant-wide `CurrencyProvider`/`useCurrency()` so client cost components get the symbol without prop-drilling through every picker.
- SHOULD: A non-blocking note in Settings when changing currency ("existing costs keep their recorded currency; this doesn't convert them").
- NICE: seed Demo Winery's currency (leave USD) + a QA pass in a non-USD tenant.

## Scope Boundaries

**In scope:** the pure currency helper + controlled vocab; making `AppSettings.currency` editable (action + Settings picker); stamping `SupplyLot.currency`; a currency context for client components; symbol adornment on the 2 cost inputs + display-symbol on the 4 readout sites; tests + verify.

**Out of scope (with reason):**
- **FX conversion** — no exchange-rate source; changing currency relabels new rows only. Existing rows keep their stamped currency (D17: never re-value closed history — achieved for free since every cost row already stamps currency).
- **Mixed-currency roll-ups** — the cost engine assumes one currency and does not FX-convert; QBO already models a `homeCurrency` withhold for its own multi-currency. If a tenant changes currency after entering cost data, aggregates (cost-per-bottle) would silently mix. We assume single-currency-per-tenant, show a Settings warning, and do NOT block — full multi-currency accounting is a separate effort.
- **Per-row currency display** — displays use the tenant currency (single-currency model), not each row's stamped currency. (The stamp still exists for correctness/audit + a future multi-currency feature.)

## Research Summary

### Codebase Patterns
- **`AppSettings`** (`prisma/schema.prisma:1074-1114`): per-tenant singleton (`@@unique([tenantId])`), RLS-scoped (NOT in `GLOBAL_MODELS`). `currency String @default("USD")` (1087), `costingPolicyVersion` (1095).
- **Settings read/write:** `getCostSettings()` (`src/lib/settings/data.ts:23-49`) already returns `currency`. `saveCostSettings` (`src/lib/settings/actions.ts:42-127`) is `adminAction` + `runInTenantTx` + audit + `revalidatePath("/settings")`, but its `CostSettingsInput` (33-40) has NO currency and it **hardcodes `currency: COST_SETTINGS_DEFAULTS.currency` on write (line 113)** + `policyChanged` (77-83) excludes currency. `CostSettings`/`COST_SETTINGS_DEFAULTS` are the pure shape (`src/lib/cost/policy.ts:9,26`).
- **Settings UI:** `src/app/(app)/settings/SettingsClient.tsx` "Cost accounting" Card (167-224); the "Depletion method" `<select>` (181-188) is the pattern to mirror; state `costForm` (64), save via `saveCost()`→`saveCostSettings` (71-91).
- **`Input` adornment:** `src/components/ui/Input.tsx` — `iconLeft` (props 7-17) renders as a muted left `<span>` with an 8px gap before the input (85-87). A `"$"` in `iconLeft` looks right with zero extra CSS. No money-input variant exists.
- **Cost INPUT sites:** `ExpendablesClient.tsx:349` (Total cost paid), `:417` (Cost per unit — Receive); `MaterialPicker.tsx:272` (Cost per stockUnit). All plain `<Input inputMode="decimal">`, no prefix.
- **Cost DISPLAY sites (hardcoded `$`, no shared helper):** `src/components/cost/CostPanel.tsx:26-31` (`money`/`perL`, rendered via `LotDetailClient.tsx:747`); `src/app/(app)/accounting/page.tsx:31` (inline `money`); `ExpendablesClient.tsx:358-360` (intake preview); `src/app/(app)/compliance/page.tsx:99` (excise `$`). `Intl.NumberFormat` used nowhere; formatting is `toLocaleString`/`toFixed` + literal `$`.
- **`SupplyLot.currency`** (`schema.prisma:1895`) exists but is **NOT stamped** — `createStockMaterialCore` (`src/lib/cellar/materials.ts:309`) + `receiveSupplyCore` (`:350`) select only `costingPolicyVersion`, so the lot falls to the `"USD"` column default. `CostLine`/`OperationCostTransfer`/`BottlingCostSnapshot` DO stamp from `settings.currency` (`consume.ts:54`, `receive.ts`, `cogs-write.ts`). `SupplyConsumption` has no currency column (derives via its `supplyLot`).

### Prior Learnings / Invariants
- No rstack learnings on currency. **D17:** currency is orthogonal to `costingPolicyVersion` — do NOT bump it on a currency change; per-row stamping already gives the "never re-value closed history" guarantee. AppSettings is RLS-scoped; a settings write goes through `runInTenantTx` (Phase-12 safe). Currency symbol must render as React text (escaped) — no `dangerouslySetInnerHTML`.

### External
None — `Intl` is available if we want locale formatting, but a small symbol map matches the codebase (no new dep).

## Key Decisions

| Decision | Choice | Alternatives | Rationale |
|----------|--------|--------------|-----------|
| Currency helper | Pure `src/lib/money/currency.ts`: `SUPPORTED_CURRENCIES` (6, controlled), `CURRENCY_LABELS`, `currencySymbol`, `formatMoney`, `coerceCurrency` | `Intl.NumberFormat` per call | A small symbol map matches the codebase (no locale/dep surprises), is trivially unit-testable, and replaces 3 duplicated inline `$` fns. |
| Editability | Add `currency` to `CostSettingsInput` + persist in the `saveCostSettings` upsert; validate via `coerceCurrency`; do NOT bump policyVersion | New separate action | It's the same "Cost accounting" card; reuse the existing admin/audit/revalidate path. Currency ≠ policy (D17). |
| Client access | A `CurrencyProvider` in the `(app)` layout (server reads `getCostSettings().currency`) + `useCurrency()` | Prop-drill currency into every picker | MaterialPicker is used on /bulk, /ferment, en-tirage; a context avoids threading through all of them ("everywhere"). Server display pages read `getCostSettings().currency` directly. |
| SupplyLot stamp | Stamp `currency: settings.currency` on the opening + received lot | Leave the USD default | A non-USD tenant currently gets USD-labeled lots — a real bug. CostLine already stamps it; make SupplyLot consistent. |
| Mixed currency | Single-currency-per-tenant; relabel forward, no FX, non-blocking Settings warning | Block change if cost rows exist; FX-convert | No rate source; the winery uses one currency. Blocking/ converting is a heavier multi-currency effort (flagged). |
| Display currency | Tenant currency (via provider / server read), not per-row stamped currency | Per-row currency | Single-currency model; aggregates sum in one currency. The per-row stamp remains for audit + future multi-currency. |

## Implementation Units

### Unit 1: Currency vocab + pure money helper
**Goal:** One pure, client-safe module for the 6 currencies + symbol/format.
**Files:** new `src/lib/money/currency.ts`; `test/currency.test.ts`.
**Approach:** `SUPPORTED_CURRENCIES = ["USD","EUR","NZD","AUD","ZAR","GBP"] as const` + `CurrencyCode` type + `CURRENCY_LABELS`; `currencySymbol(code)` (USD $, EUR €, NZD NZ$, AUD A$, ZAR R, GBP £; unknown → the code + space); `formatMoney(amount, code)` = symbol + `toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})` (handles null/NaN → e.g. "—"); `coerceCurrency(raw)` → known code else "USD". No prisma/React.
**Tests:** each symbol; formatMoney for each currency + null/NaN; coerceCurrency unknown→USD, case-insensitive.
**Depends on:** none.
**Verification:** `npm test -- currency` green.

### Unit 2: Make currency editable (action + policy shape)
**Goal:** Persist a chosen currency without touching cost policy.
**Files:** `src/lib/settings/actions.ts` (`CostSettingsInput` + `saveCostSettings`), `src/lib/cost/policy.ts` (already has `currency` — confirm), `test/` (new settings-action-ish or pure guard).
**Approach:** Add `currency?: string` to `CostSettingsInput`; in the upsert `data` set `currency: coerceCurrency(input.currency)` (stop hardcoding line 113); keep `policyChanged` excluding currency (no version bump). Return the coerced currency in the result.
**Tests:** unit-test that `coerceCurrency` gates the input (via the pure helper); note settings actions are DB-bound (proven in Unit 7 e2e).
**Depends on:** Unit 1.
**Verification:** a `runAsTenant` save of `currency:"NZD"` persists on AppSettings; `costingPolicyVersion` unchanged.

### Unit 3: Settings currency picker
**Goal:** The UI control.
**Files:** `src/app/(app)/settings/SettingsClient.tsx`.
**Approach:** In the "Cost accounting" card, add a Currency `<select>` (mirror the Depletion-method select 181-188) over `SUPPORTED_CURRENCIES` with `CURRENCY_LABELS`, bound to `costForm.currency`; include it in `costDirty` + the `saveCostSettings` payload. Add the non-blocking note ("existing costs keep their recorded currency; changing this doesn't convert them"). Design tokens only.
**Tests:** none (UI); covered by Unit 7 QA.
**Depends on:** Unit 1, Unit 2.
**Verification:** pick NZD → save → reload shows NZD.

### Unit 4: Stamp SupplyLot.currency
**Goal:** Lots carry the tenant currency (close the gap).
**Files:** `src/lib/cellar/materials.ts` (`createStockMaterialCore`, `receiveSupplyCore`).
**Approach:** Extend the `appSettings.findFirst` selects (`:308`, `:349`) to include `currency`; set `currency: settings?.currency ?? "USD"` on the `supplyLot.create` data in both paths. (SupplyConsumption stays relation-derived; CostLine already stamps.)
**Tests:** create/receive under a non-USD tenant → lot.currency matches (Unit 7 e2e / scratch).
**Depends on:** none (independent of the helper).
**Verification:** `runAsTenant` with currency NZD → new SupplyLot.currency === "NZD".

### Unit 5: Currency context for client components
**Goal:** `useCurrency()` available app-wide without prop-drilling.
**Files:** new `src/components/money/CurrencyProvider.tsx` (client) + `useCurrency` hook; `src/app/(app)/layout.tsx` (read `getCostSettings().currency` server-side, wrap children).
**Approach:** Server layout reads the tenant currency once and renders `<CurrencyProvider code={currency}>`. `useCurrency()` returns `{ code, symbol }` (default USD if provider absent, so non-app pages don't crash). Pure display helpers still come from `currency.ts`.
**Tests:** light (provider default); real use verified in Unit 7.
**Depends on:** Unit 1.
**Verification:** a client component under the layout reads the tenant symbol.

### Unit 6: Symbol on cost inputs + displays
**Goal:** Every cost field shows the symbol.
**Files:** `src/app/(app)/setup/expendables/ExpendablesClient.tsx` (inputs 349/417 + preview 358-360), `src/components/cellar/MaterialPicker.tsx` (272), `src/components/cost/CostPanel.tsx` (26-31), `src/app/(app)/accounting/page.tsx` (31), `src/app/(app)/compliance/page.tsx` (99).
**Approach:** INPUTS: add `iconLeft={currencySymbol(code)}` (code from `useCurrency()`), drop the "$" ambiguity; keep labels but strip any "$" wording. DISPLAYS: replace inline `money`/`perL`/`$` with `formatMoney(n, code)` — client components via `useCurrency()`, server pages (`accounting/page.tsx`, `compliance/page.tsx`) read `getCostSettings().currency` and pass to `formatMoney`. The intake preview uses the same helper.
**Tests:** none (UI); Unit 7 QA + the pure helper covers formatting.
**Depends on:** Unit 1, Unit 5.
**Verification:** in a non-USD tenant, inputs + CostPanel + accounting + preview all show the right symbol.

### Unit 7: Tests, verify, docs, QA
**Goal:** Lock behavior + refresh the brain.
**Files:** `test/currency.test.ts` (from Unit 1), `docs/architecture/system-map.md` (note the tenant currency + money helper), plan status.
**Approach:** Full suite + build + `verify:invariants`/`tripwires`/`work-orders`/`cost`; a scratch e2e: set Demo Winery currency to NZD, create an expendable with a cost → SupplyLot.currency NZD + displays show NZ$; revert to USD. Manual QA the Settings picker + a couple cost surfaces.
**Tests:** whole vitest suite; the currency unit tests.
**Depends on:** Units 1-6.
**Verification:** all green; system-map updated.

## Test Strategy

**Unit (vitest):** `currency.ts` (symbols, formatMoney incl. null/NaN, coerceCurrency) — mirror `test/cost-policy.test.ts`/`test/intake-cost.test.ts`.
**Integration/verify:** `verify:cost` (cost math unchanged — currency is a label), `verify:work-orders*`, `verify:invariants` + `verify:tripwires`. Note `verify:cost` is currently blocked by pre-existing orphaned Demo Winery data (carried from #036) — if still blocked, rely on the currency unit tests + a scratch stamp check.
**Manual/QA (Demo Winery):** set currency to NZD in Settings → the Add-expendable "Total cost paid" shows `NZ$`, the Receive modal shows `NZ$`, the intake preview + CostPanel + accounting dashboard show `NZ$`; a new SupplyLot stamps `NZD`; revert to USD.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Changing currency mid-data → mixed-currency roll-ups (no FX) | MED | MED | Single-currency model + non-blocking Settings warning; per-row stamp preserved; full multi-currency flagged out of scope. |
| A cost display/input site missed ("everywhere") | MED | LOW | Unit 6 lists every site from the grep; a repo grep for literal `$` in JSX + `toFixed`/`toLocaleString` near cost in Unit 7 catches stragglers. |
| Accidentally bumping `costingPolicyVersion` on a currency change (would re-stamp policy) | LOW | MED | Explicitly keep `policyChanged` excluding currency (D17); Unit 2 verifies version unchanged. |
| Currency symbol XSS | LOW | LOW | Symbols are a fixed code map rendered as React text; `coerceCurrency` rejects unknown input. |
| Provider missing on a route → crash | LOW | LOW | `useCurrency()` defaults to USD when no provider. |

## Success Criteria

- [x] Settings has a currency picker over {USD, EUR, NZD, AUD, ZAR, GBP}; saving persists `AppSettings.currency` and does NOT bump `costingPolicyVersion`.
- [x] Every cost INPUT shows the tenant currency symbol as a fixed prefix; the user types only the number. (expendables intake total, receive cost/unit, create-material cost/unit — via `Input iconLeft`)
- [x] Every cost DISPLAY shows the tenant symbol: CostPanel (`useCurrency`), accounting dashboard + DTC margin (`getTenantCurrency`+`formatMoney`), intake preview. TTB excise `taxDollars` intentionally stays `$` (federal statutory USD).
- [x] New `SupplyLot` rows stamp the tenant currency — proven by a scratch e2e (Demo Winery → NZD → lot.currency=NZD, reverted to USD).
- [x] Changing currency shows a "no conversion" note; existing rows keep their stamped currency (per-row stamp, D17).
- [x] All tests pass (1085 pass / 23 skip); build clean; lint 0 errors; `verify:invariants` (18/18) + `verify:tripwires` (14/14) + `verify:work-orders` (20) green. `verify:cost` teardown still blocked by pre-existing orphaned Demo Winery `accounting_delivery → costExportEvent` data (carried from #036, unrelated to currency); the cost path is covered by the unit suite + the work-orders MATERIAL-cost assertions + the scratch stamp check.

**STATUS: all 7 units built + committed on `feat/tenant-currency`. Ready for /review → /ship.**
