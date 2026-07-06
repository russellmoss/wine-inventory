---
title: "1/19/2024 Release Notes: Packaging History, Removing Costs, and Custom Reporting!"
url: "https://support.innovint.us/hc/en-us/release-notes-packaging-history-and-custom-reporting"
category: "Product Updates"
section: "Product Updates: 2024"
page_type: "page"
lastmod: "2025-11-20"
gist: "Release Notes through January 19, 2024 include:."
tags: ["release-notes", "cost", "packaging", "reporting", "lot-identity", "additives"]
---

# 1/19/2024 Release Notes: Packaging History, Removing Costs, and Custom Reporting!

Release Notes through January 19, 2024 include:

### Features

#### Packaging History Report

It's here! Mirroring our Additive History Report, you can now download a Packaging History Report to view all actions and adjustments (Bottling, Add Packaging, Receive Dry Goods actions, and manual adjustments) involving packaging batches within your chosen date range. This export provides a batch-by-batch, lot-by-lot breakdown of received, used, scrapped, and adjusted quantities. And if you have InnoVint's COGS Tracking feature activated, cost changes are included! Use this report to better understand the consumption and cost distribution of packaging at your winery.

#### Add/Remove Cost Action

When you need to remove, reallocate, or reconcile costs, you can now do that with InnoVint's revamped "[Add/remove cost action](https://support.innovint.us/hc/en-us/allocate-costs-indirect-direct?hsLang=en#costitem)" (formerly known as "Add cost item"). Remove costs from any InnoVint cost category, includingthesedirect costs*:* Fruit, Packaging (scrapped or used), and additives.

Add or remove costs via the same button on the COGS Explorer or Cost Item Report.  You can easily remove an entire category cost, or, an amount per lot or volume unit.

![](https://support.innovint.us/hs-fs/hubfs/image-png-Jan-23-2024-06-26-39-7483-PM.png?width=675&height=343&name=image-png-Jan-23-2024-06-26-39-7483-PM.png)

The Lot details cost tab, the Cost Item Report, and the Cost Audit Report will show cost removals in red, in parenthesis.

![](https://support.innovint.us/hs-fs/hubfs/image-png-Jan-23-2024-05-25-51-4159-PM.png?width=675&height=120&name=image-png-Jan-23-2024-05-25-51-4159-PM.png)

![](https://support.innovint.us/hs-fs/hubfs/image-png-Jan-23-2024-05-27-00-0960-PM.png?width=675&height=186&name=image-png-Jan-23-2024-05-27-00-0960-PM.png)

The Lot Cost, Cost Over Time and Roll Forward reports will show the new **net** category costs.   As with our existing COGS functionality, if you remove cost from a lot that has since been bottled, then all bottled costs and any remaining bulk wine costs will be updated (just like the Add cost function).

#### The ALL NEW Report Explorer & Custom Reports

We've revamped the Report Explorer and enabled more customization for you to find frequently used reports easily! Drag and drop favorite reports into the ideal order for you (and only you!) Favorites save at the individual user level! Get all the details [here](https://support.innovint.us/hc/en-us/report-explorer?hsLang=en).

![](https://support.innovint.us/hs-fs/hubfs/image-png-Jan-23-2024-12-23-16-5827-AM.png?width=675&height=308&name=image-png-Jan-23-2024-12-23-16-5827-AM.png)

**Create and save custom, interactive reports without leaving InnoVint!**

Embedded within our pretty new explorer, find our powerful, new **Custom Reports** in the central report column. No more exporting to Excel to manipulate your production, analysis *and* COGS data. View last actions, analysis trendlines (for the last 5 analyses) and group or filter numerical data by specific conditions or ranges.  Get into the Custom Report nitty gritty [here](https://support.innovint.us/hc/en-us/custom-reports?hsLang=en). The options are endless!

![](https://support.innovint.us/hs-fs/hubfs/image-png-Jan-23-2024-12-21-34-8719-AM.png?width=675&height=307&name=image-png-Jan-23-2024-12-21-34-8719-AM.png)

### Improvements

**A few improvements to InnoApp have been released:**

- You can now tap the work order icon in the lot or vessel details screen, and then select any open work order to go straight to the work order details page.
  ![](https://support.innovint.us/hs-fs/hubfs/image-png-Jan-23-2024-06-43-46-3775-PM.png?width=250&height=320&name=image-png-Jan-23-2024-06-43-46-3775-PM.png)
- If someone is making changes to a work order on the desktop app while another is working in InnoApp offline on the same work order, we've improved the messaging to alert the InnoApp user to any conflicts once both systems are online:
  ![](https://support.innovint.us/hs-fs/hubfs/image-png-Jan-23-2024-05-30-35-2613-PM.png?width=250&height=232&name=image-png-Jan-23-2024-05-30-35-2613-PM.png)

**New! Ability to select and copy lot codes on work order tasks**

It sounds so simple, but previously, you couldn't select lots codes on work orders in order to copy/paste them elsewhere, such as when creating a similar lot code within the work order... But, now you can!

![](https://support.innovint.us/hs-fs/hubfs/image-png-Jan-23-2024-05-32-04-7600-PM.png?width=400&height=70&name=image-png-Jan-23-2024-05-32-04-7600-PM.png)

**Improved Lot picker functionality and performance**

We've made some tweaks to the lot selector to improve performance for our users with large numbers of lots.  The lot search dropdown now contains a maximum of 200 lots - if you have more than 200 lots, at the end of the lost list, you'll see a message alerting you to use Search to narrow your query. Start typing in the search field to text search, or consider using the Lot Picker to use your filters.

![](https://support.innovint.us/hs-fs/hubfs/image-png-Jan-23-2024-06-55-20-9376-PM.png?width=300&height=176&name=image-png-Jan-23-2024-06-55-20-9376-PM.png)

**Modified Analysis Import not functioning for Individual Vessels**

We'll be honest, the [Modified Analysis Import](https://support.innovint.us/hc/en-us/articles/115002684812-analysis-import-format-guidelines-for-csv-file?hsLang=en#modifiedanalysisimport) was a little bit wonky for Individual Vessel analysis.  *Spoiler alert - the Vessel column can now be left blank or excluded entirely*. Instead, the file may now contain either lot codes *or* vessel codes in Column E - "Performed On," (although not both in the same file). This is the only column that links analysis to the lot or vessel.  If only vessel codes are recorded here, InnoVint will automatically select Individual Vessel analysis in the analysis import action, and if all lot codes are detected here, it automatically selects Lot Composite analysis.

![](https://support.innovint.us/hs-fs/hubfs/image-png-Jan-23-2024-07-08-25-3851-PM.png?width=300&height=164&name=image-png-Jan-23-2024-07-08-25-3851-PM.png)

You cannot backdate Individual Vessel analysis via analysis import if the lot is not ***currently*** in the selected vessel.

### Bugs

- For a short period in January, archived lots weren't showing in the Add/Remove cost lot picker, even if they had contents as of the selected backdate.
  ![](https://support.innovint.us/hs-fs/hubfs/image-png-Jan-23-2024-07-30-16-1662-PM.png?width=500&height=131&name=image-png-Jan-23-2024-07-30-16-1662-PM.png)

**If you added costs between January 12 and January 17 2023, please consider double-checking the involved lots or volume to ensure all costs are allocated as expected.**

- We were missing one! For our COGS aficionados, the Lot Cost Report export now includes the Equipment Depreciation cost category.
- [Blend trials](https://support.innovint.us/hc/en-us/blend-trials?hsLang=en) - we've tidied up some decimal weirdness in preparation for blending season!
