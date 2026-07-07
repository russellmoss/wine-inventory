---
title: "Reporting in SUPPLY"
url: "https://support.innovint.us/hc/en-us/reporting-in-supply"
category: "SUPPLY"
section: "Using SUPPLY"
page_type: "page"
lastmod: "2026-06-29"
gist: "This article outlines the different reporting options that exist in SUPPLY."
tags: ["reporting", "inventory", "exports", "packaging", "dtc-sales", "ttb"]
---

# Reporting in SUPPLY

This article outlines the different reporting options that exist in SUPPLY.

- [Inventory Explorer (point in time reporting)](#inventory_explorer)
- [Action History Feed](#AHF)
- [Open Depletions Explorer](#Open_depletions)
- [TTB Report Export](#TTB)

![Screenshot 2025-12-15 at 3.06.36 PM](https://support.innovint.us/hs-fs/hubfs/Screenshot%202025-12-15%20at%203.06.36%20PM.png?width=670&height=302&name=Screenshot%202025-12-15%20at%203.06.36%20PM.png)

#### Inventory Explorer

The Inventory Explorer allows you to view and export inventory quantities as of a specific date and time.  Find the Inventory Explorer on the lefthand navigation menu, beneath the SKU Explorer icon.

Use the Inventory Explorer when you need to:

- See what inventory quantities were at a past point in time
- Troubleshoot inventory discrepancies
- Reconcile inventory for audits or reporting across locations
- Export inventory data that reflects a historical date, not just current inventory

**How to View Inventory at a Specific Date and Time**

- Inventory Explorer Filters:theInventory Explorer supports the same filters as the Inventory Picker, allowing you to narrow your results before viewing or exporting them. Available filters include:

- - ***Search*** - SKU code and SKU name
  - ***Date/Time*** -This filter controls what inventory quantities are displayed

- - - By default, the filter is set to the **current date and time**
    - Selecting a date/time updates the list to show inventory quantities *as of that moment*
    - Inventory with a zero quantity at the selected time is automatically excluded
    - Selecting **Today** sets the date to today and the time to **11:59 PM**

- - ***Format***
  - ***Stage***
  - ***Location***
  - ***Tax Status***

**![SUPPLY_Inventory Explorer](https://support.innovint.us/hs-fs/hubfs/SUPPLY_Inventory%20Explorer.png?width=670&height=220&name=SUPPLY_Inventory%20Explorer.png)**

- After setting your filters, the Inventory Explorer shows:

- - All inventory line items that had a quantity greater than zero at the selected date/time
  - Any Inventory associated with active SKUs

Having trouble viewing a column? Column widths for **SKU Code** and **SKU Name** can be resized.

**How to Export Inventory**

1. Apply any desired filters, including Date/Time
2. Click **Export** in the Inventory Explorer
   - The export reflects **all active filters** at the time of export
   - The file name includes the selected date and time

The Current Inventory Export in the SKU Explorer is no longer available - please use the point in time report as of today!

#### Action History Feed

This report can be found by clicking on the report's icon on the left navigation sidebar.  The Action History Feed is a list of all actions, displayed in reverse chronological order, that have been submitted.

![SUPPLY Report - Actio History Export](https://support.innovint.us/hs-fs/hubfs/SUPPLY%20Report%20-%20Actio%20History%20Export.png?width=670&height=234&name=SUPPLY%20Report%20-%20Actio%20History%20Export.png)

- Use the filters to find the actions you are looking for. Filters include:
  - ***Text filter (SKU, SKU name and notes text) -*** use the text field to find actions on specific SKUs.
  - ***Date range filter*** - You can select just a start date, just an end date or a date range.
  - ***Action filter*** - All actions are included and those with reasons (Onboard, Add and Deplete) are listed both generically and broken out by reason to allow for both general and granular filtering.
  - ***Location filter*** - review all actions that moved inventory into or out of a location
  - ***Compliance reason filter*** - filters actions on in-bond locations based on Compliance reason, including 'Compliance reason not set'.
  - ***Submitted by filter*** - This filter shows all users in the account and filters actions by who most recently submitted the action or the action edit.
- Export the reports in csv - each export respects the currently applied filters:
  - ***Action History export*** - Export of all actions in the feed
  - ***Deleted actions export*** - Export of deleted actions
- Exports will include the effective at date (i.e. the date an action was backdated to), the deleted at date (for deleted actions), the created at date (when you actually recorded the action), the action type, the compliance reason (if applicable), the action url, the involved SKU(s), involved location(s), the net inventory change, the Note on the action, who submitted the action, and the Commerce7 Order Number (if applicable).

#### Open Depletions Explorer

Find Open depletions in the explorer on the lefthand navigation menu.

- Use the filters to find the open depletions you are looking for. Filters include:
  - ***Text filter (SKU or SKU name) -*** use the text field to find open depletions on specific SKUs.
  - ***Date range filter*** - You can select just a start date, just an end date or a date range.
  - ***Depletion type filter*** - Filter by depletion type: Sale, Bond to bond, or Other.
  - ***Location filter*** - review open depletions within a location
  - ***Created by filter*** - This filter shows all users in the account and filters open depletions by who created them.

![SUPPLY_Open Depletions Explorer](https://support.innovint.us/hs-fs/hubfs/SUPPLY_Open%20Depletions%20Explorer.png?width=670&height=172&name=SUPPLY_Open%20Depletions%20Explorer.png)

#### TTB Export

This report can be found by clicking on the report's icon on the left navigation sidebar.

![SUPPLY Reports - TTB Export](https://support.innovint.us/hs-fs/hubfs/SUPPLY%20Reports%20-%20TTB%20Export.png?width=670&height=174&name=SUPPLY%20Reports%20-%20TTB%20Export.png)

Get all the details on how the TTB export is created in [this article](https://support.innovint.us/hc/en-us/how-does-supply-populate-the-ttb-report?hsLang=en)!
