---
id: "32301345671956"
title: "Setting Up a Single Bottle Stock Item"
url: "https://support.vintrace.com/hc/en-us/articles/32301345671956-Setting-Up-a-Single-Bottle-Stock-Item"
category: "vintrace Web"
section: "Bottling and Inventory"
created_at: "2024-11-20T14:48:36Z"
updated_at: "2024-11-26T19:46:13Z"
labels: []
gist: "You can set up a single bottle stock item prior to bottling, or at the time of bottling."
tags: ["inventory", "packaging", "configuration"]
---

# Setting Up a Single Bottle Stock Item

You can set up a single bottle stock item [prior to bottling](#h_64ca9764-3b8b-4068-b316-5ecb8f5865ee), or [at the time of bottling](#h_6d5d535c-de88-4d09-ac80-f77e61dc5980).

## Setting Up Prior to Bottling

If you want to set up the single bottle stock item prior to bottling, you can either:

- Click ![Inventory_Menu_Option_20200406.png](https://support.vintrace.com/hc/article_attachments/32329193215892) Inventory in the sidebar, then click New Item.
- Click ![Setup_Icon_20200318.png](https://support.vintrace.com/hc/article_attachments/32329183238804)Set Up in the sidebar, click Wine Items, then click Configure in the Single x1 Items tile.

Next, follow the [steps below](#h_c3d73fcb-3ad3-45c9-89c2-70cb336b0563).

## Setting Up During Bottling

If you want to set up the single bottle stock item at the time of [bottling](https://support.vintrace.com/hc/en-us/articles/32303327186836), click the ![Plus_in_Green_Circle_20200319.png](https://support.vintrace.com/hc/article_attachments/32329187922452) beside the Stock Item field in the Packaging window.

Next, follow the [steps below](#h_c3d73fcb-3ad3-45c9-89c2-70cb336b0563). If you add your single bottle stock item during bottling, the new stock item will be automatically used in the Packaging window.

## Adding a Single Bottle Stock Item

To create a stock item for your bottle of wine:

1. From the Stock Type list, select *Single x 1*.

![Select_the_Type_of_Stock_-_Single_x1_20200518.png](https://support.vintrace.com/hc/article_attachments/32329173328532)

2. Specify the details for the single bottle. Below is a description of some of the fields in the General tab.

- Stock Code — Be sure to use a code that follows your company’s policy. We recommend using a convention that makes it easier for you to find the item in the future and allows you to distinguish between single bottles, shiners (cleanskins), and cases. For example, you may want to include “/BTL” in the code for a single bottle.
- Stock Category — Select *Bottled Wine*.
- Tax Class (US clients only) — Select the tax class for the item; you must have declared the wine as a finished product.
- Alcohol Content — If you don’t have a recent, measured alcohol reading, or haven’t declared the bulk wine, you may add them later. However, they must be in place for the bottling/packaging operation.
- Enable Batch Tracking — Select this checkbox to enable batch tracking. Once this setting is enabled, it cannot be disabled in the future. If you opt to not enable it at this time, you can do so later.
- Track Stock Levels — Select this checkbox to track stock levels. Once this setting is enabled, it cannot be disabled in the future. If you opt to not enable it at this time, you can do so later.

3. In the [Bill of Materials](https://support.vintrace.com/hc/en-us/articles/32303320516372) section, enter the list of dry good inventory, plus the bulk wine that make up a single bottle. At a minimum, you need the bulk wine component.

When searching for bulk wine, be sure to de-select the Hide Bulk Wine Items checkbox. If the code of your bulk wine batches end with “/BLK”, you can search for *%BLK*.
![Search_For_Stock_Item_-_Hide_Bulk_Wine_Items_Unchecked_20200521.png](https://support.vintrace.com/hc/article_attachments/32329217236500)

To add additional items to the Bill of Materials, click Add Line.

A typical Bill of Materials for a single bottle of wine includes:

- 0.75L of bulk wine
- 1 bottle
- 1 cap/cork/crown
- 1 front label
- 1 back label

![Create_Stock_Item_-_Single_x1_20200518.png](https://support.vintrace.com/hc/article_attachments/32329193298196)

It’s up to you what comprises a bottle and what items you want to track as dry-good inventory. However, each of the items in your Bill of Materials must be [created as a stock item](https://support.vintrace.com/hc/en-us/articles/32303296023316). With the exception of the bulk wine, each item will have a quantity of 1.

4. Click Save.

Users with a multi-winery license can specify which stock items are available at each winery. Refer to our [Configuration for Multi-Winery Support article](https://support.vintrace.com/hc/en-us/articles/4413475617423) for details.
