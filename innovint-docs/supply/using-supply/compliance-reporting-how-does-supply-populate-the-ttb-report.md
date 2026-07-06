---
title: "Compliance Reporting: How does SUPPLY populate the TTB Report?"
url: "https://support.innovint.us/hc/en-us/how-does-supply-populate-the-ttb-report"
category: "SUPPLY"
section: "Using SUPPLY"
page_type: "page"
lastmod: "2026-03-24"
gist: "SUPPLY provides a comprehensive export to help you populate Section B - Bottled Wines for the TTB Report 5120.17."
tags: ["reporting", "compliance", "ttb", "exports", "inventory", "bond"]
---

# Compliance Reporting: How does SUPPLY populate the TTB Report?

SUPPLY provides a comprehensive export to help you populate Section B - Bottled Wines for the TTB Report 5120.17.

This article details how actions in SUPPLY map to the TTB export, where to find the export, and how to use it.

- [How to find TTB Reporting](#How)
  - [What are the sections of the TTB export?](#Sections)
- [How InnoVint maps to Section B - Bottled Wines](#Mapping)
- [Using the Audit tab](#Audit)
- [FAQ](#FAQ)

⚠️ SUPPLY allows you to negatively deplete inventory. If you have negative inventory quantities at the start or end of your reporting period, InnoVint does not guarantee that your TTB report data is accurate. Review the Negative Inventory section of the TTB export to find and review any problem inventory.

⚠️ SUPPLY supports a "compliance reason not set" option on Add and Deplete Inventory - Other actions. This reason may be chosen by you, or set by the Commerce7 Integration.  Actions that have ‘Compliance reason not set’ (whether these actions are submitted by a user or C7) will be excluded from the TTB export and must be reviewed and corrected for accuracy.

### How to find TTB Reporting

Navigate to the lefthand navigation menu and click on the Report icon:

![Supply-Reports](https://support.innovint.us/hs-fs/hubfs/Supply-Reports.png?width=232&height=118&name=Supply-Reports.png)

Set the desired bond and start/end date for your TTB export: click Download report.

![Supply-TTB Report select bond](https://support.innovint.us/hs-fs/hubfs/Supply-TTB%20Report%20select%20bond.png?width=670&height=185&name=Supply-TTB%20Report%20select%20bond.png)

### Sections of the TTB export

The SUPPLY TTB export contains four distinct sections:

![Supply-TTB sections](https://support.innovint.us/hs-fs/hubfs/Supply-TTB%20sections.png?width=670&height=341&name=Supply-TTB%20sections.png)

1. **Negative inventory**: SUPPLY allows users to negatively deplete inventory.  In the event that you have a SKU with negative inventory at the start or end of period, those items will be listed at the start of the report.  These negative balances need to be corrected before the reported numbers for Section B can be accurate.
2. **Actions with compliance reason not set:** In the event that you have actions recorded on in-bond SKUs with the compliance reason not set, they will be listed here. These volumes are NOT included in the TTB report export for the date range selected. Find and correct these actions via the Action History Feed.
3. **Actual report numbers**:  This section displays the calculated values for each listed row in Part I, Section B.  All lines are in US Gallons.
4. **Report information:** This section displays the start and end dates, the organization containing the bond, and the bond containing the reported inventory.

### How InnoVint maps to Section B - Bottled Wines

1. ON HAND BEGINNING OF PERIOD
   Should match Section B, Line 20 ON HAND END OF PERIOD from the last submitted TTB report. This line is populated with volume via the [Onboard Inventory action](https://support.innovint.us/hc/en-us/how-to-onboard-inventory-in-supply?hsLang=en) when the onboarded SKU inventory is in bond.
2. BOTTLED
   The total volume added to SUPPLY via the "Add Inventory" action with the reason "**Bottling**" (when the SKU tax status is "in-bond").  This value should match Part 1, Section A, Line 13 - BOTTLED from your bulk wine reporting.
3. RECEIVED IN BOND
   The total volume added to SUPPLY via the "Add Inventory" action, with the reason "**Bond to bond transfer in**" (when the SKU tax status is "in-bond").
4. TAXPAID WINE RETURNED TO BOND
   The volume of taxpaid case goods inventory returned to bond within the reporting period.  This volume is logged when inventory is moved from a **taxpaid** location to an **in-bond** location using a "Move Inventory" action.
5. Write-in: INVENTORY GAINS

   Any case goods inventory increase in volume. This volume is logged when inventory is increased via the Reconcile Inventory action.
   *NOTE - PER TTB: Do not report bottled inventory gains unless a complete inventory of all bulk and bottled wine is taken (i.e., during your annual physical inventory).*
6. Write-in: (blank line)
   InnoVint does not populate this write-in field at this time.
7. *TOTAL*
   Calculated: Sum of Line 1 plus the amounts recorded in Lines 2-6
8. REMOVED TAXPAID
   The volume of case goods inventory removed taxpaid within the reporting period. This removal is logged:
   1. When inventory is moved from an **in-bond** location to a **taxpaid** location using a "Move Inventory" action.
   2. When in-bond inventory is marked asremoved taxpaidvia a "Deplete Inventory" action with the Depletion type: "Sale".
   3. Any in-bond inventory decrease in volume due to a Deplete Inventory action with the Depletion Type: "Other" and the compliance reason: "Removed Taxpaid.
9. TRANSFERRED IN BOND
   The volume of case goods inventory transferred out of bond within the reporting period.
   1. Case goods inventory is recorded as transferred in bond via a Deplete Inventory action with the Depletion type: "Bond to bond transfer".
   2. Case goods inventory is recorded as transferred in bond via a Move inventory action between two different bonded locations.
10. DUMPED TO BULK
    Any case goods inventory decrease in volume due to a Deplete Inventory action with the Depletion Type: "Other" and the compliance reason: "Bottled wine dumped to bulk".
11. USED FOR TASTING
    Any case goods inventory decrease in volume due to a Deplete Inventory action with the Depletion Type: "Other" and the compliance reason: "Used for tasting".
12. REMOVED FOR EXPORT
    Any case goods inventory decrease in volume due to a Deplete Inventory action with the Depletion Type: "Other" and the compliance reason: "Removed for export".
13. REMOVED FOR FAMILY USE
    Any case goods inventory decrease in volume due to a Deplete Inventory action with the Depletion Type: "Other" and the compliance reason: "Removed for family use".
14. USED FOR TESTING
    Any case goods inventory decrease in volume due to a Deplete Inventory action with the Depletion Type: "Other" and the compliance reason: "Used for testing".
15. Write-in: (blank line)
     InnoVint does not populate this write-in field at this time.
16. Write-in: (blank line)
    InnoVint does not populate this write-in field at this time.
17. Write-in: (blank line)
    InnoVint does not populate this write-in field at this time.
18. BREAKAGE
    Any case goods inventory decrease in volume due to a Deplete Inventory action with the Depletion Type: "Other" and the compliance reason: "Breakage".
19. INVENTORY SHORTAGE
    Any case goods inventory decrease in volume.
    1. due to a Deplete Inventory action with the Depletion Type: "Other" and the compliance reason: "Inventory Shortage".
    2. when inventory is decreased via the Reconcile Inventory action.

       *NOTE - PER TTB: Do not report bottled inventory shortages unless a complete inventory of all bulk and bottled wine is taken (i.e., during your annual physical inventory).*
20. ON HAND END OF PERIOD

    Calculated. Sum of Line 7 TOTAL minus the amounts given in Lines 8-19.
21. TOTAL

    Sum of Lines 8-20. Should be equal to Line 7.

### Using the Audit tab

The SUPPLY TTB export will download as a .xlsx file - this is to support multiple tabs on the export. The second tab is the Audit tab.

![Supply-TTB Audit](https://support.innovint.us/hs-fs/hubfs/Supply-TTB%20Audit.png?width=670&height=141&name=Supply-TTB%20Audit.png)

The Audit tab will display all actions that are mapped to the specified lines and are intended to provide a robust audit trail to determine how the report numbers are generated. Add and use filters to view actions contributing to your problem row.

### FAQ

**Q: How are you rounding the volumes for compliance reporting?**

*A: The TTB requires conversions to be rounded to 5 decimal places so we round the values in both the TTB report and the Audit report to 5 significant figures (including those values with trailing zeros, ie: 1.00000). For true zero numbers, we will show “0”.*

**Q: What is negative inventory and how to deal with it?**

*A: If the Negative Inventory section of the TTB export contains SKUs with a negative balance, you must find and review these SKU inventories in order to ensure that the report is accurate.*

**Q: I use InnoVint MAKE to track and bottle my bulk wines. How can I combine my MAKE TTB Report with the SUPPLY TTB export?**

*A: If you are tracking all of your case good inventory in SUPPLY after bottling (i.e. using an Add Inventory action with the reason "Bottling"), we recommend clearing the Section B generated by MAKE, and populate Section B entirely with the numbers tracked in SUPPLY.*

*We also strongly recommend confirming that the bottled volume in Line 13 of Part 1, Section A of MAKE matches with the Section B, Line 2 (Bottled) in SUPPLY.  Please note that, due to rounding, MAKE should match to SUPPLY within 2 decimal places but may vary beyond that.*
