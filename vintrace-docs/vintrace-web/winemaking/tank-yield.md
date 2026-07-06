---
id: "32301282102420"
title: "Tank Yield"
url: "https://support.vintrace.com/hc/en-us/articles/32301282102420-Tank-Yield"
category: "vintrace Web"
section: "Winemaking"
created_at: "2024-11-20T14:46:32Z"
updated_at: "2025-01-15T19:34:57Z"
labels: []
gist: "This functionality is available starting with vintrace 9.4.3, but not enabled by default."
tags: ["migration", "configuration", "transfers", "barrels", "blending", "exports"]
---

# Tank Yield

This functionality is available starting with [vintrace 9.4.3](https://support.vintrace.com/hc/en-us/articles/32303276816020), but not enabled by default. If you would like to use this functionality, please contact our support team.

When this functionality is enabled, the tank yield is included in the [Bulk Stock Report’s CSV](#h_01GS5JG2ZJKS2BQ2ZZJJNEEENT). To support this functionality, administrators can [require the yield to be provided during Bulk Intake and Import Product operations](#requiring). The yield can be displayed on the [Vessels page](#vessels_page) and [Product page](#product_page).

## Requiring Yield During Bulk Intake and Import Product Operations

In order to support this functionality, we’ve added a setting that enables administrators to require the yield during [Bulk Intake](https://support.vintrace.com/hc/en-us/articles/32303303281428) and Import Product operations.

![Bulk_Intake_and_Import_Product_-_Yield_Reqd_20230208.png](https://support.vintrace.com/hc/article_attachments/32328578244628)

To require the yield for Bulk Intake or Import Product operations:

1. Click ![Setup_Icon_20200318.png](https://support.vintrace.com/hc/article_attachments/32328597204116) Set Up in the sidebar.
2. Click General.
3. From the Defaults tile, click Configure.
4. From the System or Winery tab, set the Mandatory Yield on Bulk Intake/Import setting to *Yes*.

![WInery_Setup_-_Defaults_-_System_-_Mandatory_Yield_on_Bulk_Intake_Import_20230208.png](https://support.vintrace.com/hc/article_attachments/32328614338452)

5. Click Apply.

## Extractions

When the tank yield functionality is enabled, the yield will be calculated at the time of extraction for all fraction types.

When blending wines/liquids together, a weighted average will be used to calculate the amount. If one of the liquids does not have a yield, the yield from the wine or liquid that has one will be copied.

If any losses occur after an extraction (e.g., press cycle, transfer), the yield rate will be adjusted.

## Bulk Stock Report

When this functionality is enabled, the Bulk Stock Report’s CSV will include the yield as gallons produced per ton.

![Bulk_Stock_Report_CSV_20230208.png](https://support.vintrace.com/hc/article_attachments/32328597277972)

## Vessels Page

You can [customize the Vessels page to display the yield](https://support.vintrace.com/hc/en-us/articles/360001505616#ChangingtheColumnsDisplayed). You’ll also be able to [filter the Vessels page by the yield](https://support.vintrace.com/hc/en-us/articles/360001550655-The-Vessels-Page#FilteringtheVesselsPage).

![Vessels_Page_-_Yield_Column_20230208.png](https://support.vintrace.com/hc/article_attachments/32328606231572)

## Product Page

You can also display the yield and edit it from the [product page](https://support.vintrace.com/hc/en-us/articles/360000814455-The-Product-Page).

![Product_Page_-_Yield_Tile_20230208.png](https://support.vintrace.com/hc/article_attachments/32328597297556)
