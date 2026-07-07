---
id: "32303309107476"
title: "Labelling Shiner (Cleanskin) Stock"
url: "https://support.vintrace.com/hc/en-us/articles/32303309107476-Labelling-Shiner-Cleanskin-Stock"
category: "vintrace Web"
section: "Bottling and Inventory"
created_at: "2024-11-20T15:52:31Z"
updated_at: "2026-05-19T22:47:35Z"
labels: ["estate", "wp-page-5997"]
gist: "Unlabeled bottles of wine stock in inventory are frequently referred to as shiners in North America, and cleanskins in the Southern Hemisphere."
tags: ["inventory", "packaging", "configuration", "lab"]
---

# Labelling Shiner (Cleanskin) Stock

Unlabeled bottles of wine stock in inventory are frequently referred to as *shiners* in North America, and *cleanskins* in the Southern Hemisphere. This article details how to label shiner (cleanskin) stock produced by a packaging (bottling), and labeled at a later date.

Prior to labelling your shiner stock, we recommend that you familiarize yourself with bottling in vintrace by reading our [Packaging (Bottling) Operation article](https://support.vintrace.com/hc/en-us/articles/32303327186836-Recording-a-Bottling-Packaging-Operation).

Labelling shiners is a two-part process. First, you’ll need to [set up your stock item](#h_eee7cc97-e394-4352-812f-154c21ba82b6), then [use vintrace’s Manufacture operation to label the stock item](#h_cb0819a2-1584-49a6-94ee-16aa23732c2a) that you created.

## Setting Up Stock Items

The assumption is that you’ve already bottled your shiner (cleanskin) stock as a single x1. To begin the labelling process for shiners, you’ll need to first create your stock item with an accurate Bill of Materials (BoM) which will include your bottled shiner and label(s) needed.

Create a stock item with a single shiner, one front label, and one back label. This stock item will need to have a different stock code and category than the shiner. In the example below, 13CHSHINER is the shiner listed in the Bill of Materials (BoM).

![](https://support.vintrace.com/hc/article_attachments/49421258340116)

## Manufacture Shiners

To label the shiners, you'll use vintrace’s Manufacture operation as outlined below and further detailed in our [Manufacture Operation article](https://support.vintrace.com/hc/en-us/articles/32303341990548-Manufacture-Operation):

1. Click ![Inventory_Menu_Option_20200406.png](https://support.vintrace.com/hc/article_attachments/32328960117268) Inventory in the sidebar and click Manufacture from the Operations dropdown. Or, click the ![Operations_Icon_20200407.png](https://support.vintrace.com/hc/article_attachments/32328960126740) Operations icon and click Manufacture.
2. Enter the following details in the General tab of the Action Manufacture window.

- Quantity — The number of shiners you want to label.
- Stock Item — The item that you created which includes the shiner and its labels.
- Route To — Click the ![Forklift_20200511.png](https://support.vintrace.com/hc/article_attachments/32328935704596) to select the area where you want to route.
- Route From — If you need to change where the stock is coming from, click the ![Forklift_20200511.png](https://support.vintrace.com/hc/article_attachments/32328935704596) beside the item.

5. Click Save.

After saving your shiner and other bottling components will be depleted by the specified quantity, while the stock of the item that you created increases.
