---
id: "32303355479188"
title: "Syncing Invoices and Billing Items to QuickBooks"
url: "https://support.vintrace.com/hc/en-us/articles/32303355479188-Syncing-Invoices-and-Billing-Items-to-QuickBooks"
category: "Setup and Admin"
section: "Integrations: Accounting"
created_at: "2024-11-20T15:52:43Z"
updated_at: "2024-11-21T10:29:51Z"
labels: ["estate"]
gist: "After you’ve integrated QuickBooks with vintrace, you can sync your service orders, invoices, and billing items."
tags: ["integrations", "configuration", "harvest"]
---

# Syncing Invoices and Billing Items to QuickBooks

After you’ve integrated QuickBooks with vintrace, you can sync your service orders, invoices, and billing items.

For details on linking your tax rates to QuickBooks, refer to our [Linking QuickBooks Tax Rates](https://support.vintrace.com/hc/en-us/articles/32303341350420)article.

## Syncing Invoices

To sync your vintrace invoices with QuickBooks:

1. [Create a service charge](https://support.winery-software.com/hc/en-us/sections/360000169196-Custom-Crush-Billing).
2. [Generate a new invoice](https://support.winery-software.com/hc/en-us/articles/360000812855-Managing-Client-Billing-Invoices#h_01ED4X9M6YRP2XGPVXMNW1HJAP). The invoice must have an *Approved* state before it can be synced with QuickBooks.
3. Click the ![Three_Vertical_Dots_20200623.png](https://support.vintrace.com/hc/article_attachments/32329184002836)and select Sync.

![QB_15_20201125.png](https://support.vintrace.com/hc/article_attachments/32329156371348)

After the invoice is synced with QuickBooks a checkmark displays in the Synced column of the Client Billing Invoices window.

![QB_16.jpg](https://support.vintrace.com/hc/article_attachments/32329183716756)

The invoice is synced with QuickBooks using the vintrace invoice number.

![QB_Item8.jpg](https://support.vintrace.com/hc/article_attachments/32329164989844)

## Syncing Billing Items

When you sync an invoice with QuickBooks, the vintrace billing items in the invoice are also synced.

How vintrace links a billing item to QuickBooks will depend on whether you specified a [Linked Item ID](https://support.winery-software.com/hc/en-us/articles/360000812935#Linked_Item_ID) when you [set up the billing item](https://support.winery-software.com/hc/en-us/articles/360000812935-Setting-Up-Billing-Items). If you specified a Linked Item ID when you set up your billing item, vintrace will use this ID to link to the item in QuickBooks.

![Update_Billing_Item_-_Linked_Item_ID_Specified_20201125.png](https://support.vintrace.com/hc/article_attachments/32329165051668)

Otherwise, vintrace will use the billing item’s Code to link to the item in QuickBooks.

![Update_Billing_Item_-_Linked_Item_ID_Not_Specified_20201125.png](https://support.vintrace.com/hc/article_attachments/32329169995924)
