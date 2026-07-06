---
id: "32301281739028"
title: "Wine Spirit Additions Reports"
url: "https://support.vintrace.com/hc/en-us/articles/32301281739028-Wine-Spirit-Additions-Reports"
category: "Reporting"
section: "Government"
created_at: "2024-11-20T14:46:27Z"
updated_at: "2024-11-21T10:28:50Z"
labels: []
gist: "This functionality is available starting with vintrace 9.4.3, but is not enabled by default."
tags: ["reporting", "additives", "compliance", "transfers", "blending", "tax-class"]
---

# Wine Spirit Additions Reports

This functionality is available starting with [vintrace 9.4.3](https://support.vintrace.com/hc/en-us/articles/32303276816020), but is not enabled by default. If you would like to use this functionality, please contact our support team.

The Wine Spirit Additions (WSA) reports track the transactions and gauging that occurs when spirits in Part III of the TTB are added to wines in Part I.

The following WSA reports are available in vintrace:

- [Wine Spirits Additions Daily Transactions](#wsa_daily_transactions)
- [Wine Spirits Additions Transactions](#wsa_transactions)
- [Wine Spirits Additions Gauging Report](#wsa_gauging)
- [Wine Spirits Additions Tax Class Summary](#h_01H66Y4XT4Z5B0YQHTXFMXF9EB)

## Running the WSA Reports

To run any of the WSA reports:

1. Click ![Reports Menu Option 20200406.png](https://support.vintrace.com/hc/article_attachments/32328825168020) Reports in the sidebar.
2. Select Government.

The WSA reports are located in the right pane.

![Winery Reports - Government - WSA Reports 20230713.png](https://support.vintrace.com/hc/article_attachments/32328800986516)

Each of these reports displays a Launch Tax History to Compare link that displays the Tax Event Console for the specified date range.

## Wine Spirits Additions Daily Transactions Report

The Wine Spirits Additions Daily Transactions report lists all the daily transactions for wine spirit additions for the specified date range. It shows a summary impact from a wine, spirits, and resulting blend perspective. The report includes transfer/rack/blend, one-to-many transfers, and many-to-one operations when the following tax events are recorded:

- Used for wine spirits additions
- Produced by wine spirits additions
- Spirit used

![Winery Reports - Government - WSA Daily Transactions 20230712.png](https://support.vintrace.com/hc/article_attachments/32328800855700)

Each date displays on a separate page and includes the total transactions for the day. The number of rows will differ depending on the operation as detailed in the table below.

| Operation | Rows |
| --- | --- |
| Transfer/Rack/Blend | One row per operation |
| One-to-many transfer | One row per destination vessel. |
| Many-to-one transfer | One row per source vessel. |

Additional notes:

- For transfer/rack/blend operations, the Desired Alcohol % field’s value on the Advanced tab displays in the report’s Desired Alcohol (%) column.
- The withdrawal guage is always the same as the proof gallons for the spirits used.
- The proof is calculated from the alcohol percentage set on the batch. If there is no alcohol percentage, the report uses the alcohol percentage of the tax class (i.e., alcohol % \* 2).
- The proof gallons are calculated from the alcohol percentage set on the batch. If there is no alcohol percentage, the report will use the alcohol percentage of the tax class. (See [S2 on the TTB’s Distilled Spirits FAQs.](https://www.ttb.gov/distilled-spirits/distilled-spirits-faqs))
- The Kind is the base material of the beverage type/color.

## Wine Spirits Additions Transactions Report

The Wine Spirits Additions Transactions report lists the wine spirit transactions and calculation details of the wine’s starting and target alcohol for the specified date range. The report includes transfer/rack/blend, one-to-many transfers, and many-to-one operations when the following tax events are recorded:

- Used for wine spirits additions
- Produced by wine spirits additions
- Spirit used

![Winery Reports - Government - WSA Transactions 20230712.png](https://support.vintrace.com/hc/article_attachments/32328795093140)

Each operation displays on a separate row. The number of rows will differ depending on the operation as detailed in the table below.

| Operation | Rows |
| --- | --- |
| Transfer/Rack/Blend | One row per operation |
| One-to-many transfer | One row per destination vessel. |
| Many-to-one transfer | One row per source vessel. |

Additional notes:

- For transfer/rack/blend operations, the Desired Alchocol % field’s value on the Advanced tab displays in the report’s Desired Alcohol (%) column.
- The Diff column is calculated as follows: (Alcohol % of the wine produced) - (Desired alcohol %)
- The withdrawal guage is always the same as the proof gallons for the spirits used.
- The proof is calculated from the alcohol percentage set on the batch. If there is no alcohol percentage, the report uses the alcohol percentage of the tax class (i.e., alcohol % \* 2).
- The proof gallons are calculated from the alcohol percentage set on the batch. If there is no alcohol percentage, the report will use the alcohol percentage of the tax class. (See [S2 on the TTB’s Distilled Spirits FAQs](https://www.ttb.gov/distilled-spirits/distilled-spirits-faqs).)

## Wine Spirits Additions Gauging Report

The Wine Spirits Additions Gauging Report lists each official gauge recorded for spirits in Part III of the TTB Report for the specified date range.

![Winery Reports - Government - WSA Gauging 20230725.png](https://support.vintrace.com/hc/article_attachments/32328816680084)

The report includes the following operations.

| Operation | Operation included when |
| --- | --- |
| Bulk intakes | - The contents of the destination vessel are in a *Spirit* tax class in Part III. - A Post dip has been entered for the destination vessel on the Vessels tab. |
| Transfer/Rack/Blend | - The contents of the source vessel are in a *Spirit* tax class in Part III. - A Post dip has been entered for the source vessel. |
| One-to-many transfer | - The contents of the source vessel are in a *Spirit* tax class in Part III. - A Post dip has been entered for the source vessel |
| Many-to-one transfer | - The contents of the source vessel are in a *Spirit* tax class in Part III. - A Post dip has been entered for the source vessel. |
| Measurement | - When the Official Gauging field is set to *Yes*. |

Additional notes:

- The proof is calculated from the alcohol percentage set on the batch. If there is no alcohol percentage, the report uses the alcohol percentage of the tax class (i.e., alcohol % \* 2).
- The proof gallons are calculated from the alcohol percentage set on the batch. If there is no alcohol percentage, the report will use the alcohol percentage of the tax class. (See [S2 on the TTB’s Distilled Spirits FAQs](https://www.ttb.gov/distilled-spirits/distilled-spirits-faqs).)
- The Identification (B) column includes the proof and post dip of the liquid after the operation.
- The Age of spirits is from the batch of the spirits.
- The Kind is the base material of the beverage type/color.

## Wine Spirits Additions Tax Class Summary Report

The Wine Spirits Additions Tax Class Report lists the transactions for wine spirit additions for the specified date range. The report includes the total transactions per day and a total for the reporting period.

![Winery Reports - Government - WSA Tax Class Summary 20230713.png](https://support.vintrace.com/hc/article_attachments/32328831331604)

The number of rows will differ depending on the operation as detailed in the table below.

| Operation | Row |
| --- | --- |
| Transfer/Rack/Blend | One row per operation |
| One-to-many transfer | One row per destination vessel. |
| Many-to-one transfer | One row per source vessel. |
