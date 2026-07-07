---
id: "32303283058068"
title: "Version 9.9.1"
url: "https://support.vintrace.com/hc/en-us/articles/32303283058068-Version-9-9-1"
category: "Release Notes"
section: "Web Version 9"
created_at: "2024-11-20T15:50:42Z"
updated_at: "2024-12-10T23:38:49Z"
labels: ["release-9.9.1"]
gist: "Not all of the new features are enabled by default."
tags: ["release-notes", "exports", "inventory", "configuration", "migration", "harvest"]
---

# Version 9.9.1

# Major New Features

Not all of the new features are enabled by default. If you would like to use any of these features, please contact our support team.

## Export and Import Allocated Products

We added the ability to [export and import allocated products using a CSV file](https://support.vintrace.com/hc/en-us/articles/32301265307284).

## Export and Import Product Allocations

We added the ability to [manage product allocations using a CSV file](https://support.vintrace.com/hc/en-us/articles/32301265383060).

## Wet and Dry Dips

We added the ability to add a [wet dip and dry dip table to tanks](https://support.vintrace.com/hc/en-us/articles/32301297422612) and specify which is the default.

## Adjust Completion Status for Products

We added the ability to [change a product's completion status](https://support.vintrace.com/hc/en-us/articles/32301301230100).

## Disable Allocation Adjustment on Loss

We added a system setting that enables you to prevent automatic adjustments to allocations in the event of a loss so that losses are taken from unallocated volumes, preventing undesired allocation changes.

![Winery Setup - Disable Allocation Adj for Loss 20240430.png](https://support.vintrace.com/hc/article_attachments/32328779202452)

# Additional Fixes and Improvements

- We fixed an issue where a multi-transfer tax event displayed an unexpected DSP related tax change reason.
- We fixed an error that occurred when non-US customers saved a Bulk Dispatch.
- We updated weigh tag dockets for multiple loads to display each load on a a new page.
- We fixed an issue where Common Tare was not displaying correctly on the Grape Received Scale.
- We fixed an issue where the transaction search API call no longer returned analysis results.
- We fixed an issue where the Dispatch Details feild on the BOL Declaration screen wasn't displaying the from vessel's name when the Bulk Dispatch (inter-winery) operation was scheduled.
