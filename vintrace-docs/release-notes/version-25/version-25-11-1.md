---
id: "42708241573780"
title: "Version 25.11.1"
url: "https://support.vintrace.com/hc/en-us/articles/42708241573780-Version-25-11-1"
category: "Release Notes"
section: "Version 25"
created_at: "2025-10-28T04:40:59Z"
updated_at: "2026-05-18T19:28:20Z"
labels: []
gist: "Version roll-out dates: Mon, 3 Nov - Wed, 12 Nov 2025."
tags: ["release-notes", "api", "barrels", "cost", "harvest", "reporting"]
---

# Version 25.11.1

**Version roll-out dates**: Mon, 3 Nov - Wed, 12 Nov 2025

## General availability

*The updates in this section are generally available to all customers as long as the module in question is within the customer package / licensing scope.*

### API enhancements

We've completed enhancements for two of our APIs to further improve data access and reporting.

- [Upsert this booking into vintrace API](https://api-docs.vintrace.com/docs/vintrace-server/450e41fbe6282-upsert-this-booking-into-vintrace) - Extra fields have been added to enable clients to have better data integrity and maintenance.
  - Additional fields: Booked by, grading, number of loads, and reference number.
- [Return vessel and contents details for bulk wines API](https://api-docs.vintrace.com/docs/vintrace-server/d2656d12b6186-return-vessel-and-contents-details-for-bulk-wines-at-a-specified-date-time) - An extra field and query parameters have been added to enable clients to have better reporting and streamline the reporting process.
  - Additional field: Product id.
  - Additional query parameters: Product id, vessel id, vessel type, winery id, and winery name.

### Harvest module

- An issue has been fixed were the cost amount 'type' for a fruit intake could previously not be selected. Note that the 'Can adjust costs' permission is required to see the costs frame and amend these values.![](https://support.vintrace.com/hc/article_attachments/42781150455444)
  - If the intake is linked to a grower contract then this amount type is set by that contract and still cannot be updated here.

### Wine product page

- The Allocations details in the Wine product page have been updated to show a sum of how much of the product is in production as well as how much has already been produced.
  - The 'Supply' column (previously labelled 'Fulfilled') now shows the value for the whole product, and is a sum of the ‘In production’ and ‘Produced’ values displayed in the Product allocation page > General tab.
  - e.g., for this product 250 gallons are in production, and 50 gallons have already been produced.![](https://support.vintrace.com/hc/article_attachments/42781150457364)
  - So the Wine product page > Allocations tab shows the 'Supply' as 300 gallons.![](https://support.vintrace.com/hc/article_attachments/42896177312788)

### eVineyard

- Users who have access to both vintrace and eVineyard can now login once, through vintrace, to access both systems.
  - When logged into vintrace, eVineyard can be accessed via More options > Harvest > eVineyard.![](https://support.vintrace.com/hc/article_attachments/42781150462228)

## Features in pilot

*The features in this section are available to selected pilot clients only. If you are interested in joining the pilot customer group and trialling any of the features below, please contact our support team.*

### Grower contract management module

**Managing Instalment Plans**

The way that grower payments for contracts are scheduled has been improved. You can now add all instalments for a contract for the year at one time via a 'Maintain instalments' button in the Payments section for a selected contract.

![](https://support.vintrace.com/hc/article_attachments/42818843792916)

In the 'New instalment plan' window you can add, update, or remove the instalments for the year.![](https://support.vintrace.com/hc/article_attachments/42708710803732)

This includes a new 'Fixed amount' type instalment where you can specify the amount and date to be paid. The existing 'Fixed date' and 'End of the month following month of delivery' type instalment are also available. You may also assign levies to be deducted from the 'fixed date' type grower payments.

### Harvest Module

**Enhanced Appellations Management (US only)**

We're continuing to make available the opportunity to track wine origin.

- A new optional tile has been added to the Wine product page > Composition tab that allows viewing the appellations the fruit was sourced from for the wine.
  **![](https://support.vintrace.com/hc/article_attachments/42780002302996)**
  - The tiles displayed can be selected via the cog icon.**![Release Notes_Version 25.11.1_Appellations_2.1_2025-10-31.jpg](https://support.vintrace.com/hc/article_attachments/42779985360788)**
  - When the new Appellations tile is selected the appellations are displayed by percentage, i.e., where the most fruit is sourced from first.
