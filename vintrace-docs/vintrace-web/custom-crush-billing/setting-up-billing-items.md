---
id: "32303340023316"
title: "Setting Up Billing Items"
url: "https://support.vintrace.com/hc/en-us/articles/32303340023316-Setting-Up-Billing-Items"
category: "vintrace Web"
section: "Custom Crush Billing"
created_at: "2024-11-20T15:52:14Z"
updated_at: "2024-11-21T10:29:31Z"
labels: ["charge", "billing", "billing item", "custom crush", "item"]
gist: "Billing items are things that you’d like to charge your client for."
tags: ["configuration", "harvest", "exports", "packaging", "barrels", "integrations"]
---

# Setting Up Billing Items

Billing items are things that you’d like to charge your client for. You can think of these as line items on an invoice that you’d send to a client.

You can create, edit, or deactivate billing items from the Winery Setup window (Setup Options > Billing > Items).

## Adding a Billing Item

To create a new billing item:

1. Click ![Setup_Icon_20200318.png](https://support.vintrace.com/hc/article_attachments/32329110648212) Set Up in the sidebar.
2. Click Client Billing.
3. From the Client Billing Items tile, click Configure.
4. Click New Item.

![Winery_Setup_-_Billing_-_Items_-_New_Item_Button_20200707.png](https://support.vintrace.com/hc/article_attachments/32329110692372)

The Item window displays.

5. Specify the details for the billing item. The tabs in the Item window are described below.

- [Item tab](#h_01ECNE9RHM4CNRMS7NZWBK7KJY)
- [Winery Links tab](#h_01ECNE9XKBASVKV19A1EFJS8NG)
- [Lab Links tab](#h_01ECNEA3JM46DYC171KJBWWR91)
- [Stock Links tab](#h_01ECNEA9H6NYE4DKRW1T72A2C9)
- [Storage Links tab](#h_01ECNEAFH3YTX85VC2H1SSAJZH)

6. Click Save.

## Item Tab

![Create_Item_-_Item_20200707.png](https://support.vintrace.com/hc/article_attachments/32329106696852)

The Item tab includes the following settings:

- Code — The code displays on invoices.
- Charge Type — How the charge will be calculated (i.e., Volumetric, Per Unit, Per Barrel, or Fixed).
- Linked Item ID — The item in your accounting package that you want to link to. Linking the item allows you to export invoices from vintrace to your accounting system.

In some cases, such as exporting charges to [Xero](https://support.vintrace.com/hc/en-us/articles/32303310784660) via CSV, you’ll need to set the Linked Item ID to the account code. For example, you may need to set it to 200, where account code 200 refers to the appropriate accounting ledger account for billing winery services. You’ll have the option of linking the item to specific operations and actions in vintrace; this will determine when the charges are raised.

If you've [integrated with QuickBooks](https://support.vintrace.com/hc/en-us/articles/32303321099924) and want to specify a category and a name for the item in QuickBooks, enter the Linked Item ID using the format *CategoryName:ItemName* where everything after the last colon (:) is used as the item's name. For example, suppose an item's Linked Item ID is set to *REVENUE ACCOUNTS: OTHER: Wine Shippers* in vintrace.

![Create_Item_-_Linked_Item_ID_20201125.png](https://support.vintrace.com/hc/article_attachments/32329096492692)

When the billing item is [synced to QuickBooks](https://support.vintrace.com/hc/en-us/articles/32303355479188), it creates an item in QuickBooks with the name *Wine Shippers*, and the category *REVENUE ACCOUNTS: OTHER*.

![QB_Item3_20201125.png](https://support.vintrace.com/hc/article_attachments/32329096467220)

## Winery Links Tab

![Create_Item_-_Winery_Links_20200707.png](https://support.vintrace.com/hc/article_attachments/32329121845396)

To link the billing item to specific additions, operations, or treatments, select the tasks from the Winery Links tab. When the linked tasks is performed in vintrace, the item will be included as a charge for your client’s service order. If you link the item to multiple additives, operations, or treatments, a charge will be raised if any of the selections are recorded.

## Lab Links Tab

![Create_Item_-_Lab_Links_20200707.png](https://support.vintrace.com/hc/article_attachments/32329096561300)

To link the item to specific analysis templates or metrics, select the templates or metrics from the Lab Links tab. When lab work is entered for a billable wine batch using the selected analysis or metric, a charge is raised against the client.

## Stock Links Tab

![Create_Item_-_Stock_Links_20200707.png](https://support.vintrace.com/hc/article_attachments/32329096357652)

To link the item to specific inventory functions, select the function(s) from the Stock Links tab. When a billable stock item in the selected stock category is packaged or manufactured, a charge for the item is raised.

## Storage Links Tab

![Create_Item_-_Storage_Links_20200707.png](https://support.vintrace.com/hc/article_attachments/32329135426068)

To link the item to wine storage, vessel hire, or barrel hosting, select them from the Storage Links tab. Refer to our [Billing for Tank and Barrel Storage, Hire, and Hosting article](https://support.vintrace.com/hc/en-us/articles/32303294668436) to learn more.
