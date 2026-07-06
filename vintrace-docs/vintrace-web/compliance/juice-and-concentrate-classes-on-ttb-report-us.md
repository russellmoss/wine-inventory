---
id: "32303294215188"
title: "Juice and Concentrate Classes on TTB Report (US)"
url: "https://support.vintrace.com/hc/en-us/articles/32303294215188-Juice-and-Concentrate-Classes-on-TTB-Report-US"
category: "vintrace Web"
section: "Compliance"
created_at: "2024-11-20T15:51:35Z"
updated_at: "2024-12-03T22:18:23Z"
labels: ["estate", "Concentrate tax class", "Juice tax class"]
gist: "This article is specifically for grape juice and concentrate."
tags: ["ttb", "reporting", "tax-class", "compliance", "harvest", "configuration"]
---

# Juice and Concentrate Classes on TTB Report (US)

This article is specifically for grape juice and concentrate.

The Juice and Concentrate tax classes are reported in the TTB report’s Part IV - Summary of Materials Received and Used. This tracks juice and concentrate that’s NOT intended to be fermented (i.e., it may sit in the tank or drum to be used for sweetening in production). In other cases, it may be produced or sold to other wineries as concentrate.

## The Juice Tax Class

The Juice tax class is grape juice that’s NOT intended to be fermented. It’s for grape juice that will be added to wines directly, or potentially sold later (e.g., juice-and-go program).

A [tax class](https://support.vintrace.com/hc/en-us/articles/32301306220180) named Juice is automatically created in the Winery Setup window (Setup Options > Policy > Tax Class).

![Tax_Class_Update_-_Juice_20200601.png](https://support.vintrace.com/hc/article_attachments/32328995745428)

Any TTB event for this tax class will be reported in Part IV column (c) in the TTB Report.

![Part_IV_Column_C_20200601.png](https://support.vintrace.com/hc/article_attachments/32328995701780)

## Bulk Intake of Juice

Using the [Bulk Intake](https://support.vintrace.com/hc/en-us/articles/32303303281428) operation, bring the volume of juice you’ve received and put it into a vessel (i.e., tank, barrel, or keg). As with any bulk wine, you’ll be able to enter the grape origin information for the juice.

When doing a bulk intake of the juice, be sure to set the juice’s Tax State to *Bonded* and set its Tax Class to *Part IV - Juice*. These settings are in the General tab’s Costing & Labs sub-tab.

![Bulk_Intake_-_General_-_Costing_and_Labs_-_Juice_20200601.png](https://support.vintrace.com/hc/article_attachments/32329012977044)

This bulk intake of juice is reported in Part IV, row 2 (Received), column (c) of the TTB report.

![Part_IV_Column_C_Row_2_20200601.png](https://support.vintrace.com/hc/article_attachments/32329034532244)

## Using Juice

To use any juice to sweeten your wine, use any of the transfer operations in vintrace.

The juice will be reported in Part IV, row 5 (Used in Wine Production) of the TTB report.

![mceclip6.png](https://support.vintrace.com/hc/article_attachments/32328995615380)

The wine involved in the blend operation will be reported in Part I, row 3 (Produced by Sweetening) and row 18 (Used for Sweetening).

![mceclip7.png](https://support.vintrace.com/hc/article_attachments/32329034428052)

## Extraction Operation for Juice

For an Extraction operation where the juice produced is NOT intended to be fermented, you have the option to specify that its for juice only. To do this, select the For Juice Use Only checkbox in the General tab of the Extraction window.

![Extraction_-_General_-_For_Juice_Use_Only_20200601.png](https://support.vintrace.com/hc/article_attachments/32329004805908)

The juice produced will have a tax class of Juice. The volume produced in the extraction operation will be reported in Part IV, row 3 (Juice Produced) of the TTB report.

![mceclip10.png](https://support.vintrace.com/hc/article_attachments/32328995836308)

## Concentrate Tax Class

A tax class named Concentrate is automatically created in the Winery Setup window (Setup Options > Policy > Tax Class).

![Tax_Class_Update_-_Concentrate_20200601.png](https://support.vintrace.com/hc/article_attachments/32329004899860)

Using this tax class updates the values in Part IV, column (d) in the TTB report.

![Part_IV_Column_D_20200601.png](https://support.vintrace.com/hc/article_attachments/32329004969364)

## Bulk Intake of Concentrate

Using the [Bulk Intake](https://support.vintrace.com/hc/en-us/articles/32303303281428) operation, bring the volume of concentrate you’ve received and put it into a vessel (i.e., tank, barrel, or keg). As with any bulk wine, you’ll be able to enter the grape origin information for the concentrate.

When doing a bulk intake of concentrate, be sure to set the concentrate product’s Tax State to *Bonded* and its Tax Class to *Concentrate*. These settings are in the General tab’s Costing & Labs sub-tab.

![Bulk_Intake_-_General_-_Costing_and_Labs_-_Concentrate_20200601.png](https://support.vintrace.com/hc/article_attachments/32329022740628)

This bulk intake of concentrate is reported in Part IV, row 2 (Received), column (d) of the TTB report.

[![TTB report after concentrate bulk intake](https://s3-us-west-2.amazonaws.com/vintrace-support-site-content/uploads/2016/03/TTB-report-after-concentrate-bulk-intake.jpg)](https://s3-us-west-2.amazonaws.com/vintrace-support-site-content/uploads/2016/03/TTB-report-after-concentrate-bulk-intake.jpg)

## Using Concentrate

To use any concentrate to sweeten wine, use any of the transfer operations in vintrace.

The concentrate will be reported in Part IV, row 5 (Used in Wine Production), column (d) of the TTB report.

[![TTB report after blending concentrate into wine](https://s3-us-west-2.amazonaws.com/vintrace-support-site-content/uploads/2016/03/TTB-report-after-blending-concentrate-into-wine.jpg)](https://s3-us-west-2.amazonaws.com/vintrace-support-site-content/uploads/2016/03/TTB-report-after-blending-concentrate-into-wine.jpg)

The wine involved in the blend operation will be reported in Part I, row 3 (Produced by Sweetening) and row 18 (Used for Sweetening).

[![TTB report after blending concentrate into wine 2](https://s3-us-west-2.amazonaws.com/vintrace-support-site-content/uploads/2016/03/TTB-report-after-blending-concentrate-into-wine-2.jpg)](https://s3-us-west-2.amazonaws.com/vintrace-support-site-content/uploads/2016/03/TTB-report-after-blending-concentrate-into-wine-2.jpg)

## Undeclaring Juice/Concentrate for Wine Production

If you decide to use a juice product, concentrate product, or any product that has a tax class that belongs to d, e, f, or g in Part IV of the TTB report for wine production (i.e., ferment it), you can undeclare the product by applying a product treatment operation.

Set up a new [product treatment](https://support.vintrace.com/hc/en-us/articles/32301359713428) from the Winery Setup window (Setup > Treatments > Treatment (Products)):

1. Click ![Setup_Icon_20200318.png](https://support.vintrace.com/hc/article_attachments/32328989576724) Set Up in the sidebar.
2. Click Treatments.
3. From the Product Treatments tile, click Configure.
4. Click New Product Treatments.
5. In the Product Treatment Definition window, be sure to select the Wine/Juice and the Use for Wine Production checkboxes.

![Product_Treatment_Definition_Create_-_Undeclare_Juice_for_Wine_20200601.png](https://support.vintrace.com/hc/article_attachments/32329004919444)

6. Specify the details for the product treatment before saving it.

You can now use the Treatment (Product) operation to apply the new treatment to the juice or concentrate product. The product’s tax class will change to non-declared.

In the TTB report, the volume will be reported in Part IV, row 5 (Used in Wine Production) and in Part VII, row 1 (In Fermenters).

[![TTB report after undeclaring juice for wine production](https://s3-us-west-2.amazonaws.com/vintrace-support-site-content/uploads/2016/03/TTB-report-after-undeclaring-juice-for-wine-production.jpg)](https://s3-us-west-2.amazonaws.com/vintrace-support-site-content/uploads/2016/03/TTB-report-after-undeclaring-juice-for-wine-production.jpg)
