---
id: "32303276816020"
title: "Version 9.4.3"
url: "https://support.vintrace.com/hc/en-us/articles/32303276816020-Version-9-4-3"
category: "Release Notes"
section: "Web Version 9"
created_at: "2024-11-20T15:50:46Z"
updated_at: "2025-07-11T00:21:41Z"
labels: ["release-9.4.3"]
gist: "The following features are not enabled by default."
tags: ["release-notes", "inventory", "reporting", "exports", "barrels", "migration"]
---

# Version 9.4.3

# Major New Features

The following features are not enabled by default. If you would like to use any of these features, please contact our support team.

## Freight Code on Bulk Dispatches

We added the ability to set up [freight codes](https://support.vintrace.com/hc/en-us/articles/32301303347092).

![Freight_Code_Create_20230119.png](https://support.vintrace.com/hc/article_attachments/32328578810516)

When this functionality is enabled, you’ll be able to:

- Specify a freight code for owners and wineries in the address book.
- Include a freight code in a bulk dispatch. The freight code and its description are printed on the Bill of Lading.

![BOL_-_Freight_Code_20230119.png](https://support.vintrace.com/hc/article_attachments/32328606707348)

- Filter by the freight code when you [search for a dispatch](https://support.vintrace.com/hc/en-us/articles/32301313789460).
- View the freight code when you output the [Stock Dispatch report](https://support.vintrace.com/hc/en-us/articles/32301330369684) to a CSV file.

## Tank Yield

We’ve added the ability to report on [tank yield](https://support.vintrace.com/hc/en-us/articles/32301282102420). When this functionality is enabled, the tank yield is included in the [Bulk Stock Report’s CSV](https://support.vintrace.com/hc/en-us/articles/6392143164559-Tank-Yield#BulkStockReport). To support this functionality, administrators can [require the yield to be provided during Bulk Intake and Import Product operations](https://support.vintrace.com/hc/en-us/articles/6392143164559-Tank-Yield#RequiringYieldDuringBulkIntakeandImportProductOperations). The yield can also be displayed on the [Vessels page](https://support.vintrace.com/hc/en-us/articles/6392143164559-Tank-Yield#VesselsPage) and [Product page](https://support.vintrace.com/hc/en-us/articles/6392143164559-Tank-Yield#ProductPage).

## Spirits Stock Report

We added a new [Spirits Stock Report](https://support.vintrace.com/hc/en-us/articles/32301303165588) which can be used to reconcile the TTB report for proof gallons.

![Spirits_Stock_Report_CSV_20230306.png](https://support.vintrace.com/hc/article_attachments/32328615058964)

We made a change to allow multiple [tax classes](https://support.vintrace.com/hc/en-us/articles/32301306220180) to have the same TTB column ref as an existing tax class. If you have multiple tax classes with the same TTB column ref, the values will be totaled under the same column in the TTB.

## Excluding an Additive from Additive Summaries

We added the ability to [exclude an additive from additive summaries](https://support.vintrace.com/hc/en-us/articles/32301317550740). This functionality enables you to track chemicals, water, or additives that a wine may have contacted without impacting the summary/composition.

![Additive_Create_-_Exclude_from_Summaries_20230321.png](https://support.vintrace.com/hc/article_attachments/32328578879764)

## Transfer Trial Blend to Multiple Tanks

We added the ability to [transfer a trial blend to multiple tanks](https://support.vintrace.com/hc/en-us/articles/32301303004308).

![Vessel_to_Blend_Into_20230420.png](https://support.vintrace.com/hc/article_attachments/32328578866708)

## Crush and Production Locations

We added the ability to [track the location where a wine was crushed and produced](https://support.vintrace.com/hc/en-us/articles/32301302982036).

## Reporting on Distilling Material and Vinegar Stock

We’ve added support for [reporting on distilling material and vinegar stock](https://support.vintrace.com/hc/en-us/articles/32301281614356) for Part VI of the [TTB](https://support.vintrace.com/hc/en-us/articles/32303292459668). This includes the ability to view events for Part VI of the TTB in the [Tax Event Console](https://support.vintrace.com/hc/en-us/articles/360000813855-Tax-Event-Console) and [Tax Breakdown Report](https://support.vintrace.com/hc/en-us/articles/360000813875-Tax-Breakdown-Report).

## Bulk Intake Search Improvements

We added functionality to the [bulk intake’s](https://support.vintrace.com/hc/en-us/articles/360000910255-Bulk-Wine-Intake) search to make it easier to find an existing wine, dispatch, or intake. Depending on the search type selected, you’ll be able to search for the batch, BOL number, or receipt/docket number.

![Search_For_-_Search_Type_Filter_20230123.png](https://support.vintrace.com/hc/article_attachments/32328578831124)

## Bill To Details on Bill of Lading

We added the ability to specify the Bill To name and address on the Bill of Lading (BOL).

![Gap 150 - Bill to on BOL 20230719.png](https://support.vintrace.com/hc/article_attachments/32328615208724)

## Additional Bulk Wine Search Filters

We added the ability to filter the bulk wine search on the product and product vintage when adding a [trial blend](https://support.vintrace.com/hc/en-us/articles/32303333476372). These columns can also be displayed in the [Bulk Wine Search](https://support.vintrace.com/hc/en-us/articles/32303332410516) window.

![GAP](https://support.vintrace.com/hc/article_attachments/32328578901396)

## Blending In-Bond and Taxpaid Wines

We added a new Move to Taxpaid setting for [product treatments](https://support.vintrace.com/hc/en-us/articles/32301359713428). This product treatment can be applied to a [bonded wine prior to blending it with taxpaid wines](https://support.vintrace.com/hc/en-us/articles/32301313077908).

## Cost Tracked (%) Field for a Wine Batch

We’ve added the ability to [specify the percentage of a wine’s cost that will remain with the batch](https://support.vintrace.com/hc/en-us/articles/32301312791828-Adding-a-Wine-Batch#cost_tracked_field). This is useful in situations where you don’t want to track the cost of saignée or lees. In order to support this functionality, we also added the [Can Edit Batch Costs Tracked (%) permission](https://support.vintrace.com/hc/en-us/articles/32303349421588-Roles-and-Permissions).

## Square Feet and Square Metres Units of Measure

We added the Square Feet (Imperial) or Square Metres (Metric) units of measure. These units of measurement will be available wherever other existing units are listed (eg., additive operations, additive items, additive stock items, additive templates).

![Gap](https://support.vintrace.com/hc/article_attachments/32328623113236)

## Costs Included in Fruit Placement Report

We updated the [Fruit Placement Report](https://support.vintrace.com/hc/en-us/articles/32301312850196) to include costs for users who have the [Can View Costs permission](https://support.vintrace.com/hc/en-us/articles/360000813755-Roles-and-Permissions#Permissions).

## Barrel Volumes in Bill of Lading

We added the ability to include the volume of each barrel in the Bill of Lading (BOL). This volume displays in the Vol (L) or Vol (gal) column and is included when the actual barrel is being [dispatched](https://support.vintrace.com/hc/en-us/articles/32303319044372), or when saving a [barrel treatment](https://support.vintrace.com/hc/en-us/articles/32301341352084) that lists each individual barrel.

![Gap](https://support.vintrace.com/hc/article_attachments/32328591853844)

This option is not available for the [Bulk Dispatch (Inter-Winery) operation](https://support.vintrace.com/hc/en-us/articles/32301313513620).

## Display Product Allocations on Product Page

We added the ability to display a batch or wine’s product allocations on the [product page](https://support.vintrace.com/hc/en-us/articles/32303310460948).

![Gap](https://support.vintrace.com/hc/article_attachments/32328591835796)

## Crusher or Press in Fruit Bookings Tank Report

We updated the [Fruit Bookings Tank Report](https://support.vintrace.com/hc/en-us/articles/32301353043348) to include the name of the crusher or press if the report was filtered using either.

![Fruit_Bookings_Tank_Report_-_Crusher_Press_Name_20230306.png](https://support.vintrace.com/hc/article_attachments/32328606771348)

## TWL# Added to Production Loss Report

We added the TWL# to the [Production Loss Report](https://support.vintrace.com/hc/en-us/articles/32301303832084).

## New Permissions

We added the [Can Add Costs on Receival](https://support.vintrace.com/hc/en-us/articles/360000813755-Roles-and-Permissions#can_add_costs_on_receival) and the [Can Dispatch Non-Declared Wine permissions](https://support.vintrace.com/hc/en-us/articles/360000813755-Roles-and-Permissions#can_dispatch_non_declared_wine).

## Evaporating Juice and Reconstituting Concentrate

We added support to ensure that [evaporating juice to concentrate and reconstituting concentrate to juice](https://support.vintrace.com/hc/en-us/articles/32301281778708) are properly reported in the TTB Report.

## Recording Extraction Rates by Load

We added the ability to [specify the rate of addition for an extraction’s additives by load](https://support.vintrace.com/hc/en-us/articles/32301317292308).

## Bulk Cost Movement by Posted Date Report

We added a [Bulk Cost Movement by Posted Date Report](https://support.vintrace.com/hc/en-us/articles/32301281646868). This report lets you report on costs for a specified date range and include all changes to the costs within that time frame.

## Recording Lab Sample Losses

We’ve added an Analysis History window where you can [record lab sample losses and view a vessel’s analysis history](https://support.vintrace.com/hc/en-us/articles/32301299117972) as well as details about the vessel, analysis operation, batch, and work order. The functionality provides the following options when recording a measurement:

- Adjust the volume of a vessel by the amount taken during a measurement
- Enter the vessel’s new volume

## Distilled Spirits Plant

We've added support for [Distilled Spirits Plants (DSP)](https://support.vintrace.com/hc/en-us/sections/8224853367311-Distilled-Spirits-Plant).

# Additional Fixes and Improvements

- We added the *Available Forecast* column to the [Vineyards and Blocks page](https://support.vintrace.com/hc/en-us/articles/32301313410196) and renamed the *Forecast* column to *Producing Forecast*.
- We fixed an issue where the Break Barrels operation didn't apportion the allocated volume properly.
- We fixed an issue that caused the TTB Report to return an error when it was run for the whole year.
- We fixed an issue where using the tanker search in a Bulk Intake or Bulk Dispatch (Inter-Winery)  operation displayed non-empty tankers.
- We updated the Can Add/Edit Vessels permission to include tankers.
- We updated the [Bulk Stock Receipt report](https://support.vintrace.com/hc/en-us/articles/32301367238036) to include the following columns: fruit cost, additions cost, cellar work cost, packaging cost, storage cost, overheads cost, and other cost.
- We fixed an issue where adjusting the costs on a completed bulk intake only displayed the cost of bulk wine if the costs were originally entered as $/gallon or $/liter.
- We fixed an issue where [product treatments](https://support.vintrace.com/hc/en-us/articles/32301359713428) that changed the tax class to *Sparkling, Produced by Fermentation* were incorrectly being reported on line 2BF (Bottled Fermented) of the TTB (Part I, column e (Sparkling Wine)) instead of line 2BP (Bulk Processed).
- We updated how proof gallons are calculated for products that are in Part III of the TTB Report. The calculation will use the alcohol percentage on the batch. This percentage can be displayed and edited from the Product page. If there is no alcohol percentage on the batch, the proof gallons calculation will use the alcohol percentage on the Spirits tax class. This change affects the [TTB Report](https://support.vintrace.com/hc/en-us/articles/32303292459668) and [Spirits Stock Report](https://support.vintrace.com/hc/en-us/articles/32301303165588), as well as the [Tax Event Console](https://support.vintrace.com/hc/en-us/articles/32303292976276).

# Previous Releases for Version 9

- [9.4.2](https://support.vintrace.com/hc/en-us/articles/5712508444815-Version-9-4-2)
- [9.4.1](https://support.vintrace.com/hc/en-us/articles/5300139865487)
- [9.3.6](https://support.vintrace.com/hc/en-us/articles/5127618099599)
- [9.3.5](https://support.vintrace.com/hc/en-us/articles/4976690279183)
- [9.3.4](https://support.vintrace.com/hc/en-us/articles/4793466462479)
- [9.3.3](https://support.vintrace.com/hc/en-us/articles/4596513574671)
- [9.3.2](https://support.vintrace.com/hc/en-us/articles/4414582586511)
- [9.3.1](https://support.vintrace.com/hc/en-us/articles/4407425065999)
- [9.2.3](https://support.vintrace.com/hc/en-us/articles/4404911218703)
- [9.2.2](https://support.vintrace.com/hc/en-us/articles/4403041044495)
- [9.2.1](https://support.vintrace.com/hc/en-us/articles/360004254195)
- [9.1.3](https://support.vintrace.com/hc/en-us/articles/360002654955)
- [9.1.2](https://support.vintrace.com/hc/en-us/articles/360002015216)
- [9.0.6](https://support.vintrace.com/hc/en-us/articles/360001915076)
- [9.0.5](https://support.vintrace.com/hc/en-us/articles/360001599576)
- [9.0.4](https://support.vintrace.com/hc/en-us/articles/360001525055)
- [9.0.3](https://support.vintrace.com/hc/en-us/articles/360001470315)
- [9.0.2](https://support.vintrace.com/hc/en-us/articles/360001465116)
- [9.0.1](https://support.vintrace.com/hc/en-us/articles/360001407055)
