# Incumbent Teardown — Operations & Workflow (vintrace vs InnoVint vs Cellarhand)

> Agent 2 of 7. Charge: (a) catalog every cellar/harvest/production operation each system supports
> and build a 3-state operation-coverage matrix; (b) compare work-order create/schedule/assign/complete
> (and whether completion auto-logs the action); (c) THE CORRECTION MODEL — trace vintrace's
> "rollback & replay" and InnoVint's edit/delete-action model, and compare both against Cellarhand's
> append-only compensating-correction model (LEDGER-10/11).
> Cellarhand claims tagged **[IMPLEMENTED] / [PLANNED] / [ABSENT]** per `analysis/CELLARHAND-CURRENT-STATE.md`.
> Every incumbent claim cited to a specific article, prefixed `vintrace:` or `innovint:`.
> Descriptive + comparative; recommendations quarantined to the last section.

---

## 1. vintrace — operations, work orders, corrections

### 1.1 Operations model

vintrace's recordable operations are grouped into **seven menus** — Admin, General, Inventory,
Sparkling, Transfers, Treatments, Vintage/Harvest — enumerated in the master list
`vintrace: setup-and-admin/getting-started/vintrace-operations.md`. The structurally important finding
is that vintrace has a **small set of true operation types plus a large, configurable "Treatment"
layer**. Many things a winemaker thinks of as distinct operations — filtration (cross-flow/DE/pad),
cold stabilization, fining, splash-rack, barrel stirring, restarting a ferment — are **not** operation
types; they are **Product Treatments** recorded via the `Treatment (Product)` operation
(`vintrace: vintrace-web/winemaking/setting-up-a-product-treatment.md`, which lists exactly these as
example treatments). There are three treatment sub-types: Product, Equipment
(`vintrace: vintrace-web/winemaking/setting-up-an-equipment-treatment.md`), and Barrel
(`vintrace: vintrace-web/barrel-management/setting-up-a-barrel-treatment.md`).

Highlights of the true operation types (full catalog in the matrix, §3):
- **Transfers menu**: Transfer/Rack/Blend (single→single), Multi Transfer Many-to-One and One-to-Many,
  Rack & Return, Transfer to Barrel Group (`vintrace: setup-and-admin/getting-started/vintrace-operations.md`;
  `vintrace: vintrace-web/barrel-management/rack-and-return-of-barrels.md`).
- **Crush/press**: `Extraction` converts weight-fruit into volume fractions
  (`vintrace: harvest-vintage/crush-and-press/crush-and-extraction.md`); `Press Cycle` splits into
  free-run/pressings/combined/must/**saignée** fractions — saignée is a *fraction type*, not its own op
  (`vintrace: harvest-vintage/crush-and-press/using-the-press-cycle.md`). Whole-cluster % is a
  self-referencing Press Cycle (`vintrace: harvest-vintage/fermentation-and-cap-management/specifying-a-wine-s-whole-cluster-percentage-during-fermentation.md`).
- **Fermentation**: `Start Ferment`/`Stop Ferment` are first-class ops
  (`vintrace: harvest-vintage/fermentation-and-cap-management/managing-ferments.md`). **Cap management
  (punchdown/pump-over/bâtonnage) is NOT an operation** — it is captured as yes/no "dummy metrics" on a
  lab worksheet through the Lab Console (`vintrace: vintrace-web/lab-work/cap-management.md`); **delestage**
  is a Rack-and-Return + treatment combo (`vintrace: harvest-vintage/fermentation-and-cap-management/performing-a-delestage.md`).
- **Additions**: `Additive`, `Multi Additions` with templates/target rates
  (`vintrace: vintrace-web/lab-work/multi-additions-operation.md`), water additions
  (`vintrace: vintrace-web/compliance/managing-water-additions.md`), concentrate & spirits recorded as
  transfers (`vintrace: vintrace-web/winemaking/adding-concentrate-and-spirits-to-wine.md`).
- **Topping**: `Multi Topping` with pre-topping-loss vs increase-by-amount modes
  (`vintrace: vintrace-web/winemaking/topping-your-wines.md`); topping-without-composition variant
  (`vintrace: vintrace-web/winemaking/topping-without-updating-wine-composition.md`).
- **Barrels**: Break Barrels, Combine Barrels/Groups, staves cost model, barrel treatments, dispatch a
  vessel with the wine (`vintrace: vintrace-web/barrel-management/*`, `.../adding-and-removing-staves.md`).
- **Bulk logistics**: `Bulk Intake` (records "bulk received in bond" on TTB), `Bulk Dispatch` (BOL,
  optionally dispatch the vessel), `Import Product` (no TTB event)
  (`vintrace: vintrace-web/winemaking/bulk-wine-intake.md`, `.../recording-a-bulk-wine-dispatch.md`).
- **Loss/measure**: `Measurement` records loss/gain with a reason; evaporation is not a periodic op but
  is reported (`vintrace: vintrace-web/winemaking/measuring-a-vessel.md`; `vintrace: reporting/air-compliance/air-displacement-report.md`).
- **Sparkling**: `Tirage`, `Riddling` (Start/Stop), but **`Disgorgement` reuses Packaging** and
  **dosage reuses Blend/Transfer** (`vintrace: vintrace-web/sparkling-wine/tiraging-wine.md`,
  `.../riddling-wine.md`, `.../disgorging-wine.md`, `.../adding-hfcs-and-dosage-for-sparkling-wines.md`).
- **Packaging/inventory**: Packaging, Manufacture, Disassemble, Adjustment, Move, Receive, Dispatch,
  Stock Take (`vintrace: vintrace-web/bottling-and-inventory/*`).
- **Admin/identity**: New Batch, Change Batch, **Change Ownership** (from a timestamp forward, retains
  history), Analysis, Tasting Note, General Task (`vintrace: setup-and-admin/getting-started/vintrace-operations.md`).
- **Uniquely deep**: a full **Distilled Spirits Plant (DSP)** suite — dealcoholization (alcohol/aroma
  removal), distillation (high-proof NSFG, redistillation), and RTD (ready-to-drink) production — 17
  articles under `vintrace: vintrace-web/distilled-spirits-plant/`. This is well beyond a winery ERP.

### 1.2 Work orders

A **Work Order** is a container of one or more **Jobs** (`Add Job` → pick operation type), moving
Draft → Ready → In progress → Submitted → Completed
(`vintrace: vintrace-web/work-orders/job-management-console.md`). Create manually (blank) or from a
**template** (Save-As-Template from an existing WO, or built at Set Up → Work Orders)
(`vintrace: vintrace-web/work-orders/creating-a-work-order-manually.md`,
`.../creating-a-work-order-template.md`). Scheduling uses `Scheduled For` + `Expected Completion` +
`Priority`, surfaced on a Job Calendar and an Equipment Schedule for vessel reservation
(`vintrace: vintrace-web/work-orders/using-the-job-calendar.md`, `.../creating-equipment-schedules-from-work-orders.md`).
**No recurring/repeating work order** is documented. Assignment to a person is **optional** ("if the
work can be done by anyone on the cellar crew, leave this unassigned"), plus an `Issued By`
(`vintrace: vintrace-web/work-orders/creating-a-work-order-manually.md`).

**Completion → auto-log: a two-step, review-gated write.** A cellar hand's mobile "Submit" only sets
web status to *Submitted*; the operation is actually written when a web user clicks **Complete** then
**Now + Save** (`vintrace: vintrace-web/work-orders/completing-work-orders-with-data-discrepancies.md`,
`.../completing-an-equipment-treatment-job.md`). Between the two there is a **discrepancy-review dialog**
("Operator Work Review") reconciling planned vs. actual (barrels not confirmed, different additive
amounts). So vintrace does auto-log on completion, but the write happens at a **desktop review step**,
not at the field worker's tap.

### 1.3 Correction model — "reverse" (non-volume) vs. "rollback & replay" (volume) vs. support ticket

This is the crux. vintrace splits corrections by whether the operation changed volume:

- **Non-volume ops can be reversed in place.** Additions, analyses, and bulk dispatches "can be reversed
  without having to do a rollback"; stock actions (receive/move/dispatch/adjustment) reverse and show a
  **strikethrough** with a "Show Reversed" toggle (`vintrace: faq/common-questions/how-do-i-use-rollback-and-replay-to-fix-data-entry-errors.md`;
  `vintrace: vintrace-web/bottling-and-inventory/reversing-a-stock-action.md`).
- **Volume-changing ops cannot be reversed** — "toppings, transfers, treatments, changes in ownership,
  changes in batch, press cycles, extractions, and all sparkling operations" require **rollback** or
  **rollback & replay** (`vintrace: faq/common-questions/how-do-i-use-rollback-and-replay-to-fix-data-entry-errors.md`).
  - **Rollback** = restore the wine (and any other wines affected by subsequent ops) to before the
    selected op, *destroying* every subsequent operation — "it's as if the selected operation never
    happened... you'll need to re-enter each subsequent job to restore the operational timeline" (ibid.).
  - **Rollback & replay** = same reversal, but subsequent ops are moved to a special **Replay work order**
    (Replay status, oldest→newest) so you can fix/insert/delete and re-save, retaining original date/time
    (ibid.). The mechanism is **state-snapshot-based**: "Each time an operation for a wine is recorded,
    vintrace takes a snapshot of the wine. These snapshots are what allow you to do a rollback and replay"
    (`vintrace: vintrace-web/bottling-and-inventory/reversing-a-stock-action.md`).
  - **At scale it becomes a support ticket**: "You may be advised to contact vintrace support when a
    large number of critical operations are involved in a rollback... We'll notify you when we complete
    the rollback" (`vintrace: faq/common-questions/how-do-i-use-rollback-and-replay-to-fix-data-entry-errors.md`).
- **Bulk-dispatch reversal corroborates the VISION "reverts volumes to zero" note**: vintrace recommends
  using rollback instead of a plain reverse because reverse "may [require you to] manually adjust the
  costs for any relevant operations that occurred after" (ibid.), i.e. a naive reverse mishandles cost.
- **Targeted fix paths** exist alongside rollback: `Correct` on a bulk-intake job to fix composition with
  a "Reason for Correction" (`vintrace: vintrace-web/winemaking/fixing-a-wine-s-composition.md`); `Fix Date`
  to change a completed op's date (gated behind *Advanced Data Management*, range-restricted)
  (`vintrace: faq/common-questions/how-do-i-change-the-date-on-a-completed-operation.md`); `Correct a Fruit
  Intake` (`vintrace: harvest-vintage/fruit-bookings/correcting-a-fruit-intake.md`); a wrong tax-class/bond
  declaration is fixed by a treatment, an alcohol analysis, or a rollback
  (`vintrace: vintrace-web/compliance/fixing-an-incorrect-wine-declaration.md`); a filed 5120.17 is fixed by
  a separate Amended-report flow (`vintrace: reporting/ttb-usa/amending-a-previously-submitted-5120-17.md`).

**Net:** vintrace corrections either mutate/strikethrough (non-volume) or **destroy-and-replay history**
(volume), the latter escalating to a support ticket for complex cases. History is **not append-only**;
the audit trail of what was reversed lives in Replay work orders + reversed-action flags, not in the
event stream itself.

---

## 2. InnoVint — operations, work orders, corrections

### 2.1 Operations model ("actions")

InnoVint calls operations **actions**, and nearly every action can be run **two ways**: a **Direct
Action** (recorded immediately from a Lot Detail page's "Record Action" dropdown) or a **Work Order Task**
(scheduled, assigned, completed on web or in InnoApp) — the docs repeatedly phrase this as
"can be performed: [Direct Action / Work Order]"
(`innovint: make/analysis/how-to-record-analysis-via-direct-action-or-work-order-task.md`). Actions
operate on three lot types: **Fruit** (weight-tracked), **Juice/Wine** (volume-tracked), and **Case Good**
(bottled); additions are not allowed on Fruit lots.

Highlights (full catalog in the matrix, §3):
- **Movement**: Rack, **Rack and Return** (returns to the *same* vessel, no blend), Transfer, Blend,
  Bottling, Filter (also the mechanism for RO/cross-flow), B2B (bond-to-bond) transfers
  (`innovint: make/movement-actions/*`; RO via `innovint: guidance-faqs/frequently-asked-questions/how-do-i-record-reverse-osmosis-filtration-in-innovint.md`).
  **Blend & Return** is a documented workflow variant (`innovint: guidance-faqs/frequently-asked-questions/how-do-i-record-a-blend-return.md`).
- **Additions**: full `Addition` (Dry-Goods batch tracker + calculator) or `Simple Addition` (free-text);
  SO₂ rate math by type; chaptalization; sweetening. **No dedicated water-addition action** (explicit
  design choice with documented workarounds) (`innovint: make/additions/*`,
  `.../harvest/.../how-to-record-a-water-addition.md`). **Inoculation is not a standalone action** — yeast/
  nutrient go in as an Addition.
- **Topping**: `Topping` (topping-wine composition blends in) vs `Top Off` (lighter, no composition blend)
  (`innovint: make/topping/how-to-record-topping.md`, `.../how-to-record-a-top-off.md`).
- **Fermentation**: pumpover, punchdown, **delestage**, pulsair, dry-ice, **stir (bâtonnage)** are all
  first-class **fermentation-management actions** (`innovint: harvest/harvest-workflow-fermentation-tracking/fermentation-management-actions.md`),
  plus a **Ferm Gen** that mass-generates ferm/addition/analysis tasks across many lots
  (`.../using-the-fermentation-worksheets-aka-ferm-gen.md`).
- **Harvest/crush/press**: Receive Fruit, Receive Juice, **Process Fruit to Weight/Volume** (destem/crush
  are optional sub-steps inside), **Weight Transfer**, **Transfer Volume to Weight**, Bleed/Saignée, Drain,
  **Drain and Press**, **Barrel Down** (`innovint: harvest/harvest-workflow-fermentation-tracking/*`). The
  weight↔volume bridging actions are a distinctive InnoVint design.
- **Volume Adjustment** is a single powerful action carrying a TTB reason code — it backs data-entry fixes,
  spillage/losses, onboarding, destroyed-wine removal, **fortification, amelioration, and sweetening**
  (`innovint: make/recording-actions/volume-adjustments.md`; `.../additions/fortification-and-amelioration.md`;
  `.../guidance-faqs/.../how-do-i-remove-destroyed-wine-from-my-inventory.md`).
- **Custom Action/Task** — user-defined action at winery/lot/vessel scope
  (`innovint: make/recording-actions/using-a-custom-action-or-custom-task.md`).
- **Sparkling module** (activation-gated): **Bottling en Tirage**, **Riddling**, and a combined
  **Disgorge, Dosage & Package** action (`innovint: make-advanced-features/sparkling-wine-module/*`).
- **Compliance actions**: Declare/Edit Tax Class, Create BOL (`innovint: make/compliance/*`).
- **Case Goods / SUPPLY**: Add Packaging, Remove Taxpaid, Return Bottled Wine to Bulk, plus a separate
  SUPPLY inventory module (Add/Move/Deplete/Reconcile/Onboard Inventory)
  (`innovint: make/case-goods-in-make/*`, `innovint: supply/actions-in-supply/*`).

### 2.2 Work orders

A **Work Order** container holds one or more **Tasks** (`+ Add task` → pick action type), moving
Open → Started → Completed → Submitted (`innovint: make/work-orders/using-work-orders-in-innovint.md`).
Create only from web/desktop, blank or from a **template** (tasks/instructions save; **lots & vessels do
not save** in a template) (`.../creating-work-order-templates.md`). Scheduling uses a single **Due** date
on an Activity Calendar, and **recurring work orders are explicitly supported** — weekly (chosen weekdays)
or monthly ("2nd Thursday of every month"), with an end date or occurrence count; once created they
function **independently** (`innovint: make/work-orders/how-to-create-recurring-work-orders.md`).
Assignment to a single member is **required**, drives notifications (assigned/completed, daily
submit-reminders), and custom-crush accounts add Owner-visibility tags
(`.../using-work-orders-in-innovint.md`, `.../notifications-in-innovint.md`).

**Completion → auto-log: submission IS the ledger write.** Stated explicitly: "A submitted work order
**records the action and writes the change into your inventory**" (`.../using-work-orders-in-innovint.md`).
Lifecycle is Start → Complete (fills actuals, not yet posted) → **Submit** (posts). Tasks submit
individually or all at once; three "as-of" timings (now / specific datetime / task-completion) are
configurable and honored on **InnoApp**, which supports full field start/complete/submit with **offline**
support and QR vessel check-off (`.../innoapp/innoapp-work-orders/innoapp-work-order-overview.md`). There is
**no separate desktop re-entry step** — unlike vintrace, the field worker's Submit writes the record.
**Skip** is a first-class task state (only if unstarted; reopenable unless it's the final task)
(`innovint: make/work-orders/skipping-a-task-within-a-work-order.md`).

### 2.3 Correction model — edit/delete the recorded action, gated by "dependent actions"

InnoVint's core statement: **"once you have clicked on Submit... you cannot go back in time and undo that
submission. You may be able to edit the action... or else you may need to delete and re-do the action"**
(`innovint: make/recording-actions/how-to-edit-or-delete-recorded-actions.md`). There is **no undo/reverse
event**; the record itself is edited or deleted. The rules turn on **dependent actions** (any movement
action on the involved lot or vessels):

- **Always editable** (no dependency restriction): Additions, Custom actions (incl. pumpover/stir),
  Analysis, and cost items (ibid.).
- **No dependents**: any user (Team Member/Admin) may edit or delete the **most recent** such action.
- **With dependents**: only **Admin** may edit, limited to the selected action + up to **50** dependent
  actions; **case-goods** actions with dependents cannot be edited at all → contact support (ibid.).
- **Delete** is destructive and cascading: you can delete only the most recent action unless it has no
  dependents; otherwise you must **delete every dependent action first, then re-record them all** — e.g.,
  to edit a Top Off you must delete the later Barrel Down and Blend, then re-enter them (ibid.). And it is
  **unrecoverable**: "once an inventory action is deleted, there is no way for us to recover it"
  (`innovint: supply/actions-in-supply/how-to-edit-or-delete-inventory-actions.md`).
- **Edits are versioned** — an edited action keeps original + edited timestamps, an "Edited" tag, and a
  **Version dropdown** to view prior versions (`.../how-to-edit-or-delete-inventory-actions.md`;
  `.../how-to-edit-or-delete-recorded-actions.md`). So edits leave a trail, but deletes do not (beyond an
  exportable "deleted actions" list).
- **Date edits** are windowed between neighboring dependent actions (1-minute spacing), auto-annotated
  (`.../how-to-edit-or-delete-recorded-actions.md`). **Filed-period protection is a manual `Lock Backdating`
  toggle** an Admin sets and must temporarily move earlier to make a pre-lock edit, then re-set — with a
  430-day (14-month) hard edit horizon (`innovint: new-to-innovint/settings-make-grow-finance/winery-lock-backdating.md`;
  `.../how-to-edit-or-delete-inventory-actions.md`).

**Net:** InnoVint corrects by **mutate-in-place (versioned) or delete-and-re-enter-the-cascade
(unrecoverable)**. It confirms the VISION note "no way to edit an action already input" is *directionally*
true — an action with downstream dependents can't be freely edited; the fallback is deleting and
re-recording the whole dependent chain.

---

## 3. Operation-coverage matrix

3-state = Cellarhand status per `analysis/CELLARHAND-CURRENT-STATE.md` §2 ([IMPLEMENTED]/[PLANNED]/[ABSENT]).
"native op" = a dedicated `OperationType`; "folded" = handled but not as its own op type.

| Operation | vintrace | InnoVint | Cellarhand (3-state) |
|---|---|---|---|
| Transfer / Rack (single→single) | Transfer/Rack op | Rack, Transfer | **[IMPLEMENTED]** `RACK` (rack-core) |
| Rack & Return (same vessel) | Rack & Return | Rack and Return | **[IMPLEMENTED]** modeled as RACK round-trip; no distinct type |
| Multi-transfer (1→many / many→1) | Multi Transfer both dirs | Blend / Transfer combos | **[IMPLEMENTED]** via RACK/BLEND lines (double-entry) |
| Blend / assemblage | Blend (+ Trial Blend) | Blend (+ Blend Trials) | **[IMPLEMENTED]** `BLEND` + off-ledger `BlendTrial` |
| Blend & Return | via transfer combos | documented workflow | **[IMPLEMENTED]** as BLEND (GROW_EXISTING keeps code) |
| Crush / destem | Extraction (+ fruit-process treatment) | Process Fruit (destem/crush sub-steps) | **[IMPLEMENTED]** `CRUSH` (crush-core) |
| Press | Press Cycle | Drain and Press | **[IMPLEMENTED]** `PRESS` (press-core) |
| Saignée / bleed | Press-cycle fraction | Bleed/Saignée action | **[IMPLEMENTED]** `SAIGNEE` (press-core) |
| Drain (free-run separate) | fraction of Press Cycle | Drain (standalone) | **[IMPLEMENTED]** as PRESS/SAIGNEE fractions; no bare Drain |
| Fruit intake / receive | Intake Delivery, Unplanned Arrival | Receive Fruit / Receive Juice | **[IMPLEMENTED]** `HarvestRecord`/`HarvestPick` → CRUSH via `LotHarvestSource` |
| Weight↔volume bridge | (weight not a lot state) | Weight Transfer, Transfer Volume to Weight | **[ABSENT]** no weight-tracked lot state |
| Fermentation start / inoculation | Start Ferment op | Addition (no standalone inoc.) | **[IMPLEMENTED]** but as `LotStateEvent` (AF vector), not a ledger op |
| Fermentation stop | Stop Ferment op | (state change) | **[IMPLEMENTED]** `LotStateEvent` |
| Cap mgmt: punchdown / pump-over | lab "dummy metric" (folded) | first-class ferm actions | **[IMPLEMENTED]** folded into `CAP_MGMT` (one volume-neutral op) |
| Bâtonnage / lees stir | Product treatment (folded) | Stir action + BATONNAGE | **[IMPLEMENTED]** `CAP_MGMT` `BATONNAGE` CapKind (PR #73) |
| Delestage | Rack&Return + treatment | first-class ferm action | **[ABSENT]** as a named op (could compose from RACK) |
| Addition (SO₂/acid/nutrient/enzyme) | Additive / Multi Additions | Addition / Simple Addition | **[IMPLEMENTED]** `ADDITION` |
| Fining | Product treatment (folded) | Addition (fining agent) | **[IMPLEMENTED]** `FINING` |
| Filtration (incl. RO / cross-flow) | Product treatment (folded) | Filter action | **[IMPLEMENTED]** `FILTRATION`; RO/cross-flow not sub-typed |
| Topping | Multi Topping | Topping / Top Off | **[IMPLEMENTED]** `TOPPING` |
| Water addition | additive / bulk-intake | no dedicated action | **[IMPLEMENTED]** as `ADDITION` (water material) |
| Fortification (spirits) | transfer of spirits | Volume Adjustment | **[PLANNED]/partial** — ADDITION/BLEND workaround; no fortify semantics |
| Amelioration / chaptalization / sweetening | treatment/additive | Volume Adjustment / sweetening workflows | **[IMPLEMENTED]** `ADDITION` (SUGAR kind); no TTB amelioration % tracking |
| Cold stabilization / tartrate | Product treatment (heating/chilling) | Custom / analysis | **[ABSENT]** no cold-stab op type |
| Barrel fill / down | Transfer to Barrel Group | Barrel Down | **[IMPLEMENTED]** RACK into barrel + `BarrelFill` |
| Break / combine barrels & groups | Break Barrels / Multi Transfer | (vessel model) | **[IMPLEMENTED]** RACK; barrel groups tracked via BarrelAsset/Fill |
| Barrel maintenance (ozone/SO₂/wet-storage) | Barrel treatment | Custom task | **[IMPLEMENTED]** `VesselActivityEvent` (OVERHEAD, PR #73) |
| Tank/equipment sanitation | Equipment treatment | Custom task | **[IMPLEMENTED]** `VesselActivityEvent` (OVERHEAD) |
| Bottling / packaging | Packaging | Bottling | **[IMPLEMENTED]** `BOTTLE` + BottlingRun |
| Manufacture (case→pallet) / disassemble | Manufacture / Disassemble | Add Packaging | **[PLANNED]/partial** — finished-goods stock only |
| Loss / volume adjustment | Measurement + Loss Reason | Volume Adjustment | **[IMPLEMENTED]** `LOSS`, `ADJUST` |
| Evaporation / angel's share | reported (not an op) | Volume Adjustment | **[IMPLEMENTED]** derived from topping (`reason:evaporation`), no periodic op |
| Bulk intake (from another winery) | Bulk Intake (TTB in-bond) | B2B Transfer In | **[ABSENT]** transfer-in-bond flow (labels only) |
| Bulk dispatch (out of winery) | Bulk Dispatch (BOL) | B2B Transfer Out | **[ABSENT]** transfer-in-bond flow |
| Bond-to-bond transfer | Transfer Between Bonds | B2B (in/out, within-account) | **[ABSENT]** no bond entity/instrument |
| Tirage (sparkling) | Tirage op | Bottling en Tirage | **[IMPLEMENTED]** `TIRAGE` |
| Riddling | Riddling (start/stop) | Riddling | **[IMPLEMENTED]** `RIDDLING` |
| Disgorgement | reuses Packaging | Disgorge/Dosage/Package (combined) | **[IMPLEMENTED]** `DISGORGEMENT` |
| Dosage | reuses Blend/Transfer | part of combined action | **[IMPLEMENTED]** `DOSAGE` (+ `FINISH`) |
| Tax-paid removal (bulk §A) | tax-paid move/dispatch | Remove Taxpaid | **[IMPLEMENTED]** `REMOVE_TAXPAID` (bulk §A only) |
| Bottled §B tax removal | dispatch/inventory | Remove Case Goods as Taxpaid | **[PLANNED]** (folded from sales; §B removal not an op) |
| Return bottled → bulk | Decanting Bottles to Bulk | Return Bottled Wine to Bulk | **[ABSENT]** |
| Change ownership | Change Ownership op | Owner tags / B2B | **[ABSENT]** as an operation (cost-only static attr) |
| Change batch code / rename | Change Batch / code edit | Change lot properties | **[ABSENT]** code immutable; no rename path |
| Analysis / lab reading | Analysis op | Analysis action | **[IMPLEMENTED]** `AnalysisPanel`/`AnalysisReading` (not a ledger op) |
| Tasting note | Tasting Note op | (notes) | **[IMPLEMENTED]** `LotTastingNote` |
| Dealcoholization / distillation / RTD (DSP) | full DSP suite (17 arts) | brandy/spirits tracking (source component) | **[ABSENT]** no DSP/spirits engine |
| Cider / mead / seltzer / vermouth | Hard Seltzer + DSP | specialized workflows | **[ABSENT]** (cider = a TTB tax class only) |

**Reading of the matrix.** Cellarhand's *core cellar spine* is at parity or better-modeled (native op
types where the incumbents fold into treatments/adjustments — e.g., CAP_MGMT, FILTRATION, CRUSH/PRESS/
SAIGNEE are first-class here). The gaps are concentrated in **(1) bond/transfer-in-bond & multi-winery
logistics** (both incumbents strong, Cellarhand [ABSENT]), **(2) weight↔volume dual tracking** (InnoVint's
distinctive fruit-on-skins model; Cellarhand [ABSENT]), **(3) DSP/spirits/other-beverage breadth**
(vintrace uniquely deep; Cellarhand [ABSENT] by design), and **(4) finished-goods logistics depth**
(manufacture/disassemble/return-to-bulk).

---

## 4. Correction-model comparison — the priority

| Dimension | vintrace | InnoVint | Cellarhand |
|---|---|---|---|
| Underlying store | Mutable records + **state snapshots** per op | Mutable **versioned** actions | **Append-only event ledger**; state is a fold **[IMPLEMENTED]** |
| Fix a non-volume op | Reverse in place (strikethrough) | Edit in place (versioned) | New `CORRECTION` inverse event **[IMPLEMENTED]** |
| Fix a volume op | **Rollback / rollback & replay** (destroy + re-enter downstream) | **Delete + re-record** the dependent cascade | New `CORRECTION` inverse; downstream untouched **[IMPLEMENTED]** |
| Effect on downstream ops | Destroyed (rollback) or moved to a Replay WO | Must be deleted first, then re-entered | Untouched — unless a later op touched the same (vessel,lot); then **blocked** (LEDGER-11) guiding a LIFO unwind **[IMPLEMENTED]** |
| Is the correction itself auditable? | Partially (reversed flag / Replay WO) | Edits versioned; **deletes unrecoverable** | Yes — correction is a first-class linked event (`correctsOperationId @unique`, double-correct dies at the DB) **[IMPLEMENTED]** |
| Complex-case path | **Contact vintrace support** to run the rollback | Delete-cascade capped at 50; case-goods barred → support | Self-serve; guard `verify:reverse`/`verify:reverse-transform` **[IMPLEMENTED]** |
| Filed-period integrity | Separate Amended-5120.17 flow | Manual **Lock Backdating** toggle (admin moves it to edit) | Correction carries corrected op's `observedAt` → auto **Amended** TTB report **[IMPLEMENTED]** |
| Cost correctness on fix | Naive reverse warns "manually adjust costs"; rollback restores cost | Cascade re-entry re-derives | Cost negated by identity (`negateCostForReversedOp`) **[IMPLEMENTED]** |

**Which corrections do the incumbents handle clumsily that Cellarhand handles natively?**
- **Fixing a wrong volume-changing op after later work happened.** vintrace destroys and replays the whole
  subsequent history (or escalates to support); InnoVint forces you to delete and re-record every dependent
  action (capped at 50, case-goods excluded). Cellarhand appends one inverse event and, if downstream ops
  touched the same position, *blocks* with a clear LIFO-unwind path — no destruction, fully audited
  (LEDGER-10/11) **[IMPLEMENTED]**.
- **Correcting inside a filed compliance period.** Both incumbents rely on out-of-band mechanisms (vintrace's
  Amended-report flow; InnoVint's manual lock toggle). Cellarhand's compensating event *automatically* drives
  an Amended report because it carries the corrected op's `observedAt` **[IMPLEMENTED]**.
- **Preserving the audit trail of the fix.** InnoVint deletes are unrecoverable; vintrace rollbacks destroy
  operations. Cellarhand's correction is itself an immutable event — the mistake and its fix both survive
  **[IMPLEMENTED]**.
- **Cost restoration on correction.** vintrace explicitly warns that a plain reverse can leave costs wrong;
  Cellarhand negates cost by identity **[IMPLEMENTED]**.

**Where Cellarhand's correction model is weaker / narrower today:**
- **No-undo ops.** `CORRECTION`, `SEED`, `ADJUST`, `DEPLETE` are non-reversible via the dispatcher — the
  remedy is a new adjustment (`reverse.ts:84-87`) **[gap, IMPLEMENTED-with-limit]**. The incumbents let you
  edit/adjust these more freely.
- **In-place field edits.** For a genuinely trivial typo (wrong note, wrong additive rate with no downstream),
  InnoVint's "always editable" additions/analyses and vintrace's `Fix Date`/`Correct` are lower-friction than
  minting a compensating event. Cellarhand has timeline Undo per family but not lightweight field edits.

---

## 5. Cellarhand today (3-state consolidation)

- **[IMPLEMENTED]** — All 21 `OperationType` values have wired writers (`CELLARHAND-CURRENT-STATE.md` §2):
  RACK, LOSS, ADJUST/DEPLETE, BOTTLE, ADDITION/FINING, TOPPING, FILTRATION, CAP_MGMT (incl. BATONNAGE),
  BLEND, CRUSH, PRESS/SAIGNEE, the sparkling chain (TIRAGE/RIDDLING/DISGORGEMENT/DOSAGE/FINISH),
  REMOVE_TAXPAID (bulk §A), CORRECTION. Append-only compensating-correction model with LEDGER-10 (inverse
  event) + LEDGER-11 (block-if-later-touched, LIFO unwind); cost negated by identity; amend-drives-Amended-
  TTB. Work-order engine: issue→execute→auto-log→approve/reject→finalize, where **completion writes the real
  immutable ledger op via family tx-forms in one `runLedgerWrite`** and approval is task metadata
  (WORKORDER-1); reservations advisory/warn-not-block (WORKORDER-2); maintenance supply = OVERHEAD
  (WORKORDER-3). Vessel-activity/maintenance lane (ozone/SO₂/wet-storage/sanitation). Off-ledger blend trials.
- **[IMPLEMENTED but not as a ledger op]** — fermentation start/stop & AF/MLF (LotStateEvent), evaporation
  (derived from topping), analyses/tasting notes (measurement tables).
- **[PLANNED]** — bottled/finished §B TTB removals; NL/voice work-order authoring (the flagship AI wedge);
  shared-vineyard WO reuse (Phase 20); WO granular RBAC (Phase 23, today admins-only).
- **[ABSENT]** — transfer-in-bond / bulk intake & dispatch between wineries / bond entity; bond-to-bond;
  weight↔volume dual-lot tracking; change-ownership as an operation; batch-code rename; DSP / distillation /
  dealcoholization / RTD / other-beverage breadth; return-bottled-to-bulk; manufacture/disassemble depth;
  standalone drain/delestage/cold-stabilization op types; recurring work orders; skip-task semantics.

---

## 6. Convergence / divergence / both-fail

**CONVERGE (table stakes — Cellarhand must match, mostly does):**
- The core cellar op set (rack/transfer, additions, topping, fining, filtration, blend, crush/press,
  saignée, bottling, loss) exists in all three (`vintrace: setup-and-admin/getting-started/vintrace-operations.md`;
  `innovint: make/movement-actions/*`, `.../additions/*`, `.../topping/*`). **[IMPLEMENTED]**.
- **Work orders auto-log the operation on completion** — both incumbents write the record at completion
  (InnoVint at Submit: "records the action and writes the change into your inventory"; vintrace at
  Complete + Save). Cellarhand matches (completion writes the immutable op) and *improves* it with an
  explicit approve/reject state on top **[IMPLEMENTED]**.
- Templates for work orders; scheduling + assignment; a mobile field-completion path. Cellarhand has
  templates + issue/execute; mobile/offline WO is [PLANNED vs InnoApp's offline+QR].
- Blend trials as an off-ledger scratchpad (`vintrace: .../managing-trial-blends.md`;
  `innovint: make-advanced-features/general/blend-trials.md`) — Cellarhand's `BlendTrial` matches **[IMPLEMENTED]**.

**DIVERGE (design decisions worth pitching):**
- **Op granularity.** vintrace folds cap-management, filtration, cold-stab, fining, delestage into a generic
  "Treatment" layer; Cellarhand makes CAP_MGMT/FILTRATION first-class typed ops with controlled reasons.
  InnoVint folds fortification/amelioration/sweetening/loss into one Volume Adjustment; Cellarhand keeps
  LOSS/ADJUST/ADDITION distinct. Trade-off: Cellarhand's typed ops give cleaner compliance mapping; the
  incumbents' generic layers give more ad-hoc flexibility (and a Custom Action, which Cellarhand lacks).
- **Recurring & skip semantics.** InnoVint has recurring work orders and first-class task-skip; Cellarhand
  has neither (recurring [ABSENT]; skip [ABSENT]).
- **Weight-tracked fruit.** InnoVint's fruit-on-skins-as-weight-lot with weight↔volume bridge actions is a
  genuine model difference; Cellarhand tracks intake via HarvestPick→CRUSH, no weight lot state.
- **Completion write point.** vintrace inserts a desktop discrepancy-review before the op lands; InnoVint
  and Cellarhand write at the worker's completion. Cellarhand adds a post-hoc approve/reject (reject =
  compensating CORRECTION), which is closer to vintrace's review intent but *without* blocking the record.

**BOTH FAIL (differentiation opportunity — where Cellarhand's model is structurally better):**
- **Correcting a mistake after downstream work.** This is the headline. vintrace destroys-and-replays
  history (or a support ticket); InnoVint deletes-and-re-enters the dependent cascade (unrecoverable, capped
  at 50, case-goods barred). Neither store is append-only for volume corrections. Cellarhand's append-only
  compensating event with LEDGER-11 downstream-guard is the durable moat both incumbents "can't retrofit
  without a rewrite" (VISION Moat-honesty; corroborated by `vintrace: .../how-do-i-use-rollback-and-replay-to-fix-data-entry-errors.md`
  and `innovint: .../how-to-edit-or-delete-recorded-actions.md`).
- **Filed-period correction ergonomics.** Both bolt on separate mechanisms (Amended flow / manual lock
  toggle); Cellarhand's correction auto-drives the Amended TTB report.
- **Cost correctness under correction.** vintrace warns a naive reverse can corrupt cost; Cellarhand negates
  cost by identity.

---

## 7. Recommendations (labeled — not for planning docs)

1. **Lead the sales narrative with the correction model, and demo it against the incumbents' own words.**
   Show a "fix a transfer volume after three later ops" flow: Cellarhand appends one audited CORRECTION;
   vintrace requires rollback-and-replay (or a support ticket) and InnoVint requires deleting and
   re-recording the whole dependent chain. This is the one place all three genuinely diverge and the
   incumbents are on record describing the pain.
2. **Close the transfer-in-bond / bulk-logistics gap before the migration wedge (Phase 13).** Bulk intake,
   bulk dispatch (BOL), and bond-to-bond transfers are table stakes in *both* incumbents and today
   [ABSENT] in Cellarhand (only static §A labels). A winery migrating off vintrace/InnoVint will have this
   history; without an op to receive it, the ledger can't represent their real book. Model a `Bond` entity
   + a `TRANSFER_IN_BOND` op family; this also unblocks §A lines 7/15 and §B 3/4/9.
3. **Add lightweight in-place edits for the "no downstream" trivial-typo case.** The incumbents' biggest
   *usability* win over Cellarhand is editing an addition/analysis/date freely when nothing depends on it.
   A guarded edit-if-no-later-op path (or richer per-family Undo) would remove a real friction point
   without weakening the append-only spine — mirror InnoVint's "always editable: additions/analysis/custom."
4. **Consider a generic `CUSTOM`/`MAINTENANCE`-note op and a standalone `DRAIN`/`DELESTAGE`/`COLD_STAB`.**
   Both incumbents offer a Custom Action for the long tail of real cellar work; Cellarhand's typed-only op
   set risks forcing awkward encodings. Delestage and cold-stabilization are common enough to name.
5. **Evaluate recurring work orders and first-class task-skip.** InnoVint ships both; they matter for the
   repetitive cadence work (weekly ferment punchdowns, monthly topping) that is the WO engine's bread and
   butter. Recurring is a clean additive feature; skip needs to interplay with the approve/finalize state.
6. **Do NOT chase DSP / distillation / RTD / other-beverage breadth.** vintrace's depth here is real but
   off-strategy for a winery-production ERP; treat as explicitly out of scope (as today).
7. **When the assistant-authored-WO wedge lands, make correction a first-class assistant verb.** "Undo the
   punchdown I logged on tank 3 yesterday" should map to `reverseOperationCore`; this turns the structural
   moat into a demoable AI capability the incumbents cannot match.
