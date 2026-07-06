---
id: "32301301844116"
title: "BarrelWise Integration"
url: "https://support.vintrace.com/hc/en-us/articles/32301301844116-BarrelWise-Integration"
category: "Setup and Admin"
section: "Integrations: Labs and Tanks"
created_at: "2024-11-20T14:46:14Z"
updated_at: "2025-09-09T03:06:50Z"
labels: ["Barrelwise"]
gist: "BarrelWise is a fully automatic Free SO2 analyser that can collect and record data directly in the cellar."
tags: ["integrations", "api", "barrels", "configuration", "additives", "harvest"]
---

# BarrelWise Integration

[BarrelWise](https://www.barrelwise.ca/) is a fully automatic Free SO2 analyser that can collect and record data directly in the cellar.

The BarrelWise to vintrace integration pulls cellar data from vintrace into BarrelWise. This lets you make full use of BarrelWise’s features that rely on lot and barrel information, such as virtual composite, addition, and lot addition.

## How It Works

The integration uses the vintrace API (Application Programming Interface) to connect BarrelWise and vintrace.

The [List Available Products endpoint](https://api-docs.vintrace.com/docs/vintrace-server/branches/v6/4f733325d477f-list-available-products) of the vintrace Rest API is used for this integration.

## Data Transferred

### Wine Batch Information

| Field Name | Example |
| --- | --- |
| Name | 12PNPF035 |
| Vintage | 2023 |
| Variety | Pinor Noir |
| Barrel Members | 21F002, 20F010, 21F005 |

### Vessel Information

| Field Name | Example |
| --- | --- |
| Name | 21F002 |
| Type | Barrel, Keg, Carboy |
| Capacity | 60 gal |
| Year | 2022 |
| Oak Type | French |
| Forest | Allier |
| Toasting | Light |
| Cooper | Francois Freres |
| Seasoning | Natural |

## Setting Up Integration

1. Find your vintrace URL and create an API token for BarrelWise.

- URL - Your vintrace URL that you use to log in just before “/1.app”. It’s important that the configured URL ends just before “/1.app” as in the example below where the URL would be **qanda.vintrace.net/austrain**

  Be sure to use your unique URL and not this example.

![API_URL.png](https://support.vintrace.com/hc/article_attachments/41048235437460)

- Token - The token you received from vintrace. Refer to [API token support article](https://support.vintrace.com/hc/en-us/articles/32301304866324-Managing-API-tokens) for details.

2. Send the URL and newly created API token to the BarrelWise team so they can establish the connection.

The BarrelWise team will use your vintrace URL and API token to connect to your vintrace database and extract the needed data.

The BarrelWise team can schedule the cellar inventory synchronization to run daily. This ensures that your BarrelWise account is updated with your latest vintrace data.
