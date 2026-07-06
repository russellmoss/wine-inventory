---
id: "32303266611988"
title: "Version 9.5.1"
url: "https://support.vintrace.com/hc/en-us/articles/32303266611988-Version-9-5-1"
category: "Release Notes"
section: "Web Version 9"
created_at: "2024-11-20T15:50:44Z"
updated_at: "2024-12-10T23:38:49Z"
labels: ["release-9.5.1"]
gist: "Not all of the new features are enabled by default."
tags: ["release-notes", "lab", "lot-identity", "work-orders", "api", "inventory"]
---

# Version 9.5.1

# Major New Features

Not all of the new features are enabled by default. If you would like to use any of these features, please contact our support team.

## Job Management Console Enhancements

We added the ability to sort the [Jobs Management Console](https://support.vintrace.com/hc/en-us/articles/32303318317972) by the expected completion date or priority, and filter the jobs by priority.

## Copy Details from Existing Batches on Creating a New Batch

We added the ability to copy details from an existing batch when [creating a new batch](https://support.vintrace.com/hc/en-us/articles/32301312791828).

![Simple Wine Batch - Copy From 20230913.png](https://support.vintrace.com/hc/article_attachments/32328807149332)

## Lab Sample Tracking

We added an option to filter the Lab Console based on whether the sample has arrived. We also updated the Analysis window to include fields for specifying when a sample arrives and who received it.

# Additional Fixes and Improvements

- We fixed an issue that incorrectly required the volume to be specified when using a work order template even when it was marked as non-mandatory.
- For DSPs only, we ignore any ferment state blending
- We fixed an issue to ensure that the grower is mandatory when creating or editing [grower contracts](https://support.vintrace.com/hc/en-us/articles/32301319829268).
- We updated the [create a new bulk intake API endpoint](https://api-docs.vintrace.com/docs/vintrace-server/60b698535626f-create-a-new-bulk-intake) to include the ability to input a specific batch owner.
- We fixed an issue with the Additive operation that prevented the selection of a treatment to change the tax class.
- We fixed an issue where the source vessel's details were not included on a printed work order for a bin transfer job.
- We added support for additional stock item detail tags on the Equipment Treatment operation's print template.
- We fixed an issue that prevented the [Stock Dispatch Report's](https://support.vintrace.com/hc/en-us/articles/32301330369684) Part VI and DSP Dispatch Types filters from displaying.
- We changed the [create a new bulk intake API endpoint's](https://api-docs.vintrace.com/docs/vintrace-server/60b698535626f-create-a-new-bulk-intake) virtualVessel option so that the winery prefix is used when creating the virtual vessel. If the winery prefix does not exist, the winery's name will be used.
- We updated the [Operation Throughput Report](https://support.vintrace.com/hc/en-us/articles/32301321300756) to display additional location details for the Move Barrels/ Relocate Bulk Wine product treatment.
- We updated the Measurement operation's print template to include the current barrel count when a vessel is in a barrel group.
- We fixed an issue where the Total Weight and/or Weight per Vessel rows on the BOL Declaration window and generated BOL were reporting incorrect values and/or units.
- We fixed an issue to ensure that the columns and filters on the [Vessels page](https://support.vintrace.com/hc/en-us/articles/32301344827924) retain their state after viewing the search results.
- We fixed an issue to ensure that the barrel group fill instructions and the number of barrels are printed on work orders for all operations where a barrel group can be created.
- We fixed an issue that prevented bulk dispatch and bulk wine events from being included in the [Fruit Placement Report](https://support.vintrace.com/hc/en-us/articles/32301312850196).
- We fixed an issue that was causing the tax state to be mandatory when scheduling a Bulk Intake operation on a work order.
- We replaced the Analysis Template filter in the [Ferment Detail Report](https://support.vintrace.com/hc/en-us/articles/32301313705748) with the Metric filter.
- We updated the [Wine Production Loss Report](https://support.vintrace.com/hc/en-us/articles/5709688817423) to include winery as a filter and a column in the output.
