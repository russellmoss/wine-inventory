---
id: "32301358718356"
title: "Lot Tracking Traceability"
url: "https://support.vintrace.com/hc/en-us/articles/32301358718356-Lot-Tracking-Traceability"
category: "vintrace Web"
section: "Winemaking"
created_at: "2024-11-20T14:48:13Z"
updated_at: "2025-01-15T19:59:30Z"
labels: []
gist: "This functionality is only available to users with the Inventory module."
tags: ["additives", "inventory", "lot-identity", "naming", "configuration", "reporting"]
---

# Lot Tracking Traceability

This functionality is only available to users with the Inventory module.

vintrace makes it easy for you to track lot codes. By [enabling batch tracking for your additives](#h_01ESKYGZTZJ8SHYCAYGB141RQK), you can [enter the lot codes any time you receive stock](#h_01ESKYHC0HN7E0XY86WNJP5A3X). Since you can enter the expiration date for each stock item, you can [add a dashlet](#h_01ESKY9ETWY3H1HC3T5T0XBKCB) to your Dashboard to alert you of expiring lots.

When you use the additive in an addition, you’ll be able to [select the specific lot code being used for the operation](#Selecting_Lot_For_Additions). You’ll then be able to view the lot codes used for your wine batches and by running the [Wine Addition Impact Report](#Wine_Addition_Impact_Report).

## Setting Up Your Additives

If you want to track our lots, there are a few settings that you’ll need to enable when you [set up a new additive](https://support.vintrace.com/hc/en-us/articles/32301344910740) in vintrace. Specifically , be sure to select the Enable Batch Tracking checkbox and Track Stock Levels checkbox.

![Additive_20201130.png](https://support.vintrace.com/hc/article_attachments/32329098697748)

Once the Enable Batch Tracking and Track Stock Levels checkboxes are selected, they cannot be de-selected.

If you’ve already set up your additives and have started using them in vintrace without enabling batch tracking, you’ll need to de-activate the existing additives and re-add them with lot tracking enabled. To do this:

1. Update the existing additive as follows:

- Rename the additive to include *No Lot Tracking* in its name. Doing this enables you to distinguish it from the additive that you’ll add that has lot tracking enabled.
- Select the Inactive checkbox.

![Additive_without_Batch_Tracking_20201130.png](https://support.vintrace.com/hc/article_attachments/32329098745492)

2. Set up a new additive being sure to select the Enable Batch Tracking checkbox and Track Stock Levels checkboxes.

Once you’ve set up your additives with batch tracking, you’ll be able to [record the lot and batch number any time you receive stock](#h_01ESKYHC0HN7E0XY86WNJP5A3X).

## Receiving Stock

The lot codes for existing inventory displays in the Stock item Overview window’s Lots tab.

![Stock_Item_Overview_-_Lots_Tab_20201130.png](https://support.vintrace.com/hc/article_attachments/32329124202900)

When you [receive stock](https://support.vintrace.com/hc/en-us/articles/32303350382356) for an additive that has batch tracking enabled, you MUST specify a lot code for the item. As part of the receival process, you’ll need to route the stock to the correct location. Existing lot codes display at the top of the Route Stock to Storage Area(s) window. If an existing lot code applies to the stock that you’re receiving, you can select it and vintrace automatically fills in the location and stock number.

![Inventory_-_Receive_-_Route_Stock_with_Existing_Lots_20201130.png](https://support.vintrace.com/hc/article_attachments/32329124250644)

If none of the existing lots apply to the stock that you’re receiving, you can add the item’s batch/lot number.

![Inventory_-_Receive_-_Add_Batch_Lot_Number_20201130.png](https://support.vintrace.com/hc/article_attachments/32329124277396)

If you don’t know the lot code at the time of receival, we recommend entering text in the Lot/Batch # field that makes it easy for you to identify inventory items that are missing the information. For example, you could enter *FIND LATER* in the Lot/Batch # field.
![Inventory_-_Receiving_-_Missing_Lot_Code_20201130.png](https://support.vintrace.com/hc/article_attachments/32329125731476)
We do NOT recommend entering a bogus lot code such as 12345 or 9999 because they’ll be harder to identify and correct later on.

## Identifying Expiring Lots

The Additives Expiring < 30 Days dashlet makes it easy for you to see which additives will be expiring.

![Expiring_Additives_20201130.png](https://support.vintrace.com/hc/article_attachments/32329124315412)

You can [add this dashlet](https://support.vintrace.com/hc/en-us/articles/32303339922452) and many others to your vintrace Dashboard.

![Adding_Additives_Expiring_Dashlet_20201130.png](https://support.vintrace.com/hc/article_attachments/32329098830228)

## Selecting a Lot for Additions

When you [create a work order](https://support.vintrace.com/hc/en-us/articles/32303315610388) or perform an operation that uses the additive, you’ll need to select the lot code that you want to use. If there’s only one lot, vintrace will automatically use that lot for the operation.

![Multi_Additions_-_Routing_Stock_20201130.png](https://support.vintrace.com/hc/article_attachments/32329098762004)

## Viewing Lot Codes for a Batch

To view the lot codes for additives in a batch:

1. View the batch.
2. From the [Product page](https://support.vintrace.com/hc/en-us/articles/32303310460948), select the Adds tab.
3. From the Summarize Results By list, select *Additive and Lot*.
4. Click a lot code in the Lot # column to view the [Wine Addition Impact Report](#Wine_Addition_Impact_Report) for the batch and additive.

![CS19Pro_Group_8_-_Adds_Tab_20201130.png](https://support.vintrace.com/hc/article_attachments/32329124371732)

By default, the Wine Addition Impact Report displays current wines for the selected lot and wine.

![Wine_Addition_Impact_Report_-_B154242_-_CS19PRO_Group_8_20201130.png](https://support.vintrace.com/hc/article_attachments/32329137840404)

To view all wines that use the lot, click the ![X_in_Gray_Circle_20200330.png](https://support.vintrace.com/hc/article_attachments/32329124347412) remove icon to remove the value in the Wine/Batch field, then click Search.

![Wine_Addition_Impact_Report_-_No_Wine_Batch_20201215.png](https://support.vintrace.com/hc/article_attachments/32329113140372)

## Wine Addition Impact Report

When you [view the Wine Addition Impact Report from a batch](#Viewing_Lots_for_Batch), it automatically filters the report for the lot and wine batch, and only displays current wines.

To view all wines that use the lot, click the ![X_in_Gray_Circle_20200330.png](https://support.vintrace.com/hc/article_attachments/32329124347412) remove icon beside the Wine/Batch field. To include dispatched and packaged wines, select the Dispatched Bulk Wine and Packaged Wine checkboxes. Be sure to click Search after changing any of the filters.

![Wine_Addition_Impact_Report_-_B154242_-_Current_Dispatched_Packaged_20201130.png](https://support.vintrace.com/hc/article_attachments/32329090137492)

If you’ve included dispatched and packaged wine, those wines display below the current wines. Click the arrow beside the section to display those wines.

![Wine_Addition_Impact_Report_-_Dispatched_and_Packaged_Wines_20201130.gif](https://support.vintrace.com/hc/article_attachments/32329098946708)

The first three columns (i.e., Batch, Vessel, and Volume) display information about the current wine. The Additive column and the columns to its right (i.e., Lot#, Add Date, Rate, Add Total, Add Batch, Add Vessel) display information about the additive. For example, the Add Date displays the date the additive was added; the Add Batch displays the name of the batch when the addition was made.

![Wine_Addition_Impact_Report_-_Output_20201215.png](https://support.vintrace.com/hc/article_attachments/32329090156436)

To view a batch’s information in the Product Overview window, click its name in the Add Batch column. To view the addition operation that used the additive, click the ![Eye_-_Gray_20201130.png](https://support.vintrace.com/hc/article_attachments/32329126058772) view icon.

You can also export the wines to a CSV or PDF file.

You can also run the Wine Addition Impact Report from the Winery Reports window (Product History report category). However, you’ll need to provide the filters for the report (e.g., additive, lot/batch).
![Winery_Reports_-_Product_History_-_Wine_Addition_Impact_Report_20201130.png](https://support.vintrace.com/hc/article_attachments/32329137981076)

When viewing packaged wines, you can click the ![View_Packaging_Icon_20201214.png](https://support.vintrace.com/hc/article_attachments/32329099013268) Packaging icon to view the packaging work order.

![Wine_Addition_Impact_Report_-_View_Packaging_Work_Order_20201215.png](https://support.vintrace.com/hc/article_attachments/32329125977236)

The lot code displays in the packaging work order.

![Packaging_-_Lot_20201215.png](https://support.vintrace.com/hc/article_attachments/32329099128596)

## Inventory Stock Report

To see all the current additives' lots, expiration dates, and manufacture dates, run the [Inventory Stock Report](https://support.vintrace.com/hc/en-us/articles/360000824416-Inventory-Stock-Report) and send the output to a CSV.

![Inventory Stock Report - Format CSV 20240220.png](https://support.vintrace.com/hc/article_attachments/32329099160212)

## Viewing Lots in the Product Overview Window

Like the Product page, the Product Overview window’s Adds tab displays information about the additives. Be sure to select the *By Additive and Lot* option.

You can access the Product Overview window by selecting ![More_Options_20200323.png](https://support.vintrace.com/hc/article_attachments/32329090204948) More Options from the sidebar, then clicking Historic Wines in the Products tile.

To view the Wine Addition Impact Report, click the lot in the Lot column.

![Product_Overview_-_Adds_Tab_20201130.png](https://support.vintrace.com/hc/article_attachments/32329137966228)
