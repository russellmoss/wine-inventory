---
title: "Bond to Bond Transfers (B2B) within your InnoVint Winery"
url: "https://support.innovint.us/hc/en-us/bond-to-bond-b2b"
category: "MAKE"
section: "Movement Actions"
page_type: "page"
lastmod: "2026-04-08"
gist: "If you would like to transfer wine to another winery in a separate InnoVint account, or outside of InnoVint, please check out this article."
tags: ["bond", "transfers", "work-orders", "barrels", "cost", "lot-identity"]
---

# Bond to Bond Transfers (B2B) within your InnoVint Winery

This article covers:

- [Bond to Bond (B2B) Transfer within winery](#B2B-within)
- [B2B Transfer (Inter-Facility)](#B2B_IV)
  - [Direct action](#action)
  - [Task](#task)

If you would like to transfer wine to another winery in a separate InnoVint account, or outside of InnoVint, please check out this [article](https://support.innovint.us/hc/en-us/articles/360018542692-bond-to-bond-transfers?hsLang=en).

Need help deciding which B2B transfer fits your situation? Check out our guide  [here](https://support.innovint.us/hc/en-us/which-b2b-action-should-i-use?hsLang=en).

### Bond to Bond (B2B) Transfer within winery

This movement is only available as a direct action, and cannot be completed via a work order task. Consider the Transfer (Inter-Facility) if you prefer to use work orders.

The **B2B transfer within the same winery** action allows users to transfer a bulk wine lot and its entire volume from one bond into another bond within the same winery account. The new destination lot will retain the original lot's composition, lot composite analysis data, volume, vessels, and cost breakdown (if COGS Tracking is activated).

The B2B Transfer within Winery action is a feature available at certain subscription levels. If you do not see the action available, please contact InnoVint Support at support@innovint.us to learn more.

- *The new lot will require a new, unique lot code.*
- *The original lot will have its entire fill removed and will subsequently be archived in the system. However, the same volume will remain in the same vessels under the new destination lot code and bond.*

You must access this action via the **Lot Details** Record Action menu - you cannot access it via the Record Action menu in the Top Navigation bar.  This is not available as a work order task, and is not available for Case Good Lots.

![Bond to Bond Transfers (B2B) within your InnoVint Winery-order](https://support.innovint.us/hs-fs/hubfs/Bond%20to%20Bond%20Transfers%20(B2B)%20within%20your%20InnoVint%20Winery-order.png?width=670&height=30&name=Bond%20to%20Bond%20Transfers%20(B2B)%20within%20your%20InnoVint%20Winery-order.png)

Transfer from

The originating lot details will be displayed at the top of the action page, and cannot be edited.  This lot will be completely depleted and archived in the originating bond; the depletion volume cannot be changed.

![Bond to Bond Transfers (B2B) within your InnoVint Winery-b2b](https://support.innovint.us/hs-fs/hubfs/Bond%20to%20Bond%20Transfers%20(B2B)%20within%20your%20InnoVint%20Winery-b2b.webp?width=454&height=217&name=Bond%20to%20Bond%20Transfers%20(B2B)%20within%20your%20InnoVint%20Winery-b2b.webp)

Transfer to/Destination Lot Information

Set and edit lot attributes on your "new" destination lot. This lot must have a unique lot code for the winery (unique to the originating lot).

1. Select the new bond from the Bond dropdown list.
2. The lot code will default to the current lot code in InnoVint. **You will need to change or edit this to a new, unique code** that does not already exist in the account. The lot *name* can remain the same, or be changed.
3. The tax class can be amended if necessary.
   1. If the tax class is changed, the volume from the original lot will be removed from the tax class of the originating lot, and report on the 5120.17 TTB Report as "Transfers in Bond." When entering the volume at the destination winery, the received volume will populate under the new tax class as "Received in Bond" on the TTB report.
4. A new lot stage can be selected from the dropdown.
5. If the Owner-Based Permissions System is activated in the account, a new owner can be selected.
6. Add or remove tags from the destination lot.
7. Any Notes on the original lot will automatically be copied to the destination lot. *The Bond to Bond transfer action and each lot will automatically gain a new Note with the transfer details: To and From, Source and Destination lot codes, and total volume.*
8. All*lot composite* analysis data will be copied to the destination lot.
   1. Analyses on individual vessels, notes on analysis actions, and source logos will not be copied.
   2. If the Bond to Bond transfer is backdated to a date prior to the effective date of an analysis action, the analysis will still be included in the transfer.
9. If the Costing feature is activated, the cost data will be copied by category. The Lot Cost History will *not* be copied (i.e. each action with potential cost implications will not be displayed.) This is a snapshot of the cost categories recorded as of the point in time the B2B transfer is entered.
   1. If the Bond to Bond transfer is backdated to a date prior to the effective date of a cost item, the cost item will still be included in the transfer.
   2. If costs are recorded on a lot after the Bond to Bond transfer is complete, but backdated and effective as of a date before the Bond the Bond transfer, the new costs will NOT be copied to the new lot. (ie Costs copied in a Bond to Bond transfer will remain unchanged.)
      ![Bond to Bond Transfers (B2B) within your InnoVint Winery-transfer to](https://support.innovint.us/hs-fs/hubfs/Bond%20to%20Bond%20Transfers%20(B2B)%20within%20your%20InnoVint%20Winery-transfer%20to.webp?width=451&height=420&name=Bond%20to%20Bond%20Transfers%20(B2B)%20within%20your%20InnoVint%20Winery-transfer%20to.webp)
10. Select an **Effective at** date and time to backdate the Bond to Bond transfer.

**WARNING**: Backdated Bond to Bond transfers within a winery are limited by dependent actions. If an action has been recorded after the desired 'effective at' date of the Bond to Bond transfer, we recommend adding a note to the action and manually adjusting the TTB report as needed for each source bond

11. Recording the Bond to Bond transfer within a winery results in 2 separate actions: a B2B transfer out from the original lot and a B2B transfer into the destination lot.

12. If you would like to **generate a Bill of Lading (BOL)** with this transfer reference [this](https://support.innovint.us/hc/en-us/articles/360055473151-how-to-create-a-bill-of-lading-bol-?hsLang=en) article.

### Bond to Bond Transfers (B2B) within your InnoVint Winery-effective date

### B2B Transfer (Inter-facility)

The **B2B Transfer (Inter-facility)** action also allows users to move volume between lots and vessels within the same winery account, between different bonds. This action is also available as a Work Order Task, and is not available for Case Good Lots.

The "Transfer to" lot will require a new, unique lot code, or an existing lot code in the receiving bond, but it will retain the original lot's composition and cost breakdown (if the COGS Tracking feature is activated).

This action allows a partial volume transfer into the new bond. You do not need to deplete the entire lot volume in the action.

The B2B Transfer (Inter-facility) action is a feature available at certain subscription levels. If you do not see the B2B Transfer (Inter-facility) action available, please contact InnoVint Support at support@innovint.us to learn more.

#### Direct Action

Transfer from

1. **Lot** - Select your lot from the dropdown or lot picker
2. **Vessels** - Select one or move vessels to remove volume from
   1. InnoVint defaults to remove the entire contents of each vessel. If you need to remove a partial volume from a vessel, adjust the value in the "Remove" or Ending Fill" columns.

Transfer to

1. **Lot** - Select a lot to transfer volume into:
   1. Retain lot code - to keep the volume in the same lot, but transfer to new vessels. **By selecting this option, you are also retaining the original bond, and no volume transfer will be recorded across bonds.**
   2. Combine with existing lot - to move the volume into another lot that already exists (this creates a new blend). This option will only record a bond transfer if you are blending into a lot in a different bond than the originating bond
   3. Create new lot - to move the volume into a new, separate lot. Ensure that you are creating the new lot in the desired bond.
2. **Vessels**  - Select one or more vessels to transfer the volume into. Adjust the "Add" or "Ending Fill" columns as needed.
3. **Save lees** - Select to save the lees to a different lot or not.
4. Double check the action summary for correctness.

   ![Bond to Bond Transfers (B2B) within your InnoVint Winery-summary](https://support.innovint.us/hs-fs/hubfs/Bond%20to%20Bond%20Transfers%20(B2B)%20within%20your%20InnoVint%20Winery-summary.webp?width=670&height=188&name=Bond%20to%20Bond%20Transfers%20(B2B)%20within%20your%20InnoVint%20Winery-summary.webp)
5. If the Costing feature is activated, the cost data will be transferred by category. This is a snapshot of the cost categories recorded as of the point in time the transfer is entered, and costs are transferred into the receiving lot(s) per InnoVint's [cost distribution rules](https://support.innovint.us/hc/en-us/cost-distribution-rules?hsLang=en#volumegainslosses).

   For the B2B Transfer (Inter-facility), if costs are recorded on a lot after the transfer across bonds is complete, but backdated and effective as of a date before the Bond the Bond transfer, the new costs will flow through into the new lot like a normal transfer.

Bonds are not displayed on the Direct Action summary prior to Action submission. **B2B** **Transfer (Inter-facility)** will display the originating and destination bonds on the Action Details pages (after action submission):

![Bond to Bond Transfers (B2B) within your InnoVint Winery-interfacility](https://support.innovint.us/hs-fs/hubfs/Bond%20to%20Bond%20Transfers%20(B2B)%20within%20your%20InnoVint%20Winery-interfacility.webp?width=670&height=337&name=Bond%20to%20Bond%20Transfers%20(B2B)%20within%20your%20InnoVint%20Winery-interfacility.webp)

If you would like to **generate a Bill of Lading (BOL)** with this transfer please find out more [here](https://support.innovint.us/hc/en-us/articles/360055473151-how-to-create-a-bill-of-lading-bol-?hsLang=en#Reportexplorer) about generating BOLs via the Report Explorer.

#### Work Order Task

When *creating* a Work Order, InnoVint will display the originating and destination bonds only in the Task Summary.

However, bonds will also display next to the lots *after* work order creation.

![Bond to Bond Transfers (B2B) within your InnoVint Winery-interfacility work order](https://support.innovint.us/hs-fs/hubfs/Bond%20to%20Bond%20Transfers%20(B2B)%20within%20your%20InnoVint%20Winery-interfacility%20work%20order.webp?width=670&height=349&name=Bond%20to%20Bond%20Transfers%20(B2B)%20within%20your%20InnoVint%20Winery-interfacility%20work%20order.webp)

B2B Transfer (Inter-Facility) tasks will also surface a Print Bill of Lading button on the top of the work order, and allow you to generate a BOL from within the work order.

![Bond to Bond Transfers (B2B) within your InnoVint Winery-to new bond](https://support.innovint.us/hs-fs/hubfs/Bond%20to%20Bond%20Transfers%20(B2B)%20within%20your%20InnoVint%20Winery-to%20new%20bond.webp?width=670&height=157&name=Bond%20to%20Bond%20Transfers%20(B2B)%20within%20your%20InnoVint%20Winery-to%20new%20bond.webp)

Work Order function is otherwise identical to a regular Transfer task.

Any losses or gains as a result of the B2B Transfer (Inter-facility) are not currently supported on the TTB 5120.17 report as Inventory Losses and Inventory Gains.

For example, when Lot A and Lot B are in different bonds:

- The volume transferred out of the "Transfer from" Lot A will populate "Transfers in Bond" on Line 15 of the TTB Report for Lot A's bond.
- The volume received on the "Transfer to" Lot B will populate "Received in Bond" on Line 7 of the TTB Report for Lot B's bond.
- Losses and Gains will not show on either TTB Report for the action.

We recommend always transferring the same volume, with no gain or loss, and adjusting volumes via a Volume Adjustment using Inventory losses or gains on the preferred bond.
