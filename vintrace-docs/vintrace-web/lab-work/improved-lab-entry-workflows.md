---
id: "32301315138580"
title: "Improved Lab Entry Workflows"
url: "https://support.vintrace.com/hc/en-us/articles/32301315138580-Improved-Lab-Entry-Workflows"
category: "vintrace Web"
section: "Lab work"
created_at: "2024-11-20T14:46:58Z"
updated_at: "2025-01-07T18:39:40Z"
labels: ["estate"]
gist: "vintrace’s improved lab entry workflows give you the flexibility to decide when to enter lab data."
tags: ["lab", "barrels", "lot-identity", "transfers", "work-orders", "blending"]
---

# Improved Lab Entry Workflows

vintrace’s improved lab entry workflows give you the flexibility to decide when to enter lab data. Now you can add lab analysis before a work order is completed and run reports so that you can make informed decisions on lab results sooner.

This latest enhancement lets you save an analysis on a vessel and batch when there is no wine in the vessel. If the date, vessel, and batch of a subsequent transfer matches, vintrace automatically attaches the analysis to the vessel and batch.

## Saving an Analysis Before a Transfer

When you record an analysis on an empty vessel and batch prior to a transfer, be sure to save the transfer using a date and time that’s BEFORE the date and time of the analysis.

You can create a batch from the analysis operation. ![Analysis_-_Create_Batch_20210810.png](https://support.vintrace.com/hc/article_attachments/32328886536212)

For example, suppose we have a work order with an analysis and blend. We saved the analysis job on vessel T60, batch 20CHNV\_B1 on 8/3/2021 at 10:00am.

![TWL967_-_Analysis_Metrics_Fixed_20210812.png](https://support.vintrace.com/hc/article_attachments/32328872704660)

vintrace recognizes that the vessel and batch specified in the analysis is for a vessel without wine and displays the following warning.

![Warning_-_Saving_Analysis_Before_Blend_20210810.png](https://support.vintrace.com/hc/article_attachments/32328872307604)

If you see this warning, click OK to record the analysis using the specified vessel and batch. When the transfer operation is completed on the same vessel and batch, vintrace will attach the analysis.

When you save the transfer operation, be sure that its date and time are BEFORE the date and time of the analysis. In our example, the analysis was saved on 8/3/2021 at 10:00am. Our transfer was saved on 8/3/2021 at 9:30am.

![TWL967_-_Multi_Transfer_20210810.png](https://support.vintrace.com/hc/article_attachments/32328886560660)

The Product Details page of the vessel displays the lab results recorded in the analysis. These results are displayed on both the General tab and the Lab tab.

![T60_-_General_and_Lab_Tabs_20210812.png](https://support.vintrace.com/hc/article_attachments/32328864583956)

Because the date and time for the analysis was after the transfer’s date and time, the jobs display in that same order.

![20CHNV_B1_Jobs_20210810.png](https://support.vintrace.com/hc/article_attachments/32328847867284)

If the analysis is saved using the vessel and batch that the wine is currently in prior to the transfer, you can backdate the transfer to the same vessel and batch. You can also backdate a transfer if the vessel and/or batch is different from the one saved on the analysis.

If vintrace finds a match, it will attempt to attach the analysis to the wine. If no match is found, the analysis will be unattached from the wine. The analysis can be attached at a later time if there’s a subsequent transfer that matches the analysis.

## Saving an Analysis After a Transfer

If you accidentally save the transfer after the analysis, you’ll be able to select the analysis that applies. In the example below, the transfer was saved on 8/9/2021 at 12:00pm; this is after the date and time that the analysis was saved.

![TWL968_-_Analysis_Before_Transfer_20210810.png](https://support.vintrace.com/hc/article_attachments/32328864173204)

In this situation, the Attach Analysis window displays so that you can select the analysis that you want to attach to the transfer job.

![Attach_Analysis_20210810.png](https://support.vintrace.com/hc/article_attachments/32328886610964)

If an analysis is not attached to a wine after saving a transfer, vintrace will attach it after a partial bulk dispatch or partial packaging if the vessel, batch, and dates match.

In order to keep the sequence of the jobs correct, vintrace saves the selected analysis after the transfer. Each time vintrace attaches an analysis to a wine, the User Transaction Audit Report will include an entry showing that the analysis job was reversed.

![User_Transaction_Audit_20210810.png](https://support.vintrace.com/hc/article_attachments/32328892671508)

## Reporting on Unattached Analysis Jobs

Unattached analysis jobs will be included in the following reports:

- Analysis Day Sheet if the Show Active checkbox is NOT selected.

![Winery_Reports_-_Analysis_Day_Sheet_20210810.png](https://support.vintrace.com/hc/article_attachments/32328864406932)

Because the Analysis Day Sheet is based on having a wine in the vessel, the Component is left blank for the unattached analysis. The current value for the unattached analysis currently displays, *Indeterminate*.

![Analysis_Day_Sheet_20210811.png](https://support.vintrace.com/hc/article_attachments/32328892738580)

- Analysis Data Export if the Show For option is set to *Reset*.

![Winery_Reports_-_Analysis_Data_Export_20210810.png](https://support.vintrace.com/hc/article_attachments/32328876126868)

![Analysis_Data_Export_20210810.png](https://support.vintrace.com/hc/article_attachments/32328864355092)

- Ferment Spreadsheet Generator if the Only Show Fermentation Data checkbox is NOT selected.

![Winery_Reports_-_Ferment_Spreadsheet_Generator_20210810.png](https://support.vintrace.com/hc/article_attachments/32328892870164)

![Ferment_Spreadsheet_Generator_20210810.png](https://support.vintrace.com/hc/article_attachments/32328864418580)

- [Operation Throughput Report](https://support.vintrace.com/hc/en-us/articles/32301321300756)

![Operation_Throughput_Report_20210810.png](https://support.vintrace.com/hc/article_attachments/32328876265236)

- Work Detail Report if the Show Analysis and All Analysis checkboxes are selected.

![Winery_Reports_-_Work_Detail_Report_20210810.png](https://support.vintrace.com/hc/article_attachments/32328864518804)

![Work_Detail_Report_20210810.png](https://support.vintrace.com/hc/article_attachments/32328876229140)

Graphs in the Product Analysis and Fermentation report categories will also show unattached analysis results.
