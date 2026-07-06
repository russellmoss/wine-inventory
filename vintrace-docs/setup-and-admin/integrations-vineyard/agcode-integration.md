---
id: "32301280029332"
title: "AgCode Integration"
url: "https://support.vintrace.com/hc/en-us/articles/32301280029332-AgCode-Integration"
category: "Setup and Admin"
section: "Integrations: Vineyard"
created_at: "2024-11-20T14:46:04Z"
updated_at: "2025-04-08T18:42:21Z"
labels: ["integration"]
gist: "The integration uses the vintrace API (Application Programming Interface) to connect the two softwares."
tags: ["integrations", "api", "harvest", "lab", "vineyard", "configuration"]
---

# AgCode Integration

## How It Works

The integration uses the vintrace API (Application Programming Interface) to connect the two softwares.

Two specific endpoints of the API are being used::

- Endpoint 1: [Insert a fruit booking into vintrace](https://vintrace.stoplight.io/docs/vintrace-server/450e41fbe6282-upsert-this-booking-into-vintrace)
- Endpoint 2: [Record a new fruit intake into vintrace](https://vintrace.stoplight.io/docs/vintrace-server/85f8619d302f5-record-a-new-fruit-intake-transaction)

The transfer is done in two steps.

The fruit booking sent from AgCode to vintrace through the [*Insert a Fruit Booking into vintrace* endpoint](https://vintrace.stoplight.io/docs/vintrace-server/450e41fbe6282-upsert-this-booking-into-vintrace). This endpoint transfers the following data:

| Field Name | Example |
| --- | --- |
| Booking Number | AG1245668 |
| Winery | Estate 1 |
| Block Name | APS B1 |
| Vintage | 2024 |
| Expected Quantity in tons | 12 |
| Booking state | Scheduled |
| Owner | VIN |

Once the weighing is done in AgCode, the booking is updated with the [*Record a New Fruit Intake into vintrace* endpoint](https://vintrace.stoplight.io/docs/vintrace-server/85f8619d302f5-record-a-new-fruit-intake-transaction). The following data is added:

| Field Name | Example |
| --- | --- |
| External weigh tag | 5002 |
| Scale name | Scale 1 |
| Net Value | 25000 |
| Net Unit | lb |
| Metric Brix | 23 |
| Metric pH | 5.9 |
| Metric TA | 3.3 |

Once the booking has been updated with the second data transfer, the fruit intake panel displays the fruit receival information.

![Fruit Intake Console 20240415.png](https://support.vintrace.com/hc/article_attachments/32328743552788)

## Alternate Methods

- You can create the booking in vintrace ahead of time and only use the *Record a New Fruit Intake into vintrace* endpoint to update the booking with AgCode weight data.
- You can use the *Insert a Fruit Booking into vintrace* endpoint to send AgCode booking data, but complete the weighing in vintrace.
- Brix, pH, TA transfer is optional as well; you decide which ones you want to send over (e.g., 1-3 or none).

## Before You Begin

In order for this integration to work, be sure the data fields in AgCode match the ones in vintrace. Here are the key fields you need to check:

- Block name — the block name must be unique and match the block name in AgCode. If you want to keep some duplicates, the workaround is to create a unique external block ID code that will be the reference point between AgCode and vintrace.
- Winery name — the winery name must be unique and match the winery name in AgCode.
- Owner name — the owner name must be unique and match the owner name in AgCode. A unique external ID can be set for this field to make sure it has a unique differentiator.
- Scale name — the scale name be unique and match the scale name in AgCode.
