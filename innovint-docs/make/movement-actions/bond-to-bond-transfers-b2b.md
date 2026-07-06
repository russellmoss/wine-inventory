---
title: "Bond to Bond Transfers (B2B)"
url: "https://support.innovint.us/hc/en-us/articles/360018542692-bond-to-bond-transfers"
category: "MAKE"
section: "Movement Actions"
page_type: "article"
lastmod: "2025-11-20"
gist: "InnoVint provides different options for receiving or transferring inventory into or out of bond."
tags: ["bond", "transfers", "work-orders", "permissions", "configuration", "getting-started"]
---

# Bond to Bond Transfers (B2B)

InnoVint provides different options for receiving or transferring inventory into or out of bond. All types of Bond to Bond (B2B) transfers can be recorded as direct actions on any juice/wine lot in the system. B2B transfers are not supported for fruit lots. Case good lots also require specific B2B Transfer actions.

B2B Transfer In and B2B Transfer Out actions can also be requested and recorded on juice/wine lots via work orders.

This article covers:

- [B2B Transfer In](#transfer-in)
- [B2B Transfer Out](#TransferOut)
- [B2B to another InnoVint Winery](#B2B_IV)
  - [Step 1: Transfer Out](#B2BStep1)
  - [Step 2: Transfer In](#B2BStep2)

Check out [THIS](https://support.innovint.us/hc/en-us/bond-to-bond-b2b?hsLang=en) article to find out about bond transfers that take place *within* your InnoVint winery account.

Need help deciding which B2B transfer fits your situation? Check out our guide [HERE](https://support.innovint.us/hc/en-us/which-b2b-action-should-i-use?hsLang=en).

### Bond to Bond Transfer In or Out

The **B2B Transfer In** and **B2B Transfer Out** actions allow users to receive or transfer volume into or out of bond, to or from a non-InnoVint facility. These actions are available to Admin, Team Member, and Team Member Cannot Submit Work Order capability levels as either a direct action or as a work order task.

#### B2B Transfer In

1. (**optional**) Add any notes. We recommend including information such as the originating winery, bond number, and/or address if you are not utilizing our [Shipping Locations](https://support.innovint.us/hc/en-us/locations?hsLang=en).
2. If receiving this wine for the first time you will need to [create a new lot](https://support.innovint.us/hc/en-us/articles/204106579-step-3-enter-your-current-wine-lots-into-the-system?hsLang=en) **before** starting the action (or creating the work order task), because you must select an existing lot code in the action or task.
   1. Please note that to receive case goods, you will need to access the case good specific **B2B Transfer In *(Case Goods)*** action via the *Case Goods Lot Details page*.
      ![B2B-case good](https://support.innovint.us/hs-fs/hubfs/B2B-case%20good.webp?width=142&height=195&name=B2B-case%20good.webp)
      This is **not** the same action as the B2B Transfer In action for bulk wines, and is not available as a work order task. If receiving case goods, you will enter the number of pallets, cases, and bottles received in the action.
3. The reason field is pre-set as 'Received in Bond' in order to properly report on the TTB 5120.17. The B2B Transfer In action will add the volume to the lot's current tax class on your TTB report:
   - Declared wine will report as *Received in Bond,*Part I, Section A, Line 7.
   - Case Goods will report as *Received in Bond*, Part I, Section B, Line 3.
   - Undeclared juice or concentrate will report as *Received* in Part IV, Line 2.
   - If the tax class is set to Fermenting Juice, the received volume will populate in Part VII, Line 1 - In Fermenters (Estimated Quantity of Liquid).
4. (**optional**) Select a ship *From* location from the dropdown. Learn how to add and manage your locations [here](https://support.innovint.us/hc/en-us/locations?hsLang=en). This field is for reference only on the action, and will not impact reporting at the listed location.
5. Select the vessels to fill and adjust the ending fill as necessary.
   1. If creating a work order task, there is an option to *let cellar staff choose vessels*. Vessels will then have to be selected in the open work order.

**Note:** If bulk wine volume was transferred in vessels (eg full barrels moved from one location to another), you'll need to [create the vessels](//innovint-6865708.hs-sites.com/hc/en-us/204106559-step-1-enter-your-vessels-into-the-system-with-video-?hsLang=en) in your account first. If the vessels move back and forth between multiple locations, we recommend tagging the vessels with the lot code or current location, and then archiving/unarchiving the vessels as needed. The tag(s) will help to quickly find the barrels to archive/unarchive in bulk.

![Bond to Bond Transfers-in](https://support.innovint.us/hs-fs/hubfs/Bond%20to%20Bond%20Transfers-in.webp?width=688&height=377&name=Bond%20to%20Bond%20Transfers-in.webp)

#### B2B Transfer Out

1. (optional) Add any notes. We recommend including information such as the destination winery, bond number, and/or address if you are not utilizing our [Shipping Locations](https://support.innovint.us/hc/en-us/locations?hsLang=en).
   1. This is also a great place to attach and save a copy of your BOL after the action is submitted. Attachments will not save until after action submission, or work order creation.
2. Select your lot from the dropdown or lot picker. All B2B direct actions only allow single lot selection.
   1. If transferring out case goods, please note that to ship case goods, you will need to access the specific **B2B Transfer Out *(Case Goods)*** action via the *Case Goods Lot Details page*.
      ![Bond to Bond Transfers-out case good](https://support.innovint.us/hs-fs/hubfs/Bond%20to%20Bond%20Transfers-out%20case%20good.webp?width=168&height=236&name=Bond%20to%20Bond%20Transfers-out%20case%20good.webp)
      This is not the same action as a **B2B Transfer Out** action for bulk wines and is not available as a work order task. If shipping case goods, you will enter the number of pallets, cases, and bottles to remove in the action.
   2. If you are using B2B Transfer Out work order tasks for Juice/wine lots, you can ship multiple lots. Quickly multi select lots at one time in order to bulk generate multiple B2B Transfer Out tasks on the created work order (one for each lot).
      ![Bond to Bond Transfers-out](https://support.innovint.us/hs-fs/hubfs/Bond%20to%20Bond%20Transfers-out.webp?width=688&height=306&name=Bond%20to%20Bond%20Transfers-out.webp)
3. The reason is pre-selected as 'Bond to Bond Transfer Out' to properly report on the TTB 5120.17. B2B Transfer Out will remove the volume from the lot's current tax class on your TTB report:
   - Part I, Section A, Line 15 for declared bulk wine
   - Part I, Section B, Line 9 for case goods
   - Part IV, Line 8 for Juice or Concentrate.
   - If the tax class is set to Fermenting Juice, the removed volume will only affect Part VII, Line 1 - In Fermenters (Estimated Quantity of Liquid).
4. (**optional**) Select a ship *To* location from the dropdown. Learn how to add and manage your locations [here](https://support.innovint.us/hc/en-us/locations?hsLang=en). This field is for reference only on the action, and will not impact reporting at the listed location.
5. If transferring out bulk wine, select the appropriate vessels and adjust the ending fill as necessary.
6. Choose whether or not to archive the vessels containing the shipped lot. If you are shipping bulk wine in barrels, you may want to archive these vessels as they leave your facility. This box defaults as unchecked.
7. Check the box for '[Generate Bill of Lading](https://support.innovint.us/hc/en-us/articles/360055473151-how-to-create-a-bill-of-lading-bol-?hsLang=en)' to prompt the BOL slideover after submitting a direct action. If a location was selected above in Step 4, it will pre-populate the BOL.
   1. In work orders, the blue Generate Bill of Lading button is available at work order creation, in an open work order, and in the submitted work order. A "Print Bill of Lading" button is also available in the work order header, and will generate a BOL for all lots involved in B2B Transfer Out tasks.

![Bond to Bond Transfers-numbered](https://support.innovint.us/hs-fs/hubfs/Bond%20to%20Bond%20Transfers-numbered.webp?width=688&height=409&name=Bond%20to%20Bond%20Transfers-numbered.webp)

Please confirm with your compliance advisor if shipping undeclared juice. If the tax class is set to Fermenting Juice, the removed volume will only affect Part VII, Line 1 - In Fermenters (Estimated Quantity of Liquid), and not display as a "Transfer in bond" .

### Bond to Bond Transfer to another InnoVint Winery

The **B2B to another InnoVint winery** action allows users to transfer lot details and remove the fill from one InnoVint account and copy the lot details to a new lot in another InnoVint account (Note: volume is removed from the original lot, but is not transferred to the destination lot).

The user must have **Admin,** **Team Member,**or **Team Member Cannot Submit Work Order** capabilities at *both* the originating and destination wineries. This action is not supported for case good lots.

The B2B to another InnoVint Winery action is a feature available at certain subscription levels. If you do not see the B2B to another InnoVint Winery action in your Lot details/Record action menu, please contact InnoVint Support at support@innovint.us to learn more.

A Bond to Bond Transfer to another InnoVint Winery requires 2 steps:

#### Step 1: Bond to Bond Transfer *Out* - To another InnoVint Winery action

This action will create the new lot code and details at the destination winery, *but will not add volume*. See Step 2!

You must access this action via the Lot Details Record action menu - you cannot access it via the Record action menu in the Top Navigation bar.  This is not available as a work order task and is not supported for Case Good Lots.

![Bond to Bond Transfers-another IV](https://support.innovint.us/hs-fs/hubfs/Bond%20to%20Bond%20Transfers-another%20IV.webp?width=688&height=31&name=Bond%20to%20Bond%20Transfers-another%20IV.webp)

Origin details:

The originating lot details will be displayed at the top of the action page.

- Select whether you want to transfer all vessels, a selection of particular vessels, or part of a vessel.
  ![Bond to Bond Transfers-out another IV](https://support.innovint.us/hs-fs/hubfs/Bond%20to%20Bond%20Transfers-out%20another%20IV.webp?width=467&height=199&name=Bond%20to%20Bond%20Transfers-out%20another%20IV.webp)

Transfer to:

Select the destination winery from the dropdown list. This list will include all accounts that the signed-in user has access to, and appropriate permissions for.

Destination Lot Information: set and edit lot attributes on your new destination lot.

1. Select the bond at the destination winery to transfer to.
2. The lot code can remain the same as long as it does not already exist at the destination winery. It can also be edited for any reason. The lot *name* can also stay the same, or be changed if needed.
3. The tax class can be amended if necessary.
   1. If the tax class is changed, the volume from the original lot will be removed from the tax class of the originating lot, and report on the 5120.17 TTB Report as "Transfers in Bond." When entering the volume at the destination winery, the received volume will populate under the new tax class as "Received in Bond" on the TTB report.
4. A new lot stage can be selected from the dropdown.
5. If the Owner-Based Permissions System is activated in the destination account, a new owner tag at the destination winery will need to be selected.
   1. Team Members at the destination winery account will only be able to select ownership tags that they have access to.
6. Add or remove tags from the destination lot. If a tag does not already exist at the destination winery, it will be created.
7. Any Notes on the originating lot will automatically be copied to the destination lot. Additionally, the Bond to Bond transfer action and each lot will automatically gain a new Note with the transfer details: To and From, Source and Destination lot codes, and total volume removed from the originating winery.
8. All *lot composite* analysis data will be copied to the destination lot.
   1. Analyses on individual vessels, notes on analysis actions, and source logos will not be copied.
   2. If the Bond to Bond transfer is backdated to a date prior to the effective date of an analysis action, the analysis will still be included in the transfer.
9. If the Costing feature is activated in the involved winery accounts, the cost data will be copied by category. The entire Lot Cost History will not be copied (i.e. each action with potential cost implications will not be displayed), but a summary of the cost category totals will be created and copied into the new lot.
   1. If costs are recorded on a lot after the Bond to Bond transfer is complete, but backdated and effective as of a date before the Bond the Bond transfer, the new costs will NOT be copied to the new lot (i.e. Costs copied in a Bond to Bond transfer will remain unchanged.) The cost entry needs to take place prior to the submission of the bond transfer.

      ![Bond to Bond Transfers-transfer to](https://support.innovint.us/hs-fs/hubfs/Bond%20to%20Bond%20Transfers-transfer%20to.webp?width=688&height=440&name=Bond%20to%20Bond%20Transfers-transfer%20to.webp)
10. Destination Lot Components: each vineyard source component is listed by percentage value.

- - - If the vineyard source from the originating winery matches a vineyard source in the destination winery *exactly*, then the lot component will be attributed to that source.
    - If the vineyard source from the originating winery does not match a vineyard source in the destination winery *exactly*, then the source will be created in the destination winery.

**Example:** In the screenshot below, the Vineyard *Aggieland (ALV)* in Napa Valley exists at Green Acres Winery, the destination winery. *Block A2*, Cabernet Sauvignon also exists at Green Acres. The green text lets us know that there is a match and that the component will be attributed to the existing vineyard and block at Blue Sky.

But, the Petit Verdot block, *A1*, does not exist at Green Acres in *Aggieland (ALV)* vineyard. The red text alerts us that Block A1, Petit Verdot, does not already exist at Blue Sky and will be created. If Block A1 did exist at Green Acres, but was linked to a different varietal (e.g. Syrah instead of Petit Verdot), then a new block would be created as well - same name, different varietal.

In this example you can also see that the red text alerts us that the vineyard Hullabaloo Estate (HLB) in High Valley does not exist at the destination winery. The same vineyard name might actually exist at the destination winery but under a different appellation (e.g. *Lake County)*. Even though the vineyard names match, the appellations are different and therefore a new vineyard and block will be created at the destination winery.

![Bond to Bond Transfers-destination lot comp](https://support.innovint.us/hs-fs/hubfs/Bond%20to%20Bond%20Transfers-destination%20lot%20comp.webp?width=688&height=230&name=Bond%20to%20Bond%20Transfers-destination%20lot%20comp.webp)

**WARNING**: Vineyard components cannot be changed or consolidated after lot creation. If you believe that vineyard components should match at the destination winery, make sure that the vineyard and block names match exactly, as well as the vineyard and block attributes. If changes need to be made, we recommend opening a new tab in Chrome and [editing the vineyard and block attributes](https://support.innovint.us/hc/en-us/articles/360027033091-step-2-add-and-edit-vineyard-sources?hsLang=en) before recording the Bond the Bond transfer.

11.   Select an **Effective at** date and time to backdate the Bond to Bond transfer out of bond.

Recording the Bond to Bond transfer into another InnoVint winery results in a B2B      transfer out from the original lot and winery, and the creation of a new lot in the        destination winery. *No volume or vessels are transferred to the destination account.*

If you would like to **generate a Bill of Lading (BOL)** with this transfer reference [this](https://support.innovint.us/hc/en-us/articles/360055473151-how-to-create-a-bill-of-lading-bol-?hsLang=en) article.

**WARNING**: Backdated Bond to Bond transfers are limited by dependent actions. If an action has been recorded after the desired 'effective at' date of the Bond to Bond transfer, we recommend adding a note to the action and manually adjusting the TTB report as needed for the source bond. In the destination lot, you can backdate the 'B2B volume adjustment' (step 2 below) to the correct/desired date.

#### Step 2: Bond to Bond Transfer In at destination winery

In the destination winery account, follow the instructions at the top of this article for a [B2B Transfer In](#transfer-in), but instead of creating a new lot, search for the newly created lot in the Lot Explorer. The new lot will have all the copied lot attributes, but no fill. A note with details of the Bond to Bond transfer that resulted in the creation of the lot is attached to the action and the lot. Make sure to backdate the action if needed.
