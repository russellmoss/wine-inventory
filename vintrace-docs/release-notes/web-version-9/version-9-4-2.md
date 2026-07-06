---
id: "32303276924308"
title: "Version 9.4.2"
url: "https://support.vintrace.com/hc/en-us/articles/32303276924308-Version-9-4-2"
category: "Release Notes"
section: "Web Version 9"
created_at: "2024-11-20T15:50:47Z"
updated_at: "2024-12-10T23:38:49Z"
labels: ["release-9.4.2"]
gist: "We've added the option to associate products with a brand."
tags: ["release-notes", "permissions", "barrels", "configuration", "reporting"]
---

# Version 9.4.2

# Major New Features

## Associate Products with a Brand

We've added the option to associate products with a [brand](https://support.vintrace.com/hc/en-us/articles/5756485824399-Setting-Up-a-Brand). When this option is enabled, users with the necessary permission or role will be able to:

- Update the [Vessels page](https://support.vintrace.com/hc/en-us/articles/32301344827924) to filter on and display the brand.
- Specify the brand when they add a product. The [Product Allocation Details page](https://support.vintrace.com/hc/en-us/articles/32301350652948) displays a Brand tile.
- Filter by brand and display the Brand column in the [Bulk Wine Search](https://support.vintrace.com/hc/en-us/articles/32303332410516).

## Add or Remove Staves

We added the ability to apply equipment treatments to [add or remove staves](https://support.vintrace.com/hc/en-us/articles/32301317775252) from a tank. Users with the necessary permission or role will be able to filter on and display whether a tank contains staves. We also added the ability to view and filter the Contains Staves column on the [Vessels page](https://support.vintrace.com/hc/en-us/articles/32301344827924).

## Fruit's Intended Use

We added the ability to display fruit’s intended use in the [Composition tab](https://support.vintrace.com/hc/en-us/articles/360000814455-The-Product-Page#CompositionTab) of a wine.

![Gap_120_-_Product_Details_-_Composition_Intended_Use_20221110.png](https://support.vintrace.com/hc/article_attachments/32328835930132)

We also added the ability to display the intended use when viewing a historic wine’s composition.

![Gap_120_-_Historic_Wine_-_Product_Overview_-_Composition_Intended_Use_20221110.png](https://support.vintrace.com/hc/article_attachments/32328805737108)

We also also updated the Fruit Placement Report to allow for filtering on the intended use.

![Gap_120_-_Fruit_Placement_Report_-_Intended_Use_20221110.png](https://support.vintrace.com/hc/article_attachments/32328850765076)

The Intended Use is based on the following, in this order:

1. The intended use specified for the scale booking during the fruit intake.
2. The intended use specified for the block’s season.
3. The intended use specified for the block details.

## Bulk Dispatch (Inter-Winery) Operation

We added a [Bulk Dispatch (Inter-Winery) operation](https://support.vintrace.com/hc/en-us/articles/32301313513620). When this feature is enabled, the operation enables a winery to generate and search for a BOL for inter-winery transfers. In order to support this operation, we also made the following updates:

- Added the ability to filter the Vessels page by tankers.
- Updated the Stock Dispatch Report to include Bulk Dispatch (Inter-Winery) operations.

## Grower Contract Instalment Dates

We added the ability to [specify instalment dates for grower contracts](https://support.vintrace.com/hc/en-us/articles/32301282381972).

![Edit_Grower_Installment_Dates_20221220.png](https://support.vintrace.com/hc/article_attachments/32328835820948)

When this feature is enabled, you’ll be able to search grower contracts by the next instalment date and view instalment details in the Grower Contract Console.

![Grower_Contract_Console_20221220.png](https://support.vintrace.com/hc/article_attachments/32328829979412)

## Require Earliest Harvest Date for Fruit Bookings

We added the [Block Fruit Bookings if the Block’s Earliest Harvest Date Is Not Set setting to the system policy](https://support.vintrace.com/hc/en-us/articles/32301318085524). This setting allows local system administrators to prevent [fruit bookings](https://support.vintrace.com/hc/en-us/articles/32303268370324) if the block’s earliest harvest date was not specified during a [block assessment](https://support.vintrace.com/hc/en-us/articles/360000826036-Recording-Seasonal-Block-and-Viticulture-Assessments#RecordingaNewAssessment).

![Winery_Setup_-_System_Policy_-_Earliest_Harvest_Date_Reqd_20230105.png](https://support.vintrace.com/hc/article_attachments/32328835840788)
When the setting is enabled, it affects fruit bookings that are added from the Fruit Intake Console and the importer. If a user attempts to schedule a fruit booking for a block that does not have its earliest harvest date specified, the following error displays:

```
The block <BlockName> does not have an earliest harvest date recorded.
```

## Default Fruit Booking Duration Time

We added the ability to specify a [default fruit booking duration time](https://support.vintrace.com/hc/en-us/articles/32301317941524) for each winery. When you create a new scheduled booking, the specified booking duration will automatically be set.

![Default_Booking_Duration_20230106.png](https://support.vintrace.com/hc/article_attachments/32328813483412)

## Bookings for a Crusher in Harvest Calendar

We added the ability to identify bookings in the [harvest calendar](https://support.vintrace.com/hc/en-us/articles/32303308082452) that use a particular crusher or press. Bookings that use the selected crusher or press display in bold.

![Harvest_Calendar_-_Booking_for_Crusher_20230105.png](https://support.vintrace.com/hc/article_attachments/32328813433620)

## PMS Rates and Booking Confirmation Report

We added the ability to [set up PMS rates](https://support.vintrace.com/hc/en-us/articles/32301282328212).

![PMS_Rate_20230105.png](https://support.vintrace.com/hc/article_attachments/32328835886996)

When this functionality is enabled, you'll be able to add and specify the PMS rate when scheduling a fruit booking.

![Scale_Booking_-_PMS_Rate_Add_Icon_20230106.png](https://support.vintrace.com/hc/article_attachments/32328851029908)

The PMS rate is included in the new [Booking Confirmation report](https://support.vintrace.com/hc/en-us/articles/32301303406996).

![Booking_Confirmation_Report.jpg](https://support.vintrace.com/hc/article_attachments/32328850934548)

## Bulk Dispatch Reasons

We’ve added functionality to specify a [dispatch reason](https://support.vintrace.com/hc/en-us/articles/32301282126740) for [inter-winery bulk dispatches](https://support.vintrace.com/hc/en-us/articles/32301313513620). When this functionality is enabled, the dispatch reason is included in the Bill of Lading and in the Stock Dispatch Report’s CSV file. You’ll also be able to search dispatches using the dispatch reason.

# Additional Fixes and Improvements

- The label for the Crush/Press field has been changed to Crusher/Press to make it clear that it refers to the equipment and not the process.
- We added the ability to search bookings in the [Fruit Intake Console](https://support.vintrace.com/hc/en-us/articles/32303330881044) by time and crusher/press.

![Fruit_Intake_Console_-_Search_by_Time_and_Crusher_20230109.png](https://support.vintrace.com/hc/article_attachments/32328836044564)

- We added the work order number to the [Wine Production Loss Report's](https://support.vintrace.com/hc/en-us/articles/32301303832084) CSV when the report's Show Each Loss Event checkbox is selected.
- We fixed an issue where the followings lines of the TTB report were incorrect when both concentrate and spirits were added to a wine. Prior to this release, the total was incorrectly being split between lines 3 and 4, and lines 18 and 19.

     - Part I: PRODUCED BY SWEETENING, Line 3

     - Part I: PRODUCED BY ADDITION OF WINE SPIRITS, Line 4

     - Part I: USED FOR SWEETENING, Line 18

     - Part I: PRODUCED FOR ADDITION OF WINE SPIRITS, Line 19.

- We added an option to the [Grower Contract window](https://support.vintrace.com/hc/en-us/articles/32301319829268) to realize costs against fruit when it arrives.
- We made a change to ensure that saving an Additive or Multi Addition operation for a wine with the following was properly recorded on the TTB:

     - Tax Class = Concentrate

     - Adjust Reason = TTB – Juice and Concentrate Produced

     - Increase Volume selected

Specifically, the reconstituted volume is recorded in Part IV, line 3 (Juice or Concentrate Produced), column d (Concentrate) of the TTB. The volume of concentrate used in the reconstitution is recorded in Part IV, line 6 (Used in Juice or Concentrate Production), column d (Concentrate).

# Previous Releases for Version 9

- [9.4.1](https://support.vintrace.com/hc/en-us/articles/32303261872276)
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
