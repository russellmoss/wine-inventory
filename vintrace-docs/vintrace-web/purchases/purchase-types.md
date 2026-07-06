---
id: "32303321745300"
title: "Purchase Types"
url: "https://support.vintrace.com/hc/en-us/articles/32303321745300-Purchase-Types"
category: "vintrace Web"
section: "Purchases"
created_at: "2024-11-20T15:51:36Z"
updated_at: "2025-01-09T16:45:11Z"
labels: ["estate", "wp-page-9766"]
gist: "This article assumes that you have a basic understanding of how to manage purchase orders and how to synchronize purchase orders with Xero."
tags: ["barrels", "inventory", "packaging", "cost", "dtc-sales", "integrations"]
---

# Purchase Types

This article assumes that you have a basic understanding of how to [manage purchase orders](https://support.vintrace.com/hc/en-us/articles/32303315399444) and how to [synchronize purchase orders with Xero](https://support.vintrace.com/hc/en-us/articles/32303342232724).

When you create a purchase order, you’ll need to select a type for each purchase order item.

![Create_Stock_Purchase_Order_-_Type_List_20200804.png](https://support.vintrace.com/hc/article_attachments/32329268163092)

There five types of purchase orders in vintrace:

- [General](#h_01EF02AY50C0KQ3X77TQ5K01HH)
- [Stock](#h_01EF02B80GCP4SNGBETE4ZRXKF)
- [Barrel](#h_01EF02BENA5PC67QR0A5H6X5W7)
- [Adhoc](#h_01EF02B30PMNYPT2MPVVS3NJXK)
- [Bulk Wine](#h_01EF02BSJASSWYZBM9N1G32QXP)

Each of these purchase order types are discussed in detail below.

## General Items

General items are items that don’t impact your stock levels such as pens, papers, and other office supplies. The stock levels for general items are NOT tracked in vintrace. In the example below, the general item for paper is linked to an Office Supplies expense account.

![General_Item_Linked_to_Office_Supplies_Account_20200804.png](https://support.vintrace.com/hc/article_attachments/32329285216660)

## Stock Items

Creating purchase orders for stock items will affect stock commitments. For example, a purchase order for bottling supplies is linked to a Bottling Goods asset account.

![Stock_Item_Linked_to_Bottling_Account_20200805.png](https://support.vintrace.com/hc/article_attachments/32329247293460)

Refer to our [Sales Orders/Purchase Orders and Their Influence on Stock Commitment](https://support.vintrace.com/hc/en-us/articles/32303303242004) article.

## Barrels

Purchase orders for barrels are linked to the barrel category’s selected account.

![Barrel_Category_Linked_to_Barrels_Account_20200804.png](https://support.vintrace.com/hc/article_attachments/32329268257044)

If no account is specified for the barrel category, it’s linked to the default Asset account.

## Adhoc Items

Adhoc items are items that haven’t been defined in vintrace such as a service that you purchased from an electrical contractor to repair a switchboard. After a purchase order with an adhoc item is saved, the adhoc item will be created as a general item in vintrace. If you view the purchase order again, the adhoc item’s type will be set to *General*.

## Bulk Wine

Purchase orders for bulk wine are linked to the account specified for the bulk wine’s program.

![Bulk_Wine_Linked_to_Program_20200805.png](https://support.vintrace.com/hc/article_attachments/32329255647252)
