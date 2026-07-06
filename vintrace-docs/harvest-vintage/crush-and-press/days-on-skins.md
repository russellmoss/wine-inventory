---
id: "32301304002964"
title: "Days on Skins"
url: "https://support.vintrace.com/hc/en-us/articles/32301304002964-Days-on-Skins"
category: "Harvest/Vintage"
section: "Crush and press"
created_at: "2024-11-20T14:46:43Z"
updated_at: "2026-05-19T23:31:18Z"
labels: []
gist: "There may be times when you want to know how long a wine has been on skins."
tags: ["transfers", "harvest", "blending", "barrels", "lot-identity", "ux-friction"]
---

# Days on Skins

There may be times when you want to know how long a wine has been on skins. This might be during harvest when you’re tasting wines in tanks, or after a wine has been [pressed](https://support.vintrace.com/hc/en-us/articles/32303268282132).

After you [receive grapes](https://support.vintrace.com/hc/en-us/articles/32303268370324) and [extract them](https://support.vintrace.com/hc/en-us/articles/32303268239508), the resulting must has a weight and estimated volume. The number of days on skins is calculated based on the date the fraction type is set to must and the date the fraction type is changed to something other than must. The days on skins will be shown to two decimals and rounded up or down based on your rounding rules, without any intervals.

![Days_on_Skins_Calculation_20220818.png](https://support.vintrace.com/hc/article_attachments/32328633286164)

If multiple red wines are blended together, the days on skins will be set
to
the highest value. That is, the days on skins for the wine that was extracted
first.

## Fix Date and Days on Skins

The Fix Date functionality on a completed extraction and/or press cycle will
only apply in certain situations.

- If the liquid is still a must, an extraction’s operation date can be
  updated
  using the Fix Date functionality. This will update the start date that’s
  used to calculate the days on skins.
- If a press cycle’s operation date is updated via the Fix Date functionality,
  the stop date that’s used to calculate the days on skin will be updated.
  However, this will only change the days on skins for the operation’s
  vessel
  and batch. The days on skins for any blends that occurred after the press
  cycle will not be updated.
- If the extraction and press cycle have been recorded, the extraction
  operation’s date cannot be changed using Fix Date to update the days
  on skins. Changing the extraction’s operation date would only change
  the start date for the liquid from the extraction. The extraction’s
  new
  date would not flow through to the liquid created when saving the
  press
  cycle.

  In this last scenario, we recommend that you rollback and replay
  the
  press cycle to do a Fix Date for the extraction which will update
  the
  days on skins correctly. You will also need to re-save the press
  cycle
  on the replay work order since a new liquid is created when saving
  the
  press cycle.

## Examples

In this example, the following extraction occurred on July 1, 2022 at 10:44am.

![Extraction_2022-07-01.png](https://support.vintrace.com/hc/article_attachments/32328626825620)

While the fraction type is *must*, the days on skins will be calculated
based on the date the fraction type was set to *must* and the current
date. For example, on August 18, 2022 at 10:54 am, the days on skins is 48.01.

![Product_Page_with_Days_on_Skins_20220822.png](https://support.vintrace.com/hc/article_attachments/32328627020052)

In another example, an extraction occurred on July 1, 2022 at 11:00am.

![Extraction_11am.png](https://support.vintrace.com/hc/article_attachments/32328633338772)

A press cycle was completed on August 1, 2022 at 11:00am and the fraction
type
was changed to *combined*.

![Press_Cycle.png](https://support.vintrace.com/hc/article_attachments/32328618987284)

In this example, the days on skins is equal to 31 days.

## Displaying Days on Skins on the Vessels Page

To display the days on skins on the
[Vessels page](https://support.vintrace.com/hc/en-us/articles/32301344827924),
[customize the columns displayed](https://support.vintrace.com/hc/en-us/articles/360001505616-Customizing-the-Vessels-Page#ChangingtheColumnsDisplayed)
on the page and select the Days on Skins column that’s in the Content Details
section.

![Vessels_Page_-_Customize_Columns_20220818.png](https://support.vintrace.com/hc/article_attachments/32328595541780)

## Displaying Days on Skins on the Product Page

To display the days on skins on the product page:

1. From the General tab, click the
   ![Gear_Green_Icon_20200417.png](https://support.vintrace.com/hc/article_attachments/32328626887316)
   gear icon that’s displayed beside Details.

![Product_Page_-_Customizing_20220822.png](https://support.vintrace.com/hc/article_attachments/32328633592468)

The Custom Product Details window displays.

2. Do one of the following:

- Double-click Days on Skins.

![Product_Page_-_Custom_Product_Details_20220818.png](https://support.vintrace.com/hc/article_attachments/32328626924436)

- Select Days on Skins, then click the
  ![Arrow_-_Select_20220818.png](https://support.vintrace.com/hc/article_attachments/32328611379348)select
  icon.

## Reporting on Days on Skins

### Ferment Spreadsheet Generator

The Ferment Spreadsheet Generator shows wines that are currently fermenting
and
includes a Days on Skins column in its output.

![XLS_Days_on_Skins_20220823.png](https://support.vintrace.com/hc/article_attachments/32328619191700)

To run the Ferment Spreadsheet Generator:

1. Click
   ![Reports_Menu_Option_20200406.png](https://support.vintrace.com/hc/article_attachments/32328626986900)
   Reports in the sidebar.
2. Select Fermentation. The Ferment Spreadsheet Generator displays.

![Winery_Reports_-_Fermentation_-_Ferment_Spreadsheet_Generator_20220818.png](https://support.vintrace.com/hc/article_attachments/32328601758228)

3. Specify the filters and options.
4. Click Generate.

### Analysis Spreadsheet Generator

The Analysis Spreadsheet Generator is very similar to the ferment Spreadsheet
above, however is not limited to wines in ferment.![XLS_Days_on_Skins_20220823.png](https://support.vintrace.com/hc/article_attachments/32328619191700)

To run the Analysis Spreadsheet Generator:

1. Click
   ![Reports_Menu_Option_20200406.png](https://support.vintrace.com/hc/article_attachments/32328626986900)
   Reports in the sidebar.
2. Select Product Analysis. The Analysis Spreadsheet Generator displays.

![Winery_Reports_-_Product_Analysis_-_Analysis_Spreadsheet_Generator_20220818.png](https://support.vintrace.com/hc/article_attachments/32328619137556)

3. Specify the filters and options.
4. Click Generate.
