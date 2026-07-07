---
id: "32301312232852"
title: "Configuring a Distilled Spirits Plant (DSP)"
url: "https://support.vintrace.com/hc/en-us/articles/32301312232852-Configuring-a-Distilled-Spirits-Plant-DSP"
category: "vintrace Web"
section: "Distilled Spirits Plant"
created_at: "2024-11-20T14:46:20Z"
updated_at: "2026-05-22T16:17:55Z"
labels: []
gist: "This functionality is available starting with vintrace 9.4.3, but not enabled by default."
tags: ["configuration", "bond", "tax-class", "reporting", "lab", "packaging"]
---

# Configuring a Distilled Spirits Plant (DSP)

This functionality is available starting with [vintrace 9.4.3](https://support.vintrace.com/hc/en-us/articles/32303276816020), but not enabled by default. If you would like to use this functionality, please contact our support team.

The support for [Distilled Spirits Plants (DSP)](https://support.vintrace.com/hc/en-us/sections/32300840834452-Distilled-Spirits-Plant) is for sites that produce spirits for use in winemaking and ready-to-drink products. In order to record operations related to [dealcoholization](https://support.vintrace.com/hc/en-us/articles/32301312106260), redistillation, and production of ready-to-drink products, you’ll need to set up the following:

- [A winery for each DSP bond](#winery)
- [DSP tax classes](#tax_classes)
- [Metric threshold for DSP tax classes](#metric_threshold) (optional)
- [The default DSP alcohol metric](#default_dsp_metric)
- [Product treatments](#product_treatment)
- [Equipment treatments](#equipment_treatment)
- [Bulk dispatch types](#bulk_dispatch_type)
- [Loss reasons](#loss_reason)

## Setting Up a Winery

You will need to [set up a winery](https://support.vintrace.com/hc/en-us/articles/32301281664148) in vintrace for each winery that has a DSP bond. Be sure to set the DSP Bond field in the Bond tab to *Yes*.

![Winery Create - Bond 20230818.png](https://support.vintrace.com/hc/article_attachments/32328574782996)

## Setting Up DSP Tax Classes

You will need to set up a DSP tax class for each TTB report column you wish to report on. To use distilling material in a DSP bond, but keep it off the TTB reports, set up a DSP tax class for a *dm* column that is not supported. This is done to prevent issues with transferring or blending between bonds, and to ensure that the correct DSP tax events are generated.

Some of the DSP tax classes you might want to consider adding are:

- Water (case-sensitive DSP column *water*)
- Flavors (case-sensitive DSP column *flavors*)
- 190° and over (DSP column *i*)
- Under 190° (DSP column *j*)
- Material (case-sensitive DSP column *material*)
- Distilling Material (DSP column *dm*)
- Wine (DSP column *l*)

To set up a TSP tax class:

1. Click ![Setup Icon 20200318.png](https://support.vintrace.com/hc/article_attachments/32328560240660) Set Up in the sidebar.
2. Click TTB.
3. From the DSP Tax Classes tile, click Configure.
4. Click New DSP Tax Class. The DSP Tax Class window displays.

![DSP Tax Class Create 20230818.png](https://support.vintrace.com/hc/article_attachments/32328585004692)

5. Specify the details for the DSP tax class.

- Threshold Policy – Select the threshold policy that will be used to validate whether the alcohol percentage matches the threshold.
- DSP Column – Specify the report column that you want to map this DSP tax class to.
- Requires Gauge – Select this checkbox if the user needs to measure the alcohol percentage to calculate proof gallons when recording a transfer.

6. Click Save.

## Setting Up a Metric Threshold for DSP Tax Classes

If you would like vintrace to trigger warnings when products don’t match the alcohol percentage of the DSP tax class, you’ll want to [set up a metric threshold policy](https://support.vintrace.com/hc/en-us/articles/360000812835-Metric-Thresholds-and-Metric-Action-Policies#CreatingaMetricThreshold) for each DSP tax class. For example, if you set up an Under 190 and a 190 and Over DSP tax class, you will need to set up a metric threshold policy for each.

## Specify the Default DSP Metric

The default DSP metric is used in a number of operations when recording an analysis and also impacts reporting.

To specify the default DSP metric, [edit your defaults](https://support.vintrace.com/hc/en-us/articles/32301350367636). The DSP Alcohol Metric is located in the Policy Defaults section.

![Winery Setup - Defaults - DSP Alcohol Metric 20230818.png](https://support.vintrace.com/hc/article_attachments/32328588082196)

## Setting Up a Product Treatment

You’ll need to [set up a product treatment](https://support.vintrace.com/hc/en-us/articles/32301359713428) for each DSP account. This product treatment enables you to require an alcohol measurement and change the liquid's account.

When setting up the product treatment, be sure to do the following:

- From the Treatment Bond Type list, select *DSP Bond*.
- If an alcohol measurement is required when using this product treatment, select the Requires Gauge checkbox.
- From the DSP Account field, select the DSP account.

![Product Treatment Create 20230821.png](https://support.vintrace.com/hc/article_attachments/32328574934548)

You may also want to set up a product treatment to remove aromas.

## Setting up an Equipment Treatment

Beginning with vintrace 9.4.3, you can specify the DSP account when setting up a tank.

![Tank Create - DSP Account 20230822.png](https://support.vintrace.com/hc/article_attachments/32328574913940)

To specify a DSP account for tanks created prior to 9.4.3, you will need to [set up an equipment treatment](https://support.vintrace.com/hc/en-us/articles/32301313669524) for each DSP account. Be sure to set the Treatment Bond Type to *DSP Bond* and select the appropriate DSP account.

![Equipment Treatment Create 20230822.png](https://support.vintrace.com/hc/article_attachments/32328560291092)

After setting up the equipment treatment, you can apply the treatment to the vessels.

## Setting Up a Bulk Dispatch Type

You’ll also need to [set up a bulk dispatch type](https://support.vintrace.com/hc/en-us/articles/32301281828500) for each DSP bond item. When setting up the bulk dispatch type, be sure to:

- Check the Applies to Dispatches For setting’s DSP Bond checkbox.
- Select the item from the DSP Bond Items list.

![Custom Dispatch Create 20230821.png](https://support.vintrace.com/hc/article_attachments/32328574827028)

You’ll want to set up custom dispatch types to:

- Move distilling material in Part VI from the bonded winery to the DSP bond
- Move wine in Part I from the bonded winery to the DSP bond
- Move low-alcohol wine produced from the dealcoholization process from the DSP bond to the bonded winery
- Move spirits between DSP bonds produced from the dealcoholization process from the DSP bond to the bonded winery
- Move spirits between DSP bonds

## Setting Up a Loss Reason

Be sure to [switch to the DSP winery](https://support.vintrace.com/hc/en-us/articles/360000822456-Using-vintrace-Across-Multiple-Facilities#SwitchingBetweenWineries) before setting up this loss reason.

You’ll need to [set up a loss reason](https://support.vintrace.com/hc/en-us/articles/7395013258383-Setting-Up-a-Loss-Reason) for a DSP tax class. The typical change reason is Research, Development, or Testing.

![Loss Reason 20231102.png](https://support.vintrace.com/hc/article_attachments/32328560351380)
