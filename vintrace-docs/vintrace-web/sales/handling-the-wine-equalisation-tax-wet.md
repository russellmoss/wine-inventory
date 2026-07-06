---
id: "32303294708884"
title: "Handling the Wine Equalisation Tax (WET)"
url: "https://support.vintrace.com/hc/en-us/articles/32303294708884-Handling-the-Wine-Equalisation-Tax-WET"
category: "vintrace Web"
section: "Sales"
created_at: "2024-11-20T15:51:41Z"
updated_at: "2025-01-09T18:09:36Z"
labels: ["estate", "WET", "Wine equalisation tax", "wp-page-2350"]
gist: "Whether you sell your wine in bulk or at the cellar door, you’ll need to track the amount of Wine Equalisation Tax owed to the government."
tags: ["configuration", "integrations", "dtc-sales", "packaging", "barrels", "compliance"]
---

# Handling the Wine Equalisation Tax (WET)

Whether you sell your wine in bulk or at the cellar door, you’ll need to track the amount of Wine Equalisation Tax owed to the government. This article details how to set up vintrace to track WET and integrate with an accounting package such as Xero.

## Setting Up a Tax Rate

Set up the appropriate tax rates as detailed in our [Setting Up Sales Tax Rates article](https://support.vintrace.com/hc/en-us/articles/32303335629332).

Be sure to name the first tax rate component *WET*, with a 29% tax rate, and a priority of 1.

You’ll also need to add a second tax rate component for GST. Be sure to select the Compound checkbox for this tax rate component.

![WET_and_GST_20200818.png](https://support.vintrace.com/hc/article_attachments/32329041967508)

If you’re integrating with an accounting package such as Xero, refer to the [WET and Accounting Integration section](#h_01EG3F74688W1MM7CZFZWKZ1GF) for additional details for setting up the tax rate.

## Linking the Tax Rate to a Sales Price List

When you [create sales orders](https://support.vintrace.com/hc/en-us/articles/32303318150164), it’s important to ensure that the correct tax rate is set for the items you’re selling. You can do this by setting the tax rate for the price list.

To link the tax rate to a sales price list:

1. [Create or edit a sales price list](https://support.vintrace.com/hc/en-us/articles/32303325767316).
2. Set the Default Tax Rate of the price list to the tax rate that you created.

![Create_Sales_Price_List_-_WET_20200819.png](https://support.vintrace.com/hc/article_attachments/32329015608468)

3. Click Save.

Once the tax rate is linked to the price list, the tax rate will be applied to items in sales order that use the price list. You can hover over an item’s Tax Amt to view the taxes in detail.

![Create_Sales_Order_-_Sales_Price_List_WET_20200819.png](https://support.vintrace.com/hc/article_attachments/32329036968980)

If a sales order’s Sale Type is set to *Retail*, the calculation of WET is deferred and only GST is calculated at the time of the sale. Retail WET is calculated at the end of the period during your BAS statement.

![Create_Sales_Order_-_Sales_Price_List_WET_-_Type_Retail_20200819.png](https://support.vintrace.com/hc/article_attachments/32329015619732)

You can run the Retail WET Tax Report to calculate the WET tax amounts based on different calculations that are available.

## WET and Accounting Integration

WET can be passed to an external accounting package such as [Xero](https://support.vintrace.com/hc/en-us/articles/32303310784660). If you’re [integrating with an accounting package](https://support.vintrace.com/hc/en-us/articles/32303315132180), you’ll need to set up the tax rate in vintrace with the following:

- The tax rate’s Linked Tax Rate ID should be set to *GST on Income*.
- The Ext Tax Account Ref for the WET component should be set to your WET Liability account.

[![](https://s3-us-west-2.amazonaws.com/vintrace-support-site-content/uploads/2014/06/highlight.png "xero tax setup WET")](https://s3-us-west-2.amazonaws.com/vintrace-support-site-content/uploads/2014/06/highlight.png)

[![WET 8](https://s3-us-west-2.amazonaws.com/vintrace-support-site-content/uploads/2014/06/WET-8.jpg)](https://s3-us-west-2.amazonaws.com/vintrace-support-site-content/uploads/2014/06/WET-8.jpg)

After you create a sales order and sync, you can click the View in Accounts link in the Sales Order window to view the invoice.

[![WET 5](https://s3-us-west-2.amazonaws.com/vintrace-support-site-content/uploads/2014/06/WET-5.jpg)](https://s3-us-west-2.amazonaws.com/vintrace-support-site-content/uploads/2014/06/WET-5.jpg)
