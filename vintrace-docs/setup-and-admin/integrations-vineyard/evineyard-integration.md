---
id: "32301280744852"
title: "eVineyard Integration"
url: "https://support.vintrace.com/hc/en-us/articles/32301280744852-eVineyard-Integration"
category: "Setup and Admin"
section: "Integrations: Vineyard"
created_at: "2024-11-20T14:46:13Z"
updated_at: "2025-09-08T07:48:59Z"
labels: []
gist: "The eVineyard to vintrace integration automatically transfers your harvest bookings and fruit receivals from eVineyard to vintrace."
tags: ["integrations", "vineyard", "api", "configuration", "harvest", "lab"]
---

# eVineyard Integration

The [eVineyard](https://www.evineyardapp.com/) to vintrace integration automatically transfers your harvest bookings and fruit receivals from eVineyard to vintrace. The integration gives you access to all your vineyard data so that you can plan harvest dates and start the winemaking process.

## How It Works

The integration uses the [vintrace API (Application Programming Interface)](https://api-docs.vintrace.com/) to connect eVineyard and vintrace. After configuring the integration, fruit booking and intake events entered in eVineyard will automatically synchronize with vintrace within 10 minutes of saving the events. Changes to existing events in eVineyard will also be reflected in vintrace.

The integration uses the following vintrace API endpoints:

- [Upsert This Booking into vintrace](https://api-docs.vintrace.com/docs/vintrace-server/450e41fbe6282-upsert-this-booking-into-vintrace)
- [Record a New Fruit Intake Transaction](https://api-docs.vintrace.com/docs/vintrace-server/85f8619d302f5-record-a-new-fruit-intake-transaction)

Fruit bookings are sent from eVineyard to vintrace using the [Upsert This Booking into vintrace endpoint](https://api-docs.vintrace.com/docs/vintrace-server/450e41fbe6282-upsert-this-booking-into-vintrace). This endpoint transfers the following data.

| Field Name | Example |
| --- | --- |
| Booking Number | AG1245668 |
| Winery | Estate 1 |
| Block Name | APS B1 |
| Vintage | 2024 |
| Expected Quantity in Tons | 12 |
| Booking State | Scheduled |
| Owner | VIN |

After weighing is completed in eVineyard, the booking is updated in vintrace using the [Record a New Fruit Intake Transaction endpoint](https://api-docs.vintrace.com/docs/vintrace-server/85f8619d302f5-record-a-new-fruit-intake-transaction). This endpoint transfers the following data.

| Field Name | Example |
| --- | --- |
| External Weigh Tag | 5002 |
| Scale Name | Scale 1 |
| Net Value | 25000 |
| Net Unit | lb |
| Metric Brix | 23 |
| Metric pH | 5.9 |
| Metric TA | 3.3 |

If you want to do the weighing in vintrace, you do not need to use the Record a New Fruit Intake Transaction endpoint.

After the second data transfer updates the booking, the Fruit Intake Console in vintrace displays fruit receival information.

## Considerations

- The data transfer from eVineyard to vintrace is unidirectional. The fruit booking and fruit intake events must be recorded in eVineyard in order for the data to appear in vintrace. If either of the events is only recorded in vintrace, the data will NOT be transferred to or recorded in eVineyard.
- Deletion of events is not synchronized. If a fruit booking or fruit intake event is deleted in either eVineyard or vintrace, the data must be manually deleted from the other.
- If a [synchronization error occurs](#troubleshooting), the eVineyard calendar event that’s missing from vintrace will need to be edited and re-saved in order to trigger the re-synchronization to vintrace. When troubleshooting an issue with the integration, be sure to always edit and re-save the affected records in eVineyard. If you do not edit and re-save the record from eVineyard, the record will be considered erroneous and not re-sent to vintrace.

## Before You Begin

### Prerequisites

The following are prerequisites for the eVineyard to vintrace integration:

- The organization must have an account for both vintrace and eVineyard.
- You must [obtain an API token from vintrace](https://support.vintrace.com/hc/en-us/articles/32301304866324-Managing-API-tokens). This token will be used by eVineyard to transfer data to vintrace.
- You must enable vintrace integration in eVineyard. If your organization doesn’t have vintrace integration enabled, or you’re not sure if the vintrace integration is enabled, contact eVineyard using the support form in the bottom right corner of the eVineyard application, or via [e-mail](https://info@evineyardapp.com).

### Key Data Fields

To successfully integrate eVineyard and vintrace, the data fields across the two systems must match. Below are the fields that you’ll need to check.

- Block Name – The block name in vintrace must be unique and match the name in eVineyard. When you [configure the integration](#configuring), you’ll need to [link the block ID from eVineyard to vintrace](#linking_blocks).
- Winery Name – The winery name in vintrace must be unique and match the eVineyard winery name.
- Owner Name – The owner name in vintrace must be unique and match the eVineyard owner name. When you [configure the integration](#configuring), you’ll need to [link the organization ID from eVineyard to vintrace](#linking_org_id).
- Scale Name – The scale name in vintrace must be unique and match the scale name in eVineyard.

## Configuring eVineyard Integration

You’ll need to complete the following steps to configure the eVineyard integration with vintrace:

1. [Configure the vintrace URL and token](#configuring_url_token).
2. [Link the organization id from eVineyard to vintrace](#linking_org_id).
3. [Link blocks from eVineyard to vintrace](#linking_blocks).

### Configuring the vintrace URL and Token

In order to send data to your vintage account, you must point eVineyard to your vintrace instance and give it access to send data by doing the following:

1. From the top right corner of eVineyard, select Profile & Settings.

![eVineyard - Profile and Settings 20231129.png](https://support.vintrace.com/hc/article_attachments/32328567872916)

2. From the System Settings menu on the left, select vintrace.

![eVineyard - System Settings - vintrace 20231129.png](https://support.vintrace.com/hc/article_attachments/32328553334548)

Important: If the option vintrace is not available in the menu, then the integration with vintrace was not yet enabled for your eVineyard profile. Contact eVineyard using the support form in the bottom right corner of the eVineyard application, or via e-mail to request that the vintrace integration be enabled.

3. From the integration settings window, enter the following.

- URL – Your vintrace URL that you use to log in just before “/1.app”. It’s important that the configured URL ends just before “/1.app” as in the example below.
- Token – The [token you received from vintrace](https://support.vintrace.com/hc/en-us/articles/32301304866324-Managing-API-tokens).

4. Click Update.

### Linking the Organization ID from eVineyard to vintrace

In eVineyard, the Organization ID is specific to your account and will need to be added to vintrace.

![eVineyard Org ID 20231129.png](https://support.vintrace.com/hc/article_attachments/32328553395348)

To link the eVineyard organization ID to vintrace:

1. From your [vintrace address book](https://support.vintrace.com/hc/en-us/articles/32301367488788-Address-Book-Contacts), click the Advanced button that’s beside the winery name that you’ll use to interact with eVineyard.
2. In the External ID field, enter the eVineyard organization ID.

![Organization Update - External ID 20231128.png](https://support.vintrace.com/hc/article_attachments/32328567907348)

3. Click Save.
4. From the [vintrace address book](https://support.vintrace.com/hc/en-us/articles/32301367488788-Address-Book-Contacts), click the winery name.
5. Click the Edit button that’s beside the Owner role.

![Basic Organization Widget - Owner Edit Button 20231128.png](https://support.vintrace.com/hc/article_attachments/32328567927316)

6. In the Auto Code field, enter the eVineyard organization ID.

![Configure Owner Settings - Auto Code 20231128.png](https://support.vintrace.com/hc/article_attachments/32328553469332)

7. Click OK.

### Linking Blocks from eVineyard to vintrace

In eVineyard, each block has its own ID. You’ll need to enter this ID in the Auto Code field of the same block in vintrace.

1. Find the block ID in eVineyard by doing the following:

- From the System Settings menu, select vintrace.
- Under Vineyard Blocks Details, note the block ID that’s under the Block ID column.

![eVineyard Vineyard Block Details 20231129.png](https://support.vintrace.com/hc/article_attachments/32328583971476)

2. [Specify the block IDs in vintrace](https://support.vintrace.com/hc/en-us/articles/32301281308820-eVineyard-Integration-Specifying-Vineyard-Block-IDs). For example, if the Vineyard Block ID in eVineyard is 1877, you’ll need to enter 1877 in the block’s Auto Code field in vintrace.

## Adding Fruit Bookings and Fruit Intakes in eVineyard

The easiest way to add fruit booking or fruit intake events in eVineyard is through the eVineyard Calendar.

From the eVineyard Calendar, add the event.

![eVineyard Add New Task 20231129.png](https://support.vintrace.com/hc/article_attachments/32328568005140)

2. After saving the event, be sure that the following details are entered correctly on the event details screen. These details must match the data in vintrace.

- Business Unit – For fruit bookings and fruit intakes, this must be the winery name in vintrace.
- Scale – For fruit intakes, this must be one of the scales in vintrace.

For fruit intakes, be sure to select the fruit booking entry that the fruit intake event is linked to.

3. Be sure to save all event updates made from the eVineyard calendar. If the integration with vintrace is properly configured, the updates will be automatically synchronized within 10 minutes.

## Troubleshooting

If fruit booking and fruit intake events don’t appear in vintrace after 10 minutes from the time they were saved in eVineyard, there’s likely an error in the settings or event data.

In the eVineyard calendar, be sure that the Business Unit and Scale properties match the properties in vintrace.

You can also [check eVineyard for vintrace integration errors](#checking_error_messages).

### Checking Error Messages

Integration error messages can provide insight into why data isn’t being transferred to vintrace. To check for vintrace integration messages from eVineyard:

1. From the top right corner of eVineyard, select Profile & Settings.

![eVineyard - Profile and Settings 20231129.png](https://support.vintrace.com/hc/article_attachments/32328567872916)

2. From the System Settings menu on the left, select vintrace.

![eVineyard - System Settings - vintrace 20231129.png](https://support.vintrace.com/hc/article_attachments/32328553334548)

3. Check the Integration Messages section at the bottom of the screen for errors.

![eVineyard Integration Messages 20231129.png](https://support.vintrace.com/hc/article_attachments/32328568017812)
