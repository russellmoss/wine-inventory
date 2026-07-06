---
id: "32303307414292"
title: "Refunds and Returns"
url: "https://support.vintrace.com/hc/en-us/articles/32303307414292-Refunds-and-Returns"
category: "vintrace Web"
section: "Sales"
created_at: "2024-11-20T15:52:11Z"
updated_at: "2025-01-09T17:26:23Z"
labels: ["estate", "Credit note", "Credit memo", "wp-page-9444", "Refund", "Return"]
gist: "Refunds and returns are processed in vintrace’s Returns window."
tags: ["dtc-sales", "configuration"]
---

# Refunds and Returns

Refunds and returns are processed in vintrace’s Returns window.

To access the Refunds window, do either of the following:

- Click ![Setup_Icon_20200318.png](https://support.vintrace.com/hc/article_attachments/32329094753172) Set Up in the sidebar, click Sales, then from the Refunds tile, click Configure.

![Set_Up_-_Sales_-_Refunds_20200817.png](https://support.vintrace.com/hc/article_attachments/32329105268500)

- Click ![More_Options_20200323.png](https://support.vintrace.com/hc/article_attachments/32329134191252) More Options in the sidebar, then from the Sales tile, click Refunds.

![More_Options_-_Refunds_20200817.png](https://support.vintrace.com/hc/article_attachments/32329134005652)

At the top of the Refunds window are filters that let you control which refunds are listed.

![Refunds_-_Filters_20200817.png](https://support.vintrace.com/hc/article_attachments/32329094808212)

## Creating a Refund

To create a refund for a sales order, the sales order’s status must be Approved.

To create a refund:

1. Click ![More_Options_20200323.png](https://support.vintrace.com/hc/article_attachments/32329134191252) More Options in the sidebar.
2. From the Sales tile, click Refunds.
3. New Refund. The Refund/Returns window displays along with a window for finding the sales order.

![Create_Refund_Return_-_Select_Sales_Order_20200817.png](https://support.vintrace.com/hc/article_attachments/32329134058772)

You can also create a refund from the [Sales Order window](https://support.vintrace.com/hc/en-us/articles/32303318150164) by selecting the down arrow beside Options and selecting Return/Refund.
![Sales_Orders_-_Options_-_Return_Refunds_20200817.png](https://support.vintrace.com/hc/article_attachments/32329094912660)

4. Use the filters to search for the sales order, then select it.

![Create_Refund_Return_-_Select_Sales_Order_20200817.png](https://support.vintrace.com/hc/article_attachments/32329134126868)

The selected sales order’s details display in the Refund/Return window.

![Create_Refund_Return_-_Sales_Order_Details_20200817.png](https://support.vintrace.com/hc/article_attachments/32329086772884)

You can view the party’s account summary by clicking the Account Summary link that’s displayed below their name.

If there were previous refunds on the sales order, the Available Qty to Be Returned column displays the sales order minus any previous refund quantities.

5. Specify the details for the refund. Note that some of these details are taken from the sales order.

- Refund # — The refund's identifier.
- Reference — The reference for the refund. This defaults to the sales order number, but you can change it if needed.
- Qty to Be Returned — If the entire sales order is being returned, click Return All. Otherwise, specify the quantity of each item being returned in the Qty to Be Returned column. After you specify the quantities being returned, the New Total column displays the total value of the refund including taxes.
- Stock Physically Returned To — If stock is physically returned, select the Stock Physically Returned To checkbox then select the location.
- Sync to Xero — If accounting integration is enabled and you want to sync the refund and create a credit note in Xero, select the Sync to Xero checkbox.

6. Do one of the following:

- If you need to print the credit note, click Save and Print, then click Awaiting Approval or Approved based on what status you’d like to assign to the refund.

An Approved refund can not be edited. If you don’t need to print the credit note, click Awaiting Approval or Approved.

- If you don’t need to print the credit note, click Awaiting Approval or Approved.

## Updating a Refund

Only refunds with an Awaiting Approval status can be updated. Approved refunds cannot be updated.

1. Click ![More_Options_20200323.png](https://support.vintrace.com/hc/article_attachments/32329134191252) More Options in the sidebar.
2. From the Sales tile, click Refunds.
3. Select the refund you'd like to update.
4. Update the refund's details as needed.
5. Do one of the following:
   - If you need to print the credit note, click Save and Print, then click Awaiting Approval or Approved based on what status you’d like to assign to the refund.
   - If you don’t need to print the credit note, click Awaiting Approval or Approved.

## Printing or Emailing a Refund

To print or email a refund:

1. Click ![More_Options_20200323.png](https://support.vintrace.com/hc/article_attachments/32329134191252) More Options in the sidebar.
2. From the Sales tile, click Refunds.
3. Click the down arrow beside Options.
4. Select Email or Print.

![Refunds_-_Options_-_Email_or_Print_20200817.png](https://support.vintrace.com/hc/article_attachments/32329120497940)

## Syncing Refunds to Xero

When you have [accounting integration enabled](https://support.vintrace.com/hc/en-us/articles/32303315132180) and sync a refund with an *Awaiting Approval* status to [Xero](https://support.vintrace.com/hc/en-us/articles/32303310784660), vintrace creates a draft credit note (i.e., memo) in Xero.

To view the linked credit note, view the refund and click View in Accounts.

[![Sync refund 2](https://s3-us-west-2.amazonaws.com/vintrace-support-site-content/uploads/2017/06/Sync-refund-2.jpg)](https://s3-us-west-2.amazonaws.com/vintrace-support-site-content/uploads/2017/06/Sync-refund-2.jpg)

When the status is *Awaiting Approval*, the sales account in Xero is not yet debited with the refund amount.

[![Sync refund 3](https://s3-us-west-2.amazonaws.com/vintrace-support-site-content/uploads/2017/06/Sync-refund-3.jpg)](https://s3-us-west-2.amazonaws.com/vintrace-support-site-content/uploads/2017/06/Sync-refund-3.jpg)

[![Sync 4](https://s3-us-west-2.amazonaws.com/vintrace-support-site-content/uploads/2017/06/Sync-41.jpg)](https://s3-us-west-2.amazonaws.com/vintrace-support-site-content/uploads/2017/06/Sync-41.jpg)

When the refund’s status is set to *Approved* in vintrace and synced to Xero, the credit note in Xero is also approved and the sales account is debited with the refund amount.

[![Sync refund 6](https://s3-us-west-2.amazonaws.com/vintrace-support-site-content/uploads/2017/06/Sync-refund-6.jpg)](https://s3-us-west-2.amazonaws.com/vintrace-support-site-content/uploads/2017/06/Sync-refund-6.jpg)

[![Sync refund 7](https://s3-us-west-2.amazonaws.com/vintrace-support-site-content/uploads/2017/06/Sync-refund-7.jpg)](https://s3-us-west-2.amazonaws.com/vintrace-support-site-content/uploads/2017/06/Sync-refund-7.jpg)
