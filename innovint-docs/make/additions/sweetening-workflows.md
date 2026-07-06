---
title: "Sweetening Workflows"
url: "https://support.innovint.us/hc/en-us/sweetening"
category: "MAKE"
section: "Additions"
page_type: "page"
lastmod: "2025-11-20"
gist: "This article discusses three different workflows to add sweetening material (sugar, concentrate or sweetening juice) to declared wine:."
tags: ["additives", "reporting", "inventory", "ttb", "ux-friction", "corrections"]
---

# Sweetening Workflows

This article discusses three different workflows to add sweetening material (sugar, concentrate or sweetening juice) to declared wine:

This article covers:

- [Workflow #1. Sweeten via Volume Adjustment](#vol_adj): populate your TTB report - do not affect lot composition
- [Workflow #2. Sweeten via Concentrate transfer](#conc): populate your TTB report - update lot composition
- [Workflow #3. Add sugar or concentrate via an addition action](#sugar)
- [FAQ](#faq)

To add sugar or concentrate to juice or must in order to increase potential alcohol, please see our article on [Chaptalization](https://support.innovint.us/hc/en-us/articles/360021173511-chaptalization?hsLang=en). If you would like to fortify or ameliorate your wine, see this [article](https://support.innovint.us/hc/en-us/articles/360018226292-fortification-sweetening-and-amelioration?hsLang=en) instead.

**Note:** Wine, juice or concentrate must be in the correct **declared** tax class to populate the TTB report correctly. Lots still under the Fermenting Juice class will only affect Part VII of the report.

### 1. Sweeten via Volume Adjustment

This workflow can be used to record the addition of concentrate, juice, or sugar for sweetening.  It supports multiple types of sweeteners and ensures that Part I of the TTB Report is populated for your declared wines as Used for/Produced by Sweetening.

This method does not update the sweetener as part of your wine composition

1. Record a Volume Adjustment to remove the volume from the wine lot.
   ![Sweetening_1Step1](https://support.innovint.us/hs-fs/hubfs/Sweetening_1Step1.webp?width=688&height=31&name=Sweetening_1Step1.webp)
   ![Sweetening_Step1](https://support.innovint.us/hs-fs/hubfs/Sweetening_Step1.webp?width=688&height=363&name=Sweetening_Step1.webp)
2. Uncheck the box for archiving. You will need this lot to be active for Step 4.
3. Record a Volume Adjustment to remove the added volume from the juice or concentrate lot. For this volume adjustment to properly populate Part IV (column c or d for sweetening juice or concentrate), the lot must be in the appropriate tax class at the time of volume adjustment, either "Sweetening Juice" or "Concentrate." (Skip this step if you are adding sugar to your wine).
   ![Sweetening_1Step1](https://support.innovint.us/hs-fs/hubfs/Sweetening_1Step1.webp?width=688&height=31&name=Sweetening_1Step1.webp)
   ![Sweetening_Step2](https://support.innovint.us/hs-fs/hubfs/Sweetening_Step2.webp?width=688&height=396&name=Sweetening_Step2.webp)
4. Record a Volume Adjustment to the original juice/wine lot and add the total ending  volume after sweetening
   ![Sweetening_1Step1](https://support.innovint.us/hs-fs/hubfs/Sweetening_1Step1.webp?width=688&height=31&name=Sweetening_1Step1.webp)
   ![Sweetening_Step3](https://support.innovint.us/hs-fs/hubfs/Sweetening_Step3.webp?width=688&height=396&name=Sweetening_Step3.webp)

If done correctly, the value shown in Part IV, column d or c, line 5 (Used in wine production) + Part 1, Section A, line 18 (Used for sweetening) will equal the value shown in Part 1, Section A, line 3 (Produced by sweetening).

Any volume adjustment that completely empties a lot will also completely remove the additives within that lot. This workflow will impact the  [Calculated Additives](https://support.innovint.us/hc/en-us/calculated-additives?hsLang=en) on the juice/wine lot. You will be able to access them via the Removed Additives export for the volume adjustment, and can re-enter them via an Addition action *making sure to update Amount Removed to 0 on the addition*.

Alternately, you may want to consider alternate sweetening workflows.

### 2. Sweeten via Concentrate transfer

You can easily perform sweetening actions when you track concentrate as juice/wine lot, which will also include concentrate (or any sweetening material with the Tax Class *Concentrate*) as part of your wine composition.

First - create a concentrate lot:

1. Create a new juice/wine lot for your concentrate and set the tax class to: "Concentrate". For unknown vineyard/concentrate sources, we recommend setting up a BULK vineyard. Get more details [here](https://support.innovint.us/hc/en-us/articles/209847713-how-do-i-add-wine-or-concentrate-that-was-transferred-to-my-facility-?hsLang=en).
2. Record a Bond to Bond transfer to bring the volume into your bond. This will populate in Part IV (column d) Line 2 "Received."

Next - use a **Transfer** action or task to add the desired concentrate volume to your declared wine.

- The juice/wine lot will show an updated calculated composition that includes the concentrate component.
- The TTB Report will show the starting volume of the wine on Part 1, Section A, Line 18 "Used for Sweetening", and the final volume of wine that had sweetening materials added to it on Part 1, Section A, Line 3 "Produced by Sweetening".
- Concentrate depleted into declared juice/wine lots will be removed from Part IV as "Used in wine production."
- If you are tracking concentrate cost on the lot, the cost will transfer proportionally to the volume.

Please note that this transaction is not supported in the TTB Audit Report. We recommend auditing these transactions using the Winery Activity Feed, sorting by transaction and tax class.

This transaction is not supported for lots in the "Sweetening Juice" tax class. Use the [Volume Adjustment](#vol_adj) workflow.

### 3. Add sugar or concentrate via an addition action

You may consider tracking sugar or concentrate as an additive (via the Dry Goods Explorer).  This process is used in conjunction with the volume adjustment workflow above, and will not cause the additive to report as part of the lot composition.

To sweeten with sugar as an additive:

- [Create Additive](https://support.innovint.us/hc/en-us/articles/115000825066-how-to-create-additives-and-additive-batches?hsLang=en) for the weight/volume of sugar you currently have in inventory.
- Follow the Volume Adjustment workflow Steps 1 and 2 above. Skip Step 3.
- PerformStep 4, adjusting the volume in the final sweetened juice/wine lot
- Record an addition action to add the sugar to your lot
  - The sugar inventory would be managed through the Dry Goods feature, and will be depleted via the addition action. This process will not populate in Part IV of the TTB Report, but you can use the dry goods inventory to manually update Part IV (column h or i) for each period.
- Consider adding [direct cost](https://support.innovint.us/hc/en-us/articles/assigning-costs-to-drygoods-batches?hsLang=en) to the sugar in the Receive Dry Good action in order to track costs.

To sweeten with concentrate as an additive:

- Create Additive for the volume of concentrate you currently have in inventory.
- Follow the Volume Adjustment workflow Steps 1 and 2 above. Skip Step 3.
- PerformStep 4, adjusting the volume in the final sweetened juice/wine lot.
- Record an addition action to add the concentrate to your lot.
  - The concentrate inventory would be managed through the Dry Goods feature, and will be depleted via the addition action. This process will not populate in Part IV of the TTB Report, but you can use the dry goods inventory to manually update Part IV (column d)
- Consider adding [direct cost](https://support.innovint.us/hc/en-us/articles/assigning-costs-to-drygoods-batches?hsLang=en) to the concentrate in the Receive Dry Good action in order to track costs.

### FAQ

#### **Q: How do I add a fruit concentrate to wine?**

*A: Adding a fruit concentrate to a wine works similarly to [adding grape concentrate](#conc) to wine. Be sure to create your concentrate lot with the appropriate composition to reflect the fruit. You can also consider treating a [fruit juice concentrate as an additive](#sugar), depending on the quantities, and your desire to have it reported as an ingredient, vs a part of composition.*

#### **Q: I blended concentrate into my wine lot and the TTB Report doesn't look right!**

*A: Adding concentrate to declared wines will report on Part 1, Lines 3 and 18, when it is added to a declared wine lot via a **Transfer** action. At this point in time, using concentrate tax class lots will not report on the 5120.17 Report as expected if they are a component in a **Blend** action.*
