---
id: "32303318748180"
title: "Tracking Estate Wine (US)"
url: "https://support.vintrace.com/hc/en-us/articles/32303318748180-Tracking-Estate-Wine-US"
category: "vintrace Web"
section: "Compliance"
created_at: "2024-11-20T15:52:05Z"
updated_at: "2024-12-05T18:00:30Z"
labels: ["estate", "estate only wine", "estate only bond", "blending estate and non-estate wine", "tracking estate wine"]
gist: "You can enable Estate wine tracking from the Winery Setup window (Setup Options > Infrastructure > Winery):."
tags: ["configuration", "lot-identity", "bond", "compliance", "barrels", "naming"]
---

# Tracking Estate Wine (US)

## Setting Up an Estate Bond

You can enable Estate wine tracking from the Winery Setup window (Setup Options > Infrastructure > Winery):

1. Click ![Setup_Icon_20200318.png](https://support.vintrace.com/hc/article_attachments/32329081910676) Set Up in the sidebar.
2. Click Locations.
3. From the Winery tile, click Configure.
4. Select the winery that you want to set as an estate bond.
5. From the Winery window, select the Bond tab.
6. From the Estate Bond list, select *Yes*.

![Winery_Update_-_Bond_-_Estate_Bond_20200604.png](https://support.vintrace.com/hc/article_attachments/32329085051284)

7. Click Save.

## Setting Up an Estate Only Program

To set up an estate only program:

1. Click ![Setup_Icon_20200318.png](https://support.vintrace.com/hc/article_attachments/32329081910676) Set Up in the sidebar.
2. Click Classification.
3. From the Programs tile, click Configure.
4. Click New Program.
5. Specify the details for the program. Be sure to select the Estate Only checkbox.

![Create_Program_Brand_-_Program_-_Estate_Only_20200604.png](https://support.vintrace.com/hc/article_attachments/32329092886292)

6. Click Save.

## Setting Up an Estate Only Batch

To set up an estate only batch:

1. Click ![Vessels_Menu_Option_20200402.png](https://support.vintrace.com/hc/article_attachments/32329057644948) Vessels in the sidebar.
2. Click ![Plus_in_Green_Circle_20200319.png](https://support.vintrace.com/hc/article_attachments/32329082000148).
3. Select New Wine Batch.
4. Specify the details for the wine batch. At a minimum, you’ll need to enter a Batch Code, Owner, and Production Year. Be sure to set the batch’s Program to [the estate only program that you created](#h_de1d099b-c770-41a6-8c55-4c60a2cf0380).

![Create_Simple_Wine_Batch_-_Estate_Only_20200605.png](https://support.vintrace.com/hc/article_attachments/32329082023444)

5. Click Save.

## Creating and Using an Estate Only Wine

To create an estate only wine, you’ll need to use the Extraction operation. To access the Extraction operation from the Jobs or Vessels page, click the ![Operations_Icon_20200407.png](https://support.vintrace.com/hc/article_attachments/32329085015444) Operations icon, then select Extraction.

Be sure to set the settings in the General tab of the Extraction window as detailed below:

- Destination Vessel - Set this to one that is owned by and located at the [winery where the estate only bond is set](#h_4ab56115-5dfd-4f09-a543-24a7398c9bc2).
- Destination Batch - Set this to the [estate only batch that you created](#h_b084eabf-bbc1-4f28-b916-ea64d6c63a32).

## Blending Estate Only and Non-Estate Wines

Whenever you blend or transfer from a non-estate to an estate only wine, vintrace displays a warning to let you know that the resulting product will no longer be an estate wine.

![Business.png](https://support.vintrace.com/hc/article_attachments/32329057598100)

If you click OK to the message, the blend will be successful. Viewing the Bond History of the resulting wine shows that the wine has visited two bonds.

[![history-of-non-estate-wine](https://s3-us-west-2.amazonaws.com/vintrace-support-site-content/uploads/2016/11/History-of-non-estate-wine.jpg)](https://s3-us-west-2.amazonaws.com/vintrace-support-site-content/uploads/2016/11/History-of-non-estate-wine.jpg)
