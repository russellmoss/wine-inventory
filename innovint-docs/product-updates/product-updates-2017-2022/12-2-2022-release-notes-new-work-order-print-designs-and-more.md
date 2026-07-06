---
title: "12/2/2022 Release Notes: New Work Order Print Designs and more!"
url: "https://support.innovint.us/hc/en-us/12/2/2022-release-notes"
category: "Product Updates"
section: "Product Updates: 2017 - 2022"
page_type: "page"
lastmod: "2025-11-20"
gist: "Release notes from December 2, 2022 include:."
tags: ["release-notes", "exports", "work-orders", "barrels", "mobile", "reporting"]
---

# 12/2/2022 Release Notes: New Work Order Print Designs and more!

Release notes from December 2, 2022 include:

### New Features

#### Work Order Print Designs 🎉

We've finalized new layouts for printed Work Orders to streamline your cellar workflow! These designs were formerly marked as "beta", but are now the official recommended print versions.  You can deep-dive into the details of our updates to Work Order printing [here](https://support.innovint.us/hc/en-us/work-order-print?hsLang=en).

![image-png-Nov-30-2022-10-00-01-4027-PM](https://support.innovint.us/hs-fs/hubfs/image-png-Nov-30-2022-10-00-01-4027-PM.png?width=688&height=465&name=image-png-Nov-30-2022-10-00-01-4027-PM.png)

### Improvements

#### **Bulk Clear Vessel Location on the Mobile App**

We added the ability to clear vessel locations using the bulk scan function in the Mobile App:

**![](https://support.innovint.us/hs-fs/hubfs/image-png-Dec-02-2022-08-13-49-6568-PM.png?width=352&height=314&name=image-png-Dec-02-2022-08-13-49-6568-PM.png)**

#### **Inventory at Point in Time Report (export) now includes a column for Vineyard**

Columns included on the export now include all of the below items.  Data with the asterisks (\*\*) represent data as of the selected point in time for the report.

Lot Code
Lot Name
Bond
Vessels \*\*
Volume (gal) \*\*
Weight (tons) \*\*
Vessels Capacity (gal)
Tax class \*\*
Alcohol \*\*
Alcohol Unit
Vintage
Varietal
Appellation
Vineyard
Stage
Tags
Owners
Intended Use

#### **Sugar Units can now be specified for your winery account (Brix or Baumé)**

Regardless of your account's regional settings, you can now choose to have sugar readings default to Baume or Brix on reports (such as Fermentation Worksheets, the Primary Fermentation Report, and the Fruit Intake Report). Reach out to us at [support@innovint.us](mailto:support@innovint.us) if you need an update on your account!

This default setting extends to our Mobile App analysis displays:

![](https://support.innovint.us/hs-fs/hubfs/image-png-Dec-02-2022-08-45-21-9187-PM.png?width=324&height=377&name=image-png-Dec-02-2022-08-45-21-9187-PM.png)

#### Multi-Winery Lot Explorer now includes Lot Name

When creating your custom reports, you now have the option of selecting Lot Name to display in the Multi-Winery Lot Explorer. ![120222_Release_Notes_MWLE_Lot_Name](https://support.innovint.us/hs-fs/hubfs/120222_Release_Notes_MWLE_Lot_Name.png?width=688&height=354&name=120222_Release_Notes_MWLE_Lot_Name.png)

#### Contract Calculations Optimized and refreshed

The Contracts card on the Vineyard Dashboard and the Contracts Explorer are performing better. Expect to see your calculated costs updating with Average Yield (if fruit has been received in prior years), Crop Estimate (if recorded for the current year) or Received fruit weights (if fruit has been received in the current harvest year) for the respective blocks.  ![](https://support.innovint.us/hubfs/image-png-Dec-05-2022-05-33-57-5954-PM.png)

Please note that the calculated cost summary on the Contract Explorer will total ALL contracts (Buy + Sell), while the Contracts card on the Vineyard Dashboard will toggle between the two values:

![](https://support.innovint.us/hs-fs/hubfs/image-png-Dec-05-2022-06-03-27-5164-PM.png?width=333&height=85&name=image-png-Dec-05-2022-06-03-27-5164-PM.png)

![](https://support.innovint.us/hs-fs/hubfs/image-png-Dec-05-2022-06-03-38-9216-PM.png?width=333&height=85&name=image-png-Dec-05-2022-06-03-38-9216-PM.png)

#### Cornell Craft Beverage Analytical Lab has been added as an Analysis Source

For our folks in the eastern US: you can now select this external lab when you are entering or importing analyses results. Find out more [here](https://support.innovint.us/hc/en-us/articles/360006665732-options-to-record-analysis-datachoose?hsLang=en#choose).

![](https://support.innovint.us/hs-fs/hubfs/image-png-Dec-02-2022-12-00-06-0914-AM.png?width=187&height=229&name=image-png-Dec-02-2022-12-00-06-0914-AM.png)

#### iOS Work Order App Updates

We have updated the Lot Explorer view on the iOS Work Order app to display in the same style as the Mobile App, in order to improve user experience when switching between the two.

![IMG_5275](https://support.innovint.us/hs-fs/hubfs/IMG_5275.jpg?width=188&height=390&name=IMG_5275.jpg)

Additionally, you can now Receive Fruit using multiple tare containers on the Work Order app, allowing you to more easily record Receive Fruit actions on-the-go during harvest! This will be helpful if you are weighing lug bins on a pallet, or macro bins on a truck, for instance.

![IMG_5273](https://support.innovint.us/hs-fs/hubfs/IMG_5273.jpg?width=190&height=390&name=IMG_5273.jpg)

#### Error Message Refinement

We've changed the amorphous "Oops, something went wrong in the system"/"Oops, we can't record this action" error messages to include an Error ID. Please include this code along with screenshots and a description of the action you were trying to complete when you contact support. If we run into difficulties helping you out, this can go a long way to help diagnose the problem!

![](https://support.innovint.us/hubfs/image-png-Dec-01-2022-08-54-07-1925-PM.png)

### Bug Fixes

- You are now able to delete (rather than archive) vessels that have location history but no other actions recorded.
- Additions will now properly deplete Additive Inventory when Lots are in Volume and the Addition Rate is in unit/weight (i.e. g/ton).
- We've fixed the "Positive delta in a drain lot" error that occurred when recording Drain and Press actions on lots fermented in multiple vessels of different capacities.
