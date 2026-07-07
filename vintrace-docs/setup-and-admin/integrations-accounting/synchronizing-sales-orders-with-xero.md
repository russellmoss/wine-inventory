---
id: "32303341243156"
title: "Synchronizing Sales Orders with Xero"
url: "https://support.vintrace.com/hc/en-us/articles/32303341243156-Synchronizing-Sales-Orders-with-Xero"
category: "Setup and Admin"
section: "Integrations: Accounting"
created_at: "2024-11-20T15:52:29Z"
updated_at: "2025-05-19T18:54:23Z"
labels: ["estate", "Sync to Xero", "Sales orders", "Xero sales orders", "wp-page-9579", "Syncing sales orders", "Xero"]
gist: "This article assumes that you’ve linked vintrace and Xero, and that you understand the basics of accounting integration and how to manage sales orders."
tags: ["integrations", "dtc-sales", "configuration", "getting-started"]
---

# Synchronizing Sales Orders with Xero

This article assumes that you’ve [linked vintrace and Xero](https://support.vintrace.com/hc/en-us/articles/32303310784660), and that you understand the basics of [accounting integration](https://support.vintrace.com/hc/en-us/articles/32303315132180) and how to [manage sales orders](https://support.vintrace.com/hc/en-us/articles/32303318150164).

When you sync sales orders that you’ve created in vintrace, it creates an accounts receivable invoice in Xero with the customer’s information. This lets you manage the debt and any payments for that invoice from within Xero. Because the customer’s information is also with the invoice, it’s not necessary for the customer to pre-exist in Xero.

## Setting Up and Linking Revenue Accounts

Be sure to [set up your revenue accounts](https://support.vintrace.com/hc/en-us/articles/32301385387668) in vintrace and link them to Xero by entering the account code from Xero in vintrace.

![Linking Revenue Accounts with Xero 20230810.png](https://support.vintrace.com/hc/article_attachments/32329138761620)

You can link a revenue account to each item in a sales price list so that it’s selected by default when you add the item to a sales order.

![Price_List_Default_Account_in_Sales_Order_20200819.png](https://support.vintrace.com/hc/article_attachments/32329090787476)

Or, you can manually select the account each time you add the item to a sales order.

## Syncing a Sales Order with Xero

Sales orders with a *New* status will be created as a draft invoice in Xero. To ensure the invoice is created as an approved (i.e., awaiting payment) invoice in Xero, be sure to set the sales order’s Status to *Approved* in vintrace.

Syncing a sales order from vintrace with Xero causes an invoice with the selected revenue and line items to be created in Xero. To sync a sales order with Xero, select the Sync to Xero checkbox that's beside the Save button before saving the sales order. You can ensure that the Sync to Xero checkbox is always selected by clicking the ![Heart_White_20200731.png](https://support.vintrace.com/hc/article_attachments/32329113733652) icon beside it.

## Viewing an Invoice in Xero

To view an invoice in Xero, view the sales order in vintrace and click View in Accounts.

![Update Sales Order - View in Accounts Xero 20230810.png](https://support.vintrace.com/hc/article_attachments/32329158856980)

This displays the invoice in Xero where you can manage the invoice for debt collection and payment processing.

[![Sync 6](https://s3-us-west-2.amazonaws.com/vintrace-support-site-content/uploads/2017/06/Sync-6.jpg)](https://s3-us-west-2.amazonaws.com/vintrace-support-site-content/uploads/2017/06/Sync-6.jpg)
