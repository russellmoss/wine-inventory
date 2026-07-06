---
id: "32301317550740"
title: "Excluding Additives from Summaries"
url: "https://support.vintrace.com/hc/en-us/articles/32301317550740-Excluding-Additives-from-Summaries"
category: "Setup and Admin"
section: "Configuration"
created_at: "2024-11-20T14:46:30Z"
updated_at: "2024-11-21T10:28:48Z"
labels: []
gist: "Available starting with vintrace 9.4.3."
tags: ["additives", "configuration", "reporting", "exports", "migration"]
---

# Excluding Additives from Summaries

Available starting with [vintrace 9.4.3](https://support.vintrace.com/hc/en-us/articles/32303276816020). This functionality is not enabled by default. If you would like to use this functionality, please contact our support team.

There may be times when your wine comes into contact with chemicals, water, or additives that don’t impact the wine’s composition. In these situations, you can exclude the additive from summaries.

[Additives that are excluded from summaries](#exluding) will still display in the operation history and additive reports.

The Jobs tab of the wine’s product page still displays the addition and/or multi-addition jobs. The Wine Additions Report will also continue to show the additive even when it’s excluded from summaries.

## Excluding an Additive from Summaries

To exclude an additive from summaries, be sure to select the Exclude from Additive Summaries checkbox when you [set up the additive](https://support.vintrace.com/hc/en-us/articles/32301344910740).

![Additive_Create_-_Exclude_from_Summaries_20230321.png](https://support.vintrace.com/hc/article_attachments/32329211093140)

If the additive is an allergen (i.e., the Allergen checkbox is selected), you will not be able to exclude the additive from summaries.

If you’re using vintrace’s [import/export functionality](https://support.vintrace.com/hc/en-us/articles/32303307646868) to add or update your additives, the CSV file will include a Exclude from Additive Summaries column. This column accepts either *Yes/No* or *True/False*.

![CSV_Exclude_Additive_Column_20230321.png](https://support.vintrace.com/hc/article_attachments/32329206247060)

## Wine Addition Impact Report

The [Wine Addition Impact Report](https://support.vintrace.com/hc/en-us/articles/32301303124884) displays the ![Orange_Warning_20230321.png](https://support.vintrace.com/hc/article_attachments/32329197644948) orange warning icon if you select an additive that has been excluded from summaries.

![Wine_Addition_Impact_Report_-_Warning_Icon_20230321.png](https://support.vintrace.com/hc/article_attachments/32329238916116)

You can select the Hide Additives that are Excluded from Summaries checkbox to hide these additives.

![Wine_Addition_Impact_Report_-_Hide_Excluded_Checkbox_20230321.png](https://support.vintrace.com/hc/article_attachments/32329206232852)
