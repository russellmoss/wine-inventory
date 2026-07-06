---
id: "32303261495444"
title: "Version 9.7.1"
url: "https://support.vintrace.com/hc/en-us/articles/32303261495444-Version-9-7-1"
category: "Release Notes"
section: "Web Version 9"
created_at: "2024-11-20T15:50:43Z"
updated_at: "2024-12-10T23:38:49Z"
labels: ["release-9.7.1"]
gist: "Not all of the new features are enabled by default."
tags: ["release-notes", "barrels", "reporting", "transfers", "compliance", "fermentation"]
---

# Version 9.7.1

# Major New Features

Not all of the new features are enabled by default. If you would like to use any of these features, please contact our support team.

## Barrel's Last Filled Date

We added the ability to track a barrel’s last filled date.

![Barrel Create - Last Filled Date 20240415.png](https://support.vintrace.com/hc/article_attachments/32329243420180)

This date will NOT be copied when using the Copy From functionality to copy the barrel.

When wine is transferred into an empty barrel, the last filled date will be set to the operation date for the following:

- Many to one transfer
- One to many transfer
- Transfer/Rack/Blend
- Transfer to barrel group
- Bulk intake
- Extraction
- Press cycle

If the destination barrel is not empty, the last filled date will NOT be updated.

## Allocation Adjustments in Audit Report

We added an option to the User Transaction Audit Report to show the produced values for allocation.

![Winery Reports - System Audit - User Transaction Audit - Show Allocation Adjustments 20240416.png](https://support.vintrace.com/hc/article_attachments/32329251742100)

# Additional Fixes and Improvements

- In the [DSP Tax Events Report](https://support.vintrace.com/hc/en-us/articles/8259581996175), we filter out DSP tax events for losses that are not reported on the three DSP reports (i.e., Storage, Processing, and Production).
- We fixed an issue that incorrectly included completed results in the Lab Console when the Job Status filter was not specified.
- We fixed an error that occurred when saving a Pump Over, Punch Down, or Relocate Bulk Wine product treatment.
