---
title: "Reporting on Dry Goods"
url: "https://support.innovint.us/hc/en-us/articles/115000871603-reporting-on-additions-per-additive-or-batch-number"
category: "MAKE"
section: "Dry Goods"
page_type: "article"
lastmod: "2025-11-20"
gist: "View the history of receipts, depletions or adjustments on each batch using the Dry Goods Explorer."
tags: ["packaging", "reporting", "additives", "exports", "lot-identity", "cost"]
---

# Reporting on Dry Goods

This article covers:

- [How to view Dry Good history](#additive)
  - [Per batch](#per_batch)
- [Additive History Report](#report)
- [Packaging History Report](#packaging)
- [Frequently Asked Questions (FAQ)](#faq)

### How to view Dry Good history

View the history of receipts, depletions or adjustments on each batch using the Dry Goods Explorer.

#### View Additive or Packaging History per Batch

Go to the Dry Good Explorer from the left side navigation bar, then select the Additive or Packaging item that you wish to view. This opens the Product details page. From the Product details page, in the Batches tile, click on *Details* (far right) to open the Batch History. This opens the Batch details page.

![Reporting Dry Goods_Batch history](https://support.innovint.us/hs-fs/hubfs/Reporting%20Dry%20Goods_Batch%20history.webp?width=688&height=239&name=Reporting%20Dry%20Goods_Batch%20history.webp)

Batch histories can be exported to a csv file by clicking on Export in the top far right of the History card.

### Additive History Report

Download the Additive History Report to view all actions and adjustments involving additive batches within a date range, including addition actions and receiving new inventory. Go to Reporting > Activity Reports > Additive History Report. Select your date range, then download.

![Reporting Dry Goods_Additive history](https://support.innovint.us/hs-fs/hubfs/Reporting%20Dry%20Goods_Additive%20history.webp?width=688&height=165&name=Reporting%20Dry%20Goods_Additive%20history.webp)

The export provides a batch-by-batch, lot-by-lot breakdown of used, scrap, and adjusted amounts.

Cost changes are included if COGS Tracking is activated. Check out this article for additional information on [Dry Goods Tracking & COGS.](https://support.innovint.us/hc/en-us/cogs-and-dry-goods-tracking?hsLang=en)

### Packaging History Report

Download the Packaging History Report to view all actions and adjustments involving packaging batches within a date range, including bottling actions, add packaging actions, adjustments, depletions, and receiving new inventory. Go to Reporting > Activity Reports > Packaging History Report. Select your date range, then download.

![Reporting Dry Goods_Packaging history](https://support.innovint.us/hs-fs/hubfs/Reporting%20Dry%20Goods_Packaging%20history.webp?width=688&height=102&name=Reporting%20Dry%20Goods_Packaging%20history.webp)The export provides a batch-by-batch breakdowns of used, scrap, and adjusted amounts. Sort by product name, juice/wine lot code, case good lot code, product owner, etc.

Cost changes are included if COGS Tracking is activated. Check out this article for additional information on [Dry Goods Tracking & COGS.](https://support.innovint.us/hc/en-us/cogs-and-dry-goods-tracking?hsLang=en)

### FAQ

**Q. How do I find my inventory at a point in time?**

*A. The best way to find your dry goods inventory at a point in time is to utilize the Additive or Packaging History Report.  These reports are run on a user specified time range. To create a report and find your point in time data, that time range must include the earliest date that a product was received, through the date that you want to find your point in time inventory.*

*From these reports, you can utilize a pivot table to total on-hand quantity and cost as of a specific point in time.*

**Q. Why does my on-hand inventory show a negative number?**

*A. Negative on-hand inventory indicates that more additive was used of that batch than was entered into the system. For example, 5kg of DV10 yeast, Batch # 12345 was entered into InnoVint as the Total Amount. Over the course of harvest, 6.2kg of DV10 yeast, Batch #12345 was used. InnoVint will show that Batch # 12345 now has an on-hand inventory of -1.2kg.*

*To update the on-hand inventory, you'll need to either A) edit the batch to change the total amount of the additive, or B) adjust the on-hand inventory from the Additive details page. Make sure to fully deplete a batch when it has been used up to avoid selecting a batch number that no longer exists in inventory for future additions.*

*Note: For accounts with the Costing feature activated, a negative batch inventory will still apply costs on a price-per-unit basis. For example, 5kg of DV10 yeast, Batch # 8675309 might cost $450, or $0.09 per gram. If Batch # 8675309 currently has a negative inventory and is selected and used in an Addition action, InnoVint will still calculate and apply the $0.09 per gram of yeast to the appropriate lot(s).*
