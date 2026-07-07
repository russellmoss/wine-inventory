---
title: "MAKE Case Goods: Feature Overview"
url: "https://support.innovint.us/hc/en-us/case-goods-feature-introduction-and-overview"
category: "MAKE"
section: "Case Goods in MAKE"
page_type: "page"
lastmod: "2026-04-16"
gist: "How to Create Case Goods Inventory."
tags: ["packaging", "getting-started", "inventory", "migration", "reporting", "work-orders"]
---

# MAKE Case Goods: Feature Overview

This article covers:

[How to Create Case Goods Inventory](#create)

[The Case Goods Explorer and Lot details pages](#Explorer-and-details)

[Recording Actions on Case Goods lots](#actions)

[Tracking Shiners](#shiners)

[Packaging and Costing for Case Goods](#Packaging-Costing)

[How to Remove Case Good Inventory](#Remove)

[Case Goods Reporting: Compliance and Taxpaid](#reporting)

### How to Create Case Goods Inventory

InnoVint tracks your Case Goods inventory as individual lots. A Case Goods lot shares a unique set of attributes, much like a Fruit lot or Juice/Wine lot - eg bond, tax class, stage, tags, etc. A Case Goods lot also includes attributes for bottle format, bottles per case, and cases per pallet. The volume contained in a Case Good lot will be reflected in Section B of the TTB Report for the associated bond.

There are 3 ways to create a new Case Goods lot:

- **Within a bottle action**
  InnoVint tracks production seamlessly from your bulk wine inventory through bottling to Case Goods. Create and fill a new Case Goods lot within a Bottle task in a work order or Bottle direct action. Learn more about the Bottle task and action [here](https://support.innovint.us/hc/en-us/articles/207265686-how-to-record-or-edit-a-bottling-action?hsLang=en).
- **via 'Add Case Good lot'**Create an individual Case Goods lot from the 'Add lot' interface. Go to the Case Goods Explorer (click on 'Case Goods' in the left-side navigation bar) and click on the blue **Add Case Good lot** button in the top right corner. Learn more about adding new lots [here](https://support.innovint.us/hc/en-us/articles/204106579-step-3-enter-your-current-wine-lots-into-the-system?hsLang=en).
- **via 'Lot Import'**
  Onboarding more than a few Case Goods lots? Or creating a Case Goods lot with a complex composition? The Lot Import action allows you to create one or more Case Goods lots through a .csv upload. Learn more about Lot Import [here](https://support.innovint.us/hc/en-us/how-to-import-lots-via-csv?hsLang=en).

If creating a Case Goods lot outside of a Bottle action (ie via 'Add Case Good lot' or 'Lot Import'), you'll need to fill your lot with volume. To do this, go to the lot details page, click on **Record action** in the top right corner, and select **Volume Adjustment** from the dropdown list. If you're establishing Case Goods inventory in InnoVint for the first time, then be sure to select **Onboarding** as the reason. Learn more about onboarding Case Goods lots [here](https://support.innovint.us/hc/en-us/articles/204758625-step-4-fill-vessels-with-the-volume-for-each-lot-with-video-?hsLang=en), or how to record a volume adjustment for Case Goods [here](https://support.innovint.us/hc/en-us/articles/204178489-volume-adjustment?hsLang=en#case_goods).

### Case Goods Explorer and Lot Details Pages

The Case Goods Explorer provides an overview of all active Case Goods lots, and allows you to quickly see your inventory and filter by lot code or name, bottle format, composition, tags, etc.

Each row of the Case Goods Explorer corresponds to a unique Case Goods lot, displaying pertinent details and on hand inventory. You can manage your Case Goods lots in bulk or add a new Case Goods lot by clicking on the blue buttons in the top right corner.

Clicking on a row within the Case Goods Explorer will take you to the specific lot details page. The lot details page provides a more in-depth look at your lot attributes, as well as lot history, analysis, composition, packaging information, and a detailed cost breakdown (if Costing is activated). You can also record direct actions from this page, as well as edit lot attributes and properties.

### Recording actions on Case Goods lots

InnoVint provides several options for recording data and movements on Case Goods lots. These actions are specific to case good lots, and cannot be accessed via the top navigation bar Record Action menu.

You can [record analysis data](https://support.innovint.us/hc/en-us/articles/204274759-how-to-record-analysis-via-direct-action-or-work-order-task-?hsLang=en), [transfer inventory between lots](https://support.innovint.us/hc/en-us/articles/360028194371-using-the-transfer-action?hsLang=en#xfercg), [add packaging](https://support.innovint.us/hc/en-us/how-to-add-packaging-to-case-goods?hsLang=en), [receive or ship out](https://support.innovint.us/hc/en-us/articles/360018542692-bond-to-bond-transfers?hsLang=en), or [remove case goods taxpaid](https://support.innovint.us/hc/en-us/taxpaid?hsLang=en).

Please note that to perform actions on case goods, you will need to access the case good specific actions via the Case Goods Lot details page.  A B2B Transfer Out action will not allow you to ship out case goods - you need to utilize the B2B Transfer Out (Case Goods) action located in the Lot details Record action menu.

### Tracking Shiners

Unlabeled Case Goods, commonly referred to as 'shiners', can be easily tracked in InnoVint via lot stages.  Similar to Juice/Wine lots, case good lot stages do not have compliance implications, but do help you and your team track a wine's lifecycle from grape to bottle... and now through case goods to taxpaid!

You can select the 'Shiner' lot stage when creating a Case Goods lot, or edit the stage from the lot details page. Using stages to track shiners allows you to filter and sort the Case Goods Explorer to view and export your shiner inventory.

If you have a Case Goods lot that is partial shiners, we recommend creating separate lot codes to track the different stages. As you add labels (via the Add Packaging action), you can [transfer those cases](https://support.innovint.us/hc/en-us/articles/360028194371-using-the-transfer-action?hsLang=en#xfercg) from the shiner lot to the labeled lot. When all cases are finally labeled, you can archive the empty lot that previously held the shiners. Labeling all your shiners at once? Simply edit the stage on the existing lot.

### Packaging and Costing for Case Goods

InnoVint's Dry Goods and Costing features transition seamlessly into Case Goods.

Packaging added within a Bottling action is automatically tracked with the Case Goods lot, where you can view all packaging items added to the lot with a breakdown of used vs scrap, as well as the costs associated with each packaging batch. Any additional packaging added after bottling (eg adding labels to shiners) is also tracked as part of the lot packaging history.

After Bottling, the Case Good lot's starting cost begins with the finished goods cost of the bottled wine lot. Indirect cost items can be added to Case Goods in the same way they are added to Juice/Wine lots, and can help you track additional costs for storage or freight among other cost categories. Any transfers of Case Goods between lots, or removal from inventory, is also tracked as part of the lot cost history.

### How to Remove Case Good Inventory

Once created, case goods remain in your inventory and are tracked on your compliance reporting until they are removed.

There are three actions available within the Case Good module to remove a Case Goods lot from your inventory. To find these actions, go to a lot details page, click on **Record action** in the top right corner, and select one of the following:

- **Volume Adjustment (Case Goods) action**
  InnoVint allows you to manually adjust on-hand case good volumes with various reasons that directly map to TTB Reporting. These reasons are: "Taxpaid wine returned to bond"; "Used for tasting"; "Removed for export"; "Removed for family use"; "Used for testing"; "Breakage"; "Bottled wine dumped to bulk"; and "Inventory shortage".
- **Remove Taxpaid (Case Goods) action**Use this specific action to automatically trigger population of the TTB Report, remove case good volume, and change the lot stage to "Taxpaid".
- **via a B2B Transfer Out (Case Goods) action**
  Record the movement of case goods volume out of your bond to a different bonded location. InnoVint does not currently support case good transfers between bonds within a winery, or between InnoVint wineries.   Find out more about moving case goods between bonds [here](https://support.innovint.us/hc/en-us/managing-offsite-case-goods-inventory-in-innovint?hsLang=en).

### Case Goods Reporting: Compliance and Taxpaid

InnoVint tracks all case goods movements and volume adjustments to accurately complete Part I, Section B of the TTB 5120.17 report. Case Goods actions that affect this section of the 5120.17 include the following:

- Bottling
- Volume Adjustment - Case Goods
- Remove taxpaid
- B2B Transfers (Case Goods)
- Dumped to Bulk

Learn more about how InnoVint populates the TTB 5120.17 report [here](https://support.innovint.us/hc/en-us/articles/360020824392-how-does-innovint-populate-the-ttb-report-?hsLang=en).

Track all 'Remove taxpaid' actions within a date range by exporting the [Taxpaid Report](https://support.innovint.us/hc/en-us/taxpaid?hsLang=en#taxpaidreporting), available in the Report Explorer.

Check out the InnoVint Academy from the Case Goods Management release here:
