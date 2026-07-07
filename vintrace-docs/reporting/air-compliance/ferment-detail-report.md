---
id: "32301313705748"
title: "Ferment Detail Report"
url: "https://support.vintrace.com/hc/en-us/articles/32301313705748-Ferment-Detail-Report"
category: "Reporting"
section: "Air Compliance"
created_at: "2024-11-20T14:46:39Z"
updated_at: "2024-11-21T10:17:56Z"
labels: []
gist: "Available starting with vintrace 9.4.1."
tags: ["reporting", "fermentation", "barrels", "lab", "compliance"]
---

# Ferment Detail Report

Available starting with vintrace 9.4.1.

This report is not available by default. If you’re interested in using it, contact support to have it enabled for your account. The Ferment Detail Report is only available to US customers.

The Ferment Detail Report is specific to US customers and provides information on the declared volume for alcoholic fermentation. The report includes the ferment state so that you can identify the liquids that haven’t finished fermentation. It also includes liquids in any vessels including tirage groups and tankers. If a barrel is not in a barrel group, the individual barrel will be shown.

**Example 1**

In our first example, suppose wine is declared on 9/1/2022.

![Ferment_Details_Report_-_Tax_Class_Details_20221025.png](https://support.vintrace.com/hc/article_attachments/32328830261012)

The Ferment Detail Report’s output for that day will show the following.

![Ferment_Details_Report_-_Example_1.png](https://support.vintrace.com/hc/article_attachments/32328830140052)

**Example 2**

For the next example, suppose alcoholic fermentation of a liquid began on 10/2/2022.

![Ferment_Details_Report_-_Wine_Details_01_20221025.png](https://support.vintrace.com/hc/article_attachments/32328822798740)
Below is the Ferment Detail Report on the liquid prior to any analysis.

![Ferment_Details_Report_-_Example_2.1.png](https://support.vintrace.com/hc/article_attachments/32328836175380)

An analysis is done on 10/7/2022 using the Alcohol & Temp analysis template.

![Ferment_Details_Report_-_Wine_Details_02_Analysis_1_20221025.png](https://support.vintrace.com/hc/article_attachments/32328856381204)

The metrics returned for alcohol and temperature are 5 and 10 respectively.

![Ferment_Details_Report_-_Example_2.2.png](https://support.vintrace.com/hc/article_attachments/32328822595604)

On 10/8/2022, a second analysis is done using the same template.

![Ferment_Details_Report_-_Wine_Details_03_Analysis_2_20221025.png](https://support.vintrace.com/hc/article_attachments/32328822625556)

This analysis returns 6 and 15 for the liquid’s alcohol and temperature.

![Ferment_Details_Report_-_Example_2.4.png](https://support.vintrace.com/hc/article_attachments/32328822707860)

On 10/14/2022, a third analysis is done using the same template.

![Ferment_Details_Report_-_Wine_Details_04_Analysis_3_20221025.png](https://support.vintrace.com/hc/article_attachments/32328806039188)

The analysis on 10/14/2022 returns 7 and 20 for the liquid’s alcohol and temperatures. Note that because this analysis is outside the declared date of 10/10/2022, it will not be included in the average computation.

![Ferment_Details_Report_-_Example_2.4.png](https://support.vintrace.com/hc/article_attachments/32328822707860)

**Example 3**

In this example, the liquid has a ferment state of *Fermented* and *Declared*. Alcoholic fermentation ended on 10/15/2022

![Ferment_Details_Report_-_Wine_Details_Example_3_20221025.png](https://support.vintrace.com/hc/article_attachments/32328830400404)

In this example, the average temperature for the vessel and the batch will be calculated between the ferment start date and the ferment stop date.

![Ferment_Details_Report_-_Example_2.3.png](https://support.vintrace.com/hc/article_attachments/32328836262292)

## Running the Ferment Detail Report

To run the Ferment Detail Report:

1. Click ![Reports_Menu_Option_20200406.png](https://support.vintrace.com/hc/article_attachments/32328836216852) Reports in the sidebar.
2. Select Air Compliance.

![Air Compliance - Ferment Detail Report 20231023.png](https://support.vintrace.com/hc/article_attachments/32328836248980)

3. Specify the [filters and options](#filters_options) for the report.
4. Click Generate or Email.

## Filters and Options

- From – The first date to include in the report. This defaults to the previous month.
- To – The last date to include in the report. This defaults to the previous month.
- Winery – The winery to run the report for.
- Metric - The metric to include in the report.
