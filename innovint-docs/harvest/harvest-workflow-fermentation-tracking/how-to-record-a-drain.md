---
title: "How to Record a Drain"
url: "https://support.innovint.us/hc/en-us/how-to-record-a-drain"
category: "Harvest"
section: "Harvest Workflow & Fermentation Tracking"
page_type: "page"
lastmod: "2025-11-20"
gist: "Use the Drain action to separate free run juice from a lot before pressing."
tags: ["transfers", "work-orders", "fermentation", "harvest", "barrels", "cost"]
---

# How to Record a Drain

Use the Drain action to separate free run juice from a lot before pressing. This is especially helpful if you plan to press multiple lots together in a single [**Drain & Press** action](https://support.innovint.us/hc/en-us/articles/205552639-drain-and-press?hsLang=en) but want to track the free run juice separately from the press fractions.

The Drain action allows you to preserve the individual composition of the free run before combining the remaining lots for pressing. A Drain can be recorded as a direct action or scheduled as task in a work order.

This article covers:

- [How to Record a Drain action/task](#record-drain)
- [Changes to Expected Yield](#expected-yield)
- [Costing and Composition Implications](#costing-comp-calc-additives)
- [Frequently Asked Questions](#FAQ)

### How to Record a Drain action/task

1. **Select the lot you'd like to drain from the Lot Picker.**
   1. Only lots in weight will display for direct actions
   2. Lots in weight and empty lots will display when creating a work order
2. **Select or create a destination lot, choose your vessel(s), and enter the volume added.**
   1. You can choose to Retain the lot code, Combine with an existing lot (in volume) or Create a new lot
   2. You may request either the ending fill, or an amount to add to each selected vessel
3. **Review the Summary section. Backdate if necessary, then click "Record Drain".**
   1. Note that the Summary will display the estimated volume of the lot using the lot's estimated yield.
   2. Once the drain is recorded, the action will display the updated estimated volume for the *remaining portion of the lot in weight* using the updated expected yield for the lot.![Support Center_Drain Action_Annotated](https://support.innovint.us/hs-fs/hubfs/Support%20Center_Drain%20Action_Annotated.png?width=688&height=360&name=Support%20Center_Drain%20Action_Annotated.png)

### Changes to Expected Yield

A Drain action will adjust your expected yield for that lot in the lot detail's page.

#### EXAMPLE

- A lot with a fill of 10 tons and an expected yield of 150gal/ton has an expected volume of 1500gal.
- 1200gal of free run are drained from the lot in the Drain action.
- The expected volume of the remaining tonnage is now 300gal, and the expected yield is now calculated at 30gal/ton.

![Support Center_Drain_Expected Yield Before_Annotated](https://support.innovint.us/hs-fs/hubfs/Support%20Center_Drain_Expected%20Yield%20Before_Annotated.png?width=343&height=277&name=Support%20Center_Drain_Expected%20Yield%20Before_Annotated.png)![Support Center_Drain_Expected Yield After_Annotated](https://support.innovint.us/hs-fs/hubfs/Support%20Center_Drain_Expected%20Yield%20After_Annotated.png?width=343&height=278&name=Support%20Center_Drain_Expected%20Yield%20After_Annotated.png)

### **Costing and Composition Implications**

**Composition**

The composition of the fill lot will reflect the composition of the drained lot. This allows you to retain the unique composition of the free run of a lot, even if you want to combine the skins for pressing with many other lots. If you are draining into an existing lot, the composition will update proportionally.

**Cost**

Cost will be distributed proportionately based on the **weight drained** and then the **volume filled** once the lot is no longer recorded in weight.

Cost calculations will be finalized once the entire lot is in volume and is no longer in weight.

### FAQ

#### Q. Can I drain from only 1 tank if my lot is split into multiple tanks?

*A: Yes... **BUT!** InnoVint will record the action as having happened on the entire lot (for yield, cost and compositional purposes). If you want to treat one vessel separately, we recommend transferring the contents of that vessel into a unique lot; this can happen at the very beginning (when processing the lot into weight) or via [a weight transfer](https://support.innovint.us/hc/en-us/articles/360006664192-weight-transfer?hsLang=en) at a later point in time. Then you will be able to drain them separately.*

#### Q. If I drain from a lot, will that affect my addition rates and calculations?

*Yes, the drain action will adjust the expected yield of that lot, therefore adjusting the addition rates per ton. These changes will only take effect after a drain action has been recorded or the work order submitted. (Remember, a completed work order is NOT a submitted work order!)*

*After a drain action has been recorded, you can also manually adjust the expected yield of the lot from the lot details page.*
