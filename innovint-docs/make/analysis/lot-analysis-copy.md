---
title: "Lot Analysis Copy"
url: "https://support.innovint.us/hc/en-us/lot-analysis-copy"
category: "MAKE"
section: "Analysis"
page_type: "page"
lastmod: "2026-04-08"
gist: "Wine moves around... a lot!"
tags: ["lab", "packaging", "transfers", "work-orders", "barrels", "getting-started"]
---

# Lot Analysis Copy

Wine moves around... a lot! And analysis should follow the wine.  This article explains how InnoVint will automatically copy existing analysis from one lot into an empty lot.

- [What does Lot Analysis Copy do?](#What)
- [When does InnoVint move or copy existing analysis on lots?](#ExistingAnalysis)
- [How does Lot Analysis Copy work?](#HowDoesitWork)
- [Editing and deleting Analysis and Movement Actions](#Edit_Delete)
- [Video Overview](#video-overview)
- [FAQ](#FAQ)

### What does Lot Analysis Copy do?

When a supported movement action, including Transfer, Barrel down, Rack, Top off, Filter, Bottling en tirage, B2B Transfer (Inter-Facility), Blend (in a specific 1:1 scenario), Bleed/Saignee, Weight transfer or Drain & Press is performed, and the filled lot(s) is either a new lot or a lot with no contents, the **most recent lot composite analysis** value for each unique analyses present on the "parent" lot will automatically flow through to the fill lot(s).

The lot or lots that are filled on the action must be empty when the action is recorded, and only Lot Composite analysis will copy into the new lot(s) - Individual Vessel analysis will not carry over.

Lot analysis copy does not work with the following actions: Topping, Transfer (Case goods), Add packaging (Case goods), Bottling, Receive fruit, Process fruit to weight/volume, or Transfer volume to weight.

### When does InnoVint move or copy existing analysis on lots?

It depends on the lot selected in your action. When you complete an action or create a work order task, you can select one of three options for your fill lot(s):

![](https://support.innovint.us/hs-fs/hubfs/image-png-Aug-14-2024-11-21-28-4489-PM.png?width=663&height=49&name=image-png-Aug-14-2024-11-21-28-4489-PM.png)

The Lot Analysis Copy function will work (or not work) depending on which one you choose, and whether or not the lot you fill has contents:

|  |  |
| --- | --- |
| **Action/Task Fill lot option** | **Outcome** |
| Retain lot code | Current functionality - All existing lot analyses remain because the lot code is the same for the drain and fill lots. |
| Combine with existing lot | If the selected fill lot code has no contents, then the most recent lot composite analyses values for each analyses type recorded on the parent lot will populate in the fill lot code.  If the selected lot has contents, no analyses transfer. |
| Create new lot | The most recent lot composite analyses values for each analyses type recorded on the parent lot will populate in the fill lot code. |

### How does Lot Analysis Copy work?

It gets a bit tricky sometimes, but read on to get the details:

The new filled lot(s) will show any analyses values copied from the "parent lot" and display the Source, Performed By, and any Notes from the originating analysis action.

Additionally, an arrow icon and the text "Copied from parent lot" will provide a link back to the movement action that generated the copied analyses.

![Lot Analysis Copy-analysis tab](https://support.innovint.us/hs-fs/hubfs/Lot%20Analysis%20Copy-analysis%20tab.webp?width=670&height=482&name=Lot%20Analysis%20Copy-analysis%20tab.webp)

This link to the originating movement and the parent lot will display on the Lot details page in the following analysis tabs:

- Sugar/Temp tab
- Graph tab
- All Analyses in a List tab

If the newly filled lot again gets transferred into an empty lot code, and the most recent analyses are copies, those copies will also be transferred onto the new lot.

If backdated analyses are imported into a parent lot prior to submitting a supported movement action, these analyses will flow downstream.

#### What about backdated analysis actions?

Entering a backdated analysis action before a supported movement action will result in the copied analyses flowing through to eligible filled lots.

If a backdated analysis action is entered on a parent lot that had previously copied analyses to lots via a movement action, and the **new** backdated analyses becomes the most recent lot composite value, then the fill lot will show both copied analyses (i.e. the previous most recent analyses will not be removed).

**Backdated Analysis import actions**

 Analyses imported and backdated into a parent lot after a supported movement action will copy into empty lots in two cases:

*1) If you use the date on the Analysis import action* (this is the recorded at date, i.e. the Backdate action checkbox on the Analysis import action) to backdate the analyses prior to the movement action, but do not enter specific dates/times on the analyses **within** your import file.

2) *If the 'Recorded at' Backdate action date/time on the action matches the 'Effective at' time of **ALL** the analysis results in your import file exactly.*

![Lot Analysis Copy-backdate](https://support.innovint.us/hs-fs/hubfs/Lot%20Analysis%20Copy-backdate.webp?width=670&height=437&name=Lot%20Analysis%20Copy-backdate.webp)

⚠️ If you include analyses with multiple backdates within your import file, then those analyses will not be copied from the relevant lots into any "child" lots on a supported movement, even if they are the most recent analyses.

#### What about my ETS Results?

The sample results must be received from ETS in order for those analyses to copy to the fill lot(s).

When entering or backdating a movement action where these analyses on the "parent lot" need to be copied into the filled lot(s), the movement action date/time must be after the posted ETS "Effective at" date that you see on the ETS sample details.
![Lot Analysis Copy-effective at](https://support.innovint.us/hs-fs/hubfs/Lot%20Analysis%20Copy-effective%20at.webp?width=670&height=228&name=Lot%20Analysis%20Copy-effective%20at.webp)

### Editing and Deleting Analyses and Movement Actions

- Deleting an originating analysis action on the parent lot will delete *all* copied analyses from this action in other lots downstream of the lot.
- Deleting a copied analysis from one downstream lot will not remove other copies that have already been created from the parent lot on other lots.
- Deleting an action that resulted in copied analyses will delete all copied analyses on all filled lots downstream of that action
- Users cannot edit a copied analysis from the "All Analysis in a List" page but they may delete it.

### Video Overview

### FAQ

**Q: Why did my analysis not copy over?**

*A: Common explanations for analysis that wasn't copied are as follows:*

- *This analysis copy feature only applies to juice/wine lots and analyses will not copy on fruit or case good lots.*
- *If your filled lot already has contents at the time of the action, the analysis will not copy over; this is not a supported action type. Downstream lots must be empty in order to received copied analysis.*
- *You performed a complex blend action (i.e. if more than one lot is blended together); this is not a supported action type.  Lot Analysis Copy will not copy analysis from multiple lots to the filled lot - this features does not support "calculated analysis".*
- *Lees lots (i.e. when you "Add lees lot" on an action) will not receive copied analysis.*
  ![](https://support.innovint.us/hs-fs/hubfs/image-png-Aug-15-2024-10-23-24-2944-PM.png?width=491&height=101&name=image-png-Aug-15-2024-10-23-24-2944-PM.png)
- *Backdated analysis more than 180 days prior to today's date will not be copied to other lots. We will display a warning when this occurs.*
  ![Lot Analysis Copy-warning](https://support.innovint.us/hs-fs/hubfs/Lot%20Analysis%20Copy-warning.webp?width=497&height=164&name=Lot%20Analysis%20Copy-warning.webp)

**Q: I edited an analysis on the original lot, why did my downstream lot analysis not update?**

*A: Editing an analysis that was recorded before the movement action will not update the date/time, value or unit of any copied analyses on other lots.*

- *Note that some analysis edited using the Action edit button will update, including the "Performed by" field will update on the new lots to the user who completed the analysis action edit.*

*In some cases, the best option may to DELETE the original analysis and re-enter it on the mother lot. This will trigger the action to recalculate and re-copy corrected analysis through downstream lots.*

*In some cases, if action edits are available, re-submitting the movement action that triggered the original analysis copy will also cause the copied analysis to re-calculate.*

**Q: I transferred some of Lot A into Lot B, and some of Lot B into Lot C.  I then deleted an analysis on Lot B (it had already copied into Lot C), but it is remaining on Lot C...**

*Deleting a copied analysis will not remove additional copies that have already been generated downstream.  The analysis copy is linked to the originating analysis results, not any intermediate lots.*

**Q: My lots created via a B2B within winery and B2B to another winery actions have copied analysis on them - but do not show any link to the original movement action.**

*A: These B2B actions create a snapshot of all existing Lot Composite analyses on a lot, regardless of whether it was copied or submitted, and copy it freshly into a new lot code.  There will be no linkage on the new lot code generated via a B2B action of these types.*
