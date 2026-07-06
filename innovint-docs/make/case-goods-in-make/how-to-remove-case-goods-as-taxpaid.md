---
title: "How to Remove Case Goods as Taxpaid"
url: "https://support.innovint.us/hc/en-us/taxpaid"
category: "MAKE"
section: "Case Goods in MAKE"
page_type: "page"
lastmod: "2025-11-20"
gist: "When case good lots are created via a bottling action, they will populate your Case Goods Explorer until they are depleted via one of several actions that are specific to case good lots."
tags: ["packaging", "reporting", "inventory", "bond", "ttb", "ux-friction"]
---

# How to Remove Case Goods as Taxpaid

## How to record case goods taxpaid shipments by creating a Remove Taxpaid action, and how you can report on it!

When case good lots are created via a bottling action, they will populate your Case Goods Explorer until they are depleted via one of several actions that are specific to case good lots. These actions may include Bond Transfer Out (Case Goods), Volume Adjustment (Case Goods) and Remove Taxpaid (Case Goods).

To record a wine as removed taxpaid from your bond on your taxpaid or compliance reporting, you must perform a Remove Taxpaid (Case Goods) on the case good lot, or perform a Volume Adjustment (Case Goods) with the reason "Remove Taxpaid".

This article covers:

- [How to Record a Remove Taxpaid action](#howtorecordtaxpaidaction)
- [Reporting on Taxpaid Inventory](#taxpaidreporting)
- [FAQ](#faq)

### How to Record a Remove Taxpaid Action

Here's how to create a remove taxpaid action.

1. Go to the 'Remove Taxpaid' action from the Record Action dropdown in the Case Good lot details page. This action does not exist in the "global" action dropdown in the top navigation bar. ![How to Remove Case Goods as Taxpaid-record action](https://support.innovint.us/hs-fs/hubfs/How%20to%20Remove%20Case%20Goods%20as%20Taxpaid-record%20action.webp?width=688&height=257&name=How%20to%20Remove%20Case%20Goods%20as%20Taxpaid-record%20action.webp)
2. Populate the action with the following details:![How to Remove Case Goods as Taxpaid-populate](https://support.innovint.us/hs-fs/hubfs/How%20to%20Remove%20Case%20Goods%20as%20Taxpaid-populate.webp?width=688&height=347&name=How%20to%20Remove%20Case%20Goods%20as%20Taxpaid-populate.webp)

- - **Lot** - Select your Case Goods lots from the lot dropdown or lot picker
  - **Reason** - The reason is pre-selected to properly report on the TTB 5120.17
  - **Remove** - Check the box to remove the entire lot, or enter the number of pallets, cases, and bottles you want to remove
  - **New on hand** - InnoVint calculates the new on hand value for the lot, as well as the total bottles removed and total volume removed
  - **Destination** *(optional) -* Select a location from the dropdown. (Learn more about Shipping Locations [here](https://support.innovint.us/hc/en-us/locations?hsLang=en))
  - **Stage** - Check the box to update the lot stage upon submission. **This checkbox updates the remaining case good lot contents if you do not fully remove the lot. InnoVint defaults to change the lot stage to 'Taxpaid'.** Uncheck the box, or select another option from the dropdown if required
  - **Archiving** - Check the box to automatically archive the lot if it is emptied in this action
  - **Generate Bill of Lading -** Check the box to prompt the BOL slide over after submission. You can also [generate a BOL containing multiple lots](https://support.innovint.us/hc/en-us/how-to-create-a-multi-lot-bol?hsLang=en) via the Report Explorer.

This action is required to populate the "Removed Taxpaid" line 8 (Section B) on the TTB Report.  Changing the Case Good lot stage to "Taxpaid" will not remove cases or volume from inventory, or update on the TTB Report.

Want to track your taxpaid wines in InnoVint? See this article about "[Managing Offsite Case Goods Inventory](https://support.innovint.us/hc/en-us/managing-offsite-case-goods-inventory-in-innovint?hsLang=en)" for some tips.

### Reporting on Taxpaid Inventory

This Taxpaid Report is not available in all winery accounts.

Go to the Report Explorer and find the **Taxpaid** report under Activity Reports.

![How to Remove Case Goods as Taxpaid-report](https://support.innovint.us/hs-fs/hubfs/How%20to%20Remove%20Case%20Goods%20as%20Taxpaid-report.webp?width=688&height=137&name=How%20to%20Remove%20Case%20Goods%20as%20Taxpaid-report.webp)

Select a start and end date, then download the report to create a .csv file. This file lists all 'Remove Taxpaid' actions recorded within the date range, along with involved lots and total volume removed.

Changing a Case Good lot stage to "Taxpaid" will not cause that case good lot to populate this report.  You must complete a Remove Taxpaid action.

### FAQ

**Q: My lot stage is set to Taxpaid. Why is my lot still in bond?**

*A: Changing the Case Good **lot stage** to "Taxpaid" will not remove inventory or update on the TTB Report. Submitting a Remove Taxpaid action is required in order to populate the "Removed Taxpaid" line 8 (Section B) on the TTB Report.*
