# Incumbent Teardown — UX & Friction Profiles (vintrace vs InnoVint vs Cellarhand)

> Agent 6 of 7. Charge: mine both incumbent help corpora for **user-pain signals** — multi-step
> workarounds, "contact support to enable X" escapes, features bolted on late, and release-note fix
> patterns that admit design wounds ("you can now…", "fixed an issue where…", "we've made it easier…").
> Then compare the two friction profiles head-to-head: (a) where InnoVint is genuinely easier than
> vintrace (the usability bar Cellarhand must clear), (b) where even InnoVint is clumsy (the leapfrog
> zone), (c) where vintrace's depth is a real advantage despite friction.
>
> Cellarhand claims are tagged **[IMPLEMENTED] / [PLANNED] / [ABSENT]** per
> `analysis/CELLARHAND-CURRENT-STATE.md`. Every incumbent claim is cited `vintrace:` / `innovint:` to a
> specific article. Descriptive + comparative; recommendations are quarantined to the last section. This
> agent read the highest-signal articles directly and fanned out three corpus-wide sweeps (release-notes,
> mobile/offline, and per-incumbent friction) across both help centers.

---

## 0. The one-sentence thesis

**Both incumbents run on a mutable-record data model, so both make the same class of mistake painful to
fix — but they express the pain differently: InnoVint punishes you with a *dependent-action cascade* (no
undo; delete-and-re-record everything downstream), while vintrace punishes you with a *rollback cascade*
(re-key the whole timeline, or phone support for the hard ones).** InnoVint is markedly easier on
day-to-day capture and is genuinely offline-first on mobile; vintrace is markedly deeper on compliance,
configuration, and multi-bond/DSP workflows. The white space *both* leave open — clean auditable
self-service corrections, native lot split/blend-return, and zero-config self-serve setup — is exactly
where Cellarhand's append-only ledger (D2/D6/D15) is architecturally positioned to leapfrog.

---

## 1. vintrace friction profile

vintrace is the feature-deep legacy incumbent. Its friction is the friction of **depth paywalled behind
configuration, permissions, and support tickets**, plus a mutable-record correction model that trades
in-place editability for auditability.

### 1.1 Corrections — "rollback & replay" is the marquee pain
- **A plain rollback wipes the downstream timeline and makes you re-key it by hand:** *"When you perform
  a rollback, you'll need to re-enter each subsequent job to restore the operational timeline"*
  (`vintrace: faq/common-questions/how-do-i-use-rollback-and-replay-to-fix-data-entry-errors.md`). The
  softer "rollback & replay" parks downstream ops in a special Replay work order, but you still re-open
  and re-save each replayed job one at a time, acknowledging a blue-box warning per job.
- **The most common cellar operations cannot be reversed at all:** *"Operations that change the volume
  cannot be reversed. These include, but are not limited to, toppings, transfers, treatments, changes in
  ownership, changes in batch, press cycles, extractions, and all sparkling operations"* (same file). The
  only remedy for these is the full rollback cascade.
- **The "call us" ceiling on self-service:** *"You may be advised to contact vintrace support when a
  large number of critical operations are involved in a rollback or rollback & replay… We'll notify you
  when we complete the rollback"* (same file). For complex corrections the *vendor* performs the fix and
  emails back a work-order number.
- **Reversing a dispatch risks silently corrupting cost:** *"If you choose to continue with this reverse
  you may need to manually adjust the costs for any relevant operations that occurred after or backdated
  before the dispatch"* (same file).
- **After a rollback, finding your work is a scavenger hunt** — and the doc's own phrasing is an
  admission: *"We have now enabled better visibility and tracking of work order numbers to help track
  jobs when they have been rolled back and replayed"*
  (`vintrace: vintrace-web/work-orders/finding-a-work-order-after-a-rollback-and-replay.md`). You copy a
  "TWL number" from the original WO's Notes tab and search it to locate the replay WO.
- **Composition fixes are permission-gated + require CSV hunting to even find candidates:** *"In order to
  correct a wine's composition, you'll need to have the Advanced Data Management permission"* and *"you
  can run the Bulk Stock Report with the Composition Details checkbox selected to a CSV file"* to discover
  which wines are wrong (`vintrace: vintrace-web/winemaking/fixing-a-wine-s-composition.md`). **Depth
  upside:** the fix auto-propagates — *"vintrace updates any blends that have occurred using the wine."*
- **Even a date typo is elevated + range-boxed:** *"In order to change a completed operation's date, you
  must have the Advanced Data Management permission"* and *"The date will be restricted to a certain range
  depending on when the previous operation was recorded"*
  (`vintrace: faq/common-questions/how-do-i-change-the-date-on-a-completed-operation.md`).

### 1.2 "Default-off + contact support" is a corpus-wide posture (systemic friction)
A large share of shipped capability is dark by default and requires a support ticket to switch on. The
gist string *"available starting with vintrace 9.4.3, but not enabled by default"* recurs 20+ times in
`vintrace: _manifest.json`. Representative verbatim gates:
- Bin adjustments: *"not enabled by default… please contact our support team"*
  (`vintrace: harvest-vintage/fruit-bookings/bin-adjustments.md`).
- Crush/Press Loads: *"disabled by default. To have this feature enabled, contact support"*
  (`vintrace: harvest-vintage/fruit-bookings/crush-press-loads.md`).
- Contracts Management module — three articles gate it identically
  (`vintrace: harvest-vintage/growers-vineyards-and-blocks/managing-grower-contracts-contracts-management.md`).
- Scheduling a barrel move, exporting job details, tracking crush locations, extraction rates by load,
  dynamic mSO₂ calc, hard-seltzer bonds, SSO — all default-off / pilot / "contact support."
- **Permanent pilot-gating model:** nearly every recent monthly release note carries a "Features in
  pilot — available to selected pilot clients only… please contact our support team" block
  (`vintrace: release-notes/version-25/version-25-08-1.md` through `version-26-06-1.md`). New value is
  routinely locked behind account-manager conversations.

### 1.3 Configuration & permission burden (friction with genuine depth)
- **40+ individually-togglable permissions** with a confusing two-axis model: *"Roles do NOT control
  what the system user is able to do. The tasks and operations available to a system user is controlled
  by their permissions"* (`vintrace: setup-and-admin/configuration/roles-and-permissions.md`). Core
  correction abilities are *themselves* separate permissions ("Can Perform Rollbacks and Restorations,"
  "Perform Bulk Wine Reversals," "Advanced Data Management"), and two are default-off requiring a ticket.
- **Auto-codes** are a real depth win (composable code elements across ~18 record types) but carry a
  self-inflicted trap: editing a policy that is set as a default throws an error and requires a
  temporarily-unset-then-reset workaround
  (`vintrace: setup-and-admin/configuration/configuring-and-using-auto-codes.md`), and deprecated
  attributes remain visible in the UI (*"Product Category - Deprecated. Do not use this."*).
- **Overfill is allowed by default, guardrail is opt-in + admin-only:** *"This setting is disabled by
  default… vintrace allows users to overfill vessels… This flexibility ensures that winemaking processes
  aren't delayed"* (`vintrace: vintrace-web/winemaking/prevent-overfilling-vessels.md`).

### 1.4 Old-UI/new-UI bifurcation + "you can now" basic-gap confessions
- *"Only available in the new vintrace"* appears in `_manifest.json`; the `oldui` label is pervasive
  (it's even on the rollback and change-date FAQs) — a live legacy/new UI split that is itself a
  migration-friction story.
- Recently-closed basic gaps: WO search was **surname-only** until 2026 (*"You can now search by First
  Name (as well as Surname) on Work Orders… (Previously limited to Surname)"*,
  `vintrace: release-notes/version-26/version-26-03-1.md`); importers required clicking a tiny icon
  (*"You can now click on the 'Upload a File…' text… (Previously limited to the upload icon)"*, same
  file); lab entry lacked shortcodes until v26. Fixed-issue admissions include a taxpaid-blend tax-state
  bug (`vintrace: release-notes/web-version-9/version-9-8-1.md`), backdated-analysis corrupting blend
  composition (`version-9-35-1.md`), and Break-Barrels mis-apportioning split volume (`version-9-4-3.md`).

### 1.5 Where vintrace depth is a genuine advantage (see §4c for the full head-to-head)
Dedicated trial-blend workflows incl. *transfer a trial blend to multiple tanks* and *blending in-bond
and taxpaid wines*; a whole Distilled-Spirits-Plant / RTD / hard-seltzer / sparkling multi-bond suite
(`vintrace: vintrace-web/distilled-spirits-plant/*`); rollback that **preserves original dates and
auto-restores costs and cross-wine dependencies**; composition-fix auto-propagation; and a permission
matrix fine enough for real TTB separation-of-duties.

---

## 2. InnoVint friction profile

InnoVint is the modern cloud-native incumbent that wins deals on usability today. Its capture and mobile
UX are genuinely good; its friction concentrates in **corrections (dependent-action cascade)**, **the
absence of first-class split/blend-return/rack-hold primitives (phantom-vessel hacks)**, and **low
self-service configurability (backend/support-gated setup)**.

### 2.1 Blends / splits / lot identity — the phantom-vessel workaround core
- **Splitting a lot is not a native action — it's a fake round-trip through a phantom vessel:** *"At this
  time the best way to split one vessel off into another lot involves two actions… Record a transfer
  action that moves the volume in the vessel you're splitting off into any empty vessel in the winery.
  Many wineries create a 'phantom' vessel specifically for this purpose"*, then transfer back, *"retaining
  the new lot code"* (`innovint: guidance-faqs/frequently-asked-questions/how-to-split-a-lot.md`). The
  guidance even concedes the data is fictional: *"attaching notes to both of those transfer actions
  explaining that no physical wine movement took place."*
- **"Blend & Return" is an unbuilt feature served by a 3-step workaround:** *"Although we will look into
  developing a new Blend and Return action… for the time being we have a 3-step workaround"* — tag
  vessels, Blend, Barrel Down — with an ordering trap: *"the Blend task must be submitted before the
  Barrel Down can be submitted"* (`innovint: guidance-faqs/frequently-asked-questions/how-do-i-record-a-blend-return.md`).
- **Adding volume to a weight-tracked lot errors out, then offers four fallbacks** including another
  phantom vessel and manual weight-equivalent math (*"complete a weight transfer for 0.67 tons of Lot X
  into Lot Y"*) — with fallback #4 being *"If you are not concerned about tracking the added volume… you
  can also consider simply completing a Custom Action or Task"* (i.e. don't track it)
  (`innovint: guidance-faqs/frequently-asked-questions/how-can-i-add-volume-to-a-lot-in-weight.md`).
- **Rack-and-Return holding vessel isn't real:** *"The holding vessel details are only recorded as a text
  note - there is no true movement of lot contents in InnoVint"*
  (`innovint: guidance-faqs/frequently-asked-questions/what-is-the-difference-between-the-rack-and-rack-and-return-actions.md`).

### 2.2 Corrections — the dependent-action penalty box
- **No undo:** *"once you have clicked on 'Submit'… you cannot go back in time and undo that submission"*;
  **delete only the last action:** *"it cannot be deleted unless it is the most recent recorded action"*;
  **cascade penalty:** *"The Barrel Down and Blend actions will need to be deleted before the Top Off
  action can be edited or deleted. Then the Barrel Down and Blend actions will need to be re-recorded as
  well"* (`innovint: make/recording-actions/how-to-edit-or-delete-recorded-actions.md`).
- **Hard 50-action edit ceiling:** *"Admins can only edit a limited number of actions (the selected
  action and up to 50 dependent actions)"*; **case goods punt to support:** *"Please contact
  support@innovint.us for assistance with these action types"*; **date edits are boxed by ±1 minute of
  neighbors** and admins are capped at **430 days** (same file).
- **Submitted work orders are frozen** — to fix a submitted WO task you edit the *underlying* action, not
  the task, and swapping a lot is a two-step add-then-remove
  (`innovint: make/work-orders/how-to-edit-a-work-order.md`).
- **Wrong Volume-Adjustment reason silently strands cost on an empty lot:** *"these reasons can leave
  cost and no volume on your lot!"* (`innovint: make/recording-actions/volume-adjustments.md`).
- **The "catch up after a break" playbook is destroy-and-recreate:** if a lot's composition changed while
  you were away, *"we recommend recording a Volume Adjustment to 0 gal and then creating a new lot with
  the correct composition, and then recording a Volume Adjustment to fill the new lot"*
  (`innovint: guidance-faqs/best-practices/best-practices-to-bring-inventory-up-to-current.md`).

### 2.3 Work orders — piecemeal, footgunny
- **Delete one at a time, not on mobile:** *"can only be deleted from the web interface… not from the
  mobile app"* and *"Currently work orders can only be deleted one at a time"*
  (`innovint: make/work-orders/deleting-a-work-order.md`).
- **Skipping the last task irreversibly submits the whole WO:** *"If the final task in a work order is
  skipped, it effectively submits the entire work order, and the task cannot be reopened"*
  (`innovint: make/work-orders/skipping-a-task-within-a-work-order.md`).

### 2.4 Low self-service configurability — the biggest "contact support" surface
- **Bonds & locations are backend-only:** *"Both bonds and locations must be added on the backend by
  InnoVint's Support Team"* (`innovint: supply/getting-started-with-supply/how-to-add-bonds-and-locations-in-supply.md`).
- **SUPPLY has no member management:** *"SUPPLY does not provide member management for controlling user
  access… please contact Support"* (`innovint: supply/getting-started-with-supply/the-supply-onboarding-checklist.md`).
- **Weigh-tag first number** (`innovint: harvest/settings-preferences/editing-weigh-tag-settings.md`),
  **additional weighing locations**, **desktop language**, **Advanced Receive Fruit for metric users**,
  the **B2B action**, mead/cider source options, sparkling module, tank maps, dip charts — all gated on a
  support ticket / "not available at all subscription levels."
- **Reporting is subscription-metered + support-gated:** custom reports cap at three saved unless you
  *"Reach out to support@innovint.us about upgrading your subscription!"*, exclude case-good/fruit/archived
  lots, and adding a missing column means *"Reach out to us at support@innovint.us"*
  (`innovint: make/reporting/custom-reports.md`).

### 2.5 Environment fragility surfaces as silent failures
- **Pop-up-blocked exports fail invisibly:** heavy reports *"only download if you have allowed pop-ups
  from cellar.innovint.us"* (`innovint: guidance-faqs/frequently-asked-questions/why-isn-t-my-report-export-downloading.md`).
- **Cost-report rebuild banner can linger >1 hour**, fix is a support ticket
  (`innovint: finance/getting-started/how-does-innovint-distribute-costs.md`).
- **Scanner troubleshooting is an OS/permission gauntlet** (*"This is never a good look!"*) and there's
  no password reset on mobile (`innovint: innoapp/innoapp/innoapp-troubleshooting-your-scanner.md`).

### 2.6 Where InnoVint is genuinely EASY (know the strengths to beat)
- **Lot rename is trivial and rewrites history cleanly:** *"You can change the lot code, lot name, lot
  color or lot style at any point in time… These lot properties will change to display the new code…
  throughout the entire history of the lot"* (`innovint: make/lots/changing-lot-properties.md`). (Wound
  hiding inside the strength — see §4b.)
- **Non-movement edits are unrestricted:** additions, analyses, custom/fermentation actions *"are not
  subject to any dependent action restrictions, and can always be edited"*; fixing a wrong VA reason is a
  one-click pencil (`innovint: make/recording-actions/how-to-edit-or-delete-recorded-actions.md`).
- **Individual Task Submit** for partial WO completion; **offline continuous barrel scanning**;
  **multi-lot BOL** (*"you and the truck driver didn't want to sign 30 pieces of paper"*); **deleted
  actions get an audit tag + export**; **backdate lock** protects closed TTB/finance periods.
- **InnoApp is offline-first** (see §4a) — the single biggest mobile advantage over vintrace.

---

## 3. Release-note "design-wound" admissions (both corpora)

The clearest evidence that a workflow was painful is the vendor's own changelog confessing the fix.
Grouped by wound type; each is a "you can now / previously / no longer / fixed an issue" quote.

| Wound area | Quote (verbatim) | Source |
|---|---|---|
| Capture | *"You can now create a new lot composition more easily for bulk wines, without requiring vineyard and block attributes"* | innovint: product-updates/…/10-28-2022-release-notes-bulk-components-and-more.md |
| Capture | *"The ability to archive Dry Goods is now possible!"* | innovint: product-updates/…/8-25-21-release-notes-archiving-dry-goods.md |
| Corrections | *"previously, you couldn't select lots codes on work orders in order to copy/paste them… But, now you can!"* | innovint: product-updates/2024/1-19-2024-release-notes… |
| Corrections | *"you can now edit units and the date recorded for any analysis results!"* | innovint: product-updates/2024/4-5-2024… |
| Corrections | *"You can now edit a Topping action to change the topping wine"* | innovint: product-updates/…/06-09-20-release-notes… |
| Corrections | *"some users may be used to working around the edit capabilities for the Topping action… but we've got that fixed up"* | innovint: product-updates/2024/2-23-2024… |
| Blend/split | *"Strange but true, this option didn't exist before! You can now bulk edit the vessel ending fills on the Drain and Press task"* | innovint: product-updates/2023/1-20-2023… |
| Blend/split | *"We fixed an issue where moving a taxpaid wine into Part VI did not change the tax state to Bonded. This prevented taxpaid wines… from being blended with a bonded wine"* | vintrace: release-notes/web-version-9/version-9-8-1.md |
| Blend/split | *"Fixed an issue where self topping and intra blend operations could sometimes not be completed"* | vintrace: release-notes/web-version-9/version-9-34-1.md |
| Blend/split | *"Fixed an issue where the Break Barrels operation didn't apportion the allocated volume properly"* | vintrace: release-notes/web-version-9/version-9-4-3.md |
| Work orders | *"You can now change lots in open work order tasks!"* | innovint: product-updates/2024/9-25-2024… |
| Work orders | *"You can now submit individual tasks within a work order"* | innovint: product-updates/…/6-8-21-release-notes-individual-task-submit… |
| Work orders | *"Lot stage change no longer required to create a Bottling work order"* | innovint: product-updates/…/11-02-20… |
| Work orders | *"Fixed an issue where some in-progress jobs in the web, and some work orders in the app could not be opened"* | vintrace: release-notes/version-26/version-26-04-1.md |
| Search/report | *"you can now search by First Name (as well as Surname) on Work Orders… (Previously limited to Surname)"* | vintrace: release-notes/version-26/version-26-03-1.md |
| Search/report | *"Now you can search by vessel code via the Lot Explorer and in the Lot Picker"* | innovint: product-updates/2023/3-17-2023… |
| Data integrity | *"InnoVint was previously case sensitive for the username field at login, and we realize this caused confusion and frustration"* | innovint: product-updates/2023/11-23-2023… |
| Data integrity | *"Sell Vineyard Contracts designated as 'Written' would default to 'Verbal' if opened for editing"* | innovint: product-updates/2023/11-23-2023… |
| Mobile | *"It's here! You can now remove vessels from most InnoApp tasks"* | innovint: product-updates/2024/2-23-2024… |
| Mobile | *"[the prior iOS app] has been removed from the Apple Store, and is no longer supported"* | innovint: product-updates/2023/10-6-2023… |

**Read:** InnoVint's confessions cluster around *editability that used to be blocked* (corrections,
copy/paste, WO lot changes) and *mobile parity* — i.e. it has been climbing out of the same
mutable-model correction hole for years. vintrace's cluster around *basic search/upload ergonomics* and
*compliance/blend bugs* — the marks of a mature, deep, but heavy legacy app.

---

## 4. Head-to-head

### (a) Where InnoVint is genuinely EASIER than vintrace — the bar Cellarhand must clear
1. **Offline-first mobile capture.** InnoApp is explicitly engineered for dead cellars: *"We've
   engineered the app to work flawlessly when you don't have access to the internet. All actions can be
   recorded offline… You can even complete and submit work orders!"* and auto-syncs on reconnect
   (`innovint: innoapp/innoapp/innoapp-highlights.md`; queue confirmed in
   `innoapp-how-to-record-analysis.md`, `innoapp-how-to-update-vessel-location.md`). **vintrace has no
   documented offline capability whatsoever** — a full-corpus sweep of `vintrace-docs/` for
   offline/sync/connection terms in any mobile context returns zero product hits; the lab feature is
   framed as *"in real time"* (`vintrace: mobile-app/getting-started-with-vintrace-mobile/scanning-lab-barcodes…md`).
   This is the single sharpest usability gap between them.
2. **Lot rename is instant and self-service** (§2.6) vs vintrace's permission-gated "Advanced Data
   Management" batch-code edit.
3. **Non-movement edits are unrestricted and one-click** (edit an analysis/addition/custom action, fix a
   wrong VA reason with a pencil) vs vintrace routing many fixes through rollback or elevated permission.
4. **No pervasive default-off/"contact support" wall for everyday capture** — InnoVint's ticket-gating is
   real but concentrated in *setup* (bonds, locations, users) rather than in *daily actions*; vintrace
   gates daily-workflow features (crush loads, barrel-move scheduling, job export) behind tickets.
5. **Lighter permission model** — 4 capability levels vs vintrace's 40+ toggles + roles-vs-permissions
   split (`innovint: new-to-innovint/settings-make-grow-finance/overview-user-permissions-and-capability-levels.md`
   vs `vintrace: setup-and-admin/configuration/roles-and-permissions.md`).

### (b) Where even InnoVint is clumsy — the leapfrog zone
1. **No first-class lot split or blend-return.** Both are taught as phantom-vessel fakes with notes
   saying "no physical wine moved" (§2.1). This is the flagship leapfrog target.
2. **The dependent-action correction cascade** — no undo, last-action-only delete, delete-and-re-record
   downstream, 50-action ceiling, ±1-minute date windows, 430-day cap, case-goods punt to support (§2.2).
   Even the vendor's "catch up" advice is destroy-and-recreate.
3. **Lot rename erases its own audit trail:** *"InnoVint does not track when and how lot codes are changed
   in the Lot history… These changes are not tracked as actions"* — mitigated only by an optional manual
   note (`innovint: make/lots/changing-lot-properties.md`). Easy, but not auditable.
4. **Low self-service setup** — bonds/locations/users/weigh-tag numbers all backend-only (§2.4).
5. **Reporting is subscription-metered and excludes whole lot classes** (§2.4); exports fail silently on
   pop-up block (§2.5).
6. **SUPPLY (case-goods) is immature** — no QuickBooks (manual depletion), no allocations, no real
   on-order status, single-C7-instance, manual MAKE→SUPPLY hand-off that leaves junk lots
   (`innovint: supply/using-supply/supply-faq.md`, `…/tracking-case-goods-make-to-supply.md`).

### (c) Where vintrace's depth is a real advantage despite friction
1. **Rollback preserves original dates + auto-restores costs and cross-wine dependencies** — a
   bookkeeping-integrity story a simple in-place editor can't match (`vintrace: faq/…/how-do-i-use-rollback-and-replay…md`).
2. **Composition-fix auto-propagates through all downstream blends** (§1.1).
3. **Configurable Auto-Code engine across ~18 record types** — real winery-defined naming templates
   (`vintrace: setup-and-admin/configuration/configuring-and-using-auto-codes.md`).
4. **Deep multi-bond compliance / DSP / RTD / hard-seltzer / sparkling** workflows
   (`vintrace: vintrace-web/distilled-spirits-plant/*`, `…/compliance/*`).
5. **Granular permissions → real TTB separation-of-duties** (period close/backdate, tax-state moves, bond
   moves, cost visibility) (`vintrace: setup-and-admin/configuration/roles-and-permissions.md`).

---

## 5. Pain-point table with Cellarhand 3-state

| # | Pain point (incumbent) | vintrace | InnoVint | Cellarhand today |
|---|---|---|---|---|
| P1 | Fix a mistake on a volume-changing op cleanly & auditably | rollback cascade / re-key timeline / call support | delete-and-re-record downstream; 50-action cap | **[IMPLEMENTED]** append-only `CORRECTION` inverse via `reverseOperationCore`; no re-keying (D6/LEDGER-10) |
| P2 | Correction blocked when later ops touched the wine | volume-changing ops un-reversible; rollback whole chain | dependent-action cascade must be deleted first | **[IMPLEMENTED]** LEDGER-11 blocks + LIFO chain-unwind; compensating event, not delete |
| P3 | Native split one lot into two | phantom-vessel? (uses Break Barrels; batch-code-on-transfer) | **phantom-vessel round-trip + notes** | **[IMPLEMENTED]** PRESS/SAIGNEE mint own child codes; **[ABSENT]** generic "split a resident lot in place" one-action |
| P4 | Blend & return to original vessels | supported (trial-blend → multiple tanks) | **3-step tag/Blend/Barrel-Down workaround (unbuilt feature)** | **[IMPLEMENTED]** BLEND op incl. `GROW_EXISTING`; return-to-source is a modeled blend, not a hack |
| P5 | Add bleed/saignée volume into a lot still in weight | (weight/volume handling deep) | **error + 4 fallbacks incl. phantom vessel + manual math** | **[IMPLEMENTED]** SAIGNEE + BLEND on the ledger; **[PLANNED]** harvest weigh-in pH/TA on HarvestPick |
| P6 | Rename a lot / friendly display name | batch-code editable (Advanced Data Mgmt perm) | **instant, but erases its own audit trail** | **[ABSENT]** code immutable, scheme-hardcoded, doubles as unique key; no rename, no separate displayName |
| P7 | Winery-defined naming template | **[configurable Auto-Codes, 18 record types]** | lot code free-form | **[ABSENT]** hardcoded `YEAR-VINEYARD-BLOCK-VARIETY-TAG`; no per-tenant template/UI |
| P8 | Offline capture in dead cellar/vineyard | **none documented** | **[offline-first InnoApp, auto-sync]** | **[PLANNED]** D25 offline-first / Phase 28 (Phase-6 outbox exists, no conflict resolution) |
| P9 | Self-serve setup of bonds/locations/users | admin-configurable (deep) | **backend-only / support ticket** | **[IMPLEMENTED]** tenant self-admin (RLS); **[PLANNED]** granular RBAC (Phase 23), god-mode switcher (21a) |
| P10 | Turn on a shipped feature without a ticket | **default-off + contact support (systemic)** | setup-gated; daily actions self-serve | **[IMPLEMENTED]** no feature-flag ticket wall (single-tier today); **[PLANNED]** Stripe billing tiers (17) |
| P11 | Partial / individual work-order task completion | rollback-heavy WO edits | Individual Task Submit (good) | **[IMPLEMENTED]** state changes at completion per-task; approve=finalize, reject=reverse |
| P12 | Reporting: flexible, all lot classes, no paywall | v7 report API (perf-improved late) | **3-report cap unless upgrade; excludes case/fruit/archived** | **[PLANNED]** AI dashboards (19); today fixed views + TTB/cost reports **[IMPLEMENTED]** |
| P13 | Overfill protection on by default | **off by default, admin opt-in** | (capacity handled per action) | **[IMPLEMENTED]** vessel capacity enforced at ledger write (D14), not opt-in |
| P14 | Two-way QuickBooks | (Xero-oriented; QBO varies) | **none (manual depletion)** | **[IMPLEMENTED]** Phase-15 two-way QBO |
| P15 | Exports fail silently / pop-up & browser fragility | pop-up-blocker FAQ exists | **pop-up-blocked exports fail invisibly** | **[IMPLEMENTED]** server-rendered Next.js; no pop-up-window export dependency |
| P16 | Deep multi-bond / DSP / transfer-in-bond | **[IMPLEMENTED, deep]** | B2B transfers (support-gated) | **[ABSENT]** transfer-in-bond lines are labels only; no bond entity; US-federal-TTB only |

---

## 6. Convergence / divergence / both-fail

**Convergence (table stakes — Cellarhand must match, not pitch):**
- **TTB 5120.17 auto-derivation** from recorded actions — both do it well (InnoVint's Volume-Adjustment
  reasons map to report lines; vintrace's tax-event console). Cellarhand **[IMPLEMENTED]** 5120.17 +
  5000.24. This is required correctness, per VISION "Moat honesty," not the wedge.
- **Work-order issue→assign→complete engine** — both mature; Cellarhand **[IMPLEMENTED]** core.
- **Cellar-floor scanning / mobile capture existence** — both ship mobile; Cellarhand **[PLANNED]**.
- **Backdate/period locks to protect closed compliance periods** — both have them; Cellarhand handles via
  amend-drives-Amended-report **[IMPLEMENTED]**.

**Divergence (deliberate design choices):**
- **Correction philosophy.** Both incumbents = mutable state → destructive fix (delete/rollback cascade).
  Cellarhand = append-only compensating event (D2/D6/D15) **[IMPLEMENTED]**. This is the durable moat
  VISION leads with, and it is directly corroborated by the incumbents' own docs (§1.1, §2.2) and by
  VISION's cited behavioral evidence (*InnoVint "no way to edit an action already input"*; *vintrace
  "correcting a dispatch reverts volumes to zero"*).
- **Naming.** vintrace = configurable winery templates + mutable code that rewrites history. InnoVint =
  free-form mutable code, rename untracked. Cellarhand = immutable, scheme-hardcoded, no rename
  **[ABSENT]** — the opposite pole. (This is a genuine *usability* liability, not just a design choice —
  see recommendations.)
- **Offline.** InnoVint = offline-first; vintrace = online-only. Cellarhand = **[PLANNED]** D25.
- **Configurability posture.** vintrace = deep-but-ticket-gated; InnoVint = light-but-backend-gated setup;
  Cellarhand = tenant self-admin, no feature-flag wall (advantage today, will grow tiers at Phase 17).

**Both fail (Cellarhand's leapfrog white space):**
- **Native lot split & blend-return** — both fake it with phantom vessels / multi-step chains (P3, P4,
  P5). Cellarhand's lineage DAG models these truthfully; the gap is a *one-action* split of a resident
  lot **[ABSENT]** and an explicit blend-and-return UI affordance.
- **Clean auditable self-service correction of ANY op** — neither offers it; Cellarhand does **at the
  data layer [IMPLEMENTED]**, but the four no-undo ops (CORRECTION/SEED/ADJUST/DEPLETE) and the UX of
  surfacing "why is this blocked" (LEDGER-11) are the last mile.
- **Zero-transcription ambient capture** (photo weigh tag → proposed op) — neither does it; Cellarhand
  **[PLANNED]** D22/Phase 25.

---

## 7. Recommendations (UX & friction wedge)

> Quarantined per method. Priority-ordered; each ties a mined incumbent pain to a Cellarhand state.

1. **Lead the demo with self-service correction, side-by-side.** The single most defensible,
   most-corroborated wedge: take a mistake three ops deep and fix it. InnoVint = delete + re-record two
   downstream actions (or hit the 50-cap / call support); vintrace = rollback & re-key the timeline (or
   call support). Cellarhand = one compensating event, timeline intact **[IMPLEMENTED]**. Build the last
   mile of UX around it: when LEDGER-11 blocks a correction, the UI must say *which later op touched the
   wine and offer "unwind the chain LIFO"* in plain language (today the guard is correct but the
   explanation is thin). Also close the **no-undo gap on ADJUST/DEPLETE** (P1/P2) — the incumbents' pain
   is exactly "the adjustment I made can't be cleanly reversed."

2. **Ship a first-class "Split lot in place" one-action and a "Blend & Return" affordance.** This is
   pure leapfrog: both incumbents document phantom-vessel hacks and (InnoVint) an *unbuilt* Blend-&-Return
   feature (P3/P4/P5). Cellarhand already has the lineage substrate — expose a single UI action that
   splits a resident `VesselLot` into a new child code without a fake transfer, and a blend flow that
   returns to source vessels natively. Market it as "no phantom vessels."

3. **Add a mutable, winery-templated display-name layer WITHOUT breaking the immutable id.** This is the
   biggest *usability* deficit versus BOTH incumbents (P6/P7): InnoVint renames instantly, vintrace has
   configurable Auto-Codes. Cellarhand's immutable code doubling as the unique key is the opposite of
   what users expect. Recommended: keep `Lot.id`/`code` immutable for lineage integrity, add a
   **renameable `displayName` + a per-tenant naming template** (unplanned-bonus code already isolates
   `buildLotCode`) — and, unlike InnoVint, **record renames as audit events** (InnoVint's rename erases
   its own trail — a differentiator we get for free from the ledger). This needs a VISION/D3 revisit
   since D3 currently pins the code as immutable; flag for the planning docs, do not edit them here.

4. **Treat offline-first mobile as table stakes, not a nice-to-have.** InnoVint's offline InnoApp is its
   clearest usability win and vintrace has *nothing* (P8). D25/Phase 28 is already "non-negotiable table
   stakes" in VISION — the competitive read confirms it: match InnoApp's favorite/queue/auto-sync model,
   and beat its documented limits (single status-change per WO task offline; must pre-favorite items).

5. **Make "no support ticket to turn anything on" an explicit selling point.** Both incumbents gate
   real capability behind tickets — vintrace daily-workflow features, InnoVint bonds/locations/users/
   weigh-tags (P9/P10). Cellarhand's tenant self-admin already avoids this; keep it as a north star as
   Phase-17 billing tiers land (gate by *plan*, never by *ticket*), and ship self-serve setup for
   whatever the P9 list will become (bonds, locations, members).

6. **Don't fight vintrace on depth you can't yet match — scope it honestly.** Transfer-in-bond, DSP/RTD,
   multi-bond, and configurable auto-codes are real vintrace advantages (§4c, P16). Cellarhand is
   US-federal-TTB-only with bond lines as labels **[ABSENT]**. Position against the *friction* of that
   depth (default-off, 40-permission setup, call-support corrections), and sequence transfer-in-bond +
   a bond entity onto the roadmap rather than claiming parity.

7. **Avoid the environment-fragility failure modes the incumbents ship.** InnoVint's silent
   pop-up-blocked export failures and hour-long cost-rebuild banners (P15) are cheap to beat: server-side
   report generation (already the Next.js posture) and synchronous cost folds mean "click export → file
   appears." Keep it that way and flag it in QA against DESIGN.md.
```
