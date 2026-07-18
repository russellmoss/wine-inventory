---
title: Multi-currency invoice ingestion — FX conversion for inventory cost + foreign-currency A/P bills to QBO
type: feat
status: draft
date: 2026-07-18
branch: claude/multi-currency-fx-ingestion
depth: deep
units: 10
---

## Overview

Let a winery ingest a foreign-currency supplier invoice (e.g. the €767.16 NexaParts proforma) with the base
currency set per tenant (Demo Winery = USD). At ingestion we convert each line's landed cost to the base
currency at a **real dated FX rate** (ECB via Frankfurter, not the AI) so inventory cost lands in one
currency and the cost roll-up stays correct, while the **A/P bill posts to QBO in the foreign currency (EUR)**
under a EUR vendor so QuickBooks owns the FX gain/loss and revaluation. Every step is proven end-to-end in
BOTH Cellarhand (the SupplyLot cost + A/P event) and the QBO sandbox (the EUR Bill round-trip), because a
wrong rate silently corrupts inventory valuation and the payable.

## Problem Frame

Today Plan 072 ingests invoices but explicitly **defers FX**: `SupplyLot.currency` is stamped as-is (EUR),
the amount is never converted, and the QBO layer is single-currency by construction (it *withholds*
non-home-currency entries, `qbo/client.ts:64`). That's fine for USD invoices, broken for EUR ones two ways:

1. **The cost roll-up is currency-agnostic** — `weightedAvgUnitCost` (`intake-cost.ts:41`) and the fold
   (`rollup.ts`) sum `unitCost` as bare numbers with no currency check, and `consumeMaterialCore` stamps the
   consumed cost with the *tenant* currency regardless of the lot's. So a EUR lot under a USD tenant silently
   averages €/g and $/g together and mislabels the `CostLine` currency. Cost-per-bottle blends currencies.
   Do-nothing cost: **wrong inventory valuation and wrong COGS** the moment any foreign invoice is intaken.
2. **A/P can't post a foreign bill.** `buildBillPayload` emits no `CurrencyRef`/`ExchangeRate`, the QBO vendor
   is created with no currency, and a EUR bill against a home-currency vendor is rejected. So a foreign
   payable either posts wrong or gets withheld forever.

**Product pressure test:** the highest-value slice is the *inventory conversion* (our ledger's correctness),
not the QBO bill. Even if the QBO sandbox isn't connected, converting at ingestion + storing the foreign
figures makes Cellarhand's cost correct today. The QBO foreign-bill path is the second slice and rides the
same rate. We deliberately do NOT rebuild FX gain/loss or revaluation — QuickBooks already does that; copying
it is a multi-quarter ocean and a great way to get a subtly-wrong ledger.

## Requirements

- MUST: a per-tenant **base (functional) currency**, editable only by admin/developer (the existing
  `isTenantAdminLike` gate); Demo Winery confirmed = USD. (Largely exists — `AppSettings.currency`.)
- MUST: at ingestion, convert each foreign line's landed amount to the base currency at a **dated rate from a
  real feed**, and write the converted per-stock-unit cost to `SupplyLot.unitCost` with
  `SupplyLot.currency = base` — so the roll-up is always single-currency.
- MUST: store the **foreign figures immutably** alongside the base: original amount, currency, rate,
  rate-date, and rate-source, on the lot and the staging invoice. Treat inventory as **historical cost —
  never revalued** (non-monetary asset, IAS 21).
- MUST: the rate comes from a **feed (Frankfurter/ECB), never the AI**; cache the daily rate; support a
  **per-line/per-invoice manual override** (contracted rate); if no rate can be resolved, **fail loud** —
  flag the line and require a human-entered rate, never fabricate or zero (D14).
- MUST: post the A/P **Bill to QBO in the foreign currency** — `CurrencyRef` + `ExchangeRate` on the Bill, a
  **foreign-currency QBO vendor** (`CurrencyRef` set at creation, currency-scoped lookup), and read
  `MultiCurrencyEnabled` from the company. Let QBO own realized/unrealized FX gain/loss + revaluation.
- MUST: **prove it end-to-end in BOTH systems.** In Cellarhand: the SupplyLot base `unitCost` = converted
  amount + stored foreign/rate/date/source; the `ApExportEvent` amount + `exchangeRate` correct. In QBO: the
  Bill posts in EUR under the EUR vendor with the right rate/amount/DocNumber/PrivateNote, idempotently
  (no duplicate on re-post). Re-prove `verify:cost`.
- MUST: a **gated live QBO-sandbox acceptance** that actually posts the EUR bill and reads it back (parallel
  to the existing `verify:accounting` JournalEntry capstone), plus an **offline mock Bill idempotency proof**
  (the mocks leave `postBill` unimplemented today).
- SHOULD: show the fetched rate + the foreign→base converted preview per line on the review screen, editable.
- SHOULD: a gated live Frankfurter fetch acceptance (real EUR→USD historical rate) separate from the fast
  deterministic tests (which stub the fetch).
- NICE: surface the base currency more prominently in settings (it's currently buried in the cost block).

## Scope Boundaries

**In scope:** base-currency gate confirmation; a dated FX-rate service (Frankfurter, keyless) with a daily
DB cache + injectable fetch; converting inventory landed cost to base at ingestion with immutable
foreign/rate storage; review-screen rate field + override + missing-rate fail-loud gate; QBO foreign-currency
vendor + Bill (`CurrencyRef`/`ExchangeRate`); reading `MultiCurrencyEnabled`; end-to-end verification in
Cellarhand + the QBO sandbox (live Bill round-trip + offline mock idempotency); a new invariant that inventory
cost is always stored in the base currency.

**Out of scope (and why):**
- **Realized/unrealized FX gain/loss + currency revaluation** — QBO's job (IAS 21 monetary-item revaluation).
  Rebuilding it is a multi-quarter accounting engine; QBO does it correctly. We push the EUR bill and stop.
- **Revaluing inventory** — inventory is a non-monetary asset carried at historical cost; the receipt-date
  rate is locked in and never revalued. Not a bug, it's the standard.
- **Intraday / bank / contracted rate feeds** — Frankfurter's daily ECB rate + a manual override covers it.
  A keyed provider (openexchangerates/currencyapi) is a later swap behind the same service interface.
- **Multi-currency for the whole app** (sales/DTC, JournalEntries) — this plan is the A/P + inventory intake
  path only. The Commerce7/JE paths keep their home-currency withhold posture.
- **A new "owner" role** — the codebase has no owner role (`ASSIGNABLE_ROLES = user/admin/developer`); the
  gate is admin + developer. If a distinct owner tier is wanted later, that's a separate role addition.
- **Mixed-currency within one invoice** — already rejected/one-currency-per-doc (Plan 072).

## Research Summary

### Codebase Patterns
- **Base currency EXISTS.** `AppSettings.currency` (`schema.prisma:1376`, default USD). Picker in
  `SettingsClient.tsx:187-202`, saved via `saveCostSettings` (`settings/actions.ts:44`) which is an
  `adminAction` → `isTenantAdminLike` (`access.ts:64` = admin OR developer; **no owner role**). Currency is
  deliberately excluded from `costingPolicyVersion`. The settings *page* is view-open (`requireReadyUser`).
  `money/currency.ts` is a LABEL layer only (`SUPPORTED_CURRENCIES`, `coerceCurrency`, no FX).
- **Cost roll-up is currency-agnostic (the hazard).** `weightedAvgUnitCost`/`deriveOpeningLot`
  (`intake-cost.ts:41/22`) and `rollupCost` (`rollup.ts:112`) sum `unitCost` as bare numbers.
  `consumeMaterialCore` (`consume.ts:106`) stamps `CostLine.currency` from `settings.currency`, not the lot's.
  → The converted **base** `unitCost` MUST be what `receiveSupplyCore` writes (`materials.ts:534/536`), so the
  fold never mixes scales. Rounding: `round8` (`rollup.ts:23`, per-unit Decimal(18,8)), `round2`
  (`draw.ts:4`, landed cents). Convert foreign→base BEFORE `allocateLandedCost` (`ingest-invoice-core.ts:236`)
  so charge conservation holds in base.
- **Ingestion apply seam.** `applyIngestedInvoiceCore` (`ingest-invoice-core.ts:197`): subtotals (231-235) →
  `allocateLandedCost` (236) → `normalizeLineToStock` (310) → `receiveSupplyCore({unitCost, currency}, tx)`
  (315-327). `IngestedInvoice.currency` exists (`schema.prisma:3140`); **no FX-rate column anywhere.**
  `IngestedInvoiceLine.allocatedUnitCost` (3177) is the per-line cost slot.
- **QBO is single-currency by construction.** `buildBillPayload` (`qbo/bill.ts:19`) emits NO
  `CurrencyRef`/`ExchangeRate`. `ApEventForBill` has no `currency`. `post-sweep.postBill` (144-199) selects
  the event WITHOUT currency (152), resolves the vendor by name only, caches `externalVendorId`.
  `findOrCreateVendor` (`qbo/client.ts:229`) POSTs `{ DisplayName }` only — **no `CurrencyRef`; QBO fixes a
  vendor's currency at creation and a foreign Bill must match it.** `getCompanyInfo` reads `HomeCurrency` but
  NOT `MultiCurrencyEnabled` (154-158). `classifyFault` maps a currency error → `validation` → terminal
  `FAILED` (needs an explicit branch). `AccountingConnection.homeCurrency` exists (`schema.prisma:2986`).
  `Vendor` has NO currency column; `@@unique([tenantId, name])`.
- **No test posts a Bill.** `verify:accounting` posts a live **JournalEntry** to the sandbox (skips if no
  CONNECTED connection); the idempotency + commerce7 mocks leave `postBill`/`findOrCreateVendor` = `notImpl`.
  `verify:ingest` creates `ApExportEvent` rows but never posts them. QBO env = app creds only
  (`QBO_CLIENT_ID/SECRET/REDIRECT_URI/ENVIRONMENT`); the realm + refresh token live in the
  `AccountingConnection` row (per-tenant OAuth), not env.
- **Fetch + cache idiom.** `qbo/client.ts:85` (injectable `fetchImpl` + full-jitter backoff) is the client
  pattern to mirror. In-memory memo idiom: `map/wayback.ts:24-31`. No existing DB cache table.

### Prior Learnings
- `intake-ap-uom-gotchas` — A/P is asymmetric; invoice units ≠ stock units; QBO `DocNumber` is the per-lot
  idempotency key (can't group N bills under one invoice #); cost cores now take an injected tx;
  `createStockMaterialCore` seeds an opening lot if you pass packageAmount+packageUnit.
- `server-action-actionerror-redacted-in-prod` — the apply/reverse actions RETURN `{ok,error}`, never throw.
- `prisma-neon-migrations-windows` — hand-write the migration.sql, `migrate deploy`, columns-only where
  possible; the FxRate table is a new tenant-neutral lookup (no RLS).

### External Research (QBO multi-currency + FX feed)
- QBO foreign Bill requires: `Preferences.CurrencyPrefs.MultiCurrencyEnabled = true` (**irreversible once
  enabled — a manual prerequisite in the sandbox company**), `CurrencyRef.value` on the Bill, `ExchangeRate`
  (foreign→home) when currency ≠ home, and the referenced **Vendor's currency must equal the Bill's** (set at
  vendor creation, immutable). Omitting `ExchangeRate` lets QBO apply its own daily rate; setting it pins ours.
- Frankfurter (frankfurter.dev): free, **no API key**, ECB reference rates, historical-by-date
  (`/{date}?base=EUR&symbols=USD`). ECB publishes ~16:00 CET on TARGET business days; for a weekend/holiday
  date it returns the most recent prior business day — handle + record the actual rate-date returned.

## Key Decisions

| Decision | Choice | Alternatives Considered | Rationale |
|----------|--------|------------------------|-----------|
| Rate source | Frankfurter (ECB), keyless, daily DB cache, injectable fetch | LLM-provided rate; keyed provider (openexchangerates) | LLMs don't know live FX (stale/hallucinated) — wrong money. ECB is canonical for EUR, free, no secret. Keyed providers are a later swap behind the same interface. |
| Where conversion happens | Convert foreign→base BEFORE `allocateLandedCost`, so allocation + `unitCost` are all in base | Convert per-lot after normalize; convert only for display | Keeps charge-conservation + the whole roll-up single-currency; `receiveSupplyCore` writes base `unitCost`, `SupplyLot.currency`=base. The roll-up is currency-agnostic, so base-in is the only safe input. |
| Inventory revaluation | NEVER revalue — historical cost at receipt-date rate | Mark-to-market inventory | IAS 21: inventory is non-monetary, carried at the transaction-date rate. Revaluing it is wrong + would corrupt cost immutability (D17). |
| FX gain/loss + revaluation | QBO owns it; we push the EUR bill + `ExchangeRate` and stop | Rebuild realized/unrealized FX in-app | It's a real accounting engine (multi-quarter ocean); QBO does it correctly. Copying it = a subtly-wrong ledger. |
| Rate date | Receipt/ingestion date (default), overridable per invoice | Invoice date; payment date | Receipt-date is the inventory-costing basis; overridable for a booked/contracted rate. (Confirm with the accountant; easy to change the default.) |
| Missing rate | FAIL LOUD — flag + require a human-entered rate; never $0/fabricate | Default to 1.0; skip conversion | D14 discipline. A wrong rate is worse than a blocked line. |
| Foreign QBO vendor | Add `Vendor.currency`; currency-scoped `findOrCreateVendor` sets `CurrencyRef`; a EUR vendor is distinct from a USD one of the same name | Reuse the one vendor; strip currency | QBO fixes vendor currency at creation + the Bill must match. One name bought in 2 currencies = 2 QBO vendors. |
| Storage | Store base `unitCost` + `currency`(=base) AND foreign amount + rate + rate-date + source, immutably | Store only base; store only foreign | Auditability + reversibility; the base drives the roll-up, the foreign proves the source. |
| Verification | Offline mock Bill idempotency proof + a **gated live QBO-sandbox EUR Bill round-trip**; deterministic FX tests stub the fetch + a gated live Frankfurter fetch | Only mock; only live | The mock proves logic every CI run; the live proves the real QBO contract. Neither alone is enough for governed money. |

## Council review (outside voice, Gemini 3.1 Pro) — folded findings

These AMEND the units below. All 6 confirmed + folded (OpenAI quota-errored; Codex CLI version-stale).

1. **[P0] A/P amount is FOREIGN, not base — the double-conversion bug.** U4's "amount in base" was WRONG. If the
   QBO Bill carries a base (USD) amount with `CurrencyRef=EUR`+`ExchangeRate`, QBO applies the rate AGAIN
   (base × rate) → inflated GL. The two amounts are DECOUPLED, from the same rate:
   - `SupplyLot.unitCost` = **BASE** (USD), converted, for the roll-up (+ the foreign figures stored for audit).
   - `ApExportEvent` stores the **FOREIGN** amount (EUR 767.16) + `currency = EUR` + `exchangeRate`; the QBO Bill
     `Line.Amount` = the FOREIGN amount; QBO derives the home GL = foreign × ExchangeRate.
   - **Reconciliation invariant:** `Cellarhand inventory-asset (base) == round2(foreign × exchangeRate)`. Assert
     it in verify:ingest AND the QBO read-back (U8/U9). → rewrites U4 + U7 (below).
2. **[P1] Read `MultiCurrencyEnabled` EARLY, not at AP-export.** Checking it in U7 (post-sweep) orphans costed,
   un-exportable inventory. Read it at connect + on `AccountingConnection.multiCurrencyEnabled`; the review
   screen WARNS up front ("this QBO company has multicurrency off — the EUR bill won't post; enable it first").
   Inventory conversion (Cellarhand-side) still proceeds (our cost is correct without QBO); the A/P consequence
   is made visible, never a silent terminal FAIL at sweep. → amends U5 + U7.
3. **[P1] Lock the FX rate once a lot is created.** A rate override AFTER apply would re-export A/P at the new
   rate while `SupplyLot.unitCost` stays old → Cellarhand inventory permanently decouples from QBO's GL.
   Rate is editable ONLY on a `pending` staging invoice (pre-apply); changing it post-apply = reverse the
   intake (existing `reverseIngestedInvoiceCore`) + re-ingest. → amends U5 + the invariant (U10).
4. **[P1] Vendor: `@@unique([tenantId, name, currency])` + currency-suffixed QBO DisplayName.** A supplier
   bought in EUR AND USD needs 2 Vendor rows + 2 QBO vendors (currency immutable at creation). QBO DisplayName
   is globally unique per company, so the EUR vendor posts as e.g. "NexaParts B.V. (EUR)". → rewrites U1 (unique)
   + U6 (display name + currency-scoped lookup).
5. **[P2] Pin rate direction + rounding.** QBO `ExchangeRate` = HOME-per-FOREIGN (USD per 1 EUR). Fetch
   Frankfurter `base=<foreign>&symbols=<home>` so the number IS USD-per-EUR — one convention everywhere, no
   inversion (rate² error). Derive base `unitCost` = foreign × rate, `round2` at the money level so Σ lot base
   costs == QBO's derived GL debit; `round8` only for the per-stock-unit. → amends U2 + U4 + U7.
6. **[P2] FX cache: RLS allow-list + CET date.** The tenant-neutral `FxRate` table must be added to the
   tenant-isolation checker's GLOBAL_MODELS allow-list (or verify:tenant-isolation fails). Normalize the rate
   date to the **ECB publication day (CET)** before the lookup/fetch — a late-day PST ingest must not fetch
   "tomorrow's" European rate. → amends U1 + U2.

## Implementation Units

### Unit 1: Schema + migration — FX cache table + FX columns
**Goal:** Add the FX rate cache + the columns to store base + foreign + rate on the lot, staging, A/P event, and vendor.
**Files:** `prisma/schema.prisma`, new `prisma/migrations/<ts>_multi_currency_fx/migration.sql`
**Approach:** New tenant-NEUTRAL `FxRate` lookup (`base`, `quote`, `rateDate DateTime`, `rate Decimal`, `source String`, `fetchedAt DateTime`, `@@unique([base, quote, rateDate])`) — a global reference table, NO tenantId/RLS (rates aren't tenant-scoped), mirror the reference-table pattern. Nullable, RLS-neutral column adds on existing tables: `SupplyLot` (`foreignUnitCost Decimal?`, `foreignCurrency String?`, `fxRate Decimal?`, `fxRateDate DateTime?`, `fxRateSource String?` — the base `unitCost`/`currency` stay as the roll-up basis); `IngestedInvoice` (`fxRate Decimal?`, `fxRateDate DateTime?`, `fxRateSource String?`, `baseCurrency String?`); `ApExportEvent` (`exchangeRate Decimal?` — it already stores `currency`); `Vendor` (`currency String?`). Reconsider `Vendor @@unique([tenantId, name])` → keep name unique but resolve QBO vendor by (name, currency) via a mapping (simplest: `externalVendorId` stays, add the vendor's own `currency`; a name bought in 2 currencies becomes 2 Vendor rows only if truly needed — default is one Vendor row carrying its transaction currency). Hand-write the SQL (columns-only ADD COLUMN + one CREATE TABLE), `db:generate`.
**Tests:** none (schema); `verify:raw-sql` + `verify:naming` + `verify:tenant-isolation` stay green (FxRate is global — confirm it's allow-listed as a non-tenant table like the Better-Auth core, or given a deliberate no-RLS rationale).
**Depends on:** none
**Execution note:** touch `prisma/schema.prisma` in the MAIN checkout; a hook fires on schema edits. Windows: hand-write SQL, `migrate deploy` (not `migrate dev`).
**Patterns to follow:** the `20260717120000_invoice_ingestion` migration; reference-table models (no tenantId).
**Verification:** `npm run db:generate` clean; migration applies; new columns nullable + absent from identity uniques.

### Unit 2: FX rate service (Frankfurter + daily cache, pure conversion)
**Goal:** A dated FX-rate service: fetch (read-through cached), convert, round — deterministic + testable.
**Files:** new `src/lib/money/fx/rate-service.ts`, new `src/lib/money/fx/frankfurter.ts` (client), new `src/lib/money/fx/convert.ts` (pure)
**Approach:** `frankfurter.ts`: a small client mirroring `qbo/client.ts` (injectable `fetchImpl`, full-jitter backoff, pure parse) hitting `https://api.frankfurter.dev/v1/{date}?base={base}&symbols={quote}` — keyless. Returns `{ rate, rateDate (the date the API actually used), source: "ECB via Frankfurter" }`. `rate-service.ts`: `getRate(base, quote, date, {fetchImpl?})` reads the `FxRate` table for `(base, quote, rateDate)`, on miss fetches + upserts (record the API's actual rateDate, which may differ for weekends), with a wayback-style in-memory L1 memo; same-currency → rate 1.0 no fetch; on failure returns a typed `{ ok:false }` (NEVER a fabricated rate). `convert.ts` (PURE): `convertToBase({ amountForeign, rate })` → `round8`/`round2` per the caller; conservation-safe.
**Tests:** unit (stubbed fetch) — cache read-through (one fetch per pair/date); same-currency short-circuit; weekend date returns the API's prior-business-day rateDate; missing/failed fetch → typed error not a throw and NOT rate 1.0; conversion + rounding correctness (€767.16 × rate, round to cents/8). Gated live: `scripts/verify-fx-live.ts` (needs network) fetches a real EUR→USD historical rate and asserts it's a sane positive number.
**Depends on:** Unit 1
**Patterns to follow:** `qbo/client.ts:85` (injectable fetch + backoff), `map/wayback.ts:24-31` (memo), `cost/rollup.ts:23` (round8).
**Verification:** `npm test` FX suite green; `npx tsx scripts/verify-fx-live.ts` returns a real rate.

### Unit 3: Base-currency setting gate (confirm + surface)
**Goal:** Ensure base currency is set + editable only by admin/developer, and Demo = USD.
**Files:** `src/app/(app)/settings/SettingsClient.tsx`, `src/lib/settings/actions.ts` (confirm gate), maybe `src/app/(app)/settings/page.tsx`
**Approach:** The write is already gated (`saveCostSettings` = `adminAction` → `isTenantAdminLike` = admin+developer). Confirm that gate; there is NO owner role (decide: leave as admin+developer, or add an `owner` role — OUT OF SCOPE unless the user wants it). Optionally lift the currency picker out of the cost block into its own clearly-labelled "Base currency (used to convert foreign invoices)" control so it's discoverable. Confirm Demo Winery = USD (a one-line data check, not a migration). Add a small test asserting a non-admin/non-developer is rejected by `saveCostSettings`.
**Tests:** unit/integration — `saveCostSettings` rejects a plain user (VALIDATION/forbidden); accepts admin + developer; currency persists + does NOT bump `costingPolicyVersion`.
**Depends on:** none
**Patterns to follow:** `access.ts:64` (`isTenantAdminLike`), `settings/actions.ts:44`.
**Verification:** gate test green; Demo `AppSettings.currency == "USD"` verified via a `runAsTenant` read.

### Unit 4: Ingestion FX conversion (MONEY-CRITICAL)
**Goal:** Convert each foreign line's landed cost to base at the dated rate; write base `unitCost` + store foreign/rate/date/source; keep the roll-up single-currency.
**Files:** `src/lib/ingest/ingest-invoice-core.ts`, `src/lib/cellar/materials.ts` (thread foreign/rate through `receiveSupplyCore` onto the lot), `src/lib/ingest/actions.ts`
**Approach:** In `applyIngestedInvoiceCore`, when `invoice.currency` ≠ base: resolve the rate (Unit 2, at the receipt/ingestion date, honoring a stored manual override — see Unit 5), convert each subtotal foreign→base BEFORE `allocateLandedCost` (line 236) so allocation + conservation are in base; `receiveSupplyCore` receives the **base** `unitCost` + `currency = base`, PLUS the foreign figures (`foreignUnitCost`, `foreignCurrency`, `fxRate`, `fxRateDate`, `fxRateSource`) to stamp on the lot. If no rate resolves → return `{ ok:false, needsAck?:"fx-rate" }` (fail loud, never $0). **A/P side (council #1 — DECOUPLED):** `emitApExportForReceipt` stamps `ApExportEvent.amount` = the **FOREIGN** amount (EUR, `qtyReceived × foreign unitCost`), `ApExportEvent.currency` = the **foreign** currency (EUR), and `ApExportEvent.exchangeRate` = the rate — NOT the base amount (QBO would double-convert). Also stamp `IngestedInvoice.fxRate/date/source/baseCurrency`. Rounding: derive base at the money level with `round2` so Σ base == QBO's derived GL, `round8` only for the per-stock-unit. `receiveSupplyCore` writes base `unitCost` at `materials.ts:534` (unchanged consumer) + the new foreign columns. Governed refactor — keep existing call sites working.
**Tests:** extend `scripts/verify-ingest.ts` (new EUR scenario, anchored on the existing Scenario 3): stub the FX service to a fixed rate; assert `SupplyLot.unitCost` == foreign × rate normalized (round8), `SupplyLot.currency == base`, foreign columns stored; **`ApExportEvent.amount` == the FOREIGN (EUR) amount + `currency == EUR` + `exchangeRate` set** (NOT base — the double-conversion guard); **reconciliation invariant** `SupplyLot base inventory value == round2(ApExportEvent.foreign amount × exchangeRate)`; **historical-cost-not-revalued** (change the base rate later, re-read the lot cost — unchanged); **manual override** honored; **missing-rate → apply blocked** (mirror the proforma-gate assertion). Re-prove `scripts/verify-cost.ts` (roll-up now single-currency — no mixed EUR/USD lot).
**Depends on:** Units 1, 2, 3
**Execution note:** governed money code → eng review; re-prove `verify:cost`.
**Patterns to follow:** `ingest-invoice-core.ts:236/310/315`, `materials.ts:498/534`, `ap-emit.ts`.
**Verification:** `npm run verify:ingest` (new FX scenario) + `npm run verify:cost` green.

### Unit 5: Review screen — FX rate field, override, missing-rate gate
**Goal:** Show the fetched rate + foreign→base converted preview per line, editable; block Confirm on a missing rate.
**Files:** `src/app/(app)/setup/expendables/ingest/ingest-review-model.ts` (pure), `.../IngestReviewClient.tsx`, `src/lib/ingest/actions.ts` (persist the override), `src/lib/ingest/ingest-invoice-core.ts` (updateIngestedInvoiceCore accepts an fxRate override)
**Approach:** On load, if `isForeignCurrency(doc.currency, base)`, fetch the suggested rate (Unit 2) and show it in a doc-level "Exchange rate (EUR → USD)" input near the pre-commit summary — pre-filled, editable (per-transaction override), with the rate-date + source shown. Per `LineRow`, show the converted-base preview beside the existing landed cell (`IngestReviewClient.tsx:404`). Extend `canConfirmDoc` (`ingest-review-model.ts:145`, loop 160-169): a foreign doc with no resolvable rate → a blocking reason ("Enter the exchange rate — the FX feed had none for that date"). Persist the override via `updateIngestedInvoiceAction` → `IngestedInvoice.fxRate` (used by Unit 4's apply). Pure helpers (`convertedPreview`, `fxGateReason`) unit-tested.
**Tests:** pure model — foreign doc + rate → converted preview; foreign doc + no rate → confirm blocked; override changes the preview; base-currency doc → no rate UI, not blocked.
**Depends on:** Units 2, 4
**Execution note:** UI is manual browser QA (no jsdom/RTL) — keep logic in pure helpers.
**Patterns to follow:** `ingest-review-model.ts` (pure gate), `IngestReviewClient.tsx` LineRow.
**Verification:** model tests green; browser QA — ingest the EUR proforma, rate shows + editable, Confirm blocked when cleared.

### Unit 6: QBO foreign-currency vendor
**Goal:** Create/resolve a QBO vendor whose currency matches the bill (EUR), so a foreign Bill isn't rejected.
**Files:** `src/lib/accounting/adapter.ts`, `src/lib/accounting/qbo/client.ts`, `src/lib/accounting/post-sweep.ts`, `src/lib/vendors/vendors.ts`, `src/lib/accounting/ap-emit.ts`
**Approach:** Thread a `currency` through the vendor path: `AccountingAdapter.findOrCreateVendor(ctx, name, currency)` (`adapter.ts:134`); `qbo/client.ts:229` sets `CurrencyRef: { value: currency }` in the `POST /vendor` body and scopes the lookup so a EUR vendor is distinct from a USD one (query by DisplayName, then verify `CurrencyRef` matches — if a same-name vendor exists in the wrong currency, create a currency-suffixed DisplayName or a separate vendor). `Vendor.currency` (Unit 1) is the source; `ap-emit.ts` resolves the receipt's currency and carries it; `post-sweep.postBill` (168-178) resolves/caches the currency-correct `externalVendorId`.
**Tests:** offline (mock adapter) — a EUR receipt resolves/creates a EUR vendor with `CurrencyRef`; a USD vendor of the same name isn't reused for a EUR bill; `externalVendorId` cached per currency.
**Depends on:** Unit 1
**Patterns to follow:** `post-sweep.ts:168-178`, `qbo/client.ts:229`, `vendors/vendors.ts:47`.
**Verification:** mock-adapter test green; live: the sandbox vendor is created as EUR (Unit 8).

### Unit 7: QBO foreign-currency Bill (CurrencyRef + ExchangeRate)
**Goal:** Post the A/P Bill to QBO in the foreign currency with the pinned rate.
**Files:** `src/lib/accounting/qbo/bill.ts`, `src/lib/accounting/post-sweep.ts`, `src/lib/accounting/qbo/client.ts` (getCompanyInfo + classifyFault), `prisma/schema.prisma` (AccountingConnection.multiCurrencyEnabled — via Unit 1 or here)
**Approach:** Extend `ApEventForBill` + `buildBillPayload` (`qbo/bill.ts`) with `currency` + `exchangeRate`; the Bill `Line.Amount` uses the event's **FOREIGN** amount (EUR — set in U4), emit `CurrencyRef: { value: currency }` and, when `currency ≠ homeCurrency`, `ExchangeRate: exchangeRate`. **Rate direction (council #5):** `ExchangeRate` is HOME-per-FOREIGN (USD per 1 EUR) — the exact value the FX service returns for `base=<foreign>,symbols=<home>`; assert this so the rate is never inverted. `post-sweep.postBill` (line 152) selects `currency` + the `ApExportEvent.exchangeRate` and passes them. Read `Preferences.CurrencyPrefs.MultiCurrencyEnabled` in `getCompanyInfo` (`qbo/client.ts:154`) and surface it on `AccountingConnection.multiCurrencyEnabled` **at connect time (council #2 — early), not at post**. If a foreign bill reaches the sweep while multicurrency is disabled → WITHHELD with a clear reason (never a terminal validation FAIL); the review screen already warned the user up front (U5). Add a `classifyFault` branch so a currency/multicurrency error is recognized (WITHHELD/needs-config), not silently terminal.
**Tests:** pure — `buildBillPayload` emits `CurrencyRef`+`ExchangeRate` for a foreign bill, omits `ExchangeRate` when currency == home; `getCompanyInfo` parses `MultiCurrencyEnabled`; a disabled-multicurrency foreign bill → WITHHELD reason.
**Depends on:** Units 1, 6
**Patterns to follow:** `qbo/bill.ts:19`, `post-sweep.ts:144`, `qbo/client.ts:145`.
**Verification:** pure tests green; live round-trip (Unit 8).

### Unit 8: QBO Bill verification — mock idempotency + live sandbox round-trip
**Goal:** Prove the Bill path both offline (every CI run) and live against the QBO sandbox.
**Files:** `scripts/verify-accounting-idempotency.ts` (+ the inline mock adapter), `scripts/verify-commerce7.ts` mock (implement `postBill`/`findOrCreateVendor`), `scripts/verify-accounting.ts` (add a Bill block), maybe a new `scripts/verify-fx-bill-live.ts`
**Approach:** (a) OFFLINE: implement `postBill` + `findOrCreateVendor(name, currency)` in the mock adapters (today `notImpl`) so the idempotency harness drives a **Bill** through the sweep under the 5 failure modes (rollback, normal, crash-between-accept-and-finalize → VERIFYING → adopt, concurrent double-sweep, backlog) — exactly-once, no duplicate Bill. (b) LIVE: extend `scripts/verify-accounting.ts` (the JournalEntry capstone) with a parallel **Bill** block — seed an `ApExportEvent` in EUR + `exchangeRate` + a EUR vendor + a `PENDING`/`Bill` `AccountingDelivery`, run `runAccountingPostSweep`, assert `POSTED` + `externalId`, then `getById`/`findByDocNumber` read-back asserts the QBO Bill has `CurrencyRef.value == "EUR"`, the `ExchangeRate`, the expected `TotalAmt`, `DocNumber`, and `PrivateNote` (invoice #). Re-run the sweep → adopts (no duplicate). **Skips gracefully if no CONNECTED sandbox connection or MultiCurrency is disabled** (like the existing JE capstone), printing the prerequisite.
**Tests:** the scripts ARE the tests.
**Depends on:** Units 6, 7
**Execution note:** requires an OAuth-connected QBO sandbox for Demo Winery + `MultiCurrencyEnabled=true` on that sandbox company (a MANUAL, irreversible prerequisite). If not connected, the offline mock proof still gates every run.
**Patterns to follow:** `scripts/verify-accounting.ts` (live JE), `scripts/verify-accounting-idempotency.ts` (mock + 5 modes).
**Verification:** `npm run verify:accounting-idempotency` (Bill path) green; `npm run verify:accounting` posts + reads back a EUR Bill when connected.

### Unit 9: End-to-end EUR acceptance (definition of done)
**Goal:** The real €767.16 proforma, ingested end-to-end, lands correctly in BOTH Cellarhand and QBO.
**Files:** `scripts/verify-ingest.ts` (or a new `scripts/verify-fx-e2e.ts`), reuse `docs/invoice examples/Proforma-W583.1869.pdf`
**Approach:** Drive the full path for the EUR proforma: extraction (already classifies EUR) → stage → set a known rate (stub for CI determinism; live-fetch in the gated variant) → `applyIngestedInvoiceCore`. Assert in CELLARHAND: 2 EQUIPMENT lots with `unitCost` = converted base (round8), `currency == USD`, foreign `€` figures + rate/date/source stored; `ApExportEvent` amount in base + `exchangeRate` set. Then (gated, connected) drive the sweep and assert in QBO SANDBOX: a EUR Bill under the EUR vendor, `ExchangeRate` + `TotalAmt €767.16`, `DocNumber`/`PrivateNote`, idempotent re-post. This is the DoD: **provable in Cellarhand AND QBO**.
**Tests:** the acceptance script IS the test (deterministic core + gated live QBO tail).
**Depends on:** Units 4, 5, 7, 8
**Patterns to follow:** `scripts/verify-ingest.ts` scenarios; the Unit-8 live Bill block.
**Verification:** deterministic EUR acceptance green in CI; gated live posts the EUR Bill to the sandbox + reads it back.

### Unit 10: Verify sweep + registers + invariant
**Goal:** Prove the whole thing green and record the money invariant.
**Files:** new `docs/architecture/invariants/COST-<n>-inventory-cost-in-base-currency.md`, `INVARIANTS.md`, `docs/architecture/parity/*` (if claiming coverage), `.env.example` (confirm no new secret — Frankfurter is keyless), `NOW.md`
**Approach:** Run the full gate set. New invariant: "inventory cost is ALWAYS stored in the tenant base currency; foreign amount + rate are preserved for audit but NEVER enter the cost roll-up, and inventory is never revalued for FX (historical cost)." Resolvable `verify:` (verify:cost + verify:ingest FX scenario). Confirm `.env.example` unchanged (no FX key). Update `NOW.md`.
**Tests:** the verify suite is the test.
**Depends on:** Units 1-9
**Verification:** `verify:cost`, `verify:ingest`, `verify:accounting*`, `verify:ai-native`, `verify:invariants`, `verify:parity`, `verify:raw-sql`, `verify:naming`, `verify:tenant-isolation`, typecheck, `next build` all green.

## Test Strategy

**Unit (pure, no DB/network):** FX conversion + rounding (Unit 2 `convert.ts`), the rate service with a
stubbed fetch (cache read-through, same-currency, weekend rate-date, missing-rate typed error), the review
model FX gate + converted preview (Unit 5), `buildBillPayload` CurrencyRef/ExchangeRate (Unit 7).
**Integration (Demo Winery, `runAsTenant`):** `verify:ingest` new FX scenario — converted base `unitCost`,
foreign stored, historical-cost-not-revalued, manual override, missing-rate fail-loud; `verify:cost` re-proof
(single-currency roll-up); the settings gate (Unit 3).
**QBO offline (mock adapter):** Bill idempotency under 5 failure modes + currency-correct vendor (Unit 8a).
**QBO live sandbox (gated):** the EUR Bill round-trip — post + read back CurrencyRef/ExchangeRate/amount/
DocNumber/PrivateNote, idempotent (Unit 8b); the real EUR proforma end-to-end (Unit 9).
**Gated live FX:** a real Frankfurter EUR→USD historical fetch (Unit 2), kept out of the fast path.
**Definition of done:** Unit 9 — the €767.16 proforma provably lands correctly in Cellarhand AND the QBO sandbox.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Mixed-currency roll-up if conversion is skipped/partial → wrong inventory valuation + COGS | MED | HIGH | Convert at ingestion so `SupplyLot.unitCost` is ALWAYS base; `verify:cost` re-proof; invariant (Unit 10) |
| LLM/hand rate instead of a feed → wrong money | LOW | HIGH | Rate from Frankfurter/ECB only; missing → fail loud, never fabricate (D14) |
| QBO sandbox not connected / MultiCurrency not enabled (irreversible) → live Bill acceptance can't run | HIGH | MED | Offline mock Bill proof gates every run; live skips gracefully + prints the prerequisite; document the one-time sandbox setup |
| QBO vendor currency immutable + `@@unique([tenantId,name])` → a name bought in 2 currencies collides | MED | MED | Add `Vendor.currency`; currency-scoped QBO vendor resolution; a distinct QBO vendor per currency when needed |
| `classifyFault` maps a currency error → terminal `validation FAILED` | MED | MED | Explicit branch → WITHHELD/needs-config, not terminal (Unit 7) |
| Weekend/holiday invoice date → ECB has no rate that day | MED | LOW | Frankfurter returns the prior business day; store the ACTUAL rateDate returned |
| Rounding drift (foreign cents vs base per-unit) | MED | MED | Convert foreign→base BEFORE allocate (base cents via round2), per-unit via round8; conservation asserted |
| Reversing an FX intake must restore the exact base cost | LOW | MED | `reverseIngestedInvoiceCore` already removes the lot + A/P by identity; the stored rate makes it auditable |
| Frankfurter downtime | LOW | LOW | Daily DB cache (one fetch/day); manual override; fail-loud on a true miss |
| Prod ActionError redaction on the apply/rate action | LOW | MED | Actions RETURN `{ok,error}`, never throw (prior learning) |

## Success Criteria

- [ ] Base currency is per-tenant, editable only by admin/developer; Demo Winery = USD (confirmed via read-back).
- [ ] A dated FX rate comes from Frankfurter/ECB (keyless), daily-cached, injectable for tests; a missing rate
      fails loud (never fabricated).
- [ ] Ingesting a EUR invoice writes `SupplyLot.unitCost` in USD (converted at the dated rate) with the foreign
      amount + rate + date + source stored; `SupplyLot.currency == USD`; the roll-up is single-currency
      (`verify:cost` green); inventory is not revalued when the rate later changes.
- [ ] The review screen shows the rate + converted preview, allows an override, and blocks Confirm on a missing rate.
- [ ] The A/P Bill posts to QBO in EUR under a EUR vendor with `CurrencyRef` + `ExchangeRate`, correct amount,
      DocNumber + PrivateNote (invoice #), idempotently.
- [ ] **Proven in BOTH systems:** offline mock Bill idempotency (every CI run) + a gated live QBO-sandbox EUR
      Bill round-trip (post + read-back); and the real €767.16 proforma end-to-end (Unit 9) lands correctly in
      Cellarhand AND QBO.
- [ ] `verify:cost`, `verify:ingest`, `verify:accounting*`, `verify:ai-native`, `verify:invariants`,
      `verify:parity`, `verify:raw-sql`, `verify:naming`, `verify:tenant-isolation`, typecheck, `next build` green.
- [ ] No regressions in existing tests; no new secrets in `.env.example`.

## Confidence Check

| Section | Confidence | Notes |
|---------|-----------|-------|
| Problem Frame | HIGH | The currency-agnostic roll-up + single-currency QBO layer are confirmed in code (research maps) |
| Scope Boundaries | HIGH | The "QBO owns FX gain/loss, we don't rebuild it" line is the standard (IAS 21) + matches the existing QBO integration posture |
| Implementation Units | HIGH | Exact seams, files, and line numbers confirmed by parallel research; change map is small + localized |
| Test Strategy | MEDIUM | The LIVE QBO Bill acceptance depends on an OAuth-connected sandbox + MultiCurrency enabled (a manual, possibly-unavailable prerequisite); mitigated by the offline mock Bill proof that gates every run |
| Risk Assessment | HIGH | QBO vendor-currency immutability, multicurrency-enablement, and the fault-classification gap are named with concrete mitigations |

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR | Money-correctness pass; the P0 (A/P foreign amount) surfaced here + confirmed by council; all folded |
| Outside Voice (Council) | Gemini 3.1 Pro | Independent cross-model challenge | 1 | ISSUES_ADDRESSED | 6 findings (1 P0 double-conversion, 3 P1, 2 P2) — ALL folded into the units + amendments block. OpenAI quota-errored; Codex CLI version-stale |
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | -- | not run (scope locked with user) |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | -- | UI is one review-screen rate field; low surface |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | -- | -- |

**COUNCIL (Gemini 3.1 Pro) — folded:**
- **P0 double-conversion:** the QBO Bill must carry the FOREIGN amount + `CurrencyRef`+`ExchangeRate`; the plan's
  original "A/P amount in base" would make QBO apply the rate twice. `ApExportEvent` now stores foreign amount +
  currency + rate; `SupplyLot.unitCost` = base; invariant `base == round2(foreign × rate)`. ✅ (rewrote U4 + U7)
- **P1 multicurrency gate too late** (read early + warn at review, don't orphan inventory). ✅ (U5 + U7)
- **P1 rate-override-after-apply** decouples inventory from GL → rate editable only pre-apply; change = void+re-ingest. ✅ (U5 + U10)
- **P1 vendor collision** → `@@unique([tenant,name,currency])` + currency-suffixed QBO DisplayName. ✅ (U1 + U6)
- **P2 rate direction** home-per-foreign (USD-per-EUR) pinned + `round2` base derivation. ✅ (U2 + U4 + U7)
- **P2 FxRate table** RLS allow-list + CET rate-date normalization (late-day PST ingest off-by-one). ✅ (U1 + U2)

**VERDICT:** ENG + COUNCIL complete; the P0 money-correctness bug (double-conversion) caught + fixed; all 6
findings folded. **Plan hardened. Ready for `/work`.** U1/U4/U6/U7 are governed money → eng-review-on-diff at ship.
