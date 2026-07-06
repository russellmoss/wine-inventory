---
title: "10/5/2022 Release Notes: Improved Work Order printing and the \"multi\" winery Lot Explorer!"
url: "https://support.innovint.us/hc/en-us/10/5/2022-release-notes"
category: "Product Updates"
section: "Product Updates: 2017 - 2022"
page_type: "page"
lastmod: "2025-11-20"
gist: "The software releases through September 30, 2022 include:."
tags: ["exports", "release-notes", "work-orders", "reporting", "transfers", "harvest"]
---

# 10/5/2022 Release Notes: Improved Work Order printing and the "multi" winery Lot Explorer!

The software releases through September 30, 2022 include:

### Improvements

#### Printed Work Orders (Beta) - More tasks and multiple tasks included!

Layout and print improvements continue for our work orders, and we now support the following tasks in the new "beta" version: Drain and Press, Juice Bleed/Saignee, Analysis, Receive Fruit, Process Fruit to Volume and Weight and Topping.

Any combination of these with the existing beta print supported tasks (Blend, Rack, Transfer, Barrel Down, Top Off, Filter) will also work with multiple tasks in a work order.

*Bonus:* Skipped tasks will no longer print.

![](https://support.innovint.us/hubfs/image-png-Oct-03-2022-07-16-36-87-PM.png)

#### Performance improvements

We increased the load speed of the Fermentation Management Worksheets so you can get your data faster!

#### Contract Explorer & export filters

These filters now respect vintage and variety, as a subset of the larger contract. Example: if you filter for Syrah, you will see all contracts that include Syrah blocks in your export; if you filter for 2021, you will see all contracts that include the vintage 2021.

#### Save layouts in the "Multi-Winery" Lot Explorer - this is not just for multi-winery accounts!

Even if you only have one winery account, you should still check out this powerful personalized reporting tool (in Report Explorer/Multi-Winery Reports) that allows you to view and analyze lot data for **one** or more wineries.

![](https://support.innovint.us/hubfs/image-png-Oct-03-2022-05-33-32-59-PM.png)

You can:

- Personalize your data set: select which columns to show or hide, and drag and re-order columns as needed
- Filter by any of the columns in the report, using single or multi-select options, and click on each column header to sort and re-sort
- Pin columns on the left or ride side of the table
- Group inventory under any column header with simple drag-and-drop functionality
- View selected lot analyses values directly within the multi-winery lot explorer

And, the "Multi-Winery" Lot Explorer (beta) now allows you to save multiple versions of these personalized reporting layouts, which are saved at the winery level.

#### Increased visibility into work order edits

To increase traceability, edited work order actions now show an EDITED stamp on the task, instead of DELETED, and link to the most recent (edited) action.

#### Relative volume functionality for Blend work order tasks

You can now specify either the volume that should be removed from a vessel, *or* what the ending fill of a vessel should be on a blend task. This flexibility allows you to request your specified blend volumes without other scheduled movements on a lot or vessel impacting the volume displayed on a work order.

There is a new Task drop-down under the 'REQUEST' section. After clicking into the drop-down, the user can select "Ending fill" or "Remove". If user selects "Ending fill", they input the volume that each vessel should end with after completing this step of the task. If the user selects "Remove", they can then specify the volume that should be removed from each vessel.

![](https://support.innovint.us/hubfs/image-png-Oct-03-2022-07-11-48-20-PM.png)

#### Work Order Addition Tasks now display both inventory and addition unit totals

Addition tasks in work orders will now display the total additive amount required in both the addition units (grams in the screenshot) and the inventory units (kilograms).

![](https://support.innovint.us/hubfs/image-png-Oct-06-2022-04-40-46-63-PM.png)

#### Tank Maps - View current stage analysis in the hover

You now have the option to include "Stage Dependent Analysis" (see specifics on Stage Dependent Analysis [here](https://support.innovint.us/hc/en-us/articles/205001715-analysis-reporting?hsLang=en#dashboardsnap)) in your tank hover labels.

![](https://support.innovint.us/hs-fs/hubfs/image-png-Oct-06-2022-04-54-17-04-PM.png?width=171&name=image-png-Oct-06-2022-04-54-17-04-PM.png) ![](https://support.innovint.us/hs-fs/hubfs/image-png-Oct-06-2022-04-55-19-78-PM.png?width=161&name=image-png-Oct-06-2022-04-55-19-78-PM.png)

### Bug Fixes

- TTB Report, Part VII, In Fermenters was not populating correctly for Process Fruit to Volume actions between March and August 2022.
- Crop estimates will no longer show an excessive number of decimal places for accounts using the metric system.
