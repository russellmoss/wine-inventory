---
id: "32301303347092"
title: "Freight Codes"
url: "https://support.vintrace.com/hc/en-us/articles/32301303347092-Freight-Codes"
category: "Setup and Admin"
section: "Configuration"
created_at: "2024-11-20T14:46:34Z"
updated_at: "2024-11-21T10:28:46Z"
labels: []
gist: "Available starting with vintrace 9.4.3."
tags: ["configuration", "inventory", "exports", "reporting"]
---

# Freight Codes

Available starting with [vintrace 9.4.3](https://support.vintrace.com/hc/en-us/articles/32303276816020). This functionality is not enabled by default. If you would like to use this functionality, please contact our support team.

Freight codes can be used to indicate who’s paying for freight when you record a bulk dispatch. After [setting up freight codes](#h_01GQ5Z1Z5VPFGHM4PT85VYFFH6), you can [assign them to owners and wineries](#h_01GQ5Z26D4WPS9AJGBRVWBBGAD). When an owner or winery with a freight code is selected for a [bulk dispatch](#h_01GQ5Z30FX35M4KFHDM3WVW6N6), their freight code is automatically specified in the operation. You’ll have the option to override the freight code. The selected freight code displays on the Bill of Lading.

When you [search for a dispatch,](https://support.vintrace.com/hc/en-us/articles/32301313789460) you can filter your search by the freight code. The freight code is also included when you output the [Stock Dispatch report](https://support.vintrace.com/hc/en-us/articles/32301330369684) to a CSV file.

## Setting Up a Freight Code

To set up a freight code:

1. Click ![Setup_Icon_20200318.png](https://support.vintrace.com/hc/article_attachments/32328820330132) Set Up in the sidebar.
2. Click Winemaking, or search for *freight code*.

![Search_for_Freight_Code_20230119.png](https://support.vintrace.com/hc/article_attachments/32328804161940)

3. From the Freight Codes tile, click Configure.
4. Click New Freight Code. The Freight Code window displays.

![Freight_Code_Create_20230119.png](https://support.vintrace.com/hc/article_attachments/32328820348436)

5. Enter the freight code’s details.
6. Click Save.

You can also add a freight code while recording a bulk dispatch by clicking the ![Plus_in_Green_Circle_20200319.png](https://support.vintrace.com/hc/article_attachments/32328820125588) add icon beside the Freight Code field.

![Bulk_Dispatch_-_Add_Freight_Code_20230119.png](https://support.vintrace.com/hc/article_attachments/32328804354580)

## Assigning Freight Codes to Owners and Wineries

After you’ve added a freight code, you can assign it to an owner or winery by editing their information in the [address book](https://support.vintrace.com/hc/en-us/articles/32301367488788).

![Organization_-_Freight_Code_20230119.png](https://support.vintrace.com/hc/article_attachments/32328811981204)

When an owner or winery with a freight code is selected for a bulk dispatch, their freight code is automatically specified for the operation.

![Bulk_Dispatch_-_Dispatch_To_Default_20230119.png](https://support.vintrace.com/hc/article_attachments/32328828077076)

You can override the freight code by selecting a different one.

## Specifying the Default Scale for Dispatches and Barrel Treatments

To specify the default scale for dispatches and barrel treatments,

1. Click ![Setup Icon 20200318.png](https://support.vintrace.com/hc/article_attachments/32328820330132) Set Up in the sidebar.
2. Click General, or search for Defaults.
3. From the Defaults tile, click Configure.
4. From the Scale for Dispatches and Barrel Treatments list, select the scale you want to use by default.

![Default Scale for Dispatches 20230905.png](https://support.vintrace.com/hc/article_attachments/32328834178580)

5. Click Save.

## Bulk Dispatch and Bulk Dispatch (Inter-Winery) Operations

When you record a [bulk dispatch](https://support.vintrace.com/hc/en-us/articles/32303327348116) or [inter-winery bulk dispatch](https://support.vintrace.com/hc/en-us/articles/32301313513620), you’ll be able to select the freight code. If the selected Dispatch To has a freight code, that will be selected by default. However, you can select a different freight code from the list, or add a new one.

You'll also be able to select the scale and specify the weight for each tanker row.

![Bulk Dispatch 20231025.png](https://support.vintrace.com/hc/article_attachments/32328804249748)

![Bulk Dispatch Inter-Winery 20231025.png](https://support.vintrace.com/hc/article_attachments/32328820231700)

## Stock Dispatch Operations

When you record a stock dispatch, you’ll be able to select the freight code, select the scale, and specify the total weight in the Shipping Info tab.

![Stock Dispatch 20231025.png](https://support.vintrace.com/hc/article_attachments/32328812208660)

If the [party to which the stock is being dispatched has a freight code assigned to them](#h_01GQ5Z26D4WPS9AJGBRVWBBGAD), their freight code will automatically display in the Freight Code field.

## Bill of Lading (BOL)

Prior to printing the Bill of Lading, you’ll be able to, change the freight code and specify the weight details. This applies to the following operations:

- Barrel treatment
- Bulk dispatch
- Bulk dispatch (inter-winery)
- Stock dispatch

![Bill of Lading Declaration - Freight Code 20230119.png](https://support.vintrace.com/hc/article_attachments/32328834109972)

This information is included on the printed BOL.

![BOL 20231025.png](https://support.vintrace.com/hc/article_attachments/32328812247956)

## Stock Dispatch Report

When this functionality is enabled, the [Stock Dispatch Report’s](https://support.vintrace.com/hc/en-us/articles/360002310755-Stock-Dispatch-Report) CSV output will include columns for the freight code, scale, and weight.

![Stock Dispatch Report CSV 20231023.png](https://support.vintrace.com/hc/article_attachments/32328848851220)
