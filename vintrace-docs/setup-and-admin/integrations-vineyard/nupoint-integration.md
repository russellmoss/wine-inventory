---
id: "35096606812180"
title: "NuPoint Integration"
url: "https://support.vintrace.com/hc/en-us/articles/35096606812180-NuPoint-Integration"
category: "Setup and Admin"
section: "Integrations: Vineyard"
created_at: "2025-02-25T08:11:23Z"
updated_at: "2025-03-11T04:47:50Z"
labels: []
gist: "The NuPoint integration automatically transfers your fruit receivals from vintrace to NuPoint and attaches the NuPoint docket to the completed vintrace fruit intake."
tags: ["integrations", "api", "configuration", "harvest", "vineyard", "transfers"]
---

# NuPoint Integration

The [NuPoint](https://nupoint.com) integration automatically transfers your fruit receivals from vintrace to NuPoint and attaches the NuPoint docket to the completed vintrace fruit intake. This integration improves the way data is transferred between both systems to provide greater accuracy and auditing without having to manage data in more than one system.

To transfer the fruit receivals to NuPoint a fruit booking and work order for the intake delivery must be created first.

## How It Works

The integration uses the [vintrace API (Application Programming Interface)](https://api-docs.vintrace.com/) to connect NuPoint and vintrace. After configuring the integration, fruit intake events entered in vintrace will automatically synchronize with NuPoint.

The integration uses the following vintrace API endpoints:

- [Return fruit intake operation from vintrace](https://vintrace.stoplight.io/docs/vintrace-server/branches/v6/a88f57b33ff33-fruit-intake-operation-search)
- [Attach a document to a vintrace operation](https://vintrace.stoplight.io/docs/vintrace-server/8a644d2a9b02c-upload-a-file-to-an-operation)

The fruit receival sent from vintrace to NuPoint through the [Return fruit intake operation from vintrace endpoint](https://vintrace.stoplight.io/docs/vintrace-server/branches/v6/a88f57b33ff33-fruit-intake-operation-search). This endpoint transfers the following data:

| Field Name | Example |
| --- | --- |
| Docket/Weigh Tag Number | JX122 |
| Gross Weight | 5 t |
| Tare Weight | 0 t |
| Nett Weight | 5 t |
| Date & Time Weighed | 22/02/2025 10:00 |
| Truck Number | A6ABC |
| Driver Name | Driver 1 |

Once the docket has been completed in NuPoint, the NuPoint docket is attached to the completed vintrace fruit intake through the [Attach a document to a vintrace operation endpoint](https://vintrace.stoplight.io/docs/vintrace-server/8a644d2a9b02c-upload-a-file-to-an-operation).

## Creating a New Booking

1. [Create a booking](https://support.vintrace.com/hc/en-us/articles/32303268370324-Managing-Fruit-Intakes-and-Fruit-Intake-Bookings#h_52356d83-df02-4dfe-af54-839f2af65849).
2. Specify the booking details.
3. Click Save.

## Creating a Work Order for Intake Delivery

1. [Create a Manual Work Order](https://support.vintrace.com/hc/en-us/articles/32303315610388).
2. Click Add Job.
3. Select Intake Delivery.
4. Click the ![Magnifying_Glass_20200320.png](https://support.vintrace.com/hc/article_attachments/35096606811284) search icon to select the Scale Booking.

![Intake Delivery Work Order Scale Booking Field 20250225.jpg](https://support.vintrace.com/hc/article_attachments/35097446846100)

5. Click OK.
6. Click Suspend.
7. To save the work order as a Word document or PDF file that can be printed, click the ![Heart_White_20200731.png](https://support.vintrace.com/hc/article_attachments/35096610727060) heart icon beside Print Work Order on Save in the lower left.
8. Click Save As…

- Draft - you’re not ready for your staff to complete the work. The work order will be saved for the future.
- Ready - the work order is ready for your staff to complete.

## NuPoint and vintrace Process

1. In NuPoint, scan the barcode on the printed vintrace work order to generate a NuPoint docket number.

![vintrace Work Order Barcode_20250225.jpg](https://support.vintrace.com/hc/article_attachments/35097437982740)

2. In vintrace, complete the intake delivery.

- Scan the barcode, or locate the work order in the [Job Management console](https://support.vintrace.com/hc/en-us/articles/32303318317972).
- Click Complete. The Intake Details window displays.
- Specify the details in the [Intake Details window](https://support.vintrace.com/hc/en-us/articles/32303268370324-Managing-Fruit-Intakes-and-Fruit-Intake-Bookings#h_af936757-a93c-4410-b14b-d91fd573249f).
- Select the QA / Cost / Analysis tab.
- Enter the NuPoint docket number into the Third Party Weigh Tag# field.

![Intake Details Window Third Party Weigh Tag Field_20250225.jpg](https://support.vintrace.com/hc/article_attachments/35097437983124)

- Confirm the delivery’s information in the [Intake Delivery window](https://support.vintrace.com/hc/en-us/articles/32303268370324-Managing-Fruit-Intakes-and-Fruit-Intake-Bookings#intake).
- Click Save.

3. In NuPoint, complete the docket(s) that have been synced from vintrace.

## Viewing the Completed Intake Delivery Documents

1. Scan the barcode, or locate the work order in the [Job Management console](https://support.vintrace.com/hc/en-us/articles/32303318317972).
2. Click the ![Paperclip Icon_20250225.jpg](https://support.vintrace.com/hc/article_attachments/35097437983636) paperclip icon. The Intake Delivery window displays.

![Complete Intake Delivery Documents_20250225.jpg](https://support.vintrace.com/hc/article_attachments/35097446846740)

## Before You Begin

### Prerequisites

The following are prerequisites for the integration:

- You must [obtain an API token from vintrace](https://support.vintrace.com/hc/en-us/articles/32301304866324-Managing-API-tokens). Then provide this token and your vintrace production URL to NuPoint. This token will be used by NuPoint to transfer data from vintrace to NuPoint and attach the NuPoint docket to the vintrace fruit intake.
