---
id: "32303306851732"
title: "Decanting Bottles to Bulk"
url: "https://support.vintrace.com/hc/en-us/articles/32303306851732-Decanting-Bottles-to-Bulk"
category: "vintrace Web"
section: "Bottling and Inventory"
created_at: "2024-11-20T15:52:05Z"
updated_at: "2024-11-21T10:29:25Z"
labels: ["estate", "wp-faq-2038"]
gist: "This article covers how to take bottles in inventory and dump them to bulk."
tags: ["packaging", "inventory", "ttb", "reporting", "lot-identity", "configuration"]
---

# Decanting Bottles to Bulk

This article covers how to take bottles in inventory and dump them to bulk. For US customers, this triggers the correct TTB events for your TTB report to show that the wine has been dumped to bulk.

If you’re using the Sparking module and the wine is still on tirage, you should use the Tirage Admin operation. The Tirage Admin operation transfers your tiraged stock back into a tank in a single operation and takes care of your TTB reporting. The specific options for moving tirage stock back to tank are in the Split/Transfer tab.

## US Customers

You must have a wine batch linked to your bottles so that it’s classed as a wine stock item and tracked on your TTB report. If the wine has previously been packaged within vintrace, it’s likely already linked.

When viewing bottled stock, you can check if it’s a wine stock item in the Bill of Materials. The BOM will have a line item containing a [wine batch]/BLK item with an associated volume. The bottled stock will also need to have its tax class set.

Refer to our [Receiving Bottled Wine into Inventory article](https://support.vintrace.com/hc/en-us/articles/32303327680916) if you’re unsure as to whether the wine you’re dumping to bulk is a wine stock item, or you want to first receive the goods before dumping to bulk.

## Dumping Bottles to Bulk

1. Confirm that the stock item is a wine stock item. If it’s not, create the appropriate wine stock item.
2. Perform an Adjustment operation against the bottles. Be sure the items are in a non-tax paid area and set the Reason to *TTB - Dumped to Bulk*; this shows the bottled stock as dumped to bulk on the TTB report.

## Bringing the Wine into the System

1. Click the ![Operations_Icon_20200407.png](https://support.vintrace.com/hc/article_attachments/32329103323540) Operations icon.
2. From the General section, click Bulk Intake.
3. Ensure that the General tab is selected, then select the Wine Details sub-tab.
4. From the Batch field, click the to search for the batch/lot of wine you’re dumping to bulk.
5. Set the Volume to 0.01 gallons. Be sure to do this as it’s important for the upcoming steps.

![Bulk_Intake_-_General_-_Wine_Details_20200514.png](https://support.vintrace.com/hc/article_attachments/32329081667220)

6. Specify the other details for the wine including its fraction type, fermentation state, and color.
7. Select the Vessels sub-tab.
8. From the Destination Vessels section, select the vessel you want to put the wine into.
9. In the Transfer In field, enter the amount you’re dumping to bulk.
10. Click the ![Calculator_Icon_20200410.png](https://support.vintrace.com/hc/article_attachments/32329081632788) located in the lower right. This calculates the gain required in the Loss in the Transfer Options section.

![Bulk Intake - General - Vessels - Calculated Gain 20240320.png](https://support.vintrace.com/hc/article_attachments/32329084752276)

11. From the Loss Reason list, select *TTB - Bottled Dumped to Bulk*.
12. Specify the details for the composition and any other details you’d like to record (e.g., analysis, additions).
13. Save the operation.

This will have 0.01 gallons of the wine arrive in the winery, followed by a gain up to the amount as bottled dumped to bulk. Depending on your TTB precision, this will be rounded to the nearest whole gallon.

If you have any questions about the process, contact the support desk.
