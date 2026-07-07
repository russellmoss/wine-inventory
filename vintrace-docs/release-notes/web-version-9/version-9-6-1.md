---
id: "32303261607828"
title: "Version 9.6.1"
url: "https://support.vintrace.com/hc/en-us/articles/32303261607828-Version-9-6-1"
category: "Release Notes"
section: "Web Version 9"
created_at: "2024-11-20T15:50:44Z"
updated_at: "2025-06-23T23:53:09Z"
labels: ["release-9.6.1"]
gist: "Not all of the new features are enabled by default."
tags: ["release-notes", "reporting", "barrels", "harvest", "inventory", "blending"]
---

# Version 9.6.1

# Major New Features

Not all of the new features are enabled by default. If you would like to use any of these features, please contact our support team.

## Bin Adjustment for Common Tare

We added the ability to [adjust a bin's tare](https://support.vintrace.com/hc/en-us/articles/32301265896596) during a fruit intake.

## Product Allocation Code on Vessels Page

We added the ability to [display the Product Code column on the Vessels page](https://support.vintrace.com/hc/en-us/articles/32301323976084). You can also [filter the Vessels page](https://support.vintrace.com/hc/en-us/articles/360001550655-The-Vessels-Page#FilteringtheVesselsPage) by product code.

## Product Field on a Trial Blend

We added the ability to specify a product when adding or updating a [trial blend](https://support.vintrace.com/hc/en-us/articles/32303333476372). You can also filter the Trial Blend Console by product.

## Billing Address in the BOL

We added an option to specify a billing address on the Bill of Lading Declaration screen.

## Grower Contract Details Report

We added a Grower Contract Details report.

## Winegrower Tax Return (Supplemental Report)

The supplemental [Winegrower Tax Return Report](https://support.vintrace.com/hc/en-us/articles/32301282187156) provides data that can be used by California wineries in the US to submit the Winegrower Tax Return. It includes information for bonded and taxpaid bulk wines.

## Booking Confirmation Report

The [Booking Confirmation report](https://support.vintrace.com/hc/en-us/articles/6168036669839-Booking-Confirmation-Report) lists all the bookings for the selected Grower.

## Distilling Material and Vinegar Stock

We’ve added support for [reporting on distilling material and vinegar stock](https://support.vintrace.com/hc/en-us/articles/7935696922895) for Part VI of the [TTB](https://support.vintrace.com/hc/en-us/articles/360000813955). This includes the ability to view events for Part VI of the TTB in the [Tax Event Console](https://support.vintrace.com/hc/en-us/articles/360000813855-Tax-Event-Console) and [Tax Breakdown Report](https://support.vintrace.com/hc/en-us/articles/360000813875-Tax-Breakdown-Report).

## Show Volume of Wine Per Barrel in the BOL

We added the ability to include the volume of each barrel in the Bill of Lading (BOL). This volume displays in the Vol (L) or Vol (gal) column and is included when the actual barrel is being [dispatched](https://support.vintrace.com/hc/en-us/articles/360000824696), or when saving a [barrel treatment](https://support.vintrace.com/hc/en-us/articles/360001916975) that lists each individual barrel.

## Adding and Removing Staves

We added the ability to apply equipment treatments to [add or remove staves](https://support.vintrace.com/hc/en-us/articles/32301317775252) from a tank. Users with the necessary permission or role will be able to filter on and display whether a tank contains staves. We also added the ability to view and filter the Contains Staves column on the [Vessels page](https://support.vintrace.com/hc/en-us/articles/32301344827924).

## Block Disease Status

We added the ability to [record a block’s disease status](https://support.vintrace.com/hc/en-us/articles/32301311622676) when recording a block assessment.

## Seasonal Grading on Vineyards & Blocks Page

We added the ability to display the seasonal grading on the Vineyards & Blocks page. When this functionality is enabled, you can [include the Seasonal Grading column on the page](https://support.vintrace.com/hc/en-us/articles/5648201450383-Customizing-the-Vineyards-Blocks-Page#ChangingtheColumnsDisplayed).

![Seasonal Grading Column 20240208.png](https://support.vintrace.com/hc/article_attachments/32328542561812)

## Carrier Filter on Fruit Intake Console

We added the ability to filter the [Fruit Intake Console](https://support.vintrace.com/hc/en-us/articles/360000826116-Fruit-Intake-Console) by carrier.

![Fruit Intake Console - Carrier Filter 20240208.png](https://support.vintrace.com/hc/article_attachments/32328573456404)

When this functionality is enabled, you’ll also be able to [display the Carrier column in the Fruit Intake Console](https://support.vintrace.com/hc/en-us/articles/360000826116-Fruit-Intake-Console#CustomisingtheFruitIntakeConsole).

![Update Booking View Configuration 20240208.png](https://support.vintrace.com/hc/article_attachments/32328573430804)

![Fruit Intake Console - Carrier 20231130.png](https://support.vintrace.com/hc/article_attachments/32328583692820)

## Grower Contract Report Updates

We added the ability to include the following columns in the CSV output of the Grower Contract Installment Payments report:

- Vineyard
- Block
- Variety
- Sub AVA/Region
- Micro AVA/Sub Region

We also updated the Grower Contract Remittance report to include dates below the Paid to Date and This Payment column headers. Below the Paid to Date header is the date of the second to last payment. Below the This Payment header is the date the last payment was made.

## Custom Field for Block Assessments

We added the ability to include an [optional custom field for block assessments](https://support.vintrace.com/hc/en-us/articles/32301301650708) that can be used to record an alphanumeric value that’s relevant to your winery.

## Out-of-Range Metrics in Grape Delivery Report

We added the ability to [highlight out-of-range metrics in the Grape Delivery report](https://support.vintrace.com/hc/en-us/articles/32301280581012).

# Additional Fixes and Improvements

- We fixed an issue where Units and/or Stock level values was incorrectly displayed on the Completed Adjustment Operations.
- We updated the Inventory Summary Report to include the Category column and updated the Winery column when "Group by category" is unchecked.
- We fixed an issue where the error "Please enter an amount before calculating any loss" occurred when calculating the "Loss for Adjust volume by amount" mode.
- We fixed an issue where the wrong tab was highlighted in the Product page when the Ferment tab and Crushed At tabs were hidden.
- We fixed an issue where the Sample Instruction field was not updated when another Analysis Template was selected on the Analysis operation.
- We fixed an issue where a user had to select vintage to see data in the columns in Vineyards & Blocks page.
- We fixed saved search issues with metrics and returning to the search via the search results stepper.
- We fixed an issue where Freight Code was no longer shown on the Bill of Lading Declaration screen.
- We fixed an issue that caused the Next buttons to improperly function when the Manage button in Address Book was previously clicked.
- We fixed an issue where pressing onto other fermenting wine triggers stop ferment.
- We updated the Vineyards & Blocks page to allow sorting on metrics collected from the block’s Grape Sampling window.
- We updated the Sample Day Sheet report to include the earliest harvest date when the report is run for a specific vintage.
- We renamed the [*Can Switch Between Winery Facilities* permission to *All Winery Access*](https://support.vintrace.com/hc/en-us/articles/360000813755-Roles-and-Permissions#All-Winery-Access).
