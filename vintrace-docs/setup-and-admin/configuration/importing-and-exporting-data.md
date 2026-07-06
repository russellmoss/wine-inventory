---
id: "32303307646868"
title: "Importing and Exporting Data"
url: "https://support.vintrace.com/hc/en-us/articles/32303307646868-Importing-and-Exporting-Data"
category: "Setup and Admin"
section: "Configuration"
created_at: "2024-11-20T15:52:14Z"
updated_at: "2024-11-21T10:29:31Z"
labels: ["estate", "wp-page-4145"]
gist: "The ability to import and export data is only available to users with the Import/Export Setup Data permission."
tags: ["exports", "migration", "configuration", "barrels", "permissions"]
---

# Importing and Exporting Data

The ability to import and export data is only available to users with the [Import/Export Setup Data permission](https://support.vintrace.com/hc/en-us/articles/32303349421588#Permissions).

vintrace enables you to import and export data using a CSV (Comma-Separated Values) file. This functionality is useful when you need to set up a large number of records such as [new barrels](https://support.winery-software.com/hc/en-us/articles/360001287096-Setting-Up-New-Barrels#h_c44d8f9b-9f42-47e0-a6cd-e43a7e319920), a [tank’s dip chart](https://support.winery-software.com/hc/en-us/articles/360001936716-Setting-Up-a-Tank-s-Dip-Chart), or [sales price list](https://support.winery-software.com/hc/en-us/articles/360000812575-Exporting-and-Importing-a-Sales-Price-List).

![Import_Export_Buttons_20201105.png](https://support.vintrace.com/hc/article_attachments/32328839328404)

The import and export functionality can also be used when you want to copy data from an existing record and use it for a new record. For example, suppose you have a new client and want to set up a sales price list with the same items as an existing client. You can [export the sales price list](https://support.winery-software.com/hc/en-us/articles/360000812575-Exporting-and-Importing-a-Sales-Price-List#ExportingaSalesPriceList) of the existing client, edit the CSV file to reflect the prices for the new client, then [import the file for the new sales price list](https://support.winery-software.com/hc/en-us/articles/360000812575-Exporting-and-Importing-a-Sales-Price-List#ImportingANewSalesPriceList).

The export functionality creates a CSV file with your records’ existing data. CSV files can be viewed and edited in Excel. However, they do not contain text formatting (e.g., color, bold, italic), formulas, or filters. When you perform an export from vintrace, headers will be included in the CSV. Headers are helpful for identifying what data the column contains.

![CSV_Headers_20201105.png](https://support.vintrace.com/hc/article_attachments/32328855452692)

In some cases, you can download a CSV file that only contains the headers (i.e., no data). A file with only the headers is useful when you want to enter new data; for example, when you want to set up barrels.

## Editing a CSV File

If the CSV file includes a VINx2 ID column, be sure to leave that column as-is; do not edit it.

Each CSV file can contain up to 1000 records (not including the header row). If you need to import more than 1000 records, you’ll need to create multiple CSV files then import them in order.
