---
title: "How to Record a Weight Transfer"
url: "https://support.innovint.us/hc/en-us/articles/360006664192-weight-transfer"
category: "Harvest"
section: "Harvest Workflow & Fermentation Tracking"
page_type: "article"
lastmod: "2025-11-20"
gist: "The Weight Transfer action can be used to move weight from one lot into one or multiple other lots."
tags: ["transfers", "barrels", "fermentation", "harvest", "lot-identity", "naming"]
---

# How to Record a Weight Transfer

The Weight Transfer action can be used to move weight from one lot into one or multiple other lots. This action can only be recorded as a direct action. It is not available as a work order task.

This action will only move weight. To move volume between lots, use the [Transfer action](https://support.innovint.us/hc/en-us/articles/360028194371-using-the-transfer-action?hsLang=en).

This article covers:

- [How to perform the Weight Transfer](#how)
- [FAQ](#faq)

### How to perform the Weight Transfer

1. Select the action from the Record Action dropdown in the top navigation bar
   ![How to Record a Weight Transfer-record menu](https://support.innovint.us/hs-fs/hubfs/How%20to%20Record%20a%20Weight%20Transfer-record%20menu.webp?width=264&height=239&name=How%20to%20Record%20a%20Weight%20Transfer-record%20menu.webp)
   ...or from the Lot details page
   ![How to Record a Weight Transfer-order](https://support.innovint.us/hs-fs/hubfs/How%20to%20Record%20a%20Weight%20Transfer-order.webp?width=688&height=31&name=How%20to%20Record%20a%20Weight%20Transfer-order.webp)
2. Select your "Transfer from" lot. You will only be able to transfer from a lot that is in weight.
3. Select your vessel and determine whether you would like to enter the ending fill of the vessel, or the amount to remove from the vessel
   ![](https://support.innovint.us/hs-fs/hubfs/image-png-Feb-27-2025-09-28-49-5812-PM.png?width=688&height=187&name=image-png-Feb-27-2025-09-28-49-5812-PM.png)
4. Select your "Transfer to" lot. You may:
   1. Retain lot code - to keep the volume in the same lot, but transfer to new vessels
   2. Combine with existing lot - to move the volume into another lot that already exists (this creates a new blend)
   3. Create new lot - to move the volume into a new, separate lot. If you will be tracking this weight as a unique ferment, we recommend transferring the weight in to a new, unique lot code.
5. Specify your vessels to fill, and the weight for each. Please note that you cannot take a gain or loss on this action!
   ![How to Record a Weight Transfer-weight transfer](https://support.innovint.us/hs-fs/hubfs/How%20to%20Record%20a%20Weight%20Transfer-weight%20transfer.webp?width=688&height=457&name=How%20to%20Record%20a%20Weight%20Transfer-weight%20transfer.webp)
6. Record your Weight Transfer!

### FAQ

**Q. Why can't I schedule a weight transfer in a work order?**

*A: Weight and volume adjustment actions are only available as direct actions. InnoVint does not currently support weight and volume adjustment tasks in work orders.*

*If you need to schedule a Weight Transfer in a work order we recommend using a Custom Task, and once complete and submitted to then record a Weight Transfer as a direct action.*

**Q. I'm getting an error when I try to submit a weight transfer - why?**

*A: Weight transfers do not allow a loss or gain to be taken on the action. These actions should be used to move weight around. If you need to adjust the weight of a lot, please use a [Weight Adjustment](https://support.innovint.us/hc/en-us/articles/360006618412-weight-and-volume-adjustments-for-undeclared-fruit-or-juice?hsLang=en) action.*

*![How to Record a Weight Transfer-error](https://support.innovint.us/hs-fs/hubfs/How%20to%20Record%20a%20Weight%20Transfer-error.webp?width=451&height=171&name=How%20to%20Record%20a%20Weight%20Transfer-error.webp)*
