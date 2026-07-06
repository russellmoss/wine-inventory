---
title: "Bleed/Saignée"
url: "https://support.innovint.us/hc/en-us/articles/204651979-juice-bleed-saign%C3%A9e"
category: "Harvest"
section: "Harvest Workflow & Fermentation Tracking"
page_type: "article"
lastmod: "2025-11-20"
gist: "After processing a fruit lot to weight, a juice bleed (saignée) can be recorded on a wine/juice lot."
tags: ["harvest", "additives", "fermentation", "work-orders", "barrels", "transfers"]
---

# Bleed/Saignée

After processing a fruit lot to weight, a juice bleed (saignée) can be recorded on a wine/juice lot. Recording a bleed automatically updates the **expected yield** for that lot.

This article covers:

1. [Bleed/Saignée Direct Action](#directaction)
2. [Bleed/Saignée via Work Order](#workorder)
3. [Changes to Expected Yield](#expectedyield)
4. [Frequently Asked Questions](#faqs)

### Direct Action

1. From the Record Action menu (in either the Top Nav bar, or the Lot details page), select Bleed/Saignée action.
2. Select the source lot to drain
   1. Review the expected yield from the drained lot. Note: changing this field will impact the distributed calculated additives in the new bleed lot, but will not change the expected yield on the lot in weight
3. Select or create a destination lot, choose your vessel(s), and enter the volume added
4. Review the summary, then click Record button

![Bleed-saignee direct](https://support.innovint.us/hs-fs/hubfs/Bleed-saignee%20direct.png?width=688&height=500&name=Bleed-saignee%20direct.png)

The expected yield field on this action is only used to distribute and calculate additives from the lot in weight to the lot in volume. Changing this field will impact the distributed calculated additives in the new bleed lot, but will not change the expected yield on the lot in weight. Find about how the action impacts the yield for the lot in weight [here](#expectedyield).

### Work Order

1. Add the Bleed/Saignée task to your work order
2. Select your source lot (must be in weight)
   1. Review the expected yield from the drained lot. Note: changing this field will impact the distributed calculated additives in the new bleed lot, but will not change the expected yield on the lot in weight
3. Enter the volume of juice to bleed (i.e. remove from the lot)
4. Select or create your destination lot, choose your vessel(s) and enter the requested volume change for the vessel(s)

![Bleed-saignee-WO](https://support.innovint.us/hs-fs/hubfs/Bleed-saignee-WO.png?width=688&height=359&name=Bleed-saignee-WO.png)

The expected yield field on this action is only used to distribute and calculate additives from the lot in weight to the lot in volume. Changing this field will impact the distributed calculated additives into the new bleed lot, but will not change the expected yield on the lot in weight. Find about how the action impacts the yield for the lot in weight [here](#expectedyield).

### Changes to Expected Yield

Recording a juice bleed/saignée will **reduce the expected yield** of the drained lot. The expected yield of lots in weight is used for calculating additions in Addition actions.

![BleedSaignée-yield](https://support.innovint.us/hs-fs/hubfs/BleedSaign%C3%A9e-yield.webp?width=387&height=245&name=BleedSaign%C3%A9e-yield.webp)

**Tip:** If you do **not** want the expected yield on the drained lot to update automatically:

1. Use a [Custom Action/Task](https://support.innovint.us/hc/en-us/articles/204848455-using-a-custom-action-or-custom-task?hsLang=en) to record/request the action and then
2. (optional) Manually adjust the lot’s expected yield from the **Lot Details** page.

![BleedSaignée-edit yield](https://support.innovint.us/hs-fs/hubfs/BleedSaign%C3%A9e-edit%20yield.webp?width=688&height=324&name=BleedSaign%C3%A9e-edit%20yield.webp)

Check out [this article](https://support.innovint.us/hc/en-us/tip-tuesday-how-to-discard-a-juice-bleed?hsLang=en)  for another option to discard juice bleeds.

### FAQ

#### Q. Can I saignée from only 1 tank if my lot is split into multiple tanks?

*Yes... BUT! InnoVint will record the action as having happened on the entire lot. This is because we assume all vessels in a lot will be drained and pressed together.*

*If you plan to keep the vessels as separate lots after primary fermentation, our recommendation is to maintain the contents of each vessel as different lots from the very beginning. If you want to "[split the lot](https://support.innovint.us/hc/en-us/how-to-split-a-lot?hsLang=en)" after it is already processed, you can record a Weight Transfer action into a phantom vessel with a new lot code, then record a Weight Transfer action back to the original vessel retaining the new lot code. Then you will be able to saignée them separately.*

#### Q. If I bleed/saignée from a lot, will that affect my addition rates and calculations?

*Yes, the Bleed/Saignée action will adjust the expected yield of that lot, therefore adjusting the addition rates per ton. These changes will only take effect after the action has been recorded or the work order submitted. (Remember, a completed work order is NOT a submitted work order!)*

*After a Bleed/Saignée action has been recorded, you can also manually adjust the expected yield of the lot from the lot details page.*

![BleedSaignée-edit](https://support.innovint.us/hs-fs/hubfs/BleedSaign%C3%A9e-edit.webp?width=368&height=358&name=BleedSaign%C3%A9e-edit.webp)
