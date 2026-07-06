---
id: "32303327186836"
title: "Recording a Bottling (Packaging Operation)"
url: "https://support.vintrace.com/hc/en-us/articles/32303327186836-Recording-a-Bottling-Packaging-Operation"
category: "vintrace Web"
section: "Bottling and Inventory"
created_at: "2024-11-20T15:52:37Z"
updated_at: "2024-11-21T10:29:44Z"
labels: ["estate", "wp-faq-316"]
gist: "In vintrace, the Packaging operation is what’s used when you want to record a bottling."
tags: ["packaging", "inventory", "work-orders", "barrels", "lot-identity"]
---

# Recording a Bottling (Packaging Operation)

In vintrace, the Packaging operation is what’s used when you want to record a bottling. You can package to a single bottle, or directly to a case. We recommend packaging to a single bottle and creating cases at a later time.

You can choose to add the stock item for your single bottle and case prior to bottling, or during the Packaging operation. If you choose to add the stock items beforehand, refer to our [Adding a Single Bottle Stock Item](https://support.vintrace.com/hc/en-us/articles/32301345671956) or [Adding a Case Stock Item](https://support.vintrace.com/hc/en-us/articles/32301360537876) articles for details.

## Accessing the Packaging Operation

There are a number of ways to access the Packaging operation. You can click the Operations icon, then select Packaging from the following:

- The Product page
- The Vessels page
- The Job Management page

You can also add a Packaging job to a work order by clicking Add Job, then selecting Packaging.

## The Packaging Window

The Packaging window is used to submit the details for the bottling.

![Packaging_20200526.png](https://support.vintrace.com/hc/article_attachments/32329141382292)

From the Packaging window’s General tab, you’ll need to [specify the amount to package](#h_8637fce9-5a55-4198-853e-d3aa5fca1a0c) and the following details:

- Vessel or Batch — Select the vessel or batch that you want to bottle. You don’t have to bottle the entire tank at one time.
- Stock Item — If you set up your bottle and/or case stock item ahead of time, select the stock item. Otherwise, click the ![Plus_in_Green_Circle_20200319.png](https://support.vintrace.com/hc/article_attachments/32329143379860) to [add your bottle](https://support.vintrace.com/hc/en-us/articles/32301345671956) or [case stock item](https://support.vintrace.com/hc/en-us/articles/32301360537876).
- Route To — Select the location that you want to route the stock items to.
- Route From — Select the location that you want to route the stock items from.

## Specifying the Amount to Package

The Packaging window gives you flexibility in how you specify the values for your bottling. You can choose to do a full transfer, specify the amount you want to use from the vessel/batch, or specify the amount you want to bottle.

If you’re doing a full transfer, you can select the Full Transfer checkbox then click the ![Calculator_Icon_20200410.png](https://support.vintrace.com/hc/article_attachments/32329161421972) Calculator beside the Volume Package field. This will automatically calculate the amounts for the Out, Loss, Quantity, and Volume Packaged.

![Packaging_-_Full_Transfer_20200526.png](https://support.vintrace.com/hc/article_attachments/32329116187028)

If you’re not doing a full transfer, you can specify an Out value, then click the ![Calculator_Icon_20200410.png](https://support.vintrace.com/hc/article_attachments/32329161421972) Calculator beside the Volume Packaged field. This will automatically calculate the Quantity, Loss, and Volume Packaged values based on the amount that you specified.

![Packaging_-_Out_Specified_20200526.png](https://support.vintrace.com/hc/article_attachments/32329141432468)

A third option is to enter an amount in the Quantity field, then click the ![Calculator_Icon_20200410.png](https://support.vintrace.com/hc/article_attachments/32329161421972) Calculator to calculate the Volume Packaged amount.

![Packaging_-_Quantity_20200526.png](https://support.vintrace.com/hc/article_attachments/32329143449236)

## Bottling More than One Tank of the Same Wine

If you’re bottling more than one tank, you can record a separate work order for each tank, or transfer all the wine into a large virtual tank such as one named Bottling to write the work order.

## Accounting for Leftover Bottles After Bottling to Cases

To account for leftover bottles, complete your bottling to cases leaving the balance of the wine in tank.

Next, record a second bottling to the bottle (i.e., the Single x1 stock item) for the remainder that’s in the tank. This will leave most of your wine in inventory in cases with some bottles.

Your winery management will determine if and how single bottles are tracked. Generally speaking, your “loose” bottles should be 11 or fewer (12 would equal another whole case).
