---
title: "Drain and Press"
url: "https://support.innovint.us/hc/en-us/articles/205552639-drain-and-press"
category: "Harvest"
section: "Harvest Workflow & Fermentation Tracking"
page_type: "article"
lastmod: "2025-11-20"
gist: "The Drain and Press action is the final step in moving your lots on skins (tracked in weight) to lots tracked in volume."
tags: ["transfers", "barrels", "work-orders", "fermentation", "harvest", "blending"]
---

# Drain and Press

The Drain and Press action is the final step in moving your lots on skins (tracked in weight) to lots tracked in volume. A Drain and Press can be recorded for one or multiple lots, and can be used to separate or combine your free run and press fractions or press together multiple lots that have already been drained.

A Drain and Press can be recorded as a direct action or scheduled as task in a work order.

This article covers:

- [Recording a Drain and Press action](#directaction)
- [Multi-lot Drain and Press](#multi-lot)
- [Costing and Composition Implications](#implications)
- [FAQ](#faqs)

### How to Record a Drain and Press (Direct Action or Work Order)

You can record a **Drain and Press** using either a direct action or a work order task. The process is largely the same for both actions and tasks, with a few differences noted below.

#### 1. Select Lot(s) to Drain

You can includemultiple lots by clicking **+Add lot**, or by selecting multiple lots in the picker. *InnoVint assumes that all weight drained and pressed within a single action is homogenized (the composition is blended) in the press before allocation to the fill volumes.  Learn more about using multiple lots in a drain and press action [here](#multi-lot).*

![D&P_Add Lots](https://support.innovint.us/hs-fs/hubfs/D%26P_Add%20Lots.png?width=688&height=246&name=D%26P_Add%20Lots.png)

#### 2. Select Vessels to Drain

- Select vessels for the lot(s): try checking the "All vessels" box, using the "Select all / Clear all vessels" option, or by using the "Edit vessel" selector for each lot.
- Click **Show/hide vessels list** to view involved vessels and their starting/ending fills.
- You **must drain the full weight from any vessel you select**, but not all vessels in a lot need to be included.

  ![D&P select vessels](https://support.innovint.us/hs-fs/hubfs/D%26P%20select%20vessels.png?width=688&height=329&name=D%26P%20select%20vessels.png)

#### 3. Choose How to Handle the Free Run and Press Fraction(s)

In the Press section, you have three options: "[Separate free run and press fractions](#separate)", "[Combine free run and press fractions](#combine)" and "[Press only](#press-only)".

**a) Separate Free Run and Press Fractions**

This is the best option if you want to track free run and press juice separately.

Please note that if you are draining multiple lots, the compositions for both the free run and press lots are calculated proportionally to *all* involved lots.  If you want to keep free run lot compositions separate, use the [Drain action/task](https://support.innovint.us/hc/en-us/how-to-record-a-drain?hsLang=en) to separate the free run prior to using the [Drain & Press action/task to press multiple lots together](#multi-lot).

**Free Run**

- (Optional) Add instructions - *work order task only*.
- Select the Free Run lot.
- Choose vessels to fill and request filled volume:

  - **Direct action**: Select vessels and fill in actual volumes.
  - **Work order**: You can either:

    - Allow cellar staff to choose vessels, or
    - Select specific vessels and enter expected added or ending volumes.

![Support Center_D&P_Seperate FR&PR_FR_Annotated](https://support.innovint.us/hs-fs/hubfs/Support%20Center_D%26P_Seperate%20FR%26PR_FR_Annotated.png?width=688&height=282&name=Support%20Center_D%26P_Seperate%20FR%26PR_FR_Annotated.png)

**Press**

- (Optional) AddPress instructions.
- (Optional) Add Press fractions details and any additional instructions
- Select the lot to press into (this must be different from the lot selected for Free Run).
- Choose vessels and enter volume:

  - **Direct action**: Select vessels and input volumes.
  - **Work order**: Choose whether cellar staff selects vessels, or select specific vessels and enter expected added or ending volumes.
- Click **+Add fraction** to add more press fractions.

  ![Support Center_D&P_Seperate FR&PR_PRESS_Annotated](https://support.innovint.us/hs-fs/hubfs/Support%20Center_D%26P_Seperate%20FR%26PR_PRESS_Annotated.png?width=688&height=293&name=Support%20Center_D%26P_Seperate%20FR%26PR_PRESS_Annotated.png)

✅ Ayield summary by fraction will appear in the bottom task summary.

---

**b) Combine Free Run and Press Fractions**

This option combines all volume into one lot. You cannot add a lot for a press cut.

- (Optional) Add press instructions.
- (Optional) Add Press fractions details - work order task only
- Select a single destination lot.
- Choose vessels and enter volumes:

  - **Direct action**: Select vessels and enter volumes.
  - **Work order**: Choose whether cellar staff selects vessels, or select specific vessels and enter expected added or ending volumes.

![Support Center_D&P_Combined FR&PR_Annotated](https://support.innovint.us/hs-fs/hubfs/Support%20Center_D%26P_Combined%20FR%26PR_Annotated.png?width=688&height=325&name=Support%20Center_D%26P_Combined%20FR%26PR_Annotated.png)

---

**c) Press Only (after a separate Drain action)**

Use this option if you’ve already drained free run using a [Drain action/task](https://support.innovint.us/hc/en-us/how-to-record-a-drain?hsLang=en) and only want to press the remaining lot(s).

- (Optional) Add Press instructions.
- (Optional) Add Press fractions details and any additional instructions
- Select the lot to press into.
- Choose vessels and enter volumes:

  - **Direct action**: Select vessels and enter volumes.
  - **Work order**: Choose whether cellar staff selects vessels, or select specific vessels and enter expected added or ending volumes.
  - Click **+Add fraction** to add more press fractions.

![Support Center_D&P_Press only_Annotated](https://support.innovint.us/hs-fs/hubfs/Support%20Center_D%26P_Press%20only_Annotated.png?width=688&height=356&name=Support%20Center_D%26P_Press%20only_Annotated.png)

✅ Ayield summary by fraction will appear in the bottom task summary.

---

### Multi-lot Drain & Press

InnoVint assumes that all weight drained and pressed within a single Drain and Press action is homogenized (the composition blended) in the press before allocation to the fill volumes. With this in mind - we recommend two distinct workflows to preserve your desired lot composition outcomes.

#### Workflow #1

*You want to drain and maintain distinct free run lots, but want to press all of the remaining skins together in one press load. Each free run lot should reflect the distinct pre-pressing composition, but the pressed wine should be a blended composition.*

Step 1) Use the new [Drain action/task](https://support.innovint.us/hc/en-us/how-to-record-a-drain?hsLang=en) to individually drain each lot into a free run tank. This action will remove volume and adjust the estimated yield on the lot, but not impact the weight in the lot. Use one Drain action per lot.

![Screenshot 2025-07-16 at 3.53.38 PM](https://support.innovint.us/hs-fs/hubfs/Screenshot%202025-07-16%20at%203.53.38%20PM.png?width=688&height=484&name=Screenshot%202025-07-16%20at%203.53.38%20PM.png)

Step 2) Set up the Drain and Press action/task to include all of the drained lots that you now want to combine in the press.  Select the "Press only" option.

![Screenshot 2025-07-16 at 3.49.40 PM](https://support.innovint.us/hs-fs/hubfs/Screenshot%202025-07-16%20at%203.49.40%20PM.png?width=688&height=340&name=Screenshot%202025-07-16%20at%203.49.40%20PM.png)

If you've already separated the free run from the drained lot, you will most likely want to select either "Combine with existing lot" or "Create new lot" for the pressed lot. This pressed lot will blend the composition of all drained lots.

#### Workflow #2

*You have many small lots/vessels that need to be pressed together in order to get a large enough load to fill the press. These lots are from the same vineyard, or should be blended together.*

There's only one step!  Set up the Drain and Press action/task to include all of the lots. Decide whether you will separate the Free Run from the pressings, or not.  ALL filled lots - both free run and press fractions - from the action will have the same composition (proportional to the weight of the drained lots).

### Costing and Composition Implications

**Composition**

Where a single lot is drained, the composition of the fill lot(s) will reflect the composition of the drained lot.  If you are draining & pressing into an existing lot, the composition will update proportionally.

Where multiple lots are drained and pressed (or only pressed), the lot compositions will be blended, and calculated in proportion to the involved lot weights.

**Cost**

Cost will be distributed proportionately based on the **weight drained,** and then the **volume filled** once the lot(s) is no longer recorded in weight.

Cost calculations will be finalized once the entire lot is in volume and is no longer in weight.

### FAQ

**Q: Why am I getting this error message when I select my drain vessel(s)?

![Drain and Press-error](https://support.innovint.us/hs-fs/hubfs/Drain%20and%20Press-error.webp?width=521&height=136&name=Drain%20and%20Press-error.webp)**

*A. The Drain and Press action is designed to transition lots tracked on skins (must) from being tracked in weight to being tracked in volume. It assumes that you are pressing off of skins. If you previously recorded a Process Fruit to Volume (instead of a Process Fruit to Weight) action on this lot, then you will not be able to use the Drain and Press action, as the lot has already been "pressed" in InnoVint.

Instead, use a Transfer action. Transfer allows you move volume out of the current vessel and into the new destination vessel. It also allows you to transfer into one or more lots. Use the +Add lot option to add "press cuts" to the action.
![Drain and Press-add lot](https://support.innovint.us/hs-fs/hubfs/Drain%20and%20Press-add%20lot.webp?width=688&height=56&name=Drain%20and%20Press-add%20lot.webp)*

*Optional: In addition to a Transfer, you may also record a Custom Action. Edit the title of the action to say "Drain and Press." This way, when you look back on your lot history, you will see "Drain and Press" and can quickly identify what date that action occurred. Another tip is to link to the Transfer action in the action notes to tie it all together.*
