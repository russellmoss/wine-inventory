---
id: "32301302982036"
title: "Tracking Crush and Production Locations"
url: "https://support.vintrace.com/hc/en-us/articles/32301302982036-Tracking-Crush-and-Production-Locations"
category: "Harvest/Vintage"
section: "Crush and press"
created_at: "2024-11-20T14:46:29Z"
updated_at: "2024-11-21T10:28:49Z"
labels: []
gist: "This functionality is available starting with vintrace 9.4.3, but it is not enabled by default."
tags: ["transfers", "harvest", "barrels", "tax-class", "blending", "fermentation"]
---

# Tracking Crush and Production Locations

This functionality is available starting with [vintrace 9.4.3](https://support.vintrace.com/hc/en-us/articles/32303276816020), but it is not enabled by default. If you would like to use this functionality, please contact our support team.

When this functionality is enabled, the location where a wine was crushed and produced will be visible from the [product page](#h_01GYFJMPF0ZRDN5GYP8VZTPT8V) and [Wine Status Report](#h_01GYFJMYK7HQZRAM4R9566WDPC).

The crushed at location will be the winery where the extraction job was completed based on the fields in the following order:

- Crusher/Rollers
- Press
- Vessel

Ensure that the Winery Building field is set correctly for the Crusher/Rollers, Press and Vessel.

For bulk intakes, the crushed at location will be the organization specified in the operation’s Received From field. The crushed at location will be updated whenever a wine is blended (e.g., multi-transfer, topping, or racking operations).

The produced at location will be the winery where the wine was declared. This can happen when fermentation stops, or when tax class is edited from the product page, the Wine Declaration Console, or when the tax class is changed with a reason that starts with *Produced By*.

The crushed at and produced at locations will only be available for wines entered into vintrace after 9.4.3.

## Crushed At Tab on Product Page

![Gap 212 - Crushed and Produced At Locations 20230719.png](https://support.vintrace.com/hc/article_attachments/32328801452436)

Above the table is a summary of the percentage crushed or bulk imported. Unspecified wines are not included in the summary.

### Crushed At

The Crushed At table shows the percentage and volume of wine crushed at each location and includes the following columns:

- Type - Displays an icon to indicate whether it was a bulk intake (![Bulk_Intake_Icon_20230420.png](https://support.vintrace.com/hc/article_attachments/32328801488148)), or crushed fruit (![Crushed_Fruit_Icon_20230420.png](https://support.vintrace.com/hc/article_attachments/32328817276820)).
- Crushed At - The winery where the wine was imported from, or extracted. If the location where the wine was imported from or extracted cannot be determined, *Unspecified* displays to indicate that the wine was crushed outside of vintrace.
- Percent - The percentage of the total wine by volume for the winery in the Crushed At column.
- Relative Volume - The volume of wine for the winery in the Crushed at column.

### Produced At

The Produced At table is only available for US customers.

The Produced At table shows the percentage and volume of wine produced at each location and includes the following columns:

- Produced At - The winery where the wine was produced. If the location where the wine was produced cannot be determined, *Non-declared* or *unspecified* displays to indicate that the wine was produced outside of vintrace.
- Percent - The percentage of total wine by volume for the winery in the Produced At column.
- Relative Volume - The volume of wine for the winery in the Produced At column.

## Wine Status Report

When this feature is enabled, the Wine Status Report shows the locations and percentage of wine crushed at and produced at each.

![Gap 212 - Wine Status Report 20230719.png](https://support.vintrace.com/hc/article_attachments/32328795510548)
