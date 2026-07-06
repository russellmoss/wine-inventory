# Compliance Teardown — TTB / Tax Class / Bond / Excise / International

> **Agent 3 (COMPLIANCE).** How vintrace and InnoVint actually do US-federal TTB reporting,
> tax class, bond handling, excise, and international tax — mapped against Cellarhand's real
> engine (tagged [IMPLEMENTED]/[PLANNED]/[ABSENT] per `analysis/CELLARHAND-CURRENT-STATE.md` §4).
> Every incumbent claim cites a `vintrace:`/`innovint:` article path. Recommendations are in a
> labeled subsection at the end. Descriptive + comparative; no planning docs edited.

---

## 1. vintrace compliance

vintrace is the **feature-deep, internationally-scoped legacy** incumbent. Its US-TTB surface lives
in `reporting/ttb-usa/` + `vintrace-web/compliance/`; its non-US surface lives in `vintrace-web/sales/`
and setup. Compliance is treated as a *reporting layer over declared wine*, driven by **bond** +
**tax class** attributes that are properties of the wine/batch, plus a separate **tax-event ledger**.

### 1.1 The 5120.17 Report of Wine Premises Operations

- Generated on demand from Reports → Government Reports, with filters **Year / Year-Only / Monthly /
  Quarterly / Custom**, a **Bond** selector (multi-winery / AP02), a **Version** = Original|Amended,
  gallon **Precision**, "Include Inactive Stock Items", and an "I plan to submit this 702 to the TTB"
  disclaimer checkbox (`vintrace:reporting/ttb-usa/ttb-report-5120-17.md`). The PDF is **editable** so
  the winery can hand-add losses explanations, spirits, or concentrates "which currently aren't in our
  current version" — i.e. vintrace explicitly admits parts of the form are **not auto-populated**.
- **Report inclusions/exclusions are documented candidly** (`vintrace:reporting/ttb-usa/ttb-report-inclusions-and-exclusions.md`):
  Section A includes declared bulk wine, sparkling (pre-tirage bottles-fermented + in-tirage/disgorged),
  artificially carbonated, and **hard cider / non-grape fruit wines**; Section B mirrors A on bottling.
  **Part III Distilled Spirits** proof-gallon calc is "fully supported." **Part IV** materials received
  populates only on intake; juice/concentrate in E–G, sugar in H–I. **Part VI (distilling material/vinegar)
  is NOT supported.** **Part VIII (nonbeverage) NOT supported.** **Part IX (special-natural / 27 CFR
  24.218 formula wines)** *is* supported via the formula-wine feature. **Part X Remarks** is manual.
- **Troubleshooting is a first-class workflow.** The **Tax Breakdown Report** drills a 5120.17 line down
  to the contributing batches; the **Tax Event Console** (`vintrace:reporting/ttb-usa/tax-event-console.md`)
  shows every TTB event for a bond+tax-class over a date range, sectioned to mirror the report, with a
  **"Compare Against TTB Reports"** diff and — critically — a **`Can Edit Tax Volume Events` permission
  that lets a user hand-edit a tax event's volume WITHOUT changing the underlying operation or batch.**
  This is a manual override layer decoupled from the production ledger.

### 1.2 Tax class & wine declaration

- Tax class is an attribute of the **batch/wine**, declared as alcohol is measured. Premature/incorrect
  declaration is a known pain, "most common in a custom crush facility" — fixed via a **product
  treatment**, an **alcohol-analysis confirmation**, or the **Rollback** operation
  (`vintrace:vintrace-web/compliance/fixing-an-incorrect-wine-declaration.md`).
- **State vs federal split is explicit.** vintrace carries a **`14 to 16%`** tax class that maps to
  federal *Not Over 16%* but to state *14 to 21%* — surfaced by the **State Government Tax Class Report**
  (`vintrace:reporting/ttb-usa/state-government-tax-class-report.md`). So vintrace models the
  post-TCJA 16% federal threshold AND the legacy 14% state threshold as parallel classifications.

### 1.3 Bond handling — the deepest area

- Every wine sits under a **bond derived from its location**; **AP (alternating-proprietorship) bonds are
  derived from the OWNER of the batch and take precedence over the winery/location bond**
  (`vintrace:vintrace-web/compliance/transferring-wines-between-bonds-us.md`). AP02 setup is an
  address-book Owner flagged "AP Owner" with a registered bond name + number
  (`vintrace:setup-and-admin/configuration/setting-up-ap02-licenses.md`).
- **Transfer-in-bond is a real, three-way modeled operation.** Moving between bonds "will impact the 5120
  reports for BOTH bonds. The original bond shows Removed in Bond in the Bulk Wine section; the new bond
  shows Received in Bond." Three vintrace ops accomplish it: **Change Batch** (renames + reowns), **Transfer**
  (changes vessel too), and **Change Ownership** (bond change with no code change — followed by a mandatory
  **zero-volume Measurement operation to "lock in the bond change as of the date/time"**). Barrel-group moves
  across locations prompt a bond-change confirm.
- **Tax-paid vs in-bond is a location model** (`vintrace:vintrace-web/compliance/managing-tax-paid-wines.md`):
  the winery configures a **tax-paid storage area** (name-tagged with the tax state). The **first** move
  into it (or dispatch-as-tax-paid) posts to the 5120 (Section B line 8 *Removed Tax-Paid*); "once a wine
  is identified as tax-paid it's never again reported on the 5120." **Tax-paid returned to bond** = receive
  into tax-paid area then move to bonded area, confirming "Taxpaid wine returned to bond" on the report.
- **DSP / distilling material to a separate spirits bond** is a paid add-on
  (`vintrace:vintrace-web/distilled-spirits-plant/distillation-moving-distilling-material-from-a-bonded-winery-to-a-dsp-bond.md`):
  distilling material (Part VI) is dispatched via a **bulk-dispatch-inter-winery** to an "in-transit DSP
  tanker," received into the DSP bond, and lands on the **TTB F 5110.40 Monthly Report of Production
  Operations** — a whole second federal form family.

### 1.4 Formula wine (special-natural)

vintrace supports **formula wine** end-to-end: flag via a product treatment that changes the tax class to
*Part I – Formula Wine Produced*, or an additive op with a formula-wine loss reason
(`vintrace:vintrace-web/winemaking/flagging-a-wine-as-a-formula-wine.md`). It populates **Part IX lines
1/2/10-12** and pushes overflow / *Formula Wine In Process* volumes to **Part X remarks**. Also **hard
seltzer** (`vintrace:vintrace-web/hard-seltzer/`) and **RTD/cocktails** (reported in Part IV of the
Processing Report) have dedicated workflows.

### 1.5 International — vintrace's structural moat

- **Australia WET** (`vintrace:vintrace-web/sales/handling-the-wine-equalisation-tax-wet.md`): a 29% WET
  tax-rate component (priority 1) + a **compound GST** component, linked to a sales price list; **retail
  sales defer WET to the BAS statement**; a **Retail WET Tax Report**; Xero integration mapping WET to a
  liability account.
- **New Zealand excise duty** (`vintrace:vintrace-web/sales/handling-excise-tax-new-zealand.md`): a
  configurable **Excise Duty** table (date-ranged, one active rate per range) driven by an alcohol metric,
  with < / > 14% ABV excise tiers confirmed at sale, reported via Sales Summary / Sales Tax reports and
  posted to Xero as a liability.
- **California Winegrower Tax Return** supplemental report
  (`vintrace:reporting/ttb-usa/california-winegrower-tax-return-supplemental-report.md`): a full
  state-return data set (removed-on-payment-of-tax, imported into CA, in-bond exported, transfers to other
  CA cellars, etc.) keyed off dispatch types + physical addresses.
- Also multi-currency costing/sales, geographic-indicator/sub-region imports, grower-contract levies — the
  scaffolding of a system built for AU/NZ/US/multi-jurisdiction from the start.

**vintrace posture: a configurable tax/bond/jurisdiction reporting layer with a hand-editable tax-event
console, deep bond/AP modeling, DSP + formula + cider + seltzer + WET + NZ + CA. Broad and manual —
correctness leans on operator discipline + editable exports + a permissioned override.**

---

## 2. InnoVint compliance

InnoVint is the **modern, cloud-native, US-only** incumbent and **markets compliance as a headline
feature** ("TTB filing has never been so easy"; `innovint:make/compliance/generate-and-download-the-ttb-report.md`).
Its model is tighter and more opinionated than vintrace's, and its docs are unusually explicit about the
exact action→line mapping.

### 2.1 The 5120.17 — action-driven, tax-class-routed

- **Tax class is a property of the LOT, set at creation (required for US wineries) and changeable via a
  dated "Tax Class Change" action** (`innovint:make/compliance/declare-or-edit-tax-class.md`). "It is the
  tax class of the involved lot(s) AT THE TIME OF an action that determines in which part/column the
  changes are reported." Undeclared classes (*In Fermenters*, *Juice*, *Concentrate*, *Brandy/Distilled
  Spirit*) route to Parts VII / IV / III instead of Part I.
- **Every 5120.17 line is mapped to a specific action + reason** in one canonical article
  (`innovint:make/compliance/how-innovint-populates-the-ttb-report.md`). Highlights:
  - **Produced by Fermentation (line 2)** = volume declared out of *In Fermenters* within the period.
  - **Produced/Used by Blending (lines 5/20)** = a movement action where **≥2 involved lots had different
    tax classes**; volume inherits the tax class it is blended *into*. A **soft warning pops on every
    cross-tax-class blend**.
  - **Sweetening / Amelioration / Wine-spirits addition (lines 3/6/4 and 18/21/19)** = Volume Adjustments
    with matching reasons, self-checking (produced = used + material).
  - **Received in Bond / Transfers in Bond (lines 7/15; §B 3/9)** = **Bond-to-Bond actions or ANY movement
    across bonds**; soft warning on every cross-bond movement.
  - **Change of Tax Class (write-in lines 10/24)** and **Returned to Fermenters (line 25)** = tax-class
    changes to/from declared classes.
  - **Part VII In Fermenters** = all *In Fermenters* volume **plus estimated volume of lots still in
    weight (150 gal/ton default yield)**.
  - **Part III Distilled Spirits** uses a **default 50% ABV / 100-proof** conversion (editable in export);
    fed by the *Brandy or Distilled Spirit* tax class (`innovint:guidance-faqs/specialized-workflows/tracking-brandy-or-distilled-spirits-in-innovint.md`,
    which models spirits as a "vineyard" source component — a workaround, not a first-class DSP).
- **The TTB Audit Report** (`innovint:make/compliance/understanding-the-ttb-audit-report.md`) is InnoVint's
  killer compliance feature: a CSV where **each row = one lot's contribution to one (Part, Section, Line,
  Column) cell**, with the action ID + URL, so a winery can pivot-table any figure back to the exact
  actions. Signed +/- volumes; documented omissions (concentrate-sweetening transactions are on the report
  but not the audit CSV).

### 2.2 Corrections model — DELETE + re-record, not append-a-reversal

- InnoVint corrections are **mutate/delete-in-place**: "click Delete action," edit the process-fruit
  action, delete a tax-class change and re-record it (`innovint:make/compliance/the-ttb-5120-17-getting-to-know-your-innovint-ttb-report.md`
  FAQ; `innovint:make/recording-actions/how-to-edit-or-delete-recorded-actions.md`). Tax-class changes are
  explicitly **"not dependent actions"** — deletable/re-recordable independent of movement history.
- Guardrail is **Winery Lock Backdating** (an admin sets the earliest editable date;
  `innovint:new-to-innovint/settings-make-grow-finance/winery-lock-backdating.md`) plus repeated soft
  warnings ("changes may impact previously filed reports — check with your compliance team"). There is **no
  amended-report versioning** documented — the report is just re-generated; the burden of "did I already
  file this period" is on the operator + the lock date.

### 2.3 Bond handling

- Bonds are **added by InnoVint Support via ticket** (Registry #, DBA, legal name, optional address/phone/EIN);
  **unlimited bonds at no cost** (`innovint:new-to-innovint/settings-make-grow-finance/how-to-add-a-new-bond-in-make.md`).
  Optionally tied to the **Owner-Based Permission System** for custom-crush access control.
- **A rich B2B action taxonomy** (`innovint:make/movement-actions/bond-to-bond-transfers-b2b.md`,
  `innovint:guidance-faqs/frequently-asked-questions/which-b2b-action-should-i-use.md`):
  - **B2B Transfer In / Out** — to/from a **non-InnoVint** facility; pre-set reasons "Received in Bond" /
    "Bond to Bond Transfer Out"; separate **Case-Goods** variants for §B.
  - **B2B to another InnoVint Winery** — two-step: transfer-out copies the lot (code, composition, notes,
    composite analyses, cost-category snapshot) into the destination account **but moves no volume**; a
    second Transfer-In adds volume. Vineyard-component matching (exact match reuses, else creates).
  - **B2B within winery** vs **B2B Transfer (Inter-facility)** — both cross bonds inside one account; the
    inter-facility variant is "superior" because it **carries live-updating cost + additive tracking and
    can transfer into an existing lot**, whereas within-winery only snapshots cost and forbids lot reuse.
  - **ANY ordinary movement across bonds** (topping, blending) also transfers bond and reports correctly,
    with a soft warning.
- **Tax-paid** = a **Remove Taxpaid action** (§A line 14 / §B line 8); **Taxpaid returned to bond** = a
  Volume Adjustment reason (§B line 4); bottled-to-bulk dump = reason "Bottled wine dumped to bulk." Case
  goods flow to the **SUPPLY** module which is "the final source of truth for case goods" and produces its
  own §B export (`innovint:supply/using-supply/compliance-reporting-how-does-supply-populate-the-ttb-report.md`).

### 2.4 State + CBMA

- **State Compliance by Bond Report** (`innovint:make/compliance/what-is-the-state-compliance-by-bond-report.md`):
  because TCJA moved the federal still-wine threshold from 14%→16% but CA/NV/WI kept 14%, InnoVint derives
  a **State Alcohol Category (<14 / 14-16 / >16 / No value)** from the most-recent alcohol analysis and
  groups by bond — a *classification aid*, not a filed state return.
- **CBMA / Tax Cuts & Jobs Act** is documented as a **regulatory-change note**
  (`innovint:make/compliance/tax-cuts-jobs-act-impact.md`) — the tax-class category updates + a migration
  recipe (re-declare 14-21% lots, backdate to 1/1/18). **No CBMA credit-ladder computation is described.**

### 2.5 What InnoVint does NOT do (per docs)

- **No 5000.24 excise tax return.** (grep of `innovint-docs` for 5000.24 / excise-return = zero hits.)
  Compliance stops at the 5120.17 + audit + state classification aid.
- **No DSP / 5110.40.** Spirits are a workaround tax class, not a spirits-bond form family.
- **No international** anything (US-only by design).
- **No formula-wine (Part IX / F 5100.51)** workflow.

**InnoVint posture: a tight, US-only, action→line-mapped 5120.17 with a best-in-class Audit Report and a
strong B2B/bond taxonomy — but corrections are destructive edits gated only by a lock date, and excise
(5000.24) is entirely out of scope.**

---

## 3. Side-by-side

| Capability | vintrace | InnoVint | Convergence? |
|---|---|---|---|
| **5120.17 ops report** | ✅ configurable, editable PDF, admits gaps | ✅ action→line mapped, editable PDF | **Table stakes** |
| **Line-level traceability** | Tax Breakdown Report + Tax Event Console | **TTB Audit Report (CSV, per-lot-per-cell)** | Both strong; InnoVint's audit CSV is the cleaner design |
| **Tax class model** | attribute of batch; 14/16% dual-threshold | attribute of lot, dated change action | Converge (lot/batch attribute) |
| **Correction model** | Rollback/replay + **editable tax events** (permissioned) | **delete + re-record**; lock-backdate guard | Both **mutate** — neither is append-only |
| **Amended-return versioning** | ✅ Original/Amended flag + intervening-period cascade guidance | ❌ (re-generate; no version) | **Diverge** — vintrace ahead |
| **Bond / transfer-in-bond** | Change Batch/Transfer/Change-Ownership; AP precedence; zero-vol measurement lock | rich B2B taxonomy (in/out/inter-IV/within/inter-facility) | **Table stakes for multi-bond** |
| **Tax-paid vs in-bond** | storage-area location model | action/reason model | Converge (first-move-only rule identical) |
| **Custom crush / AP filing** | AP02 owner→bond; service orders/billing | Owner-Based Permissions + per-bond report | **Table stakes for CC facilities** |
| **DSP / spirits (5110.40)** | ✅ paid DSP add-on, real Part VI + tanker + 5110.40 | ⚠️ workaround tax class only | Diverge — vintrace ahead |
| **Formula wine (Part IX)** | ✅ product-treatment flag, Part IX + X | ❌ | Diverge — vintrace ahead |
| **Hard cider / fruit wine / seltzer** | ✅ dedicated | ⚠️ cider/mead as tax class | Converge-ish |
| **5000.24 excise return** | ❌ (WET/NZ/CA via sales-tax rates; **no US 5000.24 engine**) | ❌ | **Both fail** |
| **CBMA credit ladder** | ❌ (not computed) | ❌ (documented as regulatory note only) | **Both fail** |
| **International (AU WET / NZ excise / multi-currency)** | ✅ **structural** | ❌ US-only | **Diverge — vintrace's moat** |
| **State returns** | ✅ CA Winegrower return + State Tax Class report | ⚠️ classification aid only | Diverge — vintrace ahead |

**International specifically:** vintrace treats jurisdiction as a first-class config axis (bond location,
excise-duty tables, WET/GST compound rates, geographic indicators, multi-currency). InnoVint is
deliberately US-federal. For Cellarhand's roadmap this means: (a) **AU/NZ is a genuine vintrace-only
migration blocker** — a NZ or AU winery literally cannot leave vintrace for InnoVint, and cannot leave for
Cellarhand today either (§4); (b) but it is a *large, bounded* build (excise-rate tables + a
sales-tax/BAS layer + per-jurisdiction report templates), not core-ledger work — the append-only ledger
is jurisdiction-neutral. It is a **market-expansion** decision, not a table-stakes-for-US-launch one.

---

## 4. Cellarhand today (3-state)

Mapped against `CELLARHAND-CURRENT-STATE.md` §4 and the codebase.

### Ahead of / at parity with both incumbents

- **[IMPLEMENTED] Automated F 5000.24 Wine Excise Tax Return with a stepped CBMA credit ladder.**
  `src/lib/compliance/excise.ts` (`computeExcise`), `generate-excise.ts`, `removals.ts`, filling the real
  `TTB-5000.24-fillable.pdf`; `cbma.ts` implements the **30k/100k/750k stepped ladder** (stateless YTD).
  **Neither incumbent's docs describe a 5000.24 engine or a CBMA ladder computation at all** (§2.4, §3
  "both fail"). This is Cellarhand's single clearest compliance differentiator.
- **[IMPLEMENTED] Append-only corrections that auto-drive an Amended 5120.17.** The compensating
  `CORRECTION` op carries the corrected op's `observedAt`, so amending a filed period regenerates as an
  Amended report (`cellar/correct.ts`, LEDGER-10/11). This is **architecturally superior to both**:
  InnoVint deletes+re-records (§2.2) and vintrace hand-edits tax events (§1.1) — both mutate history;
  Cellarhand never does. It matches vintrace's Original/Amended versioning and beats InnoVint (no versioning).
- **[IMPLEMENTED] 5120.17 ops report** end-to-end (compute→DRAFT→gate→FILE→fill PDF): `generate.ts`,
  `period-fold.ts`, `form-map.ts` (§A 1-31 / §B 1-20), begin-balance carry-forward from prior FILED
  `onHandEnd`, `formType`-scoping so the 5120.17 and 5000.24 chains never cross
  (`src/lib/compliance/form-type.ts`). Cadence MONTHLY/QUARTERLY/ANNUAL + SEMIMONTHLY(excise); filing
  reminders (Phase 027). **At parity with both incumbents' core 5120.17.**
- **[IMPLEMENTED] Point-in-time tax-class derivation** — `deriveTaxClass()` (`tax-class.ts`) with six
  classes `A_LE16/B_16_21/C_21_24/D_CARBONATED/E_SPARKLING/F_HARD_CIDER`; missing ABV → class A +
  `needsAbvReview`. **Note the divergence:** Cellarhand derives tax class *from ABV*, whereas BOTH
  incumbents make it a **user-set, dated attribute of the lot/batch** (InnoVint §2.1, vintrace §1.2). This
  is a meaningful design gap for the change-of-tax-class flows below.

### Planned / boundaried

- **[PLANNED]** Sparkling in-process §B removals (`removal-core.ts:17-19`); controlled-group tier
  apportionment (parameterized "v2", `excise.ts:66-74`); Part IV/VII crush/saignée lines stubbed `null`
  (`form-map.ts:93-96`); September accelerated excise due dates (`return-cadence.ts:12-13`).

### Absent

- **[ABSENT] Transfer-in-bond / bond-to-bond entirely.** §A lines 7/15 and §B 3/4/9 are **static labels
  with no writer** (`form-map.ts` has no case). **There is no bond entity anywhere** — no bond
  instrument, penal sum, registry number, premises, or per-bond report scoping in schema or
  `src/lib/compliance/`. Cellarhand implicitly assumes **one bond per tenant.** This is the single
  biggest gap vs. both incumbents, both of which treat multi-bond + transfer-in-bond as core (§1.3, §2.3).
- **[ABSENT] Tax-paid-vs-in-bond separation as a modeled state.** Only bulk §A `REMOVE_TAXPAID` exists;
  there is no tax-paid storage area (vintrace) or taxpaid-returned-to-bond flow (both). "Once tax-paid,
  off the report" (§1.3) is not modeled.
- **[ABSENT] Custom-crush / AP separate filing.** `LotOwnership` drives cost only; no AP bond, no
  per-owner 5120.17, no service-order billing (§6 of current-state). Both incumbents file per-bond/per-AP.
- **[ABSENT] International** — no AU WET, no NZ excise, no state returns (CA Winegrower), no multi-currency
  tax. US-federal-only (`NZD`/`AUD` are display symbols only).
- **[ABSENT] Formula wine (Part IX / F 5100.51), DSP / 5110.40, nonbeverage (Part VIII).**

---

## 5. Edge cases our INVARIANTS.md does not cover

INVARIANTS.md is essentially **silent on compliance** — grep finds only ONE tax mention (a cost-export
`(component, tax-class)→debit/credit` line, `INVARIANTS.md:117`). There are **no LEDGER/COMPLIANCE
invariants** for tax class, bond, or excise. The corpora expose these uncovered edge cases:

1. **Tax-class reclassification on blend (produced/used-by-blending, lines 5/20).** BOTH incumbents fire
   these lines whenever a movement mixes ≥2 tax classes, and the blend **inherits the destination lot's
   class** (`innovint:.../how-innovint-populates-the-ttb-report.md` line 5/20;
   `innovint:.../blending-across-tax-classes.md`). Cellarhand derives tax class from ABV per-lot and has
   **no invariant** that a BLEND op must (a) recompute the child's class, (b) emit §A line-5/20 movements,
   or (c) warn on cross-class blends. `form-map.ts` Part-blending lines are effectively unhandled. **Missing
   invariant:** "a BLEND/RACK/TOPPING across tax classes posts symmetric Produced-by/Used-for-blending
   movements and the result carries the destination class."

2. **Change-of-tax-class as its own reportable event (lines 10/24/25).** Both incumbents treat a dated
   tax-class change as a first-class event that moves volume between columns and can strand a lot in
   *Returned to Fermenters* (line 25) if declared→undeclared (`innovint:.../the-ttb-5120-17...md` FAQ 3).
   Cellarhand has **no tax-class-change operation or event** (derivation is implicit from ABV). No
   invariant governs re-derivation on an ABV correction or the resulting §A line-10/24 movement.

3. **Blending across BONDS (received/transfers-in-bond, lines 7/15).** Any cross-bond movement — not just
   an explicit transfer — must post to both bonds' reports (`innovint:.../which-b2b-action-should-i-use.md`
   "other actions resulting in bond transfers"). With no bond entity, Cellarhand cannot even represent this.
   **Missing invariant:** bond isolation on the ledger + symmetric received/removed-in-bond posting.

4. **Tax-paid is a terminal, one-way state ("once tax-paid, never re-reported").** vintrace's rule
   (§1.3) implies an invariant: a lot/volume that has been REMOVE_TAXPAID must not re-enter in-bond §A/§B
   accounting except via an explicit **Taxpaid-Returned-to-Bond** event (a *refund-eligible* reversal, not
   an ordinary undo). Cellarhand's generic append-only reversal could naively "un-remove" tax-paid wine and
   silently corrupt the tax-paid boundary. **Missing invariant.**

5. **Amended-return chains cascade across intervening periods.** vintrace explicitly warns: fixing Feb
   forces amending Mar–May to true up begin/end balances (`vintrace:.../amending-a-previously-submitted-5120-17.md`).
   Cellarhand carries begin-balances forward from prior FILED reports but has **no invariant** that
   correcting a filed period **invalidates or forces re-file of all later FILED reports** in the chain.
   Risk: a backdated correction silently desyncs a later already-filed period's begin balance.

6. **Custom-crush / AP requires per-bond, per-proprietor SEPARATE filing.** Both incumbents file one
   5120.17 *per bond* (`vintrace:.../ttb-report-5120-17.md` Bond filter; `innovint` bond selector). A
   custom-crush facility with N AP02 clients files N+1 reports. Cellarhand's report is tenant-wide with no
   bond/owner scoping — a **structural** miss, not just a missing invariant.

7. **Spirits / distilling material and DSP transfers (Parts III/VI, F 5110.40).** vintrace models a real
   spirits bond + 5110.40 (§1.3); InnoVint fakes it with a tax class + 50% ABV default (§2.1). Cellarhand
   has neither, and no proof-gallon conversion invariant.

8. **Hard cider / non-grape fruit wine tax class.** Cellarhand HAS `F_HARD_CIDER` in `deriveTaxClass`, but
   no invariant that cider's excise rate + CBMA treatment differs (cider has its own CBMA credit tier). The
   `cbma.ts` ladder should be cider-aware; unverified.

9. **Formula / special-natural wine (Part IX, 27 CFR 24.218) & nonbeverage (Part VIII).** Absent; a formula
   wine silently reports as ordinary wine, misstating Part I.

10. **CBMA controlled-group apportionment.** The credit ladder is **per controlled group, not per bond/
    winery** — a single TTB rule for commonly-owned entities. Cellarhand's `excise.ts` parameterizes this
    as "v2" (§4 PLANNED) but there is **no invariant** that a tenant belonging to a controlled group cannot
    independently claim the full ladder (double-dipping the 30k-gallon credit is a real TTB violation).

11. **"Wine in weight" estimated-volume contribution to Part VII.** InnoVint folds undrained fruit into
    Part VII at 150 gal/ton (§2.1). Cellarhand's Part VII handling of pre-press fruit is unspecified — no
    invariant on estimated-yield inclusion.

---

## 6. Convergence / divergence / both-fail

- **Convergence (table stakes — Cellarhand must have to be credible):** a 5120.17 with action/lot→line
  traceability; tax class as a first-class, *changeable*, dated attribute; **multi-bond support with
  transfer-in-bond**; tax-paid-vs-in-bond separation; per-bond/per-AP filing for custom crush; an
  amended/versioned report. Cellarhand has the 5120.17 core + append-only-amend, but is **missing bonds,
  transfer-in-bond, tax-paid state, and the user-set/change-of-tax-class model** — the bulk of the
  convergent table stakes.
- **Divergence (design choices):**
  - *Corrections* — incumbents mutate (delete/edit); **Cellarhand's append-only compensating-event model
    is genuinely better** and directly attacks their #1 documented compliance pain (edits silently
    corrupting filed periods). Keep and market this.
  - *Tax class* — incumbents = user-declared attribute; Cellarhand = ABV-derived. Cellarhand's derivation
    is more automatic but **less flexible** (can't model an intentional cross-class blend, a premature
    declaration correction, or a hand-set class). This is the riskiest divergence — the incumbents'
    flexibility exists because real TTB reporting *needs* operator-set tax classes.
  - *International* — vintrace's structural multi-jurisdiction vs InnoVint's US-only vs Cellarhand's
    US-only. A deliberate scope choice.
- **Both-fail (differentiation opportunities Cellarhand can own):**
  - **Automated 5000.24 excise return + CBMA credit ladder** — neither incumbent documents this; **Cellarhand
    already ships it.** Biggest wedge.
  - **Correctness-by-construction 5120.17** — both incumbents publish long "why is my report wrong"
    troubleshooting guides (`innovint:.../the-ttb-5120-17...md`, `vintrace:.../troubleshooting-your-ttb-report.md`);
    the entire genre exists because their reports drift from reality. An append-only ledger where the report
    is a pure fold *cannot* drift the same way — a real, demonstrable differentiator.
  - **Controlled-group CBMA governance** — neither guards against double-claiming credits across
    commonly-owned entities; a multi-tenant ERP with a tenant/org graph is uniquely positioned to.

---

## 7. Recommendations (labeled — for planners, not a commitment)

Ordered by leverage against migration + credibility.

1. **Introduce a Bond entity + transfer-in-bond before pursuing multi-bond or custom-crush wineries.**
   This is the largest table-stakes gap and blocks the two most valuable migration segments (custom-crush
   facilities and any winery with >1 bond). Model: a `Bond` (registry #, penal sum, premises, owner link),
   per-bond RLS-scoped 5120.17 generation, and a **RACK/transfer variant that posts symmetric
   Removed-in-Bond / Received-in-Bond** and folds §A 7/15 + §B 3/4/9. Add invariants #3 (bond isolation +
   symmetric posting) and #6 (one filed report per bond).

2. **Make tax class a user-settable, dated, correctable attribute — not purely ABV-derived.** Keep ABV as
   the *default/suggested* class, but allow an explicit, append-only **Change-Of-Tax-Class event** that
   posts §A lines 10/24/25 and lets a winemaker (a) intentionally blend across classes, (b) fix a premature
   declaration, (c) declare out of *In Fermenters*. This closes edge cases #1, #2 and matches the mental
   model every migrating operator already has from both incumbents.

3. **Model tax-paid as a terminal one-way state with an explicit Returned-to-Bond reversal.** Add invariant
   #4: REMOVE_TAXPAID cannot be un-done by an ordinary compensating event; only a distinct, refund-flagged
   Taxpaid-Returned-to-Bond event re-admits volume to §A/§B. Prevents silent corruption of the tax-paid
   boundary.

4. **Add an amended-chain integrity invariant (#5).** Correcting a FILED period must **mark all later FILED
   reports as `NEEDS_AMENDMENT`** (or block the correction), and regenerate begin-balances down the chain.
   Cellarhand's carry-forward makes this cheap to enforce and turns the append-only model into a *provable*
   amended-return story vintrace only documents as manual guidance.

5. **Market the two "both-fail" wins now, before building more:** (a) the shipped **5000.24 + CBMA ladder**
   as a headline no incumbent matches; (b) **"your TTB report can't drift"** as the correctness pitch
   against both incumbents' troubleshooting-guide reality. These are the cheapest high-leverage moves.

6. **Add CBMA controlled-group governance (edge case #10) when multi-entity tenants appear.** The tenant/org
   graph makes Cellarhand uniquely able to prevent cross-entity double-claiming of the 30k-gallon credit —
   a compliance *guarantee* neither incumbent offers.

7. **Defer international (AU WET / NZ excise / state returns) as a bounded market-expansion project, not a
   launch blocker.** The append-only ledger is jurisdiction-neutral; WET/NZ/CA are additive report+rate-table
   layers (vintrace proves the shape). Sequence it only when an AU/NZ design partner appears — it is the one
   area where a winery *cannot* migrate off vintrace at all today.

8. **Treat DSP/5110.40, formula wine (Part IX), and Part VIII as explicit, documented coverage gaps** (like
   Phase 13's "import what the model covers, snapshot the rest"), not silent omissions — so a formula/cider/
   spirits producer knows the boundary rather than filing a wrong Part I.
