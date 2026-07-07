---
id: "32303261206932"
title: "Version 9.10.1"
url: "https://support.vintrace.com/hc/en-us/articles/32303261206932-Version-9-10-1"
category: "Release Notes"
section: "Web Version 9"
created_at: "2024-11-20T15:50:40Z"
updated_at: "2024-12-10T23:38:49Z"
labels: ["release-9.10.1"]
gist: "Not all of the new features are enabled by default."
tags: ["release-notes", "permissions", "transfers", "work-orders", "inventory", "additives"]
---

# Version 9.10.1

# Major New Features

Not all of the new features are enabled by default. If you would like to use any of these features, please contact our support team.

## Work Order Status Enforcement

We added a feature that requires work orders to progress using the following statuses:

- Draft
- Ready
- In Progress
- Submitted
- Completed

When this feature is enabled, you will only be able to add jobs to a work order when the work order’s status is set to *Draft*. To support this feature, we added the [Can Adjust Work Order Status Backwards permission](https://support.vintrace.com/hc/en-us/articles/360000813755).

## Reporting Dips and Volume at the Submitted Stage

When this feature is enabled, vintrace remembers the dips and volumes specified when a work order’s status changes from In Progress to Submitted. This provides support for an internal process with compliance to ensure that the dips are correct and allows for them to be changed when the job is completed. The dips at the time the status changed to Submitted and Completed are captured on paper and reprint of the work order.

## Batch Future State Based on Scheduled Work

We updated the following operations to include a Show Projected checkbox that enables you to toggle between the current volume and the last scheduled job's volume:

- Additive
- Measurement
- Multi addition
- Transfer/Rack/Blend
- One-to-many transfer
- Many-to-one transfer
- Extraction
- Press cycle
- Bulk dispatch
- Bulk dispatch inter-winery

# Additional Fixes and Improvements

- We updated the [Can Manage Product Allocations permission](https://support.vintrace.com/hc/en-us/articles/360000813755-Roles-and-Permissions#Permissions) to allow users to see the Manage Allocations link on the [Allocations table](https://support.vintrace.com/hc/en-us/articles/4413615914639).
- We fixed an issue where the Issued By list when creating a work order only included users with the Can Schedule Tasks permission instead of all active system users.
