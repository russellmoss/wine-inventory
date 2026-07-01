---
title: TTB F 5000.24 Wine Excise Tax Return + CBMA Credits (Phase 14 follow-on)
type: feat
status: draft
date: 2026-07-01
branch: main
depth: deep
units: 11
---

## Overview

Add the federal **wine excise TAX return** (TTB F 5000.24sm) as a SECOND, independently-selectable
compliance form on the existing `/compliance` screen, alongside the shipped 5120.17 operations report
(plan 025). The 5120.17 reports *operations in gallons*; the 5000.24 computes and pays the *federal
excise tax* on the taxpaid removals — from the SAME `REMOVE_TAXPAID` ledger ops + bottled taxpaid
StockMovements we already record. A winery can generate the 5120.17, the 5000.24, or both for a
period. Our edge: the tax + the CBMA small-producer credit fall out of the auditable removal log
automatically, with a calendar-year credit tracker the paper form doesn't enforce.

## Problem Frame

A US bonded winery that removes wine taxpaid owes federal excise tax and must file TTB F 5000.24 with
payment (semimonthly by default, 14 days after each period). Today we record the taxable event
(`REMOVE_TAXPAID`) and report it on the 5120.17, but we compute **no tax** and track **no CBMA
credit**. Job-to-be-done: "tell me what I owe this period, apply my small-producer credit correctly,
and hand me a filled return." Doing nothing leaves the winery to hand-compute gallons × rate − credit
in a spreadsheet every semimonth and manually track the 750k-gallon annual credit ladder — the exact
error-prone reconciliation we already eliminated for operations.

**Product pressure test:** The 5120.17 was table stakes to *sell*; the 5000.24 is table stakes to
*operate* (you can't skip paying tax). But scope discipline matters: the form is a combined
(spirits/wine/beer/tobacco) return where **wine is one dollar line**. We are NOT building a
multi-commodity tax engine — we compute the wine line + the CBMA credit + the supporting worksheet,
and fill the wine + header + payment fields. The genuinely hard, high-value part is the **CBMA
calendar-year credit ladder**, not the form-filling.

## Requirements

- **MUST** compute wine excise tax for a return period: gallons taxpaid-removed by tax class ×
  the per-class rate (27 CFR 24.270), summed, minus the CBMA credit → the net dollar figure for
  **line 10 (`Tax.10`)** of the 5000.24. Rates: ≤16% **$1.07** · >16–21% **$1.57** · >21–24%
  **$3.15** · artificially carbonated **$3.30** · sparkling **$3.40** · hard cider **$0.226**/wine gal.
- **MUST** apply the **CBMA small-producer credit** (26 USC 5041(c)) across the first 750,000 wine
  gallons **removed per calendar year** in stepped tiers: **$1.00** (first 30k) · **$0.90** (next 100k,
  30k–130k) · **$0.535** (next 620k, 130k–750k); hard cider **6.2¢ / 5.6¢ / 3.3¢**. The credit binds
  to a **running year-to-date removed-gallons** tally, so each return must know how many gallons were
  already credited earlier in the calendar year (the tier each new gallon falls in).
- **MUST** source the taxpaid removals from the SAME data the 5120.17 uses (`REMOVE_TAXPAID` bulk ops
  by `disposition=TAXPAID`, + bottled `StockMovement` with `reason=TAXPAID`) — one source of truth,
  no re-entry.
- **MUST** model the **return cadence** separately from the operations-report cadence (27 CFR 24.271):
  **annual** if liability ≤ $1,000/yr, **quarterly** if ≤ $50,000/yr, else **semimonthly** (1st–15th,
  16th–EOM). Settable per-tenant; default the generate screen to it.
- **MUST** produce a human **review-before-file screen** (the computation worksheet: gallons × rate −
  CBMA per class → net tax; the CBMA ladder position; a payment/period panel) and a downloadable
  **filled 5000.24 PDF** (line 10 net wine tax + header + `Return_Covers`/period + Schedule B credit).
  Never auto-submit.
- **MUST** be tenant-scoped + RLS-isolated, reversible/amendable via the plan-025 machinery (FILED
  immutable; a correction to a removal → regenerate → AMENDED return with adjusted tax + Schedule A/B).
- **MUST** run an **anomaly/readiness check** (CBMA over-claim risk, a removed gallon in a class with
  no rate, net tax ≤ 0, YTD ladder inconsistency, unfiled prior period in the same year).
- **SHOULD** keep the wine-only scope explicit: the other commodity lines (spirits/beer/tobacco) on
  the combined form render zero/blank; we never imply we compute them.
- **DEFERRED (not this plan):** Pay.gov e-file/auto-submit; the TTB **Pilot Combined Return** (merges
  5000.24 + 5120.17 with on-form CBMA lines — see Fork 3); state/DTC excise (ShipCompliant/Avalara);
  spirits/beer/tobacco computation; controlled-group credit apportionment across multiple entities.

## Scope Boundaries

**In scope:** the WINE portion of TTB F 5000.24sm (line 10 + Schedule B credit + header + period/
payment fields); the 6-class rate table; the CBMA calendar-year credit ladder with YTD tracking; the
return-cadence model incl. semimonthly; the compute + persist service; the review worksheet UI as a
second form on `/compliance`; the filled PDF; anomaly/readiness; per-tenant return-cadence setting.

**Out of scope (documented, not built):** Pay.gov e-file; the Pilot Combined Return; state/DTC;
spirits/beer/tobacco lines; multi-entity controlled-group credit split; automatic cadence
re-election when the $50k threshold is crossed mid-year (we flag it, the user re-elects).

## Research Summary

### External (TTB, verified 2026-07-01 — full findings folded)
- **Form:** TTB F 5000.24sm "Excise Tax Return" (OMB 1513-0083), a **combined** return; **wine is a
  single lump-sum dollar line 10 (`Tax.10`)** — there is **no gallons×rate schedule on the form**.
  Credits/prepayments flow through **Schedule B** (lines 30–34); adjustments increasing (incl. CBMA
  over-claim repayment) through **Schedule A** (25–29). PDF:
  `https://www.ttb.gov/system/files/images/pdfs/forms/f500024sm.pdf`.
- **Fillable AcroForm: yes, 102 fields** (`Tax.10`, `Serial_Number`, `Payment_Amount`, `Employer_ID`,
  `Plant_No`, `Taxpayer_Address`, `Date_On_Form`, `Return_Covers` radio [PREPAYMENT/PERIOD],
  `Beginning`/`Ending`, `Form_of_Payment`, Schedule A `Item25`–`Item29`, Schedule B `Item30`–`Item34`
  with `.a/.b/.c`). **pdf-lib fails to load the raw TTB PDF** (object-stream/xref quirk + JS) — same as
  the 5120.17; normalize once via pypdf → commit the fillable asset → pdf-lib fills it (proven pattern).
- **Rates:** all six verified current (no sunset through 2025/2026), CBMA-permanent.
- **CBMA:** first 750k wine gal removed/calendar-year, tiers $1.00/$0.90/$0.535 (cider 6.2¢/5.6¢/3.3¢),
  applied to the FIRST gallons removed in the year, controlled-group limit; on the standard form it's
  **net into line 10** (not a separate line) with approved credits via Schedule B; over-claim repaid
  via Schedule A. Tracked per calendar year — the form does NOT enforce it (our value-add).
- **Return cadence (§24.271):** annual ≤$1,000, quarterly ≤$50,000, else semimonthly (1st–15th /
  16th–EOM); due 14th day after the period. Distinct from the 5120.17 operations cadence.
- **Pilot Combined Return** exists (merges 5000.24 + 5120.17, on-form CBMA lines 12–14) — a different,
  opt-in pilot form. See Fork 3.
- **Pay.gov** is the e-file channel (deferred).

### Codebase reuse (plan 025 — mapped, file:line)
- **Removal gathering is 100% reusable:** `generate.ts` gathers bulk `tax_removal` legs (`:349`) +
  `bottledGoodsRemovals()` (§B taxpaid StockMovements). The excise return taxes the exact same events;
  we sum removed gallons by class instead of mapping to §A/§B lines.
- **Reuse verbatim:** `gallons.ts` (L→gal + round), `tax-class.ts deriveTaxClass` (the 6-class bin),
  `abv.ts resolveTaxAbvForLots`, `foldPeriod`/`resolveClassesForLots` (extract removals + class),
  `fermentToWineEvents` (annual production for the CBMA production cap).
- **Storage:** `ComplianceReport` + `ComplianceProfile` + enums `ComplianceReportStatus/Version`,
  `ReportCadence` (`schema.prisma:1669–1714`). Period/status/version/amend/carry-forward machinery is
  identical → generalize with a `formType` discriminator (Fork 1).
- **PDF:** `fill-pdf.ts` (loads normalized asset via `process.cwd()`, sets fields from a committed
  fieldmap, `info.*` mirror fields), `scripts/calibrate-ttb-fields.ts`, `ttb-5120-17-fieldmap.json` —
  replicate for the 5000.24 asset.
- **UI/actions:** `page.tsx` (report list + selected view), `ComplianceClient.tsx` (banner/anomaly/
  file/download shell + generate form), `actions.ts` (`generateComplianceReport`/`fileComplianceReport`/
  `saveComplianceProfile` — add `formType` routing), `api/compliance/[id]/pdf/route.ts` (dispatch by
  formType).

## Key Decisions

| Decision | Choice | Alternatives | Rationale |
|----------|--------|--------------|-----------|
| Storage | Generalize `ComplianceReport` with a `formType` enum (TTB_5120_17 / TTB_5000_24); excise worksheet + net tax + CBMA detail live in `computed` Json; add nullable `taxDollars` for display/query | Dedicated `ComplianceExciseReturn` table | Period/status/version/amend/carry-forward are identical; one table = one filing chain, one review shell (Fork 1) |
| Tax math | Internal worksheet: Σ(gallons removed by class × rate) − CBMA credit = net line-10 $; rates in a date-stamped `excise-rates.ts` | On-form schedule | The form has no rate schedule — we compute the single dollar figure + keep the worksheet as backing |
| CBMA basis | Credit ladder driven by **YTD gallons REMOVED** this calendar year (how it's claimed), capped by YTD **production** (5041(c) production limit) and 750k | Production-only basis | Matches the statute's "first gallons removed" mechanic; production is the cap, not the driver (Fork 4) |
| CBMA YTD source | **Carry-forward** the running removed-gallons ladder position from the prior FILED excise return in the same calendar year; first return of the year / recompute re-folds `REMOVE_TAXPAID` from Jan 1 | Always full re-fold | Mirrors the 025 on-hand carry-forward; cheap + consistent; full re-fold is the fallback (Fork 2) |
| Return cadence | Add `SEMIMONTHLY` to `ReportCadence`; per-tenant `defaultReturnCadence` on `ComplianceProfile` (separate from ops `defaultCadence`); pure period-bounds helper (1st–15th / 16th–EOM / quarter / year) | Reuse ops cadence | The return cadence is a different regulatory test ($ liability), not the ops test (gallons) |
| PDF | Procure `f500024sm.pdf` → pypdf-normalize → commit `docs/ttb-5000-24/TTB-5000.24-fillable.pdf` → calibrate `ttb-5000-24-fieldmap.json` → `fill-5000-24-pdf.ts` fills line 10 + header + Return_Covers/period + Schedule B | Draw overlay | Real fillable form, deterministic, offline; proven 025 pattern (pdf-lib needs the normalized copy) |
| Form target | Standard 5000.24sm (every winery can file) | Pilot Combined Return | Universal now; the pilot is a compelling future once a design partner opts in (Fork 3) |
| Reversibility | Reuse 025: FILED immutable, AMENDED chain; a reversed removal → regenerate → amended return, delta noted; over-claimed credit → Schedule A repay line | New mechanism | One correction mechanism across both forms |

### Forks for the human (genuine)

**Fork 1 — storage.** **1A (recommended):** generalize `ComplianceReport` with a `formType`
discriminator + a nullable `taxDollars`; both forms share the table, the review shell, and the
filing chain. Completeness 9/10. **1B:** a dedicated `ComplianceExciseReturn` table — cleaner typing,
but duplicates the status/version/amend/carry-forward machinery + the review/PDF plumbing. 7/10.

**Fork 2 — CBMA YTD source.** **2A (recommended):** carry the running removed-gallons ladder from the
prior FILED excise return in the same calendar year (first return / explicit recompute re-folds
`REMOVE_TAXPAID` Jan 1 → period start). Mirrors 025's on-hand carry-forward; requires filing
discipline (must file each return to advance the ladder). 9/10. **2B:** always full-re-fold the
calendar year on every generation — no filing-order dependency, heavier, and can disagree with a
filed return if removals were backdated. 7/10.

**Fork 3 — standard form vs Pilot Combined Return.** **3A (recommended for v1):** the standard
5000.24sm — universal, any bonded winery files it. **3B:** the TTB **Pilot Combined Return** merges
the 5000.24 + the 5120.17 (which we ALREADY build) and has **on-form CBMA credit lines** — arguably a
perfect fit, but it's an opt-in pilot requiring TTB enrollment, so it can't be the default. Strong
future once a design partner is in the pilot; flagged for the user's strategic call.

**Fork 4 — CBMA credit basis.** **4A (recommended):** tier by YTD gallons **removed** (statutory
mechanic), capped by YTD **production** + 750k. **4B:** tier by production only — simpler but posts
credit before removal, which isn't how it's claimed. 4A.

## Implementation Units

### Unit 1: Schema — `formType` + semimonthly cadence + return-cadence profile (migration)
**Goal:** Generalize the filing table for two forms; add the semimonthly return cadence.
**Files:** `prisma/schema.prisma`, `prisma/migrations/*` (isolated enum add + columns), `src/lib/compliance/types.ts`.
**Approach:** Add `enum ComplianceFormType { TTB_5120_17 TTB_5000_24 }` (its own CREATE TYPE migration).
Add `ComplianceReport.formType ComplianceFormType @default(TTB_5120_17)` + nullable `taxDollars
Decimal? @db.Decimal(12,2)` (display/query) + `@@index([tenantId, formType])`. Add `SEMIMONTHLY` to
`ReportCadence` (isolated `ALTER TYPE ADD VALUE`). Add `ComplianceProfile.defaultReturnCadence
ReportCadence @default(SEMIMONTHLY)`. No RLS change (columns on existing tenant tables). Windows enum
rule: isolated enum migrations, `migrate diff → strip phantom → deploy → generate`.
**Tests:** schema compiles; `db:generate` types include the enum; existing 5120.17 rows read as
`formType=TTB_5120_17`.
**Depends on:** none. **Verification:** `npm run db:generate` clean; `tsc --noEmit`.

### Unit 2: Excise rate table (pure, tested)
**Goal:** One date-stamped authority for the 6 per-wine-gallon rates.
**Files:** `src/lib/compliance/excise-rates.ts`, `test/compliance-excise-rates.test.ts`.
**Approach:** `RATE_BY_CLASS: Record<WineTaxClass, number>` ($1.07/$1.57/$3.15/$3.30/$3.40/$0.226) +
an `EFFECTIVE_DATE` + `CIDER` sub-rates, with a doc comment citing 27 CFR 24.270 and a "re-verify"
note. Pure. **Tests:** each class → its rate; a synthetic gallons×rate sums correctly.
**Depends on:** Unit 1 (WineTaxClass type exists). **Verification:** `npm test compliance-excise-rates`.

### Unit 3: CBMA credit engine (pure, tested — the hard part)
**Goal:** Allocate removed gallons across the $1.00/$0.90/$0.535 ladder given a YTD starting position.
**Files:** `src/lib/compliance/cbma.ts`, `test/compliance-cbma.test.ts`.
**Approach:** `applyCbmaCredit({ ytdRemovedGal, periodRemovedByClass, ytdProductionGal, isCider })` →
`{ creditByTier, totalCredit, newYtdRemovedGal, cappedByProduction, over750k }`. Walk each gallon from
the YTD position through tiers (boundaries 30k / 130k / 750k); cider uses the cider ladder. Cap credit
gallons at `min(750k, ytdProductionGal)`. Pure, exhaustive. **Tests:** table-driven — starts at 0
(all $1.00 up to 30k), a period straddling 30k (split $1.00/$0.90), straddling 130k, at 750k cap
(0 credit beyond), production < removed (cap bites), cider ladder, an **independent worked example**
transcribed from TTB's *Quick Reference Guide to Wine Excise Tax* / a CBMA example (anti-circularity
oracle). ~16 cases.
**Depends on:** Units 1, 2. **Verification:** `npm test compliance-cbma`.

### Unit 4: Return-cadence + semimonthly period bounds (pure, tested)
**Goal:** Compute the return period window + due date for a cadence.
**Files:** `src/lib/compliance/return-cadence.ts`, `test/compliance-return-cadence.test.ts`.
**Approach:** `returnPeriodBounds(year, cadence, index)` → `{ start, end, dueDate }` for SEMIMONTHLY
(1st–15th, 16th–EOM), QUARTERLY, ANNUAL; due = 14 days after `end`. Pure. **Tests:** semimonthly
halves incl. 28/30/31-day months + Feb leap; quarter/year windows; due-date offset.
**Depends on:** Unit 1. **Verification:** `npm test compliance-return-cadence`.

### Unit 5: Excise compute service (glue — reuses the 025 fold)
**Goal:** Turn a period's taxpaid removals into the net wine tax + CBMA + worksheet snapshot.
**Files:** `src/lib/compliance/excise.ts`, `test/compliance-excise.test.ts`.
**Approach:** `computeExcise(tenantId, { start, end })`: reuse the 025 removal-gathering (bulk
`tax_removal` + bottled `TAXPAID` StockMovements) to get **gallons removed by tax class** in the
period (exact liters → `gallons.ts`); pre-credit tax = Σ gallons×`excise-rates`; resolve the CBMA YTD
start (Fork 2 carry-forward from the prior FILED excise return this calendar year, else re-fold
`REMOVE_TAXPAID` Jan 1→start) + YTD production (`fermentToWineEvents` across the year); `applyCbmaCredit`
→ net line-10 tax; assemble a worksheet (per-class gallons/rate/pre-credit/credit/net) + the new YTD
ladder position (carry-forward source). Runs under `runAsTenant`. **Tests:** synthetic period →
correct pre-credit tax; credit applied; net = pre-credit − credit; empty period → $0; two periods in a
year → ladder advances (2nd period credited at the lower tier).
**Depends on:** Units 2, 3, 6 (reads prior FILED return for carry-forward). **Verification:** `npm test compliance-excise`.

### Unit 6: Persist + generate/file (formType routing)
**Goal:** One entry point that generates/persists an excise return; reuse file/amend.
**Files:** `src/lib/compliance/generate.ts` (or `generate-excise.ts`), `src/app/(app)/compliance/actions.ts`.
**Approach:** `generateExciseReturn(tenantId, { periodStart, periodEnd, cadence, version, amendsReportId })`
→ `computeExcise` → persist a `ComplianceReport` row with `formType=TTB_5000_24`, `taxDollars`=net,
`computed`=worksheet+CBMA, `onHandEnd`=YTD ladder position (carry-forward). `generateComplianceReport`
action routes by `formType`; `fileComplianceReport`/`markReportFiled` reused (FILED immutable, blocks
on anomalies). Amend: re-fold incl. corrections, diff vs prior FILED, Schedule A/B delta note.
**Tests:** generate → DRAFT row (formType excise, taxDollars set); file → FILED; amend after a
removal reversal → AMENDED with reduced tax.
**Depends on:** Units 1, 5. **Verification:** `npm test` + verify script (Unit 11).

### Unit 7: 5000.24 PDF asset + calibration → committed fieldmap
**Goal:** A stable field map for the combined return's wine + header + schedule fields.
**Files:** `scripts/calibrate-ttb-5000-24-fields.ts`, `docs/ttb-5000-24/TTB-5000.24-fillable.pdf`
(pypdf-normalized), `src/lib/compliance/ttb-5000-24-fieldmap.json`, `docs/ttb-5000-24/README.md`.
**Approach:** Fetch `f500024sm.pdf`; pypdf-normalize to a pdf-lib-loadable fillable copy (025 pattern);
calibrate the named fields (`Tax.10`, `Serial_Number`, `Employer_ID`, `Plant_No`, `Taxpayer_Address`,
`Return_Covers`, `Beginning`/`Ending`, `Date_On_Form`, Schedule B `Item30`–`Item34`) into a committed
map. Human-verify anchors vs the page render. **Tests:** every field the fill uses exists in the map;
no dup names; `Tax.10` present. **Depends on:** none.
**Verification:** run the script; spot-check anchors.

### Unit 8: Fill 5000.24 PDF + route dispatch
**Goal:** Produce a filled 5000.24 from a persisted excise return.
**Files:** `src/lib/compliance/fill-5000-24-pdf.ts`, `src/app/api/compliance/[id]/pdf/route.ts`.
**Approach:** Load the normalized asset, set `Tax.10` = net wine tax (2dp), `Payment_Amount`/line 21,
header from `ComplianceProfile` (EIN→`Employer_ID`, registry→`Plant_No`, operated-by→`Taxpayer_Address`),
`Return_Covers`=PERIOD + `Beginning`/`Ending` from the period, Schedule B credit line, flatten-safe.
The other commodity lines stay blank/zero (wine-only). Route dispatches fill by the report's `formType`.
**Tests:** fill a synthetic return → re-read `Tax.10` == net; header filled; route rejects other-tenant/unauth.
**Depends on:** Units 6, 7. **Verification:** download a fixture return PDF; line 10 lands.

### Unit 9: Anomaly + readiness (excise)
**Goal:** Flag likely errors before filing an excise return.
**Files:** `src/lib/compliance/anomaly.ts` (extend), `src/lib/compliance/llm.ts` (extend prompt),
`src/lib/assistant/tools/report-anomalies.ts` (extend), `test/compliance-anomaly.test.ts`.
**Approach:** Deterministic (gate filing): a removed gallon in a class with no rate; net tax < 0;
CBMA credit gallons > 750k or > YTD production (over-claim → Schedule A next period); a prior period in
the same calendar year still unfiled (ladder gap); tax ≠ Σ worksheet. Advisory LLM: plain-English
"ready to file / pay $X" + Schedule A/B wording, disclaimer, never gates. **Tests:** each deterministic
flag; LLM mocked. **Depends on:** Unit 6.
**Verification:** `npm test compliance-anomaly`.

### Unit 10: Review UI — form-type selector + excise worksheet
**Goal:** One screen, two forms; render the excise worksheet + payment panel.
**Files:** `src/app/(app)/compliance/page.tsx`, `ComplianceClient.tsx`, a new `ExciseWorksheet.tsx`,
`src/app/(app)/compliance/actions.ts`.
**Approach:** Add a **form selector** (5120.17 / 5000.24) driving `?formType=`; filter the report list
by formType. For 5000.24 render the worksheet grid (per class: gallons removed · rate · pre-credit tax ·
CBMA credit · net), the CBMA ladder position + remaining-at-each-tier, a **payment/period** panel
(period, due date, amount to pay), the reconciliation/ready banner (tax computed, no blockers), anomaly
panel, Part-equivalent notes, Mark Filed + Download PDF. Reuse the shell + DESIGN.md tokens. **Tests:**
component/RTL — selector switches lists; worksheet renders a fixture; blocked-file state on an anomaly.
**Depends on:** Units 6, 8, 9. **Verification:** load `/compliance?formType=TTB_5000_24`, generate, see
worksheet + due date, download PDF.

### Unit 11: Return-cadence setting + synthetic verify + docs
**Goal:** Set the return cadence; prove the whole path end-to-end; document.
**Files:** `src/app/(app)/settings/*` (add `defaultReturnCadence`), `scripts/verify-excise.ts`,
`scripts/verify-ttb.ts` (extend), `ROADMAP.md`, `AGENTS.md`, plan deferred appendix.
**Approach:** Settings: add the return-cadence select next to the ops cadence. `verify-excise.ts`
(synthetic tenant): seed removals across TWO semimonthly periods (and one crossing the 30k CBMA tier),
generate returns, assert pre-credit tax, CBMA ladder step-down between periods, net line-10, filled-PDF
round-trip (`Tax.10`), file→reverse-removal→amend. Extend the synthetic corpus. Docs: mark ROADMAP
Phase-14 excise slice, note the deferred Pay.gov/pilot/state-DTC. **Depends on:** Units 1–10.
**Verification:** `npm run verify:excise` green; `/compliance` renders a plausible return.

## Test Strategy

**Unit (Vitest):** excise rates; CBMA ladder (tier boundaries 30k/130k/750k, production cap, cider,
independent TTB worked example); return-cadence/period bounds; excise compute (gallons×rate−credit,
carry-forward ladder); PDF round-trip (`Tax.10`); anomaly deterministic paths; fieldmap coverage.
**Integration/verify (`scripts/verify-excise.ts`, synthetic tenant):** multi-period calendar year →
CBMA step-down → filled PDF → file → amend after a reversal. **Manual:** `/compliance?formType=5000.24`
→ generate → worksheet vs a hand-computed month → download.

**Anti-circularity oracle:** the CBMA engine (Unit 3) is validated against a TTB-published worked
example (Quick Reference Guide to Wine Excise Tax / a CBMA credit example), transcribed with expected
credit totals — not just self-consistent fixtures.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| R1 CBMA calendar-year ladder wrong (tier boundaries, carry-forward gap) | MED | HIGH | Pure engine + exhaustive boundary tests + independent TTB worked example; carry-forward from FILED returns + re-fold fallback; anomaly flags an unfiled prior period |
| R2 pdf-lib can't load raw TTB 5000.24 PDF | HIGH (confirmed) | MED | pypdf-normalize once → commit fillable asset (proven on 5120.17) |
| R3 Form version drift (11/2016 vs Smart Form v2.0) → field names shift | MED | MED | Committed fieldmap + calibration script + anchor tests; re-verify at build; README records the source revision |
| R4 Combined form implies we compute spirits/beer/tobacco | LOW | MED | Wine-only: fill line 10 + wine credit only; other lines blank/zero; UI + docs state scope |
| R5 Rates hardcoded, could change | LOW | HIGH | Date-stamped `excise-rates.ts` + re-verify note; single authority |
| R6 Return cadence mis-modeled (semimonthly halves, due dates) | MED | MED | Pure bounds helper + month-length/leap tests |
| R7 Double-count / double-tax across periods | MED | HIGH | Reuse 025 disjoint-period fold + carry-forward; each removal taxed in exactly one return; reversal nets; amend flags downstream |

## Success Criteria

- [ ] A synthetic winery's taxpaid removals produce a correct net wine excise tax (gallons×rate−CBMA)
      for a return period, from the ledger alone, filling line 10 of the real 5000.24 PDF.
- [ ] The CBMA credit ladder steps down correctly across a calendar year (30k/130k/750k) and matches
      an independent TTB worked example; over-750k / over-production is capped + flagged.
- [ ] Return cadence (semimonthly/quarterly/annual) is settable per tenant and defaults the screen;
      period windows + due dates are correct.
- [ ] Both forms are independently selectable on `/compliance`; generating one never affects the other.
- [ ] The excise return is reversible/amendable via the 025 machinery; a reversed removal → amended
      return with reduced tax.
- [ ] Downloadable filled TTB 5000.24 PDF with the net wine tax + header + period; other commodity
      lines blank.
- [ ] Anomaly check flags over-claim / missing-rate / negative-tax / unfiled-prior-period; never auto-submits.
- [ ] All new tests pass; `verify:excise` green; no regressions to plan-025; `tsc --noEmit` + lint clean.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | -- | -- |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | -- | -- |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 0 | -- | -- |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | -- | -- |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | -- | -- |

**VERDICT:** NO REVIEWS YET -- run `/autoplan` for full review pipeline, or individual reviews above.
