---
title: Invoice ingestion — duplicate guard, one-Bill-per-invoice QBO posting, and Paid/Outstanding A/P status (two-way)
type: feat
status: completed
date: 2026-07-18
branch: claude/invoice-ingestion-features-95d4df
depth: deep
units: 11
---

## Overview

Three connected upgrades to the Plan-072 invoice-ingestion pipeline so a winery can trust that (1) the same
supplier invoice never gets booked twice, (2) every ingested invoice shows up in QuickBooks as **one clean
bill** the bookkeeper can see, and (3) each invoice carries a **Paid / Outstanding** status that stays true on
both sides — so anyone looking at QBO's A/P instantly knows what still needs paying and what's already settled.

Two of the three already have real foundations in the codebase (duplicate detection exists but is silently
dropped; A/P Bills already post to QBO but one-per-line). This plan hardens #1 into a real confirm gate,
re-shapes #2 into one-bill-per-invoice, and builds #3 from scratch on the QBO-standard **BillPayment** model.

## Problem Frame

**Who has this problem:** the winemaker/owner (russell) uploading supplier invoices, and the bookkeeper/accountant
reconciling in QuickBooks.

- **Double-booking:** today a re-uploaded invoice is detected (`(vendor, invoice#)` and file-hash) but the warning
  is thrown away in the UI. The user gets no "this is a duplicate — continue?" prompt, so the same goods + A/P can
  be booked twice. Cost of doing nothing: inflated inventory, duplicate payables, a painful QBO clean-up.
- **Fragmented QBO view:** a 5-line invoice becomes 5 separate QBO Bills today (per-lot `DocNumber = ap:<lotId>`).
  The bookkeeper can't see "the invoice"; they see five payables with the invoice # buried in each memo. The user
  explicitly wants to "see it in QBO's invoice section."
- **No payment truth:** nothing records whether an invoice was already paid (winemaker pays a lot of small orders
  by company card or check up front). The bookkeeper can't tell from QBO which bills are already settled vs owed,
  so they risk paying something twice or chasing a bill that's done.

**Product note (surfaced, not blocking):** In QuickBooks a *supplier* invoice is a **Bill** (Accounts Payable),
not an "Invoice" — QBO reserves "Invoice" for money a *customer* owes you (A/R). So "load into QBO's invoice
section" correctly means **QBO → Expenses/Bills / A/P aging**. This plan uses Bills; the UI copy should say
"sent to QuickBooks as a bill" so the mental model matches reality.

## Requirements

- MUST: On ingestion, when an uploaded document matches an existing invoice by `(vendorName, vendorInvoiceNumber)`
  **or** exact `fileSha256`, warn the user with "This is detected as a duplicate invoice, do you want to continue?"
  and require an explicit choice (continue / discard). No silent double-booking.
- MUST: A hard duplicate re-check at **apply** time (not just stage time), gated by an explicit `allowDuplicate`
  acknowledgement, so a duplicate can never be *applied* without the human saying so.
- MUST: When QBO is connected, applying an ingested invoice posts **one Bill per invoice** (multi-line, one line
  per distinct debit/GL account), keyed idempotently by the invoice, with the supplier invoice # on the Bill.
- MUST: The per-lot A/P emit is **suppressed** for ingestion-sourced receipts (the aggregate path owns A/P) so
  we never emit both a per-lot Bill and an aggregate Bill for the same goods. Manual (non-ingest) receipts keep
  the existing per-lot behaviour unchanged.
- MUST: The uploader flow requires selecting **Paid** or **Outstanding** for each invoice before it can be
  applied/confirmed. Status is stored on `IngestedInvoice` and carried to the A/P outbox.
- MUST: Payment status syncs to QBO the ERP-standard way (see Key Decisions): **Outstanding** = a posted Bill with
  a full balance (QBO shows it as owed automatically); **Paid** = a **BillPayment** recorded against the Bill from
  a chosen pay-from account, so QBO's A/P shows it settled.
- MUST: Two-way truth — the reconcile sweep reads each posted Bill's **Balance** back from QBO and reflects
  Paid/Outstanding into the app, so a payment recorded by the bookkeeper in QuickBooks updates Cellarhand too.
- MUST: All money paths stay Decimal(18,8), tenant-scoped, RLS-safe; `verify:ingest`, `verify:cost`,
  `verify:accounting*`, `verify:tenant-isolation`, `verify:naming`, `verify:ai-native`, `verify:invariants` green.
- SHOULD: A post-apply "Mark paid / mark outstanding" action so a winemaker can flip status later (the common
  real workflow: pay the card statement, then mark the invoice paid).
- SHOULD: A Paid/Outstanding badge on the recent-intakes list and the lot/material history.
- NICE: Batch-level payment-status default at upload that pre-fills each invoice on the review screen.
- NICE: An assistant write tool "mark invoice paid/outstanding" (requires a golden eval — D26/H8 gate).

## Scope Boundaries

**In scope:**
- Ingestion duplicate confirm gate (stage + apply).
- New aggregate one-bill-per-invoice A/P emit; multi-line Bill payload + poster support.
- `paymentStatus` on ingested invoices + A/P events; required selector; QBO BillPayment write path; inbound
  Balance read-back; reversal + dashboard hardening.

**Out of scope (and why):**
- Changing manual/non-ingest supply receipts to one-bill-per-invoice — they have no invoice grouping; per-lot
  stays correct there.
- QBO A/R "Invoice" objects (customer-facing) — not what a supplier invoice is.
- Full AP-aging analytics / partial-payment tracking beyond Paid vs Outstanding (a Bill's Balance is read but we
  model a binary status v1; partial payments read back as still-Outstanding). Noted as a follow-on.
- Multi-currency changes — the FX DECOUPLING (Plan 073) is preserved verbatim; the aggregate bill is one currency
  per invoice (already guaranteed upstream) with one ExchangeRate. **Do not undo the decoupling.**

## Research Summary

### Codebase Patterns

**Ingestion (Plan 072):**
- Upload launcher `IngestInvoiceLauncher` — `src/app/(app)/setup/expendables/ExpendablesClient.tsx:297-354`;
  `onFiles` uploads to `/api/ingest/documents`, calls `extractAndStageAction`, then `router.push` to the review
  screen. **The returned `warnings` are discarded at `:331-335`** — this is where the dup gate wires in.
- Blob upload + `fileSha256` computed at `src/app/api/ingest/documents/route.ts:52`.
- Stage core `createIngestedInvoiceCore` — `src/lib/ingest/ingest-invoice-core.ts:50-125`; existing soft-dup checks
  at `:62-72` push strings into `warnings[]` (returns `{ invoices, warnings }`).
- Apply core `applyIngestedInvoiceCore` — `:209-439`; already takes `opts { allowReconcileMismatch, allowPartialAp }`
  (mirror this for `allowDuplicate`). Per-line receive at `:386-406`.
- Review UI `IngestReviewClient.tsx` (`ReceiptPanel` ~178-376) + pure view-model `ingest-review-model.ts`
  (`canConfirmDoc:169-202` is the confirm gate — add "payment status required" here). Save path:
  `updateIngestedInvoiceAction` → `updateIngestedInvoiceCore` (`InvoicePatch` `:152-175`).
- Reverse core `reverseIngestedInvoiceCore` — `:520-588`; already blocks reversal when an A/P Bill is POSTED
  (`:536-543` "Reverse the bill in QuickBooks first").

**QBO A/P (Phase 15 + Plan 073):**
- Emit `emitApExportForReceipt` — `src/lib/accounting/ap-emit.ts:30-119`; creates immutable `ApExportEvent`
  (`postingKey = ap:<supplyLotId>`, single `amount`/`debitAccount`) + a PENDING `AccountingDelivery`
  (`objectType:"Bill"`) only when a CONNECTED QBO connection exists (`:109`).
- Called unconditionally inside `receiveSupplyCore` — `src/lib/cellar/materials.ts:563` (add an emit-suppress flag).
- Poster `runAccountingPostSweep` / `postBill` — `src/lib/accounting/post-sweep.ts:147-254`; query-before-post by
  `DocNumber`, WITHHELD backstops for FX/base-mismatch (preserve).
- Bill payload `buildBillPayload` — `src/lib/accounting/qbo/bill.ts:23-48`; **single-line today** (extend to N lines).
- Client `QboClient` / `QboAdapter` — `src/lib/accounting/qbo/client.ts`; has `postBill`, `findOrCreateVendor`,
  `findByDocNumber`, `getById`. **No `postBillPayment` and no `BillPayment` in the `objectType` union** — net-new.
- Reconcile `runAccountingReconcileSweep` — `src/lib/accounting/reconcile.ts`; reads posted objects back by id for
  DELETED_IN_GL. Its own comment (`:13`) says "AP Bill payment status is pulled in the U10 path" — that pull does
  not exist yet; this plan builds it here.
- `AccountingDelivery` is "exactly-one-of-three" (cost|ap|sales) with `@@unique([tenantId, apExportEventId])`
  (schema.prisma:3120-3147) — so a BillPayment is NOT a second delivery row; it folds into the Bill's event
  (store `paymentExternalId` on the event, post it as a follow-on step).

**Schema/tenancy:** column-add template `prisma/migrations/20260718120000_multi_currency_fx/migration.sql`
(RLS-neutral — the existing `tenant_isolation` policy covers new columns); full-table template
`...20260717120000_invoice_ingestion/migration.sql`. Existing dedup indexes already present:
`ingested_invoice (tenantId, vendorId, vendorInvoiceNumber)` and `(tenantId, fileSha256)` (schema.prisma:3193-3194).

### Prior Learnings

- `intake-ap-uom-gotchas` — **`createStockMaterialCore` emits NO A/P**; only `receiveSupplyCore` does. The apply
  core already creates new materials at zero stock then `receiveSupplyCore`s the real lot — keep that shape.
- `intake-ap-uom-gotchas` — QBO **rejects duplicate `DocNumber`** (err 6140); you cannot put a shared invoice #
  on N per-lot bills. One-bill-per-invoice fixes this natively: one `DocNumber` per invoice.
- `plan073-multi-currency-fx-ingestion` — **DECOUPLING is a P0 invariant** (lot=base; ApExportEvent=foreign+rate;
  QBO derives home GL = amount × ExchangeRate). Never post a base amount with a CurrencyRef. Base currency must
  equal QBO home (`currency-guard.ts`); unsupported currencies fail loud.
- `server-action-actionerror-redacted-in-prod` — **return `{ok:false,error}` from server actions, never throw**
  (thrown `ActionError` is redacted in prod). Applies to the new payment + duplicate actions.
- `prismabase-rls-zero-rows-gotcha` — cross-tenant reads/backfills use `runAsSystem`; the reconcile sweep already
  wraps per-tenant work in `runAsTenant`.
- `tsc-working-tree-drift-vs-ci` — commit the whole tree before pushing (local tsc reads the working tree).

### External Research (QuickBooks Online v3 API — A/P model)

- A supplier invoice = **Bill** entity (already used). A Bill posted with no payment shows a full **`Balance`** and
  appears in A/P aging as owed — so **Outstanding needs no extra API call**, just the posted Bill.
- Marking a Bill paid is done by creating a separate **`BillPayment`** entity that references the Bill via
  `Line[].LinkedTxn[{ TxnId, TxnType: "Bill" }]`, with a `PayType` of `"Check"` (→ `CheckPayment.BankAccountRef`)
  or `"CreditCard"` (→ `CreditCardPayment.CCAccountRef`). Posting a BillPayment zeroes the Bill's `Balance`.
- A Bill's `Balance` is readable via the same query interface already used (`SELECT Balance FROM Bill WHERE Id=...`)
  — the seam for two-way read-back in reconcile.
- BillPayment supports `DocNumber` and QBO `requestid` idempotency — reuse `docNumberFor("pay:<invoiceId>")` +
  query-before-post, matching the existing Bill idempotency discipline.

## Key Decisions

| Decision | Choice | Alternatives Considered | Rationale |
|----------|--------|------------------------|-----------|
| QBO object for a supplier invoice | **Bill** (A/P) | QBO "Invoice" (A/R) | A supplier invoice is money *we owe* → Bill. "Invoice" in QBO is customer-facing A/R. UI copy says "bill". |
| QBO granularity | **One Bill per invoice** (multi-line, grouped by GL account) | Keep per-lot bills | User decision. Matches "see the invoice in QBO"; one payable; one balance → trivial payment status. |
| How the aggregate emits | New `emitApExportForInvoice` at apply time; **suppress** per-lot emit for ingest receipts | Post-hoc merge of per-lot bills | Clean single source; avoids QBO dup-DocNumber; per-lot path stays intact for manual receipts. |
| Multi-line storage on the event | **`billLinesJson` column on `ApExportEvent`** (RLS-neutral column add) | New `ApExportEventLine` RLS child table | The event is an outbox projection, not queried per-line by the app; JSON is far less work. Child table is the heavier "in-style" alternative — flag if audit needs per-line rows. |
| **Payment sync model (answers your Q2)** | **ERP-standard BillPayment**: Outstanding = posted Bill (shows owed); Paid = a QBO **BillPayment** from a chosen **pay-from account** (bank or credit-card liability), + **inbound Balance read-back** for two-way truth | (a) status-only flag with no GL effect; (b) inbound-only | A bare "paid" flag desyncs the GL (the Bill still shows a balance; the cash/card movement is unrecorded). The standard is to record the payment against the account that paid it — bank for a check, the **credit-card liability account** for a company card (this correctly moves the debt from the vendor to the card). That makes QBO's A/P aging *true*: owed bills are owed, paid bills are zeroed against the right account. Read-back keeps it honest if the bookkeeper pays in QBO. |
| Where "Paid/Outstanding" is selected | **Per-invoice on the review screen, required before confirm** (+ a later "mark paid" action) | A single toggle at upload | A batch can hold several invoices (some paid, some not); status is per-invoice. Upload-time is only a NICE pre-fill. "Required before confirm" honours "have to select it". |
| Pay-from account choice | A small configured set in Settings (default bank + a credit-card account), selected at mark-paid time; sensible default | Free-text | QBO needs a real account ref; a mapped short list keeps it easy and correct. |
| Duplicate gate mechanism | Extend existing soft detection → structured result; block at apply behind `allowDuplicate` (mirror `allowReconcileMismatch`) | Hard-block at stage | Non-destructive; the human decides; consistent with the existing apply-opt pattern. |

## Implementation Units

### Unit 1: Structured duplicate detection + apply-time guard (primitive)

**Goal:** Turn the dropped soft-warning into a structured, reusable duplicate signal and add a hard gate at apply.
**Files:** `src/lib/ingest/ingest-invoice-core.ts`, `src/lib/ingest/actions.ts`
**Approach:** In `createIngestedInvoiceCore`, alongside `warnings`, return a structured `duplicates` array per staged
invoice (`{ ingestedInvoiceId, kind: "vendor-invoice" | "file-hash", matchedInvoiceId, label }`). In
`applyIngestedInvoiceCore`, before writing, re-check for an **applied/pending** invoice with the same
`(vendorNameRaw, vendorInvoiceNumber)` or `fileSha256` (excluding self); if found and `opts.allowDuplicate !== true`,
return `{ ok:false, code:"DUPLICATE", error, duplicateOf }` (do not throw). Thread `allowDuplicate` through
`applyIngestedInvoiceAction`. Follow the existing `allowReconcileMismatch`/`allowPartialAp` opt shape.
**Tests:** stage two identical files → `duplicates` populated; apply the second without `allowDuplicate` → `DUPLICATE`;
apply with `allowDuplicate:true` → succeeds; different vendor/invoice# → no duplicate.
**Depends on:** none
**Patterns to follow:** `ingest-invoice-core.ts:62-72` (detection), `:52-58` apply-opts, return-not-throw learning.
**Verification:** extend `scripts/verify-ingest.ts` with a duplicate-apply case; `npm run verify:ingest` green.

### Unit 2: Duplicate confirm UI ("do you want to continue?")

**Goal:** Show the user the duplicate warning and make them choose.
**Files:** `src/app/(app)/setup/expendables/ExpendablesClient.tsx`, `src/app/(app)/setup/expendables/ingest/IngestReviewClient.tsx`, `src/app/(app)/setup/expendables/ingest/ingest-review-model.ts`
**Approach:** In `IngestInvoiceLauncher.onFiles`, capture the (currently discarded) result; if any `duplicates`
present, render a modal — "This is detected as a duplicate invoice, do you want to continue?" with **Continue** /
**Discard** — before `router.push`. On the review screen, show a per-invoice duplicate banner (distinct from the LLM
extraction warnings already rendered) and require an explicit acknowledgement checkbox that sets `allowDuplicate`
on the apply call. Discard routes through the existing discard path.
**Tests:** view-model unit: `canConfirmDoc` blocks an un-acknowledged duplicate; component behaviour is manual/
browser-QA (repo has no jsdom/RTL — test pure logic only, per prior learning).
**Depends on:** Unit 1
**Patterns to follow:** existing per-doc warning render in `IngestReviewClient` (~240-247); modal styling per DESIGN.md.
**Verification:** browser-QA on Demo Winery — upload the same invoice twice, see the gate; new `ingest-review-model` tests.

### Unit 3: Schema — aggregate A/P event support + emit-suppress hook

**Goal:** Let one `ApExportEvent` represent a whole invoice, and let `receiveSupplyCore` skip its per-lot emit.
**Files:** `prisma/schema.prisma`, `prisma/migrations/<ts>_ap_aggregate_invoice/migration.sql`, `src/lib/cellar/materials.ts` (input type)
**Approach:** Add to `ApExportEvent` (RLS-neutral column adds): `ingestedInvoiceId String?` (composite-tenant FK →
`ingested_invoice` in raw SQL, K11) and `billLinesJson Json?` (array of `{ debitAccount, amount, description }` in
document currency). Add a per-invoice postingKey convention `apinv:<ingestedInvoiceId>`; keep the existing
`ap:<supplyLotId>` for legacy/manual. Add `skipApEmit?: boolean` to `ReceiveSupplyInput`; when true, `receiveSupplyCore`
does not call `emitApExportForReceipt` (`materials.ts:563`).
**Tests:** migration applies; `receiveSupplyCore(..., { skipApEmit:true })` creates the lot but **no** ApExportEvent.
**Depends on:** none
**Patterns to follow:** column-add migration template `20260718120000_multi_currency_fx`; composite-FK raw SQL from
`20260717120000_invoice_ingestion`; `@@index([tenantId, ingestedInvoiceId])`.
**Verification:** `npm run db:migrate` (owner URL) + `npm run verify:migration`; `verify:tenant-isolation` green.

### Unit 4: Aggregate emit path — one A/P event per invoice

**Goal:** Emit exactly one A/P event (+ one PENDING Bill delivery) per applied invoice.
**Files:** `src/lib/accounting/ap-emit.ts` (new `emitApExportForInvoice`), `src/lib/ingest/ingest-invoice-core.ts`
**Approach:** New `emitApExportForInvoice(ingestedInvoiceId, opts, tx)` that, inside the apply tx and after all
lines' lots exist, aggregates each posted line into bill lines **grouped by debit (inventory/GL) account** (sum
amounts in the document currency), computes the total, resolves vendor once (`findOrCreateVendorCore`), and creates
one `ApExportEvent` (`postingKey = apinv:<invoiceId>`, `amount = total`, `billLinesJson = [...]`,
`currency`/`exchangeRate` from the invoice's FX — DECOUPLED, foreign amounts) + one PENDING Bill delivery (only if
QBO connected). In `applyIngestedInvoiceCore`, pass `skipApEmit:true` to every `receiveSupplyCore` call, then call
`emitApExportForInvoice` once. Withhold cleanly (emit nothing) when cost unknown / accounts unset / no vendor,
exactly like the per-lot path.
**Tests:** apply a 3-line invoice (2 lines same account, 1 different) → exactly ONE ApExportEvent with 2 bill lines,
amount = sum; a foreign invoice → foreign amounts + exchangeRate set, base inventory unchanged (COST-4 holds); no
per-lot `ap:<lotId>` events created.
**Depends on:** Unit 3
**Patterns to follow:** `ap-emit.ts:30-119` (postable gate, FX decoupling, connection check, delivery upsert).
**Verification:** `npm run verify:ingest` + `npm run verify:cost` green (COST-4 reconciliation intact).

### Unit 5: Multi-line Bill payload + poster

**Goal:** Post the aggregate event as one multi-line QBO Bill.
**Files:** `src/lib/accounting/qbo/bill.ts`, `src/lib/accounting/post-sweep.ts`
**Approach:** Extend `buildBillPayload` to accept `lines: { account, amount, description }[]` and emit one QBO
`Line[]` entry per account (fall back to the current single-line shape when `billLinesJson` is null, for legacy
events). In `postBill`, read `billLinesJson` from the event; build the multi-line payload; `DocNumber =
docNumberFor(postingKey)` (now per-invoice → unique, no 6140). Preserve the FX/base-mismatch/multicurrency WITHHELD
backstops and query-before-post verbatim. Memo/PrivateNote: "Cellarhand · Supply bill · <vendor> · Invoice <#>".
**Tests:** payload builder unit — N lines in, N QBO lines out, amounts rounded, single-line legacy path unchanged;
poster idempotency — re-run adopts the existing Bill by DocNumber.
**Depends on:** Unit 4
**Patterns to follow:** `bill.ts:23-48`, `post-sweep.ts:147-254`.
**Verification:** `npm run verify:accounting` + `npm run verify:accounting-idempotency` green.

### Unit 6: Schema — payment status (invoice + event) + pay-from accounts

**Goal:** Store Paid/Outstanding and the pay-from account.
**Files:** `prisma/schema.prisma`, `prisma/migrations/<ts>_ap_payment_status/migration.sql`
**Approach:** New enum `ApPaymentStatus { OUTSTANDING PAID }`. Add to `IngestedInvoice`: `paymentStatus
ApPaymentStatus?` (null until the user picks — required before confirm), `paidFromAccount String?`, `paidAt
DateTime?`. Carry onto `ApExportEvent`: `paymentStatus ApPaymentStatus?`, `paidFromAccount String?`, `paidAt
DateTime?`, `paymentExternalId String?` (the QBO BillPayment Id once posted). Add to `AppSettings`:
`apPaymentBankAccount String?` and `apPaymentCardAccount String?` (default pay-from accounts, mapped from the QBO
COA like the existing `apInventoryAccount`/`apPayableAccount`). Enum added in an isolated `ALTER TYPE`-free create
(new enum) migration before any column defaults to it (Windows enum rule).
**Tests:** migration applies; enum + columns present; `verify:tenant-isolation` unaffected (column adds).
**Depends on:** none
**Patterns to follow:** enum + column-add discipline in AGENTS.md ("the Windows enum rule"); COA account settings.
**Verification:** `npm run db:migrate` + `npm run verify:migration`.

### Unit 7: Required Paid/Outstanding selector + status actions

**Goal:** Make the user choose Paid/Outstanding (with pay-from when Paid) before confirm, and allow flipping later.
**Files:** `src/app/(app)/setup/expendables/ingest/IngestReviewClient.tsx`, `ingest-review-model.ts`, `src/lib/ingest/ingest-invoice-core.ts` (`InvoicePatch`, `updateIngestedInvoiceCore`), `src/lib/ingest/actions.ts`, `src/lib/accounting/coa.ts` (pay-from account options for Settings), settings UI (`src/app/(app)/settings/SettingsClient.tsx`)
**Approach:** Add a Paid/Outstanding control to `ReceiptPanel` (native `<select>`); when **Paid**, reveal a
pay-from account picker (defaulting to `apPaymentBankAccount`/`apPaymentCardAccount` from Settings). Persist via the
existing `InvoicePatch` → `updateIngestedInvoiceCore`. Extend `canConfirmDoc` (ingest-review-model) to block confirm
until `paymentStatus` is set, and require `paidFromAccount` when Paid. Add a post-apply
`setInvoicePaymentStatusAction(ingestedInvoiceId, status, paidFromAccount?)` that updates both `IngestedInvoice` and
its aggregate `ApExportEvent` (returns `{ok,error}`; never throws). Add the two pay-from account settings to the
Settings screen next to the existing A/P account mappings.
**Tests:** `canConfirmDoc` blocks when status unset; blocks Paid-without-account; view-model tests for the gate; the
status action updates both rows (script-level).
**Depends on:** Unit 6 (and Unit 4 for the aggregate event to stamp)
**Patterns to follow:** `updateIngestedInvoiceAction` save path; `canConfirmDoc:169-202`; DESIGN.md tokens.
**Verification:** browser-QA on Demo; `npm run verify:ingest` extended for the required-status gate.

### Unit 8: QBO BillPayment write path (Paid → recorded in QBO)

**Goal:** When an invoice is Paid, record a BillPayment against its Bill from the chosen account.
**Files:** `src/lib/accounting/qbo/bill-payment.ts` (new), `src/lib/accounting/qbo/client.ts`, `src/lib/accounting/adapter.ts`, `src/lib/accounting/post-sweep.ts`
**Approach:** New pure `buildBillPaymentPayload({ billExternalId, vendorExternalId, totalAmount, payType, payFromAccount, txnDate, currency, exchangeRate })` producing a QBO `BillPayment` with
`Line:[{ Amount, LinkedTxn:[{ TxnId: billExternalId, TxnType:"Bill" }] }]` and the `CheckPayment.BankAccountRef` /
`CreditCardPayment.CCAccountRef` per `payType`. Add `postBillPayment(ctx, payload, requestId)` to `QboClient` +
`QboAdapter`. In the post-sweep, add a step: for **POSTED Bill** deliveries whose event has `paymentStatus=PAID` and
`paymentExternalId=null`, resolve the Bill's externalId (the delivery's `externalId`), post the BillPayment
(`DocNumber = docNumberFor("pay:<invoiceId>")`, query-before-post, `requestid`), then store `paymentExternalId` on
the event. Idempotent + WITHHELD on FX/config faults like the Bill path. Derive `payType` from whether
`paidFromAccount` is the bank vs card mapping.
**Tests:** payload builder unit (check vs credit-card shapes; LinkedTxn present); poster idempotency — re-run does
not double-pay (paymentExternalId set / DocNumber adopt).
**Depends on:** Unit 5 (Bill must post first), Unit 6/7 (status + accounts)
**Patterns to follow:** `client.ts` postBill/findByDocNumber; `post-sweep.ts` claim/finalize + WITHHELD.
**Verification:** `npm run verify:accounting` + `verify:accounting-idempotency` extended with a paid-invoice case.

### Unit 9: Inbound read-back — QBO Balance → app status (two-way)

**Goal:** Keep Paid/Outstanding true if payment happens in QuickBooks.
**Files:** `src/lib/accounting/reconcile.ts`, `src/lib/accounting/qbo/client.ts` (read Balance)
**Approach:** Extend the reconcile sweep: for POSTED Bill deliveries, read the Bill's `Balance` (via a small
`getBillBalance`/extended `getById`). If `Balance == 0` → set the event + `IngestedInvoice` to PAID (stamp `paidAt`
if unset); if `Balance > 0` and the app thinks PAID (and we have no `paymentExternalId` we posted) → surface a
discrepancy (don't silently flip). Bounded, off the write path, per-tenant `runAsTenant`, least-privilege — matches
the existing sweep shape. Update `reconcile.ts:13`'s comment to reflect the now-real pull.
**Tests:** script-level — a Bill read back with Balance 0 flips status to PAID; Balance>0 keeps OUTSTANDING;
discrepancy path surfaces without flipping.
**Depends on:** Unit 6, Unit 8
**Patterns to follow:** `reconcile.ts:34-71` (batch, getById, verifiedAt update).
**Verification:** `npm run verify:accounting` (add a reconcile-Balance case) green.

### Unit 10: Reversal + dashboard/badge hardening

**Goal:** Don't let a paid invoice reverse cleanly, and make status visible.
**Files:** `src/lib/ingest/ingest-invoice-core.ts` (reverse), `src/lib/accounting/dashboard.ts`, `IngestReviewClient.tsx` / recent-intakes list, lot/material history views
**Approach:** In `reverseIngestedInvoiceCore`, extend the existing POSTED-bill guard (`:536-543`): if the event has a
`paymentExternalId` (a BillPayment exists in QBO), refuse with "This invoice is marked paid in QuickBooks — void the
Bill Payment there first, then discard the intake." Surface Paid/Outstanding in the accounting dashboard's A/P view
and as a badge on the recent-intakes list + lot/material history (uses the aggregate event's status, so no per-lot
fan-out).
**Tests:** reverse a paid invoice → blocked with the guidance; dashboard/list render status (view-model/pure where
possible).
**Depends on:** Unit 8
**Patterns to follow:** `reverseIngestedInvoiceCore:536-543`; dashboard rollups.
**Verification:** `npm run verify:accounting-reversal` green; browser-QA badge on Demo.

### Unit 11: Verify scripts, invariants, and e2e proof

**Goal:** Lock the three features behind green gates.
**Files:** `scripts/verify-ingest.ts`, `scripts/verify-accounting*.ts`, `docs/architecture/invariants/*`, `INVARIANTS.md`, `package.json` (if a new verify target is warranted)
**Approach:** Extend `verify:ingest` for the duplicate-apply gate and the required payment-status gate; extend
`verify:accounting`/`-idempotency`/`-reversal` for one-bill-per-invoice, BillPayment exactly-once, and reconcile
Balance read-back. Add an invariant note: **"an ingestion-sourced receipt emits its A/P exactly once, as a single
aggregate invoice-level event — never a per-lot event"** (with a `verify:` guard), mirrored into
`docs/architecture/invariants/`. Keep `verify:ai-native` green (new `*-core`/emit fns wired to a tool or exempted),
`verify:naming`, `verify:invariants`, `verify:tenant-isolation`.
**Tests:** the verify scripts themselves are the tests (governed-money e2e on Demo Winery / `QA-Ingest*` fixtures).
**Depends on:** Units 1–10
**Verification:** full green: `verify:ingest`, `verify:cost`, `verify:accounting`, `verify:accounting-idempotency`,
`verify:accounting-reversal`, `verify:tenant-isolation`, `verify:naming`, `verify:ai-native`, `verify:invariants`.

## Test Strategy

**Unit tests (vitest):** pure logic only where the repo supports it — `buildBillPayload` (multi-line),
`buildBillPaymentPayload` (check vs card), `canConfirmDoc` (status + duplicate gates), duplicate detection shape,
aggregate grouping-by-account. No jsdom/RTL in this repo → component behaviour is browser-QA, not unit.

**Integration / governed-money e2e:** the `verify:*` scripts run against Demo Winery with `QA-Ingest*` fixtures and
prove the DB state (the browser proves the UI; a `runAsTenant("org_demo_winery", …)` read-back proves persistence).
Extend `verify:ingest` (dup gate, required status), `verify:accounting*` (one bill/invoice, BillPayment once,
reconcile Balance). QBO calls are stubbed via the existing adapter-injection seam (as `verify-ingest.ts` already
stubs FX) — no live QBO in CI.

**Manual verification (browser-QA on Demo Winery, never Bhutan):**
1. Upload an invoice, apply it → one multi-line Bill appears in the QBO sandbox; invoice # on it.
2. Re-upload the same file → "This is detected as a duplicate invoice, do you want to continue?" gate.
3. Mark it Paid from the card account → a BillPayment appears in QBO; the Bill's Balance goes to 0; the app badge
   shows Paid. Mark another Outstanding → shows owed in QBO A/P aging.
4. In the QBO sandbox, pay an Outstanding bill → next reconcile flips the app to Paid.
5. Try to reverse a paid invoice → blocked with the "void the Bill Payment in QuickBooks first" guidance.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Double A/P: both per-lot and aggregate events emit for the same goods | MED | HIGH | `skipApEmit` on every ingest `receiveSupplyCore` call; Unit-11 invariant + `verify:` guard asserts exactly-one aggregate event, zero per-lot, for ingest receipts. |
| Undoing FX DECOUPLING while aggregating (double-conversion P0) | MED | HIGH | Aggregate amounts stay in **document currency** with one `exchangeRate`; base inventory untouched; COST-4 asserted in `verify:cost`. Reuse `ap-emit` FX handling verbatim. |
| BillPayment posted twice (double-pay in QBO) | LOW | HIGH | `paymentExternalId` claim-first + `DocNumber pay:<invoiceId>` query-before-post + `requestid`; idempotency verify case. |
| Wrong pay-from account (e.g. bank when it was the company card) | MED | MED | Explicit pay-from picker at mark-paid (defaulted, not silent); credit-card payments map to the CC liability account (correct GL), documented in Settings help copy. Confirm with an accountant before go-live (see below). |
| Reconcile read-back flips status incorrectly on partial payments | LOW | MED | v1 models binary status: Balance>0 stays Outstanding; only Balance==0 → Paid; discrepancies surfaced, never silently flipped. Partial-payment modelling is an explicit follow-on. |
| QBO closed-period / multicurrency faults on Bill or payment | MED | MED | Preserve the existing WITHHELD backstops (not FAILED); the review screen already warns on FX up front. |
| Migration/enum ordering on Windows | LOW | MED | New enum created in its own migration before any column references it (the AGENTS.md Windows enum rule). |

## Open Questions / Sign-offs

- **Accountant sign-off (go-live gate):** the BillPayment GL direction and the credit-card-liability pay-from
  modelling should be confirmed with the winery's accountant before relying on it (same posture as the Phase-16
  DTC cash tie-out). The code is correct-by-design but A/P treatment is client-specific.
- **Pay-from defaults:** confirm the winery's QBO account names for the default bank + credit-card accounts to seed
  `apPaymentBankAccount` / `apPaymentCardAccount`.

## Confidence Check

| Section | Confidence | Notes |
|---------|-----------|-------|
| Problem Frame | HIGH | Direct-read + two research agents agree; features 1 & 2 have existing foundations. |
| Scope Boundaries | HIGH | Clear seams; per-lot vs aggregate isolation is well-defined. |
| Implementation Units | HIGH | Every unit anchored to real file:line insertion points and existing patterns. |
| Test Strategy | MEDIUM | Governed by existing `verify:*` seams; live-QBO stays sandbox/manual (no live QBO in CI) — inherent to this integration. |
| Risk Assessment | MEDIUM | Money + external-system two-way sync; the double-emit and double-pay risks are the ones to watch, both mitigated by claim-first idempotency + an invariant guard. |

## Success Criteria

- [x] Re-uploading a known invoice triggers "This is detected as a duplicate invoice, do you want to continue?"; it
      cannot be applied without an explicit acknowledgement. (Units 1-2; verify:ingest scenario 11)
- [x] Applying an invoice with QBO connected creates exactly **one** multi-line Bill (invoice # on it), and **zero**
      per-lot bills for that invoice. (Units 3-5; verify:ingest scenario 1 + AP-1 invariant)
- [x] The uploader requires Paid or Outstanding (and a pay-from account when Paid) before confirm. (Unit 7;
      review-model payment gate tests)
- [x] Marking Paid records a BillPayment in QBO that zeroes the Bill's balance; Outstanding shows as owed in A/P.
      (Unit 8; verify:accounting-idempotency scenario 8)
- [x] Paying an Outstanding bill in QuickBooks flips the app to Paid on the next reconcile. (Unit 9;
      verify:accounting-idempotency scenario 9)
- [x] Reversing a paid invoice is blocked with clear guidance. (Unit 10; verify:ingest scenario 12)
- [x] All listed `verify:*` gates pass; no regressions. (tsc, eslint, vitest 2276, next build, verify:ingest 81,
      verify:cost 55, verify:accounting 8, verify:accounting-idempotency 33, verify:invariants 35/35, naming,
      raw-sql, ai-native, tenant-isolation)

## Build outcome (2026-07-18)

> Renumbered from **076 → 078** at ship time (076 collided with a concurrent branch; 077 = the Google-signin
> plan). Commit messages and code comments still say "Plan 076" — same work, just a unique plan-file number.

All 11 units BUILT on branch `claude/invoice-ingestion-features-95d4df` (commits d79f6f4 → 75a13d7). Two
RLS-neutral migrations applied to Neon: `20260718130000_ap_aggregate_invoice`, `20260718140000_ap_payment_status`.
Remaining before relying on the DTC-style cash tie-out: **accountant sign-off** on the BillPayment GL direction +
credit-card-liability pay-from modelling, and a **live QBO sandbox** pass of the multi-line Bill + BillPayment
(the poster/reconcile were proven offline via the injected mock adapter; verify:accounting's live e2e still
covers the single-line Bill path). Browser-QA the review-screen payment selector + duplicate modal on Demo.
