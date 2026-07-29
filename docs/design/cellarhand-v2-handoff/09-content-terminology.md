# 09 · Content and Terminology

Approved production copy. Sentence case for buttons and labels (existing rule). Winery language only — no `LotOperationLine`, no slug ids, no version notation, no raw actor emails in prose.

---

## 1. Navigation

| Element | Copy |
|---|---|
| Group 1 | `Today` |
| Group 2 | `The wine` |
| Group 3 | `The business` |
> **2026-07-28 (owner):** `Vineyard rounds` is now **`Vineyards`**. "Rounds" named the
> walk, not the place, and the destination is the vineyard hub — field notes, maps,
> weather, sprays. The search alias stays `field notes` (the LEGACY sidebar label, and
> the one in muscle memory); `Vineyard rounds` never shipped outside the flag.

| Destinations | `Work orders` · `Cellar floor` · `Vineyards` · `Fruit intake` · `Lots` · `Fermentations` · `Blends & trials` · `Bottling` · `Inventory` · `Compliance` · `Accounting` · `Records` · `Setup` |
| Mobile tabs | `Work` · `Cellar` · `Vineyard` · `Find` |
| Search placeholder | `Barrel, group, lot, tank, order…` |
| Search placeholder (with AI) | `Search, or ask about the cellar` |
| Skip link | `Skip to main content` |
| Scan | `Scan` |

Search aliases to keep for one release: `wine in-progress` → Cellar floor · `lot timeline` → Lots · `field notes` → Vineyards · `harvest` → Fruit intake · `TTB` → Compliance.

## 2. Page headings and summaries

| Screen | Heading | Summary pattern |
|---|---|---|
| Work orders | `Monday, 27 July` | `**4 orders overdue.** 1,284 barrel acts and 38 tank acts open across three halls — heaviest in Hall C, where topping is 3 days behind.` |
| Work order | `Barrel down 25-PN-04 into T-04` | `2 of 9 barrels recorded · Dumisani Mbeki since 11:42` |
| Topping runner | `Top CH-NEUTRAL-14` | `60 barrels · **25-CH-02** Chardonnay 2025 · rack 14, Hall C · neutral French oak, 3–5 yr` |
| Barrel | `Barrel C-1410` | `Position 10 of 60 in CH-NEUTRAL-14 · rack 14, Hall C` |
| Tanks | `Tanks` | `40 vessels · 31 holding wine · 302,400 L · ▲ 3 need attention` |
| Barrel groups | `Barrel groups` | `132 groups · 8,142 barrels · a group is how work gets assigned, scheduled and reported` |

**Rule:** the summary sentence says what needs attention, in winery language, with real numbers. It is never a slogan.

## 3. Actions

| Act | Label | Never |
|---|---|---|
| Release a WO to the floor | `Issue` | Publish, Send, Assign out |
| Open the runner | `Continue` / `Start` | Execute, Open execution view |
| Record one act | `Record 219 L` / `Record · next B-117` | Submit, Save, Confirm |
| Mark a barrel topped | `Topped — next barrel` | Done, Complete, Check |
| Add an observation | `＋ Note` | Comment, Remark |
| Close a keg | `Keg is empty` → `Record the keg` | Finish keg, Close out |
| Amend a value | `Correct this entry` | Undo, Revert, Delete, Edit |
| Bulk tick | `Tick the rest of the group` | Select all, Mark all |
| Create from AI | `Review & create` | Accept, Apply, Run |
| Edit a draft | `Edit` | Edit by hand, Modify |
| Discard a draft | `Discard` | Delete, Cancel |
| Retire a group | `Archive group` | Delete group |
| Deactivate a vessel | `Deactivate` | Remove, Delete |

Buttons that write name the value or the object: `Record 4.5 L · next C-1411`, `Archive CH-NEUTRAL-14`, `Tick 51 barrels`. Never a bare verb on a consequential action.

## 4. Confirmations

> **Tick the rest of the group?**
> Mark the remaining 51 barrels of CH-NEUTRAL-14 as topped from K-3. You can correct any of them afterwards.
> `Cancel` · `Tick 51 barrels`

> **Archive CH-NEUTRAL-14?**
> Its 60 barrels stay in the cellar and keep their history. Open work orders that use this group are unaffected.
> `Cancel` · `Archive group`

> **Cancel work order #253?**
> 2 of 9 barrels are already recorded and stay in the ledger. The reserved topping wine in T-22 is released.
> `Keep the order` · `Cancel #253`

> **File the June return?**
> Operations · Form 5120.17 · June 2026 · 302,400 L. Filing is final; a mistake is corrected by filing an amendment, not by changing this one.
> `Not yet` · `File the June return`
> *(Keep the existing line "Nothing is ever auto-submitted." — the single best line of copy in the application.)*

## 5. Warnings

| Situation | Copy |
|---|---|
| Precaution on a task | `▲ Stop before the lees. Unfined lot; T-04 is under gas.` |
| Stale chemistry | `▲ Free SO₂ on 25-RS-02 last read 41 days ago — take a panel before dosing.` |
| Upcoming flagged barrel | `▲ Four barrels ahead: C-1413 was flagged low in June. Check the head before you top it.` |
| Group holds two wines | `This group holds two wines (25-CH-02, 25-CH-05). Work orders will fan out per wine.` |
| Implausible top-up | `That's about 34 L into one barrel — more than 15% of its nominal size. Record it anyway, or check the keg count?` |
| Low topping wine | `T-22 has 458 L. This round needs about 340 L.` |

## 6. Empty states

| Screen | Copy | Actions |
|---|---|---|
| Work orders, unfiltered | `No open work orders` / `Everything here is caught up. Finalized orders move to the Archive — start a new one when there's work to assign.` | `New work order` · `View archive` |
| Work orders, narrowed | `No open work orders match “hall c · rack 12–18”.` | `Clear narrowing` · `View archive` |
| Nothing assigned | `Nothing is waiting on you` / `Everything assigned to you today is recorded. Two ferments are due readings tomorrow morning.` | `Help the floor` · `Take a reading` |
| Group finished | `All 60 barrels topped` / `About 86 L of 25-CH-02 went in from three kegs. The SO₂ round on this order is next.` | `Go to SO₂ round` |
| No groups | `No barrel groups yet` / `A group is how work gets assigned — most wineries start with one per rack.` | `New group` · `Import from racks` |
| Empty barrel | `Empty since 4 Nov` / `Last held 24-CH-02.` | `Fill from a tank` |
| No readings | `No readings yet for this tank` / `Record one and the curve appears here.` | `Record a reading` |
| No tasting notes | `No tasting notes on this wine yet` | `Add a note` |
| No lineage | `This lot originated at crush on 14 Oct and hasn't split or blended.` | `See the crush` |
| Search, no match | `Nothing matches “sauv blanc”.` | `Scan a tag` · `New work order` · `Ask the assistant` |
| No vineyard assigned | `You're not on a vineyard team yet` / `Marta Reyes manages vineyard access.` | `Ask Marta for access` · `See the cellar work instead` |

The last one replaces today's dead end ("Ask an admin to assign your vineyard") — it names the person and offers a path.

## 7. Errors

Every error names the object, states whether anything was written, and offers the resolving action.

| Situation | Copy |
|---|---|
| Capacity, tank | `▲ T-04 only has room for 140 L` / `3,000 L capacity, 2,860 L in it. **Nothing was recorded.**` · `Record 140 L` · `Choose another vessel` |
| Failed write | `C-1410 wasn't recorded.` / `The server didn't accept it. Nothing was written.` · `Try again` |
| Conflict | `Joseph ticked C-1410 four minutes ago.` / `Only one tick counts for a barrel.` · `Keep his` · `Add my note to it` |
| Cancelled mid-run | `This work order was cancelled by Marta at 13:02.` / `The nine barrels you already recorded are safe in the ledger.` · `Back to my work` |
| Not found | `Work order #999 doesn't exist, or you don't have access.` · `Back to work orders` |
| Load failure | `Couldn't load your work orders.` · `Try again` |
| Search down | `Search is unavailable. Use the sidebar, or scan a tag.` |
| Correction blocked | `This entry can't be corrected on its own.` / `A blend on 21 July (WO #244) already used this wine. Unwind that blend first and the correction opens up.` · `Unwind the chain — start with WO #244` |
| Keg source short | `T-22 only shows 18 L.` / `The keg was recorded as 30 L.` · `Record 18 L` · `Check the tank` |
| Scan: no permission | `Cellarhand needs the camera to read a tag.` · `Allow the camera` · `Type the barrel number instead` |
| Scan: unreadable | `Couldn't read that tag.` · `Try again` · `Type the barrel number` |
| Scan: unknown | `That tag isn't in this winery's records.` · `Search for the barrel` |

**Prohibited in user-facing errors:** stack traces, error codes without prose, model names, `null`, `undefined`, `NaN`, HTTP status numbers.

## 8. Connectivity

**Now (no outbox — build this):**

| State | Copy |
|---|---|
| Online | `Connected` |
| Offline | `No connection — you can't record right now.` / `Your entry is still on screen.` Primary action disabled. |
| Request failed | `That didn't reach the server. Nothing was written.` · `Try again` |

**After Phase 28 only:**

| State | Copy |
|---|---|
| Held | `◔ 3 entries held on this phone` / `Not on the server yet. They send automatically when signal returns; keep the app open.` · `Try sending now` |
| Primary action | `Hold 225 L and go to B-121` |
| Drained | `All 3 entries are on the server.` |

**Never say** "will retry", "queued", "synced", "offline-ready" or "saved locally" unless a durable outbox exists and drains.

## 9. Recorded and correction

| Element | Copy |
|---|---|
| Receipt | `B-116 recorded — 218 L into T-04` / `Written to the lot ledger at 12:47 by you.` · `Correct this entry` · `See the ledger line` |
| Keg receipt | `Keg K-3 recorded — 30 L across 21 barrels, about 1.43 L each.` · `Correct` · `See the lines` |
| Permanence note | `A recorded act stays in the ledger — correcting it writes a dated amendment beside it, so the trail is never rewritten.` |
| Correction dialog | `Correct B-114` / `Recorded 208 L at 12:18. What should it be?` / reason field: `Why is it changing?` |
| Downstream effect | `The 20 other barrels on this keg will re-estimate to 1.50 L each.` |
| Corrected marker | `corrected 12:22` |

## 10. Measured vs. estimated

| Element | Copy |
|---|---|
| Badge | `measured` / `≈ estimated` |
| Explanation on the runner | `You tick barrels; you never type a volume. When the keg empties, Cellarhand writes one measured withdrawal from T-22 and divides it across the barrels that keg served — recorded as estimated additions, with the divisor kept on every line.` |
| Arithmetic line | `30 L ÷ 21 barrels = 1.43 L each` |
| Honesty note | `An even share is the honest default — nobody knows the real split. Notes left on individual barrels ride alongside the estimate without changing it.` |
| Nominal capacity | `225 L is the barrel's stated size, not a ceiling — wine evaporates and the true fill is always a bit under. Cellarhand only speaks up if a single top-up estimate exceeds 15% of nominal, and even then it warns rather than refuses.` |
| Derived barrel volume | `~219 L of 225 L nominal · derived from fills, racks and topping estimates` |

## 11. AI

| Element | Copy |
|---|---|
| Draft card state | `Draft — nothing created yet` |
| Draft footer | `A draft changes nothing until you confirm it.` |
| After creation | `Created from your question, 12:58. Nobody can see it on the floor until you issue it.` |
| Dock, on the object | `Draft #318 is open in front of you. Change anything here or on the page — I'm working on the same order.` |
| Provenance heading | `Built from` |
| Provenance chips | `5 Brix readings, 22–27 Jul` · `WO #171 fill volumes` · `vessel register` |
| Ranking attribution | `Cellarhand's ordering · see the plain queue` |
| AI unavailable | `Ranking is off right now.` / `Now is showing the plain queue: overdue first, then by due time. Search, records and recording are unaffected.` |
| Voice draft | `Heard “two nineteen” as 219 L, matching the 200–230 L range of the other eight barrels. Check the number before you record.` |
| Voice policy | `Voice never writes on its own. It fills the same form you would have filled, shows you the number it heard, and waits.` |
| Failed draft | `Couldn't create that draft. Nothing was written.` · `Try again` · `Build it by hand` |

**Prohibited:** "AI-powered", "smart", "magic", sparkle emoji or icons, "I think", "as an AI".

## 12. Dashboard vocabulary fixes (out of slice, one-line changes)

The audit found three leaks on the landing page every user sees:

| Leak | Now | Fix |
|---|---|---|
| Slug block ids | `block qa-spray-blk-1785168175883-1` | the block's label |
| Version notation | `(v3, was 2026-09-30)` | `changed from 30 Sep` |
| Raw actor emails | `owner@demowinery.test` | the person's name |
| Pluralisation | `1 blocker(s) before filing` | `1 blocker before filing` |

Apply the same rules everywhere: never expose an internal id, a version number or an email address in prose.
