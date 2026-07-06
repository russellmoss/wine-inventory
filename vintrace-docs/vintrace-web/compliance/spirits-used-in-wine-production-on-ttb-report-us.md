---
id: "32303306148628"
title: "Spirits Used in Wine Production on TTB Report (US)"
url: "https://support.vintrace.com/hc/en-us/articles/32303306148628-Spirits-Used-in-Wine-Production-on-TTB-Report-US"
category: "vintrace Web"
section: "Compliance"
created_at: "2024-11-20T15:51:57Z"
updated_at: "2026-05-18T18:43:58Z"
labels: ["estate", "spirits TTB", "Spirits tax class", "Spirits 702"]
gist: "This article explains spirits used in Part III - Summary of Distilled Spirits of the TTB Report on Wine Premises Operations in vintrace."
tags: ["reporting", "ttb", "compliance", "tax-class", "barrels", "configuration"]
---

# Spirits Used in Wine Production on TTB Report (US)

This article explains spirits used in Part III - Summary of Distilled Spirits of the TTB Report on Wine Premises Operations in vintrace.

This functionality may not enabled by default. If you would like to use this functionality, please contact our support team.

## Spirit Tax Class

A tax class named Spirit is automatically created in the Winery Setup window (Setup Options > Policy > Tax Class).

![Tax_Class_Update_-_Spirit_20200602.png](https://support.vintrace.com/hc/article_attachments/32329069741972)

Any TTB event for this tax class will be reported in Part III, column (a) in the TTB report.

![Part_III_Column_A_20200602.png](https://support.vintrace.com/hc/article_attachments/32329051713428)

If you need to create additional tax classes, e.g. for different alcohol percentages/proofs, or different spirit types, be sure to set its TTB Part to *Part III - Spirits*, and specify which column (i.e., b, c, or d) of the TTB report will be used to report on the tax class. In the example below, the 'Pisco Spirits' tax class will be reported in Part III, column (c) of the TTB report. The column header reflects the tax class name.

![](https://support.vintrace.com/hc/article_attachments/49373096550932)

## Bulk Intake of Spirits

Use the Bulk Intake operation to receive the volume of spirits and put it into a batch/vessel (i.e., tank, barrel, keg). As with any bulk wine, you’ll be able to enter the grape origin information for the spirits.

When doing a bulk intake of spirits, be sure to go to the General tab > **Costing & Labs tab** to:

1. Set the spirit product’s Tax State to *Bonded;* and
2. Set its Tax Class to the appropriate Part III tax class.
3. Enter the alcohol percentage. This should be the percentage by volume. vintrace will calculate the proof gallons for you when the TTB 702 report is run (see below).

![](https://support.vintrace.com/hc/article_attachments/49373096552596)

## TTB Reporting for Spirits

When you generate your TTB report, you can opt to view Part III of the report in proof gallons by selecting the Calculate Proof Gallons for Part III checkbox. The TTB requires reporting by proof gallons.

- I.e. total gallos multiplied by the alcohol percentage, multiplied by 2, divided by 100
- e.g. If you have 5000 gallons of spirits that are 95% ABV, then the proof gallons are calculated as:
  - 5000 \* 95 \* 2 / 100 = 9500

If the Calculate Proof Gallons for Part III checkbox is not selected, Part III will be calculated using gallons.

![Winery_Reports_-_Government_Reports_-_TTB_-_Calc_Proof_Gallons_20200602.png](https://support.vintrace.com/hc/article_attachments/32329069800468)

The bulk intake of spirits is reported in Part III, row 2 (Received), in the column mapped to the selected tax class.![](https://support.vintrace.com/hc/article_attachments/49373116469396)

If the 'proof gallons' option is selected the TTB report will display proof gallons. All other reports (e.g., Bulk Stock, Tax Breakdown, etc.) will display the real volume in gallons.

## Using Spirits

You can use spirits in any transfer operation in vintrace.

The wine into which you are blending must already have been declared as vintrace doesn’t allow blending of declared and non-declared products.

After completing the transfer operation, the spirit used will be reported in Part III, row 5 (Used).

[![](https://support.vintrace.com/hc/article_attachments/49373116470292)](https://s3-us-west-2.amazonaws.com/vintrace-support-site-content/uploads/2016/03/TTP-report-for-blending-spirit-into-wine-1.jpg)

The wine involved in the blend operation will be reported in Part I, row 4 (Produced by Addition of Wine Spirits), and row 19 (Used for Addition of Wine Spirits).

[![](https://support.vintrace.com/hc/article_attachments/49373116472596)](https://s3-us-west-2.amazonaws.com/vintrace-support-site-content/uploads/2016/03/TTP-report-for-blending-spirit-into-wine-2.jpg)

## Changing the Tax Class of Blended Wine

Depending on the spirit’s volume and proof (alcohol percentage doubled) that’s blended into a wine to fortify it, you may need to change the tax class of the resulting blend.

Set up a new product treatment from the Winery Setup window (Setup > Treatments > Treatment (Products)).

1. Click ![Sidebar - Setup 20241118.png](https://support.vintrace.com/hc/article_attachments/32754513793812) Set Up in the sidebar.
2. Click Treatments.
3. From the Product Treatments tile, click Configure.
4. Click New Product Treatments.
5. In the Product Treatment Definition window, be sure to select the Change Tax Class checkbox. You'll also need to select the new tax class and the reason for the change.
6. Specify the details for the product treatment before saving it.

In the example below a new product treatment is created for the resulting blend that’s moved to the 16-21% tax class.

![Product_Treatment_Definition_-_Change_Tax_Class_16-21__20200602.png](https://support.vintrace.com/hc/article_attachments/32329075327508)

Use any transfer operation on your spirits batch and apply the product treatment that you created. If you have multiple batches with different proofs, be sure to select the correct spirits batch.

You’ll be prompted to confirm the new tax class and the reason for the tax class change (Produced by the Addition of Spirits). The post-blend wine batch will reflect the change.
