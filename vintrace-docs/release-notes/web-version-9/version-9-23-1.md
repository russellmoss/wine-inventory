---
id: "32301264398996"
title: "Version 9.23.1"
url: "https://support.vintrace.com/hc/en-us/articles/32301264398996-Version-9-23-1"
category: "Release Notes"
section: "Web Version 9"
created_at: "2024-11-20T14:45:52Z"
updated_at: "2024-12-10T23:38:49Z"
labels: []
gist: "The following features will now be enabled by default:."
tags: ["release-notes", "exports", "inventory", "harvest", "migration", "blending"]
---

# Version 9.23.1

# Additional Fixes and Improvements

- The following features will now be enabled by default:
  - - - [Exporting and Importing Product Allocations](https://support.vintrace.com/hc/en-us/articles/9643964095631-Exporting-and-Importing-Product-Allocations)
      - [Exporting and Importing Products](https://support.vintrace.com/hc/en-us/articles/9644610403855-Exporting-and-Importing-Allocated-Products)
      - Additional field for [Brand](https://support.vintrace.com/hc/en-us/articles/5756485824399-Setting-Up-a-Brand) on products
      - Ability to filter products by auto-code
      - 'Produced' value on products increases from a bulk dispatch
      - Ability to search by product when creating trial blends
      - [Transferring a trial blend to multiple tanks](https://support.vintrace.com/hc/en-us/articles/6634107934479-Transferring-a-Trial-Blend-to-Multiple-Tanks)
      - Ability to [set up a default fruit booking duration](https://support.vintrace.com/hc/en-us/articles/6168220812687-Setting-Up-Default-Fruit-Booking-Duration)
      - Ability to print small lab sample labels
      - Ability to bulk update year end stock takes
      - [Bulk dispatch (inter-winery)](https://support.vintrace.com/hc/en-us/articles/5865625691663-Bulk-Dispatch-Inter-Winery)
      - Barrel transfer (inter-winery)
      - [Bulk Cost Movement by Posted Date report](https://support.vintrace.com/hc/en-us/articles/7825385745935-Bulk-Cost-Movement-by-Posted-Date-Report)

- Added the ability to [prevent negative stock](https://support.vintrace.com/hc/en-us/articles/10724200712591-Prevent-Negative-Stock)
- Additional columns have been added to the Fruit Intake CSV download for the following:
  - - - Duration
      - End Time
      - Pick Date
      - Sub Region / Micro AVA
      - Docket(s) / Weigh Tag(s)
      - Voided Docket(s) / Weigh Tag(s)
      - In Progress
- Fixed an issue with batch forecasting on a completed operation
- Fixed an issue where some jobs were highlighted when editing an existing job with forecasting on
- Fixed an issue on the Bulk dispatch (inter-winery) operation where volumes weren't pre-populating during a full transfer
- Fixed an issue showing incorrect costs for depleted batches on the Wine Production Loss report
- Fixed an issue with sales orders where some refunds were not displaying correctly
- Fixed an issue where some additions weren't appearing on completed many-to-one operations
- Fixed an issue with a looping confirmation dialog when completing some rollback/replay jobs
