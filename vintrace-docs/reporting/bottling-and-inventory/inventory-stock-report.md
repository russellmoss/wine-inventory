---
id: "32303326373396"
title: "Inventory Stock Report"
url: "https://support.vintrace.com/hc/en-us/articles/32303326373396-Inventory-Stock-Report"
category: "Reporting"
section: "Bottling and Inventory"
created_at: "2024-11-20T15:52:28Z"
updated_at: "2026-05-27T22:19:18Z"
labels: ["estate", "wp-page-5257"]
gist: "The Inventory Stock Report details your stock as of the specified date."
tags: ["inventory", "reporting", "exports", "packaging", "configuration", "cost"]
---

# Inventory Stock Report

The Inventory Stock Report details your stock as of the specified date. The stock items are listed in order by their stock code.

![Inventory_Stock_Report_PDF_and_CSV_20201230.png](https://support.vintrace.com/hc/article_attachments/32329158515860)

Filters enable you to only include stock items that you’re interested in such a particular stock type, or items in a specific location. You can also group the report’s output so that data with identical values display together. You can save the report’s output to a PDF or CSV file, or email the output.

## Running the Inventory Stock Report

To run the Inventory Stock Report:

1. Click Reports in the sidebar.
2. Select Inventory. The Inventory Stock Report displays.

![Winery_Reports_-_Inventory_Stock_Report_20200520.png](https://support.vintrace.com/hc/article_attachments/32329126350740)

3. Specify the [filters and options](#h_0cef1231-2b1d-4688-ac50-2df2a4e1a539) for the report.
4. Click Generate or Email.

## Inventory Stock Report Filters and Options

You can apply the following filters to the Inventory Stock Report:

- Show Stock As At — This defaults to today’s date, but you can select a date that you want to use for the snapshot of your inventory. Typically this is run as a month-end report, but you can run it at any time, as of any date.
- Stock Type — To only include inventory for a particular stock type, select the stock type.
- Owner — To only include inventory that belongs to a specific owner, select the owner.
- Format - Select the output format for the report. The table below summarizes what’s available with each option.

|  |  |  |
| --- | --- | --- |
|  | **PDF** | **CSV** |
| Can group output | Yes | No, but you can sort and group the output in Excel |
| Can break out costing | No | Yes |
| Specify volume equivalents for liquid stock | No | Yes |

- Winery — This filter is only available if you’re in a multi-winery setup. If you’re in a multi-winery set up and are maintaining separate inventories, you can search for the winery that you want to run the report for. Leaving this field blank returns all selected stock regardless of winery.
- Building — To only include inventory for a specific location, select the location.
- Show Equivalent — This is only available when the Format is set to *CSV*. This filter allows you to specify volume equivalents for your liquid stock items.
- Group By — This is only available when the Format is set to *PDF*. Selecting one or more of the Group By checkboxes arranges output with identical values of the selected option together. For example, grouping by stock type organizes the output so that items of the same stock type are together.

![Inventory_Stock_Report_-_Group_By_Stock_Type_20200520.png](https://support.vintrace.com/hc/article_attachments/32329158466324)

- Bond — If you’re set up for multiple bonds and are maintaining separate inventories, you can filter the output to include inventory items that belong to a specific bond.
- Tax Class and Tax State — To include inventory for a specific tax class or tax state, select the value from the list.
- Category — To only include inventory for specific categories, select the categories.
- Include Zero-Level Stock
- Group by Stock Code
- Breakout Costing — This is only available when the Format is set to *CSV*. By default, only a unit cost and total cost are provided. Selecting the Breakout Costing checkbox includes a column for each costing category.
- Precision — The number of decimals to use for reporting on quantities

![Inventory_Stock_Report_CSV_-_Breakout_Costing_Columns_20201230.png](https://support.vintrace.com/hc/article_attachments/32329126450836)

- Include Inactive Stock Items
