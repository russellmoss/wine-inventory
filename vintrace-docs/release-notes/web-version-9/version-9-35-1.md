---
id: "37766023646356"
title: "Version 9.35.1"
url: "https://support.vintrace.com/hc/en-us/articles/37766023646356-Version-9-35-1"
category: "Release Notes"
section: "Web Version 9"
created_at: "2025-05-23T06:06:53Z"
updated_at: "2025-06-02T00:21:41Z"
labels: []
gist: "Introducing a brand new way to handle product allocations, a new tab on the wine batch overview page to allocate directly from a vessel\\."
tags: ["release-notes", "lab", "transfers", "barrels", "harvest", "blending"]
---

# Version 9.35.1

**New Features**

- Introducing a brand new way to handle product allocations, a new tab on the wine batch overview page to [allocate directly from a vessel](https://support.vintrace.com/hc/en-us/articles/36568990808980-Viewing-and-Editing-Allocations-from-Product-Page)\*
  - \* This feature is available to selected pilot clients only
- Grower Contract Management (Beta) Module\*:
  - The main Contract Management page is now filtered by the current vintage by default
  - Allow levies to be added and removed from individual contracts
  - Calculate and deduct the levy values when processing a grower payment
  - A messages is now shown when an invalid contract has been selected to create a remittance report
  - \* This module is available to selected pilot clients only

**Performance Improvements**

- Fixed an error occurring when saving Multi topping, Transfer/Rack/Blend, Multi transfer (one-to-many) and Multi transfer (many-to-one) operations

**Additional Improvements**

- Updated the scale certification version number to NTEP CC: 23-058A1
- Fixed an issue where the Activity Summary Report did not exclude reversed transactions
- Fixed an issue where batches were taking on the wrong analyses when an analysis operation was backdated for the source vessel's wine prior to the blend
- Fixed an issue when creating an Analysis Work Order from the Vessels page > Actions > Work order > Analysis doesn't use the Metric order from the Analysis Template
