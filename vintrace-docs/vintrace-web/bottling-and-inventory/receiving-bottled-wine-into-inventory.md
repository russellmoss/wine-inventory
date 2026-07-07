---
id: "32303327680916"
title: "Receiving Bottled Wine into Inventory"
url: "https://support.vintrace.com/hc/en-us/articles/32303327680916-Receiving-Bottled-Wine-into-Inventory"
category: "vintrace Web"
section: "Bottling and Inventory"
created_at: "2024-11-20T15:52:43Z"
updated_at: "2024-11-26T19:43:15Z"
labels: ["estate", "wp-faq-1970", "receive bottled wine"]
gist: "This article assumes that the Inventory module is enabled."
tags: ["inventory", "packaging", "lot-identity", "barrels", "configuration", "naming"]
---

# Receiving Bottled Wine into Inventory

This article assumes that the Inventory module is enabled. If the module is not enabled, contact support.

To receive bottled wine into inventory, you’ll need to:

1. [Add the wine batch](#h_bf7f8cfa-1c4d-47ea-a170-794ad6c9ea45).
2. [Create the stock item for the bottle](#h_cafe93b1-790a-4865-8933-b5af37b88367). You can do this prior to or while receiving the bottled wine into inventory.
3. [Receive the bottled wine into inventory](#h_ee9ee983-bb45-4561-ae63-7d18151a78bd).

## Adding the Wine Batch

To create a new wine batch:

1. Click ![Vessels_Menu_Option_20200402.png](https://support.vintrace.com/hc/article_attachments/32329179366548) Vessels in the sidebar.
2. Click ![Plus_in_Green_Circle_20200319.png](https://support.vintrace.com/hc/article_attachments/32329179380372).
3. Select New Wine Batch.
4. Specify the details for the wine batch. At a minimum, you’ll need to enter a Batch Code, Owner, and Production Year.

![Create_Simple_Wine_Batch_-_Required_Fields_20221020.png](https://support.vintrace.com/hc/article_attachments/32329170103572)

If you’d like the ability to track and summarize product information, contact support to have the feature enabled.

5. Click Save.

After you create a new wine batch, vintrace automatically creates a bulk wine stock item for you.

## Adding Bulk Wine Stock Item for Bottles

To add a bulk wine stock item for your bottles, refer to our [Setting Up a Single Bottle Stock Item article](https://support.vintrace.com/hc/en-us/articles/32301345671956).

When adding the bulk wine stock to the Bill of Materials, be sure to select the bulk wine stock item that was created for your wine batch.

## Receiving Bottled Wine

To receive your bottled wine into inventory, refer to our [Receiving Stock article](https://support.vintrace.com/hc/en-us/articles/32303350382356) for details. If you haven’t created the stock item for the bottle, you can do so by clicking the ![Plus_in_Green_Circle_20200319.png](https://support.vintrace.com/hc/article_attachments/32329179380372) beside the Stock Item field in the Action Receive window and following the steps detailed in our [Creating and Viewing Stock Items article](https://support.vintrace.com/hc/en-us/articles/32303296023316).

![Action_Receive_-_Add_Stock_Item_Button_20200519.png](https://support.vintrace.com/hc/article_attachments/32329146910484)

When you specify the Route To details, remember that there are two types of storage areas in vintrace; depending on where the stock is received may affect your TTB report.

If the stock is received into a bonded storage area, the system marks it as received in bond on the bottling section of the tax class that was selected for the stock item of the bottle.

If the stock is received into a tax-paid storage area, the system ignores it for TTB purposes until it's moved into a bonded area.
