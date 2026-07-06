---
id: "32301303790996"
title: "Air Displacement Report"
url: "https://support.vintrace.com/hc/en-us/articles/32301303790996-Air-Displacement-Report"
category: "Reporting"
section: "Air Compliance"
created_at: "2024-11-20T14:46:40Z"
updated_at: "2025-12-17T19:42:36Z"
labels: []
gist: "Available starting with vintrace 9.4.1."
tags: ["reporting", "compliance", "lab", "lot-identity", "tax-class", "barrels"]
---

# Air Displacement Report

Available starting with vintrace 9.4.1.

This report is not available by default. If you’re interested in using it, contact support to have it enabled for your account.

The Air Displacement Report is an air compliance report that shows the volume of wine that goes into a tank per day (i.e., volumetric throughput). The report includes the details of the wine in the tank at the end of the day. This includes:

- Batch
- Wine type
- Tax state (US only)
- Tax class (US only)
- Ferment state
- Vessel type
- Construction material
- End of day volume
- Metrics - The metrics included will come from the selected analysis template when the report is run. Only metrics with a measured value will be included.

For example, suppose a tank contains 0 gallons at the start of 10/1/2022, then has 1,000 gallons transferred to it at 10:00 that same day. The wine has measured metrics for temperature and alcohol.

![Air_Displacement_Report_Scenario_1_20221025.png](https://support.vintrace.com/hc/article_attachments/32328600148244)

In this example, the volumetric throughput for the tank on 10/01/2022 is 1,000 gallons.

![Air_Displacement_Report_-_Example_1.png](https://support.vintrace.com/hc/article_attachments/32328625377556)

Now consider a scenario where a tank that contains wine at the start of the day is emptied, then has another wine transferred to it. Specifically:

|  |  |
| --- | --- |
| 10/2/2022 00:00 | Tank F5-03 has 1000 gallons of batch MC18A1 in it. |
| 10/2/2022 09:00 | 1000 gallons of batch MC18A1 are transferred from tank F5-03 to tank F5-05. |
| 10/2/2022 12:00 | 500 gallons of batch 12PGBL068 are transferred from tank 111 to tank F5-03 with a measured metric for alcohol. |
| 10/2/2022 16:00 | 500 gallons of batch 12PGBL068 are transferred from tank F5-03 to tank F5-06. |

![Air_Displacement_Report_Scenario_2_20221024.png](https://support.vintrace.com/hc/article_attachments/32328625389588)

The volumetric throughput of the tanks for 10/02/2022 is as follows.

|  |  |
| --- | --- |
| Tank F5-05 | 1000 gallons |
| Tank F5-03 | 500 gallons. Although the end of day volume of tank F5-03 is 0, it will be included in the report because it has a volumetric throughput. The metrics of the last wine that was in it will display in the report’s metrics column. |
| Tank F5-06 | 500 gallons |

![Air_Displacement_Report_-_Example_2.png](https://support.vintrace.com/hc/article_attachments/32328617384468)

## Running the Air Displacement Report

To run the Air Displacement Report:

1. Click ![Reports_Menu_Option_20200406.png](https://support.vintrace.com/hc/article_attachments/32328600156436) Reports in the sidebar.
2. Select Air Compliance.

![Winery_Reports_-_Air_Compliance_-_Air_Displacement_Report_20221025.png](https://support.vintrace.com/hc/article_attachments/32328631797524)

3. Specify the [filters and options](#filters_options) for the report.
4. Click Generate or Email.

## Filters and Options

- From – The first date to include in the report. This defaults to the previous month.
- To – The last date to include in the report. This defaults to the previous month.
- Winery – The winery to run the report for.
- Analysis Template - The [analysis template](https://support.vintrace.com/hc/en-us/articles/32301372281748) used for the report. The selected analysis template controls the metrics that are included in the report’s output. To specify a default analysis template for this report, click the heart icon.
