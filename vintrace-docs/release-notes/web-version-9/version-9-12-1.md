---
id: "32303261111828"
title: "Version 9.12.1"
url: "https://support.vintrace.com/hc/en-us/articles/32303261111828-Version-9-12-1"
category: "Release Notes"
section: "Web Version 9"
created_at: "2024-11-20T15:50:39Z"
updated_at: "2024-12-10T23:38:49Z"
labels: ["release-9.12.1"]
gist: "Not all of the new features are enabled by default."
tags: ["release-notes", "barrels", "fermentation", "reporting", "api", "blending"]
---

# Version 9.12.1

# Major New Features

Not all of the new features are enabled by default. If you would like to use any of these features, please contact our support team.

## Vessel Forecasting

We added a [Vessel Forecasting Report](https://support.vintrace.com/hc/en-us/articles/9860630375183) that details the operations that resulted in a vessel’s forecasted batch and volume. This report is located in the Bulk Wine report category.

![Winery Reports - Bulk Wine - Vessel Forecasting 20240528.png](https://support.vintrace.com/hc/article_attachments/32329230764820)

# Additional Fixes and Improvements

- We fixed an issue that prevented some Adjustment operations from being displayed in the Cost Console.
- We fixed an issue that prevented the barrel list icon from displaying in completed single transfer operations.
- We made performance improvements for the products API.
- We fixed an issue that caused the Lab Console's View dropdown menu to be duplicated.
- We fixed an issue that prevented the default pump over and pump down product treatments from displaying in the mobile app for the Ferment Activity job API.
- We fixed an issue in the Lab Console that caused pagination and record counts to be broken when using the Awaiting Approval job status.
- We fixed an issue that caused a trial blend's batch to be overwritten whenever the Trial Blend form was opened.
- We fixed an issue that prevented a fruit intake's intended use from being properly saved and restored.
- We fixed an issue where the Ferment tab was showing addition operations for wines that were fermented and not having ferment data.
- We updated the quick search API to return empty vessels.
