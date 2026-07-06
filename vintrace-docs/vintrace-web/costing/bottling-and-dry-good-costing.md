---
id: "32301332891796"
title: "Bottling and Dry Good Costing"
url: "https://support.vintrace.com/hc/en-us/articles/32301332891796-Bottling-and-Dry-Good-Costing"
category: "vintrace Web"
section: "Costing"
created_at: "2024-11-20T14:47:56Z"
updated_at: "2024-12-05T18:09:33Z"
labels: ["estate", "wp-page-2015", "bottling costs", "dry good costs", "inventory"]
gist: "If you’re tracking stock levels for your dry goods (e.g., corks, capsules, labels, glass) in vintrace, you can track their cost as well."
tags: ["cost", "packaging", "inventory", "configuration", "lot-identity", "transfers"]
---

# Bottling and Dry Good Costing

If you’re tracking stock levels for your [dry goods](https://support.vintrace.com/hc/en-us/articles/32303296023316) (e.g., corks, capsules, labels, glass) in vintrace, you can track their cost as well. Including these items on a [Bill of Materials (BOM)](https://support.vintrace.com/hc/en-us/articles/32303320516372) for a finished wine stock item will cause the dry good cost to transfer to the finished product when the item is bottled in vintrace. This, along with all costs associated with bulk wine, will give you a true Cost of Goods Sold (COGS) for the finished wine.

Dry goods used in bottling will impact the Packaging category for finished products you create.

## Average vs. LIFO or FIFO Costing on Dry Good Stock

By default, vintrace assumes the average weighted cost for all dry goods stock items that you track in vintrace. If you want to use the LIFO or FIFO method, you’ll need to have [lot/batch tracking enabled](https://support.vintrace.com/hc/en-us/articles/32303296023316) on your dry goods inventory items.

Each time you [receive inventory](https://support.vintrace.com/hc/en-us/articles/32303350382356), you’ll need to specify a lot/code. The cost of that lot is tracked independently of other lots that you already have in stock. You can achieve LIFO or FIFO costing by selecting the appropriate lot when you deplete these stock levels.

## Setting the Default Price for Dry Goods

You can set up your dry goods items from the Winery Setup window (Setup Options > General Stock Items).

To set the default price for dry goods:

1. Click ![Setup_Icon_20200318.png](https://support.vintrace.com/hc/article_attachments/32329045523860) Set Up in the sidebar.
2. Click Materials.
3. Click Configure in the appropriate tile.
4. Click the item.
5. In the Order Price field, enter the current per unit price from your supplier.

![Update_Packet_Item_-_Order_Price_20200623.png](https://support.vintrace.com/hc/article_attachments/32329050950420)

6. Click Save.

## Capturing Costs When You Receive Dry Goods

If you don’t set up order price and don’t use purchase orders from vintrace, you can still capture the cost when you [receive stock](https://support.vintrace.com/hc/en-us/articles/32303350382356). To do this, enter the unit price in the Price field of the Action Receive window.

![Action_Receive_-_Price_20200623.png](https://support.vintrace.com/hc/article_attachments/32329040559636)

Refer to our [Receiving Stock article](https://support.vintrace.com/hc/en-us/articles/32303350382356) to learn more.

## Adding Costs After Receiving an Invoice

If you don’t know the cost of an item when you receive it, you can add the cost information at a later time (i.e., when you get the invoice). For example, suppose you used glass in bottling, but didn’t get the invoice for the glass until after the bottling was recorded. You can update the cost and have it ripple forward to the finished bottled product.

To add costs after you've received an invoice:

1. Use vintrace’s Quick Search to find the item.
2. From the Stock Item Overview window, select the History tab.
3. Click View that’s beside the Receive operation. The Action Receive window displays.
4. Click Correct.

![Action_Receive_-_Correct_Button_20200623.png](https://support.vintrace.com/hc/article_attachments/32329040485012)

5. Update the price and/or any quantities that you received.
6. Enter an explanation in the Reason for Correction field.
7. Click Save.

The updated price and/or quantities will ripple forward to any costs that need to be updated.

## Adding Additional Costs During Bottling

You can add additional costs such as cellar labor, forklift costs, and third-party bottling charges during bottling. In order to do this, be sure that you’ve [set up cost items](https://support.vintrace.com/hc/en-us/articles/32301359350932).

To add additional costs as part of the [Packaging (Bottling) operation](https://support.vintrace.com/hc/en-us/articles/32303327186836), click Add Extra Costs.

![Packaging_-_Add_Extra_Costs_20200623.png](https://support.vintrace.com/hc/article_attachments/32329068979604)
