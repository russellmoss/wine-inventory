---
id: "48508411412756"
title: "Dynamic MSO2 (Molecular Sulphur Dioxide) calculation"
url: "https://support.vintrace.com/hc/en-us/articles/48508411412756-Dynamic-MSO2-Molecular-Sulphur-Dioxide-calculation"
category: "vintrace Web"
section: "Lab work"
created_at: "2026-04-22T23:43:36Z"
updated_at: "2026-06-02T02:58:17Z"
labels: []
gist: "vintrace allows for MSO2 to be calculated dynamically on an Analysis Task or multiple Analysis Tasks through the Lab Console or on a standalone Analysis Operation, provided the pH and Free SO2 metrics required for the calculation are…"
tags: ["lab", "additives", "configuration", "work-orders", "permissions"]
---

# Dynamic MSO2 (Molecular Sulphur Dioxide) calculation

vintrace allows for MSO2 to be calculated dynamically on an [Analysis Task](#h_01KPST7R50Z22MXF6Y5SCE5BYJ) or [multiple Analysis Tasks](#h_01KPSTMV4MGC6DQ5BA5AAHGQ0A) through the Lab Console or on a standalone [Analysis Operation](#h_01KSS0GE7NKWA9HWJMWGKYMFN0), provided the pH and Free SO2 metrics required for the calculation are entered into that same Analysis Task.

Some set up work is required to configure this automatic calculation.

Note: as of release 2026.05.1 (May 2026), this feature is on a staged rollout and turned OFF by default. It is planned to be enabled for all clients with release 2026.07.1 (July 2026). Please contact vintrace Support if you would like this feature enabled in the meantime.

## Configure your database for MSO2 calculation

vintrace uses the formula Molecular SO2 = free SO2 / (1 + 10pH-1.81) as per Margalit (1997)1

To facilitate dynamic MSO2 calculation, you will need to nominate the Free SO2 metric and pH metric to be utilised in the formula, and the MSO2 metric that you wish to populate with the result.

You can nominate metrics that already exist within your database or [set up new metrics](https://support.vintrace.com/hc/en-us/articles/32301345260948) if required.

You will need the Local vintrace Administrator permission in order to configure MSO2 calculation.

The configuration options can be found in your General Defaults (Set up > General > Defaults) under the '**Molecular SO2 Calculation**' heading, and can be set at both system and/or winery level.

To configure your MSO2 components:

1. Click ![vin_setup_icon.png](https://support.vintrace.com/hc/article_attachments/48795581938708) Set up in the sidebar
2. Click 'General'
3. Click 'Defaults'
4. Select the System (global) or Winery (site specific) tab
5. Locate the 'Molecular SO2 Calculation' heading in the righthand column
6. Select the appropriate Free SO2 metric
7. Select the appropriate pH metric
8. Select the appropriate MSO2 metric to populate

![MSO2_calc_setup.png](https://support.vintrace.com/hc/article_attachments/48917457305364)

In order for the calculation to function correctly, the chosen FSO2 and MSO2 metrics must be in the same unit e.g. both recored in PPM or mg/L

## Utilising the dynamic MSO2 calculator for an individual Analysis Task

When an Analysis Task includes the three metrics you have configured in the previous step, you will see a ![vin_calculator_icon.png](https://support.vintrace.com/hc/article_attachments/48917443241492) calculator icon next to the Molecular SO2 metric.

![](https://support.vintrace.com/hc/article_attachments/48917443241620)

Once you have added your results for Free SO2 and pH, clicking the ![vin_calculator_icon.png](https://support.vintrace.com/hc/article_attachments/48917443241492) calculator icon will complete the formula and populate the MSO2 field with the appropriate result.

![](https://support.vintrace.com/hc/article_attachments/48917457306004)

## Utilising the dynamic MSO2 calculation Action for bulk Analysis Tasks

If you have one or more Analysis Tasks in the Lab Console that include all three metrics required for MSO2 calculation, you can click the Actions dropdown and select 'Calculate MSO2 for this page' to calculate all relevant analysis tasks at once.

![](https://support.vintrace.com/hc/article_attachments/48917443242260)

Calculated results will populate and automatically Update the Analysis Task at the same time.

![](https://support.vintrace.com/hc/article_attachments/48917457306260)

As is standard with the Lab Console, you can also use the Skip checkbox next to a particular Analysis Task in order to exclude it from this bulk Action.

If a required metric is missing from the Analysis Task, or the data entry for a metric is not appropriate (for example non-numeric data), the calculation will simply not complete.

## Utilising the dynamic MSO2 calculator for an individual Analysis Operation

When an Analysis Operation includes the three metrics you have configured in the previous step, you will see a ![vin_calculator_icon.png](https://support.vintrace.com/hc/article_attachments/48917443241492) calculator icon next to the Molecular SO2 metric. Simply enter your values for pH and Free SO2 and click the calculator.

![](https://support.vintrace.com/hc/article_attachments/49853142354708)

The MSO2 result is calculated for you.

![](https://support.vintrace.com/hc/article_attachments/49853133893652)

Save the Operation as normal.

This functionality relates to Operation > Analysis...

![Adding an Analysis Operation from the Operations clipboard](https://support.vintrace.com/hc/article_attachments/49731463934228)

Adding an Analysis Operation from the Operations clipboard

...and adding a Lab Result from the Wine Overview screen.

![Adding a Lab result from the Wine Overview screen](https://support.vintrace.com/hc/article_attachments/49731432238356)

Adding a Lab result from the Wine Overview screen

## Considerations for your nominated MSO2 metric

Your MSO2 Metric is treated the same as other vintrace Metrics. For this reason, it will behave according to its configuration in Set Up > Lab > Metrics. This includes the decimal place precision, minimum and maximum thresholds, and whether it is included in blend calculation.

By default, the dynamic MSO2 calculation will record to three decimal places, but what is displayed on screen will depend on your decimal precision configuration of your MSO2 Metric.

There is also the option to manually input results against the MSO2 Metric. Manually inputted results will overwrite any calculated results. In this instance, you might consider checking the Skip checkbox on the analysis task if you plan to auto-calculate other results in the Lab Console, as the calculation will overwrite any previous data unless explicitly skipped.

1 Margalit, Y. 1997. *Concepts in wine chemistry.* South San Francisco, CA, USA: The Wine Appreciation Guild Ltd: 255–257.
