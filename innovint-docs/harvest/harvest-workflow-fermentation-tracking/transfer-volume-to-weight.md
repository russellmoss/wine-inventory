---
title: "Transfer Volume to Weight"
url: "https://support.innovint.us/hc/en-us/transfer-volume-to-weight"
category: "Harvest"
section: "Harvest Workflow & Fermentation Tracking"
page_type: "page"
lastmod: "2026-01-15"
gist: "During harvest, winemakers often need to add volume to a lot in weight."
tags: ["fermentation", "transfers", "harvest", "barrels", "reporting", "ttb"]
---

# Transfer Volume to Weight

During harvest, winemakers often need to add volume to a lot in weight. Reasons may include:  adding concentrate to fermenting must lots, adding pressed wine back into another fermenting must tank, or using fermenting or pressed juice or wine to inoculate must.

The **Transfer Volume to Weight** action (and task) is designed to allow you to transfer volume from a lot into one or many lots tracked in weight.  This action removes volume from the drained lot and increases the *expected yield/volume* in the filled lot(s) proportional to the added volume. This allows you to allocate composition as expected, and to easily utilize our additive calculator (or allocate press tanks!) for your lots in weight.

This article covers:

- [Things to know](#thing)
- [Transfer Volume to Weight via Direct Action](#direct_action)
- [Transfer Volume to Weight via Work Order](#work_order)
- [How does this report on my TTB Report?](#TTB)
- [FAQ](#FAQ)

#### Things to know

- *The weight on the filled lot will never change.* If you are adding 100 gallons to a 5 ton red fermenting lot, that lot's weight will remain as 5 tons.
- Expected yield is calculated at the *lot level* and takes into account all vessels in a lot, even those not included in the action.  The expected yield, times the lot weight, provides the expected volume.
- Composition on the fill lot will update based on the amount of volume added compared to the expected volume in the lot prior to the action

#### Transfer Volume to Weight via Direct Action

1. Select a lot in volume for the drain lot. You will only be able to select lots in volume.

- Enter the volume to remove from the lot/vessel. The lot vessel summary will show the change in volume for the action.
  ![Transfer Volume to Weight-direct action](https://support.innovint.us/hs-fs/hubfs/Transfer%20Volume%20to%20Weight-direct%20action.webp?width=670&height=271&name=Transfer%20Volume%20to%20Weight-direct%20action.webp)

2. Select an *existing* lot in weight for the "Transfer to" lot. In a direct action, you may only select "Combine with existing lot."

- The selected lot must contain weight (it cannot be empty).
- The selected lot must also have an expected yield set in order to complete the action.
- Enter the volume to add to the lot in weight.
- You'll see the lot vessel summary update! The lot vessel summary will show the change in weight (always no change) and the change in expected yield due to the volume added.
  ![Transfer Volume to Weight-transfer to](https://support.innovint.us/hs-fs/hubfs/Transfer%20Volume%20to%20Weight-transfer%20to.webp?width=670&height=249&name=Transfer%20Volume%20to%20Weight-transfer%20to.webp)

3.  In the yellow final summary section, you'll see the change in expected yield (for each filled lot) as well as the change in expected volume (for each filled lot).

![Transfer Volume to Weight-summary](https://support.innovint.us/hs-fs/hubfs/Transfer%20Volume%20to%20Weight-summary.webp?width=670&height=70&name=Transfer%20Volume%20to%20Weight-summary.webp)

4. Like most other actions, you will have the ability to archive lots that will have no contents and backdate the action.

Notes on the filled lot:

- The lot must contain weight (it cannot be empty)
- The lot must have an expected yield set in order to complete the action, or you will get an error. Set the expected yield via the [Lot details page](https://support.innovint.us/hc/en-us/community/posts/360014610111-how-to-adjust-the-expected-yield-of-a-lot?hsLang=en).

  ![Transfer Volume to Weight-error](https://support.innovint.us/hs-fs/hubfs/Transfer%20Volume%20to%20Weight-error.webp?width=157&height=32&name=Transfer%20Volume%20to%20Weight-error.webp)
- If no expected yield is set on the lot, the user must set it in the Lot details page before completing the action or submitting the task

#### Transfer Volume to Weight via Work Order

1. Select a lot in volume for the drain lot. You will be able to select either empty lots, or lots in volume.

2. Select a lot for the "Transfer to" lot. In a work order, you may select "Combine with existing lot" or "Create new lot," and may select any lots with weight or lots without contents.

- The lot does not need to contain weight (it may be empty) or have an expected yield set at work order creation or in an open work order **but it must have weight and expected yield at task submission.**

![Transfer Volume to Weight-action](https://support.innovint.us/hs-fs/hubfs/Transfer%20Volume%20to%20Weight-action.webp?width=670&height=433&name=Transfer%20Volume%20to%20Weight-action.webp)

3.  In the yellow final summary section, you'll see the change in expected yield (for each filled lot) as well as the change in expected volume (for each selected filled lot).

![Transfer Volume to Weight-action2](https://support.innovint.us/hs-fs/hubfs/Transfer%20Volume%20to%20Weight-action2.webp?width=670&height=431&name=Transfer%20Volume%20to%20Weight-action2.webp)

3.  Create work order per your normal procedures.  Please note that this task is not supported yet by InnoApp or our Summarized Work Order print version (use the basic browser print).

The filled lot(s) does not need to contain weight (it may be empty) or have an expected yield set at work order creation or in an open work order **but it must have weight and expected yield at task submission.**

#### How does this show on my TTB Report?

1. *Declared wine to Fermenting Juice tax class:*

If a declared wine in volume is added to a lot in weight in the "fermenting juice" tax class, then the declared wine's drained volume will display in Part I, Section A, Line 25 (Returned to fermenters) in the column for the appropriate tax class of the declared wine.

No volume change will display in Part VII, Line 1 (In fermenters (estimated quantity of liquid)) as part of your estimated on-hand volume.

*2. Fermenting Juice to Fermenting Juice tax class:*

If a lot in volume in the 'Fermenting Juice' tax class is added to a lot in weight in the 'Fermenting Juice' tax class, the drained volume will be removed from Part VII, Line 1 (In fermenters (estimated quantity of liquid)).  You will also see this volume removed via the [TTB Audit Report](https://support.innovint.us/hc/en-us/understanding-the-ttb-audit-report?hsLang=en).

Lots tracked in weight in the 'Fermenting Juice' tax class are estimated at 150 gal/ton for Part VII.  When using the Transfer Weight to Volume action, no additional volume will be added to the lot in weight for the purposes of estimating the on-hand volume.

#### FAQ

**Q: How is the new expected yield calculated?**

*A: We first calculate the updated expected volume. Updated expected volume = (Original expected volume from expected yield) + (added volume in the action)*
*Next, we calculate the updated expected yield. Updated expected yield = (Updated expected volume) / tonnage in the lot.*

*Example:*
*Start*
*Starting weight in fill tank: 10 tons*
*Starting expected yield: 150 gal/ton*
*Starting expected volume: 1500 gal*

*Transfer Volume to Weight Action:*
*Add 100 gallons of juice (added volume)*

*End*
*Ending weight in fill tank: 10 tons (unchanged)*

*Ending expected volume: 1600 gal (1500 + 100)*

*Ending expected yield: 160 gal/ton (1600 gal/10 tons)*

**Q: How is the new composition calculated?**

*A: [(Composition A)\*Drained volume + (Composition B)\*starting expected volume] / Ending expected volume*

*![Transfer Volume to Weight-ex](https://support.innovint.us/hs-fs/hubfs/Transfer%20Volume%20to%20Weight-ex.webp?width=670&height=318&name=Transfer%20Volume%20to%20Weight-ex.webp)*

**Q: Why is this task not displaying on my printed work order?**

*A: The "Summarized view" work order print options are not supported yet and will read "Transfer Volume to Weight is not supported yet" in place of the task on a printed work order.  However, the basic browser print version will render the task correctly.*

**Q: This doesn't work for me! I'd rather not track the composition change...**

*Check out our alternate workflows in this [support article](https://support.innovint.us/hc/en-us/how-can-i-combine-bleed?hsLang=en).*
