---
title: "1/13/2026 Product Updates: Predicted Analysis, Lot Cost Report and Performance Improvements"
url: "https://support.innovint.us/hc/en-us/product-updates-predicted-analysis-lot-cost-report-and-performance-improvements"
category: "Product Updates"
section: "Product Updates: 2025-2026"
page_type: "page"
lastmod: "2026-01-14"
gist: "Check out our product updates through January 13, 2025!"
tags: ["release-notes", "cost", "lab", "reporting", "blending", "harvest"]
---

# 1/13/2026 Product Updates: Predicted Analysis, Lot Cost Report and Performance Improvements

Check out our product updates through January 13, 2025! Here's a couple shortcuts to find specific items!  Jump quickly to:

- [Blend Trials Predicted Analysis](#Blend_trials)
- [FINANCE & Lot Cost Report](#FINANCE)
- [Harvest-related changes](#Harvest)
- [InnoApp workflow improvements](#InnoApp)
- [Performance Improvements](#Performance)
- [More fun stuff](#Other_stuff)
- [SUPPLY!](#SUPPLY)

### MAKE: Features and Improvements

#### Predicted analysis in Blend Trials

![Blend Trials_Predicted Analysis](https://support.innovint.us/hs-fs/hubfs/Blend%20Trials_Predicted%20Analysis.png?width=670&height=364&name=Blend%20Trials_Predicted%20Analysis.png)

Complementing our predicted blend costs, you can now view your predicted analysis for a mock blend using existing analysis values!

This features uses Lot Composite analyses results to estimate the weighted average for: Alcohol, Ethanol (including @20C and 60F), Titratable Acidity, Malic Acid, Volatile Acidity, Acetic Acid, Free SO₂, Total SO₂, Residual Sugar, Glucose/Fructose, Glucose, Fructose, and Total Sugar.  Find all the nitty gritty details [here](/hc/en-us/blend-trials#What-to-expect).

#### FINANCE: Enhanced Lot Cost Report functionality

- We've tweaked the Lot Cost Report so that it automatically displays all lots that had cost or contents as of the selected point in time, whether they are empty or archived. This report also now runs so much faster!
- We added a new Direct fruit cost by component report - this report gives you a point in time breakdown of which block components contributed to the overall direct fruit costs on your lot.
- **Find out more about both reports [here](/hc/en-us/cost-reports#Lotcost)!**

  ![Lot Cost Export](https://support.innovint.us/hs-fs/hubfs/Lot%20Cost%20Export.png?width=265&height=126&name=Lot%20Cost%20Export.png)

#### Harvest Related Changes

##### TTB Reporting: Tax classes renamed

In order to more closely reflect the actual TTB 5120.17 Report (the 702), we updated the nomenclature for two tax classes.  *No changes were made to how these tax classes behave.*

- "Fermenting Juice" has been renamed to "In Fermenters"![TTB_In Fermenter Part VII](https://support.innovint.us/hs-fs/hubfs/TTB_In%20Fermenter%20Part%20VII.png?width=670&height=68&name=TTB_In%20Fermenter%20Part%20VII.png)

- "Sweetening juice" has been renamed to "Juice"![TTB_Juice_Markup](https://support.innovint.us/hs-fs/hubfs/TTB_Juice_Markup.png?width=670&height=216&name=TTB_Juice_Markup.png)

##### Better pre-harvest support for the Southern Hemisphere

We now support both Southern and Northern Hemisphere growing seasons! Depending on your winery settings, your current year "vintage" can behave in different ways.

- Northern Hemisphere: current vintage is set for January 1 - December 31
- Southern Hemisphere: current vintage is set for July 1 - June 30

This current vintage setting impacts the default vintages available in menus, as well as your vineyard reports - such as the Current Harvest Report and Vintage Phenology and Forecasting Report.

#### InnoApp updates!

- Checking your starting dip? When you scan a vessel's QR code, you can now see the tank’s current dip along with the fill volume. Want to know more about dip charts? [Check 'em out!](/hc/en-us/articles/360050058652-managing-and-using-dip-charts-in-innovint?hsLang=en)

  ![InnoApp_volume-dip on vessel](https://support.innovint.us/hs-fs/hubfs/InnoApp_volume-dip%20on%20vessel.png?width=295&height=168&name=InnoApp_volume-dip%20on%20vessel.png)
- Writing work orders and choosing vessels ahead of time? We've added a new warning to the [scan to check off feature](/hc/en-us/wo-overview#check_off). This warning will display when the scanned vessel is not in the lot on the work order (for drained lots) or if the vessel already contains a different lot (when filling).

#### More performance improvements!

- Working in liters or hectoliters? Enjoy faster dip chart loading for metric wineries.
- Load times are quicker for the Winery Activity Feed, Lot History page, Recent Actions widget on the Dashboard, and Lot Cost Report for a smoother experience.
- The Lot details Additive tab export now supports more batches.
- Cost recalculations are now faster when updating fruit costs in the Fruit Cost Worksheet and Vineyard Contracts.

#### Other cool stuff we worked on!

- We now support a new Lab Source (the source icon displays on results) for analysis results generated via [Onafis](https://www.wineindustrynetwork.com/c/onafis?utm_source=wineindustrynetwork.com&utm_medium=website) built integrations.
- Lot color and style columns have been added to the lot import: when creating new lots via the [lot import csv](/hc/en-us/how-to-import-lots-via-csv?hsLang=en), color and style are now required fields (and automatically populate on your new lots!).
- We made changes to support better formatting across notes and [work order printing](/hc/en-us/work-order-print?hsLang=en). For summarized work order print views and InnoApp, notes now respect line breaks, bullets, and emojis to help you communicate more clearly
- An action filter has been added to the Lot Details > History tab. It works like the Winery Activity Feed action filter, and for long lists (like multiple pages of punchdowns ), there’s also a “show only movements” button.
  - If you miss the Additions tab (which we upgraded to [Additives](/hc/en-us/calculated-additives?hsLang=en)), this button is for you! Find the right actions faster!
  ![Product Update_Lot History Action Filter](https://support.innovint.us/hs-fs/hubfs/Product%20Update_Lot%20History%20Action%20Filter.png?width=670&height=262&name=Product%20Update_Lot%20History%20Action%20Filter.png)

### SUPPLY

- We've optimized the SUPPLY app so that [supply.innovint.us](http://supply.innovint.us) works seamlessly on smaller devices for [mobile navigation](/hc/en-us/navigating-supply#mobile)!
- We now support the creation of "Open Depletions", which will populate a new On-Order status on your SUPPLY SKUs so you can keep track of inventory that is part of an unfulfilled order.  Find out more [here](/hc/en-us/supply-on-order-status?hsLang=en)!
- We've added notes!  Each action (and open depletion) now supports a note field. Find out more about notes here.

  **Fun fact!**  The search fields in the Action History Feed and Open depletions explorer will search your notes' text!
- Try out the new Inventory Explorer in SUPPLY, and use our newest point in time report to know what you have in inventory, where, and when! Learn about all SUPPLY reporting [here](/hc/en-us/reporting-in-supply?hsLang=en)!

![](https://support.innovint.us/hs-fs/hubfs/image-png-Jan-14-2026-12-36-30-1849-AM.png?width=670&height=178&name=image-png-Jan-14-2026-12-36-30-1849-AM.png)
