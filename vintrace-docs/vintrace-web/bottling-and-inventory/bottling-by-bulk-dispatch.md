---
id: "32301314615700"
title: "Bottling by Bulk Dispatch"
url: "https://support.vintrace.com/hc/en-us/articles/32301314615700-Bottling-by-Bulk-Dispatch"
category: "vintrace Web"
section: "Bottling and Inventory"
created_at: "2024-11-20T14:46:51Z"
updated_at: "2026-04-23T19:07:42Z"
labels: []
gist: "These instructions are for users who:."
tags: ["inventory", "packaging", "lab", "work-orders", "configuration", "exports"]
---

# Bottling by Bulk Dispatch

These instructions are for users who:

- Do not want to use [vintrace’s packaging features](https://support.vintrace.com/hc/en-us/articles/32303327186836).
- Are using Enterprise Resource Planning (ERP) software such as Business Central, SAP, or JDE. If you are using an ERP, you should complete the bottling in the ERP and in vintrace on the same day.

Before you begin:

- If you have a multi-winery vintrace license, be sure that you have [switched to the winery](https://support.vintrace.com/hc/en-us/articles/32303328608660) that you’re bottling at. Be sure that you are not in All Winery Mode.

## Custom Dispatch Type - Set-up

When setting up the Custom Dispatch Type "Bottling" it is required to check the box for "Bottling Dispatch type"

![](https://support.vintrace.com/hc/article_attachments/48103572330132)

## Creating a Work Order

If you want to schedule your bottling for date and/or time in the future, we recommend creating a work order.

To complete your bottling using a work order:

1. [Create a work order](https://support.vintrace.com/hc/en-us/articles/32303315610388). We recommend selecting the *Bottling* note indicator. The selected note indicators display below the barcode on the printed work order; they provide a way to quickly summarize and identify the work order’s purpose.
2. Before adding the bottling jobs to the work order, you may want to add an Analysis job. If you’ve set up an [analysis template](https://support.vintrace.com/hc/en-us/articles/32301372281748) with the metrics that you want measured prior to bottling, you can select that template here and vintrace will add the metrics from the template.

![Work_Order_-_Analysis_Metrics_20220113.png](https://support.vintrace.com/hc/article_attachments/32328621399188)

When you add the analysis job to the work order, you don’t have to enter the lab results before completing the bottling.

3. Add a Bulk Dispatch job to the work order with the following details:

- Select the *Bottling* dispatch type.
- Select the vessel/batch.
- Specify the amount you plan to bottle in the vessel/batch’s Out field.
- In the Details field, enter the number for the bottling from your ERP.

![Work_Order_-_Bulk_Dispatch_20220114.png](https://support.vintrace.com/hc/article_attachments/32328621341844)

If you do not have the Inventory module, additional *Bottling* dispatch types are available.

- *Bottling - Removed Tax Paid* - This shows as bottled on your TTB report; the bottled wine shows as removed tax paid in Part 1 Section B.
- *Bottling - Transferred in Bond* - This shows on your TTB report that you bottled the wine and Transferred in Bond in Part 1 Section B.

![Additional_Bottling_Dispatch_Types_20220114.png](https://support.vintrace.com/hc/article_attachments/32328629180692)

4. If you’re bottling multiple bottle sizes (e.g., 750ml and 1.5L), add a separate bulk dispatch job for each bottle size.
5. Specify the details for the bulk dispatch. By default, the Proportional Allocation option is selected if you are utilizing the [Allocations module](https://support.vintrace.com/hc/en-us/articles/32303293781780). This option auto calculates the fulfilled amount of allocated and unallocated volume according to their ration. You can change the allocation option by clicking Proportional Allocation, then selecting the option you prefer

![Bulk_Dispatch_Operation_-_Changing_Allocation_20220113.png](https://support.vintrace.com/hc/article_attachments/32328603543060)

6. Save the work order as *Ready*.
7. When you complete the work order’s bulk dispatch job, enter the amount bottled from your ERP.

## Recording Operations

Another option for recording your bottling is to use vintrace’s operations.

1. [View the wine’s details](https://support.vintrace.com/hc/en-us/articles/32303310460948).
2. Be sure that [the wine has been declared](https://support.vintrace.com/hc/en-us/articles/32303302177940).
3. Click the ![Operations_Icon_20200407.png](https://support.vintrace.com/hc/article_attachments/32328663939732) operations icon and select Analysis.
4. Specify the details for the analysis.

When you record the analysis as an operation, you’ll have to specify the lab results.

5. Click the ![Operations_Icon_20200407.png](https://support.vintrace.com/hc/article_attachments/32328663939732) operations icon and select Bulk Dispatch..
